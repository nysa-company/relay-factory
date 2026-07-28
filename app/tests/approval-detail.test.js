// T-124 — acceptance tests for GET /api/approvals/:id (frozen contract v1).
// Test-author owned. One test per acceptance criterion; AC4 is a process
// criterion (commit ordering / verification commands) and is not a runtime test.
const { test } = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const net = require("node:net");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const SERVER = path.join(__dirname, "..", "server.js");

const FIXTURE_EVENT = {
  id: "detail-approval-1",
  type: "meeting",
  payload: {
    to: "test@example.com",
    subject: "Approval detail subject",
    body: "Approval detail body",
  },
};
const APPROVAL_ID = "appr-detail-approval-1";
const JOB_ID = "job-detail-approval-1";
const MISSING_ID = "appr-missing";

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(err => (err ? reject(err) : resolve(port)));
    });
    srv.on("error", reject);
  });
}

async function withServer(run) {
  const port = await getFreePort();
  const base = `http://localhost:${port}`;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-approval-detail-test-"));
  const stateFile = path.join(dataDir, "state.json");
  const proc = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      WORKER_MS: "20",
      ALLOWLIST: "test@example.com",
    },
    stdio: "ignore",
  });

  try {
    for (let i = 0; i < 50; i++) {
      try {
        if ((await fetch(`${base}/health`)).ok) break;
      } catch { /* not up yet */ }
      if (i === 49) throw new Error("server did not come up");
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    await run({ base, stateFile });
  } finally {
    proc.kill("SIGKILL");
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

async function post(base, pathname, body = {}) {
  return fetch(base + pathname, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function getState(base) {
  const response = await fetch(`${base}/api/state`);
  assert.strictEqual(response.status, 200);
  return response.json();
}

// Submits the frozen fixture event, then waits until the fixture approval
// exists and no job is pending, so worker activity cannot mask a read
// mutation in the before/after snapshots.
async function seedFixture(base) {
  const accepted = await post(base, "/webhook/event", FIXTURE_EVENT);
  assert.strictEqual(accepted.status, 200);
  for (let i = 0; i < 60; i++) {
    const state = await getState(base);
    if (
      state.approvals.some(approval => approval.id === APPROVAL_ID) &&
      !state.jobs.some(job => job.status === "pending")
    ) {
      return state;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`approval ${APPROVAL_ID} was not proposed with an idle worker`);
}

test("AC1: detail GET for appr-detail-approval-1 returns 200 with exactly the stored approval and its job", async () => {
  await withServer(async ({ base }) => {
    const stateBefore = await seedFixture(base);
    const storedApproval = stateBefore.approvals.find(approval => approval.id === APPROVAL_ID);
    const storedJob = stateBefore.jobs.find(job => job.id === JOB_ID);
    assert.ok(storedApproval, "fixture approval must exist in GET /api/state");
    assert.ok(storedJob, "fixture job must exist in GET /api/state");

    const response = await fetch(`${base}/api/approvals/${APPROVAL_ID}`);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get("content-type"), "application/json");

    const body = JSON.parse(await response.text());
    // Exactly the two top-level keys `approval` and `job`, in that order.
    assert.deepStrictEqual(Object.keys(body), ["approval", "job"]);
    // Each record is deeply equal to its stored counterpart from /api/state:
    // not projected, renamed, supplemented, or stripped.
    assert.deepStrictEqual(body.approval, storedApproval);
    assert.deepStrictEqual(body.job, storedJob);
    assert.strictEqual(body.job.id, body.approval.jobId);
  });
});

test("AC2: detail GET for appr-missing returns 404 with the exact body {\"error\":\"no such approval\"}", async () => {
  await withServer(async ({ base }) => {
    await seedFixture(base);

    const response = await fetch(`${base}/api/approvals/${MISSING_ID}`);
    assert.strictEqual(response.status, 404);
    assert.strictEqual(response.headers.get("content-type"), "application/json");
    // Exact body: distinct from the generic {"error":"not found"} fallback,
    // with no ok/code/approval/job key.
    assert.strictEqual(await response.text(), '{"error":"no such approval"}');
  });
});

test("AC3: detail GET is read-only — /api/state, durable state.json bytes, and outbox count 0 are unchanged", async () => {
  await withServer(async ({ base, stateFile }) => {
    await seedFixture(base);

    const stateBefore = await getState(base);
    const fileBefore = fs.readFileSync(stateFile);
    assert.strictEqual(stateBefore.outbox.length, 0);

    // AC3 pins the successful detail GET; the same snapshots also cover the
    // 404 branch, which the contract declares read-only (spec-lint WARN 2).
    const success = await fetch(`${base}/api/approvals/${APPROVAL_ID}`);
    assert.strictEqual(success.status, 200, "successful detail GET is the AC3 precondition");
    const missing = await fetch(`${base}/api/approvals/${MISSING_ID}`);
    assert.strictEqual(missing.status, 404);

    const stateAfter = await getState(base);
    const fileAfter = fs.readFileSync(stateFile);
    assert.deepStrictEqual(stateAfter, stateBefore);
    assert.ok(fileAfter.equals(fileBefore), "DATA_DIR/state.json bytes must be unchanged");
    assert.strictEqual(stateAfter.outbox.length, 0);
  });
});

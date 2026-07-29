// T-168 acceptance tests — GET /api/approvals/:id (frozen contract version 1).
// Test-author stage: these must fail before implementation because the route
// does not exist yet (generic 404 {"error":"not found"}), not from setup errors.
const { test } = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const SERVER = path.join(__dirname, "..", "server.js");

// Frozen Fixture A — complete durable state, verbatim from the T-168 contract.
const FIXTURE_A = {
  events: [
    {
      id: "approval-detail",
      type: "meeting",
      payload: {
        to: "test@example.com",
        subject: "Approval detail",
        body: "Review this proposal.",
      },
      receivedAt: "2026-07-28T12:00:00.000Z",
    },
  ],
  jobs: [
    {
      id: "job-approval-detail",
      eventId: "approval-detail",
      status: "done",
      attempts: 1,
      lastError: null,
      retries: 0,
      attemptsSinceRetry: 1,
    },
  ],
  approvals: [
    {
      id: "appr-approval-detail",
      jobId: "job-approval-detail",
      action: {
        to: "test@example.com",
        subject: "Approval detail",
        body: "Review this proposal.",
      },
      status: "pending",
      proposedAt: "2026-07-28T12:00:01.000Z",
    },
  ],
  outbox: [],
};

// The frozen exact successful response for appr-approval-detail.
const EXPECTED_SUCCESS = {
  approval: {
    id: "appr-approval-detail",
    jobId: "job-approval-detail",
    action: {
      to: "test@example.com",
      subject: "Approval detail",
      body: "Review this proposal.",
    },
    status: "pending",
    proposedAt: "2026-07-28T12:00:01.000Z",
  },
  job: {
    id: "job-approval-detail",
    eventId: "approval-detail",
    status: "done",
    attempts: 1,
    lastError: null,
    retries: 0,
    attemptsSinceRetry: 1,
  },
};

// Starts the real server against an isolated DATA_DIR pre-seeded with
// Frozen Fixture A, on an isolated port.
async function withFixtureServer(port, run) {
  const base = `http://localhost:${port}`;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-approval-detail-test-"));
  const stateFile = path.join(dataDir, "state.json");
  fs.writeFileSync(stateFile, JSON.stringify(FIXTURE_A, null, 2));
  const proc = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      WORKER_MS: "50",
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
    await run(base, stateFile);
  } finally {
    proc.kill("SIGKILL");
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

test("AC1: GET /api/approvals/appr-approval-detail returns 200 JSON deeply equal to Frozen Fixture A's exact successful response", async () => {
  await withFixtureServer(4771, async base => {
    const response = await fetch(`${base}/api/approvals/appr-approval-detail`);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get("content-type"), "application/json");
    const body = await response.json();
    // Exact parsed shape and values; deepStrictEqual rejects any additional
    // key at the top level or inside either stored record.
    assert.deepStrictEqual(body, EXPECTED_SUCCESS);
    assert.deepStrictEqual(Object.keys(body).sort(), ["approval", "job"]);
    assert.strictEqual(body.job.id, body.approval.jobId);
  });
});

test("AC2: GET /api/approvals/appr-missing returns 404 JSON exactly {\"error\":\"no such approval\"}", async () => {
  await withFixtureServer(4772, async base => {
    const response = await fetch(`${base}/api/approvals/appr-missing`);
    assert.strictEqual(response.status, 404);
    assert.strictEqual(response.headers.get("content-type"), "application/json");
    assert.deepStrictEqual(await response.json(), { error: "no such approval" });
  });
});

test("AC3: GET /api/state and <DATA_DIR>/state.json bytes are unchanged after the AC1 and AC2 requests", async () => {
  await withFixtureServer(4773, async (base, stateFile) => {
    const stateBefore = await (await fetch(`${base}/api/state`)).json();
    const bytesBefore = fs.readFileSync(stateFile);

    // Criterion 1's successful request must itself succeed against the
    // contract before the read-only guarantee is meaningful.
    const success = await fetch(`${base}/api/approvals/appr-approval-detail`);
    assert.strictEqual(success.status, 200);
    assert.deepStrictEqual(await success.json(), EXPECTED_SUCCESS);

    // Criterion 2's unknown-ID request.
    const missing = await fetch(`${base}/api/approvals/appr-missing`);
    assert.strictEqual(missing.status, 404);
    assert.deepStrictEqual(await missing.json(), { error: "no such approval" });

    const stateAfter = await (await fetch(`${base}/api/state`)).json();
    const bytesAfter = fs.readFileSync(stateFile);
    assert.deepStrictEqual(stateAfter, stateBefore);
    assert.deepStrictEqual(stateAfter, FIXTURE_A);
    assert.ok(bytesAfter.equals(bytesBefore), "state.json bytes changed");
  });
});

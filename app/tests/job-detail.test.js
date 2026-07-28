// T-167 acceptance tests — frozen contract version 1: read-only GET /api/jobs/:id.
// Authored before implementation; each test maps to one acceptance criterion.
const { test } = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const SERVER = path.join(__dirname, "..", "server.js");

// Deterministic fixture, verbatim from the frozen contract. The dead job at
// three attempts is never picked up by the pending-only worker scan.
const FIXTURE_EVENT = {
  id: "event-job-detail",
  type: "meeting",
  payload: {
    failTimes: 99,
  },
  receivedAt: "2026-07-28T12:00:00.000Z",
};

const FIXTURE_JOB = {
  id: "job-event-job-detail",
  eventId: "event-job-detail",
  status: "dead",
  attempts: 3,
  lastError: "simulated failure on attempt 3",
  retries: 0,
  attemptsSinceRetry: 3,
};

const FIXTURE_STATE = {
  events: [FIXTURE_EVENT],
  jobs: [FIXTURE_JOB],
  approvals: [],
  outbox: [],
};

function startServer(port, dataDir) {
  return spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      WORKER_MS: "60000",
      ALLOWLIST: "test@example.com",
    },
    stdio: "ignore",
  });
}

async function waitForHealth(base, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) return;
    } catch { /* not up yet */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("server did not come up");
}

async function stopServer(proc) {
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  const exited = new Promise(resolve => proc.once("exit", resolve));
  proc.kill("SIGKILL");
  await exited;
}

// Writes the frozen fixture into an isolated DATA_DIR, starts the server with
// WORKER_MS=60000, waits for /health, runs the body, then tears down.
async function withFixtureServer(port, run) {
  const base = `http://localhost:${port}`;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-job-detail-test-"));
  fs.writeFileSync(path.join(dataDir, "state.json"), JSON.stringify(FIXTURE_STATE, null, 2));
  const proc = startServer(port, dataDir);

  try {
    await waitForHealth(base);
    await run({ base, dataDir });
  } finally {
    await stopServer(proc);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

test("AC1: GET /api/jobs/job-event-job-detail returns 200 JSON with exactly {job,event} deep-equal to the fixture and event.id === job.eventId", async () => {
  await withFixtureServer(4761, async ({ base }) => {
    const response = await fetch(`${base}/api/jobs/job-event-job-detail`);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get("content-type"), "application/json");

    const body = await response.json();
    assert.deepStrictEqual(Object.keys(body).sort(), ["event", "job"]);
    assert.deepStrictEqual(body.job, FIXTURE_JOB);
    assert.deepStrictEqual(body.event, FIXTURE_EVENT);
    assert.strictEqual(body.event.id, body.job.eventId);
  });
});

test("AC2: GET /api/jobs/job-missing returns 404 JSON deep-equal to {\"error\":\"no such job\"} with no additional keys", async () => {
  await withFixtureServer(4762, async ({ base }) => {
    const response = await fetch(`${base}/api/jobs/job-missing`);
    assert.strictEqual(response.status, 404);
    assert.strictEqual(response.headers.get("content-type"), "application/json");
    assert.deepStrictEqual(await response.json(), { error: "no such job" });
  });
});

test("AC3: /api/state snapshot and state.json bytes are unchanged by the AC1 and AC2 requests; approvals and outbox stay empty", async () => {
  await withFixtureServer(4763, async ({ base, dataDir }) => {
    const stateFile = path.join(dataDir, "state.json");
    const stateBefore = await (await fetch(`${base}/api/state`)).json();
    const bytesBefore = fs.readFileSync(stateFile);

    // The two requests from AC1 and AC2. Their contract statuses are asserted
    // so this test fails before the route exists (missing feature), not by
    // vacuously observing that an unrouted 404 mutated nothing.
    const existing = await fetch(`${base}/api/jobs/job-event-job-detail`);
    assert.strictEqual(existing.status, 200);
    await existing.arrayBuffer();
    const missing = await fetch(`${base}/api/jobs/job-missing`);
    assert.strictEqual(missing.status, 404);
    assert.deepStrictEqual(await missing.json(), { error: "no such job" });

    const stateAfter = await (await fetch(`${base}/api/state`)).json();
    const bytesAfter = fs.readFileSync(stateFile);

    assert.deepStrictEqual(stateAfter, stateBefore);
    assert.strictEqual(bytesAfter.equals(bytesBefore), true);
    assert.deepStrictEqual(stateAfter.approvals, []);
    assert.deepStrictEqual(stateAfter.outbox, []);
  });
});

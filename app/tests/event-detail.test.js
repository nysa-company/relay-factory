// T-118 — read one Relay event: acceptance tests against frozen contract v1.
// Runs the real server as a child process, per app test conventions.
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const PORT = 4761; // fixed unused port, following existing app test conventions
const BASE = `http://localhost:${PORT}`;
const SERVER = path.join(__dirname, "..", "server.js");
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "relay-event-detail-test-"));
const STATE_FILE = path.join(DATA_DIR, "state.json");
let proc;

// Frozen fixture from the T-118 contract, written to state.json before boot.
const FIXTURE_STATE = {
  events: [
    {
      id: "event-118",
      type: "meeting",
      payload: {
        to: "test@example.com",
        subject: "T-118 fixture",
        body: "Read-only event detail",
      },
      receivedAt: "2026-07-27T12:00:00.000Z",
    },
  ],
  jobs: [
    {
      id: "job-event-118",
      eventId: "event-118",
      status: "pending",
      attempts: 0,
      lastError: null,
      retries: 0,
      attemptsSinceRetry: 0,
    },
  ],
  approvals: [],
  outbox: [],
};

// Frozen exact success body from the T-118 contract.
const FROZEN_SUCCESS_BODY = {
  event: FIXTURE_STATE.events[0],
  job: FIXTURE_STATE.jobs[0],
};

function startServer() {
  proc = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      PORT: String(PORT),
      DATA_DIR,
      // Frozen contract: the worker cannot advance the pending fixture job
      // during the assertions.
      WORKER_MS: "600000",
      ALLOWLIST: "test@example.com",
    },
    stdio: "ignore",
  });
}

async function waitForHealth(tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
    } catch { /* not up yet */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("server did not come up");
}

before(async () => {
  fs.writeFileSync(STATE_FILE, JSON.stringify(FIXTURE_STATE));
  startServer();
  await waitForHealth();
});

after(() => {
  proc?.kill("SIGKILL");
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

test("1. GET /api/events/event-118 returns 200, application/json, and exactly the frozen event+job body", async () => {
  const res = await fetch(`${BASE}/api/events/event-118`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get("content-type"), "application/json");
  const body = await res.json();
  // Deep equality with the frozen success body: exactly the fixture's event
  // and its related job, with no additional top-level keys.
  assert.deepStrictEqual(body, FROZEN_SUCCESS_BODY);
});

test('2. GET /api/events/missing-event returns 404, application/json, and exactly {"error":"no such event"}', async () => {
  const res = await fetch(`${BASE}/api/events/missing-event`);
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.headers.get("content-type"), "application/json");
  assert.strictEqual(await res.text(), '{"error":"no such event"}');
});

test("3. one request to each URL leaves /api/state and state.json (bytes, inode, mtime) unchanged", async () => {
  // Capture before the two detail requests, per the frozen contract.
  const stateBefore = await (await fetch(`${BASE}/api/state`)).json();
  const bytesBefore = fs.readFileSync(STATE_FILE);
  const { ino: inoBefore, mtimeMs: mtimeBefore } = fs.statSync(STATE_FILE);

  // One request to each URL from criteria 1 and 2. Guard that each hits the
  // contract's endpoint (not the generic unknown-route handler), so this test
  // fails before implementation for the right reason.
  const okRes = await fetch(`${BASE}/api/events/event-118`);
  assert.strictEqual(okRes.status, 200, "criterion-1 request must hit the detail endpoint");
  const missRes = await fetch(`${BASE}/api/events/missing-event`);
  assert.strictEqual(missRes.status, 404);
  assert.strictEqual(await missRes.text(), '{"error":"no such event"}');

  const stateAfter = await (await fetch(`${BASE}/api/state`)).json();
  assert.deepStrictEqual(stateAfter, stateBefore);

  const bytesAfter = fs.readFileSync(STATE_FILE);
  assert.ok(bytesAfter.equals(bytesBefore), "state.json bytes must be unchanged");
  const { ino: inoAfter, mtimeMs: mtimeAfter } = fs.statSync(STATE_FILE);
  assert.strictEqual(inoAfter, inoBefore, "state.json inode must be unchanged (no persist/rename)");
  assert.strictEqual(mtimeAfter, mtimeBefore, "state.json mtime must be unchanged");
});

// Acceptance tests for T-119 — read one Relay job (frozen contract version 1).
// One test per acceptance criterion; criterion 4 (commit order / file
// ownership / command exits) is a process check, not a runtime test.
// Runs the real server as a child process against an isolated fixture.
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const PORT = 4762;
const BASE = `http://localhost:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "relay-job-detail-"));
const STATE_FILE = path.join(DATA_DIR, "state.json");
const SERVER = path.join(__dirname, "..", "server.js");
let proc;

// Frozen fixture — the complete durable state written before server startup.
const FIXTURE = {
  events: [
    {
      id: "job-detail-event-1",
      type: "meeting",
      payload: { failTimes: 99 },
      receivedAt: "2026-07-27T00:00:00.000Z",
    },
  ],
  jobs: [
    {
      id: "job-detail-1",
      eventId: "job-detail-event-1",
      status: "dead",
      attempts: 3,
      lastError: "simulated failure on attempt 3",
      retries: 0,
      attemptsSinceRetry: 3,
    },
  ],
  approvals: [],
  outbox: [],
};

// Frozen exact parsed body for GET /api/jobs/job-detail-1 (contract v1).
const EXPECTED_FOUND_BODY = {
  job: {
    id: "job-detail-1",
    eventId: "job-detail-event-1",
    status: "dead",
    attempts: 3,
    lastError: "simulated failure on attempt 3",
    retries: 0,
    attemptsSinceRetry: 3,
  },
  event: {
    id: "job-detail-event-1",
    type: "meeting",
    payload: { failTimes: 99 },
    receivedAt: "2026-07-27T00:00:00.000Z",
  },
};

// Frozen exact parsed body for an unknown job id (contract v1).
const EXPECTED_MISSING_BODY = { error: "no such job" };

function startServer() {
  proc = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      PORT: String(PORT),
      DATA_DIR,
      WORKER_MS: "600000",
      ALLOWLIST: "test@example.com",
    },
    stdio: "ignore",
  });
}

async function waitForHealth(tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error("server did not come up");
}

before(async () => {
  fs.writeFileSync(STATE_FILE, JSON.stringify(FIXTURE, null, 2));
  startServer();
  await waitForHealth();
});

after(() => {
  proc?.kill("SIGKILL");
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

test("criterion 1: GET /api/jobs/job-detail-1 returns 200 JSON deeply equal to the frozen existing-job response with exactly job and event keys and event.id === job.eventId === 'job-detail-event-1'", async () => {
  const r = await fetch(`${BASE}/api/jobs/job-detail-1`);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.headers.get("content-type"), "application/json");
  const body = await r.json();
  assert.deepStrictEqual(Object.keys(body).sort(), ["event", "job"], "exactly the top-level keys job and event");
  assert.deepStrictEqual(body, EXPECTED_FOUND_BODY);
  assert.strictEqual(body.event.id, body.job.eventId);
  assert.strictEqual(body.job.eventId, "job-detail-event-1");
});

test("criterion 2: GET /api/jobs/job-missing returns 404 JSON deeply equal to {\"error\":\"no such job\"} with no additional field", async () => {
  const r = await fetch(`${BASE}/api/jobs/job-missing`);
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.headers.get("content-type"), "application/json");
  const body = await r.json();
  assert.deepStrictEqual(body, EXPECTED_MISSING_BODY);
  assert.deepStrictEqual(Object.keys(body), ["error"], "no additional field");
});

test("criterion 3: after the found and not-found requests, /api/state deeply equals the frozen fixture and $DATA_DIR/state.json bytes are unchanged", async () => {
  // Found-job request per criterion 1.
  let preBytes = fs.readFileSync(STATE_FILE);
  const found = await fetch(`${BASE}/api/jobs/job-detail-1`);
  assert.strictEqual(found.status, 200, "found request must behave per criterion 1");
  assert.deepStrictEqual(await found.json(), EXPECTED_FOUND_BODY);
  let state = await (await fetch(`${BASE}/api/state`)).json();
  assert.deepStrictEqual(state, FIXTURE, "in-memory state unchanged after found request");
  assert.ok(preBytes.equals(fs.readFileSync(STATE_FILE)), "state.json bytes unchanged after found request");

  // Not-found request per criterion 2.
  preBytes = fs.readFileSync(STATE_FILE);
  const missing = await fetch(`${BASE}/api/jobs/job-missing`);
  assert.strictEqual(missing.status, 404, "not-found request must behave per criterion 2");
  assert.deepStrictEqual(await missing.json(), EXPECTED_MISSING_BODY);
  state = await (await fetch(`${BASE}/api/state`)).json();
  assert.deepStrictEqual(state, FIXTURE, "in-memory state unchanged after not-found request");
  assert.ok(preBytes.equals(fs.readFileSync(STATE_FILE)), "state.json bytes unchanged after not-found request");
});

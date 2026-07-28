// T-123 acceptance tests — GET /api/jobs/:id (frozen contract version 1).
// Test-author output: these tests must fail before implementation because the
// endpoint does not exist yet (the server's catch-all returns 404
// {"error":"not found"}), and pass once the builder adds the route.
// Fixture pattern follows tests/conformance.test.js (read-only reference).
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const net = require("node:net");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "relay-job-detail-"));
const STATE_FILE = path.join(DATA_DIR, "state.json");
const SERVER = path.join(__dirname, "..", "server.js");

// Contract § Fixture: the test may allocate any unused local port.
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(err => (err ? reject(err) : resolve(port)));
    });
    srv.on("error", reject);
  });
}

let proc;
let BASE;

// Frozen fixture body (contract § Fixture, exact JSON).
const FIXTURE_EVENT = {
  id: "job-detail-001",
  type: "meeting",
  payload: {
    failTimes: 99,
    to: "test@example.com",
    subject: "Job detail fixture",
    body: "Fixture body.",
  },
};

// Snapshots taken after the fixture POST and before either detail request.
let stateSnapshot; // parsed GET /api/state response
let stateFileBytes; // raw bytes of <DATA_DIR>/state.json
let receivedAt; // ISO timestamp captured from GET /api/state

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
  const port = await freePort();
  BASE = `http://localhost:${port}`;
  proc = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR,
      // Contract § Fixture: long worker interval keeps the job pending with
      // zero attempts for the duration of the assertions.
      WORKER_MS: "600000",
      ALLOWLIST: "test@example.com",
    },
    stdio: "ignore",
  });
  await waitForHealth();

  const r = await fetch(`${BASE}/webhook/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(FIXTURE_EVENT),
  });
  assert.strictEqual(r.status, 200, "fixture event must be accepted");

  stateSnapshot = await (await fetch(`${BASE}/api/state`)).json();
  stateFileBytes = fs.readFileSync(STATE_FILE);
  const evt = stateSnapshot.events.find(e => e.id === "job-detail-001");
  assert.ok(evt, "fixture event must be stored");
  receivedAt = evt.receivedAt;
});

after(() => {
  proc?.kill("SIGKILL");
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

test("criterion 1: GET /api/jobs/job-job-detail-001 returns 200 with the exact frozen {job,event} body", async () => {
  const res = await fetch(`${BASE}/api/jobs/job-job-detail-001`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get("content-type"), "application/json");
  const body = await res.json();
  // Contract § Successful response: exact shape, no fields added, omitted,
  // renamed, or transformed. <receivedAt> is the exact string captured from
  // GET /api/state.
  assert.deepStrictEqual(body, {
    job: {
      id: "job-job-detail-001",
      eventId: "job-detail-001",
      status: "pending",
      attempts: 0,
      lastError: null,
      retries: 0,
      attemptsSinceRetry: 0,
    },
    event: {
      id: "job-detail-001",
      type: "meeting",
      payload: {
        failTimes: 99,
        to: "test@example.com",
        subject: "Job detail fixture",
        body: "Fixture body.",
      },
      receivedAt,
    },
  });
});

test("criterion 2: GET /api/jobs/missing-job returns 404 with exactly {\"error\":\"no such job\"}", async () => {
  const res = await fetch(`${BASE}/api/jobs/missing-job`);
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.headers.get("content-type"), "application/json");
  // Exact response body per contract § Unknown-job response.
  assert.strictEqual(await res.text(), '{"error":"no such job"}');
});

test("criterion 3: both detail requests leave /api/state and state.json bytes unchanged", async () => {
  // Perform the successful request from criterion 1...
  const ok = await fetch(`${BASE}/api/jobs/job-job-detail-001`);
  assert.strictEqual(ok.status, 200,
    "successful detail request must exist before the read-only guarantee can hold");
  // ...and the missing-job request from criterion 2.
  const missing = await fetch(`${BASE}/api/jobs/missing-job`);
  assert.strictEqual(missing.status, 404);

  const stateAfter = await (await fetch(`${BASE}/api/state`)).json();
  assert.deepStrictEqual(stateAfter, stateSnapshot,
    "parsed /api/state must equal the pre-request snapshot");
  const bytesAfter = fs.readFileSync(STATE_FILE);
  assert.ok(bytesAfter.equals(stateFileBytes),
    "state.json bytes must equal the pre-request snapshot");
});

// T-169 — acceptance tests for GET /api/outbox/:approvalId (frozen contract v1).
// Written by the test author before implementation; asserts contract behavior only.
// Runs the real server as a child process with a seeded temporary DATA_DIR.
// node --test app/tests/outbox-detail.test.js
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

// 4779: unique across every port used by any test file currently in this
// suite (4719, 4721, 4761-4763, 4771-4773); fixes the reviewer-flagged 4771
// collision with approval-detail.test.js (merged from T-168) under
// concurrent `node --test` execution.
const PORT = 4779;
const BASE = `http://localhost:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "relay-outbox-detail-test-"));
const SERVER = path.join(__dirname, "..", "server.js");
let proc;

// Exact two-receipt fixture from the frozen contract (version 1).
const FIXTURE = {
  events: [],
  jobs: [],
  approvals: [],
  outbox: [
    {
      to: "test@example.com",
      subject: "Other receipt",
      body: "Not the requested receipt.",
      approvalId: "appr-other",
      sentAt: "2026-07-28T12:00:00.000Z",
    },
    {
      to: "test@example.com",
      subject: "Receipt detail",
      body: "Requested sandbox receipt.",
      approvalId: "appr-outbox-detail",
      sentAt: "2026-07-28T12:00:01.000Z",
    },
  ],
};

function startServer() {
  proc = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR, WORKER_MS: "50", ALLOWLIST: "test@example.com" },
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

const getDetail = (approvalId) => fetch(`${BASE}/api/outbox/${approvalId}`);
const getState = async () => (await fetch(`${BASE}/api/state`)).json();

before(async () => {
  // Seed the exact contract fixture before the server starts.
  fs.writeFileSync(path.join(DATA_DIR, "state.json"), JSON.stringify(FIXTURE, null, 2));
  startServer();
  await waitForHealth();
});
after(() => { proc?.kill("SIGKILL"); fs.rmSync(DATA_DIR, { recursive: true, force: true }); });

test("AC1: GET /api/outbox/appr-outbox-detail returns 200 with exactly the sandbox envelope around the stored second receipt", async () => {
  const res = await getDetail("appr-outbox-detail");
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get("content-type"), "application/json");
  const body = await res.json();
  // Deep strict equality: no extra top-level keys, receipt returned unchanged,
  // and it is the second fixture outbox item (not the first).
  assert.deepStrictEqual(body, { sandbox: true, receipt: FIXTURE.outbox[1] });
  assert.notDeepStrictEqual(body.receipt, FIXTURE.outbox[0], "must select the matching second receipt, not the first");
});

test("AC2: GET /api/outbox/appr-missing returns 404 with exactly the no-such-receipt error body", async () => {
  const res = await getDetail("appr-missing");
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.headers.get("content-type"), "application/json");
  assert.deepStrictEqual(await res.json(), { error: "no such outbox receipt" });
});

test("AC3: both detail-route branches are read-only — state snapshot unchanged and repeated reads return the same receipt", async () => {
  const stateBefore = await getState();

  // One successful detail read. Asserting success here also guarantees this
  // test fails before implementation rather than passing vacuously.
  const first = await getDetail("appr-outbox-detail");
  assert.strictEqual(first.status, 200);
  const firstBody = await first.json();
  assert.deepStrictEqual(firstBody, { sandbox: true, receipt: FIXTURE.outbox[1] });

  // One missing-receipt read.
  const missing = await getDetail("appr-missing");
  assert.strictEqual(missing.status, 404);
  assert.deepStrictEqual(await missing.json(), { error: "no such outbox receipt" });

  // Snapshot after both branches is deeply equal to the snapshot before:
  // no state write, no new sandbox receipt, no external effect.
  const stateAfter = await getState();
  assert.deepStrictEqual(stateAfter, stateBefore);
  assert.deepStrictEqual(stateAfter.outbox, FIXTURE.outbox, "outbox still holds exactly the two fixture receipts in order");

  // A second successful detail read returns a body deeply equal to the first.
  const second = await getDetail("appr-outbox-detail");
  assert.strictEqual(second.status, 200);
  assert.deepStrictEqual(await second.json(), firstBody);
});

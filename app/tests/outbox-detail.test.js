// T-125 acceptance tests — GET /api/outbox/:approvalId (frozen contract v1).
// Test author only; asserts the frozen contract, not implementation details.
// Runs the real server as a child process on port 4764 with a fresh DATA_DIR.
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const PORT = 4764;
const BASE = `http://localhost:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "relay-outbox-detail-"));
const STATE_FILE = path.join(DATA_DIR, "state.json");
const SERVER = path.join(__dirname, "..", "server.js");
let proc;

// sentAt captured from /api/state after the existing fixture is approved.
let existingSentAt;

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

const post = (p, body) => fetch(BASE + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
const getState = async () => (await fetch(`${BASE}/api/state`)).json();
const settle = async (pred, tries = 60) => {
  for (let i = 0; i < tries; i++) {
    const s = await getState();
    if (pred(s)) return s;
    await new Promise(r => setTimeout(r, 100));
  }
  return getState();
};

before(async () => {
  startServer();
  await waitForHealth();

  // Fixture 1: existing receipt.
  await post("/webhook/event", {
    id: "outbox-detail-existing",
    payload: { to: "test@example.com", subject: "Outbox detail subject", body: "Outbox detail body" },
  });
  await settle(s => s.approvals.some(a => a.id === "appr-outbox-detail-existing" && a.status === "pending"));
  const approved = await post("/api/approvals/appr-outbox-detail-existing/approve");
  assert.strictEqual(approved.status, 200, "fixture setup: approve must succeed");
  const s1 = await getState();
  const receipt = s1.outbox.find(o => o.approvalId === "appr-outbox-detail-existing");
  assert.ok(receipt, "fixture setup: existing receipt must be in outbox");
  existingSentAt = receipt.sentAt;
  assert.strictEqual(typeof existingSentAt, "string", "fixture setup: stored sentAt must be a string");

  // Fixture 2: pending approval with no receipt (never approved or rejected).
  await post("/webhook/event", { id: "outbox-detail-pending", payload: { to: "test@example.com" } });
  const s2 = await settle(s => s.approvals.some(a => a.id === "appr-outbox-detail-pending"));
  assert.strictEqual(
    s2.approvals.find(a => a.id === "appr-outbox-detail-pending").status,
    "pending",
    "fixture setup: pending approval must remain pending",
  );

  // Fixture 3: appr-outbox-detail-missing is intentionally never created.
});

after(() => { proc?.kill("SIGKILL"); fs.rmSync(DATA_DIR, { recursive: true, force: true }); });

test("1. GET /api/outbox/appr-outbox-detail-existing returns 200 JSON with exactly the stored sandbox receipt", async () => {
  const r = await fetch(`${BASE}/api/outbox/appr-outbox-detail-existing`);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.headers.get("content-type"), "application/json");
  const body = await r.json();
  assert.deepStrictEqual(body, {
    sandbox: true,
    receipt: {
      to: "test@example.com",
      subject: "Outbox detail subject",
      body: "Outbox detail body",
      approvalId: "appr-outbox-detail-existing",
      sentAt: existingSentAt,
    },
  });
});

test("2. GET /api/outbox/appr-outbox-detail-missing returns 404 JSON with exactly the no-receipt error", async () => {
  const r = await fetch(`${BASE}/api/outbox/appr-outbox-detail-missing`);
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.headers.get("content-type"), "application/json");
  assert.deepStrictEqual(await r.json(), { error: "no such outbox receipt" });
});

test("3. GET /api/outbox/appr-outbox-detail-pending (pending approval, no receipt) returns the same 404 headers and body", async () => {
  const r = await fetch(`${BASE}/api/outbox/appr-outbox-detail-pending`);
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.headers.get("content-type"), "application/json");
  assert.deepStrictEqual(await r.json(), { error: "no such outbox receipt" });
});

test("4. reads are read-only: state and persisted state.json bytes unchanged, statuses preserved, exactly one receipt", async () => {
  const stateBefore = await getState();
  const bytesBefore = fs.readFileSync(STATE_FILE);

  // Two consecutive successful reads of the existing receipt.
  for (let i = 0; i < 2; i++) {
    const ok = await fetch(`${BASE}/api/outbox/appr-outbox-detail-existing`);
    assert.strictEqual(ok.status, 200, "read of existing receipt must succeed");
    await ok.arrayBuffer();
  }
  // One read of each 404 fixture.
  for (const id of ["appr-outbox-detail-missing", "appr-outbox-detail-pending"]) {
    const miss = await fetch(`${BASE}/api/outbox/${id}`);
    assert.strictEqual(miss.status, 404, `read of ${id} must be 404`);
    await miss.arrayBuffer();
  }

  const stateAfter = await getState();
  assert.deepStrictEqual(stateAfter, stateBefore, "GET /api/state must be deeply equal to its pre-read snapshot");
  const bytesAfter = fs.readFileSync(STATE_FILE);
  assert.ok(bytesBefore.equals(bytesAfter), "persisted state.json bytes must be unchanged");
  assert.strictEqual(stateAfter.approvals.find(a => a.id === "appr-outbox-detail-existing").status, "sent");
  assert.strictEqual(stateAfter.approvals.find(a => a.id === "appr-outbox-detail-pending").status, "pending");
  assert.deepStrictEqual(
    stateAfter.outbox.map(o => o.approvalId),
    ["appr-outbox-detail-existing"],
    "outbox must contain exactly the one existing receipt",
  );
});

// T-166 acceptance tests — GET /api/events/:id detail route.
// Written by the test-author from Frozen contract version 1 in
// factory/tickets/T-166.md, before implementation. One test per
// acceptance criterion; criterion 4 (commit ordering / file
// boundaries) is a git-inspection property recorded on the ticket
// as a demo-check item.
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const PORT = 4761; // frozen by the T-166 contract
const BASE = `http://localhost:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "relay-t166-"));
const STATE_FILE = path.join(DATA_DIR, "state.json");
const SERVER = path.join(__dirname, "..", "server.js");
let proc;

// Frozen acceptance fixture (contract version 1). The dead job keeps the
// fixture stable: the worker tick never finds pending work, so the server
// never calls persist() on its own.
const FIXTURE = {
  events: [
    {
      id: "evt-detail-001",
      type: "meeting",
      payload: {
        to: "test@example.com",
        subject: "Detail fixture",
      },
      receivedAt: "2026-07-28T12:00:00.000Z",
    },
  ],
  jobs: [
    {
      id: "job-evt-detail-001",
      eventId: "evt-detail-001",
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

// Exact raw success body frozen by the contract.
const FROZEN_SUCCESS_BODY =
  '{"event":{"id":"evt-detail-001","type":"meeting","payload":{"to":"test@example.com","subject":"Detail fixture"},"receivedAt":"2026-07-28T12:00:00.000Z"},"job":{"id":"job-evt-detail-001","eventId":"evt-detail-001","status":"dead","attempts":3,"lastError":"simulated failure on attempt 3","retries":0,"attemptsSinceRetry":3}}';

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
  fs.writeFileSync(STATE_FILE, JSON.stringify(FIXTURE));
  proc = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      PORT: String(PORT),
      DATA_DIR,
      ALLOWLIST: "test@example.com", // existing default allowlist, per contract
    },
    stdio: "ignore",
  });
  await waitForHealth();
});

after(() => {
  proc?.kill("SIGKILL");
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

test("1. GET /api/events/evt-detail-001 returns 200 JSON with exactly the frozen {event,job} body", async () => {
  const res = await fetch(`${BASE}/api/events/evt-detail-001`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get("content-type"), "application/json");
  const raw = await res.text();
  assert.strictEqual(raw, FROZEN_SUCCESS_BODY, "raw body must be byte-for-byte the frozen success body");
  const body = JSON.parse(raw);
  assert.deepStrictEqual(Object.keys(body), ["event", "job"], "top-level keys must be exactly event then job");
  assert.strictEqual(body.event.id, "evt-detail-001");
  assert.strictEqual(body.job.eventId, body.event.id, "job.eventId must equal event.id");
});

test("2. GET /api/events/evt-detail-missing returns 404 JSON with exact body {\"error\":\"no such event\"}", async () => {
  const res = await fetch(`${BASE}/api/events/evt-detail-missing`);
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.headers.get("content-type"), "application/json");
  const raw = await res.text();
  assert.strictEqual(raw, '{"error":"no such event"}', "raw 404 body must be byte-for-byte the frozen error body");
});

test("3. one successful and one unknown-event detail request leave /api/state and state.json bytes unchanged", async () => {
  // Pre-request snapshots: parsed aggregate state and exact durable bytes.
  const stateBefore = await (await fetch(`${BASE}/api/state`)).json();
  const bytesBefore = fs.readFileSync(STATE_FILE);

  const okRes = await fetch(`${BASE}/api/events/evt-detail-001`);
  assert.strictEqual(okRes.status, 200, "criterion requires one successful detail request");
  const missingRes = await fetch(`${BASE}/api/events/evt-detail-missing`);
  assert.strictEqual(missingRes.status, 404);

  const stateAfter = await (await fetch(`${BASE}/api/state`)).json();
  const bytesAfter = fs.readFileSync(STATE_FILE);
  assert.deepStrictEqual(stateAfter, stateBefore, "parsed /api/state must equal its pre-request snapshot");
  assert.ok(bytesAfter.equals(bytesBefore), "state.json bytes must equal their pre-request snapshot");
});

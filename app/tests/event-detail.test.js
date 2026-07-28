// T-122 acceptance tests — GET /api/events/:id (frozen contract version 1).
// Test-author surface only; asserts against the frozen contract, not the
// implementation. These tests must fail before the builder adds the route.
const { test } = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const SERVER = path.join(__dirname, "..", "server.js");

// Frozen contract environment.
const PORT = 4762;
const BASE = `http://localhost:${PORT}`;
const WORKER_MS = 600_000;
const ALLOWLIST = "test@example.com";
const UNKNOWN_ID = "evt-missing";

// Frozen state fixture, written to DATA_DIR/state.json before server start.
const FIXTURE = {
  events: [
    {
      id: "evt-detail-001",
      type: "meeting",
      payload: {
        to: "test@example.com",
        subject: "Fixture subject",
        body: "Fixture body",
      },
      receivedAt: "2026-07-27T18:00:00.000Z",
    },
  ],
  jobs: [
    {
      id: "job-evt-detail-001",
      eventId: "evt-detail-001",
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

// Frozen exact success response for criterion 1.
const SUCCESS_RESPONSE = {
  event: {
    id: "evt-detail-001",
    type: "meeting",
    payload: {
      to: "test@example.com",
      subject: "Fixture subject",
      body: "Fixture body",
    },
    receivedAt: "2026-07-27T18:00:00.000Z",
  },
  job: {
    id: "job-evt-detail-001",
    eventId: "evt-detail-001",
    status: "pending",
    attempts: 0,
    lastError: null,
    retries: 0,
    attemptsSinceRetry: 0,
  },
};

function startServer(dataDir) {
  return spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      PORT: String(PORT),
      DATA_DIR: dataDir,
      WORKER_MS: String(WORKER_MS),
      ALLOWLIST,
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

async function stopServer(proc) {
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  const exited = new Promise(resolve => proc.once("exit", resolve));
  proc.kill("SIGKILL");
  await exited;
}

// Boots the real server against a fresh temp DATA_DIR seeded with the
// frozen fixture, runs the assertions, then tears everything down.
async function withFixtureServer(run) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-event-detail-test-"));
  const stateFile = path.join(dataDir, "state.json");
  fs.writeFileSync(stateFile, JSON.stringify(FIXTURE, null, 2));
  const proc = startServer(dataDir);
  try {
    await waitForHealth();
    await run({ stateFile });
  } finally {
    await stopServer(proc);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

test("1. GET /api/events/evt-detail-001 with the frozen fixture returns 200, application/json, and exactly the frozen {event, job} response", async () => {
  await withFixtureServer(async () => {
    const response = await fetch(`${BASE}/api/events/evt-detail-001`);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get("content-type"), "application/json");
    const body = await response.json();
    // Exact equality with the frozen success response: verbatim stored event
    // and its related job, no additional keys. Member order is not asserted.
    assert.deepStrictEqual(body, SUCCESS_RESPONSE);
    assert.deepStrictEqual(Object.keys(body).sort(), ["event", "job"]);
  });
});

test("2. GET /api/events/evt-missing with the frozen fixture returns 404, application/json, and exactly {\"error\":\"no such event\"}", async () => {
  await withFixtureServer(async () => {
    const response = await fetch(`${BASE}/api/events/${UNKNOWN_ID}`);
    assert.strictEqual(response.status, 404);
    assert.strictEqual(response.headers.get("content-type"), "application/json");
    assert.strictEqual(await response.text(), '{"error":"no such event"}');
  });
});

test("3. After one successful lookup and one unknown-event lookup, /api/state and the DATA_DIR/state.json bytes are unchanged", async () => {
  await withFixtureServer(async ({ stateFile }) => {
    const stateBytesBefore = fs.readFileSync(stateFile);
    const apiStateBefore = await (await fetch(`${BASE}/api/state`)).text();

    // The two contract lookups. Statuses are asserted so this test cannot
    // pass against an implementation that lacks the route entirely.
    const success = await fetch(`${BASE}/api/events/evt-detail-001`);
    assert.strictEqual(success.status, 200);
    assert.deepStrictEqual(await success.json(), SUCCESS_RESPONSE);
    const missing = await fetch(`${BASE}/api/events/${UNKNOWN_ID}`);
    assert.strictEqual(missing.status, 404);
    assert.strictEqual(await missing.text(), '{"error":"no such event"}');

    const stateBytesAfter = fs.readFileSync(stateFile);
    assert.strictEqual(
      stateBytesAfter.equals(stateBytesBefore),
      true,
      "DATA_DIR/state.json bytes changed across read-only lookups",
    );
    const apiStateAfter = await (await fetch(`${BASE}/api/state`)).text();
    assert.strictEqual(apiStateAfter, apiStateBefore);
  });
});

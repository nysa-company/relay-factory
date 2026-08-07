// T-110 acceptance tests — frozen contract version 2: read-only GET /api/events/:id.
// Authored before implementation; each test maps to one acceptance criterion.
const { test } = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const SERVER = path.join(__dirname, "..", "server.js");

// Version 2 Frozen Fixture A, verbatim from the contract. Both jobs are dead,
// so the pending-only worker scan never selects either one.
const FIXTURE_EVENT = {
  id: "event-detail",
  type: "meeting",
  payload: {
    failTimes: 99,
  },
  receivedAt: "2026-08-07T12:00:00.000Z",
};

const OTHER_EVENT = {
  id: "event-other",
  type: "email",
  payload: {
    failTimes: 99,
  },
  receivedAt: "2026-08-07T12:00:01.000Z",
};

const OTHER_JOB = {
  id: "job-event-other",
  eventId: "event-other",
  status: "dead",
  attempts: 6,
  lastError: "simulated failure on attempt 6",
  retries: 1,
  attemptsSinceRetry: 3,
};

const FIXTURE_JOB = {
  id: "job-event-detail",
  eventId: "event-detail",
  status: "dead",
  attempts: 3,
  lastError: "simulated failure on attempt 3",
  retries: 0,
  attemptsSinceRetry: 3,
};

// The job order is deliberately shuffled relative to the event order: the
// requested event is events[0] but its related job is jobs[1], while jobs[0]
// belongs to events[1]. Relay intake always appends an event and its job
// together, so an intake-producible state has aligned indices and could not
// distinguish relationship lookup from index pairing or status selection.
const FIXTURE_STATE = {
  events: [FIXTURE_EVENT, OTHER_EVENT],
  jobs: [OTHER_JOB, FIXTURE_JOB],
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

// Writes the frozen fixture into an isolated DATA_DIR, starts the real server
// with WORKER_MS=60000, waits for /health, runs the body, then tears down.
async function withFixtureServer(port, run) {
  const base = `http://localhost:${port}`;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-event-detail-test-"));
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

test("AC1: GET /api/events/event-detail returns 200 JSON with exactly {event,job} deep-equal to the fixture's first event and second job, job.eventId === event.id, and neither non-matching record", async () => {
  await withFixtureServer(4781, async ({ base }) => {
    const response = await fetch(`${base}/api/events/event-detail`);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get("content-type"), "application/json");

    const body = await response.json();
    assert.deepStrictEqual(Object.keys(body).sort(), ["event", "job"]);
    assert.deepStrictEqual(body.event, FIXTURE_EVENT);
    assert.deepStrictEqual(body.job, FIXTURE_JOB);
    assert.strictEqual(body.job.eventId, body.event.id);
    assert.notDeepStrictEqual(body.event, OTHER_EVENT);
    assert.notDeepStrictEqual(body.job, OTHER_JOB);
  });
});

test("AC2: GET /api/events/event-missing returns 404 JSON deep-equal to {\"error\":\"no such event\"} with no additional keys", async () => {
  await withFixtureServer(4782, async ({ base }) => {
    const response = await fetch(`${base}/api/events/event-missing`);
    assert.strictEqual(response.status, 404);
    assert.strictEqual(response.headers.get("content-type"), "application/json");
    assert.deepStrictEqual(await response.json(), { error: "no such event" });
  });
});

test("AC3: the AC1 and AC2 requests leave /api/state, the state.json bytes, and the DATA_DIR entry names unchanged; approvals and outbox stay empty", async () => {
  await withFixtureServer(4783, async ({ base, dataDir }) => {
    const stateFile = path.join(dataDir, "state.json");
    const stateBefore = await (await fetch(`${base}/api/state`)).json();
    const bytesBefore = fs.readFileSync(stateFile);
    const entriesBefore = fs.readdirSync(dataDir).sort();
    assert.deepStrictEqual(entriesBefore, ["state.json"]);

    // Both route branches are asserted inside this case so the read-only
    // comparisons cannot pass vacuously against the server's generic
    // {"error":"not found"} fallback before the route exists.
    const existing = await fetch(`${base}/api/events/event-detail`);
    assert.strictEqual(existing.status, 200);
    assert.deepStrictEqual(await existing.json(), { event: FIXTURE_EVENT, job: FIXTURE_JOB });

    const missing = await fetch(`${base}/api/events/event-missing`);
    assert.strictEqual(missing.status, 404);
    assert.deepStrictEqual(await missing.json(), { error: "no such event" });

    const stateAfter = await (await fetch(`${base}/api/state`)).json();
    const bytesAfter = fs.readFileSync(stateFile);
    const entriesAfter = fs.readdirSync(dataDir).sort();

    assert.deepStrictEqual(stateAfter, stateBefore);
    assert.strictEqual(bytesAfter.equals(bytesBefore), true);
    assert.deepStrictEqual(entriesAfter, entriesBefore);
    assert.deepStrictEqual(stateAfter.approvals, []);
    assert.deepStrictEqual(stateAfter.outbox, []);
  });
});

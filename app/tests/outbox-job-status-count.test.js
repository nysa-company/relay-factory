const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TOOL = path.join(__dirname, "..", "tools", "outbox-job-status-count.js");
const CHILD_TIMEOUT_MS = 5_000;
const USAGE = "usage: node app/tools/outbox-job-status-count.js <state-file> <job-status>\n";
const READ_ERROR = "outbox-job-status-count: cannot read state file\n";
const PARSE_ERROR = "outbox-job-status-count: state file is not valid JSON\n";
const INVALID_ERROR = "outbox-job-status-count: invalid Relay state\n";

function validState() {
  return {
    events: [{ opaque: "event" }],
    jobs: [
      { id: "job-dead", eventId: "event-1", status: "dead", attempts: 2, retries: 1, attemptsSinceRetry: 1, lastError: "redacted" },
      { id: "job-done", eventId: "event-2", status: "done", attempts: 0, retries: 0, attemptsSinceRetry: 0, lastError: null },
      { id: "job-pending", eventId: "event-3", status: "pending", attempts: 1, retries: 0, attemptsSinceRetry: 1, lastError: "" },
      { id: "job-unreferenced", eventId: "event-4", status: "dead", attempts: 0, retries: 0, attemptsSinceRetry: 0, lastError: null },
    ],
    approvals: [
      { id: "approval-dead-a", jobId: "job-dead", status: "sent" },
      { id: "approval-dead-b", jobId: "job-dead", status: "pending" },
      { id: "approval-done", jobId: "job-done", status: "rejected" },
      { id: "approval-pending", jobId: "job-pending", status: "blocked_recipient" },
      { id: "approval-unreferenced", jobId: "job-done", status: "sent" },
    ],
    outbox: [
      { to: "a", subject: "a", body: "a", approvalId: "approval-dead-a", sentAt: "time-a" },
      { to: "b", subject: "b", body: "b", approvalId: "approval-dead-b", sentAt: "time-b" },
      { to: "c", subject: "c", body: "c", approvalId: "approval-done", sentAt: "time-c" },
      { to: "d", subject: "d", body: "d", approvalId: "approval-pending", sentAt: "time-d" },
    ],
    metadata: { ignored: true },
  };
}

function tempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `relay-outbox-job-status-${label}-`));
}

function writeState(dir, value, name = "state.json") {
  const stateFile = path.join(dir, name);
  fs.writeFileSync(stateFile, typeof value === "string" ? value : `${JSON.stringify(value)}\n`);
  return stateFile;
}

function run(args, cwd) {
  const result = spawnSync(process.execPath, [TOOL, ...args], {
    cwd,
    stdio: "pipe",
    timeout: CHILD_TIMEOUT_MS,
  });
  assert.strictEqual(result.error, undefined, `child error: ${result.error && result.error.message}`);
  assert.strictEqual(result.signal, null, `child signal: ${result.signal}`);
  return { status: result.status, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

function assertResult(result, status, stdout, stderr) {
  assert.strictEqual(result.status, status, "exit status");
  assert.strictEqual(result.stdout, stdout, "stdout");
  assert.strictEqual(result.stderr, stderr, "stderr");
}

function snapshot(file) {
  const stat = fs.statSync(file, { bigint: true });
  return { bytes: fs.readFileSync(file).toString("hex"), mode: stat.mode, size: stat.size, mtimeNs: stat.mtimeNs };
}

test("AC1: the command emits exactly the compact outboxEntriesForJobStatus JSON result", () => {
  const dir = tempDir("ac1");
  try {
    const stateFile = writeState(dir, validState());
    assertResult(run([stateFile, "dead"]), 0, '{"outboxEntriesForJobStatus":2}\n', "");
    assertResult(run([stateFile, "done"]), 0, '{"outboxEntriesForJobStatus":1}\n', "");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AC2: status matching is exact and every two-hop reference and duplicate constraint is validated before counting", () => {
  const base = validState();
  for (const query of ["Dead", " dead", "dead ", ""]) {
    assert.notStrictEqual(query, "dead", `invalid query ${JSON.stringify(query)} differs from stored dead`);
  }
  const invalidStates = [
    (() => { const s = validState(); s.jobs.push({ ...s.jobs[0] }); return s; })(),
    (() => { const s = validState(); s.approvals.push({ ...s.approvals[0], jobId: "job-done" }); return s; })(),
    (() => { const s = validState(); s.outbox.push({ ...s.outbox[0], sentAt: "time-duplicate" }); return s; })(),
    (() => { const s = validState(); s.approvals[0].jobId = "missing-job"; return s; })(),
    (() => { const s = validState(); s.outbox[0].approvalId = "missing-approval"; return s; })(),
    (() => { const s = validState(); delete s.jobs[0].attempts; return s; })(),
    (() => { const s = validState(); s.jobs[0].status = "DEAD"; return s; })(),
    (() => { const s = validState(); s.approvals[0].status = "SENT"; return s; })(),
    (() => { const s = validState(); delete s.outbox[0].sentAt; return s; })(),
    { events: [], jobs: [], approvals: [], outbox: {} },
  ];
  const dir = tempDir("ac2");
  try {
    const stateFile = writeState(dir, base);
    for (const query of ["Dead", " dead", "dead ", ""]) {
      assertResult(run([stateFile, query]), 0, '{"outboxEntriesForJobStatus":0}\n', "");
    }
    for (const state of invalidStates) {
      const invalidFile = writeState(dir, state);
      assertResult(run([invalidFile, "dead"]), 1, "", INVALID_ERROR);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AC3: invalid arguments precede file access and read, parse, and structural failures use fixed redacted errors", () => {
  const dir = tempDir("ac3");
  try {
    const absent = path.join(dir, "must-not-be-read.json");
    for (const args of [[], [absent], [absent, "dead", "extra"]]) {
      assertResult(run(args), 2, "", USAGE);
      assert.strictEqual(fs.existsSync(absent), false, "invalid arity does not access the candidate");
    }
    assertResult(run([absent, "dead"]), 1, "", READ_ERROR);
    const malformed = writeState(dir, '{"events":[]');
    assertResult(run([malformed, "dead"]), 1, "", PARSE_ERROR);
    const invalid = writeState(dir, { events: [], jobs: [], approvals: [], outbox: [] });
    invalid.jobs = undefined;
    fs.writeFileSync(invalid, '{"events":[],"approvals":[],"outbox":[]}\n');
    assertResult(run([invalid, "dead"]), 1, "", INVALID_ERROR);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AC4: the command is cwd-independent, read-only, self-terminating, and confined to the frozen offline source boundary", () => {
  const dir = tempDir("ac4");
  try {
    const stateFile = writeState(dir, validState());
    const before = snapshot(stateFile);
    const entriesBefore = fs.readdirSync(dir).sort();
    assertResult(run([stateFile, "dead"], os.tmpdir()), 0, '{"outboxEntriesForJobStatus":2}\n', "");
    assert.deepStrictEqual(snapshot(stateFile), before, "state file remains byte-for-byte and stat-for-stat unchanged");
    assert.deepStrictEqual(fs.readdirSync(dir).sort(), entriesBefore, "parent directory remains unchanged");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  assert.strictEqual(fs.existsSync(TOOL), true, "production command exists");
  const source = fs.readFileSync(TOOL, "utf8");
  assert.deepStrictEqual([...source.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)].map(match => match[1]), ["node:fs"]);
  assert.deepStrictEqual([...source.matchAll(/\b(?:fs\.)?([A-Za-z]+Sync)\s*\(/g)].map(match => match[1]), ["readFileSync"]);
  for (const forbidden of ["server.js", "fetch(", "WebSocket", "node:http", "node:https", "node:net", "node:child_process", "setTimeout", "setInterval"]) {
    assert.strictEqual(source.includes(forbidden), false, `forbidden source reference ${forbidden}`);
  }
});

test("AC6: every frozen Relay state-validation rule accepts its valid shape and rejects each independent violation", () => {
  const dir = tempDir("ac6");
  try {
    const positiveCases = [
      ["opaque events and ignored top-level metadata", validState()],
      ["ignored extra job property", (() => { const s = validState(); s.jobs[0].ignored = { any: "value" }; return s; })()],
      ["ignored extra approval property", (() => { const s = validState(); s.approvals[0].ignored = ["value"]; return s; })()],
      ["ignored extra outbox property and opaque to subject body values", (() => { const s = validState(); s.outbox[0] = { ...s.outbox[0], to: { opaque: true }, subject: ["opaque"], body: null, ignored: 7 }; return s; })()],
    ];
    for (const [name, state] of positiveCases) {
      const stateFile = writeState(dir, state, `positive-${name.replaceAll(" ", "-")}.json`);
      assertResult(run([stateFile, "dead"]), 0, '{"outboxEntriesForJobStatus":2}\n', "");
    }

    const invalidCases = [
      ["null root", null],
      ["array root", []],
      ["scalar root", 7],
      ["events absent", (() => { const s = validState(); delete s.events; return s; })()],
      ["events non-array", (() => { const s = validState(); s.events = {}; return s; })()],
      ["jobs absent", (() => { const s = validState(); delete s.jobs; return s; })()],
      ["jobs non-array", (() => { const s = validState(); s.jobs = {}; return s; })()],
      ["approvals absent", (() => { const s = validState(); delete s.approvals; return s; })()],
      ["approvals non-array", (() => { const s = validState(); s.approvals = {}; return s; })()],
      ["outbox absent", (() => { const s = validState(); delete s.outbox; return s; })()],
      ["outbox non-array", (() => { const s = validState(); s.outbox = {}; return s; })()],
      ["job is null", (() => { const s = validState(); s.jobs[0] = null; return s; })()],
      ["job is array", (() => { const s = validState(); s.jobs[0] = []; return s; })()],
      ["job id empty", (() => { const s = validState(); s.jobs[0].id = ""; return s; })()],
      ["job id non-string", (() => { const s = validState(); s.jobs[0].id = 1; return s; })()],
      ["job eventId empty", (() => { const s = validState(); s.jobs[0].eventId = ""; return s; })()],
      ["job eventId non-string", (() => { const s = validState(); s.jobs[0].eventId = 1; return s; })()],
      ["job status outside enum", (() => { const s = validState(); s.jobs[0].status = "DEAD"; return s; })()],
      ["job attempts negative", (() => { const s = validState(); s.jobs[0].attempts = -1; return s; })()],
      ["job attempts non-integer", (() => { const s = validState(); s.jobs[0].attempts = 0.5; return s; })()],
      ["job retries negative", (() => { const s = validState(); s.jobs[0].retries = -1; return s; })()],
      ["job retries non-integer", (() => { const s = validState(); s.jobs[0].retries = "0"; return s; })()],
      ["job attemptsSinceRetry negative", (() => { const s = validState(); s.jobs[0].attemptsSinceRetry = -1; return s; })()],
      ["job attemptsSinceRetry non-integer", (() => { const s = validState(); s.jobs[0].attemptsSinceRetry = null; return s; })()],
      ["job lastError invalid", (() => { const s = validState(); s.jobs[0].lastError = 1; return s; })()],
      ["duplicate job id", (() => { const s = validState(); s.jobs.push({ ...s.jobs[0], eventId: "other-event" }); return s; })()],
      ["approval is null", (() => { const s = validState(); s.approvals[0] = null; return s; })()],
      ["approval is array", (() => { const s = validState(); s.approvals[0] = []; return s; })()],
      ["approval id empty", (() => { const s = validState(); s.approvals[0].id = ""; return s; })()],
      ["approval id non-string", (() => { const s = validState(); s.approvals[0].id = 1; return s; })()],
      ["approval jobId empty", (() => { const s = validState(); s.approvals[0].jobId = ""; return s; })()],
      ["approval jobId non-string", (() => { const s = validState(); s.approvals[0].jobId = 1; return s; })()],
      ["approval status outside enum", (() => { const s = validState(); s.approvals[0].status = "SENT"; return s; })()],
      ["duplicate approval id", (() => { const s = validState(); s.approvals.push({ ...s.approvals[0], jobId: "job-done" }); return s; })()],
      ["approval references missing job", (() => { const s = validState(); s.approvals[0].jobId = "missing-job"; return s; })()],
      ["outbox entry is null", (() => { const s = validState(); s.outbox[0] = null; return s; })()],
      ["outbox entry is array", (() => { const s = validState(); s.outbox[0] = []; return s; })()],
      ["outbox to absent", (() => { const s = validState(); delete s.outbox[0].to; return s; })()],
      ["outbox subject absent", (() => { const s = validState(); delete s.outbox[0].subject; return s; })()],
      ["outbox body absent", (() => { const s = validState(); delete s.outbox[0].body; return s; })()],
      ["outbox approvalId empty", (() => { const s = validState(); s.outbox[0].approvalId = ""; return s; })()],
      ["outbox approvalId non-string", (() => { const s = validState(); s.outbox[0].approvalId = 1; return s; })()],
      ["outbox sentAt empty", (() => { const s = validState(); s.outbox[0].sentAt = ""; return s; })()],
      ["outbox sentAt non-string", (() => { const s = validState(); s.outbox[0].sentAt = 1; return s; })()],
      ["duplicate outbox approvalId", (() => { const s = validState(); s.outbox.push({ ...s.outbox[0], sentAt: "another-time" }); return s; })()],
      ["outbox references missing approval", (() => { const s = validState(); s.outbox[0].approvalId = "missing-approval"; return s; })()],
    ];

    for (const [name, state] of invalidCases) {
      const stateFile = writeState(dir, state, `invalid-${name.replaceAll(" ", "-")}.json`);
      assertResult(run([stateFile, "dead"]), 1, "", INVALID_ERROR);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AC7: two invocations preserve fixture metadata and a directory state-file is a fixed read failure", () => {
  const dir = tempDir("ac7");
  try {
    const stateFile = writeState(dir, validState());
    const before = snapshot(stateFile);
    const entriesBefore = fs.readdirSync(dir).sort();
    for (const invocation of [1, 2]) {
      assertResult(run([stateFile, "dead"]), 0, '{"outboxEntriesForJobStatus":2}\n', "");
      assert.deepStrictEqual(snapshot(stateFile), before, `fixture remains unchanged after invocation ${invocation}`);
      assert.deepStrictEqual(fs.readdirSync(dir).sort(), entriesBefore, `parent entries remain unchanged after invocation ${invocation}`);
    }
    assertResult(run([dir, "dead"]), 1, "", READ_ERROR);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

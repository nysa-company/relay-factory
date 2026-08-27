const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TOOL = path.join(__dirname, "..", "tools", "outbox-event-type-count.js");
const TIMEOUT_MS = 5_000;
const USAGE =
  "usage: node app/tools/outbox-event-type-count.js <state-file> <event-type>\n";
const CANNOT_READ = "outbox-event-type-count: cannot read state file\n";
const NOT_JSON = "outbox-event-type-count: state file is not valid JSON\n";
const INVALID = "outbox-event-type-count: invalid Relay state\n";

function state() {
  return {
    events: [
      { id: "event-meeting", type: "meeting", receivedAt: "2026-08-27T12:00:00.000Z" },
      { id: "event-email", type: "email", receivedAt: "2026-08-27T12:01:00.000Z" },
      { id: "event-meeting-2", type: "meeting", receivedAt: "2026-08-27T12:02:00.000Z" },
    ],
    jobs: [
      { id: "job-meeting", eventId: "event-meeting" },
      { id: "job-email", eventId: "event-email" },
      { id: "job-meeting-2", eventId: "event-meeting-2" },
    ],
    approvals: [
      { id: "approval-meeting", jobId: "job-meeting", status: "pending" },
      { id: "approval-email", jobId: "job-email", status: "sent" },
      { id: "approval-meeting-2", jobId: "job-meeting-2", status: "rejected" },
    ],
    outbox: [
      { to: "a@example.test", subject: "one", body: "one", approvalId: "approval-meeting", sentAt: "2026-08-27T12:03:00.000Z" },
      { to: "b@example.test", subject: "two", body: "two", approvalId: "approval-email", sentAt: "2026-08-27T12:04:00.000Z" },
      { to: "c@example.test", subject: "three", body: "three", approvalId: "approval-meeting-2", sentAt: "2026-08-27T12:05:00.000Z" },
    ],
  };
}

function discriminationState() {
  return {
    events: [
      { id: "e1", type: "meeting", receivedAt: "2026-08-27T12:00:00.000Z" },
      { id: "e2", type: "meeting", receivedAt: "2026-08-27T12:01:00.000Z" },
      { id: "e3", type: "email", receivedAt: "2026-08-27T12:02:00.000Z" },
    ],
    jobs: [
      { id: "j1", eventId: "e1" },
      { id: "j2", eventId: "e1" },
      { id: "j3", eventId: "e2" },
      { id: "j4", eventId: "e3" },
    ],
    approvals: [
      { id: "a1", jobId: "j1", status: "pending" },
      { id: "a2", jobId: "j1", status: "sent" },
      { id: "a3", jobId: "j2", status: "rejected" },
      { id: "a4", jobId: "j3", status: "blocked_recipient" },
      { id: "a5", jobId: "j4", status: "pending" },
    ],
    outbox: [
      { to: "a@example.test", subject: "one", body: "one", approvalId: "a1", sentAt: "2026-08-27T12:03:00.000Z" },
    ],
  };
}

function tempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `relay-outbox-event-type-count-${label}-`));
}

function fixture(dir, name, value) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, typeof value === "string" ? value : `${JSON.stringify(value)}\n`);
  return file;
}

function run(args) {
  const result = spawnSync(process.execPath, [TOOL, ...args], { timeout: TIMEOUT_MS });
  assert.strictEqual(result.error, undefined, result.error && result.error.message);
  assert.strictEqual(result.signal, null, "the child must self-terminate");
  return { status: result.status, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

function assertResult(actual, status, stdout, stderr) {
  assert.deepStrictEqual(actual, { status, stdout, stderr });
}

function snapshot(file, dir) {
  const fileStat = fs.statSync(file, { bigint: true });
  return {
    bytes: fs.readFileSync(file).toString("hex"),
    mode: fileStat.mode,
    size: fileStat.size,
    mtimeNs: fileStat.mtimeNs,
    entries: fs.readdirSync(dir).sort(),
  };
}

test("AC1 emits exactly one compact outboxEntriesForEventType integer", () => {
  const dir = tempDir("count");
  const file = fixture(dir, "state.json", state());
  assertResult(run([file, "meeting"]), 0, '{"outboxEntriesForEventType":2}\n', "");
});

test("AC2 counts only exact event types and rejects invalid reference-chain state", () => {
  const dir = tempDir("validation");
  const valid = fixture(dir, "valid.json", state());
  assertResult(run([valid, "Meeting"]), 0, '{"outboxEntriesForEventType":0}\n', "");
  assertResult(run([valid, "meeting "]), 0, '{"outboxEntriesForEventType":0}\n', "");

  const invalidCases = [
    ["duplicate event id", value => { value.events[1].id = value.events[0].id; }],
    ["duplicate job id", value => { value.jobs[1].id = value.jobs[0].id; }],
    ["duplicate approval id", value => { value.approvals[1].id = value.approvals[0].id; }],
    ["duplicate outbox approvalId", value => { value.outbox[1].approvalId = value.outbox[0].approvalId; }],
    ["job missing event", value => { value.jobs[0].eventId = "missing-event"; }],
    ["approval missing job", value => { value.approvals[0].jobId = "missing-job"; }],
    ["outbox missing approval", value => { value.outbox[0].approvalId = "missing-approval"; }],
    ["event required field", value => { delete value.events[0].type; }],
    ["job required field", value => { delete value.jobs[0].eventId; }],
    ["approval required field", value => { delete value.approvals[0].status; }],
    ["outbox required field", value => { delete value.outbox[0].subject; }],
    ["non-object root", () => null],
    ["non-array collection", value => { value.events = {}; }],
    ["invalid approval status", value => { value.approvals[0].status = "approved"; }],
  ];

  for (const [name, mutate] of invalidCases) {
    const value = state();
    const mutated = mutate(value);
    const file = fixture(dir, `${name.replaceAll(" ", "-")}.json`, mutated === undefined ? value : mutated);
    assertResult(run([file, "meeting"]), 1, "", INVALID);
  }
});

test("AC3 rejects invalid arguments before file access and redacts read, parse, and state errors", () => {
  const dir = tempDir("errors");
  const inaccessibleCandidate = path.join(dir, "state-that-must-not-be-read.json");
  for (const args of [[], [inaccessibleCandidate], [inaccessibleCandidate, "meeting", "extra"]]) {
    assertResult(run(args), 2, "", USAGE);
  }
  assertResult(run([inaccessibleCandidate, "meeting"]), 1, "", CANNOT_READ);
  assertResult(run([dir, "meeting"]), 1, "", CANNOT_READ);
  const malformed = fixture(dir, "malformed.json", '{"events":[]');
  assertResult(run([malformed, "meeting"]), 1, "", NOT_JSON);
  const invalid = fixture(dir, "invalid.json", { events: [], jobs: [], approvals: [] });
  assertResult(run([invalid, "meeting"]), 1, "", INVALID);
});

test("AC4 is deterministic, read-only, path-independent, offline, zero-dependency, and self-terminating", () => {
  const dir = tempDir("properties");
  const file = fixture(dir, "state.json", state());
  const before = snapshot(file, dir);
  const first = run([file, "meeting"]);
  const second = run([file, "meeting"]);
  assert.deepStrictEqual(second, first, "repeated invocation must be byte-identical");
  assert.deepStrictEqual(snapshot(file, dir), before, "successful reads must not mutate the file or directory");

  const malformed = fixture(dir, "malformed.json", "{");
  const failureBefore = snapshot(malformed, dir);
  assertResult(run([malformed, "meeting"]), 1, "", NOT_JSON);
  assert.deepStrictEqual(snapshot(malformed, dir), failureBefore, "failing reads must not mutate the file or directory");
  const source = fs.readFileSync(TOOL, "utf8");
  const specifiers = [...source.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)].map(match => match[1]);
  assert.deepStrictEqual(specifiers, ["node:fs"]);
  const fsCallSites = [...source.matchAll(/\bfs\s*[.\[]\s*["']?(\w+)["']?\s*\(/g)].map(m => m[1]);
  assert.deepStrictEqual(fsCallSites, ["readFileSync"]);
  for (const forbidden of ["server.js", "fetch(", "WebSocket", "node:http", "node:https", "node:net", "node:child_process", "setTimeout", "setInterval"]) {
    assert.strictEqual(source.includes(forbidden), false, `forbidden module-boundary token: ${forbidden}`);
  }
});

test("AC6 counts referenced outbox entries rather than matching events, jobs, or approvals", () => {
  const dir = tempDir("discrimination");
  const file = fixture(dir, "state.json", discriminationState());
  assertResult(run([file, "meeting"]), 0, '{"outboxEntriesForEventType":1}\n', "");
});

test("AC7 rejects every required collection and field violation while accepting opaque fields and blocked_recipient", () => {
  const dir = tempDir("coverage");
  const invalidCases = [
    ...["events", "jobs", "approvals", "outbox"].flatMap(collection => [
      [`missing ${collection}`, value => { delete value[collection]; }],
      [`non-array ${collection}`, value => { value[collection] = {}; }],
    ]),
    ...[
      ["events", "id"], ["events", "type"], ["events", "receivedAt"],
      ["jobs", "id"], ["jobs", "eventId"],
      ["approvals", "id"], ["approvals", "jobId"],
      ["outbox", "approvalId"], ["outbox", "sentAt"],
    ].flatMap(([collection, field]) => [
      [`missing ${collection} ${field}`, value => { delete value[collection][0][field]; }],
      [`empty ${collection} ${field}`, value => { value[collection][0][field] = ""; }],
    ]),
    ["missing approvals status", value => { delete value.approvals[0].status; }],
    ["non-string approvals status", value => { value.approvals[0].status = 1; }],
    ...["to", "subject", "body"].map(field => [
      `missing outbox ${field}`,
      value => { delete value.outbox[0][field]; },
    ]),
  ];

  for (const [name, mutate] of invalidCases) {
    const value = state();
    mutate(value);
    const file = fixture(dir, `${name.replaceAll(" ", "-")}.json`, value);
    assertResult(run([file, "meeting"]), 1, "", INVALID);
  }

  for (const [collection, field] of [["events", "note"], ["jobs", "note"], ["approvals", "note"], ["outbox", "note"]]) {
    const value = state();
    value[collection][0][field] = "opaque";
    const file = fixture(dir, `opaque-${collection}.json`, value);
    assertResult(run([file, "meeting"]), 0, '{"outboxEntriesForEventType":2}\n', "");
  }

  const blockedRecipient = state();
  blockedRecipient.approvals[0].status = "blocked_recipient";
  const file = fixture(dir, "blocked-recipient.json", blockedRecipient);
  assertResult(run([file, "meeting"]), 0, '{"outboxEntriesForEventType":2}\n', "");
});

test("AC8 redacts permission-denied reads and permits only fs.readFileSync", () => {
  const dir = tempDir("permission");
  const denied = fixture(dir, "denied.json", state());
  fs.chmodSync(denied, 0o000);
  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  if (!isRoot) {
    assertResult(run([denied, "meeting"]), 1, "", CANNOT_READ);
  }
  fs.chmodSync(denied, 0o644);

  const source = fs.readFileSync(TOOL, "utf8");
  const fsCallSites = [...source.matchAll(/\bfs\s*[.\[]\s*["']?(\w+)["']?\s*\(/g)].map(m => m[1]);
  assert.deepStrictEqual(fsCallSites, ["readFileSync"]);
});

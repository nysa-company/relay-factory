const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const TOOL = path.join(__dirname, "..", "tools", "event-type-summary.js");
const CHILD_TIMEOUT_MS = 5_000;

const USAGE_ERROR = "usage: node app/tools/event-type-summary.js <state-file>\n";
const READ_ERROR = "event-type-summary: cannot read state file\n";
const PARSE_ERROR = "event-type-summary: state file is not valid JSON\n";
const INVALID_STATE_ERROR = "event-type-summary: invalid Relay state\n";
const FIXTURE_A_STDOUT =
  '{"eventTypes":[{"type":"3","count":1},{"type":"Meeting","count":1},{"type":"email","count":1},{"type":"meeting","count":2},{"type":3,"count":2},{"type":12,"count":1}]}\n';
const FIXTURE_B_STDOUT = '{"eventTypes":[]}\n';

const SENSITIVE_TOKENS = [
  "SELECTED-PAYLOAD-MUST-NOT-LEAK", "UNSELECTED-PAYLOAD-MUST-NOT-LEAK",
  "OPAQUE-EVENT-PAYLOAD-MUST-NOT-LEAK", "OPAQUE-EVENT-EXTRA-MUST-NOT-LEAK",
  "JOB-ERROR-MUST-NOT-LEAK", "APPROVAL-TO-MUST-NOT-LEAK",
  "APPROVAL-SUBJECT-MUST-NOT-LEAK", "APPROVAL-BODY-MUST-NOT-LEAK",
  "APPROVAL-REASON-MUST-NOT-LEAK", "OUTBOX-TO-MUST-NOT-LEAK",
  "OUTBOX-SUBJECT-MUST-NOT-LEAK", "TOP-LEVEL-METADATA-MUST-NOT-LEAK",
  "OPAQUE-CONTENT-MUST-NOT-LEAK", "MALFORMED-PAYLOAD-MUST-NOT-LEAK",
  "arity-state-MUST-NOT-LEAK", "PATH-MUST-NOT-LEAK", "DIRECTORY-MUST-NOT-LEAK",
];

const FIXTURE_A_VALUE = {
  events: [
    { id: "event-alpha", type: "meeting", payload: { private: "SELECTED-PAYLOAD-MUST-NOT-LEAK" }, receivedAt: "2026-08-24T12:00:00.000Z" },
    { id: "event-bravo", type: "meeting", payload: "OPAQUE-EVENT-PAYLOAD-MUST-NOT-LEAK", extra: { private: "OPAQUE-EVENT-EXTRA-MUST-NOT-LEAK" }, receivedAt: "2026-08-24T12:00:01.000Z" },
    { id: "event-charlie", type: "email", payload: { private: "UNSELECTED-PAYLOAD-MUST-NOT-LEAK" }, receivedAt: "2026-08-24T12:00:02.000Z" },
    { id: "event-delta", type: 3, receivedAt: "2026-08-24T12:00:03.000Z" },
    { id: "event-echo", type: 3, receivedAt: "2026-08-24T12:00:04.000Z" },
    { id: "event-foxtrot", type: 12, receivedAt: "2026-08-24T12:00:05.000Z" },
    { id: "event-golf", type: "Meeting", receivedAt: "2026-08-24T12:00:06.000Z" },
    { id: "event-hotel", type: "3", receivedAt: "2026-08-24T12:00:07.000Z" },
  ],
  jobs: [{ id: "job-event-alpha", eventId: "event-alpha", status: "dead", lastError: "JOB-ERROR-MUST-NOT-LEAK" }],
  approvals: [{ id: "appr-event-alpha", jobId: "job-event-alpha", action: { to: "APPROVAL-TO-MUST-NOT-LEAK", subject: "APPROVAL-SUBJECT-MUST-NOT-LEAK", body: "APPROVAL-BODY-MUST-NOT-LEAK" }, status: "rejected", reason: "APPROVAL-REASON-MUST-NOT-LEAK" }],
  outbox: [{ to: "OUTBOX-TO-MUST-NOT-LEAK", subject: "OUTBOX-SUBJECT-MUST-NOT-LEAK", body: "OUTBOX-BODY-MUST-NOT-LEAK", approvalId: "appr-event-alpha" }],
  metadata: { note: "TOP-LEVEL-METADATA-MUST-NOT-LEAK" },
};
const FIXTURE_A = JSON.stringify(FIXTURE_A_VALUE, null, 2) + "\n";
const FIXTURE_B = '{"events":[],"jobs":[null],"approvals":[7],"outbox":["OPAQUE-CONTENT-MUST-NOT-LEAK"],"metadata":false}\n';
const FIXTURE_C = '{"events":[],"payload":"MALFORMED-PAYLOAD-MUST-NOT-LEAK"\n';
const FIXTURE_D = "";

const STRUCTURAL_INVALID_FIXTURES = [
  ["S1", "null\n"], ["S2", "[]\n"], ["S3", '{"events":[],"jobs":[],"approvals":[]}\n'],
  ["S4", '{"events":{},"jobs":[],"approvals":[],"outbox":[]}\n'], ["S5", '{"events":[],"jobs":{},"approvals":[],"outbox":[]}\n'],
  ["S6", '{"events":[],"jobs":[],"approvals":{},"outbox":[]}\n'], ["S7", '{"events":[],"jobs":[],"approvals":[],"outbox":{}}\n'],
  ["S8", '{"events":[null],"jobs":[],"approvals":[],"outbox":[]}\n'], ["S9", '{"events":[[]],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S10", '{"events":[{"type":"meeting","receivedAt":"2026-08-24T12:00:00.000Z"}],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S11", '{"events":[{"id":"","type":"meeting","receivedAt":"2026-08-24T12:00:00.000Z"}],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S12", '{"events":[{"id":7,"type":"meeting","receivedAt":"2026-08-24T12:00:00.000Z"}],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S13", '{"events":[{"id":"event-alpha","receivedAt":"2026-08-24T12:00:00.000Z"}],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S14", '{"events":[{"id":"event-alpha","type":"","receivedAt":"2026-08-24T12:00:00.000Z"}],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S15", '{"events":[{"id":"event-alpha","type":true,"receivedAt":"2026-08-24T12:00:00.000Z"}],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S16", '{"events":[{"id":"event-alpha","type":false,"receivedAt":"2026-08-24T12:00:00.000Z"}],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S17", '{"events":[{"id":"event-alpha","type":{},"receivedAt":"2026-08-24T12:00:00.000Z"}],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S18", '{"events":[{"id":"event-alpha","type":[],"receivedAt":"2026-08-24T12:00:00.000Z"}],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S19", '{"events":[{"id":"event-alpha","type":0,"receivedAt":"2026-08-24T12:00:00.000Z"}],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S20", '{"events":[{"id":"event-alpha","type":-0,"receivedAt":"2026-08-24T12:00:00.000Z"}],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S21", '{"events":[{"id":"event-alpha","type":1e400,"receivedAt":"2026-08-24T12:00:00.000Z"}],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S22", '{"events":[{"id":"event-alpha","type":-1e400,"receivedAt":"2026-08-24T12:00:00.000Z"}],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S23", '{"events":[{"id":"event-alpha","type":"meeting"}],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S24", '{"events":[{"id":"event-alpha","type":"meeting","receivedAt":""}],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S25", '{"events":[{"id":"event-alpha","type":"meeting","receivedAt":null}],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S26", '{"events":[{"id":"event-alpha","type":"meeting","receivedAt":"2026-08-24T12:00:00.000Z"},{"id":"event-alpha","type":"email","receivedAt":"2026-08-24T12:00:01.000Z"}],"jobs":[],"approvals":[],"outbox":[]}\n'],
];

function makeTempDir(label) { return fs.mkdtempSync(path.join(os.tmpdir(), `relay-event-type-summary-${label}-`)); }
function writeFixture(dir, name, contents) { const file = path.join(dir, name); fs.writeFileSync(file, contents); return file; }
function snapshotFile(file) { const stat = fs.statSync(file, { bigint: true }); return { bytes: fs.readFileSync(file).toString("hex"), mode: stat.mode, size: stat.size, mtimeNs: stat.mtimeNs }; }
function entryNames(dir) { return fs.readdirSync(dir).sort(); }
function snapshotDirectory(dir) { const stat = fs.statSync(dir, { bigint: true }); return { entries: entryNames(dir), mode: stat.mode, size: stat.size, mtimeNs: stat.mtimeNs }; }
function runTool(args) {
  const result = spawnSync(process.execPath, [TOOL, ...args], { stdio: "pipe", timeout: CHILD_TIMEOUT_MS });
  assert.strictEqual(result.error, undefined, `child reported an error: ${result.error && result.error.message}`);
  assert.strictEqual(result.signal, null, `child terminated by signal ${result.signal}`);
  const stdout = result.stdout.toString("utf8"); const stderr = result.stderr.toString("utf8");
  for (const token of SENSITIVE_TOKENS) { assert.strictEqual(stdout.includes(token), false, `stdout leaked ${token}`); assert.strictEqual(stderr.includes(token), false, `stderr leaked ${token}`); }
  return { status: result.status, stdout, stderr, stdoutBytes: result.stdout.length, stderrBytes: result.stderr.length };
}
function specifiersOf(source) { return [...new Set([...source.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)].map(match => match[1]))].sort(); }
function fsOperationsOf(source) {
  const destructured = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\(\s*["']node:fs["']\s*\)/.exec(source);
  assert.notStrictEqual(destructured, null, 'production file must destructure require("node:fs")');
  return [...new Set(destructured[1].split(",").map(part => part.split(":").pop().trim()).filter(Boolean))].sort();
}
function assertUntouched(file, before, dir, entries, label) { assert.deepStrictEqual(snapshotFile(file), before, `fixture bytes and stat ${label}`); assert.deepStrictEqual(entryNames(dir), entries, `parent entries ${label}`); }

test("AC1: Fixture A prints the frozen compact JSON summary with no stderr and leaves the fixture untouched", () => {
  const dir = makeTempDir("ac1");
  try { const fixture = writeFixture(dir, "state.json", FIXTURE_A); const before = snapshotFile(fixture); const entries = entryNames(dir); const result = runTool([fixture]);
    assert.strictEqual(result.status, 0); assert.strictEqual(result.stdout, FIXTURE_A_STDOUT); assert.strictEqual(result.stderr, ""); assert.strictEqual(result.stderrBytes, 0); assertUntouched(fixture, before, dir, entries, "after summary");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AC2: Fixture A keeps string and numeric types distinct and orders their counts deterministically", () => {
  const dir = makeTempDir("ac2");
  try { const fixture = writeFixture(dir, "state.json", FIXTURE_A); const result = runTool([fixture]);
    assert.strictEqual(result.status, 0); assert.strictEqual(result.stdout, FIXTURE_A_STDOUT); assert.strictEqual(result.stderr, "");
    assert.deepStrictEqual(JSON.parse(result.stdout), { eventTypes: [{ type: "3", count: 1 }, { type: "Meeting", count: 1 }, { type: "email", count: 1 }, { type: "meeting", count: 2 }, { type: 3, count: 2 }, { type: 12, count: 1 }] });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AC3: Fixture B produces an empty summary and repeated invocation is byte-for-byte deterministic", () => {
  const dir = makeTempDir("ac3");
  try { const fixture = writeFixture(dir, "state.json", FIXTURE_B); const before = snapshotFile(fixture); const entries = entryNames(dir); const first = runTool([fixture]); const second = runTool([fixture]);
    for (const [label, result] of [["first", first], ["second", second]]) { assert.strictEqual(result.status, 0, label); assert.strictEqual(result.stdout, FIXTURE_B_STDOUT, label); assert.strictEqual(result.stderr, "", label); assert.strictEqual(result.stderrBytes, 0, label); }
    assert.strictEqual(first.stdout, second.stdout); assertUntouched(fixture, before, dir, entries, "after repeated summaries");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AC4: every frozen structural-invalid fixture fails before summarization with the invalid-state envelope", () => {
  const serialized = [["A", FIXTURE_A], ["B", FIXTURE_B], ["C", FIXTURE_C], ["D", FIXTURE_D], ...STRUCTURAL_INVALID_FIXTURES];
  for (let i = 0; i < serialized.length; i += 1) for (let j = i + 1; j < serialized.length; j += 1) assert.notStrictEqual(serialized[i][1], serialized[j][1], `fixtures ${serialized[i][0]} and ${serialized[j][0]} are byte-identical`);
  for (const [label, contents] of STRUCTURAL_INVALID_FIXTURES) { const dir = makeTempDir(`ac4-${label.toLowerCase()}`); try { const fixture = writeFixture(dir, "state.json", contents); const before = snapshotFile(fixture); const entries = entryNames(dir); const result = runTool([fixture]); assert.strictEqual(result.status, 1, label); assert.strictEqual(result.stdout, "", label); assert.strictEqual(result.stdoutBytes, 0, label); assert.strictEqual(result.stderr, INVALID_STATE_ERROR, label); assertUntouched(fixture, before, dir, entries, label); } finally { fs.rmSync(dir, { recursive: true, force: true }); } }
});

test("AC5: usage, unreadable-file, and invalid-JSON failures use redacted fixed envelopes with zero stdout", () => {
  const arityDir = makeTempDir("ac5-arity");
  try { const candidate = path.join(arityDir, "arity-state-MUST-NOT-LEAK.json"); for (const args of [[], [candidate, "extra"]]) { const result = runTool(args); assert.strictEqual(result.status, 2); assert.strictEqual(result.stdout, ""); assert.strictEqual(result.stdoutBytes, 0); assert.strictEqual(result.stderr, USAGE_ERROR); } assert.strictEqual(fs.existsSync(candidate), false); } finally { fs.rmSync(arityDir, { recursive: true, force: true }); }
  const missingDir = makeTempDir("ac5-missing");
  try { const missing = path.join(missingDir, "PATH-MUST-NOT-LEAK.json"); const result = runTool([missing]); assert.strictEqual(result.status, 1); assert.strictEqual(result.stdout, ""); assert.strictEqual(result.stdoutBytes, 0); assert.strictEqual(result.stderr, READ_ERROR); assert.strictEqual(fs.existsSync(missing), false); } finally { fs.rmSync(missingDir, { recursive: true, force: true }); }
  const directoryParent = makeTempDir("ac5-directory");
  try { const stateDirectory = path.join(directoryParent, "DIRECTORY-MUST-NOT-LEAK"); fs.mkdirSync(stateDirectory); const before = snapshotDirectory(stateDirectory); const result = runTool([stateDirectory]); assert.strictEqual(result.status, 1); assert.strictEqual(result.stdout, ""); assert.strictEqual(result.stdoutBytes, 0); assert.strictEqual(result.stderr, READ_ERROR); assert.deepStrictEqual(snapshotDirectory(stateDirectory), before); } finally { fs.rmSync(directoryParent, { recursive: true, force: true }); }
  for (const [label, contents] of [["C", FIXTURE_C], ["D", FIXTURE_D]]) { const dir = makeTempDir(`ac5-${label}`); try { const fixture = writeFixture(dir, "state.json", contents); const result = runTool([fixture]); assert.strictEqual(result.status, 1, label); assert.strictEqual(result.stdout, "", label); assert.strictEqual(result.stdoutBytes, 0, label); assert.strictEqual(result.stderr, PARSE_ERROR, label); } finally { fs.rmSync(dir, { recursive: true, force: true }); } }
});

test("AC6: the command self-terminates and its production and test sources remain within frozen offline boundaries", () => {
  const dir = makeTempDir("ac6");
  try { const fixture = writeFixture(dir, "state.json", FIXTURE_A); const result = runTool([fixture]); assert.strictEqual(result.status, 0); assert.strictEqual(result.stdout, FIXTURE_A_STDOUT); assert.strictEqual(result.stderr, ""); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  assert.strictEqual(fs.existsSync(TOOL), true, "app/tools/event-type-summary.js exists"); const toolSource = fs.readFileSync(TOOL, "utf8");
  assert.deepStrictEqual(specifiersOf(toolSource), ["node:fs"]); assert.deepStrictEqual(fsOperationsOf(toolSource), ["readFileSync"]);
  for (const forbidden of ["server.js", "fetch(", "WebSocket", "node:http", "node:https", "node:net", "node:child_process", "setTimeout", "setInterval"]) assert.strictEqual(toolSource.includes(forbidden), false, `production file references ${forbidden}`);
  assert.deepStrictEqual(specifiersOf(fs.readFileSync(__filename, "utf8")), ["node:assert", "node:child_process", "node:fs", "node:os", "node:path", "node:test"]);
});

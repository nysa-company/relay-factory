const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TOOL = path.join(__dirname, "..", "tools", "approval-event-type-count.js");
const TIMEOUT_MS = 5_000;
const USAGE = "usage: node app/tools/approval-event-type-count.js <state-file> <event-type>\n";
const CANNOT_READ = "approval-event-type-count: cannot read state file\n";
const NOT_JSON = "approval-event-type-count: state file is not valid JSON\n";
const INVALID = "approval-event-type-count: invalid Relay state\n";

const SENSITIVE = [
  "EVENT-ALPHA-PAYLOAD-MUST-NOT-LEAK", "EVENT-BRAVO-PAYLOAD-MUST-NOT-LEAK",
  "EVENT-CHARLIE-PAYLOAD-MUST-NOT-LEAK", "EVENT-DELTA-PAYLOAD-MUST-NOT-LEAK",
  "JOB-ALPHA-ERROR-MUST-NOT-LEAK", "JOB-CHARLIE-ERROR-MUST-NOT-LEAK",
  "JOB-GOLF-ERROR-MUST-NOT-LEAK", "TO-ALPHA-MUST-NOT-LEAK", "SUBJECT-ALPHA-MUST-NOT-LEAK",
  "BODY-ALPHA-MUST-NOT-LEAK", "TO-BRAVO-MUST-NOT-LEAK", "SUBJECT-BRAVO-MUST-NOT-LEAK",
  "BODY-BRAVO-MUST-NOT-LEAK", "TO-CHARLIE-MUST-NOT-LEAK", "SUBJECT-CHARLIE-MUST-NOT-LEAK",
  "BODY-CHARLIE-MUST-NOT-LEAK", "REASON-CHARLIE-MUST-NOT-LEAK", "TO-ECHO-MUST-NOT-LEAK",
  "SUBJECT-ECHO-MUST-NOT-LEAK", "BODY-ECHO-MUST-NOT-LEAK", "TO-FOXTROT-MUST-NOT-LEAK",
  "SUBJECT-FOXTROT-MUST-NOT-LEAK", "BODY-FOXTROT-MUST-NOT-LEAK", "OUTBOX-TO-MUST-NOT-LEAK",
  "OUTBOX-SUBJECT-MUST-NOT-LEAK", "OUTBOX-BODY-MUST-NOT-LEAK", "TOP-LEVEL-METADATA-MUST-NOT-LEAK",
  "MALFORMED-PAYLOAD-MUST-NOT-LEAK", "arity-state-MUST-NOT-LEAK", "PATH-MUST-NOT-LEAK",
  "DIRECTORY-MUST-NOT-LEAK", "2026-08-24T12:00:00.000Z", "2026-08-24T12:00:01.000Z",
  "2026-08-24T12:00:02.000Z", "2026-08-24T12:00:03.000Z", "2026-08-24T12:00:04.000Z",
  "2026-08-24T12:00:05.000Z", "2026-08-24T12:00:06.000Z", "2026-08-24T12:00:07.000Z",
  "2026-08-24T12:00:08.000Z", "2026-08-24T12:00:09.000Z",
  "OUTBOX-OPAQUE-SCALAR-MUST-NOT-LEAK", "OUTBOX-OPAQUE-NESTED-ARRAY-MUST-NOT-LEAK",
  "OUTBOX-OPAQUE-OBJECT-MUST-NOT-LEAK", "TOP-LEVEL-EXTRA-SCALAR-MUST-NOT-LEAK",
  "2026-08-24T12:00:10.000Z",
];

const FIXTURE_A_VALUE = {
  events: [
    { id: "event-alpha", type: "meeting", payload: "EVENT-ALPHA-PAYLOAD-MUST-NOT-LEAK", receivedAt: "2026-08-24T12:00:00.000Z" },
    { id: "event-bravo", type: "meeting", payload: { private: "EVENT-BRAVO-PAYLOAD-MUST-NOT-LEAK" }, receivedAt: "2026-08-24T12:00:01.000Z" },
    { id: "event-charlie", type: "email", payload: "EVENT-CHARLIE-PAYLOAD-MUST-NOT-LEAK", receivedAt: "2026-08-24T12:00:02.000Z" },
    { id: "event-delta", type: "meeting", payload: "EVENT-DELTA-PAYLOAD-MUST-NOT-LEAK", receivedAt: "2026-08-24T12:00:03.000Z" },
  ],
  jobs: [
    { id: "job-alpha", eventId: "event-alpha", status: "dead", lastError: "JOB-ALPHA-ERROR-MUST-NOT-LEAK" },
    { id: "job-bravo", eventId: "event-bravo", status: "done", lastError: null },
    { id: "job-charlie", eventId: "event-charlie", status: "dead", lastError: "JOB-CHARLIE-ERROR-MUST-NOT-LEAK" },
    { id: "job-echo", eventId: "event-alpha", status: "pending", lastError: null },
    { id: "job-foxtrot", eventId: "event-alpha", status: "done", lastError: null },
    { id: "job-golf", eventId: "event-charlie", status: "dead", lastError: "JOB-GOLF-ERROR-MUST-NOT-LEAK" },
    { id: "job-hotel", eventId: "event-bravo", status: "pending", lastError: null },
  ],
  approvals: [
    { id: "appr-alpha", jobId: "job-alpha", action: { to: "TO-ALPHA-MUST-NOT-LEAK", subject: "SUBJECT-ALPHA-MUST-NOT-LEAK", body: "BODY-ALPHA-MUST-NOT-LEAK" }, status: "pending", proposedAt: "2026-08-24T12:00:04.000Z" },
    { id: "appr-bravo", jobId: "job-bravo", action: { to: "TO-BRAVO-MUST-NOT-LEAK", subject: "SUBJECT-BRAVO-MUST-NOT-LEAK", body: "BODY-BRAVO-MUST-NOT-LEAK" }, status: "sent", proposedAt: "2026-08-24T12:00:05.000Z" },
    { id: "appr-charlie", jobId: "job-charlie", action: { to: "TO-CHARLIE-MUST-NOT-LEAK", subject: "SUBJECT-CHARLIE-MUST-NOT-LEAK", body: "BODY-CHARLIE-MUST-NOT-LEAK" }, status: "rejected", proposedAt: "2026-08-24T12:00:06.000Z", reason: "REASON-CHARLIE-MUST-NOT-LEAK" },
    { id: "appr-echo", jobId: "job-echo", action: { to: "TO-ECHO-MUST-NOT-LEAK", subject: "SUBJECT-ECHO-MUST-NOT-LEAK", body: "BODY-ECHO-MUST-NOT-LEAK" }, status: "blocked_recipient", proposedAt: "2026-08-24T12:00:07.000Z" },
    { id: "appr-foxtrot", jobId: "job-foxtrot", action: { to: "TO-FOXTROT-MUST-NOT-LEAK", subject: "SUBJECT-FOXTROT-MUST-NOT-LEAK", body: "BODY-FOXTROT-MUST-NOT-LEAK" }, status: "pending", proposedAt: "2026-08-24T12:00:08.000Z" },
  ],
  outbox: [{ to: "OUTBOX-TO-MUST-NOT-LEAK", subject: "OUTBOX-SUBJECT-MUST-NOT-LEAK", body: "OUTBOX-BODY-MUST-NOT-LEAK", approvalId: "appr-bravo", sentAt: "2026-08-24T12:00:09.000Z" }],
  metadata: { note: "TOP-LEVEL-METADATA-MUST-NOT-LEAK" },
};
const FIXTURE_A = JSON.stringify(FIXTURE_A_VALUE, null, 2) + "\n";
const FIXTURE_B = '{"events":[],"jobs":[],"approvals":[],"outbox":[]}\n';
const FIXTURE_C = '{"events":[],"payload":"MALFORMED-PAYLOAD-MUST-NOT-LEAK"\n';
const FIXTURE_D = "";
const FIXTURE_E_VALUE = {
  events: [{ id: "event-echo-e", type: "meeting", receivedAt: "2026-08-24T12:00:10.000Z" }],
  jobs: [{ id: "job-echo-e", eventId: "event-echo-e" }],
  approvals: [{ id: "appr-echo-e", jobId: "job-echo-e" }],
  outbox: [null, 42, "OUTBOX-OPAQUE-SCALAR-MUST-NOT-LEAK", true, ["OUTBOX-OPAQUE-NESTED-ARRAY-MUST-NOT-LEAK"], { arbitrary: "OUTBOX-OPAQUE-OBJECT-MUST-NOT-LEAK" }],
  extraTopLevelFlag: "TOP-LEVEL-EXTRA-SCALAR-MUST-NOT-LEAK",
};
const FIXTURE_E = JSON.stringify(FIXTURE_E_VALUE, null, 2) + "\n";

const STRUCTURAL_INVALID = [
  ["S1", "null\n"], ["S2", "[]\n"], ["S3", '{"events":[],"jobs":[],"approvals":[]}\n'], ["S4", '{"events":{},"jobs":[],"approvals":[],"outbox":[]}\n'], ["S5", '{"events":[],"jobs":{},"approvals":[],"outbox":[]}\n'], ["S6", '{"events":[],"jobs":[],"approvals":{},"outbox":[]}\n'], ["S7", '{"events":[],"jobs":[],"approvals":[],"outbox":{}}\n'],
  ["S8", '{"events":[null],"jobs":[],"approvals":[],"outbox":[]}\n'], ["S9", '{"events":[[]],"jobs":[],"approvals":[],"outbox":[]}\n'], ["S10", '{"events":[{"type":"meeting","receivedAt":"t"}],"jobs":[],"approvals":[],"outbox":[]}\n'], ["S11", '{"events":[{"id":"","type":"meeting","receivedAt":"t"}],"jobs":[],"approvals":[],"outbox":[]}\n'], ["S12", '{"events":[{"id":7,"type":"meeting","receivedAt":"t"}],"jobs":[],"approvals":[],"outbox":[]}\n'], ["S13", '{"events":[{"id":"event-a","receivedAt":"t"}],"jobs":[],"approvals":[],"outbox":[]}\n'], ["S14", '{"events":[{"id":"event-a","type":"","receivedAt":"t"}],"jobs":[],"approvals":[],"outbox":[]}\n'], ["S15", '{"events":[{"id":"event-a","type":7,"receivedAt":"t"}],"jobs":[],"approvals":[],"outbox":[]}\n'], ["S16", '{"events":[{"id":"event-a","type":"meeting"}],"jobs":[],"approvals":[],"outbox":[]}\n'], ["S17", '{"events":[{"id":"event-a","type":"meeting","receivedAt":""}],"jobs":[],"approvals":[],"outbox":[]}\n'], ["S18", '{"events":[{"id":"event-a","type":"meeting","receivedAt":null}],"jobs":[],"approvals":[],"outbox":[]}\n'], ["S19", '{"events":[{"id":"event-a","type":"meeting","receivedAt":"t"},{"id":"event-a","type":"email","receivedAt":"t2"}],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S20", '{"events":[{"id":"event-a","type":"meeting","receivedAt":"t"}],"jobs":[null],"approvals":[],"outbox":[]}\n'], ["S21", '{"events":[{"id":"event-a","type":"meeting","receivedAt":"t"}],"jobs":[[]],"approvals":[],"outbox":[]}\n'], ["S22", '{"events":[{"id":"event-a","type":"meeting","receivedAt":"t"}],"jobs":[{"eventId":"event-a"}],"approvals":[],"outbox":[]}\n'], ["S23", '{"events":[{"id":"event-a","type":"meeting","receivedAt":"t"}],"jobs":[{"id":"","eventId":"event-a"}],"approvals":[],"outbox":[]}\n'], ["S24", '{"events":[{"id":"event-a","type":"meeting","receivedAt":"t"}],"jobs":[{"id":7,"eventId":"event-a"}],"approvals":[],"outbox":[]}\n'], ["S25", '{"events":[{"id":"event-a","type":"meeting","receivedAt":"t"}],"jobs":[{"id":"job-a"}],"approvals":[],"outbox":[]}\n'], ["S26", '{"events":[{"id":"event-a","type":"meeting","receivedAt":"t"}],"jobs":[{"id":"job-a","eventId":""}],"approvals":[],"outbox":[]}\n'], ["S27", '{"events":[{"id":"event-a","type":"meeting","receivedAt":"t"}],"jobs":[{"id":"job-a","eventId":7}],"approvals":[],"outbox":[]}\n'], ["S28", '{"events":[{"id":"event-a","type":"meeting","receivedAt":"t"}],"jobs":[{"id":"job-a","eventId":"event-a"},{"id":"job-a","eventId":"event-a"}],"approvals":[],"outbox":[]}\n'], ["S29", '{"events":[{"id":"event-a","type":"meeting","receivedAt":"t"}],"jobs":[{"id":"job-a","eventId":"event-missing"}],"approvals":[],"outbox":[]}\n'],
  ["S30", '{"events":[{"id":"event-a","type":"meeting","receivedAt":"t"}],"jobs":[{"id":"job-a","eventId":"event-a"}],"approvals":[null],"outbox":[]}\n'], ["S31", '{"events":[{"id":"event-a","type":"meeting","receivedAt":"t"}],"jobs":[{"id":"job-a","eventId":"event-a"}],"approvals":[[]],"outbox":[]}\n'], ["S32", '{"events":[{"id":"event-a","type":"meeting","receivedAt":"t"}],"jobs":[{"id":"job-a","eventId":"event-a"}],"approvals":[{"jobId":"job-a"}],"outbox":[]}\n'], ["S33", '{"events":[{"id":"event-a","type":"meeting","receivedAt":"t"}],"jobs":[{"id":"job-a","eventId":"event-a"}],"approvals":[{"id":"","jobId":"job-a"}],"outbox":[]}\n'], ["S34", '{"events":[{"id":"event-a","type":"meeting","receivedAt":"t"}],"jobs":[{"id":"job-a","eventId":"event-a"}],"approvals":[{"id":7,"jobId":"job-a"}],"outbox":[]}\n'], ["S35", '{"events":[{"id":"event-a","type":"meeting","receivedAt":"t"}],"jobs":[{"id":"job-a","eventId":"event-a"}],"approvals":[{"id":"appr-a"}],"outbox":[]}\n'], ["S36", '{"events":[{"id":"event-a","type":"meeting","receivedAt":"t"}],"jobs":[{"id":"job-a","eventId":"event-a"}],"approvals":[{"id":"appr-a","jobId":""}],"outbox":[]}\n'], ["S37", '{"events":[{"id":"event-a","type":"meeting","receivedAt":"t"}],"jobs":[{"id":"job-a","eventId":"event-a"}],"approvals":[{"id":"appr-a","jobId":7}],"outbox":[]}\n'], ["S38", '{"events":[{"id":"event-a","type":"meeting","receivedAt":"t"}],"jobs":[{"id":"job-a","eventId":"event-a"}],"approvals":[{"id":"appr-a","jobId":"job-a"},{"id":"appr-a","jobId":"job-a"}],"outbox":[]}\n'], ["S39", '{"events":[{"id":"event-a","type":"meeting","receivedAt":"t"}],"jobs":[{"id":"job-a","eventId":"event-a"}],"approvals":[{"id":"appr-a","jobId":"job-missing"}],"outbox":[]}\n'],
];

function temp(label) { return fs.mkdtempSync(path.join(os.tmpdir(), `relay-approval-event-type-count-${label}-`)); }
function write(dir, contents) { const file = path.join(dir, "state.json"); fs.writeFileSync(file, contents); return file; }
function fileSnapshot(file) { const stat = fs.statSync(file, { bigint: true }); return { bytes: fs.readFileSync(file).toString("hex"), mode: stat.mode, size: stat.size, mtimeNs: stat.mtimeNs }; }
function directorySnapshot(dir) { const stat = fs.statSync(dir, { bigint: true }); return { mode: stat.mode, size: stat.size, mtimeNs: stat.mtimeNs, entries: fs.readdirSync(dir).sort() }; }
function run(args) {
  const result = spawnSync(process.execPath, [TOOL, ...args], { stdio: "pipe", timeout: TIMEOUT_MS });
  assert.strictEqual(result.error, undefined, `child error: ${result.error && result.error.message}`);
  assert.strictEqual(result.signal, null, "child was not signaled");
  const stdout = result.stdout.toString("utf8"); const stderr = result.stderr.toString("utf8");
  for (const token of SENSITIVE) { assert.strictEqual(stdout.includes(token), false, `stdout leaked ${token}`); assert.strictEqual(stderr.includes(token), false, `stderr leaked ${token}`); }
  return { status: result.status, stdout, stderr, stdoutBytes: result.stdout.length, stderrBytes: result.stderr.length };
}
function assertResult(result, status, stdout, stderr) { assert.strictEqual(result.status, status); assert.strictEqual(result.stdout, stdout); assert.strictEqual(result.stderr, stderr); assert.strictEqual(result.stdoutBytes, Buffer.byteLength(stdout)); assert.strictEqual(result.stderrBytes, Buffer.byteLength(stderr)); }
function specifiers(source) { return [...new Set([...source.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)].map(match => match[1]))].sort(); }
function fsOperations(source) { return [...new Set([...source.matchAll(/\bfs\s*\.\s*([A-Za-z_$][\w$]*)/g)].map(match => match[1]))].sort(); }

test("AC1: Fixture A counts approvals by an exact referenced event type without mutation", () => {
  const dir = temp("ac1"); try { const fixture = write(dir, FIXTURE_A); const before = fileSnapshot(fixture); const entries = fs.readdirSync(dir).sort();
    for (const [type, expected] of [["meeting", 4], ["meeting", 4], ["email", 1], ["Meeting", 0], ["call", 0]]) { assertResult(run([fixture, type]), 0, `{"approvalsForEventType":${expected}}\n`, ""); assert.deepStrictEqual(fileSnapshot(fixture), before); assert.deepStrictEqual(fs.readdirSync(dir).sort(), entries); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AC2: Fixture B's empty valid state returns a successful zero count without mutation", () => {
  const dir = temp("ac2"); try { const fixture = write(dir, FIXTURE_B); const before = fileSnapshot(fixture); const entries = fs.readdirSync(dir).sort(); assertResult(run([fixture, "meeting"]), 0, '{"approvalsForEventType":0}\n', ""); assert.deepStrictEqual(fileSnapshot(fixture), before); assert.deepStrictEqual(fs.readdirSync(dir).sort(), entries); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AC3: invalid arities use the exact usage envelope without touching candidate paths", () => {
  for (const [label, args] of [["zero", []], ["one", null], ["three", "three"]]) { const dir = temp(`ac3-${label}`); try { const candidate = path.join(dir, "arity-state-MUST-NOT-LEAK.json"); const actual = args === null ? [candidate] : args === "three" ? [candidate, "meeting", "extra"] : []; assertResult(run(actual), 2, "", USAGE); assert.strictEqual(fs.existsSync(candidate), false); assert.deepStrictEqual(fs.readdirSync(dir).sort(), []); } finally { fs.rmSync(dir, { recursive: true, force: true }); } }
});

test("AC4: absent and directory paths use the exact read-failure envelope without mutation", () => {
  const absentParent = temp("ac4-absent"); try { const absent = path.join(absentParent, "PATH-MUST-NOT-LEAK.json"); const entries = fs.readdirSync(absentParent).sort(); assertResult(run([absent, "meeting"]), 1, "", CANNOT_READ); assert.strictEqual(fs.existsSync(absent), false); assert.deepStrictEqual(fs.readdirSync(absentParent).sort(), entries); } finally { fs.rmSync(absentParent, { recursive: true, force: true }); }
  const dir = temp("ac4-directory"); try { const target = path.join(dir, "DIRECTORY-MUST-NOT-LEAK"); fs.mkdirSync(target); const before = directorySnapshot(target); const entries = fs.readdirSync(dir).sort(); assertResult(run([target, "meeting"]), 1, "", CANNOT_READ); assert.strictEqual(fs.statSync(target).isDirectory(), true); assert.deepStrictEqual(directorySnapshot(target), before); assert.deepStrictEqual(fs.readdirSync(dir).sort(), entries); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AC5: truncated and zero-byte JSON use the exact parse-failure envelope without mutation", () => {
  for (const [label, contents] of [["truncated", FIXTURE_C], ["zero", FIXTURE_D]]) { const dir = temp(`ac5-${label}`); try { const fixture = write(dir, contents); const before = fileSnapshot(fixture); const entries = fs.readdirSync(dir).sort(); assertResult(run([fixture, "meeting"]), 1, "", NOT_JSON); assert.deepStrictEqual(fileSnapshot(fixture), before); assert.deepStrictEqual(fs.readdirSync(dir).sort(), entries); } finally { fs.rmSync(dir, { recursive: true, force: true }); } }
});

test("AC6: each S1-S39 structural-invalid fixture fails closed and remains untouched", () => {
  const all = [["A", FIXTURE_A], ["B", FIXTURE_B], ["C", FIXTURE_C], ["D", FIXTURE_D], ...STRUCTURAL_INVALID]; for (let i = 0; i < all.length; i += 1) for (let j = i + 1; j < all.length; j += 1) assert.notStrictEqual(all[i][1], all[j][1], `${all[i][0]} and ${all[j][0]} are byte-distinct`);
  for (const [label, contents] of STRUCTURAL_INVALID) { const dir = temp(`ac6-${label}`); try { const fixture = write(dir, contents); const before = fileSnapshot(fixture); const entries = fs.readdirSync(dir).sort(); assertResult(run([fixture, "meeting"]), 1, "", INVALID); assert.deepStrictEqual(fileSnapshot(fixture), before); assert.deepStrictEqual(fs.readdirSync(dir).sort(), entries); } finally { fs.rmSync(dir, { recursive: true, force: true }); } }
});

test("AC7: child invocations time out safely and source boundaries remain frozen", () => {
  const dir = temp("ac7"); try { const fixture = write(dir, FIXTURE_A); assertResult(run([fixture, "meeting"]), 0, '{"approvalsForEventType":4}\n', ""); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  assert.strictEqual(fs.existsSync(TOOL), true); const source = fs.readFileSync(TOOL, "utf8"); assert.deepStrictEqual(specifiers(source), ["node:fs"]); assert.deepStrictEqual(fsOperations(source), ["readFileSync"]); for (const forbidden of ["server.js", "fetch(", "WebSocket", "node:http", "node:https", "node:net", "node:child_process", "setTimeout", "setInterval"]) assert.strictEqual(source.includes(forbidden), false, forbidden);
  assert.deepStrictEqual(specifiers(fs.readFileSync(__filename, "utf8")), ["node:assert", "node:child_process", "node:fs", "node:os", "node:path", "node:test"]);
});

test("AC8: Test-author and Builder paths are confined to their frozen files", () => {
  assert.strictEqual(path.basename(__filename), "approval-event-type-count.test.js"); assert.strictEqual(path.dirname(TOOL), path.join(__dirname, "..", "tools")); assert.strictEqual(fs.existsSync(TOOL), true, "Builder-owned command exists for protected-CI history checks");
});

test("AC9: Fixture E accepts opaque outbox values and an extra top-level scalar", () => {
  const serialized = [["E", FIXTURE_E], ["A", FIXTURE_A], ["B", FIXTURE_B], ["C", FIXTURE_C], ["D", FIXTURE_D], ...STRUCTURAL_INVALID]; for (let i = 1; i < serialized.length; i += 1) assert.notStrictEqual(serialized[0][1], serialized[i][1], `Fixture E and ${serialized[i][0]} are byte-distinct`);
  const dir = temp("ac9"); try { const fixture = write(dir, FIXTURE_E); const before = fileSnapshot(fixture); const entries = fs.readdirSync(dir).sort(); assertResult(run([fixture, "meeting"]), 0, '{"approvalsForEventType":1}\n', ""); assert.deepStrictEqual(fileSnapshot(fixture), before); assert.deepStrictEqual(fs.readdirSync(dir).sort(), entries); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TOOL = path.join(__dirname, "..", "tools", "outbox-approval-subject-count.js");
const TIMEOUT = 5_000;
const TARGET_APPROVAL = "TARGET-APPROVAL-MUST-NOT-LEAK";
const OTHER_APPROVAL = "OTHER-APPROVAL-MUST-NOT-LEAK";
const TARGET_SUBJECT = "TARGET-SUBJECT-MUST-NOT-LEAK";
const OTHER_SUBJECT = "OTHER-SUBJECT-QUERY-MUST-NOT-LEAK";
const USAGE = "usage: node app/tools/outbox-approval-subject-count.js <state-file> <approval-id> <subject>\n";
const READ = "outbox-approval-subject-count: cannot read state file\n";
const PARSE = "outbox-approval-subject-count: state file is not valid JSON\n";
const INVALID = "outbox-approval-subject-count: invalid Relay state\n";
const ONE = '{"outboxWithApprovalAndSubject":1}\n';
const ZERO = '{"outboxWithApprovalAndSubject":0}\n';

const FIXTURE_A_VALUE = {
  events: [{ payload: "EVENT-PAYLOAD-MUST-NOT-LEAK" }],
  jobs: [{ lastError: "JOB-ERROR-MUST-NOT-LEAK" }],
  approvals: [{ reason: "APPROVAL-REASON-MUST-NOT-LEAK" }],
  outbox: [
    { to: "RECIPIENT-BRAVO-MUST-NOT-LEAK", subject: TARGET_SUBJECT, body: "BODY-BRAVO-MUST-NOT-LEAK", approvalId: OTHER_APPROVAL, sentAt: "2026-08-25T12:00:00.000Z" },
    { to: "RECIPIENT-ALPHA-MUST-NOT-LEAK", subject: TARGET_SUBJECT, body: "BODY-ALPHA-MUST-NOT-LEAK", approvalId: TARGET_APPROVAL, sentAt: "2026-08-25T12:00:01.000Z" },
    { to: { private: "RECIPIENT-OBJECT-MUST-NOT-LEAK" }, subject: 7, body: ["BODY-ARRAY-MUST-NOT-LEAK"], approvalId: "OPAQUE-APPROVAL-MUST-NOT-LEAK", sentAt: "SENT-AT-NON-ISO-MUST-NOT-LEAK", ignoredDiagnostic: "IGNORED-OUTBOX-FIELD-MUST-NOT-LEAK" },
  ],
  metadata: { note: "TOP-LEVEL-METADATA-MUST-NOT-LEAK" },
};
const A = JSON.stringify(FIXTURE_A_VALUE, null, 2) + "\n";
const B = '{"events":[null],"jobs":[7],"approvals":["OPAQUE-SIBLING-APPROVAL-MUST-NOT-LEAK"],"outbox":[],"metadata":false}\n';
const C = '{"outbox":[],"payload":"MALFORMED-PAYLOAD-MUST-NOT-LEAK"\n';
const D = "";
const S = [
  ["S1", "null\n"], ["S2", "[]\n"], ["S3", '{"events":[],"jobs":[],"approvals":[]}\n'],
  ["S4", '{"events":{},"jobs":[],"approvals":[],"outbox":[]}\n'], ["S5", '{"events":[],"jobs":{},"approvals":[],"outbox":[]}\n'],
  ["S6", '{"events":[],"jobs":[],"approvals":{},"outbox":[]}\n'], ["S7", '{"events":[],"jobs":[],"approvals":[],"outbox":{}}\n'],
  ["S8", '{"events":[],"jobs":[],"approvals":[],"outbox":[null]}\n'], ["S9", '{"events":[],"jobs":[],"approvals":[],"outbox":[[]]}\n'],
  ["S10", '{"events":[],"jobs":[],"approvals":[],"outbox":[{"subject":"b","body":"c","approvalId":"appr-a","sentAt":"time-a"}]}\n'],
  ["S11", '{"events":[],"jobs":[],"approvals":[],"outbox":[{"to":"a","body":"c","approvalId":"appr-a","sentAt":"time-a"}]}\n'],
  ["S12", '{"events":[],"jobs":[],"approvals":[],"outbox":[{"to":"a","subject":"b","approvalId":"appr-a","sentAt":"time-a"}]}\n'],
  ["S13", '{"events":[],"jobs":[],"approvals":[],"outbox":[{"to":"a","subject":"b","body":"c","sentAt":"time-a"}]}\n'],
  ["S14", '{"events":[],"jobs":[],"approvals":[],"outbox":[{"to":"a","subject":"b","body":"c","approvalId":"","sentAt":"time-a"}]}\n'],
  ["S15", '{"events":[],"jobs":[],"approvals":[],"outbox":[{"to":"a","subject":"b","body":"c","approvalId":7,"sentAt":"time-a"}]}\n'],
  ["S16", '{"events":[],"jobs":[],"approvals":[],"outbox":[{"to":"a","subject":"b","body":"c","approvalId":"appr-a"}]}\n'],
  ["S17", '{"events":[],"jobs":[],"approvals":[],"outbox":[{"to":"a","subject":"b","body":"c","approvalId":"appr-a","sentAt":""}]}\n'],
  ["S18", '{"events":[],"jobs":[],"approvals":[],"outbox":[{"to":"a","subject":"b","body":"c","approvalId":"appr-a","sentAt":7}]}\n'],
  ["S19", '{"events":[],"jobs":[],"approvals":[],"outbox":[{"to":"a","subject":"b","body":"c","approvalId":"TARGET-APPROVAL-MUST-NOT-LEAK","sentAt":"time-a"},{"to":"d","subject":"e","body":"f","approvalId":"TARGET-APPROVAL-MUST-NOT-LEAK","sentAt":"time-b"}]}\n'],
  ["S20", '{"events":[],"jobs":[],"approvals":[],"outbox":[{"to":"a","subject":"TARGET-SUBJECT-MUST-NOT-LEAK","body":"c","approvalId":"TARGET-APPROVAL-MUST-NOT-LEAK","sentAt":"time-a"},{"to":"d","subject":"e","body":"f","approvalId":"appr-invalid-second"}]}\n'],
];
const TOKENS = ["EVENT-PAYLOAD-MUST-NOT-LEAK", "JOB-ERROR-MUST-NOT-LEAK", "APPROVAL-REASON-MUST-NOT-LEAK", TARGET_APPROVAL, OTHER_APPROVAL, "Target-APPROVAL-MUST-NOT-LEAK", " TARGET-APPROVAL-MUST-NOT-LEAK", "OPAQUE-APPROVAL-MUST-NOT-LEAK", TARGET_SUBJECT, "Target-SUBJECT-MUST-NOT-LEAK", " TARGET-SUBJECT-MUST-NOT-LEAK", OTHER_SUBJECT, "RECIPIENT-BRAVO-MUST-NOT-LEAK", "BODY-BRAVO-MUST-NOT-LEAK", "RECIPIENT-ALPHA-MUST-NOT-LEAK", "BODY-ALPHA-MUST-NOT-LEAK", "RECIPIENT-OBJECT-MUST-NOT-LEAK", "BODY-ARRAY-MUST-NOT-LEAK", "SENT-AT-NON-ISO-MUST-NOT-LEAK", "IGNORED-OUTBOX-FIELD-MUST-NOT-LEAK", "TOP-LEVEL-METADATA-MUST-NOT-LEAK", "OPAQUE-SIBLING-APPROVAL-MUST-NOT-LEAK", "MALFORMED-PAYLOAD-MUST-NOT-LEAK", "arity-state-MUST-NOT-LEAK", "PATH-MUST-NOT-LEAK", "DIRECTORY-MUST-NOT-LEAK", "2026-08-25T12:00:00.000Z", "2026-08-25T12:00:01.000Z"];

function temp(label) { return fs.mkdtempSync(path.join(os.tmpdir(), `relay-outbox-approval-subject-count-${label}-`)); }
function write(dir, contents) { const file = path.join(dir, "state.json"); fs.writeFileSync(file, contents); return file; }
function fingerprint(file) { const stat = fs.statSync(file, { bigint: true }); return { bytes: fs.readFileSync(file).toString("hex"), mode: stat.mode, size: stat.size, mtimeNs: stat.mtimeNs }; }
function directoryFingerprint(dir) { const stat = fs.statSync(dir, { bigint: true }); return { entries: entries(dir), mode: stat.mode, size: stat.size, mtimeNs: stat.mtimeNs }; }
function entries(dir) { return fs.readdirSync(dir).sort(); }
function run(args) {
  const child = spawnSync(process.execPath, [TOOL, ...args], { stdio: "pipe", timeout: TIMEOUT });
  assert.strictEqual(child.error, undefined, "child must not report an execution error");
  assert.strictEqual(child.signal, null, "child must self-terminate without a signal");
  const result = { status: child.status, stdout: child.stdout.toString("utf8"), stderr: child.stderr.toString("utf8"), stdoutBytes: child.stdout.length, stderrBytes: child.stderr.length };
  for (const token of TOKENS) { assert.strictEqual(result.stdout.includes(token) || result.stderr.includes(token), false, `output leaked ${token}`); }
  return result;
}
function assertResult(result, status, stdout, stderr, label) { assert.strictEqual(result.status, status, `${label} status`); assert.strictEqual(result.stdout, stdout, `${label} stdout`); assert.strictEqual(result.stderr, stderr, `${label} stderr`); assert.strictEqual(result.stdoutBytes, Buffer.byteLength(stdout), `${label} stdout bytes`); assert.strictEqual(result.stderrBytes, Buffer.byteLength(stderr), `${label} stderr bytes`); }
function withFixture(label, contents, fn) { const dir = temp(label); try { const file = write(dir, contents); const before = fingerprint(file); const parent = entries(dir); fn(file); assert.deepStrictEqual(fingerprint(file), before, `${label} leaves bytes and stat untouched`); assert.deepStrictEqual(entries(dir), parent, `${label} leaves parent untouched`); } finally { fs.rmSync(dir, { recursive: true, force: true }); } }
function specifiers(source) { return [...new Set([...source.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)].map(match => match[1]))].sort(); }
function fsOps(source) { const match = /\{([^}]*)\}\s*=\s*require\(\s*["']node:fs["']\s*\)/.exec(source); return match === null ? [] : [...new Set(match[1].split(",").map(part => part.split(":").pop().trim()).filter(Boolean))].sort(); }

test("AC1: target approval ID and subject produce one exact result twice without mutating Fixture A", () => {
  withFixture("ac1", A, file => { for (const attempt of [1, 2]) assertResult(run([file, TARGET_APPROVAL, TARGET_SUBJECT]), 0, ONE, "", `attempt ${attempt}`); });
});

test("AC2: the other approval ID with the shared subject produces its own exact one result", () => {
  withFixture("ac2", A, file => assertResult(run([file, OTHER_APPROVAL, TARGET_SUBJECT]), 0, ONE, "", "other pair"));
});

test("AC3: exact combined matching rejects independent, casing, whitespace, coercion, and empty-outbox nonmatches", () => {
  const queries = [[TARGET_APPROVAL, OTHER_SUBJECT], ["Target-APPROVAL-MUST-NOT-LEAK", TARGET_SUBJECT], [" TARGET-APPROVAL-MUST-NOT-LEAK", TARGET_SUBJECT], [TARGET_APPROVAL, "Target-SUBJECT-MUST-NOT-LEAK"], [TARGET_APPROVAL, " TARGET-SUBJECT-MUST-NOT-LEAK"], ["OPAQUE-APPROVAL-MUST-NOT-LEAK", "7"]];
  assert.notStrictEqual("Target-APPROVAL-MUST-NOT-LEAK", TARGET_APPROVAL, "case-distinct approval literal differs byte-for-byte");
  assert.notStrictEqual(" TARGET-APPROVAL-MUST-NOT-LEAK", TARGET_APPROVAL, "leading-space approval literal differs byte-for-byte");
  assert.notStrictEqual("Target-SUBJECT-MUST-NOT-LEAK", TARGET_SUBJECT, "case-distinct subject literal differs byte-for-byte");
  assert.notStrictEqual(" TARGET-SUBJECT-MUST-NOT-LEAK", TARGET_SUBJECT, "leading-space subject literal differs byte-for-byte");
  assert.strictEqual(typeof FIXTURE_A_VALUE.outbox[2].subject, "number", "numeric frozen subject remains a JSON number");
  assert.strictEqual("7", String(FIXTURE_A_VALUE.outbox[2].subject), "numeral-shaped argument is distinct in type from stored subject");
  for (const [approval, subject] of queries) { assert.strictEqual(approval === TARGET_APPROVAL && subject === TARGET_SUBJECT, false, "each frozen no-match pair differs from the target pair"); withFixture("ac3", A, file => assertResult(run([file, approval, subject]), 0, ZERO, "", `${approval}/${subject}`)); }
  withFixture("ac3-empty", B, file => assertResult(run([file, TARGET_APPROVAL, TARGET_SUBJECT]), 0, ZERO, "", "empty outbox"));
});

test("AC4: wrong arity and empty required arguments fail before candidate-path access", () => {
  for (const [label, tail] of [["zero", []], ["one", ["arity-state-MUST-NOT-LEAK.json"]], ["two", ["arity-state-MUST-NOT-LEAK.json", TARGET_APPROVAL]], ["four", ["arity-state-MUST-NOT-LEAK.json", TARGET_APPROVAL, TARGET_SUBJECT, "extra"]], ["empty-approval", ["arity-state-MUST-NOT-LEAK.json", "", TARGET_SUBJECT]], ["empty-subject", ["arity-state-MUST-NOT-LEAK.json", TARGET_APPROVAL, ""]], ["both-empty", ["arity-state-MUST-NOT-LEAK.json", "", ""]]]) { const dir = temp(`ac4-${label}`); try { const candidate = path.join(dir, "arity-state-MUST-NOT-LEAK.json"); const args = tail.map(value => value === "arity-state-MUST-NOT-LEAK.json" ? candidate : value); assertResult(run(args), 2, "", USAGE, label); assert.strictEqual(fs.existsSync(candidate), false, `${label} candidate remains absent`); assert.deepStrictEqual(entries(dir), [], `${label} parent remains empty`); } finally { fs.rmSync(dir, { recursive: true, force: true }); } }
});

test("AC5: absent and directory state paths return the redacted read failure without mutation", () => {
  const absentParent = temp("ac5-absent"); try { const absent = path.join(absentParent, "PATH-MUST-NOT-LEAK.json"); assertResult(run([absent, TARGET_APPROVAL, TARGET_SUBJECT]), 1, "", READ, "absent"); assert.strictEqual(fs.existsSync(absent), false); assert.deepStrictEqual(entries(absentParent), []); } finally { fs.rmSync(absentParent, { recursive: true, force: true }); }
  const directoryParent = temp("ac5-directory"); try { const directory = path.join(directoryParent, "DIRECTORY-MUST-NOT-LEAK"); fs.mkdirSync(directory); const before = directoryFingerprint(directory); assertResult(run([directory, TARGET_APPROVAL, TARGET_SUBJECT]), 1, "", READ, "directory"); assert.deepStrictEqual(directoryFingerprint(directory), before); } finally { fs.rmSync(directoryParent, { recursive: true, force: true }); }
});

test("AC6: truncated and zero-byte JSON return the redacted parse failure", () => {
  for (const [label, contents] of [["truncated", C], ["zero-byte", D]]) withFixture(`ac6-${label}`, contents, file => assertResult(run([file, TARGET_APPROVAL, TARGET_SUBJECT]), 1, "", PARSE, label));
});

test("AC7: all frozen structural-invalid fixtures fail before any matching receipt can be counted", () => {
  const all = [["A", A], ["B", B], ["C", C], ["D", D], ...S]; for (let i = 0; i < all.length; i += 1) for (let j = i + 1; j < all.length; j += 1) assert.notStrictEqual(all[i][1], all[j][1], `${all[i][0]} and ${all[j][0]} are byte-distinct`);
  const s20 = JSON.parse(S[19][1]); assert.strictEqual(s20.outbox[0].approvalId, TARGET_APPROVAL); assert.strictEqual(s20.outbox[0].subject, TARGET_SUBJECT); assert.strictEqual(Object.hasOwn(s20.outbox[1], "sentAt"), false);
  for (const [label, contents] of S) withFixture(`ac7-${label}`, contents, file => assertResult(run([file, TARGET_APPROVAL, TARGET_SUBJECT]), 1, "", INVALID, label));
});

test("AC8: the command and acceptance test stay inside the frozen offline source boundaries", () => {
  withFixture("ac8", A, file => assertResult(run([file, TARGET_APPROVAL, TARGET_SUBJECT]), 0, ONE, "", "timed command"));
  assert.strictEqual(fs.existsSync(TOOL), true, "builder command exists"); const source = fs.readFileSync(TOOL, "utf8"); assert.deepStrictEqual(specifiers(source), ["node:fs"]); assert.deepStrictEqual(fsOps(source), ["readFileSync"]);
  for (const forbidden of ["server.js", "fetch(", "WebSocket", "node:http", "node:https", "node:net", "node:child_process", "setTimeout", "setInterval"]) assert.strictEqual(source.includes(forbidden), false, `tool omits ${forbidden}`);
  assert.deepStrictEqual(specifiers(fs.readFileSync(__filename, "utf8")), ["node:assert", "node:child_process", "node:fs", "node:os", "node:path", "node:test"]);
});

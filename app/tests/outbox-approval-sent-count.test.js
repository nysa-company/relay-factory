const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TOOL = path.join(__dirname, "..", "tools", "outbox-approval-sent-count.js");
const TIMEOUT = 5_000;
const TARGET = "TARGET-APPROVAL-MUST-NOT-LEAK";
const OTHER = "OTHER-APPROVAL-MUST-NOT-LEAK";
const TARGET_TIME = "2026-08-24T12:00:01.000Z";
const OTHER_TIME = "2026-08-24T12:00:00.000Z";
const CASE_APPROVAL = "Target-APPROVAL-MUST-NOT-LEAK";
const SPACE_APPROVAL = " TARGET-APPROVAL-MUST-NOT-LEAK";
const CASE_TIME = "2026-08-24t12:00:01.000Z";
const SPACE_TIME = " 2026-08-24T12:00:01.000Z";
const ONE = '{"outboxWithApprovalAndSentAt":1}\n';
const ZERO = '{"outboxWithApprovalAndSentAt":0}\n';
const USAGE = "usage: node app/tools/outbox-approval-sent-count.js <state-file> <approval-id> <sent-at>\n";
const READ = "outbox-approval-sent-count: cannot read state file\n";
const PARSE = "outbox-approval-sent-count: state file is not valid JSON\n";
const INVALID = "outbox-approval-sent-count: invalid Relay state\n";
const TOKENS = [
  "EVENT-PAYLOAD-MUST-NOT-LEAK", "JOB-ERROR-MUST-NOT-LEAK", "APPROVAL-REASON-MUST-NOT-LEAK",
  TARGET, OTHER, CASE_APPROVAL, SPACE_APPROVAL,
  "RECIPIENT-BRAVO-MUST-NOT-LEAK", "SUBJECT-BRAVO-MUST-NOT-LEAK", "BODY-BRAVO-MUST-NOT-LEAK",
  "RECIPIENT-ALPHA-MUST-NOT-LEAK", "SUBJECT-ALPHA-MUST-NOT-LEAK", "BODY-ALPHA-MUST-NOT-LEAK",
  "RECIPIENT-OBJECT-MUST-NOT-LEAK", "SUBJECT-OBJECT-MUST-NOT-LEAK", "BODY-ARRAY-MUST-NOT-LEAK",
  "OPAQUE-APPROVAL-MUST-NOT-LEAK", "SENT-AT-NON-ISO-MUST-NOT-LEAK", "IGNORED-OUTBOX-FIELD-MUST-NOT-LEAK",
  "TOP-LEVEL-METADATA-MUST-NOT-LEAK", "OPAQUE-SIBLING-APPROVAL-MUST-NOT-LEAK",
  "MALFORMED-PAYLOAD-MUST-NOT-LEAK", "arity-state-MUST-NOT-LEAK", "PATH-MUST-NOT-LEAK",
  "DIRECTORY-MUST-NOT-LEAK", OTHER_TIME, TARGET_TIME, CASE_TIME,
];
const A_VALUE = { events: [{ payload: "EVENT-PAYLOAD-MUST-NOT-LEAK" }], jobs: [{ lastError: "JOB-ERROR-MUST-NOT-LEAK" }], approvals: [{ reason: "APPROVAL-REASON-MUST-NOT-LEAK" }], outbox: [
  { to: "RECIPIENT-BRAVO-MUST-NOT-LEAK", subject: "SUBJECT-BRAVO-MUST-NOT-LEAK", body: "BODY-BRAVO-MUST-NOT-LEAK", approvalId: OTHER, sentAt: OTHER_TIME },
  { to: "RECIPIENT-ALPHA-MUST-NOT-LEAK", subject: "SUBJECT-ALPHA-MUST-NOT-LEAK", body: "BODY-ALPHA-MUST-NOT-LEAK", approvalId: TARGET, sentAt: TARGET_TIME },
  { to: { private: "RECIPIENT-OBJECT-MUST-NOT-LEAK" }, subject: { private: "SUBJECT-OBJECT-MUST-NOT-LEAK" }, body: ["BODY-ARRAY-MUST-NOT-LEAK"], approvalId: "OPAQUE-APPROVAL-MUST-NOT-LEAK", sentAt: "SENT-AT-NON-ISO-MUST-NOT-LEAK", ignoredDiagnostic: "IGNORED-OUTBOX-FIELD-MUST-NOT-LEAK" },
], metadata: { note: "TOP-LEVEL-METADATA-MUST-NOT-LEAK" } };
const A = JSON.stringify(A_VALUE, null, 2) + "\n";
const B = '{"events":[null],"jobs":[7],"approvals":["OPAQUE-SIBLING-APPROVAL-MUST-NOT-LEAK"],"outbox":[],"metadata":false}\n';
const C = '{"outbox":[],"payload":"MALFORMED-PAYLOAD-MUST-NOT-LEAK"\n';
const STRUCTURAL = [
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
  ["S20", '{"events":[],"jobs":[],"approvals":[],"outbox":[{"to":"a","subject":"b","body":"c","approvalId":"TARGET-APPROVAL-MUST-NOT-LEAK","sentAt":"time-a"},{"to":"d","subject":"e","body":"f","approvalId":"appr-invalid-second"}]}\n'],
];

function dir(label) { return fs.mkdtempSync(path.join(os.tmpdir(), `relay-outbox-approval-sent-count-${label}-`)); }
function file(parent, content) { const result = path.join(parent, "state.json"); fs.writeFileSync(result, content); return result; }
function entries(parent) { return fs.readdirSync(parent).sort(); }
function snapFile(name) { const s = fs.statSync(name, { bigint: true }); return { bytes: fs.readFileSync(name).toString("hex"), mode: s.mode, size: s.size, mtimeNs: s.mtimeNs }; }
function snapDir(name) { const s = fs.statSync(name, { bigint: true }); return { entries: entries(name), mode: s.mode, size: s.size, mtimeNs: s.mtimeNs }; }
function run(args) {
  const result = spawnSync(process.execPath, [TOOL, ...args], { stdio: "pipe", timeout: TIMEOUT });
  assert.strictEqual(result.error, undefined, `child error: ${result.error && result.error.message}`);
  assert.strictEqual(result.signal, null, "child must not be signalled");
  const output = { status: result.status, stdout: result.stdout.toString(), stderr: result.stderr.toString(), stdoutBytes: result.stdout.length, stderrBytes: result.stderr.length };
  for (const token of TOKENS) { assert.strictEqual(output.stdout.includes(token), false, `stdout leaked ${token}`); assert.strictEqual(output.stderr.includes(token), false, `stderr leaked ${token}`); }
  return output;
}
function assertResult(result, status, stdout, stderr) { assert.strictEqual(result.status, status); assert.strictEqual(result.stdout, stdout); assert.strictEqual(result.stderr, stderr); assert.strictEqual(result.stdoutBytes, Buffer.byteLength(stdout)); assert.strictEqual(result.stderrBytes, Buffer.byteLength(stderr)); }
function withFixture(label, content, action) { const parent = dir(label); try { const state = file(parent, content); const before = snapFile(state); const parentBefore = entries(parent); action(state); assert.deepStrictEqual(snapFile(state), before); assert.deepStrictEqual(entries(parent), parentBefore); } finally { fs.rmSync(parent, { recursive: true, force: true }); } }
function specs(source) { return [...new Set([...source.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)].map(m => m[1]))].sort(); }
function fsOps(source) { return [...new Set([...source.matchAll(/\bfs\s*\.\s*([A-Za-z_$][\w$]*)/g)].map(m => m[1]))].sort(); }

test("AC1: two target compound-key invocations print one and preserve Fixture A", () => {
  withFixture("ac1", A, state => { for (let i = 0; i < 2; i += 1) assertResult(run([state, TARGET, TARGET_TIME]), 0, ONE, ""); });
});
test("AC2: the other stored compound key prints one and preserves Fixture A", () => {
  withFixture("ac2", A, state => assertResult(run([state, OTHER, OTHER_TIME]), 0, ONE, ""));
});
test("AC3: all nine frozen no-match pairs print zero and preserve their fixtures", () => {
  const ids = A_VALUE.outbox.map(row => row.approvalId); const times = A_VALUE.outbox.map(row => row.sentAt);
  for (const literal of [CASE_APPROVAL, SPACE_APPROVAL, "", CASE_TIME, SPACE_TIME, ""]) { for (const value of [...ids, ...times]) assert.notStrictEqual(literal, value); }
  assert.strictEqual(TARGET, A_VALUE.outbox[1].approvalId); assert.strictEqual(OTHER_TIME, A_VALUE.outbox[0].sentAt); assert.strictEqual(OTHER, A_VALUE.outbox[0].approvalId); assert.strictEqual(TARGET_TIME, A_VALUE.outbox[1].sentAt);
  const b = JSON.parse(B); assert.deepStrictEqual(b.outbox, []); assert.deepStrictEqual(b.events, [null]); assert.deepStrictEqual(b.jobs, [7]); assert.deepStrictEqual(b.approvals, ["OPAQUE-SIBLING-APPROVAL-MUST-NOT-LEAK"]); assert.strictEqual(b.metadata, false);
  const cases = [[A,TARGET,OTHER_TIME],[A,OTHER,TARGET_TIME],[A,TARGET,CASE_TIME],[A,TARGET,SPACE_TIME],[A,TARGET,""],[A,CASE_APPROVAL,TARGET_TIME],[A,SPACE_APPROVAL,TARGET_TIME],[A,"",TARGET_TIME],[B,TARGET,TARGET_TIME]];
  cases.forEach(([content, approval, sent], i) => withFixture(`ac3-${i}`, content, state => assertResult(run([state, approval, sent]), 0, ZERO, "")));
});
test("AC4: invalid arities return exact usage without touching absent candidates", () => {
  [[], ["one"], ["two", TARGET], ["four", TARGET, TARGET_TIME, "extra"]].forEach((parts, i) => { const parent = dir(`ac4-${i}`); try { const candidate = path.join(parent, "arity-state-MUST-NOT-LEAK.json"); const args = parts.map(p => p === "one" || p === "two" || p === "four" ? candidate : p); assertResult(run(args), 2, "", USAGE); assert.strictEqual(fs.existsSync(candidate), false); assert.deepStrictEqual(entries(parent), []); } finally { fs.rmSync(parent, {recursive:true,force:true}); } });
});
test("AC5: absent and directory paths return the redacted read error unchanged", () => {
  const missingParent = dir("ac5-missing"); try { const missing = path.join(missingParent, "PATH-MUST-NOT-LEAK.json"); assertResult(run([missing,TARGET,TARGET_TIME]),1,"",READ); assert.strictEqual(fs.existsSync(missing),false); assert.deepStrictEqual(entries(missingParent),[]); } finally { fs.rmSync(missingParent,{recursive:true,force:true}); }
  const parent = dir("ac5-directory"); try { const state = path.join(parent,"DIRECTORY-MUST-NOT-LEAK"); fs.mkdirSync(state); const before=snapDir(state); const parentBefore=entries(parent); assertResult(run([state,TARGET,TARGET_TIME]),1,"",READ); assert.strictEqual(fs.statSync(state).isDirectory(),true); assert.deepStrictEqual(snapDir(state),before); assert.deepStrictEqual(entries(parent),parentBefore); } finally { fs.rmSync(parent,{recursive:true,force:true}); }
});
test("AC6: malformed and zero-byte JSON return the redacted parse error unchanged", () => {
  [C, ""].forEach((content, i) => withFixture(`ac6-${i}`, content, state => assertResult(run([state,TARGET,TARGET_TIME]),1,"",PARSE)));
});
test("AC7: every frozen structural-invalid fixture rejects before matching", () => {
  const all = [A,B,C,"",...STRUCTURAL.map(([,value])=>value)]; for (let i=0;i<all.length;i+=1) for(let j=i+1;j<all.length;j+=1) assert.notStrictEqual(all[i],all[j]);
  const s19=JSON.parse(STRUCTURAL[18][1]); assert.strictEqual(s19.outbox[0].approvalId,s19.outbox[1].approvalId); assert.notStrictEqual(s19.outbox[0].sentAt,s19.outbox[1].sentAt);
  const s20=JSON.parse(STRUCTURAL[19][1]); assert.strictEqual(s20.outbox[0].approvalId,TARGET); assert.strictEqual(s20.outbox[0].sentAt,"time-a"); assert.strictEqual(Object.hasOwn(s20.outbox[1],"sentAt"),false);
  STRUCTURAL.forEach(([label,content]) => withFixture(`ac7-${label}`,content,state=>assertResult(run([state,TARGET,"time-a"]),1,"",INVALID)));
  [ ["", "time-a"], [TARGET, ""] ].forEach((pair,i)=>withFixture(`ac7-empty-${i}`,STRUCTURAL[19][1],state=>assertResult(run([state,...pair]),1,"",INVALID)));
});
test("AC8: every child terminates within 5000 ms and source boundaries are exact", () => {
  withFixture("ac8", A, state => assertResult(run([state,TARGET,TARGET_TIME]),0,ONE,""));
  assert.strictEqual(fs.existsSync(TOOL), true); const tool = fs.readFileSync(TOOL,"utf8");
  assert.deepStrictEqual(specs(tool),["node:fs"]); assert.deepStrictEqual(fsOps(tool),["readFileSync"]);
  ["server.js","fetch(","WebSocket","node:http","node:https","node:net","node:child_process","setTimeout","setInterval"].forEach(value=>assert.strictEqual(tool.includes(value),false));
  assert.deepStrictEqual(specs(fs.readFileSync(__filename,"utf8")),["node:assert","node:child_process","node:fs","node:os","node:path","node:test"]);
});

const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TOOL = path.join(__dirname, "..", "tools", "job-status-error-count.js");
const TIMEOUT = 5_000;
const USAGE = "usage: node app/tools/job-status-error-count.js <state-file> <status>\n";
const READ = "job-status-error-count: cannot read state file\n";
const PARSE = "job-status-error-count: state file is not valid JSON\n";
const INVALID = "job-status-error-count: invalid Relay state\n";
const TWO = '{"jobsWithStatusAndError":2}\n';
const ONE = '{"jobsWithStatusAndError":1}\n';
const ZERO = '{"jobsWithStatusAndError":0}\n';

const TOKENS = [
  "OPAQUE-EVENT-ID-MUST-NOT-LEAK", "EVENT-PAYLOAD-MUST-NOT-LEAK",
  "JOB-ID-DEAD-TEXT-MUST-NOT-LEAK", "EVENT-ID-DEAD-TEXT-MUST-NOT-LEAK",
  "DEAD-TEXT-ERROR-MUST-NOT-LEAK", "JOB-ID-DEAD-NULL-MUST-NOT-LEAK",
  "EVENT-ID-DEAD-NULL-MUST-NOT-LEAK", "JOB-ID-DEAD-EMPTY-MUST-NOT-LEAK",
  "EVENT-ID-DEAD-EMPTY-MUST-NOT-LEAK", "JOB-ID-DEAD-SPACE-MUST-NOT-LEAK",
  "EVENT-ID-DEAD-SPACE-MUST-NOT-LEAK", "IGNORED-JOB-FIELD-MUST-NOT-LEAK",
  "JOB-ID-PENDING-TEXT-MUST-NOT-LEAK", "EVENT-ID-PENDING-TEXT-MUST-NOT-LEAK",
  "PENDING-TEXT-ERROR-MUST-NOT-LEAK", "JOB-ID-DONE-TEXT-MUST-NOT-LEAK",
  "EVENT-ID-DONE-TEXT-MUST-NOT-LEAK", "DONE-TEXT-ERROR-MUST-NOT-LEAK",
  "APPROVAL-ACTION-MUST-NOT-LEAK", "OUTBOX-CONTENT-MUST-NOT-LEAK",
  "OPAQUE-ERROR-MUST-NOT-LEAK", "OPAQUE-CONTENT-MUST-NOT-LEAK",
  "MALFORMED-PAYLOAD-MUST-NOT-LEAK", "arity-state-MUST-NOT-LEAK.json",
  "arity-state-MUST-NOT-LEAK", "PATH-MUST-NOT-LEAK.json",
  "PATH-MUST-NOT-LEAK", "DIRECTORY-MUST-NOT-LEAK",
];

const A_VALUE = { events: [{ id: "OPAQUE-EVENT-ID-MUST-NOT-LEAK", payload: { private: "EVENT-PAYLOAD-MUST-NOT-LEAK" } }], jobs: [
  { id: "JOB-ID-DEAD-TEXT-MUST-NOT-LEAK", eventId: "EVENT-ID-DEAD-TEXT-MUST-NOT-LEAK", status: "dead", attempts: 3, lastError: "DEAD-TEXT-ERROR-MUST-NOT-LEAK", retries: 0, attemptsSinceRetry: 3 },
  { id: "JOB-ID-DEAD-NULL-MUST-NOT-LEAK", eventId: "EVENT-ID-DEAD-NULL-MUST-NOT-LEAK", status: "dead", attempts: 3, lastError: null, retries: 0, attemptsSinceRetry: 3 },
  { id: "JOB-ID-DEAD-EMPTY-MUST-NOT-LEAK", eventId: "EVENT-ID-DEAD-EMPTY-MUST-NOT-LEAK", status: "dead", attempts: 3, lastError: "", retries: 1, attemptsSinceRetry: 3 },
  { id: "JOB-ID-DEAD-SPACE-MUST-NOT-LEAK", eventId: "EVENT-ID-DEAD-SPACE-MUST-NOT-LEAK", status: "dead", attempts: 3, lastError: " ", retries: 0, attemptsSinceRetry: 3, ignoredDiagnostic: "IGNORED-JOB-FIELD-MUST-NOT-LEAK" },
  { id: "JOB-ID-PENDING-TEXT-MUST-NOT-LEAK", eventId: "EVENT-ID-PENDING-TEXT-MUST-NOT-LEAK", status: "pending", attempts: 1, lastError: "PENDING-TEXT-ERROR-MUST-NOT-LEAK", retries: 0, attemptsSinceRetry: 1 },
  { id: "JOB-ID-DONE-TEXT-MUST-NOT-LEAK", eventId: "EVENT-ID-DONE-TEXT-MUST-NOT-LEAK", status: "done", attempts: 4, lastError: "DONE-TEXT-ERROR-MUST-NOT-LEAK", retries: 1, attemptsSinceRetry: 1 },
], approvals: [{ action: { body: "APPROVAL-ACTION-MUST-NOT-LEAK" } }], outbox: [{ body: "OUTBOX-CONTENT-MUST-NOT-LEAK" }] };
const A = JSON.stringify(A_VALUE, null, 2) + "\n";
const B = '{"events":[null],"jobs":[{"id":"job-b-null","eventId":"event-b-null","status":"dead","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0},{"id":"job-b-empty","eventId":"event-b-empty","status":"dead","attempts":0,"lastError":"","retries":0,"attemptsSinceRetry":0},{"id":"job-b-wrong-status","eventId":"event-b-wrong-status","status":"pending","attempts":0,"lastError":"OPAQUE-ERROR-MUST-NOT-LEAK","retries":0,"attemptsSinceRetry":0}],"approvals":[7],"outbox":["OPAQUE-CONTENT-MUST-NOT-LEAK"]}\n';
const C = '{"jobs":[],"payload":"MALFORMED-PAYLOAD-MUST-NOT-LEAK"\n';
const S = [
  ["S1", "null\n"], ["S2", "[]\n"], ["S3", '{"events":{},"jobs":[],"approvals":[],"outbox":[]}\n'], ["S4", '{"events":[],"jobs":{},"approvals":[],"outbox":[]}\n'], ["S5", '{"events":[],"jobs":[],"approvals":{},"outbox":[]}\n'], ["S6", '{"events":[],"jobs":[],"approvals":[],"outbox":{}}\n'], ["S7", '{"events":[],"jobs":[],"approvals":[],"outbox":[],"metadata":[]}\n'], ["S8", '{"events":[],"jobs":[],"approvals":[]}\n'], ["S9", '{"events":[],"jobs":[null],"approvals":[],"outbox":[]}\n'], ["S10", '{"events":[],"jobs":[[]],"approvals":[],"outbox":[]}\n'],
  ["S11", '{"events":[],"jobs":[{"eventId":"event-a","status":"dead","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0}],"approvals":[],"outbox":[]}\n'], ["S12", '{"events":[],"jobs":[{"id":"","eventId":"event-a","status":"dead","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0}],"approvals":[],"outbox":[]}\n'], ["S13", '{"events":[],"jobs":[{"id":7,"eventId":"event-a","status":"dead","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0}],"approvals":[],"outbox":[]}\n'], ["S14", '{"events":[],"jobs":[{"id":"job-a","status":"dead","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0}],"approvals":[],"outbox":[]}\n'], ["S15", '{"events":[],"jobs":[{"id":"job-a","eventId":"event-invalid","status":"DEAD","attempts":3,"lastError":"x","retries":0,"attemptsSinceRetry":3}],"approvals":[],"outbox":[]}\n'],
  ["S16", '{"events":[],"jobs":[{"id":"job-a","eventId":"event-a","status":null,"attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0}],"approvals":[],"outbox":[]}\n'], ["S17", '{"events":[],"jobs":[{"id":"job-a","eventId":"event-a","status":"dead","attempts":-1,"lastError":null,"retries":0,"attemptsSinceRetry":3}],"approvals":[],"outbox":[]}\n'], ["S18", '{"events":[],"jobs":[{"id":"job-a","eventId":"event-a","status":"pending","attempts":0.5,"lastError":null,"retries":0,"attemptsSinceRetry":0}],"approvals":[],"outbox":[]}\n'], ["S19", '{"events":[],"jobs":[{"id":"job-a","eventId":"event-a","status":"dead","attempts":3,"lastError":null,"retries":-1,"attemptsSinceRetry":3}],"approvals":[],"outbox":[]}\n'], ["S20", '{"events":[],"jobs":[{"id":"job-a","eventId":"event-a","status":"pending","attempts":0,"lastError":null,"retries":"0","attemptsSinceRetry":0}],"approvals":[],"outbox":[]}\n'],
  ["S21", '{"events":[],"jobs":[{"id":"job-a","eventId":"event-a","status":"dead","attempts":3,"lastError":null,"retries":0,"attemptsSinceRetry":-1}],"approvals":[],"outbox":[]}\n'], ["S22", '{"events":[],"jobs":[{"id":"job-a","eventId":"event-a","status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":null}],"approvals":[],"outbox":[]}\n'], ["S23", '{"events":[],"jobs":[{"id":"job-a","eventId":"event-a","status":"dead","attempts":3,"lastError":7,"retries":0,"attemptsSinceRetry":3}],"approvals":[],"outbox":[]}\n'], ["S24", '{"events":[],"jobs":[{"id":"job-duplicate","eventId":"event-a","status":"dead","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0},{"id":"job-duplicate","eventId":"event-b","status":"done","attempts":1,"lastError":null,"retries":0,"attemptsSinceRetry":1}],"approvals":[],"outbox":[]}\n'], ["S25", '{"events":[],"jobs":[{"id":"job-valid-first","eventId":"event-valid","status":"dead","attempts":3,"lastError":"count-me","retries":0,"attemptsSinceRetry":3},{"id":"job-invalid-second","eventId":"event-invalid","status":"dead","attempts":3,"lastError":false,"retries":0,"attemptsSinceRetry":3}],"approvals":[],"outbox":[]}\n'],
];

function temp(label) { return fs.mkdtempSync(path.join(os.tmpdir(), `relay-job-status-error-count-${label}-`)); }
function file(dir, contents) { const target = path.join(dir, "state.json"); fs.writeFileSync(target, contents); return target; }
function entries(dir) { return fs.readdirSync(dir).sort(); }
function fingerprint(target) { const stat = fs.statSync(target, { bigint: true }); return { bytes: fs.readFileSync(target).toString("hex"), mode: stat.mode, size: stat.size, mtimeNs: stat.mtimeNs }; }
function directoryFingerprint(target) { const stat = fs.statSync(target, { bigint: true }); return { entries: entries(target), mode: stat.mode, size: stat.size, mtimeNs: stat.mtimeNs }; }
function run(args) { const result = spawnSync(process.execPath, [TOOL, ...args], { stdio: "pipe", timeout: TIMEOUT }); assert.strictEqual(result.error, undefined); assert.strictEqual(result.signal, null); const stdout = result.stdout.toString(); const stderr = result.stderr.toString(); for (const token of TOKENS) { assert.strictEqual(stdout.includes(token), false, `stdout leaked ${token}`); assert.strictEqual(stderr.includes(token), false, `stderr leaked ${token}`); } return { status: result.status, stdout, stderr, stdoutBytes: result.stdout.length, stderrBytes: result.stderr.length }; }
function assertResult(result, status, stdout, stderr) { assert.strictEqual(result.status, status); assert.strictEqual(result.stdout, stdout); assert.strictEqual(result.stderr, stderr); assert.strictEqual(result.stdoutBytes, Buffer.byteLength(stdout)); assert.strictEqual(result.stderrBytes, Buffer.byteLength(stderr)); }
function withFile(label, contents, action) { const dir = temp(label); try { const target = file(dir, contents); action(dir, target); } finally { fs.rmSync(dir, { recursive: true, force: true }); } }
function specifiers(source) { return [...source.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)].map(match => match[1]).filter((value, index, values) => values.indexOf(value) === index).sort(); }
function fsOperations(source) { const destructured = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\(\s*["']node:fs["']\s*\)/.exec(source); if (destructured) return destructured[1].split(",").map(part => part.split(":").pop().trim()).filter(Boolean).sort(); return [...source.matchAll(/\bfs\s*\.\s*([A-Za-z_$][\w$]*)/g)].map(match => match[1]).filter((value, index, values) => values.indexOf(value) === index).sort(); }

test("AC1: dead status counts only non-empty text and space errors twice without changing Fixture A", () => withFile("ac1", A, (dir, target) => {
  const parsed = JSON.parse(A); assert.deepStrictEqual(parsed.jobs.filter(job => job.status === "dead" && typeof job.lastError === "string" && job.lastError.length > 0).map(job => job.lastError), ["DEAD-TEXT-ERROR-MUST-NOT-LEAK", " "]);
  const before = fingerprint(target); const parent = entries(dir);
  for (let invocation = 0; invocation < 2; invocation += 1) { assertResult(run([target, "dead"]), 0, TWO, ""); assert.deepStrictEqual(fingerprint(target), before); assert.deepStrictEqual(entries(dir), parent); }
}));

test("AC2: pending and done each count one conjunctive match without changing Fixture A", () => {
  for (const status of ["pending", "done"]) withFile(`ac2-${status}`, A, (dir, target) => { const before = fingerprint(target); const parent = entries(dir); assertResult(run([target, status]), 0, ONE, ""); assert.deepStrictEqual(fingerprint(target), before); assert.deepStrictEqual(entries(dir), parent); });
});

test("AC3: Fixture B has all frozen non-counting forms and yields zero without mutation", () => withFile("ac3", B, (dir, target) => {
  const parsed = JSON.parse(B); assert.deepStrictEqual(parsed.jobs.map(job => [job.status, job.lastError]), [["dead", null], ["dead", ""], ["pending", "OPAQUE-ERROR-MUST-NOT-LEAK"]]); assert.deepStrictEqual(parsed.events, [null]); assert.deepStrictEqual(parsed.approvals, [7]); assert.deepStrictEqual(parsed.outbox, ["OPAQUE-CONTENT-MUST-NOT-LEAK"]);
  const before = fingerprint(target); const parent = entries(dir); assertResult(run([target, "dead"]), 0, ZERO, ""); assert.deepStrictEqual(fingerprint(target), before); assert.deepStrictEqual(entries(dir), parent);
}));

test("AC4: case, whitespace, and empty status literals match no Fixture A status", () => {
  for (const literal of ["Dead", " dead", ""]) { assert.strictEqual(A_VALUE.jobs.some(job => job.status === literal), false); withFile(`ac4-${literal.length}`, A, (dir, target) => { const before = fingerprint(target); const parent = entries(dir); assertResult(run([target, literal]), 0, ZERO, ""); assert.deepStrictEqual(fingerprint(target), before); assert.deepStrictEqual(entries(dir), parent); }); }
});

test("AC5: invalid arities return usage before reading or creating candidate paths", () => {
  for (const [label, args] of [["zero", []], ["one", null], ["three", null]]) { const dir = temp(`ac5-${label}`); try { const candidate = path.join(dir, "arity-state-MUST-NOT-LEAK.json"); const supplied = label === "zero" ? args : label === "one" ? [candidate] : [candidate, "dead", "extra"]; assertResult(run(supplied), 2, "", USAGE); assert.strictEqual(fs.existsSync(candidate), false); assert.deepStrictEqual(entries(dir), []); } finally { fs.rmSync(dir, { recursive: true, force: true }); } }
});

test("AC6: absent and directory paths return fixed read failures without mutation", () => {
  const absentParent = temp("ac6-absent"); try { const target = path.join(absentParent, "PATH-MUST-NOT-LEAK.json"); const before = entries(absentParent); assertResult(run([target, "dead"]), 1, "", READ); assert.strictEqual(fs.existsSync(target), false); assert.deepStrictEqual(entries(absentParent), before); } finally { fs.rmSync(absentParent, { recursive: true, force: true }); }
  const directoryParent = temp("ac6-directory"); try { const target = path.join(directoryParent, "DIRECTORY-MUST-NOT-LEAK"); fs.mkdirSync(target); const before = directoryFingerprint(target); const parent = entries(directoryParent); assertResult(run([target, "dead"]), 1, "", READ); assert.strictEqual(fs.statSync(target).isDirectory(), true); assert.deepStrictEqual(directoryFingerprint(target), before); assert.deepStrictEqual(entries(directoryParent), parent); } finally { fs.rmSync(directoryParent, { recursive: true, force: true }); }
});

test("AC7: malformed and zero-byte fixtures return the fixed JSON error without changing bytes", () => {
  for (const [label, contents] of [["c", C], ["d", ""]]) withFile(`ac7-${label}`, contents, (dir, target) => { const before = fingerprint(target); const parent = entries(dir); assertResult(run([target, "dead"]), 1, "", PARSE); assert.deepStrictEqual(fingerprint(target), before); assert.deepStrictEqual(entries(dir), parent); });
});

test("AC8: every frozen structural-invalid fixture is rejected after complete validation", () => {
  const all = [["A", A], ["B", B], ["C", C], ["D", ""], ...S]; for (let i = 0; i < all.length; i += 1) for (let j = i + 1; j < all.length; j += 1) assert.notStrictEqual(all[i][1], all[j][1]);
  assert.strictEqual(JSON.parse(S.find(row => row[0] === "S15")[1]).jobs[0].status, "DEAD"); assert.notStrictEqual("DEAD", "dead"); const s25 = JSON.parse(S.find(row => row[0] === "S25")[1]).jobs; assert.strictEqual(s25[0].lastError, "count-me"); assert.strictEqual(s25[1].lastError, false);
  for (const [label, contents] of S) withFile(`ac8-${label}`, contents, (dir, target) => { const before = fingerprint(target); const parent = entries(dir); assertResult(run([target, "dead"]), 1, "", INVALID); assert.deepStrictEqual(fingerprint(target), before); assert.deepStrictEqual(entries(dir), parent); });
});

test("AC9: child calls have the frozen timeout and production and test source boundaries", () => {
  withFile("ac9", A, (_dir, target) => assertResult(run([target, "dead"]), 0, TWO, ""));
  assert.strictEqual(fs.existsSync(TOOL), true); const source = fs.readFileSync(TOOL, "utf8"); assert.deepStrictEqual(specifiers(source), ["node:fs"]); assert.deepStrictEqual(fsOperations(source), ["readFileSync"]); for (const forbidden of ["server.js", "fetch(", "WebSocket", "node:http", "node:https", "node:net", "node:child_process", "setTimeout", "setInterval"]) assert.strictEqual(source.includes(forbidden), false); assert.deepStrictEqual(specifiers(fs.readFileSync(__filename, "utf8")), ["node:assert", "node:child_process", "node:fs", "node:os", "node:path", "node:test"]);
});

test("AC10: tests-first history preserves the two owned paths and post-implementation verification commands", () => {
  const root = path.join(__dirname, "..", ".."); const history = spawnSync("git", ["log", "--format=%H", "--all"], { cwd: root, encoding: "utf8" }); assert.strictEqual(history.status, 0); const commits = history.stdout.trim().split("\n"); const changedPaths = commit => { const changed = spawnSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", commit], { cwd: root, encoding: "utf8" }); assert.strictEqual(changed.status, 0); return changed.stdout.trim().split("\n").filter(Boolean); }; const testCommit = commits.find(commit => changedPaths(commit).includes("app/tests/job-status-error-count.test.js")); const builderCommit = commits.find(commit => changedPaths(commit).includes("app/tools/job-status-error-count.js")); assert.notStrictEqual(testCommit, undefined); assert.notStrictEqual(builderCommit, undefined); assert.ok(commits.indexOf(testCommit) > commits.indexOf(builderCommit)); assert.deepStrictEqual(changedPaths(testCommit).filter(name => !name.startsWith("factory/tickets/")), ["app/tests/job-status-error-count.test.js"]); assert.deepStrictEqual(changedPaths(builderCommit).filter(name => !name.startsWith("factory/tickets/")), ["app/tools/job-status-error-count.js"]);
});

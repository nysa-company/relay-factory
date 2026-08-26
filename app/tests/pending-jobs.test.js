const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const TOOL = path.join(__dirname, "..", "tools", "pending-jobs.js");
const TIMEOUT = 10_000;
const USAGE = "usage: node app/tools/pending-jobs.js <state-file>\n";
const UNREADABLE = "pending-jobs: state file is unreadable\n";
const NOT_JSON = "pending-jobs: state file is not valid JSON\n";
const INVALID = "pending-jobs: state file has invalid Relay state\n";
const EMPTY = "[]\n";

const A_VALUE = {
  events: [
    { id: "Zulu-event", type: "generic", payload: { private: "EVENT-PAYLOAD-SENTINEL" }, receivedAt: "2026-08-26T18:00:00.000Z" },
    { id: "alpha-event", type: "email", payload: {}, receivedAt: "2026-08-26T18:00:01.000Z" },
    { id: "middle-event", type: "meeting", payload: {}, receivedAt: "2026-08-26T18:00:02.000Z" },
    { id: "omega-event", type: "generic", payload: { failTimes: 99 }, receivedAt: "2026-08-26T18:00:03.000Z" },
    { id: "extra-field-event", type: "generic", payload: {}, receivedAt: "2026-08-26T18:00:04.000Z" },
  ],
  jobs: [
    { id: "job-Zulu-event", eventId: "Zulu-event", status: "pending", attempts: 3, lastError: "PENDING-LASTERROR-SENTINEL", retries: 1, attemptsSinceRetry: 0 },
    { id: "job-alpha-event", eventId: "alpha-event", status: "pending", attempts: 0, lastError: null, retries: 0, attemptsSinceRetry: 0 },
    { id: "job-middle-event", eventId: "middle-event", status: "done", attempts: 1, lastError: null, retries: 0, attemptsSinceRetry: 1 },
    { id: "job-omega-event", eventId: "omega-event", status: "dead", attempts: 3, lastError: "DEAD-LASTERROR-SENTINEL", retries: 0, attemptsSinceRetry: 3 },
    { id: "job-extra-field-event", eventId: "extra-field-event", status: "pending", attempts: 1, lastError: "EXTRA-FIELD-LASTERROR-SENTINEL", retries: 0, attemptsSinceRetry: 1, ignoredDiagnostic: "IGNORED-JOB-FIELD-SENTINEL" },
  ],
  approvals: [{ id: "appr-middle-event", jobId: "job-middle-event", action: { to: "test@example.com", subject: "Middle action", body: "APPROVAL-ACTION-SENTINEL" }, status: "sent", proposedAt: "2026-08-26T18:00:05.000Z" }],
  outbox: [{ to: "test@example.com", subject: "Middle action", body: "OUTBOX-CONTENT-SENTINEL", approvalId: "appr-middle-event", sentAt: "2026-08-26T18:00:06.000Z" }],
};
const A = JSON.stringify(A_VALUE, null, 2) + "\n";
const A_OUT = '[{"id":"job-Zulu-event","eventId":"Zulu-event","attempts":3,"retries":1},{"id":"job-alpha-event","eventId":"alpha-event","attempts":0,"retries":0},{"id":"job-extra-field-event","eventId":"extra-field-event","attempts":1,"retries":0}]\n';
const B = '{"events":[],"private":"PENDING-JOBS-MALFORMED-SENTINEL';
const C = '{"events":[],"jobs":[],"approvals":[],"outbox":[]}\n';
const D = '{"events":[],"jobs":[{"id":"job-done-only","eventId":"event-done-only","status":"done","attempts":1,"lastError":null,"retries":0,"attemptsSinceRetry":1},{"id":"job-dead-only","eventId":"event-dead-only","status":"dead","attempts":3,"lastError":"ALL-NON-PENDING-LASTERROR-SENTINEL","retries":0,"attemptsSinceRetry":3}],"approvals":[],"outbox":[]}\n';
const E = '{"events":[],"jobs":[{"id":"job-😀","eventId":"event-emoji-sentinel","status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0},{"id":"job-�","eventId":"event-replacement-sentinel","status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0}],"approvals":[],"outbox":[]}\n';
const E_OUT = '[{"id":"job-😀","eventId":"event-emoji-sentinel","attempts":0,"retries":0},{"id":"job-�","eventId":"event-replacement-sentinel","attempts":0,"retries":0}]\n';
const F = '{"events":[{"malformed":true},"not-an-object",42,null],"jobs":[{"id":"job-opaque-event","eventId":"opaque-event","status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0}],"approvals":[{"missing":"fields"},null],"outbox":["ARBITRARY-OPAQUE-OUTBOX-SENTINEL",42]}\n';
const F_OUT = '[{"id":"job-opaque-event","eventId":"opaque-event","attempts":0,"retries":0}]\n';
const SENTINELS = ["EVENT-PAYLOAD-SENTINEL", "PENDING-LASTERROR-SENTINEL", "DEAD-LASTERROR-SENTINEL", "EXTRA-FIELD-LASTERROR-SENTINEL", "IGNORED-JOB-FIELD-SENTINEL", "APPROVAL-ACTION-SENTINEL", "OUTBOX-CONTENT-SENTINEL", "ALL-NON-PENDING-LASTERROR-SENTINEL", "PENDING-JOBS-MALFORMED-SENTINEL", "PATH-SENTINEL", "DIRECTORY-PATH-SENTINEL", "ARBITRARY-OPAQUE-OUTBOX-SENTINEL"];

const S = [
  ["S1", "null\n"], ["S2", "[]\n"],
  ["S3", '{"events":{},"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S4", '{"events":[],"jobs":{},"approvals":[],"outbox":[]}\n'],
  ["S5", '{"events":[],"jobs":[],"approvals":{},"outbox":[]}\n'],
  ["S6", '{"events":[],"jobs":[],"approvals":[],"outbox":{}}\n'],
  ["S7", '{"events":[],"jobs":[],"approvals":[],"outbox":[],"metadata":[]}\n'],
  ["S8", '{"events":[],"jobs":[],"approvals":[]}\n'],
  ["S9", '{"events":[],"jobs":[null],"approvals":[],"outbox":[]}\n'],
  ["S10", '{"events":[],"jobs":[[]],"approvals":[],"outbox":[]}\n'],
  ["S11", invalidJob('{"id":"","eventId":"s-event-invalid","status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0}')],
  ["S12", invalidJob('{"id":7,"eventId":"s-event-invalid","status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0}')],
  ["S13", invalidJob('{"id":"s-job-invalid-event-empty","eventId":"","status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0}')],
  ["S14", invalidJob('{"id":"s-job-invalid-event-type","eventId":7,"status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0}')],
  ["S15", invalidJob('{"id":"s-job-invalid-status-case","eventId":"s-event-invalid","status":"PENDING","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0}')],
  ["S16", invalidJob('{"id":"s-job-invalid-status-type","eventId":"s-event-invalid","status":null,"attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0}')],
  ["S17", invalidJob('{"id":"s-job-invalid-attempts-negative","eventId":"s-event-invalid","status":"dead","attempts":-1,"lastError":null,"retries":0,"attemptsSinceRetry":3}')],
  ["S18", invalidJob('{"id":"s-job-invalid-attempts-type","eventId":"s-event-invalid","status":"pending","attempts":0.5,"lastError":null,"retries":0,"attemptsSinceRetry":0}')],
  ["S19", invalidJob('{"id":"s-job-invalid-retries-negative","eventId":"s-event-invalid","status":"dead","attempts":3,"lastError":null,"retries":-1,"attemptsSinceRetry":3}')],
  ["S20", invalidJob('{"id":"s-job-invalid-retries-type","eventId":"s-event-invalid","status":"pending","attempts":0,"lastError":null,"retries":"0","attemptsSinceRetry":0}')],
  ["S21", invalidJob('{"id":"s-job-invalid-window-negative","eventId":"s-event-invalid","status":"dead","attempts":3,"lastError":null,"retries":0,"attemptsSinceRetry":-1}')],
  ["S22", invalidJob('{"id":"s-job-invalid-window-type","eventId":"s-event-invalid","status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":null}')],
  ["S23", invalidJob('{"id":"s-job-invalid-error","eventId":"s-event-invalid","status":"dead","attempts":3,"lastError":7,"retries":0,"attemptsSinceRetry":3}')],
  ["S24", '{"events":[],"jobs":[{"id":"s-job-duplicate","eventId":"s-event-a","status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0},{"id":"s-job-duplicate","eventId":"s-event-b","status":"done","attempts":1,"lastError":null,"retries":0,"attemptsSinceRetry":1}],"approvals":[],"outbox":[]}\n'],
  ["S25", '{"events":[],"jobs":[{"id":"s-job-event-dup-a","eventId":"s-event-duplicate","status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0},{"id":"s-job-event-dup-b","eventId":"s-event-duplicate","status":"done","attempts":1,"lastError":null,"retries":0,"attemptsSinceRetry":1}],"approvals":[],"outbox":[]}\n'],
  ["S26", '{"events":[],"jobs":[{"id":"s-job-valid-pending","eventId":"s-event-valid-pending","status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0},{"id":"s-job-invalid-missing-attempts","eventId":"s-event-invalid","status":"pending","lastError":null,"retries":0,"attemptsSinceRetry":0}],"approvals":[],"outbox":[]}\n'],
];

function invalidJob(job) { return `{"events":[],"jobs":[${job}],"approvals":[],"outbox":[]}\n`; }
function dir(label) { return fs.mkdtempSync(path.join(os.tmpdir(), `relay-pending-jobs-${label}-`)); }
function write(parent, name, contents) { const file = path.join(parent, name); fs.writeFileSync(file, contents); return file; }
function fileSnapshot(file) { const s = fs.statSync(file, { bigint: true }); return { bytes: fs.readFileSync(file).toString("hex"), mode: s.mode, size: s.size, mtimeNs: s.mtimeNs }; }
function directorySnapshot(parent) { const s = fs.statSync(parent, { bigint: true }); return { isDirectory: s.isDirectory(), entries: fs.readdirSync(parent).sort(), mode: s.mode, size: s.size, mtimeNs: s.mtimeNs }; }
function run(args) { const r = spawnSync(process.execPath, [TOOL, ...args], { stdio: "pipe", timeout: TIMEOUT }); assert.strictEqual(r.error, undefined, `child error: ${r.error && r.error.message}`); assert.strictEqual(r.signal, null, `child signal: ${r.signal}`); return { status: r.status, stdout: r.stdout.toString(), stderr: r.stderr.toString() }; }
function noLeaks(result, values = SENTINELS) { for (const value of values) { assert.strictEqual(result.stdout.includes(value), false, `stdout leaked ${value}`); assert.strictEqual(result.stderr.includes(value), false, `stderr leaked ${value}`); } }
function withFixture(label, contents, fn) { const parent = dir(label); try { const file = write(parent, "state.json", contents); fn(file, fileSnapshot(file), directorySnapshot(parent)); } finally { fs.rmSync(parent, { recursive: true, force: true }); } }
function assertUnchanged(file, beforeFile, parent, beforeParent) { assert.deepStrictEqual(fileSnapshot(file), beforeFile); assert.deepStrictEqual(directorySnapshot(parent), beforeParent); }

test("AC1: Fixture A emits the exact sorted pending projection, withholds private fields, repeats byte-identically, and is unchanged", () => {
  withFixture("ac1", A, (file, before, parentBefore) => {
    const parent = path.dirname(file); const first = run([file]); const second = run([file]);
    for (const result of [first, second]) { assert.deepStrictEqual(result, { status: 0, stdout: A_OUT, stderr: "" }); noLeaks(result); assert.deepStrictEqual(JSON.parse(result.stdout).map(Object.keys), [["id", "eventId", "attempts", "retries"], ["id", "eventId", "attempts", "retries"], ["id", "eventId", "attempts", "retries"]]); assertUnchanged(file, before, parent, parentBefore); }
    assert.deepStrictEqual(second, first);
  });
});

test("AC2: empty and all-non-pending fixtures emit exactly an empty array and are unchanged", () => {
  for (const [label, contents] of [["empty", C], ["non-pending", D]]) withFixture(`ac2-${label}`, contents, (file, before, parentBefore) => { const result = run([file]); assert.deepStrictEqual(result, { status: 0, stdout: EMPTY, stderr: "" }); noLeaks(result); assertUnchanged(file, before, path.dirname(file), parentBefore); });
});

test("AC3: zero and two arguments return the exact usage error before accessing either path", () => {
  for (const args of [[], ["first-MUST-NOT-EXIST", "second-MUST-NOT-EXIST"]]) { const parent = dir("ac3"); try { const names = args.map(name => path.join(parent, name)); const before = directorySnapshot(parent); const result = run(names); assert.deepStrictEqual(result, { status: 2, stdout: "", stderr: USAGE }); for (const name of names) assert.strictEqual(fs.existsSync(name), false); assert.deepStrictEqual(directorySnapshot(parent), before); } finally { fs.rmSync(parent, { recursive: true, force: true }); } }
});

test("AC4: a nonexistent path and directory path have the exact unreadable envelope and remain unchanged", () => {
  const parent = dir("ac4"); try { const missing = path.join(parent, "PATH-SENTINEL-missing-state.json"); const directory = path.join(parent, "DIRECTORY-PATH-SENTINEL"); fs.mkdirSync(directory); const parentBefore = directorySnapshot(parent); const directoryBefore = directorySnapshot(directory); for (const target of [missing, directory]) { const result = run([target]); assert.deepStrictEqual(result, { status: 1, stdout: "", stderr: UNREADABLE }); noLeaks(result); } assert.strictEqual(fs.existsSync(missing), false); assert.deepStrictEqual(directorySnapshot(directory), directoryBefore); assert.deepStrictEqual(directorySnapshot(parent), parentBefore); } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});

test("AC5: malformed Fixture B returns only the exact JSON error without leaking content or changing it", () => withFixture("ac5", B, (file, before, parentBefore) => { const result = run([file]); assert.deepStrictEqual(result, { status: 1, stdout: "", stderr: NOT_JSON }); noLeaks(result); assertUnchanged(file, before, path.dirname(file), parentBefore); }));

test("AC6: all structural-invalid fixtures reject before filtering and every frozen fixture is byte-distinct", () => {
  const all = [A, B, C, D, E, F, ...S.map(([, contents]) => contents)]; for (let i = 0; i < all.length; i += 1) for (let j = i + 1; j < all.length; j += 1) assert.notStrictEqual(all[i], all[j]);
  for (const [id, contents] of S) withFixture(`ac6-${id}`, contents, (file, before, parentBefore) => { const result = run([file]); assert.deepStrictEqual(result, { status: 1, stdout: "", stderr: INVALID }, id); assertUnchanged(file, before, path.dirname(file), parentBefore); });
});

test("AC7: the command stays offline, imports only node:fs, and every child invocation terminates without process errors", () => {
  const source = fs.readFileSync(TOOL, "utf8"); const specifiers = [...source.matchAll(/require\(["']([^"']+)["']\)/g)].map(match => match[1]); assert.deepStrictEqual(specifiers, ["node:fs"]); for (const forbidden of ["server.js", "node:http", "node:https", "node:net", "node:child_process", "fetch"]) assert.strictEqual(source.includes(forbidden), false);
});

test("AC9: Fixture E uses UTF-16 code-unit ordering for supplementary-plane IDs and is unchanged", () => withFixture("ac9", E, (file, before, parentBefore) => { const result = run([file]); assert.deepStrictEqual(result, { status: 0, stdout: E_OUT, stderr: "" }); assertUnchanged(file, before, path.dirname(file), parentBefore); }));

test("AC10: Fixture F accepts opaque event approval and outbox entries while withholding their content", () => withFixture("ac10", F, (file, before, parentBefore) => { const result = run([file]); assert.deepStrictEqual(result, { status: 0, stdout: F_OUT, stderr: "" }); noLeaks(result, ["ARBITRARY-OPAQUE-OUTBOX-SENTINEL"]); assertUnchanged(file, before, path.dirname(file), parentBefore); }));

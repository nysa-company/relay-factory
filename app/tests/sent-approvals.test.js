const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const TOOL = path.join(__dirname, "..", "tools", "sent-approvals.js");
const REPO_ROOT = path.join(__dirname, "..", "..");
const USAGE = "usage: node app/tools/sent-approvals.js <state-file>\n";
const CANNOT_READ = "sent-approvals: cannot read state file\n";
const NOT_JSON = "sent-approvals: state file is not valid JSON\n";
const INVALID_STATE = "sent-approvals: invalid Relay state\n";

const FIXTURE_A = `{
  "events": [],
  "jobs": [],
  "approvals": [
    {"id":"appr-zulu","jobId":"job-zulu","action":{"to":"ZULU-TO-MUST-NOT-LEAK","subject":"ZULU-SUBJECT-MUST-NOT-LEAK","body":"ZULU-BODY-MUST-NOT-LEAK"},"status":"pending","proposedAt":"2026-08-06T04:00:05.000Z"},
    {"id":"appr-sent","jobId":"job-sent","action":{"to":"SENT-TO-MUST-NOT-LEAK","subject":"SENT-SUBJECT-MUST-NOT-LEAK","body":"SENT-BODY-MUST-NOT-LEAK"},"status":"sent","proposedAt":"2026-08-06T04:00:02.000Z"},
    {"id":"appr-alpha","jobId":"job-alpha","action":{"to":"ALPHA-TO-MUST-NOT-LEAK","subject":"ALPHA-SUBJECT-MUST-NOT-LEAK","body":"ALPHA-BODY-MUST-NOT-LEAK"},"status":"pending","proposedAt":"2026-08-06T04:00:01.000Z"},
    {"id":"appr-rejected","jobId":"job-rejected","action":{"to":"REJECTED-TO-MUST-NOT-LEAK","subject":"REJECTED-SUBJECT-MUST-NOT-LEAK","body":"REJECTED-BODY-MUST-NOT-LEAK"},"status":"rejected","proposedAt":"2026-08-06T04:00:03.000Z","reason":"REJECTION-REASON-MUST-NOT-LEAK"},
    {"id":"appr-blocked","jobId":"job-blocked","action":{"to":"BLOCKED-TO-MUST-NOT-LEAK","subject":"BLOCKED-SUBJECT-MUST-NOT-LEAK","body":"BLOCKED-BODY-MUST-NOT-LEAK"},"status":"blocked_recipient","proposedAt":"2026-08-06T04:00:04.000Z"}
  ],
  "outbox": [{"to":"OUTBOX-TO-MUST-NOT-LEAK","subject":"OUTBOX-SUBJECT-MUST-NOT-LEAK","body":"OUTBOX-BODY-MUST-NOT-LEAK","approvalId":"appr-sent"}],
  "metadata": {"note":"METADATA-MUST-NOT-LEAK"}
}
`;
const EXPECTED_A = '[{"id":"appr-sent","jobId":"job-sent","proposedAt":"2026-08-06T04:00:02.000Z"}]\n';
const FIXTURE_B = '{"events":[],"jobs":[],"approvals":[],"outbox":[]}\n';
const FIXTURE_C = '{"events":[],"secret":"MALFORMED-BODY-MUST-NOT-LEAK"\n';
const FIXTURE_D = '{"events":[],"jobs":[],"approvals":[{"id":"appr-￿","jobId":"job-d1","proposedAt":"2026-08-06T04:00:10.000Z","status":"sent"},{"id":"appr-𐀀","jobId":"job-d2","proposedAt":"2026-08-06T04:00:11.000Z","status":"sent"}],"outbox":[]}\n';
const EXPECTED_D = '[{"id":"appr-𐀀","jobId":"job-d2","proposedAt":"2026-08-06T04:00:11.000Z"},{"id":"appr-￿","jobId":"job-d1","proposedAt":"2026-08-06T04:00:10.000Z"}]\n';
const FIXTURE_E = '{"events":[],"jobs":[],"approvals":[{"id":"appr-e1","jobId":"job-shared","proposedAt":"2026-08-06T04:00:12.000Z","status":"sent","action":{"to":"E1-TO-MUST-NOT-LEAK","subject":"E1-SUBJECT-MUST-NOT-LEAK","body":"E1-BODY-MUST-NOT-LEAK"}},{"id":"appr-e2","jobId":"job-shared","proposedAt":"2026-08-06T04:00:13.000Z","status":"pending","action":{"to":"E2-TO-MUST-NOT-LEAK","subject":"E2-SUBJECT-MUST-NOT-LEAK","body":"E2-BODY-MUST-NOT-LEAK"}}],"outbox":[]}\n';
const EXPECTED_E = '[{"id":"appr-e1","jobId":"job-shared","proposedAt":"2026-08-06T04:00:12.000Z"}]\n';

const SENSITIVE_TOKENS = [
  "ZULU-TO-MUST-NOT-LEAK", "ZULU-SUBJECT-MUST-NOT-LEAK", "ZULU-BODY-MUST-NOT-LEAK",
  "SENT-TO-MUST-NOT-LEAK", "SENT-SUBJECT-MUST-NOT-LEAK", "SENT-BODY-MUST-NOT-LEAK",
  "ALPHA-TO-MUST-NOT-LEAK", "ALPHA-SUBJECT-MUST-NOT-LEAK", "ALPHA-BODY-MUST-NOT-LEAK",
  "REJECTED-TO-MUST-NOT-LEAK", "REJECTED-SUBJECT-MUST-NOT-LEAK", "REJECTED-BODY-MUST-NOT-LEAK", "REJECTION-REASON-MUST-NOT-LEAK",
  "BLOCKED-TO-MUST-NOT-LEAK", "BLOCKED-SUBJECT-MUST-NOT-LEAK", "BLOCKED-BODY-MUST-NOT-LEAK",
  "OUTBOX-TO-MUST-NOT-LEAK", "OUTBOX-SUBJECT-MUST-NOT-LEAK", "OUTBOX-BODY-MUST-NOT-LEAK", "METADATA-MUST-NOT-LEAK",
  "E1-TO-MUST-NOT-LEAK", "E1-SUBJECT-MUST-NOT-LEAK", "E1-BODY-MUST-NOT-LEAK", "E2-TO-MUST-NOT-LEAK", "E2-SUBJECT-MUST-NOT-LEAK", "E2-BODY-MUST-NOT-LEAK",
];

const STRUCTURAL_INVALID = [
  ["S1", "[]"],
  ["S2", '{"events":[],"jobs":[],"approvals":[]}'],
  ["S3", '{"events":{},"jobs":[],"approvals":[],"outbox":[]}'],
  ["S4", '{"events":[],"jobs":{},"approvals":[],"outbox":[]}'],
  ["S5", '{"events":[],"jobs":[],"approvals":{},"outbox":[]}'],
  ["S6", '{"events":[],"jobs":[],"approvals":[],"outbox":{}}'],
  ["S7", '{"events":[],"jobs":[],"approvals":[null],"outbox":[]}'],
  ["S8", '{"events":[],"jobs":[],"approvals":[{"id":"","jobId":"job-a","proposedAt":"2026-08-06T04:00:00.000Z","status":"pending"}],"outbox":[]}'],
  ["S9", '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":7,"proposedAt":"2026-08-06T04:00:00.000Z","status":"pending"}],"outbox":[]}'],
  ["S10", '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","proposedAt":null,"status":"pending"}],"outbox":[]}'],
  ["S11", '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","proposedAt":"2026-08-06T04:00:00.000Z","status":"PENDING"}],"outbox":[]}'],
  ["S12", '{"events":[],"jobs":[],"approvals":[{"id":42,"jobId":"job-a","proposedAt":"2026-08-06T04:00:00.000Z","status":"pending"}],"outbox":[]}'],
  ["S13", '{"events":[],"jobs":[],"approvals":[[]],"outbox":[]}'],
  ["S14", '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"","proposedAt":"2026-08-06T04:00:00.000Z","status":"pending"}],"outbox":[]}'],
  ["S15", '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","proposedAt":"","status":"pending"}],"outbox":[]}'],
  ["S16", '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","proposedAt":"2026-08-06T04:00:00.000Z","status":1}],"outbox":[]}'],
  ["S17", '{"events":[],"jobs":[],"approvals":[{"id":"appr-dup","jobId":"job-dup-1","proposedAt":"2026-08-06T04:00:00.000Z","status":"pending"},{"id":"appr-dup","jobId":"job-dup-2","proposedAt":"2026-08-06T04:00:01.000Z","status":"sent"}],"outbox":[]}'],
].map(([id, json]) => ({ id, bytes: `${json}\n` }));

function withTempDir(label, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `relay-sent-approvals-${label}-`));
  try { return run(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
function writeFixture(dir, bytes, name = "state.json") {
  const file = path.join(dir, name); fs.writeFileSync(file, bytes, "utf8"); return file;
}
function run(args) {
  const result = spawnSync(process.execPath, [TOOL, ...args], { cwd: REPO_ROOT, timeout: 10_000, encoding: "buffer" });
  assert.strictEqual(result.signal, null, "the command must terminate on its own without being killed");
  assert.strictEqual(result.error, undefined, `spawn failed: ${result.error}`);
  return { code: result.status, stdout: result.stdout.toString("utf8"), stderr: result.stderr.toString("utf8"), stdoutBytes: result.stdout, stderrBytes: result.stderr };
}
function fingerprint(file) {
  const stats = fs.statSync(file, { bigint: true });
  return { bytes: fs.readFileSync(file, "utf8"), mode: stats.mode.toString(8), mtimeNs: stats.mtimeNs.toString() };
}
function assertNoTokens(result, tokens) {
  for (const token of tokens) {
    assert.ok(!result.stdout.includes(token), `stdout leaked ${token}`);
    assert.ok(!result.stderr.includes(token), `stderr leaked ${token}`);
  }
}
function assertSuccess(result, expected) {
  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.stderrBytes.length, 0);
  assert.deepStrictEqual(result.stdoutBytes, Buffer.from(expected, "utf8"));
}

test("AC1: valid state writes one compact sent-approval JSON line with zero stderr", () => {
  withTempDir("ac1", dir => {
    const result = run([writeFixture(dir, FIXTURE_A)]);
    assertSuccess(result, EXPECTED_A);
  });
});

test("AC2: sent approvals are projected privately, UTF-16 sorted, and empty when none are sent", () => {
  withTempDir("ac2-a", dir => {
    const result = run([writeFixture(dir, FIXTURE_A)]);
    assertSuccess(result, EXPECTED_A);
    assert.deepStrictEqual(Object.keys(JSON.parse(result.stdout)[0]), ["id", "jobId", "proposedAt"]);
    assertNoTokens(result, SENSITIVE_TOKENS);
    for (const id of ["appr-zulu", "appr-alpha", "appr-rejected", "appr-blocked"]) assert.ok(!result.stdout.includes(id));
  });
  withTempDir("ac2-b", dir => assertSuccess(run([writeFixture(dir, FIXTURE_B)]), "[]\n"));
  withTempDir("ac2-d", dir => assertSuccess(run([writeFixture(dir, FIXTURE_D)]), EXPECTED_D));
  withTempDir("ac2-e", dir => {
    const result = run([writeFixture(dir, FIXTURE_E)]);
    assertSuccess(result, EXPECTED_E);
    assert.ok(!result.stdout.includes("appr-e2"));
    assertNoTokens(result, SENSITIVE_TOKENS);
  });
});

test("AC3: every invalid approval record, including a duplicate ID before filtering, fails validation", () => {
  const fixtures = [["A", FIXTURE_A], ["B", FIXTURE_B], ["C", FIXTURE_C], ["D", FIXTURE_D], ["E", FIXTURE_E], ...STRUCTURAL_INVALID.map(({ id, bytes }) => [id, bytes])];
  for (let i = 0; i < fixtures.length; i++) for (let j = i + 1; j < fixtures.length; j++) assert.notStrictEqual(fixtures[i][1], fixtures[j][1], `fixtures ${fixtures[i][0]} and ${fixtures[j][0]} are not byte-distinct`);
  for (const fixture of STRUCTURAL_INVALID) withTempDir(`ac3-${fixture.id}`, dir => {
    const file = writeFixture(dir, fixture.bytes); const before = fingerprint(file); const result = run([file]);
    assert.strictEqual(result.code, 1, fixture.id); assert.strictEqual(result.stdoutBytes.length, 0, fixture.id);
    assert.deepStrictEqual(result.stderrBytes, Buffer.from(INVALID_STATE, "utf8"), fixture.id);
    assert.deepStrictEqual(fingerprint(file), before, fixture.id);
  });
});

test("AC4: usage, unreadable state, invalid JSON, and invalid state use redacted fixed errors", () => {
  withTempDir("ac4-usage", dir => {
    for (const args of [[], [path.join(dir, "one.json"), path.join(dir, "two.json")]]) {
      const result = run(args); assert.strictEqual(result.code, 2); assert.strictEqual(result.stdoutBytes.length, 0); assert.deepStrictEqual(result.stderrBytes, Buffer.from(USAGE, "utf8"));
    }
  });
  withTempDir("ac4-read", dir => {
    for (const file of [path.join(dir, "missing.json"), (() => { const value = path.join(dir, "directory"); fs.mkdirSync(value); return value; })()]) {
      const result = run([file]); assert.strictEqual(result.code, 1); assert.strictEqual(result.stdoutBytes.length, 0); assert.deepStrictEqual(result.stderrBytes, Buffer.from(CANNOT_READ, "utf8")); assertNoTokens(result, [file]);
    }
  });
  withTempDir("ac4-json", dir => {
    const file = writeFixture(dir, FIXTURE_C); const before = fingerprint(file); const result = run([file]);
    assert.strictEqual(result.code, 1); assert.strictEqual(result.stdoutBytes.length, 0); assert.deepStrictEqual(result.stderrBytes, Buffer.from(NOT_JSON, "utf8")); assert.deepStrictEqual(fingerprint(file), before); assertNoTokens(result, ["MALFORMED-BODY-MUST-NOT-LEAK"]);
  });
});

test("AC5: invocations self-terminate, are deterministic, and preserve fixture fingerprints and siblings", () => {
  const cases = [["a", FIXTURE_A, 0, EXPECTED_A, ""], ["b", FIXTURE_B, 0, "[]\n", ""], ["c", FIXTURE_C, 1, "", NOT_JSON], ["d", FIXTURE_D, 0, EXPECTED_D, ""], ["e", FIXTURE_E, 0, EXPECTED_E, ""], ...STRUCTURAL_INVALID.map(({ id, bytes }) => [id, bytes, 1, "", INVALID_STATE])];
  for (const [label, bytes, code, stdout, stderr] of cases) withTempDir(`ac5-${label}`, dir => {
    const file = writeFixture(dir, bytes); const before = fingerprint(file); const siblings = fs.readdirSync(dir).sort(); const first = run([file]); const second = run([file]);
    assert.strictEqual(first.code, code); assert.strictEqual(first.stdout, stdout); assert.strictEqual(first.stderr, stderr); assert.deepStrictEqual(second.stdoutBytes, first.stdoutBytes); assert.deepStrictEqual(second.stderrBytes, first.stderrBytes); assert.deepStrictEqual(fingerprint(file), before); assert.deepStrictEqual(fs.readdirSync(dir).sort(), siblings);
  });
});

test("AC6: the focused sent-approvals contract test remains isolated to its temporary fixtures", () => {
  withTempDir("ac6", dir => {
    const file = writeFixture(dir, FIXTURE_B); assert.strictEqual(fs.readdirSync(dir).length, 1); assertSuccess(run([file]), "[]\n"); assert.deepStrictEqual(fs.readdirSync(dir), ["state.json"]);
  });
});

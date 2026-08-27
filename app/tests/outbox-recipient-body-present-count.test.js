const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TOOL = path.join(__dirname, "..", "tools", "outbox-recipient-body-present-count.js");
const CHILD_TIMEOUT_MS = 5_000;
const USAGE = "usage: node app/tools/outbox-recipient-body-present-count.js <state-file> <recipient>\n";
const READ_ERROR = "outbox-recipient-body-present-count: cannot read state file\n";
const PARSE_ERROR = "outbox-recipient-body-present-count: state file is not valid JSON\n";
const INVALID_ERROR = "outbox-recipient-body-present-count: invalid Relay state\n";

const FIXTURE = JSON.stringify({
  events: [], jobs: [], approvals: [],
  outbox: [
    { to: "target@example.test", subject: "First match", body: "Has text.", approvalId: "appr-body-present-1", sentAt: "2026-08-20T09:00:00.000Z" },
    { to: "target@example.test", subject: "Empty body", body: "", approvalId: "appr-body-present-2", sentAt: "2026-08-20T09:00:01.000Z" },
    { to: "target@example.test", subject: "Non-string body", body: 7, approvalId: "appr-body-present-3", sentAt: "2026-08-20T09:00:02.000Z" },
    { to: "other@example.test", subject: "Wrong recipient", body: "Has text too.", approvalId: "appr-body-present-4", sentAt: "2026-08-20T09:00:03.000Z" },
    { to: "target@example.test", subject: "Second match", body: "More text.", approvalId: "appr-body-present-5", sentAt: "2026-08-20T09:00:04.000Z" },
  ],
}) + "\n";

function tempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `relay-outbox-body-${label}-`));
}

function snapshot(file) {
  const stat = fs.statSync(file, { bigint: true });
  return { bytes: fs.readFileSync(file).toString("hex"), mode: stat.mode, size: stat.size, mtimeNs: stat.mtimeNs };
}

function run(args) {
  const result = spawnSync(process.execPath, [TOOL, ...args], { stdio: "pipe", timeout: CHILD_TIMEOUT_MS });
  assert.strictEqual(result.error, undefined, result.error && result.error.message);
  assert.strictEqual(result.signal, null, "child must self-terminate without a signal");
  return { status: result.status, stdout: result.stdout.toString("utf8"), stderr: result.stderr.toString("utf8") };
}

function withState(label, contents, fn) {
  const dir = tempDir(label);
  const file = path.join(dir, "state.json");
  fs.writeFileSync(file, contents);
  try { fn(file, dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

function validEntry(overrides = {}) {
  return { to: "target@example.test", subject: "subject", body: "text", approvalId: "approval-a", sentAt: "time-a", ...overrides };
}

test("AC1: emits the exact compact one-key count JSON for the canonical fixture", () => {
  withState("ac1", FIXTURE, file => {
    const before = snapshot(file);
    const result = run([file, "target@example.test"]);
    assert.deepStrictEqual(result, { status: 0, stdout: '{"outboxEntriesWithRecipientAndTextBody":2}\n', stderr: "" });
    assert.deepStrictEqual(snapshot(file), before, "successful counting must not alter the state file");
  });
});

test("AC2: matches recipients exactly and case-sensitively and counts only non-empty string bodies", () => {
  withState("ac2", FIXTURE, file => {
    for (const [recipient, expected] of [["other@example.test", 1], ["Target@example.test", 0], ["", 0]]) {
      const before = snapshot(file);
      const result = run([file, recipient]);
      assert.deepStrictEqual(result, { status: 0, stdout: `{"outboxEntriesWithRecipientAndTextBody":${expected}}\n`, stderr: "" });
      assert.deepStrictEqual(snapshot(file), before);
    }
  });
});

test("AC3: rejects invalid arguments before access and returns fixed redacted read parse and validation errors", () => {
  const dir = tempDir("ac3");
  try {
    const untouched = path.join(dir, "must-not-be-touched.json");
    for (const args of [[], [untouched], [untouched, "recipient", "extra"]]) {
      assert.deepStrictEqual(run(args), { status: 2, stdout: "", stderr: USAGE });
      assert.strictEqual(fs.existsSync(untouched), false, "usage handling must not access the candidate path");
    }
    assert.deepStrictEqual(run([path.join(dir, "absent.json"), "recipient"]), { status: 1, stdout: "", stderr: READ_ERROR });
    assert.deepStrictEqual(run([dir, "recipient"]), { status: 1, stdout: "", stderr: READ_ERROR });
    const malformed = path.join(dir, "malformed.json");
    fs.writeFileSync(malformed, '{"private":"MALFORMED-PAYLOAD"');
    assert.deepStrictEqual(run([malformed, "recipient"]), { status: 1, stdout: "", stderr: PARSE_ERROR });
    const invalidStates = [
      null,
      [],
      { events: [], jobs: [], approvals: [] },
      { events: [], jobs: [], approvals: [], outbox: [null] },
      { events: [], jobs: [], approvals: [], outbox: [validEntry({ approvalId: "" })] },
      { events: [], jobs: [], approvals: [], outbox: [validEntry(), validEntry({ approvalId: "approval-a", to: "other@example.test" })] },
      { events: [], jobs: [], approvals: [], outbox: [validEntry(), { to: "target@example.test", subject: "late invalid", body: "text", approvalId: "approval-b" }] },
    ];
    for (const [index, invalid] of invalidStates.entries()) {
      const file = path.join(dir, `invalid-${index}.json`);
      fs.writeFileSync(file, JSON.stringify(invalid));
      const before = snapshot(file);
      assert.deepStrictEqual(run([file, "target@example.test"]), { status: 1, stdout: "", stderr: INVALID_ERROR });
      assert.deepStrictEqual(snapshot(file), before);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AC4: is deterministic, read-only, offline, zero-dependency, and self-terminating", () => {
  withState("ac4", FIXTURE, (file, dir) => {
    const before = snapshot(file);
    const entriesBefore = fs.readdirSync(dir).sort();
    assert.deepStrictEqual(run([file, "target@example.test"]), run([file, "target@example.test"]));
    assert.deepStrictEqual(snapshot(file), before);
    assert.deepStrictEqual(fs.readdirSync(dir).sort(), entriesBefore, "the command must create no files alongside its input");
  });
  assert.strictEqual(fs.existsSync(TOOL), true, "the frozen zero-dependency command must exist");
  const source = fs.readFileSync(TOOL, "utf8");
  assert.deepStrictEqual([...source.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)].map(match => match[1]).sort(), ["node:fs"]);
  assert.strictEqual(/(?:http|https|net|dgram|child_process)/.test(source), false, "the command must not create network or child-process effects");
  assert.strictEqual(/(?:writeFile|appendFile|mkdir|unlink|rename|process\.exit\s*\()/.test(source), false, "the command must be read-only and not force termination");
});

test("AC5: keeps the frozen implementation and test surfaces isolated from dependency and product changes", () => {
  assert.strictEqual(fs.existsSync(TOOL), true, "the contract-owned implementation surface must be present for its acceptance tests");
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
  assert.deepStrictEqual(packageJson.dependencies || {}, {}, "the command adds no runtime dependency");
  assert.deepStrictEqual(packageJson.devDependencies || {}, {}, "the command adds no development dependency");
  assert.strictEqual(fs.existsSync(path.join(__dirname, "..", "server.js")), true, "the existing server remains outside this CLI contract");
});

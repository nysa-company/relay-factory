const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const TOOL = path.join(__dirname, "..", "tools", "state-summary.js");

const USAGE_LINE = "usage: node app/tools/state-summary.js <state-file>\n";
const UNREADABLE_LINE = "state-summary: state file is unreadable\n";
const NOT_JSON_LINE = "state-summary: state file is not valid JSON\n";
const INVALID_STATE_LINE = "state-summary: state file has invalid Relay state\n";

const FIXTURE_A_VALUE = {
  events: [
    {
      id: "event-summary-1",
      type: "meeting",
      payload: { private: "EVENT-PAYLOAD-SENTINEL" },
      receivedAt: "2026-08-06T12:00:00.000Z",
    },
    {
      id: "event-summary-2",
      type: "email",
      payload: {},
      receivedAt: "2026-08-06T12:00:01.000Z",
    },
  ],
  jobs: [
    { id: "job-event-summary-1", eventId: "event-summary-1", status: "pending" },
    { id: "job-event-summary-2", eventId: "event-summary-2", status: "pending" },
    { id: "job-summary-done", eventId: "event-summary-1", status: "done" },
    { id: "job-summary-dead", eventId: "event-summary-2", status: "dead" },
  ],
  approvals: [
    {
      id: "appr-summary-pending",
      jobId: "job-event-summary-1",
      action: { body: "APPROVAL-ACTION-SENTINEL" },
      status: "pending",
    },
    { id: "appr-summary-sent", jobId: "job-summary-done", status: "sent" },
    {
      id: "appr-summary-rejected",
      jobId: "job-summary-dead",
      status: "rejected",
      reason: "REJECTION-REASON-SENTINEL",
    },
    { id: "appr-summary-blocked", jobId: "job-event-summary-2", status: "blocked_recipient" },
  ],
  outbox: [
    { approvalId: "appr-summary-sent", body: "OUTBOX-CONTENT-SENTINEL" },
    { approvalId: "appr-summary-other", body: "second receipt" },
  ],
};

const FIXTURE_A_BYTES = JSON.stringify(FIXTURE_A_VALUE, null, 2) + "\n";
const FIXTURE_B_BYTES = '{"events":[],"jobs":[],"approvals":[],"outbox":[]}\n';

const FIXTURE_A_OUTPUT =
  '{"events":2,"jobs":{"pending":2,"done":1,"dead":1},"approvals":{"pending":1,"sent":1,"rejected":1,"blocked_recipient":1},"outbox":2}\n';
const FIXTURE_B_OUTPUT =
  '{"events":0,"jobs":{"pending":0,"done":0,"dead":0},"approvals":{"pending":0,"sent":0,"rejected":0,"blocked_recipient":0},"outbox":0}\n';

const SENTINELS = [
  "EVENT-PAYLOAD-SENTINEL",
  "APPROVAL-ACTION-SENTINEL",
  "REJECTION-REASON-SENTINEL",
  "OUTBOX-CONTENT-SENTINEL",
];

function withTempDir(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-state-summary-test-"));
  try {
    return body(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function run(args) {
  const result = spawnSync(process.execPath, [TOOL, ...args], { encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function snapshot(filePath) {
  const stat = fs.statSync(filePath);
  return {
    bytes: fs.readFileSync(filePath, "utf8"),
    mode: stat.mode,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
  };
}

function assertUnchanged(filePath, before, label) {
  assert.deepStrictEqual(snapshot(filePath), before, `${label} must be unchanged`);
}

function entries(dir) {
  return fs.readdirSync(dir).sort();
}

test("AC1. Frozen Fixture A summarizes deterministically across two read-only invocations", () => {
  withTempDir((dir) => {
    const statePath = path.join(dir, "state-a.json");
    fs.writeFileSync(statePath, FIXTURE_A_BYTES);
    const before = snapshot(statePath);
    const dirBefore = entries(dir);

    for (const pass of ["first", "second"]) {
      const result = run([statePath]);

      assert.strictEqual(result.status, 0, `${pass} invocation must exit 0`);
      assert.strictEqual(result.stdout, FIXTURE_A_OUTPUT, `${pass} invocation stdout`);
      assert.strictEqual(result.stderr, "", `${pass} invocation must write zero bytes to stderr`);

      for (const sentinel of SENTINELS) {
        assert.ok(!result.stdout.includes(sentinel), `${pass} stdout must not contain ${sentinel}`);
        assert.ok(!result.stderr.includes(sentinel), `${pass} stderr must not contain ${sentinel}`);
      }

      assertUnchanged(statePath, before, `Fixture A after ${pass} invocation`);
      assert.deepStrictEqual(entries(dir), dirBefore, `no path created after ${pass} invocation`);
    }
  });
});

test("AC2. Frozen Fixture B summarizes as the all-zero shape and is left unchanged", () => {
  withTempDir((dir) => {
    const statePath = path.join(dir, "state-b.json");
    fs.writeFileSync(statePath, FIXTURE_B_BYTES);
    const before = snapshot(statePath);
    const dirBefore = entries(dir);

    const result = run([statePath]);

    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout, FIXTURE_B_OUTPUT);
    assert.strictEqual(result.stderr, "");
    assertUnchanged(statePath, before, "Fixture B");
    assert.deepStrictEqual(entries(dir), dirBefore, "no path created");
  });
});

test("AC3. the frozen failure matrix is asserted exactly and leaves every input untouched", () => {
  withTempDir((dir) => {
    const missingPath = path.join(dir, "missing-state.json");
    const directoryPath = path.join(dir, "state-directory");
    fs.mkdirSync(directoryPath);

    const structural = [
      ["invalid-root.json", "null\n"],
      ["invalid-events.json", '{"events":null,"jobs":[],"approvals":[],"outbox":[]}\n'],
      ["invalid-jobs.json", '{"events":[],"jobs":null,"approvals":[],"outbox":[]}\n'],
      ["invalid-approvals.json", '{"events":[],"jobs":[],"approvals":null,"outbox":[]}\n'],
      ["invalid-outbox.json", '{"events":[],"jobs":[],"approvals":[],"outbox":null}\n'],
      ["invalid-job-record.json", '{"events":[],"jobs":[null],"approvals":[],"outbox":[]}\n'],
      ["invalid-job-status.json", '{"events":[],"jobs":[{"status":"paused"}],"approvals":[],"outbox":[]}\n'],
      ["invalid-approval-record.json", '{"events":[],"jobs":[],"approvals":[null],"outbox":[]}\n'],
      ["invalid-approval-status.json", '{"events":[],"jobs":[],"approvals":[{"status":"approved"}],"outbox":[]}\n'],
      ["invalid-root-array.json", "[]\n"],
      ["invalid-root-string.json", '"relay"\n'],
      ["invalid-root-number.json", "7\n"],
      ["invalid-absent-events.json", '{"jobs":[],"approvals":[],"outbox":[]}\n'],
      ["invalid-job-status-case.json", '{"events":[],"jobs":[{"status":"Pending"}],"approvals":[],"outbox":[]}\n'],
      ["invalid-approval-status-case.json", '{"events":[],"jobs":[],"approvals":[{"status":"Sent"}],"outbox":[]}\n'],
    ];

    const malformedPath = path.join(dir, "malformed.json");
    fs.writeFileSync(malformedPath, "{not-json}\n");
    for (const [name, bytes] of structural) {
      fs.writeFileSync(path.join(dir, name), bytes);
    }

    const existing = [malformedPath, ...structural.map(([name]) => path.join(dir, name))];
    const before = new Map(existing.map((file) => [file, snapshot(file)]));
    const dirBefore = entries(dir);

    const cases = [
      { label: "zero arguments", args: [], code: 2, stderr: USAGE_LINE },
      { label: "two arguments", args: [malformedPath, malformedPath], code: 2, stderr: USAGE_LINE },
      { label: "missing path", args: [missingPath], code: 1, stderr: UNREADABLE_LINE },
      { label: "directory path", args: [directoryPath], code: 1, stderr: UNREADABLE_LINE },
      { label: "malformed JSON", args: [malformedPath], code: 1, stderr: NOT_JSON_LINE },
      ...structural.map(([name]) => ({
        label: name,
        args: [path.join(dir, name)],
        code: 1,
        stderr: INVALID_STATE_LINE,
      })),
    ];

    for (const testCase of cases) {
      const result = run(testCase.args);
      assert.strictEqual(result.status, testCase.code, `${testCase.label} exit code`);
      assert.strictEqual(result.stdout, "", `${testCase.label} must write empty stdout`);
      assert.strictEqual(result.stderr, testCase.stderr, `${testCase.label} stderr`);
    }

    for (const [file, snap] of before) {
      assertUnchanged(file, snap, path.basename(file));
    }
    assert.strictEqual(fs.existsSync(missingPath), false, "missing path must remain absent");
    assert.deepStrictEqual(entries(directoryPath), [], "directory fixture must remain empty");
    assert.deepStrictEqual(entries(dir), dirBefore, "no path created or removed");
  });
});

const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const TOOL = path.join(__dirname, "..", "tools", "pending-approvals.js");
const REPO_ROOT = path.join(__dirname, "..", "..");

const USAGE = "usage: node app/tools/pending-approvals.js <state-file>\n";
const CANNOT_READ = "pending-approvals: cannot read state file\n";
const NOT_JSON = "pending-approvals: state file is not valid JSON\n";
const INVALID_STATE = "pending-approvals: invalid Relay state\n";

const FIXTURE_A = `{
  "events": [],
  "jobs": [],
  "approvals": [
    {
      "id": "appr-zulu",
      "jobId": "job-zulu",
      "action": {
        "to": "ZULU-TO-MUST-NOT-LEAK",
        "subject": "ZULU-SUBJECT-MUST-NOT-LEAK",
        "body": "ZULU-BODY-MUST-NOT-LEAK"
      },
      "status": "pending",
      "proposedAt": "2026-08-06T04:00:05.000Z"
    },
    {
      "id": "appr-sent",
      "jobId": "job-sent",
      "action": {
        "to": "SENT-TO-MUST-NOT-LEAK",
        "subject": "SENT-SUBJECT-MUST-NOT-LEAK",
        "body": "SENT-BODY-MUST-NOT-LEAK"
      },
      "status": "sent",
      "proposedAt": "2026-08-06T04:00:02.000Z"
    },
    {
      "id": "appr-alpha",
      "jobId": "job-alpha",
      "action": {
        "to": "ALPHA-TO-MUST-NOT-LEAK",
        "subject": "ALPHA-SUBJECT-MUST-NOT-LEAK",
        "body": "ALPHA-BODY-MUST-NOT-LEAK"
      },
      "status": "pending",
      "proposedAt": "2026-08-06T04:00:01.000Z"
    },
    {
      "id": "appr-rejected",
      "jobId": "job-rejected",
      "action": {
        "to": "REJECTED-TO-MUST-NOT-LEAK",
        "subject": "REJECTED-SUBJECT-MUST-NOT-LEAK",
        "body": "REJECTED-BODY-MUST-NOT-LEAK"
      },
      "status": "rejected",
      "proposedAt": "2026-08-06T04:00:03.000Z",
      "reason": "REJECTION-REASON-MUST-NOT-LEAK"
    },
    {
      "id": "appr-blocked",
      "jobId": "job-blocked",
      "action": {
        "to": "BLOCKED-TO-MUST-NOT-LEAK",
        "subject": "BLOCKED-SUBJECT-MUST-NOT-LEAK",
        "body": "BLOCKED-BODY-MUST-NOT-LEAK"
      },
      "status": "blocked_recipient",
      "proposedAt": "2026-08-06T04:00:04.000Z"
    }
  ],
  "outbox": [
    {
      "to": "OUTBOX-TO-MUST-NOT-LEAK",
      "subject": "OUTBOX-SUBJECT-MUST-NOT-LEAK",
      "body": "OUTBOX-BODY-MUST-NOT-LEAK",
      "approvalId": "appr-sent",
      "sentAt": "2026-08-06T04:00:06.000Z"
    }
  ],
  "metadata": {
    "note": "METADATA-MUST-NOT-LEAK"
  }
}
`;

const EXPECTED_A =
  '[{"id":"appr-alpha","jobId":"job-alpha","proposedAt":"2026-08-06T04:00:01.000Z"},' +
  '{"id":"appr-zulu","jobId":"job-zulu","proposedAt":"2026-08-06T04:00:05.000Z"}]\n';

const FIXTURE_B = '{"events":[],"jobs":[],"approvals":[],"outbox":[]}\n';
const EXPECTED_B = "[]\n";

const FIXTURE_C = '{"events":[],"secret":"MALFORMED-BODY-MUST-NOT-LEAK"\n';

const SENSITIVE_TOKENS = [
  "ZULU-TO-MUST-NOT-LEAK",
  "ZULU-SUBJECT-MUST-NOT-LEAK",
  "ZULU-BODY-MUST-NOT-LEAK",
  "SENT-TO-MUST-NOT-LEAK",
  "SENT-SUBJECT-MUST-NOT-LEAK",
  "SENT-BODY-MUST-NOT-LEAK",
  "ALPHA-TO-MUST-NOT-LEAK",
  "ALPHA-SUBJECT-MUST-NOT-LEAK",
  "ALPHA-BODY-MUST-NOT-LEAK",
  "REJECTED-TO-MUST-NOT-LEAK",
  "REJECTED-SUBJECT-MUST-NOT-LEAK",
  "REJECTED-BODY-MUST-NOT-LEAK",
  "REJECTION-REASON-MUST-NOT-LEAK",
  "BLOCKED-TO-MUST-NOT-LEAK",
  "BLOCKED-SUBJECT-MUST-NOT-LEAK",
  "BLOCKED-BODY-MUST-NOT-LEAK",
  "OUTBOX-TO-MUST-NOT-LEAK",
  "OUTBOX-SUBJECT-MUST-NOT-LEAK",
  "OUTBOX-BODY-MUST-NOT-LEAK",
  "METADATA-MUST-NOT-LEAK",
];

const STRUCTURAL_INVALID = [
  { id: "S1", json: "[]" },
  { id: "S2", json: '{"events":[],"jobs":[],"approvals":[]}' },
  { id: "S3", json: '{"events":{},"jobs":[],"approvals":[],"outbox":[]}' },
  { id: "S4", json: '{"events":[],"jobs":{},"approvals":[],"outbox":[]}' },
  { id: "S5", json: '{"events":[],"jobs":[],"approvals":{},"outbox":[]}' },
  { id: "S6", json: '{"events":[],"jobs":[],"approvals":[],"outbox":{}}' },
  { id: "S7", json: '{"events":[],"jobs":[],"approvals":[null],"outbox":[]}' },
  {
    id: "S8",
    json: '{"events":[],"jobs":[],"approvals":[{"id":"","jobId":"job-a","proposedAt":"2026-08-06T04:00:00.000Z","status":"pending"}],"outbox":[]}',
  },
  {
    id: "S9",
    json: '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":7,"proposedAt":"2026-08-06T04:00:00.000Z","status":"pending"}],"outbox":[]}',
  },
  {
    id: "S10",
    json: '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","proposedAt":null,"status":"pending"}],"outbox":[]}',
  },
  {
    id: "S11",
    json: '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","proposedAt":"2026-08-06T04:00:00.000Z","status":"PENDING"}],"outbox":[]}',
  },
].map(entry => ({ id: entry.id, bytes: `${entry.json}\n` }));

function makeTempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `relay-pending-approvals-${label}-`));
}

function withTempDir(label, run) {
  const dir = makeTempDir(label);
  try {
    return run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeFixture(dir, bytes, name = "state.json") {
  const file = path.join(dir, name);
  fs.writeFileSync(file, bytes, "utf8");
  return file;
}

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [TOOL, ...args], {
    cwd: options.cwd || REPO_ROOT,
    timeout: 10_000,
    encoding: "buffer",
  });
  assert.strictEqual(
    result.signal,
    null,
    "the command must terminate on its own without being killed",
  );
  assert.strictEqual(result.error, undefined, `spawn failed: ${result.error}`);
  return {
    code: result.status,
    stdout: result.stdout.toString("utf8"),
    stderr: result.stderr.toString("utf8"),
    stdoutBytes: result.stdout,
    stderrBytes: result.stderr,
  };
}

function fingerprint(file) {
  const stats = fs.statSync(file, { bigint: true });
  return {
    bytes: fs.readFileSync(file, "utf8"),
    mode: stats.mode.toString(8),
    mtimeNs: stats.mtimeNs.toString(),
  };
}

function assertNoTokens(result, tokens) {
  for (const token of tokens) {
    assert.ok(!result.stdout.includes(token), `stdout leaked ${token}`);
    assert.ok(!result.stderr.includes(token), `stderr leaked ${token}`);
  }
}

test("AC1: Frozen Fixture A reports exactly the two pending approvals, id-sorted and projected", () => {
  withTempDir("ac1", dir => {
    const file = writeFixture(dir, FIXTURE_A);

    const result = run([file]);

    assert.strictEqual(result.stderr, "");
    assert.strictEqual(result.stderrBytes.length, 0);
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(result.stdoutBytes, Buffer.from(EXPECTED_A, "utf8"));

    const entries = JSON.parse(result.stdout);
    assert.deepStrictEqual(
      entries.map(entry => entry.id),
      ["appr-alpha", "appr-zulu"],
    );
    for (const entry of entries) {
      assert.deepStrictEqual(Object.keys(entry), ["id", "jobId", "proposedAt"]);
    }

    assertNoTokens(result, SENSITIVE_TOKENS);
    for (const absentId of ["appr-sent", "appr-rejected", "appr-blocked"]) {
      assert.ok(!result.stdout.includes(absentId), `stdout leaked ${absentId}`);
      assert.ok(!result.stderr.includes(absentId), `stderr leaked ${absentId}`);
    }
  });
});

test("AC2: Frozen Fixture B reports an empty pending selection as exactly []", () => {
  withTempDir("ac2", dir => {
    const file = writeFixture(dir, FIXTURE_B);

    const result = run([file]);

    assert.strictEqual(result.stderr, "");
    assert.strictEqual(result.stderrBytes.length, 0);
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(result.stdoutBytes, Buffer.from(EXPECTED_B, "utf8"));
  });
});

test("AC3: zero or two positional arguments exit 2 with the exact usage line and no state path change", () => {
  withTempDir("ac3", dir => {
    const first = path.join(dir, "state.json");
    const second = path.join(dir, "extra.json");

    for (const args of [[], [first, second]]) {
      const before = fs.readdirSync(dir).sort();

      const result = run(args);

      assert.strictEqual(result.code, 2);
      assert.strictEqual(result.stdoutBytes.length, 0);
      assert.deepStrictEqual(result.stderrBytes, Buffer.from(USAGE, "utf8"));
      assert.deepStrictEqual(fs.readdirSync(dir).sort(), before);
      assert.strictEqual(fs.existsSync(first), false);
      assert.strictEqual(fs.existsSync(second), false);
    }
  });
});

test("AC4: each frozen read-failure path exits 1 with the exact cannot-read line and leaves the path as it was", () => {
  withTempDir("ac4-missing", dir => {
    const missing = path.join(dir, "missing-state.json");
    assert.strictEqual(fs.existsSync(missing), false);

    const result = run([missing]);

    assert.strictEqual(result.code, 1);
    assert.strictEqual(result.stdoutBytes.length, 0);
    assert.deepStrictEqual(result.stderrBytes, Buffer.from(CANNOT_READ, "utf8"));
    assert.strictEqual(fs.existsSync(missing), false);
    assert.deepStrictEqual(fs.readdirSync(dir), []);
  });

  withTempDir("ac4-directory", dir => {
    const stateDirectory = path.join(dir, "state-directory");
    fs.mkdirSync(stateDirectory);
    const before = fs.readdirSync(stateDirectory).sort();

    const result = run([stateDirectory]);

    assert.strictEqual(result.code, 1);
    assert.strictEqual(result.stdoutBytes.length, 0);
    assert.deepStrictEqual(result.stderrBytes, Buffer.from(CANNOT_READ, "utf8"));
    assert.strictEqual(fs.statSync(stateDirectory).isDirectory(), true);
    assert.deepStrictEqual(fs.readdirSync(stateDirectory).sort(), before);
  });
});

test("AC5: Frozen Fixture C exits 1 with the exact invalid-JSON line, unchanged bytes, and no parser or secret leakage", () => {
  withTempDir("ac5", dir => {
    const file = writeFixture(dir, FIXTURE_C);
    const before = fingerprint(file);

    const result = run([file]);

    assert.strictEqual(result.code, 1);
    assert.strictEqual(result.stdoutBytes.length, 0);
    assert.deepStrictEqual(result.stderrBytes, Buffer.from(NOT_JSON, "utf8"));
    assert.deepStrictEqual(fingerprint(file), before);
    assertNoTokens(result, ["MALFORMED-BODY-MUST-NOT-LEAK"]);
  });
});

test("AC6: every frozen structural-invalid fixture exits 1 with the exact invalid-state line and unchanged bytes", () => {
  const allFixtures = [
    ["A", FIXTURE_A],
    ["B", FIXTURE_B],
    ["C", FIXTURE_C],
    ...STRUCTURAL_INVALID.map(entry => [entry.id, entry.bytes]),
  ];
  for (let i = 0; i < allFixtures.length; i++) {
    for (let j = i + 1; j < allFixtures.length; j++) {
      assert.notStrictEqual(
        allFixtures[i][1],
        allFixtures[j][1],
        `fixtures ${allFixtures[i][0]} and ${allFixtures[j][0]} are not byte-distinct`,
      );
    }
  }

  for (const fixture of STRUCTURAL_INVALID) {
    withTempDir(`ac6-${fixture.id.toLowerCase()}`, dir => {
      const file = writeFixture(dir, fixture.bytes);
      const before = fingerprint(file);

      const result = run([file]);

      assert.strictEqual(result.code, 1, `${fixture.id} exit code`);
      assert.strictEqual(result.stdoutBytes.length, 0, `${fixture.id} stdout`);
      assert.deepStrictEqual(
        result.stderrBytes,
        Buffer.from(INVALID_STATE, "utf8"),
        `${fixture.id} stderr`,
      );
      assert.deepStrictEqual(fingerprint(file), before, `${fixture.id} fixture bytes`);
    });
  }
});

test("AC7: every invocation self-terminates, repeats byte-identically, and changes no fixture or sibling path", () => {
  const cases = [
    { label: "a", bytes: FIXTURE_A, code: 0, stdout: EXPECTED_A, stderr: "" },
    { label: "b", bytes: FIXTURE_B, code: 0, stdout: EXPECTED_B, stderr: "" },
    { label: "c", bytes: FIXTURE_C, code: 1, stdout: "", stderr: NOT_JSON },
    ...STRUCTURAL_INVALID.map(entry => ({
      label: entry.id.toLowerCase(),
      bytes: entry.bytes,
      code: 1,
      stdout: "",
      stderr: INVALID_STATE,
    })),
  ];

  for (const testCase of cases) {
    withTempDir(`ac7-${testCase.label}`, dir => {
      const file = writeFixture(dir, testCase.bytes);
      const before = fingerprint(file);
      const siblingsBefore = fs.readdirSync(dir).sort();

      const result = run([file]);

      assert.strictEqual(result.code, testCase.code, `${testCase.label} exit code`);
      assert.strictEqual(result.stdout, testCase.stdout, `${testCase.label} stdout`);
      assert.strictEqual(result.stderr, testCase.stderr, `${testCase.label} stderr`);
      assert.deepStrictEqual(fingerprint(file), before, `${testCase.label} fixture unchanged`);
      assert.deepStrictEqual(
        fs.readdirSync(dir).sort(),
        siblingsBefore,
        `${testCase.label} wrote a sibling path`,
      );
    });
  }

  withTempDir("ac7-repeat", dir => {
    const file = writeFixture(dir, FIXTURE_A);
    const before = fingerprint(file);

    const first = run([file]);
    const second = run([file]);

    assert.strictEqual(first.code, 0);
    assert.strictEqual(second.code, 0);
    assert.deepStrictEqual(first.stdoutBytes, Buffer.from(EXPECTED_A, "utf8"));
    assert.deepStrictEqual(second.stdoutBytes, first.stdoutBytes);
    assert.deepStrictEqual(second.stderrBytes, first.stderrBytes);
    assert.strictEqual(second.stderrBytes.length, 0);
    assert.deepStrictEqual(fingerprint(file), before);
    assert.deepStrictEqual(fs.readdirSync(dir).sort(), ["state.json"]);
  });
});

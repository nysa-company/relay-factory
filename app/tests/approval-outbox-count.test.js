const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const TOOL = path.join(__dirname, "..", "tools", "approval-outbox-count.js");
const REPO_ROOT = path.join(__dirname, "..", "..");

const USAGE =
  "usage: node app/tools/approval-outbox-count.js <state-file> <approval-id>\n";
const CANNOT_READ = "approval-outbox-count: cannot read state file\n";
const NOT_JSON = "approval-outbox-count: state file is not valid JSON\n";
const INVALID_STATE = "approval-outbox-count: invalid Relay state\n";
const NO_SUCH_APPROVAL = "approval-outbox-count: no such approval\n";

const FIXTURE_A = `{
  "events": [
    {
      "id": "count-event-private",
      "payload": {
        "private": "EVENT-PAYLOAD-MUST-NOT-LEAK"
      }
    }
  ],
  "jobs": [
    {
      "id": "count-job-private",
      "lastError": "JOB-ERROR-MUST-NOT-LEAK"
    }
  ],
  "approvals": [
    {
      "id": "appr-count-none",
      "jobId": "count-job-private",
      "action": {
        "to": "NONE-RECIPIENT-MUST-NOT-LEAK",
        "subject": "NONE-SUBJECT-MUST-NOT-LEAK",
        "body": "NONE-BODY-MUST-NOT-LEAK"
      },
      "status": "pending",
      "proposedAt": "2026-08-24T08:00:00.000Z"
    },
    {
      "id": "appr-count-one",
      "jobId": "count-job-private",
      "action": {
        "to": "ONE-ACTION-RECIPIENT-MUST-NOT-LEAK",
        "subject": "ONE-ACTION-SUBJECT-MUST-NOT-LEAK",
        "body": "ONE-ACTION-BODY-MUST-NOT-LEAK"
      },
      "status": "sent",
      "proposedAt": "2026-08-24T08:00:01.000Z"
    },
    {
      "id": "appr-count-two",
      "jobId": "count-job-private",
      "action": {
        "to": "TWO-ACTION-RECIPIENT-MUST-NOT-LEAK",
        "subject": "TWO-ACTION-SUBJECT-MUST-NOT-LEAK",
        "body": "TWO-ACTION-BODY-MUST-NOT-LEAK"
      },
      "status": "sent",
      "proposedAt": "2026-08-24T08:00:02.000Z",
      "reason": "APPROVAL-REASON-MUST-NOT-LEAK"
    }
  ],
  "outbox": [
    {
      "approvalId": "appr-count-one",
      "to": "ONE-OUTBOX-RECIPIENT-MUST-NOT-LEAK",
      "subject": "ONE-OUTBOX-SUBJECT-MUST-NOT-LEAK",
      "body": "ONE-OUTBOX-BODY-MUST-NOT-LEAK",
      "sentAt": "2026-08-24T08:00:03.000Z"
    },
    {
      "approvalId": "appr-count-two",
      "to": "TWO-A-RECIPIENT-MUST-NOT-LEAK",
      "subject": "TWO-A-SUBJECT-MUST-NOT-LEAK",
      "body": "TWO-A-BODY-MUST-NOT-LEAK",
      "sentAt": "2026-08-24T08:00:04.000Z"
    },
    {
      "approvalId": "appr-count-two",
      "to": "TWO-B-RECIPIENT-MUST-NOT-LEAK",
      "subject": "TWO-B-SUBJECT-MUST-NOT-LEAK",
      "body": "TWO-B-BODY-MUST-NOT-LEAK",
      "sentAt": "2026-08-24T08:00:05.000Z"
    }
  ],
  "metadata": {
    "note": "STATE-CONTENT-MUST-NOT-LEAK"
  }
}
`;

const FIXTURE_B = '{"events":[],"secret":"MALFORMED-STATE-CONTENT-MUST-NOT-LEAK\n';

const FIXTURE_C = '{"events":[],"jobs":[],"approvals":[],"outbox":[]}\n';

const FIXTURE_A_CASES = [
  {
    approvalId: "appr-count-none",
    outboxEntries: 0,
    stdout: '{"approvalId":"appr-count-none","outboxEntries":0}\n',
  },
  {
    approvalId: "appr-count-one",
    outboxEntries: 1,
    stdout: '{"approvalId":"appr-count-one","outboxEntries":1}\n',
  },
  {
    approvalId: "appr-count-two",
    outboxEntries: 2,
    stdout: '{"approvalId":"appr-count-two","outboxEntries":2}\n',
  },
];

const FIXTURE_A_APPROVAL_IDS = FIXTURE_A_CASES.map(entry => entry.approvalId);

const SENSITIVE_TOKENS = [
  "EVENT-PAYLOAD-MUST-NOT-LEAK",
  "JOB-ERROR-MUST-NOT-LEAK",
  "NONE-RECIPIENT-MUST-NOT-LEAK",
  "NONE-SUBJECT-MUST-NOT-LEAK",
  "NONE-BODY-MUST-NOT-LEAK",
  "ONE-ACTION-RECIPIENT-MUST-NOT-LEAK",
  "ONE-ACTION-SUBJECT-MUST-NOT-LEAK",
  "ONE-ACTION-BODY-MUST-NOT-LEAK",
  "TWO-ACTION-RECIPIENT-MUST-NOT-LEAK",
  "TWO-ACTION-SUBJECT-MUST-NOT-LEAK",
  "TWO-ACTION-BODY-MUST-NOT-LEAK",
  "APPROVAL-REASON-MUST-NOT-LEAK",
  "ONE-OUTBOX-RECIPIENT-MUST-NOT-LEAK",
  "ONE-OUTBOX-SUBJECT-MUST-NOT-LEAK",
  "ONE-OUTBOX-BODY-MUST-NOT-LEAK",
  "TWO-A-RECIPIENT-MUST-NOT-LEAK",
  "TWO-A-SUBJECT-MUST-NOT-LEAK",
  "TWO-A-BODY-MUST-NOT-LEAK",
  "TWO-B-RECIPIENT-MUST-NOT-LEAK",
  "TWO-B-SUBJECT-MUST-NOT-LEAK",
  "TWO-B-BODY-MUST-NOT-LEAK",
  "STATE-CONTENT-MUST-NOT-LEAK",
  "2026-08-24T08:00:00.000Z",
  "2026-08-24T08:00:01.000Z",
  "2026-08-24T08:00:02.000Z",
  "2026-08-24T08:00:03.000Z",
  "2026-08-24T08:00:04.000Z",
  "2026-08-24T08:00:05.000Z",
];

const MALFORMED_TOKEN = "MALFORMED-STATE-CONTENT-MUST-NOT-LEAK";

// Literal argv values, never derived from a Fixture A ID at runtime.
const UNKNOWN_IDS = ["appr-count-missing", "APPR-COUNT-NONE", "appr-count-none "];

const STRUCTURAL_INVALID = [
  { id: "S1", approvalId: "appr-target", json: "null" },
  { id: "S2", approvalId: "appr-target", json: "[]" },
  {
    id: "S3",
    approvalId: "appr-target",
    json: '{"events":[],"jobs":[],"approvals":[]}',
  },
  {
    id: "S4",
    approvalId: "appr-target",
    json: '{"events":{},"jobs":[],"approvals":[],"outbox":[]}',
  },
  {
    id: "S5",
    approvalId: "appr-target",
    json: '{"events":[],"jobs":{},"approvals":[],"outbox":[]}',
  },
  {
    id: "S6",
    approvalId: "appr-target",
    json: '{"events":[],"jobs":[],"approvals":{},"outbox":[]}',
  },
  {
    id: "S7",
    approvalId: "appr-target",
    json: '{"events":[],"jobs":[],"approvals":[],"outbox":{}}',
  },
  {
    id: "S8",
    approvalId: "appr-target",
    json: '{"events":[],"jobs":[],"approvals":[null],"outbox":[]}',
  },
  {
    id: "S9",
    approvalId: "appr-target",
    json: '{"events":[],"jobs":[],"approvals":[[]],"outbox":[]}',
  },
  {
    id: "S10",
    approvalId: "appr-target",
    json: '{"events":[],"jobs":[],"approvals":[{"id":7}],"outbox":[]}',
  },
  {
    id: "S11",
    approvalId: "appr-target",
    json: '{"events":[],"jobs":[],"approvals":[{"id":""}],"outbox":[]}',
  },
  {
    id: "S12",
    approvalId: "appr-target",
    json: '{"events":[],"jobs":[],"approvals":[{"id":"appr-duplicate"},{"id":"appr-duplicate"}],"outbox":[]}',
  },
  {
    id: "S13",
    approvalId: "appr-target",
    json: '{"events":[],"jobs":[],"approvals":[{"id":"appr-target"}],"outbox":[null]}',
  },
  {
    id: "S14",
    approvalId: "appr-target",
    json: '{"events":[],"jobs":[],"approvals":[{"id":"appr-target"}],"outbox":[[]]}',
  },
  {
    id: "S15",
    approvalId: "appr-target",
    json: '{"events":[],"jobs":[],"approvals":[{"id":"appr-target"}],"outbox":[{}]}',
  },
  {
    id: "S16",
    approvalId: "appr-target",
    json: '{"events":[],"jobs":[],"approvals":[{"id":"appr-target"}],"outbox":[{"approvalId":7}]}',
  },
  {
    id: "S17",
    approvalId: "appr-target",
    json: '{"events":[],"jobs":[],"approvals":[{"id":"appr-target"}],"outbox":[{"approvalId":""}]}',
  },
  {
    id: "S18",
    approvalId: "appr-target",
    json: '{"events":[],"jobs":[],"approvals":[{"id":"appr-target"}],"outbox":[{"approvalId":"appr-missing"}]}',
  },
  {
    id: "S19",
    approvalId: "appr-target",
    json: '{"events":[],"jobs":[],"approvals":[{"id":"appr-target"},{"id":7}],"outbox":[]}',
  },
  {
    id: "S20",
    approvalId: "appr-target",
    json: '{"events":[],"jobs":[],"approvals":[{"id":"appr-target"}],"outbox":[{"approvalId":"appr-target"},{}]}',
  },
].map(entry => ({ id: entry.id, approvalId: entry.approvalId, bytes: `${entry.json}\n` }));

const ALL_FIXTURES = [
  ["A", FIXTURE_A],
  ["B", FIXTURE_B],
  ["C", FIXTURE_C],
  ...STRUCTURAL_INVALID.map(entry => [entry.id, entry.bytes]),
];

function withTempDir(label, body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `relay-approval-outbox-count-${label}-`));
  try {
    return body(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeFixture(dir, bytes, name = "state.json") {
  const file = path.join(dir, name);
  fs.writeFileSync(file, bytes, "utf8");
  return file;
}

function run(args) {
  const result = spawnSync(process.execPath, [TOOL, ...args], {
    cwd: REPO_ROOT,
    timeout: 10_000,
    encoding: "buffer",
  });
  assert.strictEqual(result.error, undefined, `spawn failed: ${result.error}`);
  assert.strictEqual(result.signal, null, "the command must terminate on its own");
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
    size: stats.size.toString(),
    mtimeNs: stats.mtimeNs.toString(),
  };
}

function directoryFingerprint(dir) {
  const stats = fs.statSync(dir, { bigint: true });
  return {
    isDirectory: stats.isDirectory(),
    mode: stats.mode.toString(8),
    size: stats.size.toString(),
    mtimeNs: stats.mtimeNs.toString(),
    entries: fs.readdirSync(dir).sort(),
  };
}

function assertNoTokens(result, tokens, label) {
  for (const token of tokens) {
    assert.ok(!result.stdout.includes(token), `${label} stdout leaked ${token}`);
    assert.ok(!result.stderr.includes(token), `${label} stderr leaked ${token}`);
  }
}

function unrelatedIdsFor(approvalId) {
  return FIXTURE_A_APPROVAL_IDS.filter(id => id !== approvalId);
}

test(
  "AC1: Frozen Fixture A returns the byte-exact zero, one, and two outbox counts and nothing else",
  { timeout: 120_000 },
  () => {
    for (const testCase of FIXTURE_A_CASES) {
      withTempDir(`ac1-${testCase.approvalId}`, dir => {
        const file = writeFixture(dir, FIXTURE_A);

        const result = run([file, testCase.approvalId]);

        assert.strictEqual(result.code, 0, `${testCase.approvalId} exit code`);
        assert.strictEqual(result.stderrBytes.length, 0, `${testCase.approvalId} stderr`);
        assert.deepStrictEqual(
          result.stdoutBytes,
          Buffer.from(testCase.stdout, "utf8"),
          `${testCase.approvalId} stdout`,
        );

        const parsed = JSON.parse(result.stdout);
        assert.deepStrictEqual(
          Object.keys(parsed),
          ["approvalId", "outboxEntries"],
          `${testCase.approvalId} key set and order`,
        );
        assert.strictEqual(parsed.approvalId, testCase.approvalId, `${testCase.approvalId} id`);
        assert.strictEqual(
          parsed.outboxEntries,
          testCase.outboxEntries,
          `${testCase.approvalId} count`,
        );

        assertNoTokens(result, SENSITIVE_TOKENS, testCase.approvalId);
        assertNoTokens(result, unrelatedIdsFor(testCase.approvalId), testCase.approvalId);
      });
    }
  },
);

test(
  "AC2: every frozen unknown ID and empty valid Fixture C exit 1 with the exact no-such-approval line",
  { timeout: 120_000 },
  () => {
    for (let i = 0; i < UNKNOWN_IDS.length; i++) {
      for (let j = i + 1; j < UNKNOWN_IDS.length; j++) {
        assert.notStrictEqual(
          UNKNOWN_IDS[i],
          UNKNOWN_IDS[j],
          `unknown IDs ${UNKNOWN_IDS[i]} and ${UNKNOWN_IDS[j]} are not byte-distinct`,
        );
      }
      for (const knownId of FIXTURE_A_APPROVAL_IDS) {
        assert.notStrictEqual(
          UNKNOWN_IDS[i],
          knownId,
          `unknown ID ${UNKNOWN_IDS[i]} collides with a Fixture A approval ID`,
        );
      }
    }

    const cases = [
      ...UNKNOWN_IDS.map((unknownId, index) => ({
        label: `a-unknown-${index}`,
        bytes: FIXTURE_A,
        approvalId: unknownId,
      })),
      { label: "c-missing", bytes: FIXTURE_C, approvalId: "appr-count-missing" },
    ];

    for (const testCase of cases) {
      withTempDir(`ac2-${testCase.label}`, dir => {
        const file = writeFixture(dir, testCase.bytes);

        const result = run([file, testCase.approvalId]);

        assert.strictEqual(result.code, 1, `${testCase.label} exit code`);
        assert.strictEqual(result.stdoutBytes.length, 0, `${testCase.label} stdout`);
        assert.deepStrictEqual(
          result.stderrBytes,
          Buffer.from(NO_SUCH_APPROVAL, "utf8"),
          `${testCase.label} stderr`,
        );
      });
    }
  },
);

test(
  "AC3: zero, one, three, or four positional arguments exit 2 with the exact usage line and touch no path",
  { timeout: 120_000 },
  () => {
    const arities = [
      { label: "zero", args: () => [] },
      { label: "one", args: statePath => [statePath] },
      { label: "three", args: statePath => [statePath, "appr-count-none", "extra-a"] },
      {
        label: "four",
        args: statePath => [statePath, "appr-count-none", "extra-a", "extra-b"],
      },
    ];

    for (const arity of arities) {
      withTempDir(`ac3-${arity.label}`, dir => {
        const statePath = path.join(dir, "state-a.json");
        assert.deepStrictEqual(fs.readdirSync(dir), [], `${arity.label} parent starts empty`);

        const result = run(arity.args(statePath));

        assert.strictEqual(result.code, 2, `${arity.label} exit code`);
        assert.strictEqual(result.stdoutBytes.length, 0, `${arity.label} stdout`);
        assert.deepStrictEqual(
          result.stderrBytes,
          Buffer.from(USAGE, "utf8"),
          `${arity.label} stderr`,
        );
        assert.strictEqual(
          fs.existsSync(statePath),
          false,
          `${arity.label} created the supplied state path`,
        );
        assert.deepStrictEqual(fs.readdirSync(dir), [], `${arity.label} parent entries`);
      });
    }
  },
);

test(
  "AC4: each frozen read-failure path exits 1 with the exact cannot-read line and is left as it was",
  { timeout: 120_000 },
  () => {
    withTempDir("ac4-missing", dir => {
      const missing = path.join(dir, "missing-state.json");
      assert.strictEqual(fs.existsSync(missing), false, "absent path starts absent");
      const parentBefore = fs.readdirSync(dir).sort();

      const result = run([missing, "appr-count-none"]);

      assert.strictEqual(result.code, 1, "absent path exit code");
      assert.strictEqual(result.stdoutBytes.length, 0, "absent path stdout");
      assert.deepStrictEqual(
        result.stderrBytes,
        Buffer.from(CANNOT_READ, "utf8"),
        "absent path stderr",
      );
      assert.strictEqual(fs.existsSync(missing), false, "absent path was created");
      assert.deepStrictEqual(fs.readdirSync(dir).sort(), parentBefore, "absent path parent entries");
    });

    withTempDir("ac4-directory", dir => {
      const stateDirectory = path.join(dir, "state-directory");
      fs.mkdirSync(stateDirectory);
      const before = directoryFingerprint(stateDirectory);
      const parentBefore = fs.readdirSync(dir).sort();

      const result = run([stateDirectory, "appr-count-none"]);

      assert.strictEqual(result.code, 1, "directory path exit code");
      assert.strictEqual(result.stdoutBytes.length, 0, "directory path stdout");
      assert.deepStrictEqual(
        result.stderrBytes,
        Buffer.from(CANNOT_READ, "utf8"),
        "directory path stderr",
      );
      assert.deepStrictEqual(
        directoryFingerprint(stateDirectory),
        before,
        "directory path fingerprint",
      );
      assert.deepStrictEqual(
        fs.readdirSync(dir).sort(),
        parentBefore,
        "directory path parent entries",
      );
    });
  },
);

test(
  "AC5: Frozen Fixture B exits 1 with the exact invalid-JSON line, unchanged bytes, and no leakage",
  { timeout: 120_000 },
  () => {
    withTempDir("ac5", dir => {
      const file = writeFixture(dir, FIXTURE_B);
      const before = fingerprint(file);
      const parentBefore = fs.readdirSync(dir).sort();

      const result = run([file, "appr-count-none"]);

      assert.strictEqual(result.code, 1, "fixture B exit code");
      assert.strictEqual(result.stdoutBytes.length, 0, "fixture B stdout");
      assert.deepStrictEqual(result.stderrBytes, Buffer.from(NOT_JSON, "utf8"), "fixture B stderr");
      assert.deepStrictEqual(fingerprint(file), before, "fixture B unchanged");
      assert.deepStrictEqual(fs.readdirSync(dir).sort(), parentBefore, "fixture B parent entries");
      assertNoTokens(result, [MALFORMED_TOKEN], "fixture B");
    });
  },
);

test(
  "AC6: every frozen structural-invalid fixture exits 1 with the exact invalid-state line and unchanged bytes",
  { timeout: 120_000 },
  () => {
    for (let i = 0; i < ALL_FIXTURES.length; i++) {
      for (let j = i + 1; j < ALL_FIXTURES.length; j++) {
        assert.notStrictEqual(
          ALL_FIXTURES[i][1],
          ALL_FIXTURES[j][1],
          `fixtures ${ALL_FIXTURES[i][0]} and ${ALL_FIXTURES[j][0]} are not byte-distinct`,
        );
      }
    }

    for (const fixture of STRUCTURAL_INVALID) {
      withTempDir(`ac6-${fixture.id.toLowerCase()}`, dir => {
        const file = writeFixture(dir, fixture.bytes);
        const before = fingerprint(file);
        const parentBefore = fs.readdirSync(dir).sort();

        const result = run([file, fixture.approvalId]);

        assert.strictEqual(result.code, 1, `${fixture.id} exit code`);
        assert.strictEqual(result.stdoutBytes.length, 0, `${fixture.id} stdout`);
        assert.deepStrictEqual(
          result.stderrBytes,
          Buffer.from(INVALID_STATE, "utf8"),
          `${fixture.id} stderr`,
        );
        assert.deepStrictEqual(fingerprint(file), before, `${fixture.id} fixture unchanged`);
        assert.deepStrictEqual(
          fs.readdirSync(dir).sort(),
          parentBefore,
          `${fixture.id} parent entries`,
        );
      });
    }
  },
);

test(
  "AC7: every invocation self-terminates, repeats byte-identically, and stays read-only and offline",
  { timeout: 120_000 },
  () => {
    for (const testCase of runtimeCases()) {
      withTempDir(`ac7-${testCase.label}`, dir => {
        const file = writeFixture(dir, testCase.bytes);
        const before = fingerprint(file);
        const parentBefore = fs.readdirSync(dir).sort();

        const result = run([file, testCase.approvalId]);

        assert.strictEqual(result.code, testCase.code, `${testCase.label} exit code`);
        assert.strictEqual(result.stdout, testCase.stdout, `${testCase.label} stdout`);
        assert.strictEqual(result.stderr, testCase.stderr, `${testCase.label} stderr`);
        assert.deepStrictEqual(fingerprint(file), before, `${testCase.label} fixture unchanged`);
        assert.deepStrictEqual(
          fs.readdirSync(dir).sort(),
          parentBefore,
          `${testCase.label} parent entries`,
        );
      });
    }

    withTempDir("ac7-repeat", dir => {
      const file = writeFixture(dir, FIXTURE_A);
      const before = fingerprint(file);

      const first = run([file, "appr-count-two"]);
      const second = run([file, "appr-count-two"]);

      assert.strictEqual(first.code, 0, "first repeat exit code");
      assert.strictEqual(second.code, 0, "second repeat exit code");
      assert.deepStrictEqual(
        first.stdoutBytes,
        Buffer.from('{"approvalId":"appr-count-two","outboxEntries":2}\n', "utf8"),
        "first repeat stdout",
      );
      assert.deepStrictEqual(second.stdoutBytes, first.stdoutBytes, "repeat stdout is identical");
      assert.deepStrictEqual(second.stderrBytes, first.stderrBytes, "repeat stderr is identical");
      assert.strictEqual(second.stderrBytes.length, 0, "repeat stderr is empty");
      assert.deepStrictEqual(fingerprint(file), before, "repeat left the fixture unchanged");
      assert.deepStrictEqual(fs.readdirSync(dir).sort(), ["state.json"], "repeat parent entries");
    });

    assert.strictEqual(fs.existsSync(TOOL), true, "app/tools/approval-outbox-count.js exists");
    const toolSource = fs.readFileSync(TOOL, "utf8");
    assert.deepStrictEqual(specifiersOf(toolSource), ["node:fs"], "Builder module specifiers");
    for (const forbidden of [
      "server.js",
      "node:http",
      "node:https",
      "node:net",
      "node:child_process",
      "fetch",
      "WebSocket",
      "setTimeout",
      "setInterval",
    ]) {
      assert.strictEqual(
        toolSource.includes(forbidden),
        false,
        `Builder file references ${forbidden}`,
      );
    }
  },
);

test(
  "AC8: no result in criteria 1-6 exposes excluded content, an input path, an OS error, or a second line",
  { timeout: 120_000 },
  () => {
    const forbiddenErrorFragments = [
      "ENOENT",
      "EISDIR",
      "EACCES",
      "SyntaxError",
      "Unexpected",
      "JSON.parse",
      "at Object",
      "at Module",
      "node:internal",
      "Error:",
    ];

    const results = [];

    for (const testCase of runtimeCases()) {
      withTempDir(`ac8-${testCase.label}`, dir => {
        const file = writeFixture(dir, testCase.bytes);
        results.push({
          label: testCase.label,
          approvalId: testCase.approvalId,
          code: testCase.code,
          paths: [file, dir],
          result: run([file, testCase.approvalId]),
        });
      });
    }

    withTempDir("ac8-arity", dir => {
      const statePath = path.join(dir, "state-a.json");
      results.push({
        label: "arity-one",
        approvalId: null,
        code: 2,
        paths: [statePath, dir],
        result: run([statePath]),
      });
    });

    withTempDir("ac8-missing", dir => {
      const missing = path.join(dir, "missing-state.json");
      results.push({
        label: "read-missing",
        approvalId: "appr-count-none",
        code: 1,
        paths: [missing, dir],
        result: run([missing, "appr-count-none"]),
      });
    });

    withTempDir("ac8-directory", dir => {
      const stateDirectory = path.join(dir, "state-directory");
      fs.mkdirSync(stateDirectory);
      results.push({
        label: "read-directory",
        approvalId: "appr-count-none",
        code: 1,
        paths: [stateDirectory, dir],
        result: run([stateDirectory, "appr-count-none"]),
      });
    });

    assert.strictEqual(
      results.length,
      runtimeCases().length + 3,
      "every criteria 1-6 result is covered",
    );

    for (const entry of results) {
      const { result, label } = entry;

      assertNoTokens(result, SENSITIVE_TOKENS, label);
      assertNoTokens(result, [MALFORMED_TOKEN], label);

      if (entry.code === 0) {
        assertNoTokens(result, unrelatedIdsFor(entry.approvalId), label);
        assert.strictEqual(result.stderr, "", `${label} wrote stderr on success`);
        continue;
      }

      assert.strictEqual(result.stdout, "", `${label} wrote stdout on failure`);
      assert.strictEqual(
        [USAGE, CANNOT_READ, NOT_JSON, INVALID_STATE, NO_SUCH_APPROVAL].includes(result.stderr),
        true,
        `${label} stderr is not one of the frozen single lines: ${JSON.stringify(result.stderr)}`,
      );
      assert.strictEqual(
        result.stderr.split("\n").length,
        2,
        `${label} stderr has a second line: ${JSON.stringify(result.stderr)}`,
      );

      for (const inputPath of entry.paths) {
        assert.ok(!result.stderr.includes(inputPath), `${label} stderr leaked the input path`);
      }
      if (entry.approvalId !== null && !USAGE.includes(entry.approvalId)) {
        assert.ok(
          !result.stderr.includes(entry.approvalId),
          `${label} stderr leaked the approval ID`,
        );
      }
      for (const fragment of forbiddenErrorFragments) {
        assert.ok(
          !result.stderr.includes(fragment),
          `${label} stderr leaked diagnostic text ${fragment}`,
        );
      }
      for (const unrelatedId of FIXTURE_A_APPROVAL_IDS) {
        assert.ok(!result.stderr.includes(unrelatedId), `${label} stderr leaked ${unrelatedId}`);
      }
    }
  },
);

test(
  "AC9: the ticket's two owned files exist and the test file keeps its frozen module specifiers",
  { timeout: 120_000 },
  () => {
    const testFile = path.join(__dirname, "approval-outbox-count.test.js");
    assert.strictEqual(
      fs.existsSync(testFile),
      true,
      "app/tests/approval-outbox-count.test.js exists",
    );
    assert.deepStrictEqual(
      specifiersOf(fs.readFileSync(testFile, "utf8")),
      ["node:assert", "node:child_process", "node:fs", "node:os", "node:path", "node:test"],
      "test-file module specifiers",
    );

    assert.strictEqual(fs.existsSync(TOOL), true, "app/tools/approval-outbox-count.js exists");
    const toolSource = fs.readFileSync(TOOL, "utf8");
    assert.ok(toolSource.length > 0, "app/tools/approval-outbox-count.js is non-empty");
    assert.ok(
      toolSource.includes("approval-outbox-count:"),
      "app/tools/approval-outbox-count.js owns the frozen error prefix",
    );
  },
);

function runtimeCases() {
  return [
    ...FIXTURE_A_CASES.map(entry => ({
      label: `a-${entry.approvalId}`,
      bytes: FIXTURE_A,
      approvalId: entry.approvalId,
      code: 0,
      stdout: entry.stdout,
      stderr: "",
    })),
    ...UNKNOWN_IDS.map((unknownId, index) => ({
      label: `unknown-${index}`,
      bytes: FIXTURE_A,
      approvalId: unknownId,
      code: 1,
      stdout: "",
      stderr: NO_SUCH_APPROVAL,
    })),
    {
      label: "c-missing",
      bytes: FIXTURE_C,
      approvalId: "appr-count-missing",
      code: 1,
      stdout: "",
      stderr: NO_SUCH_APPROVAL,
    },
    {
      label: "b",
      bytes: FIXTURE_B,
      approvalId: "appr-count-none",
      code: 1,
      stdout: "",
      stderr: NOT_JSON,
    },
    ...STRUCTURAL_INVALID.map(entry => ({
      label: entry.id.toLowerCase(),
      bytes: entry.bytes,
      approvalId: entry.approvalId,
      code: 1,
      stdout: "",
      stderr: INVALID_STATE,
    })),
  ];
}

function specifiersOf(source) {
  const found = new Set();
  const pattern = /require\(\s*"([^"]+)"\s*\)/g;
  let match = pattern.exec(source);
  while (match !== null) {
    found.add(match[1]);
    match = pattern.exec(source);
  }
  return [...found].sort();
}

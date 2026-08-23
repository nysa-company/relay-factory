const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const TOOL = path.join(__dirname, "..", "tools", "approval-timestamp.js");
const REPO_ROOT = path.join(__dirname, "..", "..");

const USAGE =
  "usage: node app/tools/approval-timestamp.js <state-file> <approval-id>\n";
const CANNOT_READ = "approval-timestamp: cannot read state file\n";
const NOT_JSON = "approval-timestamp: state file is not valid JSON\n";
const INVALID_STATE = "approval-timestamp: invalid Relay state\n";
const NO_SUCH_APPROVAL = "approval-timestamp: no such approval\n";

const FIXTURE_A = `{
  "events": [
    {
      "id": "event-timestamp-private",
      "type": "meeting",
      "payload": {
        "private": "EVENT-PAYLOAD-MUST-NOT-LEAK"
      },
      "receivedAt": "2026-08-23T12:00:00.000Z"
    }
  ],
  "jobs": [
    {
      "id": "job-timestamp-private",
      "eventId": "event-timestamp-private",
      "status": "dead",
      "attempts": 3,
      "lastError": "JOB-ERROR-MUST-NOT-LEAK",
      "retries": 0,
      "attemptsSinceRetry": 3
    }
  ],
  "approvals": [
    {
      "id": "appr-timestamp-pending",
      "jobId": "job-timestamp-pending",
      "action": {
        "to": "PENDING-TO-MUST-NOT-LEAK",
        "subject": "PENDING-SUBJECT-MUST-NOT-LEAK",
        "body": "PENDING-BODY-MUST-NOT-LEAK"
      },
      "status": "pending",
      "proposedAt": "2026-08-23T12:00:01.000Z"
    },
    {
      "id": "appr-timestamp-sent",
      "jobId": "job-timestamp-sent",
      "action": {
        "to": "SENT-TO-MUST-NOT-LEAK",
        "subject": "SENT-SUBJECT-MUST-NOT-LEAK",
        "body": "SENT-BODY-MUST-NOT-LEAK"
      },
      "status": "sent",
      "proposedAt": "2026-08-23T12:00:02.000Z"
    },
    {
      "id": "appr-timestamp-rejected",
      "jobId": "job-timestamp-rejected",
      "action": {
        "to": "REJECTED-TO-MUST-NOT-LEAK",
        "subject": "REJECTED-SUBJECT-MUST-NOT-LEAK",
        "body": "REJECTED-BODY-MUST-NOT-LEAK"
      },
      "status": "rejected",
      "proposedAt": "2026-08-23T12:00:03.000Z",
      "reason": "REJECTION-REASON-MUST-NOT-LEAK"
    },
    {
      "id": "appr-timestamp-blocked",
      "jobId": "job-timestamp-blocked",
      "action": {
        "to": "BLOCKED-TO-MUST-NOT-LEAK",
        "subject": "BLOCKED-SUBJECT-MUST-NOT-LEAK",
        "body": "BLOCKED-BODY-MUST-NOT-LEAK"
      },
      "status": "blocked_recipient",
      "proposedAt": "2026-08-23T12:00:04.000Z"
    }
  ],
  "outbox": [
    {
      "approvalId": "appr-timestamp-sent",
      "body": "OUTBOX-CONTENT-MUST-NOT-LEAK",
      "sentAt": "2026-08-23T12:00:05.000Z"
    }
  ],
  "metadata": {
    "note": "STATE-CONTENT-MUST-NOT-LEAK"
  }
}
`;

const FIXTURE_B = '{"events":[],"secret":"MALFORMED-STATE-MUST-NOT-LEAK\n';

const FIXTURE_A_CASES = [
  {
    approvalId: "appr-timestamp-pending",
    stdout:
      '{"approvalId":"appr-timestamp-pending","status":"pending","proposedAt":"2026-08-23T12:00:01.000Z"}\n',
  },
  {
    approvalId: "appr-timestamp-sent",
    stdout:
      '{"approvalId":"appr-timestamp-sent","status":"sent","proposedAt":"2026-08-23T12:00:02.000Z"}\n',
  },
  {
    approvalId: "appr-timestamp-rejected",
    stdout:
      '{"approvalId":"appr-timestamp-rejected","status":"rejected","proposedAt":"2026-08-23T12:00:03.000Z"}\n',
  },
  {
    approvalId: "appr-timestamp-blocked",
    stdout:
      '{"approvalId":"appr-timestamp-blocked","status":"blocked_recipient","proposedAt":"2026-08-23T12:00:04.000Z"}\n',
  },
];

const FIXTURE_A_IDS = FIXTURE_A_CASES.map(entry => entry.approvalId);

const SENSITIVE_TOKENS = [
  "EVENT-PAYLOAD-MUST-NOT-LEAK",
  "JOB-ERROR-MUST-NOT-LEAK",
  "PENDING-TO-MUST-NOT-LEAK",
  "PENDING-SUBJECT-MUST-NOT-LEAK",
  "PENDING-BODY-MUST-NOT-LEAK",
  "SENT-TO-MUST-NOT-LEAK",
  "SENT-SUBJECT-MUST-NOT-LEAK",
  "SENT-BODY-MUST-NOT-LEAK",
  "REJECTED-TO-MUST-NOT-LEAK",
  "REJECTED-SUBJECT-MUST-NOT-LEAK",
  "REJECTED-BODY-MUST-NOT-LEAK",
  "REJECTION-REASON-MUST-NOT-LEAK",
  "BLOCKED-TO-MUST-NOT-LEAK",
  "BLOCKED-SUBJECT-MUST-NOT-LEAK",
  "BLOCKED-BODY-MUST-NOT-LEAK",
  "OUTBOX-CONTENT-MUST-NOT-LEAK",
  "STATE-CONTENT-MUST-NOT-LEAK",
];

const UNKNOWN_IDS = [
  "appr-timestamp-missing",
  "APPR-TIMESTAMP-PENDING",
  "appr-timestamp-pending ",
];

const STRUCTURAL_INVALID = [
  { id: "S1", json: "null", approvalId: "appr-timestamp-pending" },
  { id: "S2", json: "[]", approvalId: "appr-timestamp-pending" },
  {
    id: "S3",
    json: '{"events":[],"jobs":[],"approvals":[]}',
    approvalId: "appr-timestamp-pending",
  },
  {
    id: "S4",
    json: '{"events":{},"jobs":[],"approvals":[],"outbox":[]}',
    approvalId: "appr-timestamp-pending",
  },
  {
    id: "S5",
    json: '{"events":[],"jobs":{},"approvals":[],"outbox":[]}',
    approvalId: "appr-timestamp-pending",
  },
  {
    id: "S6",
    json: '{"events":[],"jobs":[],"approvals":{},"outbox":[]}',
    approvalId: "appr-timestamp-pending",
  },
  {
    id: "S7",
    json: '{"events":[],"jobs":[],"approvals":[],"outbox":{}}',
    approvalId: "appr-timestamp-pending",
  },
  {
    id: "S8",
    json: '{"events":[],"jobs":[],"approvals":[null],"outbox":[]}',
    approvalId: "appr-timestamp-pending",
  },
  {
    id: "S9",
    json: '{"events":[],"jobs":[],"approvals":[[]],"outbox":[]}',
    approvalId: "appr-timestamp-pending",
  },
  {
    id: "S10",
    json: '{"events":[],"jobs":[],"approvals":[{"id":7,"status":"pending","proposedAt":"2026-08-23T12:00:01.000Z"}],"outbox":[]}',
    approvalId: "appr-timestamp-pending",
  },
  {
    id: "S11",
    json: '{"events":[],"jobs":[],"approvals":[{"id":"","status":"pending","proposedAt":"2026-08-23T12:00:01.000Z"}],"outbox":[]}',
    approvalId: "appr-timestamp-pending",
  },
  {
    id: "S12",
    json: '{"events":[],"jobs":[],"approvals":[{"id":"appr-invalid","status":null,"proposedAt":"2026-08-23T12:00:01.000Z"}],"outbox":[]}',
    approvalId: "appr-invalid",
  },
  {
    id: "S13",
    json: '{"events":[],"jobs":[],"approvals":[{"id":"appr-invalid","status":"PENDING","proposedAt":"2026-08-23T12:00:01.000Z"}],"outbox":[]}',
    approvalId: "appr-invalid",
  },
  {
    id: "S14",
    json: '{"events":[],"jobs":[],"approvals":[{"id":"appr-invalid","status":"pending"}],"outbox":[]}',
    approvalId: "appr-invalid",
  },
  {
    id: "S15",
    json: '{"events":[],"jobs":[],"approvals":[{"id":"appr-invalid","status":"pending","proposedAt":""}],"outbox":[]}',
    approvalId: "appr-invalid",
  },
  {
    id: "S16",
    json: '{"events":[],"jobs":[],"approvals":[{"id":"appr-invalid","status":"pending","proposedAt":null}],"outbox":[]}',
    approvalId: "appr-invalid",
  },
  {
    id: "S17",
    json: '{"events":[],"jobs":[],"approvals":[{"id":"appr-duplicate","status":"pending","proposedAt":"2026-08-23T12:00:01.000Z"},{"id":"appr-duplicate","status":"sent","proposedAt":"2026-08-23T12:00:02.000Z"}],"outbox":[]}',
    approvalId: "appr-duplicate",
  },
].map(entry => ({ id: entry.id, bytes: `${entry.json}\n`, approvalId: entry.approvalId }));

function withTempDir(label, body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `relay-approval-timestamp-${label}-`));
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

function assertNoTokens(result, tokens, label) {
  for (const token of tokens) {
    assert.ok(!result.stdout.includes(token), `${label} stdout leaked ${token}`);
    assert.ok(!result.stderr.includes(token), `${label} stderr leaked ${token}`);
  }
}

test(
  "AC1: Frozen Fixture A returns each approval's byte-exact timestamp projection and leaks nothing else",
  { timeout: 10_000 },
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
          ["approvalId", "status", "proposedAt"],
          `${testCase.approvalId} key set and order`,
        );

        assertNoTokens(result, SENSITIVE_TOKENS, testCase.approvalId);
        assertNoTokens(
          result,
          FIXTURE_A_IDS.filter(id => id !== testCase.approvalId),
          testCase.approvalId,
        );
      });
    }
  },
);

test(
  "AC2: each frozen unknown ID exits 1 with the exact no-such-approval line",
  { timeout: 10_000 },
  () => {
    for (const validId of FIXTURE_A_IDS) {
      for (const unknownId of UNKNOWN_IDS) {
        assert.notStrictEqual(unknownId, validId, `${unknownId} collides with a Fixture A ID`);
      }
    }

    for (let i = 0; i < UNKNOWN_IDS.length; i++) {
      for (let j = i + 1; j < UNKNOWN_IDS.length; j++) {
        assert.notStrictEqual(
          UNKNOWN_IDS[i],
          UNKNOWN_IDS[j],
          `unknown IDs ${i} and ${j} are not byte-distinct`,
        );
      }
    }

    for (const unknownId of UNKNOWN_IDS) {
      withTempDir(`ac2-${Buffer.from(unknownId).toString("hex")}`, dir => {
        const file = writeFixture(dir, FIXTURE_A);

        const result = run([file, unknownId]);

        assert.strictEqual(result.code, 1, `${unknownId} exit code`);
        assert.strictEqual(result.stdoutBytes.length, 0, `${unknownId} stdout`);
        assert.deepStrictEqual(
          result.stderrBytes,
          Buffer.from(NO_SUCH_APPROVAL, "utf8"),
          `${unknownId} stderr`,
        );
      });
    }
  },
);

test(
  "AC3: zero, one, or three positional arguments exit 2 with the exact usage line and create no path",
  { timeout: 10_000 },
  () => {
    const arities = [
      { label: "zero", args: () => [] },
      { label: "one", args: dir => [path.join(dir, "state-a.json")] },
      {
        label: "three",
        args: dir => [path.join(dir, "state-a.json"), "appr-timestamp-pending", "extra"],
      },
    ];

    for (const arity of arities) {
      withTempDir(`ac3-${arity.label}`, dir => {
        assert.deepStrictEqual(fs.readdirSync(dir), [], `${arity.label} parent starts empty`);
        const args = arity.args(dir);

        const result = run(args);

        assert.strictEqual(result.code, 2, `${arity.label} exit code`);
        assert.strictEqual(result.stdoutBytes.length, 0, `${arity.label} stdout`);
        assert.deepStrictEqual(
          result.stderrBytes,
          Buffer.from(USAGE, "utf8"),
          `${arity.label} stderr`,
        );
        assert.deepStrictEqual(fs.readdirSync(dir), [], `${arity.label} parent entries`);
        assert.strictEqual(
          fs.existsSync(path.join(dir, "state-a.json")),
          false,
          `${arity.label} created the supplied state path`,
        );
      });
    }
  },
);

test(
  "AC4: each frozen read-failure path exits 1 with the exact cannot-read line and is left as it was",
  { timeout: 10_000 },
  () => {
    withTempDir("ac4-missing", dir => {
      const missing = path.join(dir, "missing-state.json");
      assert.strictEqual(fs.existsSync(missing), false, "absent path starts absent");

      const result = run([missing, "appr-timestamp-pending"]);

      assert.strictEqual(result.code, 1);
      assert.strictEqual(result.stdoutBytes.length, 0);
      assert.deepStrictEqual(result.stderrBytes, Buffer.from(CANNOT_READ, "utf8"));
      assert.strictEqual(fs.existsSync(missing), false, "absent path was created");
      assert.deepStrictEqual(fs.readdirSync(dir).sort(), []);
    });

    withTempDir("ac4-directory", dir => {
      const stateDirectory = path.join(dir, "state-directory");
      fs.mkdirSync(stateDirectory);
      const statsBefore = fs.statSync(stateDirectory, { bigint: true });
      const entriesBefore = fs.readdirSync(stateDirectory).sort();
      const parentBefore = fs.readdirSync(dir).sort();

      const result = run([stateDirectory, "appr-timestamp-pending"]);

      assert.strictEqual(result.code, 1);
      assert.strictEqual(result.stdoutBytes.length, 0);
      assert.deepStrictEqual(result.stderrBytes, Buffer.from(CANNOT_READ, "utf8"));

      const statsAfter = fs.statSync(stateDirectory, { bigint: true });
      assert.strictEqual(statsAfter.isDirectory(), true, "state-directory is still a directory");
      assert.strictEqual(statsAfter.mode.toString(8), statsBefore.mode.toString(8));
      assert.strictEqual(statsAfter.size.toString(), statsBefore.size.toString());
      assert.strictEqual(statsAfter.mtimeNs.toString(), statsBefore.mtimeNs.toString());
      assert.deepStrictEqual(fs.readdirSync(stateDirectory).sort(), entriesBefore);
      assert.deepStrictEqual(fs.readdirSync(dir).sort(), parentBefore);
    });
  },
);

test(
  "AC5: Frozen Fixture B exits 1 with the exact invalid-JSON line, unchanged bytes, and no leakage",
  { timeout: 10_000 },
  () => {
    withTempDir("ac5", dir => {
      const file = writeFixture(dir, FIXTURE_B);
      const before = fingerprint(file);
      const siblingsBefore = fs.readdirSync(dir).sort();

      const result = run([file, "appr-timestamp-pending"]);

      assert.strictEqual(result.code, 1);
      assert.strictEqual(result.stdoutBytes.length, 0);
      assert.deepStrictEqual(result.stderrBytes, Buffer.from(NOT_JSON, "utf8"));
      assert.deepStrictEqual(fingerprint(file), before);
      assert.deepStrictEqual(fs.readdirSync(dir).sort(), siblingsBefore);
      assertNoTokens(result, ["MALFORMED-STATE-MUST-NOT-LEAK"], "fixture B");
    });
  },
);

test(
  "AC6: every frozen structural-invalid fixture exits 1 with the exact invalid-state line and unchanged bytes",
  { timeout: 10_000 },
  () => {
    const allFixtures = [
      ["A", FIXTURE_A],
      ["B", FIXTURE_B],
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
        const siblingsBefore = fs.readdirSync(dir).sort();

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
          siblingsBefore,
          `${fixture.id} wrote a sibling path`,
        );
      });
    }
  },
);

test(
  "AC7: every invocation self-terminates, repeats byte-identically, and stays read-only and offline",
  { timeout: 10_000 },
  () => {
    const cases = [
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
        label: "b",
        bytes: FIXTURE_B,
        approvalId: "appr-timestamp-pending",
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

    for (const testCase of cases) {
      withTempDir(`ac7-${testCase.label}`, dir => {
        const file = writeFixture(dir, testCase.bytes);
        const before = fingerprint(file);
        const siblingsBefore = fs.readdirSync(dir).sort();

        const result = run([file, testCase.approvalId]);

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

      const first = run([file, "appr-timestamp-pending"]);
      const second = run([file, "appr-timestamp-pending"]);

      assert.strictEqual(first.code, 0);
      assert.strictEqual(second.code, 0);
      assert.deepStrictEqual(first.stdoutBytes, Buffer.from(FIXTURE_A_CASES[0].stdout, "utf8"));
      assert.deepStrictEqual(second.stdoutBytes, first.stdoutBytes);
      assert.deepStrictEqual(second.stderrBytes, first.stderrBytes);
      assert.strictEqual(second.stderrBytes.length, 0);
      assert.deepStrictEqual(fingerprint(file), before);
      assert.deepStrictEqual(fs.readdirSync(dir).sort(), ["state.json"]);
    });

    const specifiersOf = source => {
      const found = new Set();
      const pattern = /require\(\s*"([^"]+)"\s*\)/g;
      let match = pattern.exec(source);
      while (match !== null) {
        found.add(match[1]);
        match = pattern.exec(source);
      }
      return [...found].sort();
    };

    const fsOperationsOf = source => {
      const found = new Set();
      const destructured = /const\s*\{([^}]*)\}\s*=\s*require\(\s*"node:fs"\s*\)/g;
      let match = destructured.exec(source);
      while (match !== null) {
        for (const part of match[1].split(",")) {
          const name = part.split(":").pop().trim();
          if (name.length > 0) {
            found.add(name);
          }
        }
        match = destructured.exec(source);
      }

      const bound = /const\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*"node:fs"\s*\)/g;
      match = bound.exec(source);
      while (match !== null) {
        const usage = new RegExp(`\\b${match[1]}\\.([A-Za-z_$][\\w$]*)`, "g");
        let use = usage.exec(source);
        while (use !== null) {
          found.add(use[1]);
          use = usage.exec(source);
        }
        match = bound.exec(source);
      }

      return [...found].sort();
    };

    assert.strictEqual(fs.existsSync(TOOL), true, "app/tools/approval-timestamp.js exists");
    const toolSource = fs.readFileSync(TOOL, "utf8");
    assert.deepStrictEqual(specifiersOf(toolSource), ["node:fs"]);
    assert.deepStrictEqual(fsOperationsOf(toolSource), ["readFileSync", "statSync"]);
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
        `production file references ${forbidden}`,
      );
    }
  },
);

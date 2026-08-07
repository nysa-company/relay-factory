const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const TOOL = path.join(__dirname, "..", "tools", "dead-jobs.js");
const INVALID_STATE_ERROR = "dead-jobs: invalid Relay state\n";
const USAGE_ERROR = "Usage: node app/tools/dead-jobs.js <state-file>\n";

const FIXTURE_A = `{
  "events": [
    {
      "id": "zeta",
      "type": "meeting",
      "payload": {
        "failTimes": 99
      },
      "receivedAt": "2026-08-06T20:00:00.000Z"
    },
    {
      "id": "middle",
      "type": "generic",
      "payload": {},
      "receivedAt": "2026-08-06T20:00:01.000Z"
    },
    {
      "id": "alpha",
      "type": "email",
      "payload": {
        "failTimes": 3
      },
      "receivedAt": "2026-08-06T20:00:02.000Z"
    },
    {
      "id": "Zulu",
      "type": "generic",
      "payload": {
        "failTimes": 99
      },
      "receivedAt": "2026-08-06T20:00:03.000Z"
    },
    {
      "id": "pending",
      "type": "generic",
      "payload": {},
      "receivedAt": "2026-08-06T20:00:04.000Z"
    }
  ],
  "jobs": [
    {
      "id": "job-zeta",
      "eventId": "zeta",
      "status": "dead",
      "attempts": 6,
      "lastError": "simulated failure on attempt 6",
      "retries": 1,
      "attemptsSinceRetry": 3
    },
    {
      "id": "job-middle",
      "eventId": "middle",
      "status": "done",
      "attempts": 1,
      "lastError": null,
      "retries": 0,
      "attemptsSinceRetry": 1
    },
    {
      "id": "job-alpha",
      "eventId": "alpha",
      "status": "dead",
      "attempts": 3,
      "lastError": "simulated failure on attempt 3",
      "retries": 0,
      "attemptsSinceRetry": 3
    },
    {
      "id": "job-Zulu",
      "eventId": "Zulu",
      "status": "dead",
      "attempts": 9,
      "lastError": "simulated failure on attempt 9",
      "retries": 2,
      "attemptsSinceRetry": 3
    },
    {
      "id": "job-pending",
      "eventId": "pending",
      "status": "pending",
      "attempts": 0,
      "lastError": null,
      "retries": 0,
      "attemptsSinceRetry": 0
    }
  ],
  "approvals": [
    {
      "id": "appr-middle",
      "jobId": "job-middle",
      "action": {
        "to": "test@example.com",
        "subject": "Middle action",
        "body": "Not part of the dead-job report."
      },
      "status": "sent",
      "proposedAt": "2026-08-06T20:00:05.000Z"
    }
  ],
  "outbox": [
    {
      "to": "test@example.com",
      "subject": "Middle action",
      "body": "Not part of the dead-job report.",
      "approvalId": "appr-middle",
      "sentAt": "2026-08-06T20:00:06.000Z"
    }
  ]
}
`;

const FIXTURE_A_STDOUT =
  '[{"id":"job-Zulu","eventId":"Zulu","attempts":9,"retries":2},' +
  '{"id":"job-alpha","eventId":"alpha","attempts":3,"retries":0},' +
  '{"id":"job-zeta","eventId":"zeta","attempts":6,"retries":1}]\n';

const FIXTURE_B = `{
  "events": [],
  "jobs": [],
  "approvals": [],
  "outbox": []
}
`;

const FIXTURE_C = '{"outbox":["opaque-outbox"],"approvals":[42],"jobs":[],"events":[null]}\n';

const EMPTY_STDOUT = "[]\n";

function makeTempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `relay-dead-jobs-${label}-`));
}

function writeFixture(dir, name, contents) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, contents);
  return file;
}

function snapshotFile(file) {
  const stat = fs.statSync(file);
  return {
    bytes: fs.readFileSync(file).toString("hex"),
    mode: stat.mode,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
  };
}

function snapshotDirectory(dir) {
  const stat = fs.statSync(dir);
  return {
    entries: fs.readdirSync(dir).sort(),
    mode: stat.mode,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
  };
}

function entryNames(dir) {
  return fs.readdirSync(dir).sort();
}

function runTool(args) {
  const result = spawnSync(process.execPath, [TOOL, ...args], { stdio: "pipe" });
  assert.strictEqual(result.error, undefined, `spawn failed: ${result.error && result.error.message}`);
  assert.strictEqual(result.signal, null, `child terminated by signal ${result.signal}`);
  return {
    status: result.status,
    stdout: result.stdout.toString("utf8"),
    stderr: result.stderr.toString("utf8"),
  };
}

test("AC1: Fixture A reports the sorted four-field projection of its dead jobs and is left byte-identical", () => {
  const dir = makeTempDir("ac1");
  try {
    const fixture = writeFixture(dir, "state-a.json", FIXTURE_A);
    const before = snapshotFile(fixture);
    const parentBefore = entryNames(dir);

    const result = runTool([fixture]);

    assert.strictEqual(result.stderr, "");
    assert.strictEqual(result.stdout, FIXTURE_A_STDOUT);
    assert.strictEqual(result.status, 0);
    assert.deepStrictEqual(snapshotFile(fixture), before);
    assert.deepStrictEqual(entryNames(dir), parentBefore);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AC2: Fixtures B and C each report an empty array and are left byte-identical", () => {
  for (const [label, name, contents] of [
    ["ac2-b", "state-b.json", FIXTURE_B],
    ["ac2-c", "state-c.json", FIXTURE_C],
  ]) {
    const dir = makeTempDir(label);
    try {
      const fixture = writeFixture(dir, name, contents);
      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);

      const result = runTool([fixture]);

      assert.strictEqual(result.stderr, "", `stderr for ${name}`);
      assert.strictEqual(result.stdout, EMPTY_STDOUT, `stdout for ${name}`);
      assert.strictEqual(result.status, 0, `exit code for ${name}`);
      assert.deepStrictEqual(snapshotFile(fixture), before, `bytes and stat for ${name}`);
      assert.deepStrictEqual(entryNames(dir), parentBefore, `parent entries for ${name}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("AC3: every frozen invalid input fails with the exact invalid-state envelope and changes nothing on disk", () => {
  const fileCases = [
    ["malformed-json", "state.json", '{"events":[]'],
    ["wrong-events-type", "state.json", '{"events":{},"jobs":[],"approvals":[],"outbox":[]}\n'],
    ["wrong-jobs-type", "state.json", '{"events":[],"jobs":{},"approvals":[],"outbox":[]}\n'],
    ["wrong-approvals-type", "state.json", '{"events":[],"jobs":[],"approvals":{},"outbox":[]}\n'],
    ["wrong-outbox-type", "state.json", '{"events":[],"jobs":[],"approvals":[],"outbox":{}}\n'],
    ["null-top-level", "state.json", "null\n"],
    ["array-top-level", "state.json", "[]\n"],
    [
      "invalid-job-field",
      "state.json",
      '{"events":[],"jobs":[{"id":"job-bad-status","eventId":"bad-status","status":"DEAD",' +
        '"attempts":3,"lastError":"simulated failure on attempt 3","retries":0,' +
        '"attemptsSinceRetry":3}],"approvals":[],"outbox":[]}\n',
    ],
    [
      "extra-top-level-property",
      "state.json",
      '{"events":[],"jobs":[],"approvals":[],"outbox":[],"metadata":[]}\n',
    ],
    [
      "misnamed-top-level-property",
      "state.json",
      '{"events":[],"jobs":[],"approvals":[],"metadata":[]}\n',
    ],
    [
      "negative-job-counter",
      "state.json",
      '{"events":[],"jobs":[{"id":"job-negative","eventId":"negative","status":"dead",' +
        '"attempts":3,"lastError":null,"retries":-1,"attemptsSinceRetry":3}],' +
        '"approvals":[],"outbox":[]}\n',
    ],
  ];

  const nonexistentDir = makeTempDir("ac3-nonexistent");
  try {
    const missing = path.join(nonexistentDir, "missing-state.json");
    const parentBefore = entryNames(nonexistentDir);

    const result = runTool([missing]);

    assert.strictEqual(result.stdout, "", "stdout for nonexistent path");
    assert.strictEqual(result.stderr, INVALID_STATE_ERROR, "stderr for nonexistent path");
    assert.strictEqual(result.status, 1, "exit code for nonexistent path");
    assert.strictEqual(fs.existsSync(missing), false, "nonexistent path stayed absent");
    assert.deepStrictEqual(entryNames(nonexistentDir), parentBefore, "parent entries for nonexistent path");
  } finally {
    fs.rmSync(nonexistentDir, { recursive: true, force: true });
  }

  const directoryDir = makeTempDir("ac3-directory");
  try {
    const stateDirectory = path.join(directoryDir, "state-directory");
    fs.mkdirSync(stateDirectory);
    const before = snapshotDirectory(stateDirectory);
    const parentBefore = entryNames(directoryDir);

    const result = runTool([stateDirectory]);

    assert.strictEqual(result.stdout, "", "stdout for directory path");
    assert.strictEqual(result.stderr, INVALID_STATE_ERROR, "stderr for directory path");
    assert.strictEqual(result.status, 1, "exit code for directory path");
    assert.deepStrictEqual(snapshotDirectory(stateDirectory), before, "directory stayed empty and unchanged");
    assert.deepStrictEqual(entryNames(directoryDir), parentBefore, "parent entries for directory path");
  } finally {
    fs.rmSync(directoryDir, { recursive: true, force: true });
  }

  for (const [label, name, contents] of fileCases) {
    const dir = makeTempDir(`ac3-${label}`);
    try {
      const fixture = writeFixture(dir, name, contents);
      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);

      const result = runTool([fixture]);

      assert.strictEqual(result.stdout, "", `stdout for ${label}`);
      assert.strictEqual(result.stderr, INVALID_STATE_ERROR, `stderr for ${label}`);
      assert.strictEqual(result.status, 1, `exit code for ${label}`);
      assert.deepStrictEqual(snapshotFile(fixture), before, `bytes and stat for ${label}`);
      assert.deepStrictEqual(entryNames(dir), parentBefore, `parent entries for ${label}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("AC4: zero and two state-file arguments fail with the exact usage envelope and read nothing", () => {
  const zeroArgs = runTool([]);
  assert.strictEqual(zeroArgs.stdout, "", "stdout for zero arguments");
  assert.strictEqual(zeroArgs.stderr, USAGE_ERROR, "stderr for zero arguments");
  assert.strictEqual(zeroArgs.status, 1, "exit code for zero arguments");

  const dir = makeTempDir("ac4-two-args");
  try {
    const fixtureA = writeFixture(dir, "state-a.json", FIXTURE_A);
    const fixtureB = writeFixture(dir, "state-b.json", FIXTURE_B);
    const beforeA = snapshotFile(fixtureA);
    const beforeB = snapshotFile(fixtureB);
    const parentBefore = entryNames(dir);

    const twoArgs = runTool([fixtureA, fixtureB]);

    assert.strictEqual(twoArgs.stdout, "", "stdout for two arguments");
    assert.strictEqual(twoArgs.stderr, USAGE_ERROR, "stderr for two arguments");
    assert.strictEqual(twoArgs.status, 1, "exit code for two arguments");
    assert.deepStrictEqual(snapshotFile(fixtureA), beforeA, "Fixture A bytes and stat");
    assert.deepStrictEqual(snapshotFile(fixtureB), beforeB, "Fixture B bytes and stat");
    assert.deepStrictEqual(entryNames(dir), parentBefore, "shared parent entries");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AC5: static inspection finds only the frozen module specifiers and no server.js reference", () => {
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

  const testSource = fs.readFileSync(path.join(__dirname, "dead-jobs.test.js"), "utf8");
  assert.deepStrictEqual(specifiersOf(testSource), [
    "node:assert",
    "node:child_process",
    "node:fs",
    "node:os",
    "node:path",
    "node:test",
  ]);

  assert.strictEqual(fs.existsSync(TOOL), true, "app/tools/dead-jobs.js exists");
  const toolSource = fs.readFileSync(TOOL, "utf8");
  assert.deepStrictEqual(specifiersOf(toolSource), ["node:fs"]);
  assert.strictEqual(/server\.js/.test(toolSource), false, "production file references server.js");
});

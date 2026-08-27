const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const TOOL = path.join(__dirname, "..", "tools", "job-attempts.js");

const USAGE_ERROR = "usage: node app/tools/job-attempts.js <state-file> <job-id>\n";
const UNREADABLE_ERROR = "job-attempts: state file is unreadable\n";
const NOT_JSON_ERROR = "job-attempts: state file is not valid JSON\n";
const INVALID_STATE_ERROR = "job-attempts: state file has invalid Relay state\n";
const NO_SUCH_JOB_ERROR = "job-attempts: no such job\n";

const FIXTURE_A_VALUE = {
  events: [
    {
      id: "attempts-pending",
      type: "meeting",
      payload: {
        private: "EVENT-PAYLOAD-SENTINEL",
      },
      receivedAt: "2026-08-23T06:00:00.000Z",
    },
    {
      id: "attempts-done",
      type: "email",
      payload: {
        failTimes: 3,
      },
      receivedAt: "2026-08-23T06:00:01.000Z",
    },
    {
      id: "attempts-dead",
      type: "generic",
      payload: {
        failTimes: 99,
      },
      receivedAt: "2026-08-23T06:00:02.000Z",
    },
  ],
  jobs: [
    {
      id: "job-attempts-pending",
      eventId: "attempts-pending",
      status: "pending",
      attempts: 0,
      lastError: null,
      retries: 0,
      attemptsSinceRetry: 0,
    },
    {
      id: "job-attempts-done",
      eventId: "attempts-done",
      status: "done",
      attempts: 4,
      lastError: null,
      retries: 1,
      attemptsSinceRetry: 1,
    },
    {
      id: "job-attempts-dead",
      eventId: "attempts-dead",
      status: "dead",
      attempts: 6,
      lastError: "JOB-ERROR-SENTINEL",
      retries: 1,
      attemptsSinceRetry: 3,
      ignoredDiagnostic: "IGNORED-JOB-FIELD-SENTINEL",
    },
  ],
  approvals: [
    {
      id: "appr-attempts-done",
      jobId: "job-attempts-done",
      action: {
        to: "private@example.com",
        subject: "APPROVAL-ACTION-SENTINEL",
        body: "private approval body",
      },
      status: "rejected",
      reason: "REJECTION-REASON-SENTINEL",
      proposedAt: "2026-08-23T06:00:03.000Z",
    },
  ],
  outbox: [
    {
      to: "private@example.com",
      subject: "private receipt",
      body: "OUTBOX-CONTENT-SENTINEL",
      approvalId: "appr-attempts-done",
      sentAt: "2026-08-23T06:00:04.000Z",
    },
  ],
};

const FIXTURE_A = JSON.stringify(FIXTURE_A_VALUE, null, 2) + "\n";

const FIXTURE_A_STDOUT = {
  "job-attempts-pending":
    '{"jobId":"job-attempts-pending","attempts":0,"attemptsSinceRetry":0}\n',
  "job-attempts-done":
    '{"jobId":"job-attempts-done","attempts":4,"attemptsSinceRetry":1}\n',
  "job-attempts-dead":
    '{"jobId":"job-attempts-dead","attempts":6,"attemptsSinceRetry":3}\n',
};

const OUTPUT_KEYS = ["jobId", "attempts", "attemptsSinceRetry"];

const FIXTURE_A_SENTINELS = [
  "EVENT-PAYLOAD-SENTINEL",
  "JOB-ERROR-SENTINEL",
  "IGNORED-JOB-FIELD-SENTINEL",
  "APPROVAL-ACTION-SENTINEL",
  "REJECTION-REASON-SENTINEL",
  "OUTBOX-CONTENT-SENTINEL",
];

const FAILURE_SENTINELS = [
  ...FIXTURE_A_SENTINELS,
  "PATH-SENTINEL",
  "DIRECTORY-PATH-SENTINEL",
  "MALFORMED-STATE-SENTINEL",
  "JOB-ATTEMPTS-DUP-ERROR-SENTINEL",
];

const FIXTURE_B = '{"events":[],"private":"MALFORMED-STATE-SENTINEL';

const UNKNOWN_IDS = ["JOB-ATTEMPTS-DEAD", "job-attempts-missing", "job-attempts-dead "];

const MISSING_STATE_NAME = "PATH-SENTINEL-missing-state.json";
const DIRECTORY_STATE_NAME = "DIRECTORY-PATH-SENTINEL";
const ARITY_MISSING_NAME = "arity-state-does-not-exist.json";

const DEFAULT_PRE_LOOKUP_ID = "job-attempts-dead";

const STRUCTURAL_FIXTURES = [
  ["S1", "null"],
  ["S2", "[]"],
  ["S3", '{"events":{},"jobs":[],"approvals":[],"outbox":[]}'],
  ["S4", '{"events":[],"jobs":{},"approvals":[],"outbox":[]}'],
  ["S5", '{"events":[],"jobs":[],"approvals":{},"outbox":[]}'],
  ["S6", '{"events":[],"jobs":[],"approvals":[],"outbox":{}}'],
  ["S7", '{"events":[],"jobs":[],"approvals":[],"outbox":[],"metadata":[]}'],
  ["S8", '{"events":[],"jobs":[],"approvals":[]}'],
  ["S9", '{"events":[],"jobs":[null],"approvals":[],"outbox":[]}'],
  ["S10", '{"events":[],"jobs":[[]],"approvals":[],"outbox":[]}'],
  [
    "S11",
    '{"events":[],"jobs":[{"id":"","eventId":"event-invalid","status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0}],"approvals":[],"outbox":[]}',
  ],
  [
    "S12",
    '{"events":[],"jobs":[{"id":7,"eventId":"event-invalid","status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0}],"approvals":[],"outbox":[]}',
  ],
  [
    "S13",
    '{"events":[],"jobs":[{"id":"job-invalid-event-empty","eventId":"","status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0}],"approvals":[],"outbox":[]}',
  ],
  [
    "S14",
    '{"events":[],"jobs":[{"id":"job-invalid-event-type","eventId":7,"status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0}],"approvals":[],"outbox":[]}',
  ],
  [
    "S15",
    '{"events":[],"jobs":[{"id":"job-invalid-status-case","eventId":"event-invalid","status":"DEAD","attempts":3,"lastError":null,"retries":0,"attemptsSinceRetry":3}],"approvals":[],"outbox":[]}',
  ],
  [
    "S16",
    '{"events":[],"jobs":[{"id":"job-invalid-status-type","eventId":"event-invalid","status":null,"attempts":3,"lastError":null,"retries":0,"attemptsSinceRetry":3}],"approvals":[],"outbox":[]}',
  ],
  [
    "S17",
    '{"events":[],"jobs":[{"id":"job-invalid-attempts-negative","eventId":"event-invalid","status":"dead","attempts":-1,"lastError":null,"retries":0,"attemptsSinceRetry":3}],"approvals":[],"outbox":[]}',
  ],
  [
    "S18",
    '{"events":[],"jobs":[{"id":"job-invalid-attempts-type","eventId":"event-invalid","status":"pending","attempts":0.5,"lastError":null,"retries":0,"attemptsSinceRetry":0}],"approvals":[],"outbox":[]}',
  ],
  [
    "S19",
    '{"events":[],"jobs":[{"id":"job-invalid-retries-negative","eventId":"event-invalid","status":"dead","attempts":3,"lastError":null,"retries":-1,"attemptsSinceRetry":3}],"approvals":[],"outbox":[]}',
  ],
  [
    "S20",
    '{"events":[],"jobs":[{"id":"job-invalid-retries-type","eventId":"event-invalid","status":"pending","attempts":0,"lastError":null,"retries":"0","attemptsSinceRetry":0}],"approvals":[],"outbox":[]}',
  ],
  [
    "S21",
    '{"events":[],"jobs":[{"id":"job-invalid-window-negative","eventId":"event-invalid","status":"dead","attempts":3,"lastError":null,"retries":0,"attemptsSinceRetry":-1}],"approvals":[],"outbox":[]}',
  ],
  [
    "S22",
    '{"events":[],"jobs":[{"id":"job-invalid-window-type","eventId":"event-invalid","status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":null}],"approvals":[],"outbox":[]}',
  ],
  [
    "S23",
    '{"events":[],"jobs":[{"id":"job-invalid-error","eventId":"event-invalid","status":"dead","attempts":3,"lastError":7,"retries":0,"attemptsSinceRetry":3}],"approvals":[],"outbox":[]}',
  ],
  [
    "S24",
    '{"events":[],"jobs":[{"id":"job-duplicate","eventId":"event-a","status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0},{"id":"job-duplicate","eventId":"event-b","status":"done","attempts":1,"lastError":null,"retries":0,"attemptsSinceRetry":1}],"approvals":[],"outbox":[]}',
  ],
  [
    "S25",
    '{"events":[],"jobs":[{"id":"job-attempts-done","eventId":"attempts-done","status":"done","attempts":4,"lastError":null,"retries":1,"attemptsSinceRetry":1},{"id":"job-invalid-missing-attempts","eventId":"event-invalid","status":"pending","lastError":null,"retries":0,"attemptsSinceRetry":0}],"approvals":[],"outbox":[]}',
  ],
  [
    "S26",
    '{"events":[],"jobs":[{"id":"job-attempts-dup-first","eventId":"attempts-dup-event","status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0},{"id":"job-attempts-dup-second","eventId":"attempts-dup-event","status":"dead","attempts":3,"lastError":"JOB-ATTEMPTS-DUP-ERROR-SENTINEL","retries":1,"attemptsSinceRetry":3}],"approvals":[],"outbox":[]}',
  ],
  [
    "S27",
    '{"events":[],"jobs":[{"id":"job-attempts-dup-precedes","eventId":"attempts-dup-precedes-event","status":"done","attempts":2,"lastError":null,"retries":0,"attemptsSinceRetry":2},{"id":"job-attempts-dup-tail-a","eventId":"attempts-dup-tail-event","status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0},{"id":"job-attempts-dup-tail-b","eventId":"attempts-dup-tail-event","status":"done","attempts":1,"lastError":null,"retries":0,"attemptsSinceRetry":1}],"approvals":[],"outbox":[]}',
  ],
].map(([id, bytes]) => [id, bytes + "\n"]);

const STRUCTURAL_LOOKUP_IDS = { S25: "job-attempts-done", S27: "job-attempts-dup-precedes" };

const FIXTURE_C_VALUE = {
  events: [
    { id: "attempts-opaque-dup", type: "generic" },
    { id: "attempts-opaque-dup", type: "generic-repeat" },
  ],
  jobs: [
    {
      id: "job-attempts-opaque",
      eventId: "attempts-opaque-event",
      status: "pending",
      attempts: 0,
      lastError: null,
      retries: 0,
      attemptsSinceRetry: 0,
    },
  ],
  approvals: ["opaque-approval-shape", 42, { unexpected: "shape" }],
  outbox: [null, [1, 2, 3], { another: "shape" }],
};

const FIXTURE_C = JSON.stringify(FIXTURE_C_VALUE, null, 2) + "\n";

function makeTempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `relay-job-attempts-${label}-`));
}

function writeFixture(dir, name, contents) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, contents);
  return file;
}

function snapshotFile(file) {
  const stat = fs.statSync(file, { bigint: true });
  return {
    bytes: fs.readFileSync(file).toString("hex"),
    mode: stat.mode,
    size: stat.size,
    mtimeNs: stat.mtimeNs,
  };
}

function snapshotDirectory(dir) {
  const stat = fs.statSync(dir, { bigint: true });
  return {
    isDirectory: stat.isDirectory(),
    entries: fs.readdirSync(dir).sort(),
    mode: stat.mode,
    size: stat.size,
    mtimeNs: stat.mtimeNs,
  };
}

function entryNames(dir) {
  return fs.readdirSync(dir).sort();
}

function runTool(args) {
  const result = spawnSync(process.execPath, [TOOL, ...args], {
    stdio: "pipe",
    timeout: 10_000,
  });
  assert.strictEqual(
    result.error,
    undefined,
    `child process error: ${result.error && result.error.message}`,
  );
  assert.strictEqual(result.signal, null, `child terminated by signal ${result.signal}`);
  return {
    status: result.status,
    stdout: result.stdout.toString("utf8"),
    stderr: result.stderr.toString("utf8"),
  };
}

function assertNoSentinels(result, sentinels, label) {
  for (const sentinel of sentinels) {
    assert.strictEqual(
      result.stdout.includes(sentinel),
      false,
      `stdout leaked ${sentinel} for ${label}`,
    );
    assert.strictEqual(
      result.stderr.includes(sentinel),
      false,
      `stderr leaked ${sentinel} for ${label}`,
    );
  }
}

test("AC1: Fixture A projects each job's frozen attempt-count line with exactly three ordered keys, repeats byte-identically, withholds every sentinel, and leaves the fixture untouched", () => {
  const dir = makeTempDir("ac1");
  try {
    const fixture = writeFixture(dir, "state-a.json", FIXTURE_A);
    const before = snapshotFile(fixture);
    const parentBefore = entryNames(dir);

    const invocations = [
      "job-attempts-pending",
      "job-attempts-done",
      "job-attempts-dead",
      "job-attempts-dead",
    ];

    const deadResults = [];

    for (const jobId of invocations) {
      const result = runTool([fixture, jobId]);

      assert.strictEqual(result.stderr, "", `stderr for ${jobId}`);
      assert.strictEqual(result.stdout, FIXTURE_A_STDOUT[jobId], `stdout for ${jobId}`);
      assert.strictEqual(result.status, 0, `exit code for ${jobId}`);

      const parsed = JSON.parse(result.stdout);
      assert.deepStrictEqual(Object.keys(parsed), OUTPUT_KEYS, `output key order for ${jobId}`);

      assertNoSentinels(result, FIXTURE_A_SENTINELS, jobId);
      assert.deepStrictEqual(snapshotFile(fixture), before, `fixture bytes and stat after ${jobId}`);
      assert.deepStrictEqual(entryNames(dir), parentBefore, `parent entries after ${jobId}`);

      if (jobId === "job-attempts-dead") {
        deadResults.push(result);
      }
    }

    assert.deepStrictEqual(
      deadResults[1],
      deadResults[0],
      "the second job-attempts-dead invocation must produce byte-identical streams",
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AC2: each frozen unknown ID exits 1 with only the lookup error, proving case- and space-sensitive matching without echoing the supplied ID", () => {
  const validIds = Object.keys(FIXTURE_A_STDOUT);

  for (let i = 0; i < UNKNOWN_IDS.length; i += 1) {
    for (let j = i + 1; j < UNKNOWN_IDS.length; j += 1) {
      assert.notStrictEqual(
        UNKNOWN_IDS[i],
        UNKNOWN_IDS[j],
        `unknown IDs ${UNKNOWN_IDS[i]} and ${UNKNOWN_IDS[j]} must be byte-distinct`,
      );
    }
  }

  for (const jobId of UNKNOWN_IDS) {
    for (const validId of validIds) {
      assert.notStrictEqual(jobId, validId, `${jobId} must be byte-distinct from ${validId}`);
    }

    const dir = makeTempDir("ac2");
    try {
      const fixture = writeFixture(dir, "state-a.json", FIXTURE_A);
      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);

      const result = runTool([fixture, jobId]);

      assert.strictEqual(result.stdout, "", `stdout for ${jobId}`);
      assert.strictEqual(result.stderr, NO_SUCH_JOB_ERROR, `stderr for ${jobId}`);
      assert.strictEqual(result.status, 1, `exit code for ${jobId}`);
      assert.strictEqual(result.stderr.includes(jobId), false, `stderr echoed ${jobId}`);
      assert.strictEqual(result.stdout.includes(jobId), false, `stdout echoed ${jobId}`);
      assertNoSentinels(result, FIXTURE_A_SENTINELS, jobId);
      assert.deepStrictEqual(snapshotFile(fixture), before, `fixture bytes and stat for ${jobId}`);
      assert.deepStrictEqual(entryNames(dir), parentBefore, `parent entries for ${jobId}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("AC3: every invalid arity exits 2 with the exact usage line before any file access", () => {
  const zeroArgParent = makeTempDir("ac3-zero-args");
  try {
    const before = snapshotDirectory(zeroArgParent);

    const result = runTool([]);

    assert.strictEqual(result.stdout, "", "stdout for zero arguments");
    assert.strictEqual(result.stderr, USAGE_ERROR, "stderr for zero arguments");
    assert.strictEqual(result.status, 2, "exit code for zero arguments");
    assert.deepStrictEqual(
      snapshotDirectory(zeroArgParent),
      before,
      "parent unchanged for zero arguments",
    );
    assert.deepStrictEqual(before.entries, [], "zero-argument parent starts empty");
  } finally {
    fs.rmSync(zeroArgParent, { recursive: true, force: true });
  }

  for (const [label, extraArgs] of [
    ["one argument", []],
    ["three arguments", ["job-attempts-dead", "extra"]],
  ]) {
    const parent = makeTempDir("ac3-arity");
    try {
      const absent = path.join(parent, ARITY_MISSING_NAME);
      const before = snapshotDirectory(parent);

      const result = runTool([absent, ...extraArgs]);

      assert.strictEqual(result.stdout, "", `stdout for ${label}`);
      assert.strictEqual(result.stderr, USAGE_ERROR, `stderr for ${label}`);
      assert.strictEqual(result.status, 2, `exit code for ${label}`);
      assert.strictEqual(fs.existsSync(absent), false, `absent path created for ${label}`);
      assert.deepStrictEqual(snapshotDirectory(parent), before, `parent unchanged for ${label}`);
      assert.deepStrictEqual(before.entries, [], `${label} parent starts empty`);
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  }
});

test("AC4: a nonexistent path and a directory path each exit 1 with only the unreadable error and change nothing on disk", () => {
  const missingParent = makeTempDir("ac4-missing");
  try {
    const missing = path.join(missingParent, MISSING_STATE_NAME);
    const parentBefore = entryNames(missingParent);

    const result = runTool([missing, DEFAULT_PRE_LOOKUP_ID]);

    assert.strictEqual(result.stdout, "", "stdout for nonexistent path");
    assert.strictEqual(result.stderr, UNREADABLE_ERROR, "stderr for nonexistent path");
    assert.strictEqual(result.status, 1, "exit code for nonexistent path");
    assertNoSentinels(result, FAILURE_SENTINELS, "nonexistent path");
    assert.strictEqual(fs.existsSync(missing), false, "nonexistent path stayed absent");
    assert.deepStrictEqual(
      entryNames(missingParent),
      parentBefore,
      "parent entries for nonexistent path",
    );
  } finally {
    fs.rmSync(missingParent, { recursive: true, force: true });
  }

  const directoryParent = makeTempDir("ac4-directory");
  try {
    const stateDirectory = path.join(directoryParent, DIRECTORY_STATE_NAME);
    fs.mkdirSync(stateDirectory);
    const before = snapshotDirectory(stateDirectory);
    const parentBefore = entryNames(directoryParent);

    const result = runTool([stateDirectory, DEFAULT_PRE_LOOKUP_ID]);

    assert.strictEqual(result.stdout, "", "stdout for directory path");
    assert.strictEqual(result.stderr, UNREADABLE_ERROR, "stderr for directory path");
    assert.strictEqual(result.status, 1, "exit code for directory path");
    assertNoSentinels(result, FAILURE_SENTINELS, "directory path");
    assert.deepStrictEqual(
      snapshotDirectory(stateDirectory),
      before,
      "directory stayed empty and unchanged",
    );
    assert.deepStrictEqual(before.entries, [], "state directory starts empty");
    assert.deepStrictEqual(
      entryNames(directoryParent),
      parentBefore,
      "parent entries for directory path",
    );
  } finally {
    fs.rmSync(directoryParent, { recursive: true, force: true });
  }
});

test("AC5: Fixture B exits 1 with only the parse error and leaks no malformed state content", () => {
  const dir = makeTempDir("ac5-malformed");
  try {
    const fixture = writeFixture(dir, "malformed-state.json", FIXTURE_B);
    const before = snapshotFile(fixture);
    const parentBefore = entryNames(dir);

    const result = runTool([fixture, DEFAULT_PRE_LOOKUP_ID]);

    assert.strictEqual(result.stdout, "", "stdout for Fixture B");
    assert.strictEqual(result.stderr, NOT_JSON_ERROR, "stderr for Fixture B");
    assert.strictEqual(result.status, 1, "exit code for Fixture B");
    assertNoSentinels(result, FAILURE_SENTINELS, "Fixture B");
    assert.deepStrictEqual(snapshotFile(fixture), before, "Fixture B bytes and stat");
    assert.deepStrictEqual(entryNames(dir), parentBefore, "parent entries for Fixture B");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AC4: every structural-invalid fixture S1-S27 exits 1 with only the invalid-state error, including duplicate event IDs before lookup", () => {
  const allFixtures = [["fixture-a", FIXTURE_A], ["fixture-b", FIXTURE_B], ...STRUCTURAL_FIXTURES];

  for (let i = 0; i < allFixtures.length; i += 1) {
    for (let j = i + 1; j < allFixtures.length; j += 1) {
      assert.notStrictEqual(
        allFixtures[i][1],
        allFixtures[j][1],
        `${allFixtures[i][0]} and ${allFixtures[j][0]} must be byte-distinct`,
      );
    }
  }

  for (const [id, contents] of STRUCTURAL_FIXTURES) {
    const jobIds =
      id === "S26"
        ? [
            "job-attempts-dup-first",
            "job-attempts-dup-second",
            "job-attempts-dup-absent",
          ]
        : [STRUCTURAL_LOOKUP_IDS[id] || DEFAULT_PRE_LOOKUP_ID];
    const dir = makeTempDir(`ac6-${id.toLowerCase()}`);
    try {
      const fixture = writeFixture(dir, "state.json", contents);
      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);

      for (const jobId of jobIds) {
        const result = runTool([fixture, jobId]);

        assert.strictEqual(result.stdout, "", `stdout for ${id}/${jobId}`);
        assert.strictEqual(result.stderr, INVALID_STATE_ERROR, `stderr for ${id}/${jobId}`);
        assert.strictEqual(result.status, 1, `exit code for ${id}/${jobId}`);
        assertNoSentinels(result, FAILURE_SENTINELS, `${id}/${jobId}`);
        assert.deepStrictEqual(
          snapshotFile(fixture),
          before,
          `bytes and stat for ${id}/${jobId}`,
        );
        assert.deepStrictEqual(entryNames(dir), parentBefore, `parent entries for ${id}/${jobId}`);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("AC8: opaque non-schema collections and duplicate event IDs are accepted", () => {
  const dir = makeTempDir("ac8-opaque");
  try {
    const fixture = writeFixture(dir, "state-c.json", FIXTURE_C);
    const before = snapshotFile(fixture);
    const parentBefore = entryNames(dir);

    const result = runTool([fixture, "job-attempts-opaque"]);

    assert.strictEqual(result.stdout, '{"jobId":"job-attempts-opaque","attempts":0,"attemptsSinceRetry":0}\n');
    assert.strictEqual(result.stderr, "");
    assert.strictEqual(result.status, 0);
    assert.deepStrictEqual(snapshotFile(fixture), before, "Fixture C bytes and stat");
    assert.deepStrictEqual(entryNames(dir), parentBefore, "Fixture C parent entries");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AC7: every invocation terminates unaided and static inspection finds only the frozen offline module specifiers", () => {
  const dir = makeTempDir("ac7");
  try {
    const fixture = writeFixture(dir, "state-a.json", FIXTURE_A);
    const before = snapshotFile(fixture);
    const parentBefore = entryNames(dir);

    const result = runTool([fixture, "job-attempts-dead"]);

    assert.strictEqual(result.stderr, "", "stderr for the terminating invocation");
    assert.strictEqual(
      result.stdout,
      FIXTURE_A_STDOUT["job-attempts-dead"],
      "stdout for the terminating invocation",
    );
    assert.strictEqual(result.status, 0, "exit code for the terminating invocation");
    assert.deepStrictEqual(snapshotFile(fixture), before, "fixture bytes and stat after invocation");
    assert.deepStrictEqual(entryNames(dir), parentBefore, "parent entries after invocation");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

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

  const testSource = fs.readFileSync(path.join(__dirname, "job-attempts.test.js"), "utf8");
  assert.deepStrictEqual(specifiersOf(testSource), [
    "node:assert",
    "node:child_process",
    "node:fs",
    "node:os",
    "node:path",
    "node:test",
  ]);

  assert.strictEqual(fs.existsSync(TOOL), true, "app/tools/job-attempts.js exists");
  const toolSource = fs.readFileSync(TOOL, "utf8");
  assert.deepStrictEqual(specifiersOf(toolSource), ["node:fs"]);

  for (const forbidden of [
    "server.js",
    "node:http",
    "node:https",
    "node:net",
    "node:child_process",
    "fetch",
  ]) {
    assert.strictEqual(
      toolSource.includes(forbidden),
      false,
      `production file references ${forbidden}`,
    );
  }
});

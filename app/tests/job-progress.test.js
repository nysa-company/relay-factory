const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const TOOL = path.join(__dirname, "..", "tools", "job-progress.js");

const USAGE_ERROR = "usage: node app/tools/job-progress.js <state-file> <job-id>\n";
const UNREADABLE_ERROR = "job-progress: state file is unreadable\n";
const NOT_JSON_ERROR = "job-progress: state file is not valid JSON\n";
const INVALID_STATE_ERROR = "job-progress: state file has invalid Relay state\n";
const NO_SUCH_JOB_ERROR = "job-progress: no such job\n";

const FIXTURE_A_VALUE = {
  events: [
    {
      id: "progress-pending",
      type: "meeting",
      payload: {
        private: "EVENT-PAYLOAD-SENTINEL",
      },
      receivedAt: "2026-08-23T06:00:00.000Z",
    },
    {
      id: "progress-done",
      type: "email",
      payload: {
        failTimes: 3,
      },
      receivedAt: "2026-08-23T06:00:01.000Z",
    },
    {
      id: "progress-dead",
      type: "generic",
      payload: {
        failTimes: 99,
      },
      receivedAt: "2026-08-23T06:00:02.000Z",
    },
  ],
  jobs: [
    {
      id: "job-progress-pending",
      eventId: "progress-pending",
      status: "pending",
      attempts: 0,
      lastError: null,
      retries: 0,
      attemptsSinceRetry: 0,
    },
    {
      id: "job-progress-done",
      eventId: "progress-done",
      status: "done",
      attempts: 4,
      lastError: null,
      retries: 1,
      attemptsSinceRetry: 1,
    },
    {
      id: "job-progress-dead",
      eventId: "progress-dead",
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
      id: "appr-progress-done",
      jobId: "job-progress-done",
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
      approvalId: "appr-progress-done",
      sentAt: "2026-08-23T06:00:04.000Z",
    },
  ],
};

const FIXTURE_A = JSON.stringify(FIXTURE_A_VALUE, null, 2) + "\n";

const FIXTURE_A_STDOUT = {
  "job-progress-pending":
    '{"jobId":"job-progress-pending","status":"pending","attempts":0,"retries":0}\n',
  "job-progress-done":
    '{"jobId":"job-progress-done","status":"done","attempts":4,"retries":1}\n',
  "job-progress-dead":
    '{"jobId":"job-progress-dead","status":"dead","attempts":6,"retries":1}\n',
};

const FIXTURE_A_SENTINELS = [
  "EVENT-PAYLOAD-SENTINEL",
  "JOB-ERROR-SENTINEL",
  "IGNORED-JOB-FIELD-SENTINEL",
  "APPROVAL-ACTION-SENTINEL",
  "REJECTION-REASON-SENTINEL",
  "OUTBOX-CONTENT-SENTINEL",
];

const FAILURE_SENTINELS = [
  "PATH-SENTINEL",
  "DIRECTORY-PATH-SENTINEL",
  "MALFORMED-STATE-SENTINEL",
];

const MALFORMED_FIXTURE = '{"events":[],"private":"MALFORMED-STATE-SENTINEL"';

const MISSING_STATE_NAME = "PATH-SENTINEL-missing-state.json";
const DIRECTORY_STATE_NAME = "DIRECTORY-PATH-SENTINEL";
const ARITY_MISSING_NAME = "arity-state-does-not-exist.json";

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
  [
    "S10",
    '{"events":[],"jobs":[{"id":"","eventId":"event-invalid","status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0}],"approvals":[],"outbox":[]}',
  ],
  [
    "S11",
    '{"events":[],"jobs":[{"id":"job-invalid-event","eventId":"","status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0}],"approvals":[],"outbox":[]}',
  ],
  [
    "S12",
    '{"events":[],"jobs":[{"id":"job-invalid-status","eventId":"event-invalid","status":"DEAD","attempts":3,"lastError":null,"retries":0,"attemptsSinceRetry":3}],"approvals":[],"outbox":[]}',
  ],
  [
    "S13",
    '{"events":[],"jobs":[{"id":"job-invalid-attempts","eventId":"event-invalid","status":"dead","attempts":-1,"lastError":null,"retries":0,"attemptsSinceRetry":3}],"approvals":[],"outbox":[]}',
  ],
  [
    "S14",
    '{"events":[],"jobs":[{"id":"job-invalid-retries","eventId":"event-invalid","status":"dead","attempts":3,"lastError":null,"retries":-1,"attemptsSinceRetry":3}],"approvals":[],"outbox":[]}',
  ],
  [
    "S15",
    '{"events":[],"jobs":[{"id":"job-invalid-window","eventId":"event-invalid","status":"dead","attempts":3,"lastError":null,"retries":0,"attemptsSinceRetry":-1}],"approvals":[],"outbox":[]}',
  ],
  [
    "S16",
    '{"events":[],"jobs":[{"id":"job-invalid-error","eventId":"event-invalid","status":"dead","attempts":3,"lastError":7,"retries":0,"attemptsSinceRetry":3}],"approvals":[],"outbox":[]}',
  ],
  [
    "S17",
    '{"events":[],"jobs":[{"id":"job-duplicate","eventId":"event-a","status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0},{"id":"job-duplicate","eventId":"event-b","status":"done","attempts":1,"lastError":null,"retries":0,"attemptsSinceRetry":1}],"approvals":[],"outbox":[]}',
  ],
  ["S18", '{"events":[],"jobs":[[]],"approvals":[],"outbox":[]}'],
  [
    "S19",
    '{"events":[],"jobs":[{"id":"job-progress-done","eventId":"progress-done","status":"done","attempts":4,"lastError":null,"retries":1,"attemptsSinceRetry":1},{"id":"job-invalid-missing-attempts","eventId":"event-invalid","status":"pending","lastError":null,"retries":0,"attemptsSinceRetry":0}],"approvals":[],"outbox":[]}',
  ],
  [
    "S20",
    '{"events":[],"jobs":[{"id":"job-invalid-attempts-type","eventId":"event-invalid","status":"pending","attempts":0.5,"lastError":null,"retries":0,"attemptsSinceRetry":0}],"approvals":[],"outbox":[]}',
  ],
  [
    "S21",
    '{"events":[],"jobs":[{"id":"job-invalid-retries-type","eventId":"event-invalid","status":"pending","attempts":0,"lastError":null,"retries":"0","attemptsSinceRetry":0}],"approvals":[],"outbox":[]}',
  ],
  [
    "S22",
    '{"events":[],"jobs":[{"id":"job-invalid-window-type","eventId":"event-invalid","status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":null}],"approvals":[],"outbox":[]}',
  ],
].map(([id, bytes]) => [id, bytes + "\n"]);

const STRUCTURAL_LOOKUP_IDS = { S19: "job-progress-done" };
const DEFAULT_PRE_LOOKUP_ID = "job-progress-dead";

const DUPLICATE_EVENT_ID_FIXTURES = [
  [
    "DUP-1",
    '{"events":[],"jobs":[{"id":"job-dup-first","eventId":"event-dup-shared","status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0},{"id":"job-dup-second","eventId":"event-dup-shared","status":"done","attempts":2,"lastError":null,"retries":1,"attemptsSinceRetry":1}],"approvals":[],"outbox":[]}\n',
    "job-dup-first",
    ["job-dup-first", "job-dup-second", "event-dup-shared"],
  ],
  [
    "DUP-2",
    '{"events":[],"jobs":[{"id":"job-dup-first","eventId":"event-dup-shared","status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0},{"id":"job-dup-second","eventId":"event-dup-shared","status":"done","attempts":3,"lastError":null,"retries":1,"attemptsSinceRetry":1}],"approvals":[],"outbox":[]}\n',
    "job-dup-second",
    ["job-dup-first", "job-dup-second", "event-dup-shared"],
  ],
  [
    "DUP-3",
    '{"events":[],"jobs":[{"id":"job-dup-first","eventId":"event-dup-shared","status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0},{"id":"job-dup-second","eventId":"event-dup-shared","status":"done","attempts":4,"lastError":null,"retries":1,"attemptsSinceRetry":1}],"approvals":[],"outbox":[]}\n',
    "job-dup-missing",
    ["job-dup-first", "job-dup-second", "event-dup-shared", "job-dup-missing"],
  ],
  [
    "DUP-4",
    '{"events":[],"jobs":[{"id":"job-dup-same-a","eventId":"event-dup-same","status":"dead","attempts":5,"lastError":null,"retries":1,"attemptsSinceRetry":2},{"id":"job-dup-same-b","eventId":"event-dup-same","status":"dead","attempts":5,"lastError":null,"retries":1,"attemptsSinceRetry":2}],"approvals":[],"outbox":[]}\n',
    "job-dup-same-a",
    ["job-dup-same-a", "job-dup-same-b", "event-dup-same"],
  ],
];

function makeTempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `relay-job-progress-${label}-`));
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

test("AC1: Fixture A version 2 projects each job's frozen progress line, repeats byte-identically, withholds every sentinel, and leaves the fixture untouched", () => {
  const dir = makeTempDir("ac1");
  try {
    const fixture = writeFixture(dir, "state-a.json", FIXTURE_A);
    const before = snapshotFile(fixture);
    const parentBefore = entryNames(dir);

    const invocations = [
      "job-progress-pending",
      "job-progress-done",
      "job-progress-dead",
      "job-progress-dead",
    ];

    for (const jobId of invocations) {
      const result = runTool([fixture, jobId]);

      assert.strictEqual(result.stderr, "", `stderr for ${jobId}`);
      assert.strictEqual(result.stdout, FIXTURE_A_STDOUT[jobId], `stdout for ${jobId}`);
      assert.strictEqual(result.status, 0, `exit code for ${jobId}`);
      assertNoSentinels(result, FIXTURE_A_SENTINELS, jobId);
      assert.deepStrictEqual(snapshotFile(fixture), before, `fixture bytes and stat after ${jobId}`);
      assert.deepStrictEqual(entryNames(dir), parentBefore, `parent entries after ${jobId}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AC2: unknown IDs are rejected with the exact lookup error, proving case-sensitive matching without echoing the supplied ID", () => {
  const validIds = Object.keys(FIXTURE_A_STDOUT);

  for (const jobId of ["JOB-PROGRESS-DEAD", "job-progress-missing"]) {
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
  const dir = makeTempDir("ac3-zero-args");
  try {
    const before = snapshotDirectory(dir);

    const result = runTool([]);

    assert.strictEqual(result.stdout, "", "stdout for zero arguments");
    assert.strictEqual(result.stderr, USAGE_ERROR, "stderr for zero arguments");
    assert.strictEqual(result.status, 2, "exit code for zero arguments");
    assert.deepStrictEqual(snapshotDirectory(dir), before, "parent unchanged for zero arguments");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  for (const [label, extraArgs] of [
    ["one argument", []],
    ["three arguments", ["job-progress-dead", "extra"]],
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
    assert.deepStrictEqual(entryNames(missingParent), parentBefore, "parent entries for nonexistent path");
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
    assert.deepStrictEqual(snapshotDirectory(stateDirectory), before, "directory stayed empty and unchanged");
    assert.deepStrictEqual(entryNames(directoryParent), parentBefore, "parent entries for directory path");
  } finally {
    fs.rmSync(directoryParent, { recursive: true, force: true });
  }
});

test("AC5: the malformed fixture exits 1 with only the parse error and leaks no state content", () => {
  const dir = makeTempDir("ac5-malformed");
  try {
    const fixture = writeFixture(dir, "malformed-state.json", MALFORMED_FIXTURE);
    const before = snapshotFile(fixture);
    const parentBefore = entryNames(dir);

    const result = runTool([fixture, DEFAULT_PRE_LOOKUP_ID]);

    assert.strictEqual(result.stdout, "", "stdout for malformed fixture");
    assert.strictEqual(result.stderr, NOT_JSON_ERROR, "stderr for malformed fixture");
    assert.strictEqual(result.status, 1, "exit code for malformed fixture");
    assertNoSentinels(result, FAILURE_SENTINELS, "malformed fixture");
    assert.deepStrictEqual(snapshotFile(fixture), before, "malformed fixture bytes and stat");
    assert.deepStrictEqual(entryNames(dir), parentBefore, "parent entries for malformed fixture");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AC6: every structural-invalid fixture S1-S22 exits 1 with only the invalid-state error, and S19 proves whole-array validation precedes lookup", () => {
  const allFixtures = [
    ["fixture-a", FIXTURE_A],
    ["malformed", MALFORMED_FIXTURE],
    ...STRUCTURAL_FIXTURES,
  ];

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
    const jobId = STRUCTURAL_LOOKUP_IDS[id] || DEFAULT_PRE_LOOKUP_ID;
    const dir = makeTempDir(`ac6-${id.toLowerCase()}`);
    try {
      const fixture = writeFixture(dir, "state.json", contents);
      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);

      const result = runTool([fixture, jobId]);

      assert.strictEqual(result.stdout, "", `stdout for ${id}`);
      assert.strictEqual(result.stderr, INVALID_STATE_ERROR, `stderr for ${id}`);
      assert.strictEqual(result.status, 1, `exit code for ${id}`);
      assert.deepStrictEqual(snapshotFile(fixture), before, `bytes and stat for ${id}`);
      assert.deepStrictEqual(entryNames(dir), parentBefore, `parent entries for ${id}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("T-277 AC1: every frozen duplicate non-empty job eventId fixture exits 1 with only the invalid-state error, leaks no fixture ID, and is read-only", () => {
  const existingFixtures = [FIXTURE_A, MALFORMED_FIXTURE, ...STRUCTURAL_FIXTURES.map(([, bytes]) => bytes)];
  for (let i = 0; i < DUPLICATE_EVENT_ID_FIXTURES.length; i += 1) {
    const [id, contents] = DUPLICATE_EVENT_ID_FIXTURES[i];
    for (const existing of existingFixtures) {
      assert.notStrictEqual(contents, existing, `${id} must be byte-distinct from existing fixtures`);
    }
    for (let j = i + 1; j < DUPLICATE_EVENT_ID_FIXTURES.length; j += 1) {
      assert.notStrictEqual(contents, DUPLICATE_EVENT_ID_FIXTURES[j][1], `${id} must be byte-distinct`);
    }
  }

  for (const [id, contents, jobId, fixtureIds] of DUPLICATE_EVENT_ID_FIXTURES) {
    const dir = makeTempDir(`t277-ac1-${id.toLowerCase()}`);
    try {
      const fixture = writeFixture(dir, "state.json", contents);
      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);
      const result = runTool([fixture, jobId]);

      assert.strictEqual(result.stdout, "", `stdout for ${id}`);
      assert.strictEqual(result.stderr, INVALID_STATE_ERROR, `stderr for ${id}`);
      assert.strictEqual(result.status, 1, `exit code for ${id}`);
      assertNoSentinels(result, fixtureIds, id);
      assert.deepStrictEqual(snapshotFile(fixture), before, `fixture bytes and stat for ${id}`);
      assert.deepStrictEqual(entryNames(dir), parentBefore, `parent entries for ${id}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("T-277 AC2: duplicate event IDs are rejected before first, second, or absent exact lookup regardless of differing or equal job statuses", () => {
  for (const [id, contents, jobId, fixtureIds] of DUPLICATE_EVENT_ID_FIXTURES) {
    const dir = makeTempDir(`t277-ac2-${id.toLowerCase()}`);
    try {
      const fixture = writeFixture(dir, "state.json", contents);
      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);
      const result = runTool([fixture, jobId]);

      assert.strictEqual(result.stdout, "", `stdout for ${id}`);
      assert.strictEqual(result.stderr, INVALID_STATE_ERROR, `stderr for ${id}`);
      assert.strictEqual(result.status, 1, `exit code for ${id}`);
      assertNoSentinels(result, fixtureIds, id);
      assert.deepStrictEqual(snapshotFile(fixture), before, `fixture bytes and stat for ${id}`);
      assert.deepStrictEqual(entryNames(dir), parentBefore, `parent entries for ${id}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("AC7: every invocation terminates unaided and static inspection finds only the frozen offline module specifiers", () => {
  const dir = makeTempDir("ac7");
  try {
    const fixture = writeFixture(dir, "state-a.json", FIXTURE_A);
    const before = snapshotFile(fixture);
    const parentBefore = entryNames(dir);

    const result = runTool([fixture, "job-progress-dead"]);

    assert.strictEqual(result.stderr, "", "stderr for the terminating invocation");
    assert.strictEqual(result.stdout, FIXTURE_A_STDOUT["job-progress-dead"], "stdout for the terminating invocation");
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

  const testSource = fs.readFileSync(path.join(__dirname, "job-progress.test.js"), "utf8");
  assert.deepStrictEqual(specifiersOf(testSource), [
    "node:assert",
    "node:child_process",
    "node:fs",
    "node:os",
    "node:path",
    "node:test",
  ]);

  assert.strictEqual(fs.existsSync(TOOL), true, "app/tools/job-progress.js exists");
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

const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const TOOL = path.join(__dirname, "..", "tools", "job-event-retry-count.js");
const CHILD_TIMEOUT_MS = 5_000;

const USAGE_ERROR =
  "usage: node app/tools/job-event-retry-count.js <state-file> <event-id> <retries>\n";
const READ_ERROR = "job-event-retry-count: cannot read state file\n";
const PARSE_ERROR = "job-event-retry-count: state file is not valid JSON\n";
const INVALID_STATE_ERROR = "job-event-retry-count: invalid Relay state\n";

const COUNT_2_STDOUT = '{"jobsWithEventAndRetries":2}\n';
const COUNT_1_STDOUT = '{"jobsWithEventAndRetries":1}\n';
const COUNT_0_STDOUT = '{"jobsWithEventAndRetries":0}\n';

const TARGET_EVENT_ID = "EVENT-TARGET-MUST-NOT-LEAK";
const LOWERCASE_EVENT_ID = "event-target-MUST-NOT-LEAK";

const ARITY_CANDIDATE_NAME = "arity-state-MUST-NOT-LEAK.json";
const ABSENT_CANDIDATE_NAME = "PATH-MUST-NOT-LEAK.json";
const DIRECTORY_CANDIDATE_NAME = "DIRECTORY-MUST-NOT-LEAK";

const SENSITIVE_TOKENS = [
  "OPAQUE-EVENT-ID-MUST-NOT-LEAK",
  "EVENT-PAYLOAD-MUST-NOT-LEAK",
  "EVENT-TARGET-MUST-NOT-LEAK",
  "event-target-MUST-NOT-LEAK",
  "Event-TARGET-MUST-NOT-LEAK",
  " EVENT-TARGET-MUST-NOT-LEAK",
  "EVENT-OTHER-MUST-NOT-LEAK",
  "JOB-MATCH-PENDING-MUST-NOT-LEAK",
  "JOB-MATCH-DONE-MUST-NOT-LEAK",
  "JOB-ZERO-RETRY-MUST-NOT-LEAK",
  "JOB-LARGE-RETRY-MUST-NOT-LEAK",
  "JOB-CASE-EVENT-MUST-NOT-LEAK",
  "JOB-OTHER-EVENT-MUST-NOT-LEAK",
  "PENDING-ERROR-MUST-NOT-LEAK",
  "ZERO-RETRY-ERROR-MUST-NOT-LEAK",
  "OTHER-ERROR-MUST-NOT-LEAK",
  "IGNORED-JOB-FIELD-MUST-NOT-LEAK",
  "APPROVAL-ACTION-MUST-NOT-LEAK",
  "OUTBOX-CONTENT-MUST-NOT-LEAK",
  "OPAQUE-SIBLING-CONTENT-MUST-NOT-LEAK",
  "MALFORMED-PAYLOAD-MUST-NOT-LEAK",
  "arity-state-MUST-NOT-LEAK",
  "PATH-MUST-NOT-LEAK",
  "DIRECTORY-MUST-NOT-LEAK",
];

const FIXTURE_A_VALUE = {
  events: [
    {
      id: "OPAQUE-EVENT-ID-MUST-NOT-LEAK",
      payload: { private: "EVENT-PAYLOAD-MUST-NOT-LEAK" },
    },
  ],
  jobs: [
    {
      id: "JOB-MATCH-PENDING-MUST-NOT-LEAK",
      eventId: "EVENT-TARGET-MUST-NOT-LEAK",
      status: "pending",
      attempts: 2,
      lastError: "PENDING-ERROR-MUST-NOT-LEAK",
      retries: 1,
      attemptsSinceRetry: 2,
    },
    {
      id: "JOB-MATCH-DONE-MUST-NOT-LEAK",
      eventId: "EVENT-TARGET-MUST-NOT-LEAK",
      status: "done",
      attempts: 4,
      lastError: null,
      retries: 1,
      attemptsSinceRetry: 1,
      ignoredDiagnostic: "IGNORED-JOB-FIELD-MUST-NOT-LEAK",
    },
    {
      id: "JOB-ZERO-RETRY-MUST-NOT-LEAK",
      eventId: "EVENT-TARGET-MUST-NOT-LEAK",
      status: "dead",
      attempts: 3,
      lastError: "ZERO-RETRY-ERROR-MUST-NOT-LEAK",
      retries: 0,
      attemptsSinceRetry: 3,
    },
    {
      id: "JOB-LARGE-RETRY-MUST-NOT-LEAK",
      eventId: "EVENT-TARGET-MUST-NOT-LEAK",
      status: "done",
      attempts: 9007199254740992,
      lastError: "",
      retries: 9007199254740992,
      attemptsSinceRetry: 0,
    },
    {
      id: "JOB-CASE-EVENT-MUST-NOT-LEAK",
      eventId: "event-target-MUST-NOT-LEAK",
      status: "pending",
      attempts: 0,
      lastError: null,
      retries: 1,
      attemptsSinceRetry: 0,
    },
    {
      id: "JOB-OTHER-EVENT-MUST-NOT-LEAK",
      eventId: "EVENT-OTHER-MUST-NOT-LEAK",
      status: "dead",
      attempts: 6,
      lastError: "OTHER-ERROR-MUST-NOT-LEAK",
      retries: 1,
      attemptsSinceRetry: 3,
    },
  ],
  approvals: [{ action: { body: "APPROVAL-ACTION-MUST-NOT-LEAK" } }],
  outbox: [{ body: "OUTBOX-CONTENT-MUST-NOT-LEAK" }],
};

const FIXTURE_A = JSON.stringify(FIXTURE_A_VALUE, null, 2) + "\n";
const FIXTURE_B =
  '{"events":[null],"jobs":[],"approvals":[7],"outbox":["OPAQUE-SIBLING-CONTENT-MUST-NOT-LEAK"]}\n';
const FIXTURE_C = '{"jobs":[],"payload":"MALFORMED-PAYLOAD-MUST-NOT-LEAK"\n';
const FIXTURE_D = "";

const NO_MATCH_PAIRS = [
  ["Event-TARGET-MUST-NOT-LEAK", "1"],
  [" EVENT-TARGET-MUST-NOT-LEAK", "1"],
  ["EVENT-TARGET-MUST-NOT-LEAK", "2"],
  ["EVENT-TARGET-MUST-NOT-LEAK", "9007199254740993"],
  [" ", "1"],
];

const INVALID_RETRY_TEXTS = ["", "01", "+1", "-0", "-1", "1.0", "1e0", "1_0", " 1", "1 ", "١"];
const VALID_RETRY_TEXTS = ["0", "1", "2", "9007199254740992", "9007199254740993"];

const STRUCTURAL_INVALID_FIXTURES = [
  ["S1", "null\n"],
  ["S2", "[]\n"],
  ["S3", '{"events":{},"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S4", '{"events":[],"jobs":{},"approvals":[],"outbox":[]}\n'],
  ["S5", '{"events":[],"jobs":[],"approvals":{},"outbox":[]}\n'],
  ["S6", '{"events":[],"jobs":[],"approvals":[],"outbox":{}}\n'],
  ["S7", '{"events":[],"jobs":[],"approvals":[],"outbox":[],"metadata":[]}\n'],
  ["S8", '{"events":[],"jobs":[],"approvals":[]}\n'],
  ["S9", '{"events":[],"jobs":[null],"approvals":[],"outbox":[]}\n'],
  ["S10", '{"events":[],"jobs":[[]],"approvals":[],"outbox":[]}\n'],
  [
    "S11",
    '{"events":[],"jobs":[{"id":"","eventId":"event-invalid","status":"pending","attempts":0,' +
      '"lastError":null,"retries":0,"attemptsSinceRetry":0}],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S12",
    '{"events":[],"jobs":[{"id":7,"eventId":"event-invalid","status":"pending","attempts":0,' +
      '"lastError":null,"retries":0,"attemptsSinceRetry":0}],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S13",
    '{"events":[],"jobs":[{"id":"job-invalid-event-empty","eventId":"","status":"pending",' +
      '"attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0}],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S14",
    '{"events":[],"jobs":[{"id":"job-invalid-event-type","eventId":7,"status":"pending",' +
      '"attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0}],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S15",
    '{"events":[],"jobs":[{"id":"job-invalid-status-case","eventId":"event-invalid","status":"DEAD",' +
      '"attempts":3,"lastError":null,"retries":0,"attemptsSinceRetry":3}],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S16",
    '{"events":[],"jobs":[{"id":"job-invalid-status-type","eventId":"event-invalid","status":null,' +
      '"attempts":3,"lastError":null,"retries":0,"attemptsSinceRetry":3}],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S17",
    '{"events":[],"jobs":[{"id":"job-invalid-attempts-negative","eventId":"event-invalid",' +
      '"status":"dead","attempts":-1,"lastError":null,"retries":0,"attemptsSinceRetry":3}],' +
      '"approvals":[],"outbox":[]}\n',
  ],
  [
    "S18",
    '{"events":[],"jobs":[{"id":"job-invalid-attempts-type","eventId":"event-invalid",' +
      '"status":"pending","attempts":0.5,"lastError":null,"retries":0,"attemptsSinceRetry":0}],' +
      '"approvals":[],"outbox":[]}\n',
  ],
  [
    "S19",
    '{"events":[],"jobs":[{"id":"job-invalid-retries-negative","eventId":"event-invalid",' +
      '"status":"dead","attempts":3,"lastError":null,"retries":-1,"attemptsSinceRetry":3}],' +
      '"approvals":[],"outbox":[]}\n',
  ],
  [
    "S20",
    '{"events":[],"jobs":[{"id":"job-invalid-retries-type","eventId":"event-invalid",' +
      '"status":"pending","attempts":0,"lastError":null,"retries":"1","attemptsSinceRetry":0}],' +
      '"approvals":[],"outbox":[]}\n',
  ],
  [
    "S21",
    '{"events":[],"jobs":[{"id":"job-invalid-window-negative","eventId":"event-invalid",' +
      '"status":"dead","attempts":3,"lastError":null,"retries":0,"attemptsSinceRetry":-1}],' +
      '"approvals":[],"outbox":[]}\n',
  ],
  [
    "S22",
    '{"events":[],"jobs":[{"id":"job-invalid-window-type","eventId":"event-invalid",' +
      '"status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":null}],' +
      '"approvals":[],"outbox":[]}\n',
  ],
  [
    "S23",
    '{"events":[],"jobs":[{"id":"job-invalid-error","eventId":"event-invalid","status":"dead",' +
      '"attempts":3,"lastError":7,"retries":0,"attemptsSinceRetry":3}],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S24",
    '{"events":[],"jobs":[{"id":"job-duplicate","eventId":"event-a","status":"pending","attempts":0,' +
      '"lastError":null,"retries":0,"attemptsSinceRetry":0},' +
      '{"id":"job-duplicate","eventId":"event-b","status":"done","attempts":1,"lastError":null,' +
      '"retries":1,"attemptsSinceRetry":1}],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S25",
    '{"events":[],"jobs":[{"id":"job-valid-matching-first","eventId":"EVENT-TARGET-MUST-NOT-LEAK",' +
      '"status":"done","attempts":1,"lastError":null,"retries":1,"attemptsSinceRetry":1},' +
      '{"id":"job-invalid-missing-attempts","eventId":"event-invalid","status":"pending",' +
      '"lastError":null,"retries":0,"attemptsSinceRetry":0}],"approvals":[],"outbox":[]}\n',
  ],
];

function makeTempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `relay-job-event-retry-count-${label}-`));
}

function writeFixture(dir, name, contents) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, contents);
  return file;
}

function snapshotFile(file) {
  const stat = fs.statSync(file, { bigint: true });
  assert.strictEqual(typeof stat.mode, "bigint", "mode is a BigInt numeric stat field");
  assert.strictEqual(typeof stat.size, "bigint", "size is a BigInt numeric stat field");
  assert.strictEqual(typeof stat.mtimeNs, "bigint", "mtimeNs is a BigInt numeric stat field");
  return {
    bytes: fs.readFileSync(file).toString("hex"),
    mode: stat.mode,
    size: stat.size,
    mtimeNs: stat.mtimeNs,
  };
}

function snapshotDirectory(dir) {
  const stat = fs.statSync(dir, { bigint: true });
  assert.strictEqual(typeof stat.mode, "bigint", "mode is a BigInt numeric stat field");
  assert.strictEqual(typeof stat.size, "bigint", "size is a BigInt numeric stat field");
  assert.strictEqual(typeof stat.mtimeNs, "bigint", "mtimeNs is a BigInt numeric stat field");
  return {
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
    timeout: CHILD_TIMEOUT_MS,
  });
  assert.strictEqual(
    result.error,
    undefined,
    `child reported an error: ${result.error && result.error.message}`
  );
  assert.strictEqual(result.signal, null, `child terminated by signal ${result.signal}`);
  const stdout = result.stdout.toString("utf8");
  const stderr = result.stderr.toString("utf8");
  for (const token of SENSITIVE_TOKENS) {
    assert.strictEqual(stdout.includes(token), false, `stdout leaked ${token}`);
    assert.strictEqual(stderr.includes(token), false, `stderr leaked ${token}`);
  }
  return {
    status: result.status,
    stdout,
    stderr,
    stdoutBytes: result.stdout.length,
    stderrBytes: result.stderr.length,
  };
}

function matchingJobIds(eventId, retries) {
  return FIXTURE_A_VALUE.jobs
    .filter(job => job.eventId === eventId && job.retries === retries)
    .map(job => job.id);
}

function specifiersOf(source) {
  const found = new Set();
  const pattern = /require\(\s*["']([^"']+)["']\s*\)/g;
  let match = pattern.exec(source);
  while (match !== null) {
    found.add(match[1]);
    match = pattern.exec(source);
  }
  return [...found].sort();
}

function fsOperationsOf(source) {
  const destructured = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\(\s*["']node:fs["']\s*\)/.exec(
    source
  );
  if (destructured !== null) {
    const names = destructured[1]
      .split(",")
      .map(part => part.split(":").pop().trim())
      .filter(part => part.length > 0);
    return [...new Set(names)].sort();
  }

  const bound = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*["']node:fs["']\s*\)/.exec(
    source
  );
  assert.notStrictEqual(bound, null, 'production file must bind require("node:fs")');

  const used = new Set();
  const pattern = new RegExp(`\\b${bound[1]}\\s*\\.\\s*([A-Za-z_$][\\w$]*)`, "g");
  let match = pattern.exec(source);
  while (match !== null) {
    used.add(match[1]);
    match = pattern.exec(source);
  }
  return [...used].sort();
}

test("AC1: Fixture A yields the frozen joint counts for every accepted (event ID, retries) pair and stays byte-identical", () => {
  assert.deepStrictEqual(
    matchingJobIds(TARGET_EVENT_ID, 1),
    ["JOB-MATCH-PENDING-MUST-NOT-LEAK", "JOB-MATCH-DONE-MUST-NOT-LEAK"],
    "the retries-1 query matches exactly the first two target jobs"
  );
  assert.deepStrictEqual(
    matchingJobIds(TARGET_EVENT_ID, 0),
    ["JOB-ZERO-RETRY-MUST-NOT-LEAK"],
    "the retries-0 query matches exactly the third job"
  );
  assert.deepStrictEqual(
    matchingJobIds(TARGET_EVENT_ID, 9007199254740992),
    ["JOB-LARGE-RETRY-MUST-NOT-LEAK"],
    "the large-retries query matches exactly the fourth job"
  );
  assert.deepStrictEqual(
    matchingJobIds(LOWERCASE_EVENT_ID, 1),
    ["JOB-CASE-EVENT-MUST-NOT-LEAK"],
    "the lower-case event-ID query matches exactly the fifth job"
  );

  const invocations = [
    [TARGET_EVENT_ID, "1", COUNT_2_STDOUT],
    [TARGET_EVENT_ID, "1", COUNT_2_STDOUT],
    [TARGET_EVENT_ID, "0", COUNT_1_STDOUT],
    [TARGET_EVENT_ID, "9007199254740992", COUNT_1_STDOUT],
    [LOWERCASE_EVENT_ID, "1", COUNT_1_STDOUT],
  ];

  const dir = makeTempDir("ac1");
  try {
    const fixture = writeFixture(dir, "state.json", FIXTURE_A);
    const before = snapshotFile(fixture);
    const parentBefore = entryNames(dir);

    for (const [eventId, retries, expected] of invocations) {
      const label = `(${eventId}, ${retries})`;
      const result = runTool([fixture, eventId, retries]);

      assert.strictEqual(result.stderr, "", `stderr for ${label}`);
      assert.strictEqual(result.stderrBytes, 0, `stderr byte count for ${label}`);
      assert.strictEqual(result.stdout, expected, `stdout for ${label}`);
      assert.strictEqual(result.status, 0, `exit code for ${label}`);
      assert.deepStrictEqual(
        snapshotFile(fixture),
        before,
        `fixture bytes and BigInt stat after ${label}`
      );
      assert.deepStrictEqual(entryNames(dir), parentBefore, `parent entries after ${label}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AC2: every frozen valid no-match pair and empty-jobs Fixture B yield the frozen zero count without mutation", () => {
  for (const eventId of ["Event-TARGET-MUST-NOT-LEAK", " EVENT-TARGET-MUST-NOT-LEAK", " "]) {
    for (const job of FIXTURE_A_VALUE.jobs) {
      assert.notStrictEqual(
        eventId,
        job.eventId,
        `no-match event ID ${JSON.stringify(eventId)} must be byte-distinct from stored ${job.id} eventId`
      );
    }
  }
  for (const retryText of ["2", "9007199254740993"]) {
    for (const stored of ["0", "1", "9007199254740992"]) {
      assert.notStrictEqual(
        retryText,
        stored,
        `no-match retry text ${retryText} must be byte-distinct from stored decimal ${stored}`
      );
    }
  }
  assert.notStrictEqual(
    "9007199254740993",
    "9007199254740992",
    "the adjacent zero-match decimal is byte-distinct from the stored canonical decimal"
  );

  const fixtureBValue = JSON.parse(FIXTURE_B);
  assert.deepStrictEqual(fixtureBValue.jobs, [], "Fixture B has the exact empty jobs array");
  assert.deepStrictEqual(
    fixtureBValue.events,
    [null],
    "Fixture B keeps its frozen opaque event value"
  );
  assert.deepStrictEqual(
    fixtureBValue.approvals,
    [7],
    "Fixture B keeps its frozen opaque approval value"
  );
  assert.deepStrictEqual(
    fixtureBValue.outbox,
    ["OPAQUE-SIBLING-CONTENT-MUST-NOT-LEAK"],
    "Fixture B keeps its frozen opaque outbox value"
  );

  for (let i = 0; i < NO_MATCH_PAIRS.length; i += 1) {
    const [eventId, retries] = NO_MATCH_PAIRS[i];
    const dir = makeTempDir(`ac2-pair-${i + 1}`);
    try {
      const fixture = writeFixture(dir, "state.json", FIXTURE_A);
      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);

      const result = runTool([fixture, eventId, retries]);

      const label = `no-match pair ${i + 1}`;
      assert.strictEqual(result.stderr, "", `stderr for ${label}`);
      assert.strictEqual(result.stderrBytes, 0, `stderr byte count for ${label}`);
      assert.strictEqual(result.stdout, COUNT_0_STDOUT, `stdout for ${label}`);
      assert.strictEqual(result.status, 0, `exit code for ${label}`);
      assert.deepStrictEqual(
        snapshotFile(fixture),
        before,
        `fixture bytes and BigInt stat for ${label}`
      );
      assert.deepStrictEqual(entryNames(dir), parentBefore, `parent entries for ${label}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  const dir = makeTempDir("ac2-fixture-b");
  try {
    const fixture = writeFixture(dir, "state.json", FIXTURE_B);
    const before = snapshotFile(fixture);
    const parentBefore = entryNames(dir);

    const result = runTool([fixture, TARGET_EVENT_ID, "1"]);

    assert.strictEqual(result.stderr, "", "stderr for Fixture B");
    assert.strictEqual(result.stderrBytes, 0, "stderr byte count for Fixture B");
    assert.strictEqual(result.stdout, COUNT_0_STDOUT, "stdout for Fixture B");
    assert.strictEqual(result.status, 0, "exit code for Fixture B");
    assert.deepStrictEqual(snapshotFile(fixture), before, "Fixture B bytes and BigInt stat");
    assert.deepStrictEqual(entryNames(dir), parentBefore, "parent entries for Fixture B");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AC3: wrong arity and every frozen semantic-invalid argument fail with the exact usage envelope before any file access", () => {
  for (let i = 0; i < INVALID_RETRY_TEXTS.length; i += 1) {
    for (let j = i + 1; j < INVALID_RETRY_TEXTS.length; j += 1) {
      assert.notStrictEqual(
        INVALID_RETRY_TEXTS[i],
        INVALID_RETRY_TEXTS[j],
        `invalid retry texts ${i} and ${j} must be byte-distinct`
      );
    }
    for (const valid of VALID_RETRY_TEXTS) {
      assert.notStrictEqual(
        INVALID_RETRY_TEXTS[i],
        valid,
        `invalid retry text ${i} must be byte-distinct from valid ${valid}`
      );
    }
  }

  const cases = [
    ["zero arguments", candidate => []],
    ["one argument", candidate => [candidate]],
    ["two arguments", candidate => [candidate, TARGET_EVENT_ID]],
    ["four arguments", candidate => [candidate, TARGET_EVENT_ID, "1", "extra"]],
    ["empty event ID", candidate => [candidate, "", "1"]],
    ...INVALID_RETRY_TEXTS.map((text, index) => [
      `invalid retry text ${index + 1}`,
      candidate => [candidate, TARGET_EVENT_ID, text],
    ]),
  ];

  for (let i = 0; i < cases.length; i += 1) {
    const [label, argsOf] = cases[i];
    const dir = makeTempDir(`ac3-case-${i + 1}`);
    try {
      const candidate = path.join(dir, ARITY_CANDIDATE_NAME);
      assert.deepStrictEqual(entryNames(dir), [], `parent starts empty for ${label}`);

      const result = runTool(argsOf(candidate));

      assert.strictEqual(result.stdout, "", `stdout for ${label}`);
      assert.strictEqual(result.stdoutBytes, 0, `stdout byte count for ${label}`);
      assert.strictEqual(result.stderr, USAGE_ERROR, `stderr for ${label}`);
      assert.strictEqual(result.status, 2, `exit code for ${label}`);
      assert.strictEqual(
        fs.existsSync(candidate),
        false,
        `candidate state path stayed absent for ${label}`
      );
      assert.deepStrictEqual(entryNames(dir), [], `parent stayed empty for ${label}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("AC4: an absent path and a directory path with valid filters fail with the exact read-failure envelope and change nothing", () => {
  const missingParent = makeTempDir("ac4-missing");
  try {
    const missing = path.join(missingParent, ABSENT_CANDIDATE_NAME);
    const parentBefore = entryNames(missingParent);

    const result = runTool([missing, TARGET_EVENT_ID, "1"]);

    assert.strictEqual(result.stdout, "", "stdout for absent path");
    assert.strictEqual(result.stdoutBytes, 0, "stdout byte count for absent path");
    assert.strictEqual(result.stderr, READ_ERROR, "stderr for absent path");
    assert.strictEqual(result.status, 1, "exit code for absent path");
    assert.strictEqual(fs.existsSync(missing), false, "absent path stayed absent");
    assert.deepStrictEqual(
      entryNames(missingParent),
      parentBefore,
      "parent entries for absent path"
    );
  } finally {
    fs.rmSync(missingParent, { recursive: true, force: true });
  }

  const directoryParent = makeTempDir("ac4-directory");
  try {
    const stateDirectory = path.join(directoryParent, DIRECTORY_CANDIDATE_NAME);
    fs.mkdirSync(stateDirectory);
    const before = snapshotDirectory(stateDirectory);
    const parentBefore = entryNames(directoryParent);
    assert.deepStrictEqual(before.entries, [], "state directory starts empty");

    const result = runTool([stateDirectory, TARGET_EVENT_ID, "1"]);

    assert.strictEqual(result.stdout, "", "stdout for directory path");
    assert.strictEqual(result.stdoutBytes, 0, "stdout byte count for directory path");
    assert.strictEqual(result.stderr, READ_ERROR, "stderr for directory path");
    assert.strictEqual(result.status, 1, "exit code for directory path");
    assert.strictEqual(
      fs.statSync(stateDirectory).isDirectory(),
      true,
      "directory path stayed a directory"
    );
    assert.deepStrictEqual(
      snapshotDirectory(stateDirectory),
      before,
      "directory BigInt stat fields and sorted entries"
    );
    assert.deepStrictEqual(
      entryNames(directoryParent),
      parentBefore,
      "parent entries for directory path"
    );
  } finally {
    fs.rmSync(directoryParent, { recursive: true, force: true });
  }
});

test("AC5: Fixtures C and D with valid filters fail with the exact parse-failure envelope and never echo the malformed bytes", () => {
  for (const [label, contents] of [
    ["fixture-c-truncated", FIXTURE_C],
    ["fixture-d-zero-byte", FIXTURE_D],
  ]) {
    const dir = makeTempDir(`ac5-${label}`);
    try {
      const fixture = writeFixture(dir, "state.json", contents);
      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);

      const result = runTool([fixture, TARGET_EVENT_ID, "1"]);

      assert.strictEqual(result.stdout, "", `stdout for ${label}`);
      assert.strictEqual(result.stdoutBytes, 0, `stdout byte count for ${label}`);
      assert.strictEqual(result.stderr, PARSE_ERROR, `stderr for ${label}`);
      assert.strictEqual(result.status, 1, `exit code for ${label}`);
      assert.strictEqual(
        result.stdout.includes("MALFORMED-PAYLOAD-MUST-NOT-LEAK"),
        false,
        `stdout stayed free of the malformed bytes for ${label}`
      );
      assert.strictEqual(
        result.stderr.includes("MALFORMED-PAYLOAD-MUST-NOT-LEAK"),
        false,
        `stderr stayed free of the malformed bytes for ${label}`
      );
      assert.deepStrictEqual(
        snapshotFile(fixture),
        before,
        `fixture bytes and BigInt stat for ${label}`
      );
      assert.deepStrictEqual(entryNames(dir), parentBefore, `parent entries for ${label}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("AC6: every S1-S25 structural-invalid fixture with valid filters fails with the exact invalid-state envelope after a distinctness proof", () => {
  const serialized = [
    ["A", FIXTURE_A],
    ["B", FIXTURE_B],
    ["C", FIXTURE_C],
    ["D", FIXTURE_D],
    ...STRUCTURAL_INVALID_FIXTURES,
  ];

  for (let i = 0; i < serialized.length; i += 1) {
    for (let j = i + 1; j < serialized.length; j += 1) {
      assert.notStrictEqual(
        serialized[i][1],
        serialized[j][1],
        `fixtures ${serialized[i][0]} and ${serialized[j][0]} are byte-identical`
      );
    }
  }

  const s15 = JSON.parse(STRUCTURAL_INVALID_FIXTURES[14][1]);
  assert.strictEqual(
    s15.jobs[0].status,
    "DEAD",
    "S15 freezes the exact casing-derived status value"
  );
  assert.notStrictEqual(s15.jobs[0].status, "dead", "S15's DEAD bytes differ from valid dead");

  const s25 = JSON.parse(STRUCTURAL_INVALID_FIXTURES[24][1]);
  assert.strictEqual(s25.jobs.length, 2, "S25 holds two jobs");
  assert.strictEqual(
    s25.jobs[0].eventId,
    TARGET_EVENT_ID,
    "S25's first job stores the target event ID"
  );
  assert.strictEqual(s25.jobs[0].retries, 1, "S25's first job stores the queried retry count");
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(s25.jobs[0], "attempts"),
    true,
    "S25's first job carries its own attempts property"
  );
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(s25.jobs[1], "attempts"),
    false,
    "S25's invalid sibling omits its own attempts property"
  );

  for (const [label, contents] of STRUCTURAL_INVALID_FIXTURES) {
    const dir = makeTempDir(`ac6-${label.toLowerCase()}`);
    try {
      const fixture = writeFixture(dir, "state.json", contents);
      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);

      const result = runTool([fixture, TARGET_EVENT_ID, "1"]);

      assert.strictEqual(result.stdout, "", `stdout for ${label}`);
      assert.strictEqual(result.stdoutBytes, 0, `stdout byte count for ${label}`);
      assert.strictEqual(result.stderr, INVALID_STATE_ERROR, `stderr for ${label}`);
      assert.strictEqual(result.status, 1, `exit code for ${label}`);
      assert.deepStrictEqual(
        snapshotFile(fixture),
        before,
        `fixture bytes and BigInt stat for ${label}`
      );
      assert.deepStrictEqual(entryNames(dir), parentBefore, `parent entries for ${label}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("AC7: the command self-terminates under the frozen timeout and both files stay inside their frozen source boundaries", () => {
  const dir = makeTempDir("ac7");
  try {
    const fixture = writeFixture(dir, "state.json", FIXTURE_A);
    const result = runTool([fixture, TARGET_EVENT_ID, "1"]);

    assert.strictEqual(result.status, 0, "timed child completed successfully");
    assert.strictEqual(result.stdout, COUNT_2_STDOUT, "timed child stdout");
    assert.strictEqual(result.stderr, "", "timed child stderr");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  assert.strictEqual(fs.existsSync(TOOL), true, "app/tools/job-event-retry-count.js exists");
  const toolSource = fs.readFileSync(TOOL, "utf8");

  assert.deepStrictEqual(specifiersOf(toolSource), ["node:fs"], "complete module-specifier set");
  assert.deepStrictEqual(fsOperationsOf(toolSource), ["readFileSync"], "node:fs operations used");

  for (const forbidden of [
    "server.js",
    "fetch(",
    "WebSocket",
    "node:http",
    "node:https",
    "node:net",
    "node:child_process",
    "setTimeout",
    "setInterval",
  ]) {
    assert.strictEqual(
      toolSource.includes(forbidden),
      false,
      `production file references ${forbidden}`
    );
  }

  const testSource = fs.readFileSync(__filename, "utf8");
  assert.deepStrictEqual(
    specifiersOf(testSource),
    ["node:assert", "node:child_process", "node:fs", "node:os", "node:path", "node:test"],
    "complete test module-specifier set"
  );
});

const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const TOOL = path.join(__dirname, "..", "tools", "approval-reason-count.js");
const CHILD_TIMEOUT_MS = 5_000;

const USAGE_ERROR = "usage: node app/tools/approval-reason-count.js <state-file>\n";
const READ_ERROR = "approval-reason-count: cannot read state file\n";
const PARSE_ERROR = "approval-reason-count: state file is not valid JSON\n";
const INVALID_STATE_ERROR = "approval-reason-count: invalid Relay state\n";

const FIXTURE_A_STDOUT = '{"approvalsWithReasons":3}\n';
const FIXTURE_B_STDOUT = '{"approvalsWithReasons":0}\n';

const ARITY_CANDIDATE_NAME = "arity-state-MUST-NOT-LEAK.json";
const ABSENT_CANDIDATE_NAME = "PATH-MUST-NOT-LEAK.json";
const DIRECTORY_CANDIDATE_NAME = "DIRECTORY-MUST-NOT-LEAK";

const PENDING_REASON = "PENDING-REASON-MUST-NOT-LEAK";
const REJECTION_REASON = "REJECTION-REASON-MUST-NOT-LEAK";
const SPACE_REASON = " ";
const MALFORMED_TOKEN = "MALFORMED-PAYLOAD-MUST-NOT-LEAK";

const SENSITIVE_TOKENS = [
  "EVENT-PAYLOAD-MUST-NOT-LEAK",
  "JOB-ERROR-MUST-NOT-LEAK",
  "PENDING-TO-MUST-NOT-LEAK",
  "PENDING-SUBJECT-MUST-NOT-LEAK",
  "PENDING-BODY-MUST-NOT-LEAK",
  PENDING_REASON,
  "SENT-TO-MUST-NOT-LEAK",
  "SENT-SUBJECT-MUST-NOT-LEAK",
  "SENT-BODY-MUST-NOT-LEAK",
  "REJECTED-TO-MUST-NOT-LEAK",
  "REJECTED-SUBJECT-MUST-NOT-LEAK",
  "REJECTED-BODY-MUST-NOT-LEAK",
  REJECTION_REASON,
  "IGNORED-ACTION-FIELD-MUST-NOT-LEAK",
  "IGNORED-APPROVAL-FIELD-MUST-NOT-LEAK",
  "ABSENT-TO-MUST-NOT-LEAK",
  "ABSENT-SUBJECT-MUST-NOT-LEAK",
  "ABSENT-BODY-MUST-NOT-LEAK",
  "SPACE-TO-MUST-NOT-LEAK",
  "SPACE-SUBJECT-MUST-NOT-LEAK",
  "SPACE-BODY-MUST-NOT-LEAK",
  "OUTBOX-CONTENT-MUST-NOT-LEAK",
  "TOP-LEVEL-METADATA-MUST-NOT-LEAK",
  "OPAQUE-CONTENT-MUST-NOT-LEAK",
  MALFORMED_TOKEN,
  "arity-state-MUST-NOT-LEAK",
  ARITY_CANDIDATE_NAME,
  "PATH-MUST-NOT-LEAK",
  ABSENT_CANDIDATE_NAME,
  DIRECTORY_CANDIDATE_NAME,
];

const FIXTURE_A_VALUE = {
  events: [
    {
      payload: "EVENT-PAYLOAD-MUST-NOT-LEAK",
    },
  ],
  jobs: [
    {
      lastError: "JOB-ERROR-MUST-NOT-LEAK",
    },
  ],
  approvals: [
    {
      id: "appr-pending-reason",
      jobId: "job-pending-reason",
      action: {
        to: "PENDING-TO-MUST-NOT-LEAK",
        subject: "PENDING-SUBJECT-MUST-NOT-LEAK",
        body: "PENDING-BODY-MUST-NOT-LEAK",
      },
      status: "pending",
      proposedAt: "2026-08-24T12:00:00.000Z",
      reason: PENDING_REASON,
    },
    {
      id: "appr-sent-empty",
      jobId: "job-sent-empty",
      action: {
        to: "SENT-TO-MUST-NOT-LEAK",
        subject: "SENT-SUBJECT-MUST-NOT-LEAK",
        body: "SENT-BODY-MUST-NOT-LEAK",
      },
      status: "sent",
      proposedAt: "2026-08-24T12:00:01.000Z",
      reason: "",
    },
    {
      id: "appr-rejected-reason",
      jobId: "job-rejected-reason",
      action: {
        to: "REJECTED-TO-MUST-NOT-LEAK",
        subject: "REJECTED-SUBJECT-MUST-NOT-LEAK",
        body: "REJECTED-BODY-MUST-NOT-LEAK",
      },
      status: "rejected",
      proposedAt: "2026-08-24T12:00:02.000Z",
      reason: REJECTION_REASON,
    },
    {
      id: "appr-blocked-null",
      jobId: "job-blocked-null",
      action: {
        to: 7,
        subject: null,
        body: false,
        ignored: "IGNORED-ACTION-FIELD-MUST-NOT-LEAK",
      },
      status: "blocked_recipient",
      proposedAt: "not-an-iso-instant",
      reason: null,
      ignoredDiagnostic: "IGNORED-APPROVAL-FIELD-MUST-NOT-LEAK",
    },
    {
      id: "appr-rejected-absent",
      jobId: "job-rejected-absent",
      action: {
        to: "ABSENT-TO-MUST-NOT-LEAK",
        subject: "ABSENT-SUBJECT-MUST-NOT-LEAK",
        body: "ABSENT-BODY-MUST-NOT-LEAK",
      },
      status: "rejected",
      proposedAt: "2026-08-24T12:00:04.000Z",
    },
    {
      id: "appr-sent-space",
      jobId: "job-sent-space",
      action: {
        to: "SPACE-TO-MUST-NOT-LEAK",
        subject: "SPACE-SUBJECT-MUST-NOT-LEAK",
        body: "SPACE-BODY-MUST-NOT-LEAK",
      },
      status: "sent",
      proposedAt: "2026-08-24T12:00:05.000Z",
      reason: SPACE_REASON,
    },
  ],
  outbox: [
    {
      body: "OUTBOX-CONTENT-MUST-NOT-LEAK",
    },
  ],
  metadata: {
    note: "TOP-LEVEL-METADATA-MUST-NOT-LEAK",
  },
};

const FIXTURE_A = JSON.stringify(FIXTURE_A_VALUE, null, 2) + "\n";
const FIXTURE_B =
  '{"events":[null],"jobs":[7],"approvals":[{"id":"appr-absent","jobId":"job-absent",' +
  '"action":{"to":"a","subject":"b","body":"c"},"status":"pending","proposedAt":"time-a"},' +
  '{"id":"appr-null","jobId":"job-null","action":{"to":"d","subject":"e","body":"f"},' +
  '"status":"rejected","proposedAt":"time-b","reason":null},{"id":"appr-empty",' +
  '"jobId":"job-empty","action":{"to":"g","subject":"h","body":"i"},"status":"rejected",' +
  '"proposedAt":"time-c","reason":""}],"outbox":["OPAQUE-CONTENT-MUST-NOT-LEAK"],' +
  '"metadata":false}\n';
const FIXTURE_C = '{"approvals":[],"payload":"MALFORMED-PAYLOAD-MUST-NOT-LEAK"\n';
const FIXTURE_D = "";

const STRUCTURAL_INVALID_FIXTURES = [
  ["S1", "null\n"],
  ["S2", "[]\n"],
  ["S3", '{"events":[],"jobs":[],"approvals":[]}\n'],
  ["S4", '{"events":{},"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S5", '{"events":[],"jobs":{},"approvals":[],"outbox":[]}\n'],
  ["S6", '{"events":[],"jobs":[],"approvals":{},"outbox":[]}\n'],
  ["S7", '{"events":[],"jobs":[],"approvals":[],"outbox":{}}\n'],
  ["S8", '{"events":[],"jobs":[],"approvals":[null],"outbox":[]}\n'],
  ["S9", '{"events":[],"jobs":[],"approvals":[[]],"outbox":[]}\n'],
  [
    "S10",
    '{"events":[],"jobs":[],"approvals":[{"jobId":"job-a","action":{"to":"a","subject":"b",' +
      '"body":"c"},"status":"pending","proposedAt":"time-a"}],"outbox":[]}\n',
  ],
  [
    "S11",
    '{"events":[],"jobs":[],"approvals":[{"id":"","jobId":"job-a","action":{"to":"a",' +
      '"subject":"b","body":"c"},"status":"pending","proposedAt":"time-a"}],"outbox":[]}\n',
  ],
  [
    "S12",
    '{"events":[],"jobs":[],"approvals":[{"id":7,"jobId":"job-a","action":{"to":"a",' +
      '"subject":"b","body":"c"},"status":"pending","proposedAt":"time-a"}],"outbox":[]}\n',
  ],
  [
    "S13",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","action":{"to":"a","subject":"b",' +
      '"body":"c"},"status":"pending","proposedAt":"time-a"}],"outbox":[]}\n',
  ],
  [
    "S14",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"","action":{"to":"a",' +
      '"subject":"b","body":"c"},"status":"pending","proposedAt":"time-a"}],"outbox":[]}\n',
  ],
  [
    "S15",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":7,"action":{"to":"a",' +
      '"subject":"b","body":"c"},"status":"pending","proposedAt":"time-a"}],"outbox":[]}\n',
  ],
  [
    "S16",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","status":"pending",' +
      '"proposedAt":"time-a"}],"outbox":[]}\n',
  ],
  [
    "S17",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","action":null,' +
      '"status":"pending","proposedAt":"time-a"}],"outbox":[]}\n',
  ],
  [
    "S18",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","action":[],' +
      '"status":"pending","proposedAt":"time-a"}],"outbox":[]}\n',
  ],
  [
    "S19",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","action":' +
      '{"subject":"b","body":"c"},"status":"pending","proposedAt":"time-a"}],"outbox":[]}\n',
  ],
  [
    "S20",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","action":{"to":"a",' +
      '"body":"c"},"status":"pending","proposedAt":"time-a"}],"outbox":[]}\n',
  ],
  [
    "S21",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","action":{"to":"a",' +
      '"subject":"b"},"status":"pending","proposedAt":"time-a"}],"outbox":[]}\n',
  ],
  [
    "S22",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","action":{"to":"a",' +
      '"subject":"b","body":"c"},"status":"pending"}],"outbox":[]}\n',
  ],
  [
    "S23",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","action":{"to":"a",' +
      '"subject":"b","body":"c"},"status":"pending","proposedAt":""}],"outbox":[]}\n',
  ],
  [
    "S24",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","action":{"to":"a",' +
      '"subject":"b","body":"c"},"status":"pending","proposedAt":7}],"outbox":[]}\n',
  ],
  [
    "S25",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","action":{"to":"a",' +
      '"subject":"b","body":"c"},"proposedAt":"time-a"}],"outbox":[]}\n',
  ],
  [
    "S26",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","action":{"to":"a",' +
      '"subject":"b","body":"c"},"status":"PENDING","proposedAt":"time-a"}],"outbox":[]}\n',
  ],
  [
    "S27",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","action":{"to":"a",' +
      '"subject":"b","body":"c"},"status":null,"proposedAt":"time-a"}],"outbox":[]}\n',
  ],
  [
    "S28",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","action":{"to":"a",' +
      '"subject":"b","body":"c"},"status":"rejected","proposedAt":"time-a","reason":7}],' +
      '"outbox":[]}\n',
  ],
  [
    "S29",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-duplicate","jobId":"job-a","action":' +
      '{"to":"a","subject":"b","body":"c"},"status":"pending","proposedAt":"time-a"},' +
      '{"id":"appr-duplicate","jobId":"job-b","action":{"to":"d","subject":"e","body":"f"},' +
      '"status":"sent","proposedAt":"time-b"}],"outbox":[]}\n',
  ],
  [
    "S30",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-valid-first","jobId":"job-valid",' +
      '"action":{"to":"a","subject":"b","body":"c"},"status":"pending","proposedAt":"time-a",' +
      '"reason":"count-me"},{"id":"appr-invalid-second","jobId":"job-invalid","action":' +
      '{"to":"d","subject":"e","body":"f"},"status":"rejected","proposedAt":"time-b",' +
      '"reason":false}],"outbox":[]}\n',
  ],
];

const S26_INDEX = 25;
const S30_INDEX = 29;

function hasOwn(value, property) {
  return Object.prototype.hasOwnProperty.call(value, property);
}

function makeTempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `relay-approval-reason-count-${label}-`));
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

test("AC1: two invocations against Fixture A each print the frozen three-reason count and leave the fixture untouched", () => {
  const approvals = FIXTURE_A_VALUE.approvals;
  assert.strictEqual(approvals.length, 6, "Fixture A freezes six approvals");
  assert.strictEqual(
    approvals[0].reason,
    "PENDING-REASON-MUST-NOT-LEAK",
    "the first counted reason is the frozen pending text literal"
  );
  assert.strictEqual(
    approvals[2].reason,
    "REJECTION-REASON-MUST-NOT-LEAK",
    "the second counted reason is the frozen rejection text literal"
  );
  assert.strictEqual(approvals[5].reason, " ", "the third counted reason is the exact one-space string");
  assert.strictEqual(approvals[5].reason.length, 1, "the one-space reason has one UTF-16 code unit");
  assert.strictEqual(approvals[1].reason, "", "the empty-string reason is not counted");
  assert.strictEqual(approvals[1].reason.length, 0, "the empty-string reason has zero code units");
  assert.strictEqual(approvals[3].reason, null, "the null reason is not counted");
  assert.strictEqual(
    hasOwn(approvals[4], "reason"),
    false,
    "the absent-reason approval has no own reason property"
  );
  assert.deepStrictEqual(
    approvals.map(approval => approval.status),
    ["pending", "sent", "rejected", "blocked_recipient", "rejected", "sent"],
    "Fixture A exercises every frozen status value"
  );

  const dir = makeTempDir("ac1");
  try {
    const fixture = writeFixture(dir, "state.json", FIXTURE_A);
    const before = snapshotFile(fixture);
    const parentBefore = entryNames(dir);

    for (const attempt of [1, 2]) {
      const result = runTool([fixture]);

      assert.strictEqual(result.stderr, "", `stderr on invocation ${attempt}`);
      assert.strictEqual(result.stderrBytes, 0, `stderr byte count on invocation ${attempt}`);
      assert.strictEqual(result.stdout, FIXTURE_A_STDOUT, `stdout on invocation ${attempt}`);
      assert.strictEqual(result.status, 0, `exit code on invocation ${attempt}`);
      assert.deepStrictEqual(
        snapshotFile(fixture),
        before,
        `fixture bytes and bigint stat after invocation ${attempt}`
      );
      assert.deepStrictEqual(
        entryNames(dir),
        parentBefore,
        `parent entries after invocation ${attempt}`
      );
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AC2: Fixture B prints the frozen zero count for absent, null, and empty reasons", () => {
  const fixtureBValue = JSON.parse(FIXTURE_B);
  assert.strictEqual(fixtureBValue.approvals.length, 3, "Fixture B holds exactly three approvals");
  assert.strictEqual(
    hasOwn(fixtureBValue.approvals[0], "reason"),
    false,
    "Fixture B's first approval has no own reason property"
  );
  assert.strictEqual(fixtureBValue.approvals[1].reason, null, "Fixture B's second reason is null");
  assert.strictEqual(
    fixtureBValue.approvals[2].reason,
    "",
    "Fixture B's third reason is the empty string"
  );
  assert.deepStrictEqual(
    fixtureBValue.events,
    [null],
    "Fixture B keeps its frozen opaque event value"
  );
  assert.deepStrictEqual(fixtureBValue.jobs, [7], "Fixture B keeps its frozen opaque job value");
  assert.deepStrictEqual(
    fixtureBValue.outbox,
    ["OPAQUE-CONTENT-MUST-NOT-LEAK"],
    "Fixture B keeps its frozen opaque outbox value"
  );
  assert.strictEqual(
    fixtureBValue.metadata,
    false,
    "Fixture B keeps its frozen additional top-level property"
  );

  const dir = makeTempDir("ac2");
  try {
    const fixture = writeFixture(dir, "state.json", FIXTURE_B);
    const before = snapshotFile(fixture);
    const parentBefore = entryNames(dir);

    const result = runTool([fixture]);

    assert.strictEqual(result.stderr, "", "stderr for Fixture B");
    assert.strictEqual(result.stderrBytes, 0, "stderr byte count for Fixture B");
    assert.strictEqual(result.stdout, FIXTURE_B_STDOUT, "stdout for Fixture B");
    assert.strictEqual(result.status, 0, "exit code for Fixture B");
    assert.deepStrictEqual(snapshotFile(fixture), before, "Fixture B bytes and bigint stat");
    assert.deepStrictEqual(entryNames(dir), parentBefore, "parent entries for Fixture B");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AC3: zero and two positional arguments fail with the exact usage envelope and never touch the candidate path", () => {
  for (const label of ["zero", "two"]) {
    const dir = makeTempDir(`ac3-${label}`);
    try {
      const candidate = path.join(dir, ARITY_CANDIDATE_NAME);
      const args = label === "zero" ? [] : [candidate, "extra"];

      const result = runTool(args);

      assert.strictEqual(result.stdout, "", `stdout for ${label} arguments`);
      assert.strictEqual(result.stdoutBytes, 0, `stdout byte count for ${label} arguments`);
      assert.strictEqual(result.stderr, USAGE_ERROR, `stderr for ${label} arguments`);
      assert.strictEqual(result.status, 2, `exit code for ${label} arguments`);
      assert.strictEqual(
        fs.existsSync(candidate),
        false,
        `candidate state path stayed absent for ${label} arguments`
      );
      assert.deepStrictEqual(entryNames(dir), [], `parent stayed empty for ${label} arguments`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("AC4: an absent path and a directory path fail with the exact read-failure envelope and change nothing", () => {
  const missingParent = makeTempDir("ac4-missing");
  try {
    const missing = path.join(missingParent, ABSENT_CANDIDATE_NAME);
    const parentBefore = entryNames(missingParent);

    const result = runTool([missing]);

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

    const result = runTool([stateDirectory]);

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
      "directory stat fields and entries"
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

test("AC5: Fixtures C and D fail with the exact parse-failure envelope and never echo the malformed bytes", () => {
  for (const [label, contents] of [
    ["fixture-c-truncated", FIXTURE_C],
    ["fixture-d-zero-byte", FIXTURE_D],
  ]) {
    const dir = makeTempDir(`ac5-${label}`);
    try {
      const fixture = writeFixture(dir, "state.json", contents);
      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);

      const result = runTool([fixture]);

      assert.strictEqual(result.stdout, "", `stdout for ${label}`);
      assert.strictEqual(result.stdoutBytes, 0, `stdout byte count for ${label}`);
      assert.strictEqual(result.stderr, PARSE_ERROR, `stderr for ${label}`);
      assert.strictEqual(result.status, 1, `exit code for ${label}`);
      assert.strictEqual(
        result.stdout.includes(MALFORMED_TOKEN),
        false,
        `stdout stayed free of the malformed payload for ${label}`
      );
      assert.strictEqual(
        result.stderr.includes(MALFORMED_TOKEN),
        false,
        `stderr stayed free of the malformed payload for ${label}`
      );
      assert.deepStrictEqual(snapshotFile(fixture), before, `fixture bytes and stat for ${label}`);
      assert.deepStrictEqual(entryNames(dir), parentBefore, `parent entries for ${label}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("AC6: every S1-S30 structural-invalid fixture fails with the exact invalid-state envelope after a distinctness proof", () => {
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

  const s26 = JSON.parse(STRUCTURAL_INVALID_FIXTURES[S26_INDEX][1]);
  assert.strictEqual(
    s26.approvals[0].status,
    "PENDING",
    "S26 freezes the exact casing-derived status value"
  );
  assert.notStrictEqual(
    s26.approvals[0].status,
    FIXTURE_A_VALUE.approvals[0].status,
    "S26's derived status differs from the valid Fixture A status"
  );
  assert.notStrictEqual(
    Buffer.from(s26.approvals[0].status, "utf8").toString("hex"),
    Buffer.from(FIXTURE_A_VALUE.approvals[0].status, "utf8").toString("hex"),
    "S26's PENDING bytes differ from the valid pending bytes"
  );

  const s30 = JSON.parse(STRUCTURAL_INVALID_FIXTURES[S30_INDEX][1]);
  assert.strictEqual(s30.approvals.length, 2, "S30 holds two approvals");
  assert.strictEqual(
    s30.approvals[0].reason,
    "count-me",
    "S30's first approval carries a countable non-empty reason"
  );
  assert.strictEqual(
    s30.approvals[1].reason,
    false,
    "S30's invalid sibling carries a non-null non-string reason"
  );

  for (const [label, contents] of STRUCTURAL_INVALID_FIXTURES) {
    const dir = makeTempDir(`ac6-${label.toLowerCase()}`);
    try {
      const fixture = writeFixture(dir, "state.json", contents);
      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);

      const result = runTool([fixture]);

      assert.strictEqual(result.stdout, "", `stdout for ${label}`);
      assert.strictEqual(result.stdoutBytes, 0, `stdout byte count for ${label}`);
      assert.strictEqual(result.stderr, INVALID_STATE_ERROR, `stderr for ${label}`);
      assert.strictEqual(result.status, 1, `exit code for ${label}`);
      assert.deepStrictEqual(snapshotFile(fixture), before, `fixture bytes and stat for ${label}`);
      assert.deepStrictEqual(entryNames(dir), parentBefore, `parent entries for ${label}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("AC7: the production command self-terminates under the frozen timeout and both files stay inside their frozen source boundaries", () => {
  const dir = makeTempDir("ac7");
  try {
    const fixture = writeFixture(dir, "state.json", FIXTURE_A);
    const result = runTool([fixture]);

    assert.strictEqual(result.status, 0, "timed child completed successfully");
    assert.strictEqual(result.stdout, FIXTURE_A_STDOUT, "timed child stdout");
    assert.strictEqual(result.stderr, "", "timed child stderr");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  assert.strictEqual(fs.existsSync(TOOL), true, "app/tools/approval-reason-count.js exists");
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

test("arity permutation: three positional arguments fail with the exact usage envelope", () => {
  const dir = makeTempDir("arity-three");
  try {
    const candidate = path.join(dir, ARITY_CANDIDATE_NAME);

    const result = runTool([candidate, "extra", "third"]);

    assert.strictEqual(result.stdout, "", "stdout for three arguments");
    assert.strictEqual(result.stdoutBytes, 0, "stdout byte count for three arguments");
    assert.strictEqual(result.stderr, USAGE_ERROR, "stderr for three arguments");
    assert.strictEqual(result.status, 2, "exit code for three arguments");
    assert.strictEqual(fs.existsSync(candidate), false, "candidate state path stayed absent");
    assert.deepStrictEqual(entryNames(dir), [], "parent stayed empty for three arguments");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("root permutation: a primitive root fails with the exact invalid-state envelope", () => {
  const dir = makeTempDir("root-primitive");
  try {
    const fixture = writeFixture(dir, "state.json", "7\n");

    const result = runTool([fixture]);

    assert.strictEqual(result.stdout, "", "stdout for the primitive root");
    assert.strictEqual(result.stdoutBytes, 0, "stdout byte count for the primitive root");
    assert.strictEqual(result.stderr, INVALID_STATE_ERROR, "stderr for the primitive root");
    assert.strictEqual(result.status, 1, "exit code for the primitive root");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("sibling-key permutation: a state omitting its own events key fails with the exact invalid-state envelope", () => {
  const dir = makeTempDir("missing-sibling-key");
  try {
    const fixture = writeFixture(
      dir,
      "state.json",
      '{"jobs":[],"approvals":[],"outbox":[]}\n'
    );

    const result = runTool([fixture]);

    assert.strictEqual(result.stdout, "", "stdout for the missing events key");
    assert.strictEqual(result.stdoutBytes, 0, "stdout byte count for the missing events key");
    assert.strictEqual(result.stderr, INVALID_STATE_ERROR, "stderr for the missing events key");
    assert.strictEqual(result.status, 1, "exit code for the missing events key");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("zero-count permutation: an empty approvals array prints the frozen zero count", () => {
  const dir = makeTempDir("empty-approvals");
  try {
    const fixture = writeFixture(
      dir,
      "state.json",
      '{"events":[],"jobs":[],"approvals":[],"outbox":[]}\n'
    );

    const result = runTool([fixture]);

    assert.strictEqual(result.stderr, "", "stderr for the empty approvals array");
    assert.strictEqual(result.stderrBytes, 0, "stderr byte count for the empty approvals array");
    assert.strictEqual(result.stdout, FIXTURE_B_STDOUT, "stdout for the empty approvals array");
    assert.strictEqual(result.status, 0, "exit code for the empty approvals array");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

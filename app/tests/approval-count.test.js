const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const TOOL = path.join(__dirname, "..", "tools", "approval-count.js");
const CHILD_TIMEOUT_MS = 5_000;

const USAGE_ERROR = "usage: node app/tools/approval-count.js <state-file>\n";
const READ_ERROR = "approval-count: cannot read state file\n";
const PARSE_ERROR = "approval-count: state file is not valid JSON\n";
const INVALID_STATE_ERROR = "approval-count: invalid Relay state\n";

const FIXTURE_A_STDOUT = '{"approvals":4}\n';
const FIXTURE_B_STDOUT = '{"approvals":0}\n';

const ARITY_CANDIDATE_NAME = "arity-state-MUST-NOT-LEAK.json";
const ABSENT_CANDIDATE_NAME = "PATH-MUST-NOT-LEAK.json";
const DIRECTORY_CANDIDATE_NAME = "DIRECTORY-MUST-NOT-LEAK";

const SENSITIVE_TOKENS = [
  "EVENT-PAYLOAD-MUST-NOT-LEAK",
  "JOB-ERROR-MUST-NOT-LEAK",
  "APPROVAL-ID-PENDING-MUST-NOT-LEAK",
  "APPROVAL-ID-SENT-MUST-NOT-LEAK",
  "APPROVAL-ID-REJECTED-MUST-NOT-LEAK",
  "APPROVAL-ID-BLOCKED-MUST-NOT-LEAK",
  "JOB-ID-PENDING-MUST-NOT-LEAK",
  "JOB-ID-SENT-MUST-NOT-LEAK",
  "JOB-ID-REJECTED-MUST-NOT-LEAK",
  "JOB-ID-BLOCKED-MUST-NOT-LEAK",
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
  "IGNORED-ACTION-FIELD-MUST-NOT-LEAK",
  "IGNORED-APPROVAL-FIELD-MUST-NOT-LEAK",
  "OUTBOX-CONTENT-MUST-NOT-LEAK",
  "TOP-LEVEL-METADATA-MUST-NOT-LEAK",
  "OPAQUE-CONTENT-MUST-NOT-LEAK",
  "MALFORMED-PAYLOAD-MUST-NOT-LEAK",
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
      id: "APPROVAL-ID-PENDING-MUST-NOT-LEAK",
      jobId: "JOB-ID-PENDING-MUST-NOT-LEAK",
      action: {
        to: "PENDING-TO-MUST-NOT-LEAK",
        subject: "PENDING-SUBJECT-MUST-NOT-LEAK",
        body: "PENDING-BODY-MUST-NOT-LEAK",
      },
      status: "pending",
      proposedAt: "2026-08-24T12:00:00.000Z",
    },
    {
      id: "APPROVAL-ID-SENT-MUST-NOT-LEAK",
      jobId: "JOB-ID-SENT-MUST-NOT-LEAK",
      action: {
        to: "SENT-TO-MUST-NOT-LEAK",
        subject: "SENT-SUBJECT-MUST-NOT-LEAK",
        body: "SENT-BODY-MUST-NOT-LEAK",
      },
      status: "sent",
      proposedAt: "2026-08-24T12:00:01.000Z",
    },
    {
      id: "APPROVAL-ID-REJECTED-MUST-NOT-LEAK",
      jobId: "JOB-ID-REJECTED-MUST-NOT-LEAK",
      action: {
        to: "REJECTED-TO-MUST-NOT-LEAK",
        subject: "REJECTED-SUBJECT-MUST-NOT-LEAK",
        body: "REJECTED-BODY-MUST-NOT-LEAK",
      },
      status: "rejected",
      proposedAt: "2026-08-24T12:00:02.000Z",
      reason: "REJECTION-REASON-MUST-NOT-LEAK",
    },
    {
      id: "APPROVAL-ID-BLOCKED-MUST-NOT-LEAK",
      jobId: "JOB-ID-BLOCKED-MUST-NOT-LEAK",
      action: {
        to: 7,
        subject: null,
        body: false,
        ignored: "IGNORED-ACTION-FIELD-MUST-NOT-LEAK",
      },
      status: "blocked_recipient",
      proposedAt: "2026-08-24T12:00:03.000Z",
      ignoredDiagnostic: "IGNORED-APPROVAL-FIELD-MUST-NOT-LEAK",
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
  '{"events":[null],"jobs":[7],"approvals":[],"outbox":["OPAQUE-CONTENT-MUST-NOT-LEAK"],' +
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
      '"body":"c"},"status":"pending","proposedAt":"2026-08-24T12:00:00.000Z"}],"outbox":[]}\n',
  ],
  [
    "S11",
    '{"events":[],"jobs":[],"approvals":[{"id":"","jobId":"job-a","action":{"to":"a",' +
      '"subject":"b","body":"c"},"status":"pending","proposedAt":"2026-08-24T12:00:00.000Z"}],' +
      '"outbox":[]}\n',
  ],
  [
    "S12",
    '{"events":[],"jobs":[],"approvals":[{"id":7,"jobId":"job-a","action":{"to":"a",' +
      '"subject":"b","body":"c"},"status":"pending","proposedAt":"2026-08-24T12:00:00.000Z"}],' +
      '"outbox":[]}\n',
  ],
  [
    "S13",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","action":{"to":"a","subject":"b",' +
      '"body":"c"},"status":"pending","proposedAt":"2026-08-24T12:00:00.000Z"}],"outbox":[]}\n',
  ],
  [
    "S14",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"","action":{"to":"a",' +
      '"subject":"b","body":"c"},"status":"pending","proposedAt":"2026-08-24T12:00:00.000Z"}],' +
      '"outbox":[]}\n',
  ],
  [
    "S15",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":7,"action":{"to":"a",' +
      '"subject":"b","body":"c"},"status":"pending","proposedAt":"2026-08-24T12:00:00.000Z"}],' +
      '"outbox":[]}\n',
  ],
  [
    "S16",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","status":"pending",' +
      '"proposedAt":"2026-08-24T12:00:00.000Z"}],"outbox":[]}\n',
  ],
  [
    "S17",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","action":null,' +
      '"status":"pending","proposedAt":"2026-08-24T12:00:00.000Z"}],"outbox":[]}\n',
  ],
  [
    "S18",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","action":[],' +
      '"status":"pending","proposedAt":"2026-08-24T12:00:00.000Z"}],"outbox":[]}\n',
  ],
  [
    "S19",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","action":{"subject":"b",' +
      '"body":"c"},"status":"pending","proposedAt":"2026-08-24T12:00:00.000Z"}],"outbox":[]}\n',
  ],
  [
    "S20",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","action":{"to":"a",' +
      '"body":"c"},"status":"pending","proposedAt":"2026-08-24T12:00:00.000Z"}],"outbox":[]}\n',
  ],
  [
    "S21",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","action":{"to":"a",' +
      '"subject":"b"},"status":"pending","proposedAt":"2026-08-24T12:00:00.000Z"}],"outbox":[]}\n',
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
      '"subject":"b","body":"c"},"proposedAt":"2026-08-24T12:00:00.000Z"}],"outbox":[]}\n',
  ],
  [
    "S26",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","action":{"to":"a",' +
      '"subject":"b","body":"c"},"status":"PENDING","proposedAt":"2026-08-24T12:00:00.000Z"}],' +
      '"outbox":[]}\n',
  ],
  [
    "S27",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","action":{"to":"a",' +
      '"subject":"b","body":"c"},"status":null,"proposedAt":"2026-08-24T12:00:00.000Z"}],' +
      '"outbox":[]}\n',
  ],
  [
    "S28",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-duplicate","jobId":"job-a","action":' +
      '{"to":"a","subject":"b","body":"c"},"status":"pending",' +
      '"proposedAt":"2026-08-24T12:00:00.000Z"},{"id":"appr-duplicate","jobId":"job-b",' +
      '"action":{"to":"d","subject":"e","body":"f"},"status":"sent",' +
      '"proposedAt":"2026-08-24T12:00:01.000Z"}],"outbox":[]}\n',
  ],
  [
    "S29",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-valid-first","jobId":"job-valid","action":' +
      '{"to":"a","subject":"b","body":"c"},"status":"sent",' +
      '"proposedAt":"2026-08-24T12:00:00.000Z"},{"id":"appr-invalid-second",' +
      '"jobId":"job-invalid","action":{"to":"d","subject":"e","body":"f"},"status":"pending"}],' +
      '"outbox":[]}\n',
  ],
];

const S26_INDEX = 25;
const S29_INDEX = 28;

function makeTempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `relay-approval-count-${label}-`));
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

test("AC1: two invocations against Fixture A each print the frozen four-approval count and leave the fixture untouched", () => {
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

test("AC2: Fixture B prints the frozen zero count while its opaque sibling collections stay unconsumed", () => {
  const fixtureBValue = JSON.parse(FIXTURE_B);
  assert.deepStrictEqual(
    fixtureBValue.approvals,
    [],
    "Fixture B has the exact empty approvals array"
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

    assert.strictEqual(result.stderr, "");
    assert.strictEqual(result.stderrBytes, 0);
    assert.strictEqual(result.stdout, FIXTURE_B_STDOUT);
    assert.strictEqual(result.status, 0);
    assert.deepStrictEqual(snapshotFile(fixture), before);
    assert.deepStrictEqual(entryNames(dir), parentBefore);
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
        result.stdout.includes("MALFORMED-PAYLOAD-MUST-NOT-LEAK"),
        false,
        `stdout stayed free of the malformed bytes for ${label}`
      );
      assert.strictEqual(
        result.stderr.includes("MALFORMED-PAYLOAD-MUST-NOT-LEAK"),
        false,
        `stderr stayed free of the malformed bytes for ${label}`
      );
      assert.deepStrictEqual(snapshotFile(fixture), before, `fixture bytes and stat for ${label}`);
      assert.deepStrictEqual(entryNames(dir), parentBefore, `parent entries for ${label}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("AC6: every S1-S29 structural-invalid fixture fails with the exact invalid-state envelope after a distinctness proof", () => {
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

  const s29 = JSON.parse(STRUCTURAL_INVALID_FIXTURES[S29_INDEX][1]);
  assert.strictEqual(s29.approvals.length, 2, "S29 holds two approvals");
  assert.strictEqual(
    s29.approvals[0].proposedAt,
    "2026-08-24T12:00:00.000Z",
    "S29's first approval is a valid approval"
  );
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(s29.approvals[1], "proposedAt"),
    false,
    "S29's invalid sibling omits its own proposedAt property"
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

  assert.strictEqual(fs.existsSync(TOOL), true, "app/tools/approval-count.js exists");
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

test("field independence: a rejected approval with a null reason and a non-ISO proposedAt string is counted as valid", () => {
  const dir = makeTempDir("independence");
  try {
    const fixture = writeFixture(
      dir,
      "state.json",
      JSON.stringify(
        {
          events: [],
          jobs: [],
          approvals: [
            {
              id: "appr-rejected-null-reason",
              jobId: "job-rejected",
              action: { to: "a", subject: "b", body: "c" },
              status: "rejected",
              proposedAt: "2026-08-24T12:00:00.000Z",
              reason: null,
            },
            {
              id: "appr-pending-with-reason",
              jobId: "job-pending",
              action: { to: "d", subject: "e", body: "f" },
              status: "pending",
              proposedAt: "not-an-iso-instant",
              reason: "operator note",
            },
          ],
          outbox: [],
        },
        null,
        2
      ) + "\n"
    );

    const result = runTool([fixture]);

    assert.strictEqual(result.stderr, "", "stderr for the reason-independence fixture");
    assert.strictEqual(
      result.stdout,
      '{"approvals":2}\n',
      "stdout for the reason-independence fixture"
    );
    assert.strictEqual(result.status, 0, "exit code for the reason-independence fixture");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("root scalar: a numeric root fails with the exact invalid-state envelope", () => {
  const dir = makeTempDir("root-scalar");
  try {
    const fixture = writeFixture(dir, "state.json", "7\n");

    const result = runTool([fixture]);

    assert.strictEqual(result.stdout, "", "stdout for the scalar root");
    assert.strictEqual(result.stdoutBytes, 0, "stdout byte count for the scalar root");
    assert.strictEqual(result.stderr, INVALID_STATE_ERROR, "stderr for the scalar root");
    assert.strictEqual(result.status, 1, "exit code for the scalar root");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

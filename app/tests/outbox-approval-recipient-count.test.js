const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const TOOL = path.join(__dirname, "..", "tools", "outbox-approval-recipient-count.js");
const CHILD_TIMEOUT_MS = 5_000;

const USAGE_ERROR =
  "usage: node app/tools/outbox-approval-recipient-count.js <state-file> <approval-id> <recipient>\n";
const READ_ERROR = "outbox-approval-recipient-count: cannot read state file\n";
const PARSE_ERROR = "outbox-approval-recipient-count: state file is not valid JSON\n";
const INVALID_STATE_ERROR = "outbox-approval-recipient-count: invalid Relay state\n";

const TARGET_APPROVAL = "TARGET-APPROVAL-MUST-NOT-LEAK";
const OTHER_APPROVAL = "OTHER-APPROVAL-MUST-NOT-LEAK";
const THIRD_APPROVAL = "THIRD-APPROVAL-MUST-NOT-LEAK";
const NUMERIC_RECIPIENT_APPROVAL = "NUMERIC-RECIPIENT-APPROVAL-MUST-NOT-LEAK";
const CASE_DISTINCT_APPROVAL = "Target-APPROVAL-MUST-NOT-LEAK";

const TARGET_RECIPIENT = "TARGET-RECIPIENT-MUST-NOT-LEAK@example.test";
const OTHER_RECIPIENT = "OTHER-RECIPIENT-MUST-NOT-LEAK@example.test";
const CASE_DISTINCT_RECIPIENT = "Target-RECIPIENT-MUST-NOT-LEAK@example.test";
const NUMERIC_RECIPIENT = "7";
const EMPTY_FILTER = "";

const COUNT_ONE_STDOUT = '{"outboxWithApprovalAndRecipient":1}\n';
const COUNT_ZERO_STDOUT = '{"outboxWithApprovalAndRecipient":0}\n';

const ARITY_CANDIDATE_NAME = "arity-state-MUST-NOT-LEAK.json";
const ABSENT_CANDIDATE_NAME = "PATH-MUST-NOT-LEAK.json";
const DIRECTORY_CANDIDATE_NAME = "DIRECTORY-MUST-NOT-LEAK";

const MALFORMED_TOKEN = "MALFORMED-PAYLOAD-MUST-NOT-LEAK";

const SENSITIVE_TOKENS = [
  "EVENT-PAYLOAD-MUST-NOT-LEAK",
  "JOB-ERROR-MUST-NOT-LEAK",
  "APPROVAL-REASON-MUST-NOT-LEAK",
  TARGET_APPROVAL,
  OTHER_APPROVAL,
  THIRD_APPROVAL,
  NUMERIC_RECIPIENT_APPROVAL,
  CASE_DISTINCT_APPROVAL,
  TARGET_RECIPIENT,
  OTHER_RECIPIENT,
  CASE_DISTINCT_RECIPIENT,
  "SUBJECT-ALPHA-MUST-NOT-LEAK",
  "BODY-ALPHA-MUST-NOT-LEAK",
  "SUBJECT-BRAVO-MUST-NOT-LEAK",
  "BODY-BRAVO-MUST-NOT-LEAK",
  "SUBJECT-CHARLIE-MUST-NOT-LEAK",
  "BODY-CHARLIE-MUST-NOT-LEAK",
  "SUBJECT-OBJECT-MUST-NOT-LEAK",
  "BODY-ARRAY-MUST-NOT-LEAK",
  "SENT-AT-NON-ISO-MUST-NOT-LEAK",
  "IGNORED-OUTBOX-FIELD-MUST-NOT-LEAK",
  "TOP-LEVEL-METADATA-MUST-NOT-LEAK",
  "OPAQUE-SIBLING-APPROVAL-MUST-NOT-LEAK",
  MALFORMED_TOKEN,
  ABSENT_CANDIDATE_NAME,
  DIRECTORY_CANDIDATE_NAME,
  ARITY_CANDIDATE_NAME,
  "2026-08-25T12:00:00.000Z",
  "2026-08-25T12:00:01.000Z",
  "2026-08-25T12:00:02.000Z",
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
      reason: "APPROVAL-REASON-MUST-NOT-LEAK",
    },
  ],
  outbox: [
    {
      to: "TARGET-RECIPIENT-MUST-NOT-LEAK@example.test",
      subject: "SUBJECT-ALPHA-MUST-NOT-LEAK",
      body: "BODY-ALPHA-MUST-NOT-LEAK",
      approvalId: "TARGET-APPROVAL-MUST-NOT-LEAK",
      sentAt: "2026-08-25T12:00:00.000Z",
    },
    {
      to: "TARGET-RECIPIENT-MUST-NOT-LEAK@example.test",
      subject: "SUBJECT-BRAVO-MUST-NOT-LEAK",
      body: "BODY-BRAVO-MUST-NOT-LEAK",
      approvalId: "OTHER-APPROVAL-MUST-NOT-LEAK",
      sentAt: "2026-08-25T12:00:01.000Z",
    },
    {
      to: "OTHER-RECIPIENT-MUST-NOT-LEAK@example.test",
      subject: "SUBJECT-CHARLIE-MUST-NOT-LEAK",
      body: "BODY-CHARLIE-MUST-NOT-LEAK",
      approvalId: "THIRD-APPROVAL-MUST-NOT-LEAK",
      sentAt: "2026-08-25T12:00:02.000Z",
      ignoredDiagnostic: "IGNORED-OUTBOX-FIELD-MUST-NOT-LEAK",
    },
    {
      to: 7,
      subject: {
        private: "SUBJECT-OBJECT-MUST-NOT-LEAK",
      },
      body: ["BODY-ARRAY-MUST-NOT-LEAK"],
      approvalId: "NUMERIC-RECIPIENT-APPROVAL-MUST-NOT-LEAK",
      sentAt: "SENT-AT-NON-ISO-MUST-NOT-LEAK",
    },
  ],
  metadata: {
    note: "TOP-LEVEL-METADATA-MUST-NOT-LEAK",
  },
};

const FIXTURE_A = JSON.stringify(FIXTURE_A_VALUE, null, 2) + "\n";
const FIXTURE_B =
  '{"events":[null],"jobs":[7],"approvals":["OPAQUE-SIBLING-APPROVAL-MUST-NOT-LEAK"],' +
  '"outbox":[],"metadata":false}\n';
const FIXTURE_C = '{"outbox":[],"payload":"MALFORMED-PAYLOAD-MUST-NOT-LEAK"\n';
const FIXTURE_D = "";

const STRUCTURAL_INVALID_FIXTURES = [
  ["S1", "null\n"],
  ["S2", "[]\n"],
  ["S3", '{"events":[],"jobs":[],"approvals":[]}\n'],
  ["S4", '{"events":{},"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S5", '{"events":[],"jobs":{},"approvals":[],"outbox":[]}\n'],
  ["S6", '{"events":[],"jobs":[],"approvals":{},"outbox":[]}\n'],
  ["S7", '{"events":[],"jobs":[],"approvals":[],"outbox":{}}\n'],
  ["S8", '{"events":[],"jobs":[],"approvals":[],"outbox":[null]}\n'],
  ["S9", '{"events":[],"jobs":[],"approvals":[],"outbox":[[]]}\n'],
  [
    "S10",
    '{"events":[],"jobs":[],"approvals":[],"outbox":[{"subject":"b","body":"c",' +
      '"approvalId":"appr-a","sentAt":"time-a"}]}\n',
  ],
  [
    "S11",
    '{"events":[],"jobs":[],"approvals":[],"outbox":[{"to":"a","body":"c",' +
      '"approvalId":"appr-a","sentAt":"time-a"}]}\n',
  ],
  [
    "S12",
    '{"events":[],"jobs":[],"approvals":[],"outbox":[{"to":"a","subject":"b",' +
      '"approvalId":"appr-a","sentAt":"time-a"}]}\n',
  ],
  [
    "S13",
    '{"events":[],"jobs":[],"approvals":[],"outbox":[{"to":"a","subject":"b","body":"c",' +
      '"sentAt":"time-a"}]}\n',
  ],
  [
    "S14",
    '{"events":[],"jobs":[],"approvals":[],"outbox":[{"to":"a","subject":"b","body":"c",' +
      '"approvalId":"","sentAt":"time-a"}]}\n',
  ],
  [
    "S15",
    '{"events":[],"jobs":[],"approvals":[],"outbox":[{"to":"a","subject":"b","body":"c",' +
      '"approvalId":7,"sentAt":"time-a"}]}\n',
  ],
  [
    "S16",
    '{"events":[],"jobs":[],"approvals":[],"outbox":[{"to":"a","subject":"b","body":"c",' +
      '"approvalId":"appr-a"}]}\n',
  ],
  [
    "S17",
    '{"events":[],"jobs":[],"approvals":[],"outbox":[{"to":"a","subject":"b","body":"c",' +
      '"approvalId":"appr-a","sentAt":""}]}\n',
  ],
  [
    "S18",
    '{"events":[],"jobs":[],"approvals":[],"outbox":[{"to":"a","subject":"b","body":"c",' +
      '"approvalId":"appr-a","sentAt":7}]}\n',
  ],
  [
    "S19",
    '{"events":[],"jobs":[],"approvals":[],"outbox":[' +
      '{"to":"TARGET-RECIPIENT-MUST-NOT-LEAK@example.test","subject":"b","body":"c",' +
      '"approvalId":"appr-duplicate","sentAt":"time-a"},{"to":"d","subject":"e","body":"f",' +
      '"approvalId":"appr-duplicate","sentAt":"time-b"}]}\n',
  ],
  [
    "S20",
    '{"events":[],"jobs":[],"approvals":[],"outbox":[' +
      '{"to":"TARGET-RECIPIENT-MUST-NOT-LEAK@example.test","subject":"b","body":"c",' +
      '"approvalId":"TARGET-APPROVAL-MUST-NOT-LEAK","sentAt":"time-a"},' +
      '{"to":"d","subject":"e","body":"f","approvalId":"appr-invalid-second"}]}\n',
  ],
];

const S19_INDEX = 18;
const S20_INDEX = 19;

function makeTempDir(label) {
  return fs.mkdtempSync(
    path.join(os.tmpdir(), `relay-outbox-approval-recipient-count-${label}-`)
  );
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

test("AC1: both matching conjunction pairs print the frozen count of one, repeat deterministically, and leave Fixture A untouched", () => {
  const dir = makeTempDir("ac1");
  try {
    const fixture = writeFixture(dir, "state.json", FIXTURE_A);
    const before = snapshotFile(fixture);
    const parentBefore = entryNames(dir);

    for (const [label, approvalId, recipient] of [
      ["target-pair-first", TARGET_APPROVAL, TARGET_RECIPIENT],
      ["target-pair-second", TARGET_APPROVAL, TARGET_RECIPIENT],
      ["other-approval-pair", OTHER_APPROVAL, TARGET_RECIPIENT],
    ]) {
      const result = runTool([fixture, approvalId, recipient]);

      assert.strictEqual(result.stderr, "", `stderr for ${label}`);
      assert.strictEqual(result.stderrBytes, 0, `stderr byte count for ${label}`);
      assert.strictEqual(result.stdout, COUNT_ONE_STDOUT, `stdout for ${label}`);
      assert.strictEqual(result.status, 0, `exit code for ${label}`);
      assert.deepStrictEqual(
        snapshotFile(fixture),
        before,
        `fixture bytes and bigint stat for ${label}`
      );
      assert.deepStrictEqual(entryNames(dir), parentBefore, `parent entries for ${label}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AC2: every exact-mismatch pair and Fixture B's empty outbox are successful zero-count queries without casing, trimming, or coercion", () => {
  for (const receipt of FIXTURE_A_VALUE.outbox) {
    assert.notStrictEqual(
      receipt.approvalId,
      CASE_DISTINCT_APPROVAL,
      "the case-distinct approval literal is byte-distinct from every stored approvalId"
    );
    assert.notStrictEqual(
      receipt.to,
      CASE_DISTINCT_RECIPIENT,
      "the case-distinct recipient literal is byte-distinct from every stored to value"
    );
  }
  assert.strictEqual(
    FIXTURE_A_VALUE.outbox[3].to,
    7,
    "Fixture A's fourth outbox element stores the JSON number 7"
  );
  assert.strictEqual(
    typeof FIXTURE_A_VALUE.outbox[3].to,
    "number",
    "Fixture A's numeric stored to value has type number"
  );
  assert.strictEqual(typeof NUMERIC_RECIPIENT, "string", "the numeric query is the string 7");
  assert.strictEqual(NUMERIC_RECIPIENT, "7", "the numeric query is the exact literal 7");
  assert.notStrictEqual(
    FIXTURE_A_VALUE.outbox[3].to,
    NUMERIC_RECIPIENT,
    "string 7 is type-distinct from the stored number 7"
  );

  const fixtureBValue = JSON.parse(FIXTURE_B);
  assert.deepStrictEqual(fixtureBValue.outbox, [], "Fixture B has the exact empty outbox array");

  for (const [label, contents, approvalId, recipient] of [
    ["recipient-only-mismatch", FIXTURE_A, TARGET_APPROVAL, OTHER_RECIPIENT],
    ["approval-only-mismatch", FIXTURE_A, THIRD_APPROVAL, TARGET_RECIPIENT],
    ["case-distinct-approval", FIXTURE_A, CASE_DISTINCT_APPROVAL, TARGET_RECIPIENT],
    ["case-distinct-recipient", FIXTURE_A, TARGET_APPROVAL, CASE_DISTINCT_RECIPIENT],
    ["numeric-string-recipient", FIXTURE_A, NUMERIC_RECIPIENT_APPROVAL, NUMERIC_RECIPIENT],
    ["fixture-b-empty-outbox", FIXTURE_B, TARGET_APPROVAL, TARGET_RECIPIENT],
  ]) {
    const dir = makeTempDir(`ac2-${label}`);
    try {
      const fixture = writeFixture(dir, "state.json", contents);
      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);

      const result = runTool([fixture, approvalId, recipient]);

      assert.strictEqual(result.stderr, "", `stderr for ${label}`);
      assert.strictEqual(result.stderrBytes, 0, `stderr byte count for ${label}`);
      assert.strictEqual(result.stdout, COUNT_ZERO_STDOUT, `stdout for ${label}`);
      assert.strictEqual(result.status, 0, `exit code for ${label}`);
      assert.deepStrictEqual(snapshotFile(fixture), before, `fixture bytes and stat for ${label}`);
      assert.deepStrictEqual(entryNames(dir), parentBefore, `parent entries for ${label}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("AC3: wrong arity and empty filters fail with the exact usage envelope before any file access", () => {
  for (const label of [
    "zero",
    "one",
    "two",
    "four",
    "empty-approval",
    "empty-recipient",
  ]) {
    const dir = makeTempDir(`ac3-${label}`);
    try {
      const candidate = path.join(dir, ARITY_CANDIDATE_NAME);
      assert.strictEqual(
        path.isAbsolute(candidate),
        true,
        `candidate state path is absolute for ${label}`
      );
      assert.strictEqual(
        fs.existsSync(candidate),
        false,
        `candidate state path is absent before ${label} invocation`
      );
      assert.deepStrictEqual(entryNames(dir), [], `parent starts empty for ${label}`);

      let args;
      if (label === "zero") {
        args = [];
      } else if (label === "one") {
        args = [candidate];
      } else if (label === "two") {
        args = [candidate, TARGET_APPROVAL];
      } else if (label === "four") {
        args = [candidate, TARGET_APPROVAL, TARGET_RECIPIENT, "extra"];
      } else if (label === "empty-approval") {
        args = [candidate, EMPTY_FILTER, TARGET_RECIPIENT];
      } else {
        args = [candidate, TARGET_APPROVAL, EMPTY_FILTER];
      }

      const result = runTool(args);

      assert.strictEqual(result.stdout, "", `stdout for ${label} form`);
      assert.strictEqual(result.stdoutBytes, 0, `stdout byte count for ${label} form`);
      assert.strictEqual(result.stderr, USAGE_ERROR, `stderr for ${label} form`);
      assert.strictEqual(result.status, 2, `exit code for ${label} form`);
      assert.strictEqual(
        fs.existsSync(candidate),
        false,
        `candidate state path stayed absent for ${label} form`
      );
      assert.deepStrictEqual(entryNames(dir), [], `parent stayed empty for ${label} form`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("AC4: an absent path and a directory path fail with the exact read-failure envelope and change nothing", () => {
  const missingParent = makeTempDir("ac4-missing");
  try {
    const missing = path.join(missingParent, ABSENT_CANDIDATE_NAME);
    assert.strictEqual(path.isAbsolute(missing), true, "absent candidate path is absolute");
    const parentBefore = entryNames(missingParent);

    const result = runTool([missing, TARGET_APPROVAL, TARGET_RECIPIENT]);

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

    const result = runTool([stateDirectory, TARGET_APPROVAL, TARGET_RECIPIENT]);

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

      const result = runTool([fixture, TARGET_APPROVAL, TARGET_RECIPIENT]);

      assert.strictEqual(result.stdout, "", `stdout for ${label}`);
      assert.strictEqual(result.stdoutBytes, 0, `stdout byte count for ${label}`);
      assert.strictEqual(result.stderr, PARSE_ERROR, `stderr for ${label}`);
      assert.strictEqual(result.status, 1, `exit code for ${label}`);
      assert.strictEqual(
        result.stdout.includes(MALFORMED_TOKEN),
        false,
        `stdout stayed free of the malformed bytes for ${label}`
      );
      assert.strictEqual(
        result.stderr.includes(MALFORMED_TOKEN),
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

test("AC6: every S1-S20 structural-invalid fixture fails with the exact invalid-state envelope after a pairwise distinctness proof", () => {
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

  const s19 = JSON.parse(STRUCTURAL_INVALID_FIXTURES[S19_INDEX][1]);
  assert.strictEqual(s19.outbox.length, 2, "S19 holds two receipts");
  assert.strictEqual(
    s19.outbox[0].approvalId,
    s19.outbox[1].approvalId,
    "S19 freezes two receipts sharing one approval ID"
  );

  const s20 = JSON.parse(STRUCTURAL_INVALID_FIXTURES[S20_INDEX][1]);
  assert.strictEqual(s20.outbox.length, 2, "S20 holds two receipts");
  assert.strictEqual(
    s20.outbox[0].approvalId,
    TARGET_APPROVAL,
    "S20's first receipt matches the queried approval ID"
  );
  assert.strictEqual(
    s20.outbox[0].to,
    TARGET_RECIPIENT,
    "S20's first receipt matches the queried recipient"
  );
  assert.strictEqual(
    s20.outbox[0].sentAt,
    "time-a",
    "S20's first receipt is a complete valid receipt"
  );
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(s20.outbox[1], "sentAt"),
    false,
    "S20's invalid sibling omits its own sentAt property"
  );

  for (const [label, contents] of STRUCTURAL_INVALID_FIXTURES) {
    const dir = makeTempDir(`ac6-${label.toLowerCase()}`);
    try {
      const fixture = writeFixture(dir, "state.json", contents);
      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);

      const result = runTool([fixture, TARGET_APPROVAL, TARGET_RECIPIENT]);

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

test("AC7: the command self-terminates under the frozen timeout and both files stay inside their frozen source boundaries", () => {
  const dir = makeTempDir("ac7");
  try {
    const fixture = writeFixture(dir, "state.json", FIXTURE_A);
    const result = runTool([fixture, TARGET_APPROVAL, TARGET_RECIPIENT]);

    assert.strictEqual(result.status, 0, "timed child completed successfully");
    assert.strictEqual(result.stdout, COUNT_ONE_STDOUT, "timed child stdout");
    assert.strictEqual(result.stderr, "", "timed child stderr");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  assert.strictEqual(
    fs.existsSync(TOOL),
    true,
    "app/tools/outbox-approval-recipient-count.js exists"
  );
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

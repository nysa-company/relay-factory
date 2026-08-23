// T-187 — acceptance tests for `node app/tools/outbox-receipt.js <state-file> <approval-id>`
// (frozen contract version 1). Written by the test author before implementation;
// asserts contract behavior only.
// node --test app/tests/outbox-receipt.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const TOOL = path.join(__dirname, "..", "tools", "outbox-receipt.js");
const TEST_FILE = path.join(__dirname, "outbox-receipt.test.js");
const CHILD_TIMEOUT_MS = 5_000;

const USAGE_ERROR = "usage: node app/tools/outbox-receipt.js <state-file> <approval-id>\n";
const READ_ERROR = "outbox-receipt: cannot read state file\n";
const PARSE_ERROR = "outbox-receipt: state file is not valid JSON\n";
const INVALID_STATE_ERROR = "outbox-receipt: invalid Relay state\n";
const NOT_FOUND_ERROR = "outbox-receipt: outbox receipt not found\n";

const SELECTED_ID = "appr-receipt-alpha";
const UNSELECTED_ID = "appr-receipt-zulu";
const CASE_DISTINCT_ID = "Appr-receipt-alpha";

const ALPHA_STDOUT =
  '{"approvalId":"appr-receipt-alpha","sentAt":"2026-08-23T12:00:01.000Z"}\n';

const SENSITIVE_TOKENS = [
  "EVENT-PAYLOAD-MUST-NOT-LEAK",
  "JOB-ERROR-MUST-NOT-LEAK",
  "APPROVAL-TO-MUST-NOT-LEAK",
  "APPROVAL-SUBJECT-MUST-NOT-LEAK",
  "APPROVAL-BODY-MUST-NOT-LEAK",
  "APPROVAL-REASON-MUST-NOT-LEAK",
  "OTHER-TO-MUST-NOT-LEAK",
  "OTHER-SUBJECT-MUST-NOT-LEAK",
  "OTHER-BODY-MUST-NOT-LEAK",
  "SELECTED-TO-MUST-NOT-LEAK",
  "SELECTED-SUBJECT-MUST-NOT-LEAK",
  "SELECTED-BODY-MUST-NOT-LEAK",
  "TOPLEVEL-MUST-NOT-LEAK",
];

const MALFORMED_TOKEN = "MALFORMED-STATE-MUST-NOT-LEAK";

const FIXTURE_A_VALUE = {
  events: [
    {
      id: "event-private",
      payload: { secret: "EVENT-PAYLOAD-MUST-NOT-LEAK" },
    },
  ],
  jobs: [
    {
      id: "job-private",
      lastError: "JOB-ERROR-MUST-NOT-LEAK",
    },
  ],
  approvals: [
    {
      id: "appr-private",
      action: {
        to: "APPROVAL-TO-MUST-NOT-LEAK",
        subject: "APPROVAL-SUBJECT-MUST-NOT-LEAK",
        body: "APPROVAL-BODY-MUST-NOT-LEAK",
      },
      reason: "APPROVAL-REASON-MUST-NOT-LEAK",
    },
  ],
  outbox: [
    {
      to: "OTHER-TO-MUST-NOT-LEAK",
      subject: "OTHER-SUBJECT-MUST-NOT-LEAK",
      body: "OTHER-BODY-MUST-NOT-LEAK",
      approvalId: "appr-receipt-zulu",
      sentAt: "2026-08-23T12:00:00.000Z",
    },
    {
      to: "SELECTED-TO-MUST-NOT-LEAK",
      subject: "SELECTED-SUBJECT-MUST-NOT-LEAK",
      body: "SELECTED-BODY-MUST-NOT-LEAK",
      approvalId: "appr-receipt-alpha",
      sentAt: "2026-08-23T12:00:01.000Z",
    },
  ],
  metadata: { secret: "TOPLEVEL-MUST-NOT-LEAK" },
};

const FIXTURE_A = JSON.stringify(FIXTURE_A_VALUE, null, 2) + "\n";
const FIXTURE_B = '{"events":[],"jobs":[],"approvals":[],"outbox":[]}\n';
const FIXTURE_C = '{"events":[],"secret":"MALFORMED-STATE-MUST-NOT-LEAK"\n';

// Each entry is [id, exact serialized bytes, lookup approval ID].
const STRUCTURAL_INVALID_FIXTURES = [
  ["S1", "null\n", SELECTED_ID],
  ["S2", "[]\n", SELECTED_ID],
  ["S3", '{"jobs":[],"approvals":[],"outbox":[]}\n', SELECTED_ID],
  ["S4", '{"events":[],"approvals":[],"outbox":[]}\n', SELECTED_ID],
  ["S5", '{"events":[],"jobs":[],"outbox":[]}\n', SELECTED_ID],
  ["S6", '{"events":[],"jobs":[],"approvals":[]}\n', SELECTED_ID],
  ["S7", '{"events":{},"jobs":[],"approvals":[],"outbox":[]}\n', SELECTED_ID],
  ["S8", '{"events":[],"jobs":{},"approvals":[],"outbox":[]}\n', SELECTED_ID],
  ["S9", '{"events":[],"jobs":[],"approvals":{},"outbox":[]}\n', SELECTED_ID],
  ["S10", '{"events":[],"jobs":[],"approvals":[],"outbox":{}}\n', SELECTED_ID],
  ["S11", '{"events":[],"jobs":[],"approvals":[],"outbox":[null]}\n', SELECTED_ID],
  ["S12", '{"events":[],"jobs":[],"approvals":[],"outbox":[[]]}\n', SELECTED_ID],
  [
    "S13",
    '{"events":[],"jobs":[],"approvals":[],"outbox":[{"sentAt":"2026-08-23T12:00:00.000Z"}]}\n',
    SELECTED_ID,
  ],
  [
    "S14",
    '{"events":[],"jobs":[],"approvals":[],"outbox":[{"approvalId":7,"sentAt":"2026-08-23T12:00:00.000Z"}]}\n',
    SELECTED_ID,
  ],
  [
    "S15",
    '{"events":[],"jobs":[],"approvals":[],"outbox":[{"approvalId":"","sentAt":"2026-08-23T12:00:00.000Z"}]}\n',
    SELECTED_ID,
  ],
  ["S16", '{"events":[],"jobs":[],"approvals":[],"outbox":[{"approvalId":"appr-a"}]}\n', SELECTED_ID],
  [
    "S17",
    '{"events":[],"jobs":[],"approvals":[],"outbox":[{"approvalId":"appr-a","sentAt":7}]}\n',
    SELECTED_ID,
  ],
  [
    "S18",
    '{"events":[],"jobs":[],"approvals":[],"outbox":[{"approvalId":"appr-a","sentAt":""}]}\n',
    SELECTED_ID,
  ],
  [
    "S19",
    '{"events":[],"jobs":[],"approvals":[],"outbox":[{"approvalId":"appr-duplicate","sentAt":"1"},' +
      '{"approvalId":"appr-duplicate","sentAt":"2"}]}\n',
    "appr-duplicate",
  ],
];

function makeTempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `relay-outbox-receipt-${label}-`));
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
    isDirectory: fs.statSync(dir).isDirectory(),
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

test("AC1: two appr-receipt-alpha lookups against Fixture A print the frozen receipt projection and leave the fixture untouched", () => {
  const dir = makeTempDir("ac1");
  try {
    const fixture = writeFixture(dir, "state.json", FIXTURE_A);
    const before = snapshotFile(fixture);
    const parentBefore = entryNames(dir);

    for (const attempt of [1, 2]) {
      const result = runTool([fixture, SELECTED_ID]);

      assert.strictEqual(result.stdout, ALPHA_STDOUT, `stdout on invocation ${attempt}`);
      assert.strictEqual(result.stderr, "", `stderr on invocation ${attempt}`);
      assert.strictEqual(result.stderrBytes, 0, `stderr byte count on invocation ${attempt}`);
      assert.strictEqual(result.status, 0, `exit code on invocation ${attempt}`);
      assert.strictEqual(
        result.stdout.includes(UNSELECTED_ID),
        false,
        `stdout leaked the unselected receipt ID on invocation ${attempt}`
      );
      assert.strictEqual(
        result.stderr.includes(UNSELECTED_ID),
        false,
        `stderr leaked the unselected receipt ID on invocation ${attempt}`
      );
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

test("AC2: every frozen lookup miss, including the case-distinct ID, fails with the exact not-found envelope", () => {
  const cases = [
    ["fixture-a-missing-id", FIXTURE_A, "appr-missing"],
    ["fixture-a-case-distinct-id", FIXTURE_A, CASE_DISTINCT_ID],
    ["fixture-b-missing-id", FIXTURE_B, "appr-missing"],
  ];

  for (const [label, contents, approvalId] of cases) {
    const dir = makeTempDir(`ac2-${label}`);
    try {
      const fixture = writeFixture(dir, "state.json", contents);
      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);

      const result = runTool([fixture, approvalId]);

      assert.strictEqual(result.stdout, "", `stdout for ${label}`);
      assert.strictEqual(result.stdoutBytes, 0, `stdout byte count for ${label}`);
      assert.strictEqual(result.stderr, NOT_FOUND_ERROR, `stderr for ${label}`);
      assert.strictEqual(result.status, 1, `exit code for ${label}`);
      assert.deepStrictEqual(snapshotFile(fixture), before, `fixture bytes and stat for ${label}`);
      assert.deepStrictEqual(entryNames(dir), parentBefore, `parent entries for ${label}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("AC3: zero, one, and three positional arguments fail with the exact usage envelope and touch no path", () => {
  const zeroDir = makeTempDir("ac3-zero");
  try {
    const result = runTool([]);

    assert.strictEqual(result.stdout, "", "stdout for zero arguments");
    assert.strictEqual(result.stdoutBytes, 0, "stdout byte count for zero arguments");
    assert.strictEqual(result.stderr, USAGE_ERROR, "stderr for zero arguments");
    assert.strictEqual(result.status, 2, "exit code for zero arguments");
    assert.deepStrictEqual(entryNames(zeroDir), [], "parent stayed empty for zero arguments");
  } finally {
    fs.rmSync(zeroDir, { recursive: true, force: true });
  }

  for (const [label, candidateName, extraArgs] of [
    ["one", "candidate-state.json", []],
    ["three", "state-a.json", ["appr-a", "extra-argument"]],
  ]) {
    const dir = makeTempDir(`ac3-${label}`);
    try {
      const candidate = path.join(dir, candidateName);
      assert.strictEqual(
        fs.existsSync(candidate),
        false,
        `candidate state path absent before ${label} arguments`
      );

      const result = runTool([candidate, ...extraArgs]);

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

test("AC4: an absent path and a directory in place of a state file fail with the exact read-failure envelope and change nothing", () => {
  const missingParent = makeTempDir("ac4-missing");
  try {
    const missing = path.join(missingParent, "missing-state.json");
    const parentBefore = entryNames(missingParent);
    assert.strictEqual(fs.existsSync(missing), false, "absent path absent before invocation");

    const result = runTool([missing, SELECTED_ID]);

    assert.strictEqual(result.stdout, "", "stdout for absent path");
    assert.strictEqual(result.stdoutBytes, 0, "stdout byte count for absent path");
    assert.strictEqual(result.stderr, READ_ERROR, "stderr for absent path");
    assert.strictEqual(result.status, 1, "exit code for absent path");
    assert.strictEqual(fs.existsSync(missing), false, "absent path stayed absent");
    assert.deepStrictEqual(entryNames(missingParent), parentBefore, "parent entries for absent path");
  } finally {
    fs.rmSync(missingParent, { recursive: true, force: true });
  }

  const directoryParent = makeTempDir("ac4-directory");
  try {
    const stateDirectory = path.join(directoryParent, "state-directory");
    fs.mkdirSync(stateDirectory);
    const before = snapshotDirectory(stateDirectory);
    const parentBefore = entryNames(directoryParent);

    const result = runTool([stateDirectory, SELECTED_ID]);

    assert.strictEqual(result.stdout, "", "stdout for directory path");
    assert.strictEqual(result.stdoutBytes, 0, "stdout byte count for directory path");
    assert.strictEqual(result.stderr, READ_ERROR, "stderr for directory path");
    assert.strictEqual(result.status, 1, "exit code for directory path");
    assert.deepStrictEqual(
      snapshotDirectory(stateDirectory),
      before,
      "directory type, stat fields, and entries"
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

test("AC5: Fixture C fails with the exact parse-failure envelope and never echoes the malformed bytes", () => {
  const dir = makeTempDir("ac5");
  try {
    const fixture = writeFixture(dir, "state.json", FIXTURE_C);
    const before = snapshotFile(fixture);
    const parentBefore = entryNames(dir);

    const result = runTool([fixture, SELECTED_ID]);

    assert.strictEqual(result.stdout, "");
    assert.strictEqual(result.stdoutBytes, 0);
    assert.strictEqual(result.stderr, PARSE_ERROR);
    assert.strictEqual(result.status, 1);
    assert.strictEqual(result.stdout.includes(MALFORMED_TOKEN), false, "stdout echoed malformed bytes");
    assert.strictEqual(result.stderr.includes(MALFORMED_TOKEN), false, "stderr echoed malformed bytes");
    assert.deepStrictEqual(snapshotFile(fixture), before);
    assert.deepStrictEqual(entryNames(dir), parentBefore);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AC6: every S1-S19 structural-invalid fixture fails with the exact invalid-state envelope after a distinctness proof", () => {
  const serialized = [
    ["A", FIXTURE_A],
    ["B", FIXTURE_B],
    ["C", FIXTURE_C],
    ...STRUCTURAL_INVALID_FIXTURES.map(([label, contents]) => [label, contents]),
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

  for (const [label, contents, approvalId] of STRUCTURAL_INVALID_FIXTURES) {
    const dir = makeTempDir(`ac6-${label.toLowerCase()}`);
    try {
      const fixture = writeFixture(dir, "state.json", contents);
      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);

      const result = runTool([fixture, approvalId]);

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

test("AC7: both files stay inside their frozen offline module boundaries", () => {
  assert.strictEqual(fs.existsSync(TOOL), true, "app/tools/outbox-receipt.js exists");
  const toolSource = fs.readFileSync(TOOL, "utf8");

  assert.deepStrictEqual(
    specifiersOf(toolSource),
    ["node:fs"],
    "Builder file complete module-specifier set"
  );
  assert.deepStrictEqual(
    fsOperationsOf(toolSource),
    ["readFileSync"],
    "Builder file node:fs operations used"
  );

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
      `Builder file references ${forbidden}`
    );
  }

  const testSource = fs.readFileSync(TEST_FILE, "utf8");
  assert.deepStrictEqual(
    specifiersOf(testSource),
    ["node:assert", "node:child_process", "node:fs", "node:os", "node:path", "node:test"],
    "Test-author file complete module-specifier set"
  );
});

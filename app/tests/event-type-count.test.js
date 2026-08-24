const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const TOOL = path.join(__dirname, "..", "tools", "event-type-count.js");
const CHILD_TIMEOUT_MS = 5_000;

const USAGE_ERROR = "usage: node app/tools/event-type-count.js <state-file> <event-type>\n";
const READ_ERROR = "event-type-count: cannot read state file\n";
const PARSE_ERROR = "event-type-count: state file is not valid JSON\n";
const INVALID_STATE_ERROR = "event-type-count: invalid Relay state\n";

const MEETING_STDOUT = '{"eventType":"meeting","events":2}\n';
const EMAIL_STDOUT = '{"eventType":"email","events":1}\n';
const MEETING_CAPITAL_ZERO_STDOUT = '{"eventType":"Meeting","events":0}\n';
const MEETING_EMPTY_ZERO_STDOUT = '{"eventType":"meeting","events":0}\n';

const SENSITIVE_TOKENS = [
  "UNSELECTED-PAYLOAD-MUST-NOT-LEAK",
  "SELECTED-PAYLOAD-MUST-NOT-LEAK",
  "OPAQUE-EVENT-PAYLOAD-MUST-NOT-LEAK",
  "OPAQUE-EVENT-EXTRA-MUST-NOT-LEAK",
  "RELATED-JOB-ERROR-MUST-NOT-LEAK",
  "UNRELATED-JOB-ERROR-MUST-NOT-LEAK",
  "APPROVAL-TO-MUST-NOT-LEAK",
  "APPROVAL-SUBJECT-MUST-NOT-LEAK",
  "APPROVAL-BODY-MUST-NOT-LEAK",
  "APPROVAL-REASON-MUST-NOT-LEAK",
  "OUTBOX-TO-MUST-NOT-LEAK",
  "OUTBOX-SUBJECT-MUST-NOT-LEAK",
  "OUTBOX-BODY-MUST-NOT-LEAK",
  "TOP-LEVEL-METADATA-MUST-NOT-LEAK",
  "OPAQUE-CONTENT-MUST-NOT-LEAK",
  "MALFORMED-PAYLOAD-MUST-NOT-LEAK",
  "arity-state-MUST-NOT-LEAK",
  "PATH-MUST-NOT-LEAK",
  "DIRECTORY-MUST-NOT-LEAK",
];

const FIXTURE_A_VALUE = {
  events: [
    {
      id: "event-zulu",
      type: "email",
      payload: { private: "UNSELECTED-PAYLOAD-MUST-NOT-LEAK" },
      receivedAt: "2026-08-24T12:00:02.000Z",
    },
    {
      id: "event-alpha",
      type: "meeting",
      payload: { private: "SELECTED-PAYLOAD-MUST-NOT-LEAK" },
      receivedAt: "2026-08-24T12:00:00.000Z",
    },
    {
      id: "event-bravo",
      type: "meeting",
      payload: "OPAQUE-EVENT-PAYLOAD-MUST-NOT-LEAK",
      extra: { private: "OPAQUE-EVENT-EXTRA-MUST-NOT-LEAK" },
      receivedAt: "2026-08-24T12:00:01.000Z",
    },
  ],
  jobs: [
    {
      id: "job-event-alpha",
      eventId: "event-alpha",
      status: "dead",
      lastError: "RELATED-JOB-ERROR-MUST-NOT-LEAK",
    },
    {
      id: "job-other",
      eventId: "event-other",
      status: "dead",
      lastError: "UNRELATED-JOB-ERROR-MUST-NOT-LEAK",
    },
  ],
  approvals: [
    {
      id: "appr-event-alpha",
      jobId: "job-event-alpha",
      action: {
        to: "APPROVAL-TO-MUST-NOT-LEAK",
        subject: "APPROVAL-SUBJECT-MUST-NOT-LEAK",
        body: "APPROVAL-BODY-MUST-NOT-LEAK",
      },
      status: "rejected",
      reason: "APPROVAL-REASON-MUST-NOT-LEAK",
    },
  ],
  outbox: [
    {
      to: "OUTBOX-TO-MUST-NOT-LEAK",
      subject: "OUTBOX-SUBJECT-MUST-NOT-LEAK",
      body: "OUTBOX-BODY-MUST-NOT-LEAK",
      approvalId: "appr-event-alpha",
    },
  ],
  metadata: { note: "TOP-LEVEL-METADATA-MUST-NOT-LEAK" },
};

const FIXTURE_A = JSON.stringify(FIXTURE_A_VALUE, null, 2) + "\n";
const FIXTURE_B =
  '{"events":[],"jobs":[null],"approvals":[7],"outbox":["OPAQUE-CONTENT-MUST-NOT-LEAK"],"metadata":false}\n';
const FIXTURE_C = '{"events":[],"payload":"MALFORMED-PAYLOAD-MUST-NOT-LEAK"\n';
const FIXTURE_D = "";

const STRUCTURAL_INVALID_FIXTURES = [
  ["S1", "null\n"],
  ["S2", "[]\n"],
  ["S3", '{"events":[],"jobs":[],"approvals":[]}\n'],
  ["S4", '{"events":{},"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S5", '{"events":[],"jobs":{},"approvals":[],"outbox":[]}\n'],
  ["S6", '{"events":[],"jobs":[],"approvals":{},"outbox":[]}\n'],
  ["S7", '{"events":[],"jobs":[],"approvals":[],"outbox":{}}\n'],
  ["S8", '{"events":[null],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S9", '{"events":[[]],"jobs":[],"approvals":[],"outbox":[]}\n'],
  [
    "S10",
    '{"events":[{"type":"meeting","receivedAt":"2026-08-24T12:00:00.000Z"}],"jobs":[],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S11",
    '{"events":[{"id":"","type":"meeting","receivedAt":"2026-08-24T12:00:00.000Z"}],"jobs":[],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S12",
    '{"events":[{"id":7,"type":"meeting","receivedAt":"2026-08-24T12:00:00.000Z"}],"jobs":[],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S13",
    '{"events":[{"id":"event-alpha","receivedAt":"2026-08-24T12:00:00.000Z"}],"jobs":[],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S14",
    '{"events":[{"id":"event-alpha","type":"","receivedAt":"2026-08-24T12:00:00.000Z"}],"jobs":[],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S15",
    '{"events":[{"id":"event-alpha","type":7,"receivedAt":"2026-08-24T12:00:00.000Z"}],"jobs":[],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S16",
    '{"events":[{"id":"event-alpha","type":"meeting"}],"jobs":[],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S17",
    '{"events":[{"id":"event-alpha","type":"meeting","receivedAt":""}],"jobs":[],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S18",
    '{"events":[{"id":"event-alpha","type":"meeting","receivedAt":null}],"jobs":[],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S19",
    '{"events":[{"id":"event-alpha","type":"meeting","receivedAt":"2026-08-24T12:00:00.000Z"},' +
      '{"id":"event-alpha","type":"email","receivedAt":"2026-08-24T12:00:01.000Z"}],' +
      '"jobs":[],"approvals":[],"outbox":[]}\n',
  ],
];

function makeTempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `relay-event-type-count-${label}-`));
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

test("AC1: repeated meeting counts against Fixture A print the frozen two-event line and leave the fixture untouched", () => {
  const dir = makeTempDir("ac1");
  try {
    const fixture = writeFixture(dir, "state.json", FIXTURE_A);
    const before = snapshotFile(fixture);
    const parentBefore = entryNames(dir);

    for (const attempt of [1, 2]) {
      const result = runTool([fixture, "meeting"]);

      assert.strictEqual(result.stderr, "", `stderr on invocation ${attempt}`);
      assert.strictEqual(result.stderrBytes, 0, `stderr byte count on invocation ${attempt}`);
      assert.strictEqual(result.stdout, MEETING_STDOUT, `stdout on invocation ${attempt}`);
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

test("AC2: the email count against Fixture A prints the frozen one-event line and leaves the fixture untouched", () => {
  const dir = makeTempDir("ac2");
  try {
    const fixture = writeFixture(dir, "state.json", FIXTURE_A);
    const before = snapshotFile(fixture);
    const parentBefore = entryNames(dir);

    const result = runTool([fixture, "email"]);

    assert.strictEqual(result.stderr, "");
    assert.strictEqual(result.stderrBytes, 0);
    assert.strictEqual(result.stdout, EMAIL_STDOUT);
    assert.strictEqual(result.status, 0);
    assert.deepStrictEqual(snapshotFile(fixture), before);
    assert.deepStrictEqual(entryNames(dir), parentBefore);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AC3: both frozen zero-match cases succeed with a zero count instead of a not-found error", () => {
  for (const storedType of FIXTURE_A_VALUE.events.map(event => event.type)) {
    assert.notStrictEqual(
      "Meeting",
      storedType,
      "the literal Meeting is byte-distinct from every stored type in Fixture A"
    );
  }

  const fixtureBValue = JSON.parse(FIXTURE_B);
  assert.deepStrictEqual(fixtureBValue.events, [], "Fixture B has an empty events array");
  assert.deepStrictEqual(fixtureBValue.jobs, [null], "Fixture B keeps its opaque job value");
  assert.deepStrictEqual(fixtureBValue.approvals, [7], "Fixture B keeps its opaque approval value");
  assert.deepStrictEqual(
    fixtureBValue.outbox,
    ["OPAQUE-CONTENT-MUST-NOT-LEAK"],
    "Fixture B keeps its opaque outbox value"
  );
  assert.strictEqual(fixtureBValue.metadata, false, "Fixture B keeps its opaque metadata value");

  const cases = [
    ["fixture-a-case-distinct", FIXTURE_A, "Meeting", MEETING_CAPITAL_ZERO_STDOUT],
    ["fixture-b-empty-events", FIXTURE_B, "meeting", MEETING_EMPTY_ZERO_STDOUT],
  ];

  for (const [label, contents, eventType, expectedStdout] of cases) {
    const dir = makeTempDir(`ac3-${label}`);
    try {
      const fixture = writeFixture(dir, "state.json", contents);
      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);

      const result = runTool([fixture, eventType]);

      assert.strictEqual(result.stderr, "", `stderr for ${label}`);
      assert.strictEqual(result.stderrBytes, 0, `stderr byte count for ${label}`);
      assert.strictEqual(result.stdout, expectedStdout, `stdout for ${label}`);
      assert.strictEqual(result.status, 0, `exit code for ${label}`);
      assert.deepStrictEqual(snapshotFile(fixture), before, `fixture bytes and stat for ${label}`);
      assert.deepStrictEqual(entryNames(dir), parentBefore, `parent entries for ${label}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("AC4: zero, one, and three positional arguments fail with the exact usage envelope and never touch the candidate path", () => {
  const cases = [
    ["zero", []],
    ["one", []],
    ["three", ["meeting", "extra"]],
  ];

  for (const [label, trailingArgs] of cases) {
    const dir = makeTempDir(`ac4-${label}`);
    try {
      const candidate = path.join(dir, "arity-state-MUST-NOT-LEAK.json");
      const args = label === "zero" ? [] : [candidate, ...trailingArgs];

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

test("AC5: an absent path and a directory path fail with the exact read-failure envelope and change nothing", () => {
  const missingParent = makeTempDir("ac5-missing");
  try {
    const missing = path.join(missingParent, "PATH-MUST-NOT-LEAK.json");
    const parentBefore = entryNames(missingParent);

    const result = runTool([missing, "meeting"]);

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

  const directoryParent = makeTempDir("ac5-directory");
  try {
    const stateDirectory = path.join(directoryParent, "DIRECTORY-MUST-NOT-LEAK");
    fs.mkdirSync(stateDirectory);
    const before = snapshotDirectory(stateDirectory);
    const parentBefore = entryNames(directoryParent);

    const result = runTool([stateDirectory, "meeting"]);

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

test("AC6: Fixtures C and D fail with the exact parse-failure envelope and never echo the malformed bytes", () => {
  for (const [label, contents] of [
    ["fixture-c-truncated", FIXTURE_C],
    ["fixture-d-zero-byte", FIXTURE_D],
  ]) {
    const dir = makeTempDir(`ac6-${label}`);
    try {
      const fixture = writeFixture(dir, "state.json", contents);
      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);

      const result = runTool([fixture, "meeting"]);

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

test("AC7: every S1-S19 structural-invalid fixture fails with the exact invalid-state envelope after a distinctness proof", () => {
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

  for (const [label, contents] of STRUCTURAL_INVALID_FIXTURES) {
    const dir = makeTempDir(`ac7-${label.toLowerCase()}`);
    try {
      const fixture = writeFixture(dir, "state.json", contents);
      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);

      const result = runTool([fixture, "meeting"]);

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

test("AC8: the production command self-terminates under the frozen timeout and both files stay inside their frozen source boundaries", () => {
  const dir = makeTempDir("ac8");
  try {
    const fixture = writeFixture(dir, "state.json", FIXTURE_A);
    const result = runTool([fixture, "meeting"]);

    assert.strictEqual(result.status, 0, "timed child completed successfully");
    assert.strictEqual(result.stdout, MEETING_STDOUT, "timed child stdout");
    assert.strictEqual(result.stderr, "", "timed child stderr");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  assert.strictEqual(fs.existsSync(TOOL), true, "app/tools/event-type-count.js exists");
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

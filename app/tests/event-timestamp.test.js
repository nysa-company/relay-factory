const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const TOOL = path.join(__dirname, "..", "tools", "event-timestamp.js");
const TEST_FILE = __filename;
const CHILD_TIMEOUT_MS = 5_000;

const USAGE_ERROR = "usage: node app/tools/event-timestamp.js <state-file> <event-id>\n";
const READ_ERROR = "event-timestamp: cannot read state file\n";
const PARSE_ERROR = "event-timestamp: state file is not valid JSON\n";
const INVALID_STATE_ERROR = "event-timestamp: invalid Relay state\n";
const NOT_FOUND_ERROR = "event-timestamp: event not found\n";

const ALPHA_STDOUT = '{"eventId":"event-alpha","createdAt":"2026-08-23T13:00:00.000Z"}\n';
const ZULU_STDOUT = '{"eventId":"event-zulu","createdAt":"2026-08-23T13:00:01.000Z"}\n';
const VERBATIM_STDOUT =
  '{"eventId":"event-verbatim","createdAt":"VERBATIM-TIMESTAMP-MUST-NOT-BE-NORMALIZED"}\n';
const OPAQUE_STDOUT = '{"eventId":"event-opaque","createdAt":"2026-08-23T13:00:00.000Z"}\n';

const ARITY_STATE_NAME = "arity-state-MUST-NOT-LEAK.json";
const ABSENT_STATE_NAME = "PATH-MUST-NOT-LEAK.json";
const STATE_DIRECTORY_NAME = "DIRECTORY-MUST-NOT-LEAK";

const SENSITIVE_TOKENS = [
  "UNSELECTED-PAYLOAD-MUST-NOT-LEAK",
  "SELECTED-PAYLOAD-MUST-NOT-LEAK",
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
  "OPAQUE-EVENT-PAYLOAD-MUST-NOT-LEAK",
  "OPAQUE-EVENT-EXTRA-MUST-NOT-LEAK",
];

const FIXTURE_A_VALUE = {
  events: [
    {
      id: "event-zulu",
      type: "email",
      payload: { private: "UNSELECTED-PAYLOAD-MUST-NOT-LEAK" },
      receivedAt: "2026-08-23T13:00:01.000Z",
    },
    {
      id: "event-alpha",
      type: "meeting",
      payload: { private: "SELECTED-PAYLOAD-MUST-NOT-LEAK" },
      receivedAt: "2026-08-23T13:00:00.000Z",
    },
  ],
  jobs: [
    {
      id: "job-event-alpha",
      eventId: "event-alpha",
      status: "dead",
      attempts: 3,
      lastError: "RELATED-JOB-ERROR-MUST-NOT-LEAK",
      retries: 0,
      attemptsSinceRetry: 3,
    },
    {
      id: "job-event-zulu",
      eventId: "event-zulu",
      status: "done",
      attempts: 1,
      lastError: "UNRELATED-JOB-ERROR-MUST-NOT-LEAK",
      retries: 0,
      attemptsSinceRetry: 1,
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
      proposedAt: "2026-08-23T13:00:02.000Z",
    },
  ],
  outbox: [
    {
      to: "OUTBOX-TO-MUST-NOT-LEAK",
      subject: "OUTBOX-SUBJECT-MUST-NOT-LEAK",
      body: "OUTBOX-BODY-MUST-NOT-LEAK",
      approvalId: "appr-event-zulu",
      sentAt: "2026-08-23T13:00:03.000Z",
    },
  ],
  metadata: { note: "TOP-LEVEL-METADATA-MUST-NOT-LEAK" },
};

const FIXTURE_A = JSON.stringify(FIXTURE_A_VALUE, null, 2) + "\n";
const FIXTURE_B =
  '{"events":[],"jobs":[null],"approvals":[7],"outbox":["OPAQUE-CONTENT-MUST-NOT-LEAK"],"metadata":false}\n';
const FIXTURE_C = '{"events":[],"payload":"MALFORMED-PAYLOAD-MUST-NOT-LEAK"\n';
const FIXTURE_D = "";
const FIXTURE_E =
  '{"events":[{"id":"event-verbatim","receivedAt":"VERBATIM-TIMESTAMP-MUST-NOT-BE-NORMALIZED"},' +
  '{"id":"event-opaque","type":7,"payload":"OPAQUE-EVENT-PAYLOAD-MUST-NOT-LEAK",' +
  '"extra":{"private":"OPAQUE-EVENT-EXTRA-MUST-NOT-LEAK"},' +
  '"receivedAt":"2026-08-23T13:00:00.000Z"}],' +
  '"jobs":[],"approvals":[],"outbox":[]}\n';

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
    '{"events":[{"receivedAt":"2026-08-23T13:00:00.000Z"}],"jobs":[],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S11",
    '{"events":[{"id":"","receivedAt":"2026-08-23T13:00:00.000Z"}],"jobs":[],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S12",
    '{"events":[{"id":7,"receivedAt":"2026-08-23T13:00:00.000Z"}],"jobs":[],"approvals":[],"outbox":[]}\n',
  ],
  ["S13", '{"events":[{"id":"event-alpha"}],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S14", '{"events":[{"id":"event-alpha","receivedAt":""}],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S15", '{"events":[{"id":"event-alpha","receivedAt":7}],"jobs":[],"approvals":[],"outbox":[]}\n'],
  [
    "S16",
    '{"events":[{"id":"event-alpha","receivedAt":"2026-08-23T13:00:00.000Z"},' +
      '{"id":"event-alpha","receivedAt":"2026-08-23T13:00:01.000Z"}],' +
      '"jobs":[],"approvals":[],"outbox":[]}\n',
  ],
];

function makeTempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `relay-event-timestamp-${label}-`));
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
    entries: fs.readdirSync(dir).sort(),
    mode: stat.mode,
    size: stat.size,
    mtimeNs: stat.mtimeNs,
  };
}

function entryNames(dir) {
  return fs.readdirSync(dir).sort();
}

function assertPairwiseDistinct(serialized) {
  for (let i = 0; i < serialized.length; i += 1) {
    for (let j = i + 1; j < serialized.length; j += 1) {
      assert.notStrictEqual(
        serialized[i][1],
        serialized[j][1],
        `fixtures ${serialized[i][0]} and ${serialized[j][0]} are byte-identical`
      );
    }
  }
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

test("AC1: repeated event-alpha lookups against Fixture A print the frozen timestamp projection and leave the fixture untouched", () => {
  const dir = makeTempDir("ac1");
  try {
    const fixture = writeFixture(dir, "state.json", FIXTURE_A);
    const before = snapshotFile(fixture);
    const parentBefore = entryNames(dir);

    for (const attempt of [1, 2]) {
      const result = runTool([fixture, "event-alpha"]);

      assert.strictEqual(result.stderr, "", `stderr on invocation ${attempt}`);
      assert.strictEqual(result.stderrBytes, 0, `stderr byte count on invocation ${attempt}`);
      assert.strictEqual(result.stdout, ALPHA_STDOUT, `stdout on invocation ${attempt}`);
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

test("AC2: the event-zulu lookup against Fixture A prints its own frozen timestamp projection and leaves the fixture untouched", () => {
  const dir = makeTempDir("ac2");
  try {
    const fixture = writeFixture(dir, "state.json", FIXTURE_A);
    const before = snapshotFile(fixture);
    const parentBefore = entryNames(dir);

    const result = runTool([fixture, "event-zulu"]);

    assert.strictEqual(result.stderr, "");
    assert.strictEqual(result.stderrBytes, 0);
    assert.strictEqual(result.stdout, ZULU_STDOUT);
    assert.strictEqual(result.status, 0);
    assert.deepStrictEqual(snapshotFile(fixture), before);
    assert.deepStrictEqual(entryNames(dir), parentBefore);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AC3: every frozen lookup miss, including the case-distinct ID, fails with the exact not-found envelope", () => {
  const cases = [
    ["fixture-a-missing-id", FIXTURE_A, "event-missing"],
    ["fixture-a-case-distinct-id", FIXTURE_A, "Event-alpha"],
    ["fixture-b-missing-id", FIXTURE_B, "event-missing"],
  ];

  for (const [label, contents, eventId] of cases) {
    const dir = makeTempDir(`ac3-${label}`);
    try {
      const fixture = writeFixture(dir, "state.json", contents);
      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);

      for (const storedId of JSON.parse(contents).events.map(event => event.id)) {
        assert.notStrictEqual(
          eventId,
          storedId,
          `${eventId} is byte-identical to stored event ID ${storedId} in ${label}`
        );
      }

      const result = runTool([fixture, eventId]);

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

test("AC4: zero, one, and three positional arguments fail with the exact usage envelope before any file access", () => {
  for (const [label, buildArgs] of [
    ["zero", () => []],
    ["one", candidate => [candidate]],
    ["three", candidate => [candidate, "event-alpha", "extra"]],
  ]) {
    const dir = makeTempDir(`ac4-${label}`);
    try {
      const candidate = path.join(dir, ARITY_STATE_NAME);
      assert.deepStrictEqual(entryNames(dir), [], `parent started empty for ${label} arguments`);

      const result = runTool(buildArgs(candidate));

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
  const missingParent = makeTempDir("ac5-absent");
  try {
    const missing = path.join(missingParent, ABSENT_STATE_NAME);
    const parentBefore = entryNames(missingParent);

    const result = runTool([missing, "event-alpha"]);

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
    const stateDirectory = path.join(directoryParent, STATE_DIRECTORY_NAME);
    fs.mkdirSync(stateDirectory);
    const before = snapshotDirectory(stateDirectory);
    const parentBefore = entryNames(directoryParent);

    const result = runTool([stateDirectory, "event-alpha"]);

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
    ["fixture-c-unclosed-object", FIXTURE_C],
    ["fixture-d-zero-byte", FIXTURE_D],
  ]) {
    const dir = makeTempDir(`ac6-${label}`);
    try {
      const fixture = writeFixture(dir, "state.json", contents);
      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);

      const result = runTool([fixture, "event-alpha"]);

      assert.strictEqual(result.stdout, "", `stdout for ${label}`);
      assert.strictEqual(result.stdoutBytes, 0, `stdout byte count for ${label}`);
      assert.strictEqual(result.stderr, PARSE_ERROR, `stderr for ${label}`);
      assert.strictEqual(result.status, 1, `exit code for ${label}`);
      assert.strictEqual(
        result.stdout.includes("MALFORMED-PAYLOAD-MUST-NOT-LEAK"),
        false,
        `stdout echoed malformed bytes for ${label}`
      );
      assert.strictEqual(
        result.stderr.includes("MALFORMED-PAYLOAD-MUST-NOT-LEAK"),
        false,
        `stderr echoed malformed bytes for ${label}`
      );
      assert.deepStrictEqual(snapshotFile(fixture), before, `fixture bytes and stat for ${label}`);
      assert.deepStrictEqual(entryNames(dir), parentBefore, `parent entries for ${label}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("AC7: every S1-S16 structural-invalid fixture fails with the exact invalid-state envelope after a distinctness proof", () => {
  assertPairwiseDistinct([
    ["A", FIXTURE_A],
    ["B", FIXTURE_B],
    ["C", FIXTURE_C],
    ["D", FIXTURE_D],
    ...STRUCTURAL_INVALID_FIXTURES,
  ]);

  for (const [label, contents] of STRUCTURAL_INVALID_FIXTURES) {
    const dir = makeTempDir(`ac7-${label.toLowerCase()}`);
    try {
      const fixture = writeFixture(dir, "state.json", contents);
      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);

      const result = runTool([fixture, "event-alpha"]);

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

test("AC8: the production command self-terminates under the frozen timeout and stays inside its offline source boundary", () => {
  const dir = makeTempDir("ac8");
  try {
    const fixture = writeFixture(dir, "state.json", FIXTURE_A);
    const result = runTool([fixture, "event-alpha"]);

    assert.strictEqual(result.status, 0, "timed child completed successfully");
    assert.strictEqual(result.stdout, ALPHA_STDOUT, "timed child stdout");
    assert.strictEqual(result.stderr, "", "timed child stderr");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  assert.strictEqual(fs.existsSync(TOOL), true, "app/tools/event-timestamp.js exists");
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

  assert.deepStrictEqual(
    specifiersOf(fs.readFileSync(TEST_FILE, "utf8")),
    ["node:assert", "node:child_process", "node:fs", "node:os", "node:path", "node:test"],
    "Test-author file complete module-specifier set"
  );
});

test("AC10: Fixture E proves createdAt copies the stored receivedAt bytes verbatim and that extra event fields are opaque", () => {
  assertPairwiseDistinct([
    ["A", FIXTURE_A],
    ["B", FIXTURE_B],
    ["C", FIXTURE_C],
    ["D", FIXTURE_D],
    ["E", FIXTURE_E],
    ...STRUCTURAL_INVALID_FIXTURES,
  ]);

  const dir = makeTempDir("ac10");
  try {
    const fixture = writeFixture(dir, "state.json", FIXTURE_E);
    const before = snapshotFile(fixture);
    const parentBefore = entryNames(dir);

    const events = JSON.parse(FIXTURE_E).events;
    const [verbatimEvent, opaqueEvent] = events;
    assert.deepStrictEqual(
      Object.keys(verbatimEvent).sort(),
      ["id", "receivedAt"],
      "event-verbatim complete own-key set"
    );
    assert.strictEqual(
      verbatimEvent.receivedAt,
      "VERBATIM-TIMESTAMP-MUST-NOT-BE-NORMALIZED",
      "event-verbatim stored receivedAt"
    );
    assert.strictEqual(opaqueEvent.type, 7, "event-opaque numeric type");
    assert.strictEqual(
      opaqueEvent.payload,
      "OPAQUE-EVENT-PAYLOAD-MUST-NOT-LEAK",
      "event-opaque scalar payload"
    );
    assert.deepStrictEqual(
      opaqueEvent.extra,
      { private: "OPAQUE-EVENT-EXTRA-MUST-NOT-LEAK" },
      "event-opaque additional object field"
    );

    for (const [eventId, expectedStdout] of [
      ["event-verbatim", VERBATIM_STDOUT],
      ["event-opaque", OPAQUE_STDOUT],
    ]) {
      const result = runTool([fixture, eventId]);

      assert.strictEqual(result.stderr, "", `stderr for ${eventId}`);
      assert.strictEqual(result.stderrBytes, 0, `stderr byte count for ${eventId}`);
      assert.strictEqual(result.stdout, expectedStdout, `stdout for ${eventId}`);
      assert.strictEqual(result.status, 0, `exit code for ${eventId}`);
      assert.deepStrictEqual(
        snapshotFile(fixture),
        before,
        `fixture bytes and bigint stat after ${eventId}`
      );
      assert.deepStrictEqual(entryNames(dir), parentBefore, `parent entries after ${eventId}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const TOOL = path.join(__dirname, "..", "tools", "event-job-count.js");
const TEST_FILE = __filename;
const CHILD_TIMEOUT_MS = 5_000;

const USAGE_ERROR = "usage: node app/tools/event-job-count.js <state-file> <event-id>\n";
const READ_ERROR = "event-job-count: cannot read state file\n";
const PARSE_ERROR = "event-job-count: state file is not valid JSON\n";
const INVALID_STATE_ERROR = "event-job-count: invalid Relay state\n";
const NOT_FOUND_ERROR = "event-job-count: event not found\n";

const ALPHA_STDOUT = '{"eventId":"event-alpha","jobs":3}\n';
const ZULU_STDOUT = '{"eventId":"event-zulu","jobs":1}\n';
const ZERO_STDOUT = '{"eventId":"event-zero","jobs":0}\n';

const SENSITIVE_TOKENS = [
  "UNSELECTED-PAYLOAD-MUST-NOT-LEAK",
  "SELECTED-PAYLOAD-MUST-NOT-LEAK",
  "RELATED-JOB-ERROR-MUST-NOT-LEAK",
  "SECOND-RELATED-JOB-MUST-NOT-LEAK",
  "UNRELATED-JOB-ERROR-MUST-NOT-LEAK",
  "APPROVAL-TO-MUST-NOT-LEAK",
  "APPROVAL-SUBJECT-MUST-NOT-LEAK",
  "APPROVAL-BODY-MUST-NOT-LEAK",
  "APPROVAL-REASON-MUST-NOT-LEAK",
  "OUTBOX-TO-MUST-NOT-LEAK",
  "OUTBOX-SUBJECT-MUST-NOT-LEAK",
  "OUTBOX-BODY-MUST-NOT-LEAK",
  "TOP-LEVEL-METADATA-MUST-NOT-LEAK",
  "OPAQUE-JOB-CONTENT-MUST-NOT-LEAK",
  "MALFORMED-STATE-CONTENT-MUST-NOT-LEAK",
  "arity-state-MUST-NOT-LEAK",
  "PATH-MUST-NOT-LEAK",
  "DIRECTORY-MUST-NOT-LEAK",
];

const FIXTURE_A_VALUE = {
  events: [
    {
      id: "event-zulu",
      type: 7,
      payload: "UNSELECTED-PAYLOAD-MUST-NOT-LEAK",
      receivedAt: "2026-08-24T08:00:01.000Z",
    },
    {
      id: "event-alpha",
      type: "meeting",
      payload: { private: "SELECTED-PAYLOAD-MUST-NOT-LEAK" },
      receivedAt: "2026-08-24T08:00:00.000Z",
    },
    { id: "event-zero" },
  ],
  jobs: [
    {
      id: "job-alpha-1",
      eventId: "event-alpha",
      status: "dead",
      lastError: "RELATED-JOB-ERROR-MUST-NOT-LEAK",
    },
    { eventId: "event-alpha", private: "SECOND-RELATED-JOB-MUST-NOT-LEAK" },
    { id: 7, eventId: "event-alpha", status: null },
    {
      id: "job-zulu",
      eventId: "event-zulu",
      status: "done",
      lastError: "UNRELATED-JOB-ERROR-MUST-NOT-LEAK",
    },
  ],
  approvals: [
    {
      id: "appr-alpha",
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
      to: "OUTBOX-TO-MUST-NOT-LEAK",
      subject: "OUTBOX-SUBJECT-MUST-NOT-LEAK",
      body: "OUTBOX-BODY-MUST-NOT-LEAK",
    },
  ],
  metadata: { note: "TOP-LEVEL-METADATA-MUST-NOT-LEAK" },
};

const FIXTURE_A = JSON.stringify(FIXTURE_A_VALUE, null, 2) + "\n";
const FIXTURE_B =
  '{"events":[],"jobs":[{"eventId":"event-ghost","private":"OPAQUE-JOB-CONTENT-MUST-NOT-LEAK"}],' +
  '"approvals":[null],"outbox":[7],"metadata":false}\n';
const FIXTURE_C = '{"events":[],"secret":"MALFORMED-STATE-CONTENT-MUST-NOT-LEAK"\n';
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
  ["S10", '{"events":[{}],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S11", '{"events":[{"id":""}],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S12", '{"events":[{"id":7}],"jobs":[],"approvals":[],"outbox":[]}\n'],
  [
    "S13",
    '{"events":[{"id":"event-alpha"},{"id":"event-alpha"}],"jobs":[],"approvals":[],"outbox":[]}\n',
  ],
  ["S14", '{"events":[],"jobs":[null],"approvals":[],"outbox":[]}\n'],
  ["S15", '{"events":[],"jobs":[[]],"approvals":[],"outbox":[]}\n'],
  ["S16", '{"events":[],"jobs":[{}],"approvals":[],"outbox":[]}\n'],
  ["S17", '{"events":[],"jobs":[{"eventId":""}],"approvals":[],"outbox":[]}\n'],
  ["S18", '{"events":[],"jobs":[{"eventId":7}],"approvals":[],"outbox":[]}\n'],
  [
    "S19",
    '{"events":[{"id":"event-alpha"}],"jobs":[{"eventId":"event-alpha"},null],' +
      '"approvals":[],"outbox":[]}\n',
  ],
];

function makeTempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `relay-event-job-count-${label}-`));
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

function storedEventIds(serialized) {
  const parsed = JSON.parse(serialized);
  return parsed.events.map(event => event.id);
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

test("AC1: repeated event-alpha invocations against Fixture A print the frozen count of three and leave the fixture untouched", () => {
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

test("AC2: the event-zulu and event-zero lookups against Fixture A print the frozen counts of one and zero", () => {
  for (const [label, eventId, expected] of [
    ["zulu", "event-zulu", ZULU_STDOUT],
    ["zero", "event-zero", ZERO_STDOUT],
  ]) {
    const dir = makeTempDir(`ac2-${label}`);
    try {
      const fixture = writeFixture(dir, "state.json", FIXTURE_A);
      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);

      const result = runTool([fixture, eventId]);

      assert.strictEqual(result.stderr, "", `stderr for ${label}`);
      assert.strictEqual(result.stderrBytes, 0, `stderr byte count for ${label}`);
      assert.strictEqual(result.stdout, expected, `stdout for ${label}`);
      assert.strictEqual(result.status, 0, `exit code for ${label}`);
      assert.deepStrictEqual(snapshotFile(fixture), before, `fixture bytes and stat for ${label}`);
      assert.deepStrictEqual(entryNames(dir), parentBefore, `parent entries for ${label}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("AC3: every frozen lookup miss, including the case-distinct ID and Fixture B's dangling link, fails with the exact not-found envelope", () => {
  const cases = [
    ["fixture-a-missing-id", FIXTURE_A, "event-missing"],
    ["fixture-a-case-distinct-id", FIXTURE_A, "Event-alpha"],
    ["fixture-b-missing-id", FIXTURE_B, "event-missing"],
  ];

  for (const [label, contents, eventId] of cases) {
    const dir = makeTempDir(`ac3-${label}`);
    try {
      const fixture = writeFixture(dir, "state.json", contents);

      for (const storedId of storedEventIds(contents)) {
        assert.notStrictEqual(
          eventId,
          storedId,
          `queried ID ${eventId} is byte-identical to stored ID ${storedId} for ${label}`
        );
      }

      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);

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

test("AC4: zero, one, and three positional arguments fail with the exact usage envelope before any state-file read", () => {
  const zeroDir = makeTempDir("ac4-zero");
  try {
    const parentBefore = entryNames(zeroDir);
    const result = runTool([]);

    assert.strictEqual(result.stdout, "", "stdout for zero arguments");
    assert.strictEqual(result.stdoutBytes, 0, "stdout byte count for zero arguments");
    assert.strictEqual(result.stderr, USAGE_ERROR, "stderr for zero arguments");
    assert.strictEqual(result.status, 2, "exit code for zero arguments");
    assert.deepStrictEqual(entryNames(zeroDir), parentBefore, "parent entries for zero arguments");
    assert.deepStrictEqual(entryNames(zeroDir), [], "parent stayed empty for zero arguments");
  } finally {
    fs.rmSync(zeroDir, { recursive: true, force: true });
  }

  for (const [label, extraArgs] of [
    ["one", []],
    ["three", ["event-alpha", "extra"]],
  ]) {
    const dir = makeTempDir(`ac4-${label}`);
    try {
      const candidate = path.join(dir, "arity-state-MUST-NOT-LEAK.json");
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

test("AC5: an absent path and a directory path fail with the exact read-failure envelope and change nothing", () => {
  const missingDir = makeTempDir("ac5-missing");
  try {
    const missing = path.join(missingDir, "PATH-MUST-NOT-LEAK.json");
    const parentBefore = entryNames(missingDir);

    const result = runTool([missing, "event-alpha"]);

    assert.strictEqual(result.stdout, "", "stdout for absent path");
    assert.strictEqual(result.stdoutBytes, 0, "stdout byte count for absent path");
    assert.strictEqual(result.stderr, READ_ERROR, "stderr for absent path");
    assert.strictEqual(result.status, 1, "exit code for absent path");
    assert.strictEqual(fs.existsSync(missing), false, "absent path stayed absent");
    assert.deepStrictEqual(entryNames(missingDir), parentBefore, "parent entries for absent path");
  } finally {
    fs.rmSync(missingDir, { recursive: true, force: true });
  }

  const directoryParent = makeTempDir("ac5-directory");
  try {
    const stateDirectory = path.join(directoryParent, "DIRECTORY-MUST-NOT-LEAK");
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
    ["fixture-c", FIXTURE_C],
    ["fixture-d", FIXTURE_D],
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
        result.stdout.includes("MALFORMED-STATE-CONTENT-MUST-NOT-LEAK"),
        false,
        `stdout leaked malformed content for ${label}`
      );
      assert.strictEqual(
        result.stderr.includes("MALFORMED-STATE-CONTENT-MUST-NOT-LEAK"),
        false,
        `stderr leaked malformed content for ${label}`
      );
      assert.deepStrictEqual(snapshotFile(fixture), before, `fixture bytes and stat for ${label}`);
      assert.deepStrictEqual(entryNames(dir), parentBefore, `parent entries for ${label}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("AC7: every S1-S19 structural-invalid fixture fails with the exact invalid-state envelope after a pairwise distinctness proof", () => {
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

test("AC8: the production command self-terminates under the frozen timeout and both roles stay inside their frozen source boundaries", () => {
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

  assert.strictEqual(fs.existsSync(TOOL), true, "app/tools/event-job-count.js exists");
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

  assert.deepStrictEqual(
    specifiersOf(fs.readFileSync(TEST_FILE, "utf8")),
    ["node:assert", "node:child_process", "node:fs", "node:os", "node:path", "node:test"],
    "acceptance suite module-specifier set"
  );
});

const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const TOOL = path.join(__dirname, "..", "tools", "event-inspect.js");
const CHILD_TIMEOUT_MS = 5000;

const USAGE_ERROR = "usage: node app/tools/event-inspect.js <state-file> <event-id>\n";
const READ_ERROR = "event-inspect: cannot read state file\n";
const PARSE_ERROR = "event-inspect: state file is not valid JSON\n";
const INVALID_STATE_ERROR = "event-inspect: invalid Relay state\n";
const NOT_FOUND_ERROR = "event-inspect: event not found\n";

const FIXTURE_A = `${JSON.stringify(
  {
    events: [
      {
        id: "event-zulu",
        type: "email",
        payload: { private: "UNSELECTED-PAYLOAD-MUST-NOT-LEAK" },
        receivedAt: "2026-08-07T12:00:01.000Z",
      },
      {
        id: "event-alpha",
        type: "meeting",
        payload: { private: "SELECTED-PAYLOAD-MUST-NOT-LEAK" },
        receivedAt: "2026-08-07T12:00:00.000Z",
      },
    ],
    jobs: [
      {
        id: "job-event-alpha",
        eventId: "event-alpha",
        status: "pending",
        lastError: "RELATED-JOB-DETAIL-MUST-NOT-LEAK",
      },
      {
        id: "job-other",
        eventId: "event-other",
        status: "dead",
        lastError: "UNRELATED-JOB-DETAIL-MUST-NOT-LEAK",
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
  },
  null,
  2,
)}\n`;

const FIXTURE_B = '{"events":[],"jobs":[],"approvals":[],"outbox":[]}\n';
const FIXTURE_C = '{"events":[],"payload":"MALFORMED-PAYLOAD-MUST-NOT-LEAK"\n';

const ALPHA_STDOUT =
  '{"id":"event-alpha","type":"meeting","receivedAt":"2026-08-07T12:00:00.000Z","hasJob":true}\n';
const ZULU_STDOUT =
  '{"id":"event-zulu","type":"email","receivedAt":"2026-08-07T12:00:01.000Z","hasJob":false}\n';

const STRUCTURAL_INVALID_FIXTURES = [
  ["S1", "[]"],
  ["S2", '{"events":[],"jobs":[],"approvals":[]}'],
  ["S3", '{"events":{},"jobs":[],"approvals":[],"outbox":[]}'],
  ["S4", '{"events":[],"jobs":{},"approvals":[],"outbox":[]}'],
  ["S5", '{"events":[],"jobs":[],"approvals":{},"outbox":[]}'],
  ["S6", '{"events":[],"jobs":[],"approvals":[],"outbox":{}}'],
  ["S7", '{"events":[null],"jobs":[],"approvals":[],"outbox":[]}'],
  ["S8", '{"events":[[]],"jobs":[],"approvals":[],"outbox":[]}'],
  [
    "S9",
    '{"events":[{"id":"","type":"meeting","receivedAt":"2026-08-07T12:00:00.000Z"}],"jobs":[],"approvals":[],"outbox":[]}',
  ],
  [
    "S10",
    '{"events":[{"id":7,"type":"meeting","receivedAt":"2026-08-07T12:00:00.000Z"}],"jobs":[],"approvals":[],"outbox":[]}',
  ],
  [
    "S11",
    '{"events":[{"id":"event-a","type":7,"receivedAt":"2026-08-07T12:00:00.000Z"}],"jobs":[],"approvals":[],"outbox":[]}',
  ],
  [
    "S12",
    '{"events":[{"id":"event-a","type":"","receivedAt":"2026-08-07T12:00:00.000Z"}],"jobs":[],"approvals":[],"outbox":[]}',
  ],
  [
    "S13",
    '{"events":[{"id":"event-a","type":"meeting","receivedAt":null}],"jobs":[],"approvals":[],"outbox":[]}',
  ],
  [
    "S14",
    '{"events":[{"id":"event-a","type":"meeting","receivedAt":""}],"jobs":[],"approvals":[],"outbox":[]}',
  ],
  [
    "S15",
    '{"events":[{"id":"same","type":"a","receivedAt":"1"},{"id":"same","type":"b","receivedAt":"2"}],"jobs":[],"approvals":[],"outbox":[]}',
  ],
  ["S16", '{"events":[],"jobs":[null],"approvals":[],"outbox":[]}'],
  ["S17", '{"events":[],"jobs":[[]],"approvals":[],"outbox":[]}'],
  ["S18", '{"events":[],"jobs":[{"eventId":7}],"approvals":[],"outbox":[]}'],
  ["S19", '{"events":[],"jobs":[{"eventId":""}],"approvals":[],"outbox":[]}'],
].map(([id, json]) => [id, `${json}\n`]);

const SENSITIVE_TOKENS = [
  "UNSELECTED-PAYLOAD-MUST-NOT-LEAK",
  "SELECTED-PAYLOAD-MUST-NOT-LEAK",
  "RELATED-JOB-DETAIL-MUST-NOT-LEAK",
  "UNRELATED-JOB-DETAIL-MUST-NOT-LEAK",
  "APPROVAL-TO-MUST-NOT-LEAK",
  "APPROVAL-SUBJECT-MUST-NOT-LEAK",
  "APPROVAL-BODY-MUST-NOT-LEAK",
  "APPROVAL-REASON-MUST-NOT-LEAK",
  "OUTBOX-TO-MUST-NOT-LEAK",
  "OUTBOX-SUBJECT-MUST-NOT-LEAK",
  "OUTBOX-BODY-MUST-NOT-LEAK",
  "TOP-LEVEL-METADATA-MUST-NOT-LEAK",
  "MALFORMED-PAYLOAD-MUST-NOT-LEAK",
];

function makeTempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `relay-event-inspect-${label}-`));
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

function assertNoSensitiveTokens(result, label) {
  for (const token of SENSITIVE_TOKENS) {
    assert.strictEqual(result.stdout.includes(token), false, `${label}: ${token} leaked to stdout`);
    assert.strictEqual(result.stderr.includes(token), false, `${label}: ${token} leaked to stderr`);
  }
}

function runTool(args, label) {
  const result = spawnSync(process.execPath, [TOOL, ...args], {
    stdio: "pipe",
    timeout: CHILD_TIMEOUT_MS,
  });
  assert.strictEqual(
    result.error,
    undefined,
    `${label}: spawn failed: ${result.error && result.error.message}`,
  );
  assert.strictEqual(
    result.signal,
    null,
    `${label}: child terminated by signal ${result.signal} (5-second bound breached)`,
  );
  const observed = {
    status: result.status,
    stdout: result.stdout.toString("utf8"),
    stderr: result.stderr.toString("utf8"),
  };
  assertNoSensitiveTokens(observed, label);
  return observed;
}

test("AC1: two invocations for event-alpha against Fixture A emit the exact projection with hasJob true and leave the fixture unchanged", () => {
  const dir = makeTempDir("ac1");
  try {
    const fixture = writeFixture(dir, "state.json", FIXTURE_A);
    const before = snapshotFile(fixture);
    const parentBefore = entryNames(dir);

    for (const attempt of ["first", "second"]) {
      const result = runTool([fixture, "event-alpha"], `${attempt} invocation`);

      assert.strictEqual(result.stderr, "", `stderr bytes for ${attempt} invocation`);
      assert.strictEqual(result.stdout, ALPHA_STDOUT, `stdout for ${attempt} invocation`);
      assert.strictEqual(result.status, 0, `exit code for ${attempt} invocation`);
      assert.deepStrictEqual(
        snapshotFile(fixture),
        before,
        `fixture bytes, mode, size, and mtimeMs after ${attempt} invocation`,
      );
      assert.deepStrictEqual(
        entryNames(dir),
        parentBefore,
        `parent entries after ${attempt} invocation`,
      );
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AC2: event-zulu against Fixture A emits the exact projection with hasJob false and leaves the fixture unchanged", () => {
  const dir = makeTempDir("ac2");
  try {
    const fixture = writeFixture(dir, "state.json", FIXTURE_A);
    const before = snapshotFile(fixture);
    const parentBefore = entryNames(dir);

    const result = runTool([fixture, "event-zulu"], "event-zulu lookup");

    assert.strictEqual(result.stderr, "", "stderr bytes");
    assert.strictEqual(result.stdout, ZULU_STDOUT, "stdout");
    assert.strictEqual(result.status, 0, "exit code");
    assert.deepStrictEqual(snapshotFile(fixture), before, "fixture bytes, mode, size, and mtimeMs");
    assert.deepStrictEqual(entryNames(dir), parentBefore, "parent entries");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AC3: every frozen lookup miss exits 1 with the exact not-found line and no stdout", () => {
  const cases = [
    ["missing-id-fixture-a", FIXTURE_A, "event-missing"],
    ["case-distinct-id-fixture-a", FIXTURE_A, "Event-alpha"],
    ["missing-id-fixture-b", FIXTURE_B, "event-missing"],
  ];

  for (const [label, contents, eventId] of cases) {
    const dir = makeTempDir(`ac3-${label}`);
    try {
      const fixture = writeFixture(dir, "state.json", contents);
      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);

      const result = runTool([fixture, eventId], label);

      assert.strictEqual(result.stdout, "", `stdout bytes for ${label}`);
      assert.strictEqual(result.stderr, NOT_FOUND_ERROR, `stderr for ${label}`);
      assert.strictEqual(result.status, 1, `exit code for ${label}`);
      assert.deepStrictEqual(
        snapshotFile(fixture),
        before,
        `fixture bytes, mode, size, and mtimeMs for ${label}`,
      );
      assert.deepStrictEqual(entryNames(dir), parentBefore, `parent entries for ${label}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("AC4: zero, one, and three positional arguments each exit 2 with the exact usage line and read nothing", () => {
  const zeroArgs = runTool([], "zero arguments");
  assert.strictEqual(zeroArgs.stdout, "", "stdout bytes for zero arguments");
  assert.strictEqual(zeroArgs.stderr, USAGE_ERROR, "stderr for zero arguments");
  assert.strictEqual(zeroArgs.status, 2, "exit code for zero arguments");

  const oneArgDir = makeTempDir("ac4-one-arg");
  try {
    const candidate = path.join(oneArgDir, "missing-state.json");
    const parentBefore = entryNames(oneArgDir);

    const oneArg = runTool([candidate], "one argument");

    assert.strictEqual(oneArg.stdout, "", "stdout bytes for one argument");
    assert.strictEqual(oneArg.stderr, USAGE_ERROR, "stderr for one argument");
    assert.strictEqual(oneArg.status, 2, "exit code for one argument");
    assert.strictEqual(fs.existsSync(candidate), false, "candidate state path stayed absent");
    assert.deepStrictEqual(entryNames(oneArgDir), parentBefore, "temporary parent stayed empty");
    assert.deepStrictEqual(entryNames(oneArgDir), [], "temporary parent holds no entry");
  } finally {
    fs.rmSync(oneArgDir, { recursive: true, force: true });
  }

  const threeArgDir = makeTempDir("ac4-three-args");
  try {
    const fixture = writeFixture(threeArgDir, "state.json", FIXTURE_A);
    const before = snapshotFile(fixture);
    const parentBefore = entryNames(threeArgDir);

    const threeArgs = runTool([fixture, "event-alpha", "event-zulu"], "three arguments");

    assert.strictEqual(threeArgs.stdout, "", "stdout bytes for three arguments");
    assert.strictEqual(threeArgs.stderr, USAGE_ERROR, "stderr for three arguments");
    assert.strictEqual(threeArgs.status, 2, "exit code for three arguments");
    assert.deepStrictEqual(
      snapshotFile(fixture),
      before,
      "fixture bytes, mode, size, and mtimeMs for three arguments",
    );
    assert.deepStrictEqual(
      entryNames(threeArgDir),
      parentBefore,
      "parent entries for three arguments",
    );
  } finally {
    fs.rmSync(threeArgDir, { recursive: true, force: true });
  }
});

test("AC5: an absent path and a directory path each exit 1 with the exact read-failure line and no stdout", () => {
  const absentDir = makeTempDir("ac5-absent");
  try {
    const missing = path.join(absentDir, "missing-state.json");
    const parentBefore = entryNames(absentDir);

    const result = runTool([missing, "event-alpha"], "absent path");

    assert.strictEqual(result.stdout, "", "stdout bytes for absent path");
    assert.strictEqual(result.stderr, READ_ERROR, "stderr for absent path");
    assert.strictEqual(result.status, 1, "exit code for absent path");
    assert.strictEqual(fs.existsSync(missing), false, "absent path stayed absent");
    assert.deepStrictEqual(entryNames(absentDir), parentBefore, "parent entries for absent path");
  } finally {
    fs.rmSync(absentDir, { recursive: true, force: true });
  }

  const directoryParent = makeTempDir("ac5-directory");
  try {
    const stateDirectory = path.join(directoryParent, "state-directory");
    fs.mkdirSync(stateDirectory);
    const before = snapshotDirectory(stateDirectory);
    const parentBefore = entryNames(directoryParent);

    const result = runTool([stateDirectory, "event-alpha"], "directory path");

    assert.strictEqual(result.stdout, "", "stdout bytes for directory path");
    assert.strictEqual(result.stderr, READ_ERROR, "stderr for directory path");
    assert.strictEqual(result.status, 1, "exit code for directory path");
    assert.strictEqual(
      fs.statSync(stateDirectory).isDirectory(),
      true,
      "state path stayed a directory",
    );
    assert.deepStrictEqual(
      snapshotDirectory(stateDirectory),
      before,
      "directory entries and stat for directory path",
    );
    assert.deepStrictEqual(
      entryNames(directoryParent),
      parentBefore,
      "parent entries for directory path",
    );
  } finally {
    fs.rmSync(directoryParent, { recursive: true, force: true });
  }
});

test("AC6: Fixture C exits 1 with the exact parse-failure line and never echoes the malformed payload", () => {
  const dir = makeTempDir("ac6");
  try {
    const fixture = writeFixture(dir, "state.json", FIXTURE_C);
    const before = snapshotFile(fixture);
    const parentBefore = entryNames(dir);

    const result = runTool([fixture, "event-alpha"], "Fixture C");

    assert.strictEqual(result.stdout, "", "stdout bytes");
    assert.strictEqual(result.stderr, PARSE_ERROR, "stderr");
    assert.strictEqual(result.status, 1, "exit code");
    assert.strictEqual(
      `${result.stdout}${result.stderr}`.includes("MALFORMED-PAYLOAD-MUST-NOT-LEAK"),
      false,
      "malformed payload token leaked",
    );
    assert.deepStrictEqual(snapshotFile(fixture), before, "fixture bytes, mode, size, and mtimeMs");
    assert.deepStrictEqual(entryNames(dir), parentBefore, "parent entries");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AC7: Fixtures A-C and S1-S19 are pairwise byte-distinct and every S fixture exits 1 with the exact invalid-state line", () => {
  const serialized = [
    ["A", FIXTURE_A],
    ["B", FIXTURE_B],
    ["C", FIXTURE_C],
    ...STRUCTURAL_INVALID_FIXTURES,
  ];
  for (let i = 0; i < serialized.length; i += 1) {
    for (let j = i + 1; j < serialized.length; j += 1) {
      assert.notStrictEqual(
        serialized[i][1],
        serialized[j][1],
        `fixtures ${serialized[i][0]} and ${serialized[j][0]} are byte-identical`,
      );
    }
  }

  for (const [id, contents] of STRUCTURAL_INVALID_FIXTURES) {
    const dir = makeTempDir(`ac7-${id.toLowerCase()}`);
    try {
      const fixture = writeFixture(dir, "state.json", contents);
      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);

      const result = runTool([fixture, "event-alpha"], id);

      assert.strictEqual(result.stdout, "", `stdout bytes for ${id}`);
      assert.strictEqual(result.stderr, INVALID_STATE_ERROR, `stderr for ${id}`);
      assert.strictEqual(result.status, 1, `exit code for ${id}`);
      assert.deepStrictEqual(
        snapshotFile(fixture),
        before,
        `fixture bytes, mode, size, and mtimeMs for ${id}`,
      );
      assert.deepStrictEqual(entryNames(dir), parentBefore, `parent entries for ${id}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("AC8: the Builder file statically declares only node:fs, uses only readFileSync, and references no network, server, process, or timer API", () => {
  assert.strictEqual(fs.existsSync(TOOL), true, "app/tools/event-inspect.js exists");
  const source = fs.readFileSync(TOOL, "utf8");

  const specifiers = new Set();
  const requirePattern = /require\(\s*["']([^"']+)["']\s*\)/g;
  let match = requirePattern.exec(source);
  while (match !== null) {
    specifiers.add(match[1]);
    match = requirePattern.exec(source);
  }
  assert.deepStrictEqual([...specifiers].sort(), ["node:fs"], "complete module-specifier set");

  const fsOperations = new Set();
  const destructuredPattern = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\(\s*["']node:fs["']\s*\)/g;
  let destructured = destructuredPattern.exec(source);
  while (destructured !== null) {
    for (const binding of destructured[1].split(",")) {
      const name = binding.split(":")[0].trim();
      if (name !== "") {
        fsOperations.add(name);
      }
    }
    destructured = destructuredPattern.exec(source);
  }

  const namespacePattern = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*["']node:fs["']\s*\)/g;
  let namespaced = namespacePattern.exec(source);
  while (namespaced !== null) {
    const binding = namespaced[1];
    const memberPattern = new RegExp(`\\b${binding}\\s*\\.\\s*([A-Za-z_$][\\w$]*)`, "g");
    let member = memberPattern.exec(source);
    while (member !== null) {
      fsOperations.add(member[1]);
      member = memberPattern.exec(source);
    }
    namespaced = namespacePattern.exec(source);
  }

  const inlinePattern = /require\(\s*["']node:fs["']\s*\)\s*\.\s*([A-Za-z_$][\w$]*)/g;
  let inline = inlinePattern.exec(source);
  while (inline !== null) {
    fsOperations.add(inline[1]);
    inline = inlinePattern.exec(source);
  }

  assert.deepStrictEqual([...fsOperations].sort(), ["readFileSync"], "node:fs operations used");

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
    assert.strictEqual(source.includes(forbidden), false, `source references ${forbidden}`);
  }
});

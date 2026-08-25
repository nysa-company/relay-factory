const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const TOOL = path.join(__dirname, "..", "tools", "event-id-type-count.js");
const CHILD_TIMEOUT_MS = 5_000;

const USAGE_ERROR =
  "usage: node app/tools/event-id-type-count.js <state-file> <event-id> <type>\n";
const READ_ERROR = "event-id-type-count: cannot read state file\n";
const PARSE_ERROR = "event-id-type-count: state file is not valid JSON\n";
const INVALID_STATE_ERROR = "event-id-type-count: invalid Relay state\n";

const ONE_STDOUT = '{"eventsWithIdAndType":1}\n';
const ZERO_STDOUT = '{"eventsWithIdAndType":0}\n';

// Frozen Unicode literals are built from escape sequences, never pasted from
// rendered markdown: composed uses U+00E9, decomposed uses U+0065 U+0301.
const COMPOSED_CAFE = "café";
const DECOMPOSED_CAFE = "café";
const COMPOSED_EVENT_CAFE = "event-café";
const DECOMPOSED_EVENT_CAFE = "event-café";

const SENSITIVE_TOKENS = [
  "SELECTED-PAYLOAD-MUST-NOT-LEAK",
  "OPAQUE-EVENT-PAYLOAD-MUST-NOT-LEAK",
  "OPAQUE-EVENT-EXTRA-MUST-NOT-LEAK",
  "JOB-ERROR-MUST-NOT-LEAK",
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
      id: "event-alpha",
      type: "meeting",
      payload: { private: "SELECTED-PAYLOAD-MUST-NOT-LEAK" },
      receivedAt: "2026-08-25T12:00:00.000Z",
    },
    {
      id: "event-bravo",
      type: "meeting",
      payload: "OPAQUE-EVENT-PAYLOAD-MUST-NOT-LEAK",
      receivedAt: "2026-08-25T12:00:01.000Z",
    },
    {
      id: "Event-alpha",
      type: "Meeting",
      payload: null,
      receivedAt: "2026-08-25T12:00:02.000Z",
    },
    {
      id: " event-alpha",
      type: " meeting",
      extra: { private: "OPAQUE-EVENT-EXTRA-MUST-NOT-LEAK" },
      receivedAt: "2026-08-25T12:00:03.000Z",
    },
    {
      id: "007",
      type: "7",
      receivedAt: "not-an-iso-instant",
    },
    {
      id: COMPOSED_EVENT_CAFE,
      type: COMPOSED_CAFE,
      payload: false,
      receivedAt: "2026-08-25T12:00:05.000Z",
    },
  ],
  jobs: [
    {
      lastError: "JOB-ERROR-MUST-NOT-LEAK",
    },
  ],
  approvals: [
    {
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
    '{"events":[{"type":"meeting","receivedAt":"2026-08-25T12:00:00.000Z"}],"jobs":[],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S11",
    '{"events":[{"id":"","type":"meeting","receivedAt":"2026-08-25T12:00:00.000Z"}],"jobs":[],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S12",
    '{"events":[{"id":7,"type":"meeting","receivedAt":"2026-08-25T12:00:00.000Z"}],"jobs":[],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S13",
    '{"events":[{"id":"event-alpha","receivedAt":"2026-08-25T12:00:00.000Z"}],"jobs":[],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S14",
    '{"events":[{"id":"event-alpha","type":"","receivedAt":"2026-08-25T12:00:00.000Z"}],"jobs":[],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S15",
    '{"events":[{"id":"event-alpha","type":7,"receivedAt":"2026-08-25T12:00:00.000Z"}],"jobs":[],"approvals":[],"outbox":[]}\n',
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
    '{"events":[{"id":"event-alpha","type":"meeting","receivedAt":"2026-08-25T12:00:00.000Z"},' +
      '{"id":"event-alpha","type":"email","receivedAt":"2026-08-25T12:00:01.000Z"}],' +
      '"jobs":[],"approvals":[],"outbox":[]}\n',
  ],
];

function makeTempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `relay-event-id-type-count-${label}-`));
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

function conjunctionMatches(eventId, eventType) {
  return FIXTURE_A_VALUE.events.filter(
    event => event.id === eventId && event.type === eventType
  ).length;
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

test("AC1: repeated event-alpha/meeting conjunction against Fixture A prints the frozen one-count line and leaves the fixture untouched", () => {
  const dir = makeTempDir("ac1");
  try {
    const fixture = writeFixture(dir, "state.json", FIXTURE_A);
    const before = snapshotFile(fixture);
    const parentBefore = entryNames(dir);

    for (const attempt of [1, 2]) {
      const result = runTool([fixture, "event-alpha", "meeting"]);

      assert.strictEqual(result.stderr, "", `stderr on invocation ${attempt}`);
      assert.strictEqual(result.stderrBytes, 0, `stderr byte count on invocation ${attempt}`);
      assert.strictEqual(result.stdout, ONE_STDOUT, `stdout on invocation ${attempt}`);
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

test("AC2: every frozen positive conjunction pair matches exactly one stored event and prints the frozen one-count line", () => {
  const positivePairs = [
    ["event-bravo-meeting", "event-bravo", "meeting"],
    ["capital-event-alpha-capital-meeting", "Event-alpha", "Meeting"],
    ["leading-space-pair", " event-alpha", " meeting"],
    ["leading-zero-pair", "007", "7"],
    ["composed-cafe-pair", COMPOSED_EVENT_CAFE, COMPOSED_CAFE],
  ];

  for (const [, eventId, eventType] of positivePairs) {
    assert.strictEqual(
      conjunctionMatches(eventId, eventType),
      1,
      `pair ${JSON.stringify([eventId, eventType])} matches exactly one stored event`
    );
  }

  for (const [label, eventId, eventType] of positivePairs) {
    const dir = makeTempDir(`ac2-${label}`);
    try {
      const fixture = writeFixture(dir, "state.json", FIXTURE_A);
      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);

      const result = runTool([fixture, eventId, eventType]);

      assert.strictEqual(result.stderr, "", `stderr for ${label}`);
      assert.strictEqual(result.stderrBytes, 0, `stderr byte count for ${label}`);
      assert.strictEqual(result.stdout, ONE_STDOUT, `stdout for ${label}`);
      assert.strictEqual(result.status, 0, `exit code for ${label}`);
      assert.deepStrictEqual(snapshotFile(fixture), before, `fixture bytes and stat for ${label}`);
      assert.deepStrictEqual(entryNames(dir), parentBefore, `parent entries for ${label}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("AC3: all six frozen zero-match cases succeed with a zero count instead of a not-found error", () => {
  assert.strictEqual(
    Buffer.from(COMPOSED_CAFE, "utf8").toString("hex"),
    "636166c3a9",
    "composed café UTF-8 bytes"
  );
  assert.strictEqual(
    Buffer.from(DECOMPOSED_CAFE, "utf8").toString("hex"),
    "63616665cc81",
    "decomposed café UTF-8 bytes"
  );
  assert.strictEqual(
    Buffer.from(COMPOSED_EVENT_CAFE, "utf8").toString("hex"),
    "6576656e742d636166c3a9",
    "composed event-café UTF-8 bytes"
  );
  assert.strictEqual(
    Buffer.from(DECOMPOSED_EVENT_CAFE, "utf8").toString("hex"),
    "6576656e742d63616665cc81",
    "decomposed event-café UTF-8 bytes"
  );

  const distinctPairs = [
    ["event-alpha", "Event-alpha"],
    ["event-alpha", " event-alpha"],
    ["007", "7"],
    ["meeting", "Meeting"],
    ["meeting", " meeting"],
    [COMPOSED_CAFE, DECOMPOSED_CAFE],
    [COMPOSED_EVENT_CAFE, DECOMPOSED_EVENT_CAFE],
  ];
  for (const [left, right] of distinctPairs) {
    assert.notStrictEqual(
      Buffer.from(left, "utf8").toString("hex"),
      Buffer.from(right, "utf8").toString("hex"),
      `literals ${JSON.stringify(left)} and ${JSON.stringify(right)} are byte-distinct`
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

  const zeroPairsAgainstA = [
    ["case-distinct-type", "event-alpha", "Meeting"],
    ["case-distinct-id", "Event-alpha", "meeting"],
    ["no-leading-zero-id", "7", "7"],
    ["decomposed-id-composed-type", DECOMPOSED_EVENT_CAFE, COMPOSED_CAFE],
    ["composed-id-decomposed-type", COMPOSED_EVENT_CAFE, DECOMPOSED_CAFE],
  ];

  for (const [, eventId, eventType] of zeroPairsAgainstA) {
    assert.strictEqual(
      conjunctionMatches(eventId, eventType),
      0,
      `pair ${JSON.stringify([eventId, eventType])} matches no stored event`
    );
  }

  const cases = [
    ...zeroPairsAgainstA.map(([label, eventId, eventType]) => [
      `fixture-a-${label}`,
      FIXTURE_A,
      eventId,
      eventType,
    ]),
    ["fixture-b-empty-events", FIXTURE_B, "event-alpha", "meeting"],
  ];

  for (const [label, contents, eventId, eventType] of cases) {
    const dir = makeTempDir(`ac3-${label}`);
    try {
      const fixture = writeFixture(dir, "state.json", contents);
      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);

      const result = runTool([fixture, eventId, eventType]);

      assert.strictEqual(result.stderr, "", `stderr for ${label}`);
      assert.strictEqual(result.stderrBytes, 0, `stderr byte count for ${label}`);
      assert.strictEqual(result.stdout, ZERO_STDOUT, `stdout for ${label}`);
      assert.strictEqual(result.status, 0, `exit code for ${label}`);
      assert.deepStrictEqual(snapshotFile(fixture), before, `fixture bytes and stat for ${label}`);
      assert.deepStrictEqual(entryNames(dir), parentBefore, `parent entries for ${label}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("AC4: wrong arity and empty filters fail with the exact usage envelope before any file access", () => {
  const cases = [
    ["zero-arguments", candidate => []],
    ["one-argument", candidate => [candidate]],
    ["two-arguments", candidate => [candidate, "event-alpha"]],
    ["four-arguments", candidate => [candidate, "event-alpha", "meeting", "extra"]],
    ["empty-event-id", candidate => [candidate, "", "meeting"]],
    ["empty-type", candidate => [candidate, "event-alpha", ""]],
  ];

  for (const [label, argsFor] of cases) {
    const dir = makeTempDir(`ac4-${label}`);
    try {
      const candidate = path.join(dir, "arity-state-MUST-NOT-LEAK.json");

      const result = runTool(argsFor(candidate));

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

test("AC5: an absent path and a directory path fail with the exact read-failure envelope and change nothing", () => {
  const missingParent = makeTempDir("ac5-missing");
  try {
    const missing = path.join(missingParent, "PATH-MUST-NOT-LEAK.json");
    const parentBefore = entryNames(missingParent);

    const result = runTool([missing, "event-alpha", "meeting"]);

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

    const result = runTool([stateDirectory, "event-alpha", "meeting"]);

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

      const result = runTool([fixture, "event-alpha", "meeting"]);

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
        Buffer.from(serialized[i][1], "utf8").toString("hex"),
        Buffer.from(serialized[j][1], "utf8").toString("hex"),
        `fixtures ${serialized[i][0]} and ${serialized[j][0]} are byte-identical`
      );
    }
  }

  const s19Value = JSON.parse(STRUCTURAL_INVALID_FIXTURES[18][1]);
  assert.strictEqual(STRUCTURAL_INVALID_FIXTURES[18][0], "S19", "S19 is the final fixture");
  assert.strictEqual(
    s19Value.events[0].id === "event-alpha" && s19Value.events[0].type === "meeting",
    true,
    "S19 places a matching event before its duplicate-ID sibling"
  );
  assert.strictEqual(
    s19Value.events[1].id,
    "event-alpha",
    "S19's second event duplicates the first event's ID"
  );

  for (const [label, contents] of STRUCTURAL_INVALID_FIXTURES) {
    const dir = makeTempDir(`ac7-${label.toLowerCase()}`);
    try {
      const fixture = writeFixture(dir, "state.json", contents);
      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);

      const result = runTool([fixture, "event-alpha", "meeting"]);

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
    const result = runTool([fixture, "event-alpha", "meeting"]);

    assert.strictEqual(result.status, 0, "timed child completed successfully");
    assert.strictEqual(result.stdout, ONE_STDOUT, "timed child stdout");
    assert.strictEqual(result.stderr, "", "timed child stderr");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  assert.strictEqual(fs.existsSync(TOOL), true, "app/tools/event-id-type-count.js exists");
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

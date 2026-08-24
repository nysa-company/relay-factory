const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const TOOL = path.join(__dirname, "..", "tools", "job-status-count.js");
const CHILD_TIMEOUT_MS = 5_000;

const USAGE_ERROR = "usage: node app/tools/job-status-count.js <state-file> <status>\n";
const READ_ERROR = "job-status-count: cannot read state file\n";
const PARSE_ERROR = "job-status-count: state file is not valid JSON\n";
const INVALID_STATE_ERROR = "job-status-count: invalid Relay state\n";

const COUNT_TWO_STDOUT = '{"jobsWithStatus":2}\n';
const COUNT_ONE_STDOUT = '{"jobsWithStatus":1}\n';
const COUNT_ZERO_STDOUT = '{"jobsWithStatus":0}\n';

const SENSITIVE_TOKENS = [
  "OPAQUE-EVENT-ID-MUST-NOT-LEAK",
  "EVENT-PAYLOAD-MUST-NOT-LEAK",
  "JOB-ID-PENDING-MUST-NOT-LEAK",
  "EVENT-ID-PENDING-MUST-NOT-LEAK",
  "PENDING-ERROR-MUST-NOT-LEAK",
  "JOB-ID-DONE-MUST-NOT-LEAK",
  "EVENT-ID-DONE-MUST-NOT-LEAK",
  "IGNORED-JOB-FIELD-MUST-NOT-LEAK",
  "JOB-ID-DEAD-ALPHA-MUST-NOT-LEAK",
  "EVENT-ID-DEAD-ALPHA-MUST-NOT-LEAK",
  "DEAD-ALPHA-ERROR-MUST-NOT-LEAK",
  "JOB-ID-DEAD-BRAVO-MUST-NOT-LEAK",
  "EVENT-ID-DEAD-BRAVO-MUST-NOT-LEAK",
  "APPROVAL-ACTION-MUST-NOT-LEAK",
  "OUTBOX-CONTENT-MUST-NOT-LEAK",
  "OPAQUE-CONTENT-MUST-NOT-LEAK",
  "MALFORMED-PAYLOAD-MUST-NOT-LEAK",
  "arity-state-MUST-NOT-LEAK.json",
  "arity-state-MUST-NOT-LEAK",
  "PATH-MUST-NOT-LEAK.json",
  "PATH-MUST-NOT-LEAK",
  "DIRECTORY-MUST-NOT-LEAK",
  "dead",
  "pending",
  "done",
  "Dead",
  " dead",
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
      id: "JOB-ID-PENDING-MUST-NOT-LEAK",
      eventId: "EVENT-ID-PENDING-MUST-NOT-LEAK",
      status: "pending",
      attempts: 2,
      lastError: "PENDING-ERROR-MUST-NOT-LEAK",
      retries: 1,
      attemptsSinceRetry: 1,
    },
    {
      id: "JOB-ID-DONE-MUST-NOT-LEAK",
      eventId: "EVENT-ID-DONE-MUST-NOT-LEAK",
      status: "done",
      attempts: 4,
      lastError: null,
      retries: 1,
      attemptsSinceRetry: 1,
      ignoredDiagnostic: "IGNORED-JOB-FIELD-MUST-NOT-LEAK",
    },
    {
      id: "JOB-ID-DEAD-ALPHA-MUST-NOT-LEAK",
      eventId: "EVENT-ID-DEAD-ALPHA-MUST-NOT-LEAK",
      status: "dead",
      attempts: 3,
      lastError: "DEAD-ALPHA-ERROR-MUST-NOT-LEAK",
      retries: 0,
      attemptsSinceRetry: 3,
    },
    {
      id: "JOB-ID-DEAD-BRAVO-MUST-NOT-LEAK",
      eventId: "EVENT-ID-DEAD-BRAVO-MUST-NOT-LEAK",
      status: "dead",
      attempts: 6,
      lastError: "",
      retries: 1,
      attemptsSinceRetry: 3,
    },
  ],
  approvals: [{ action: { body: "APPROVAL-ACTION-MUST-NOT-LEAK" } }],
  outbox: [{ body: "OUTBOX-CONTENT-MUST-NOT-LEAK" }],
};

const FIXTURE_A = JSON.stringify(FIXTURE_A_VALUE, null, 2) + "\n";
const FIXTURE_B =
  '{"events":[null],"jobs":[],"approvals":[7],"outbox":["OPAQUE-CONTENT-MUST-NOT-LEAK"]}\n';
const FIXTURE_C = '{"jobs":[],"payload":"MALFORMED-PAYLOAD-MUST-NOT-LEAK"\n';
const FIXTURE_D = "";

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
    '{"events":[],"jobs":[{"id":"","eventId":"event-invalid","status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0}],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S12",
    '{"events":[],"jobs":[{"id":7,"eventId":"event-invalid","status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0}],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S13",
    '{"events":[],"jobs":[{"id":"job-invalid-event-empty","eventId":"","status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0}],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S14",
    '{"events":[],"jobs":[{"id":"job-invalid-event-type","eventId":7,"status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0}],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S15",
    '{"events":[],"jobs":[{"id":"job-invalid-status-case","eventId":"event-invalid","status":"DEAD","attempts":3,"lastError":null,"retries":0,"attemptsSinceRetry":3}],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S16",
    '{"events":[],"jobs":[{"id":"job-invalid-status-type","eventId":"event-invalid","status":null,"attempts":3,"lastError":null,"retries":0,"attemptsSinceRetry":3}],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S17",
    '{"events":[],"jobs":[{"id":"job-invalid-attempts-negative","eventId":"event-invalid","status":"dead","attempts":-1,"lastError":null,"retries":0,"attemptsSinceRetry":3}],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S18",
    '{"events":[],"jobs":[{"id":"job-invalid-attempts-type","eventId":"event-invalid","status":"pending","attempts":0.5,"lastError":null,"retries":0,"attemptsSinceRetry":0}],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S19",
    '{"events":[],"jobs":[{"id":"job-invalid-retries-negative","eventId":"event-invalid","status":"dead","attempts":3,"lastError":null,"retries":-1,"attemptsSinceRetry":3}],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S20",
    '{"events":[],"jobs":[{"id":"job-invalid-retries-type","eventId":"event-invalid","status":"pending","attempts":0,"lastError":null,"retries":"0","attemptsSinceRetry":0}],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S21",
    '{"events":[],"jobs":[{"id":"job-invalid-window-negative","eventId":"event-invalid","status":"dead","attempts":3,"lastError":null,"retries":0,"attemptsSinceRetry":-1}],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S22",
    '{"events":[],"jobs":[{"id":"job-invalid-window-type","eventId":"event-invalid","status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":null}],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S23",
    '{"events":[],"jobs":[{"id":"job-invalid-error","eventId":"event-invalid","status":"dead","attempts":3,"lastError":7,"retries":0,"attemptsSinceRetry":3}],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S24",
    '{"events":[],"jobs":[{"id":"job-duplicate","eventId":"event-a","status":"pending","attempts":0,"lastError":null,"retries":0,"attemptsSinceRetry":0},{"id":"job-duplicate","eventId":"event-b","status":"done","attempts":1,"lastError":null,"retries":0,"attemptsSinceRetry":1}],"approvals":[],"outbox":[]}\n',
  ],
  [
    "S25",
    '{"events":[],"jobs":[{"id":"job-valid-matching-first","eventId":"event-valid","status":"dead","attempts":3,"lastError":"countable-first","retries":0,"attemptsSinceRetry":3},{"id":"job-invalid-missing-attempts","eventId":"event-invalid","status":"pending","lastError":null,"retries":0,"attemptsSinceRetry":0}],"approvals":[],"outbox":[]}\n',
  ],
];

function makeTempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `relay-job-status-count-${label}-`));
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

test("AC1: two invocations for status dead against Fixture A each print the frozen count of two and leave the fixture untouched", () => {
  const dir = makeTempDir("ac1");
  try {
    const fixture = writeFixture(dir, "state.json", FIXTURE_A);
    const before = snapshotFile(fixture);
    const parentBefore = entryNames(dir);

    for (const attempt of [1, 2]) {
      const result = runTool([fixture, "dead"]);

      assert.strictEqual(result.stderr, "", `stderr on invocation ${attempt}`);
      assert.strictEqual(result.stderrBytes, 0, `stderr byte count on invocation ${attempt}`);
      assert.strictEqual(result.stdout, COUNT_TWO_STDOUT, `stdout on invocation ${attempt}`);
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

test("AC2: statuses pending and done against Fixture A each print the frozen count of one and leave the fixture untouched", () => {
  for (const status of ["pending", "done"]) {
    const dir = makeTempDir(`ac2-${status}`);
    try {
      const fixture = writeFixture(dir, "state.json", FIXTURE_A);
      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);

      const result = runTool([fixture, status]);

      assert.strictEqual(result.stderr, "", `stderr for the ${status} query`);
      assert.strictEqual(result.stderrBytes, 0, `stderr byte count for the ${status} query`);
      assert.strictEqual(result.stdout, COUNT_ONE_STDOUT, `stdout for the ${status} query`);
      assert.strictEqual(result.status, 0, `exit code for the ${status} query`);
      assert.deepStrictEqual(
        snapshotFile(fixture),
        before,
        `fixture bytes and bigint stat for the ${status} query`
      );
      assert.deepStrictEqual(entryNames(dir), parentBefore, `parent entries for the ${status} query`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("AC3: all four frozen zero-match cases succeed with a zero count instead of an error", () => {
  const storedStatuses = FIXTURE_A_VALUE.jobs.map(job => job.status);
  for (const literal of ["Dead", " dead", ""]) {
    for (const storedStatus of storedStatuses) {
      assert.notStrictEqual(
        literal,
        storedStatus,
        `the direct literal ${JSON.stringify(literal)} is byte-distinct from stored status ${JSON.stringify(storedStatus)}`
      );
    }
  }

  const fixtureBValue = JSON.parse(FIXTURE_B);
  assert.deepStrictEqual(fixtureBValue.jobs, [], "Fixture B has an empty jobs array");
  assert.deepStrictEqual(fixtureBValue.events, [null], "Fixture B keeps its frozen opaque event");
  assert.deepStrictEqual(fixtureBValue.approvals, [7], "Fixture B keeps its frozen opaque approval");
  assert.deepStrictEqual(
    fixtureBValue.outbox,
    ["OPAQUE-CONTENT-MUST-NOT-LEAK"],
    "Fixture B keeps its frozen opaque outbox value"
  );

  const cases = [
    ["fixture-a-capitalized", FIXTURE_A, "Dead"],
    ["fixture-a-leading-space", FIXTURE_A, " dead"],
    ["fixture-a-empty-status", FIXTURE_A, ""],
    ["fixture-b-empty-jobs", FIXTURE_B, "dead"],
  ];

  for (const [label, contents, status] of cases) {
    const dir = makeTempDir(`ac3-${label}`);
    try {
      const fixture = writeFixture(dir, "state.json", contents);
      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);

      const result = runTool([fixture, status]);

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

test("AC4: zero, one, and three positional arguments fail with the exact usage envelope and never touch the candidate path", () => {
  const cases = [
    ["zero", []],
    ["one", []],
    ["three", ["dead", "extra"]],
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

    const result = runTool([missing, "dead"]);

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

    const result = runTool([stateDirectory, "dead"]);

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

      const result = runTool([fixture, "dead"]);

      assert.strictEqual(result.stdout, "", `stdout for ${label}`);
      assert.strictEqual(result.stdoutBytes, 0, `stdout byte count for ${label}`);
      assert.strictEqual(result.stderr, PARSE_ERROR, `stderr for ${label}`);
      assert.strictEqual(result.status, 1, `exit code for ${label}`);
      assert.strictEqual(
        result.stdout.includes("MALFORMED-PAYLOAD-MUST-NOT-LEAK"),
        false,
        `stdout stayed free of the malformed payload for ${label}`
      );
      assert.strictEqual(
        result.stderr.includes("MALFORMED-PAYLOAD-MUST-NOT-LEAK"),
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

test("AC7: every S1-S25 structural-invalid fixture fails with the exact invalid-state envelope after a distinctness proof", () => {
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

  const s15Status = JSON.parse(
    STRUCTURAL_INVALID_FIXTURES.find(entry => entry[0] === "S15")[1]
  ).jobs[0].status;
  assert.strictEqual(s15Status, "DEAD", "S15 freezes the exact casing-derived status DEAD");
  assert.notStrictEqual(s15Status, "dead", "S15's DEAD is byte-distinct from valid dead");

  const s25Jobs = JSON.parse(
    STRUCTURAL_INVALID_FIXTURES.find(entry => entry[0] === "S25")[1]
  ).jobs;
  assert.strictEqual(s25Jobs[0].status, "dead", "S25's first job matches the queried status");
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(s25Jobs[1], "attempts"),
    false,
    "S25's invalid sibling is missing its own attempts property"
  );

  for (const [label, contents] of STRUCTURAL_INVALID_FIXTURES) {
    const dir = makeTempDir(`ac7-${label.toLowerCase()}`);
    try {
      const fixture = writeFixture(dir, "state.json", contents);
      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);

      const result = runTool([fixture, "dead"]);

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

test("AC8: the command self-terminates under the frozen timeout and both files stay inside their frozen source boundaries", () => {
  const dir = makeTempDir("ac8");
  try {
    const fixture = writeFixture(dir, "state.json", FIXTURE_A);
    const result = runTool([fixture, "dead"]);

    assert.strictEqual(result.status, 0, "timed child completed successfully");
    assert.strictEqual(result.stdout, COUNT_TWO_STDOUT, "timed child stdout");
    assert.strictEqual(result.stderr, "", "timed child stderr");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  assert.strictEqual(fs.existsSync(TOOL), true, "app/tools/job-status-count.js exists");
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

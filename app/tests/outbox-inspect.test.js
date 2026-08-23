const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const TOOL = path.join(__dirname, "..", "tools", "outbox-inspect.js");

const USAGE_ERROR = "usage: node app/tools/outbox-inspect.js <state-file> <approval-id>\n";
const READ_ERROR = "outbox-inspect: cannot read state file\n";
const PARSE_ERROR = "outbox-inspect: state file is not valid JSON\n";
const INVALID_STATE_ERROR = "outbox-inspect: invalid Relay state\n";
const NOT_FOUND_ERROR = "outbox-inspect: outbox receipt not found\n";

const SELECTED_ID = "appr-receipt-alpha";
const UNSELECTED_ID = "appr-receipt-zulu";
const CASE_DISTINCT_ID = "Appr-receipt-alpha";
const MISSING_ID = "appr-missing";
const DUPLICATE_ID = "appr-duplicate";

const FIXTURE_A_VALUE = {
  events: [
    {
      id: "event-private",
      payload: {
        secret: "EVENT-PAYLOAD-MUST-NOT-LEAK",
      },
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
      approvalId: UNSELECTED_ID,
      sentAt: "2026-08-22T12:00:00.000Z",
    },
    {
      to: "SELECTED-TO-MUST-NOT-LEAK",
      subject: "SELECTED-SUBJECT-MUST-NOT-LEAK",
      body: "SELECTED-BODY-MUST-NOT-LEAK",
      approvalId: SELECTED_ID,
      sentAt: "2026-08-22T12:00:01.000Z",
    },
  ],
  metadata: {
    secret: "TOPLEVEL-MUST-NOT-LEAK",
  },
};

const FIXTURE_A = JSON.stringify(FIXTURE_A_VALUE, null, 2) + "\n";
const FIXTURE_A_STDOUT = '{"approvalId":"appr-receipt-alpha","sentAt":"2026-08-22T12:00:01.000Z"}\n';

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

const FIXTURE_B = '{"events":[],"jobs":[],"approvals":[],"outbox":[]}\n';

const MALFORMED_TOKEN = "MALFORMED-STATE-MUST-NOT-LEAK";
const FIXTURE_C = '{"events":[],"secret":"MALFORMED-STATE-MUST-NOT-LEAK"\n';

const STRUCTURAL_FIXTURES = [
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
    '{"events":[],"jobs":[],"approvals":[],"outbox":[{"sentAt":"2026-08-22T12:00:00.000Z"}]}\n',
    SELECTED_ID,
  ],
  [
    "S14",
    '{"events":[],"jobs":[],"approvals":[],"outbox":[{"approvalId":7,"sentAt":"2026-08-22T12:00:00.000Z"}]}\n',
    SELECTED_ID,
  ],
  [
    "S15",
    '{"events":[],"jobs":[],"approvals":[],"outbox":[{"approvalId":"","sentAt":"2026-08-22T12:00:00.000Z"}]}\n',
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
    DUPLICATE_ID,
  ],
];

function makeTempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `relay-outbox-inspect-${label}-`));
}

function writeFixture(dir, name, contents) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, contents);
  return file;
}

function entryNames(dir) {
  return fs.readdirSync(dir).sort();
}

function fingerprintFile(file) {
  const stat = fs.statSync(file, { bigint: true });
  return {
    bytes: fs.readFileSync(file).toString("hex"),
    mode: stat.mode,
    size: stat.size,
    mtimeNs: stat.mtimeNs,
  };
}

function fingerprintDirectory(dir) {
  const stat = fs.statSync(dir, { bigint: true });
  return {
    isDirectory: stat.isDirectory(),
    mode: stat.mode,
    size: stat.size,
    mtimeNs: stat.mtimeNs,
    entries: entryNames(dir),
  };
}

function runTool(args) {
  const started = process.hrtime.bigint();
  const result = spawnSync(process.execPath, [TOOL, ...args], {
    stdio: "pipe",
    timeout: 5000,
  });
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  assert.strictEqual(result.error, undefined, `spawn failed: ${result.error && result.error.message}`);
  assert.strictEqual(result.signal, null, `child terminated by signal ${result.signal}`);
  assert.ok(elapsedMs < 5000, `child did not complete within 5 seconds (${elapsedMs}ms)`);
  return {
    status: result.status,
    stdout: result.stdout.toString("utf8"),
    stderr: result.stderr.toString("utf8"),
  };
}

test("AC1: Fixture A lookup of appr-receipt-alpha emits only the frozen receipt projection on both invocations and leaves the fixture unchanged", () => {
  const dir = makeTempDir("ac1");
  try {
    const fixture = writeFixture(dir, "state.json", FIXTURE_A);
    const before = fingerprintFile(fixture);
    const parentBefore = entryNames(dir);

    for (const attempt of [1, 2]) {
      const result = runTool([fixture, SELECTED_ID]);

      assert.strictEqual(result.stderr, "", `stderr bytes on invocation ${attempt}`);
      assert.strictEqual(result.stdout, FIXTURE_A_STDOUT, `stdout bytes on invocation ${attempt}`);
      assert.strictEqual(result.status, 0, `exit code on invocation ${attempt}`);

      const streams = result.stdout + result.stderr;
      for (const token of SENSITIVE_TOKENS) {
        assert.strictEqual(streams.includes(token), false, `${token} leaked on invocation ${attempt}`);
      }
      assert.strictEqual(
        streams.includes(UNSELECTED_ID),
        false,
        `unselected receipt ID leaked on invocation ${attempt}`,
      );

      assert.deepStrictEqual(fingerprintFile(fixture), before, `fixture fingerprint after invocation ${attempt}`);
      assert.deepStrictEqual(entryNames(dir), parentBefore, `parent entries after invocation ${attempt}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AC2: every frozen lookup miss reports the exact not-found error and leaves its fixture unchanged", () => {
  const cases = [
    ["fixture-a-missing-id", FIXTURE_A, MISSING_ID],
    ["fixture-a-case-distinct-id", FIXTURE_A, CASE_DISTINCT_ID],
    ["fixture-b-missing-id", FIXTURE_B, MISSING_ID],
  ];

  for (const [label, contents, approvalId] of cases) {
    const dir = makeTempDir(`ac2-${label}`);
    try {
      const fixture = writeFixture(dir, "state.json", contents);
      const before = fingerprintFile(fixture);
      const parentBefore = entryNames(dir);

      const result = runTool([fixture, approvalId]);

      assert.strictEqual(result.stdout, "", `stdout bytes for ${label}`);
      assert.strictEqual(result.stderr, NOT_FOUND_ERROR, `stderr bytes for ${label}`);
      assert.strictEqual(result.status, 1, `exit code for ${label}`);
      assert.deepStrictEqual(fingerprintFile(fixture), before, `fixture fingerprint for ${label}`);
      assert.deepStrictEqual(entryNames(dir), parentBefore, `parent entries for ${label}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("AC3: zero, one, and three positional arguments report the exact usage error and touch no path", () => {
  const cases = [
    ["zero-args", () => []],
    ["one-arg", dir => [path.join(dir, "candidate-state.json")]],
    ["three-args", dir => [path.join(dir, "state-a.json"), "appr-a", "extra-argument"]],
  ];

  for (const [label, buildArgs] of cases) {
    const dir = makeTempDir(`ac3-${label}`);
    try {
      const args = buildArgs(dir);
      assert.deepStrictEqual(entryNames(dir), [], `temporary parent starts empty for ${label}`);
      for (const candidate of args.filter(value => value.startsWith(dir))) {
        assert.strictEqual(fs.existsSync(candidate), false, `${candidate} is absent before ${label}`);
      }

      const result = runTool(args);

      assert.strictEqual(result.stdout, "", `stdout bytes for ${label}`);
      assert.strictEqual(result.stderr, USAGE_ERROR, `stderr bytes for ${label}`);
      assert.strictEqual(result.status, 2, `exit code for ${label}`);
      for (const candidate of args.filter(value => value.startsWith(dir))) {
        assert.strictEqual(fs.existsSync(candidate), false, `${candidate} stayed absent for ${label}`);
      }
      assert.deepStrictEqual(entryNames(dir), [], `temporary parent stayed empty for ${label}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("AC4: an absent path and a directory path report the exact read error and change nothing on disk", () => {
  const absentDir = makeTempDir("ac4-absent");
  try {
    const missing = path.join(absentDir, "missing-state.json");
    assert.strictEqual(fs.existsSync(missing), false, "absent path is absent before invocation");
    const parentBefore = entryNames(absentDir);

    const result = runTool([missing, SELECTED_ID]);

    assert.strictEqual(result.stdout, "", "stdout bytes for absent path");
    assert.strictEqual(result.stderr, READ_ERROR, "stderr bytes for absent path");
    assert.strictEqual(result.status, 1, "exit code for absent path");
    assert.strictEqual(fs.existsSync(missing), false, "absent path stayed absent");
    assert.deepStrictEqual(entryNames(absentDir), parentBefore, "parent entries for absent path");
  } finally {
    fs.rmSync(absentDir, { recursive: true, force: true });
  }

  const directoryParent = makeTempDir("ac4-directory");
  try {
    const stateDirectory = path.join(directoryParent, "state-directory");
    fs.mkdirSync(stateDirectory);
    const before = fingerprintDirectory(stateDirectory);
    const parentBefore = entryNames(directoryParent);

    const result = runTool([stateDirectory, SELECTED_ID]);

    assert.strictEqual(result.stdout, "", "stdout bytes for directory path");
    assert.strictEqual(result.stderr, READ_ERROR, "stderr bytes for directory path");
    assert.strictEqual(result.status, 1, "exit code for directory path");
    assert.deepStrictEqual(fingerprintDirectory(stateDirectory), before, "directory fingerprint");
    assert.deepStrictEqual(entryNames(directoryParent), parentBefore, "parent entries for directory path");
  } finally {
    fs.rmSync(directoryParent, { recursive: true, force: true });
  }
});

test("AC5: Fixture C reports the exact invalid-JSON error without leaking the malformed body", () => {
  const dir = makeTempDir("ac5");
  try {
    const fixture = writeFixture(dir, "state.json", FIXTURE_C);
    const before = fingerprintFile(fixture);
    const parentBefore = entryNames(dir);

    const result = runTool([fixture, SELECTED_ID]);

    assert.strictEqual(result.stdout, "", "stdout bytes for Fixture C");
    assert.strictEqual(result.stderr, PARSE_ERROR, "stderr bytes for Fixture C");
    assert.strictEqual(result.status, 1, "exit code for Fixture C");
    assert.strictEqual(
      (result.stdout + result.stderr).includes(MALFORMED_TOKEN),
      false,
      "malformed-state secret leaked",
    );
    assert.deepStrictEqual(fingerprintFile(fixture), before, "Fixture C fingerprint");
    assert.deepStrictEqual(entryNames(dir), parentBefore, "parent entries for Fixture C");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AC6: every S1-S19 structural-invalid fixture reports the exact invalid-state error and changes nothing on disk", () => {
  const serialized = [FIXTURE_A, FIXTURE_B, FIXTURE_C, ...STRUCTURAL_FIXTURES.map(entry => entry[1])];
  assert.strictEqual(
    new Set(serialized).size,
    serialized.length,
    "Fixtures A-C and S1-S19 are pairwise byte-distinct",
  );

  for (const [id, contents, approvalId] of STRUCTURAL_FIXTURES) {
    const dir = makeTempDir(`ac6-${id.toLowerCase()}`);
    try {
      const fixture = writeFixture(dir, "state.json", contents);
      const before = fingerprintFile(fixture);
      const parentBefore = entryNames(dir);

      const result = runTool([fixture, approvalId]);

      assert.strictEqual(result.stdout, "", `stdout bytes for ${id}`);
      assert.strictEqual(result.stderr, INVALID_STATE_ERROR, `stderr bytes for ${id}`);
      assert.strictEqual(result.status, 1, `exit code for ${id}`);
      assert.deepStrictEqual(fingerprintFile(fixture), before, `fixture fingerprint for ${id}`);
      assert.deepStrictEqual(entryNames(dir), parentBefore, `parent entries for ${id}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("AC7: the command source imports only node:fs, uses only readFileSync, and references no network or timer facility", () => {
  assert.strictEqual(fs.existsSync(TOOL), true, "app/tools/outbox-inspect.js exists");
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
  const namespacePattern = /(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*require\(\s*["']node:fs["']\s*\)/g;
  match = namespacePattern.exec(source);
  while (match !== null) {
    const memberPattern = new RegExp(`\\b${match[1]}\\s*\\.\\s*([A-Za-z0-9_$]+)`, "g");
    let member = memberPattern.exec(source);
    while (member !== null) {
      fsOperations.add(member[1]);
      member = memberPattern.exec(source);
    }
    match = namespacePattern.exec(source);
  }
  const destructurePattern = /\{([^}]*)\}\s*=\s*require\(\s*["']node:fs["']\s*\)/g;
  match = destructurePattern.exec(source);
  while (match !== null) {
    for (const binding of match[1].split(",")) {
      const name = binding.split(":")[0].trim();
      if (name !== "") {
        fsOperations.add(name);
      }
    }
    match = destructurePattern.exec(source);
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

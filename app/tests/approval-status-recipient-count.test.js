const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const TOOL = path.join(__dirname, "..", "tools", "approval-status-recipient-count.js");
const CHILD_TIMEOUT_MS = 5_000;

const USAGE_ERROR =
  "usage: node app/tools/approval-status-recipient-count.js <state-file> <status> <recipient>\n";
const INVALID_STATUS_ERROR = "approval-status-recipient-count: invalid status\n";
const EMPTY_RECIPIENT_ERROR = "approval-status-recipient-count: recipient must be non-empty\n";
const READ_ERROR = "approval-status-recipient-count: cannot read state file\n";
const PARSE_ERROR = "approval-status-recipient-count: state file is not valid JSON\n";
const INVALID_STATE_ERROR = "approval-status-recipient-count: invalid Relay state\n";

const TARGET_RECIPIENT = "TARGET-RECIPIENT-MUST-NOT-LEAK@example.test";
const OTHER_RECIPIENT = "OTHER-RECIPIENT-MUST-NOT-LEAK@example.test";
const LEADING_SPACE_RECIPIENT = " TARGET-RECIPIENT-MUST-NOT-LEAK@example.test";
const COMPOSED_RECIPIENT = "café@example.test";
const DECOMPOSED_RECIPIENT = "café@example.test";
const CASE_DISTINCT_RECIPIENT = "Target-RECIPIENT-MUST-NOT-LEAK@example.test";
const SPACE_RECIPIENT = " ";
const NUMERIC_RECIPIENT = "7";
const EMPTY_RECIPIENT = "";

const VALID_STATUSES = ["pending", "sent", "rejected", "blocked_recipient"];
const UPPERCASE_STATUS = "PENDING";
const UNKNOWN_STATUS = "done";
const PADDED_STATUS = " pending";
const EMPTY_STATUS = "";

const COMPOSED_RECIPIENT_HEX = "636166c3a9406578616d706c652e74657374";
const DECOMPOSED_RECIPIENT_HEX = "63616665cc81406578616d706c652e74657374";

const COUNT_TWO_STDOUT = '{"approvalsWithStatusAndRecipient":2}\n';
const COUNT_ONE_STDOUT = '{"approvalsWithStatusAndRecipient":1}\n';
const COUNT_ZERO_STDOUT = '{"approvalsWithStatusAndRecipient":0}\n';

const ARITY_CANDIDATE_NAME = "arity-state-MUST-NOT-LEAK.json";
const FILTER_CANDIDATE_NAME = "filter-state-MUST-NOT-LEAK.json";
const ABSENT_CANDIDATE_NAME = "PATH-MUST-NOT-LEAK.json";
const DIRECTORY_CANDIDATE_NAME = "DIRECTORY-MUST-NOT-LEAK";

const MALFORMED_TOKEN = "MALFORMED-PAYLOAD-MUST-NOT-LEAK";
const LEAK_MARKER = "MUST-NOT-LEAK";

const PROPOSED_AT_LITERALS = [
  "2026-08-25T12:00:00.000Z",
  "2026-08-25T12:00:01.000Z",
  "2026-08-25T12:00:02.000Z",
  "2026-08-25T12:00:03.000Z",
  "not-an-iso-instant",
  "2026-08-25T12:00:05.000Z",
  "2026-08-25T12:00:06.000Z",
  "2026-08-25T12:00:07.000Z",
  "2026-08-25T12:00:08.000Z",
  "2026-08-25T12:00:09.000Z",
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
      id: "APPROVAL-ID-TARGET-PENDING-ONE-MUST-NOT-LEAK",
      jobId: "JOB-ID-TARGET-PENDING-ONE-MUST-NOT-LEAK",
      action: {
        to: "TARGET-RECIPIENT-MUST-NOT-LEAK@example.test",
        subject: "SUBJECT-TARGET-PENDING-ONE-MUST-NOT-LEAK",
        body: "BODY-TARGET-PENDING-ONE-MUST-NOT-LEAK",
      },
      status: "pending",
      proposedAt: "2026-08-25T12:00:00.000Z",
    },
    {
      id: "APPROVAL-ID-TARGET-PENDING-TWO-MUST-NOT-LEAK",
      jobId: "JOB-ID-TARGET-PENDING-TWO-MUST-NOT-LEAK",
      action: {
        to: "TARGET-RECIPIENT-MUST-NOT-LEAK@example.test",
        subject: "SUBJECT-TARGET-PENDING-TWO-MUST-NOT-LEAK",
        body: "BODY-TARGET-PENDING-TWO-MUST-NOT-LEAK",
      },
      status: "pending",
      proposedAt: "2026-08-25T12:00:01.000Z",
      reason: null,
    },
    {
      id: "APPROVAL-ID-TARGET-SENT-MUST-NOT-LEAK",
      jobId: "JOB-ID-TARGET-SENT-MUST-NOT-LEAK",
      action: {
        to: "TARGET-RECIPIENT-MUST-NOT-LEAK@example.test",
        subject: "SUBJECT-TARGET-SENT-MUST-NOT-LEAK",
        body: "BODY-TARGET-SENT-MUST-NOT-LEAK",
      },
      status: "sent",
      proposedAt: "2026-08-25T12:00:02.000Z",
      reason: "",
    },
    {
      id: "APPROVAL-ID-TARGET-REJECTED-MUST-NOT-LEAK",
      jobId: "JOB-ID-TARGET-REJECTED-MUST-NOT-LEAK",
      action: {
        to: "TARGET-RECIPIENT-MUST-NOT-LEAK@example.test",
        subject: "SUBJECT-TARGET-REJECTED-MUST-NOT-LEAK",
        body: "BODY-TARGET-REJECTED-MUST-NOT-LEAK",
      },
      status: "rejected",
      proposedAt: "2026-08-25T12:00:03.000Z",
      reason: "REJECTION-REASON-MUST-NOT-LEAK",
    },
    {
      id: "APPROVAL-ID-TARGET-BLOCKED-MUST-NOT-LEAK",
      jobId: "JOB-ID-TARGET-BLOCKED-MUST-NOT-LEAK",
      action: {
        to: "TARGET-RECIPIENT-MUST-NOT-LEAK@example.test",
        subject: "SUBJECT-TARGET-BLOCKED-MUST-NOT-LEAK",
        body: "BODY-TARGET-BLOCKED-MUST-NOT-LEAK",
      },
      status: "blocked_recipient",
      proposedAt: "not-an-iso-instant",
      reason: null,
    },
    {
      id: "APPROVAL-ID-LEADING-SENT-MUST-NOT-LEAK",
      jobId: "JOB-ID-LEADING-SENT-MUST-NOT-LEAK",
      action: {
        to: " TARGET-RECIPIENT-MUST-NOT-LEAK@example.test",
        subject: "SUBJECT-LEADING-SENT-MUST-NOT-LEAK",
        body: "BODY-LEADING-SENT-MUST-NOT-LEAK",
      },
      status: "sent",
      proposedAt: "2026-08-25T12:00:05.000Z",
      reason: " ",
    },
    {
      id: "APPROVAL-ID-OTHER-PENDING-MUST-NOT-LEAK",
      jobId: "JOB-ID-OTHER-PENDING-MUST-NOT-LEAK",
      action: {
        to: "OTHER-RECIPIENT-MUST-NOT-LEAK@example.test",
        subject: "SUBJECT-OTHER-PENDING-MUST-NOT-LEAK",
        body: "BODY-OTHER-PENDING-MUST-NOT-LEAK",
      },
      status: "pending",
      proposedAt: "2026-08-25T12:00:06.000Z",
      ignoredDiagnostic: "IGNORED-APPROVAL-FIELD-MUST-NOT-LEAK",
    },
    {
      id: "APPROVAL-ID-UNICODE-PENDING-MUST-NOT-LEAK",
      jobId: "JOB-ID-UNICODE-PENDING-MUST-NOT-LEAK",
      action: {
        to: "café@example.test",
        subject: "SUBJECT-UNICODE-PENDING-MUST-NOT-LEAK",
        body: "BODY-UNICODE-PENDING-MUST-NOT-LEAK",
      },
      status: "pending",
      proposedAt: "2026-08-25T12:00:07.000Z",
    },
    {
      id: "APPROVAL-ID-NUMERIC-BLOCKED-MUST-NOT-LEAK",
      jobId: "JOB-ID-NUMERIC-BLOCKED-MUST-NOT-LEAK",
      action: {
        to: 7,
        subject: null,
        body: false,
        ignored: "IGNORED-ACTION-FIELD-MUST-NOT-LEAK",
      },
      status: "blocked_recipient",
      proposedAt: "2026-08-25T12:00:08.000Z",
    },
    {
      id: "APPROVAL-ID-SPACE-PENDING-MUST-NOT-LEAK",
      jobId: "JOB-ID-SPACE-PENDING-MUST-NOT-LEAK",
      action: {
        to: " ",
        subject: "SUBJECT-SPACE-PENDING-MUST-NOT-LEAK",
        body: "BODY-SPACE-PENDING-MUST-NOT-LEAK",
      },
      status: "pending",
      proposedAt: "2026-08-25T12:00:09.000Z",
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
  '{"events":[null],"jobs":[7],"approvals":[],' +
  '"outbox":["OPAQUE-OUTBOX-MUST-NOT-LEAK"],"metadata":false}\n';
const FIXTURE_C = '{"approvals":[],"payload":"MALFORMED-PAYLOAD-MUST-NOT-LEAK"\n';
const FIXTURE_D = "";

const APPROVALS = FIXTURE_A_VALUE.approvals;
const STORED_ACTION_TO = APPROVALS.map(approval => approval.action.to);

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
    '{"events":[],"jobs":[],"approvals":[{"jobId":"job-a","action":{"to":"a",' +
      '"subject":"b","body":"c"},"status":"pending","proposedAt":"time-a"}],"outbox":[]}\n',
  ],
  [
    "S11",
    '{"events":[],"jobs":[],"approvals":[{"id":"","jobId":"job-a","action":{"to":"a",' +
      '"subject":"b","body":"c"},"status":"pending","proposedAt":"time-a"}],"outbox":[]}\n',
  ],
  [
    "S12",
    '{"events":[],"jobs":[],"approvals":[{"id":7,"jobId":"job-a","action":{"to":"a",' +
      '"subject":"b","body":"c"},"status":"pending","proposedAt":"time-a"}],"outbox":[]}\n',
  ],
  [
    "S13",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","action":{"to":"a",' +
      '"subject":"b","body":"c"},"status":"pending","proposedAt":"time-a"}],"outbox":[]}\n',
  ],
  [
    "S14",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"","action":{"to":"a",' +
      '"subject":"b","body":"c"},"status":"pending","proposedAt":"time-a"}],"outbox":[]}\n',
  ],
  [
    "S15",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":7,"action":{"to":"a",' +
      '"subject":"b","body":"c"},"status":"pending","proposedAt":"time-a"}],"outbox":[]}\n',
  ],
  [
    "S16",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a",' +
      '"status":"pending","proposedAt":"time-a"}],"outbox":[]}\n',
  ],
  [
    "S17",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","action":null,' +
      '"status":"pending","proposedAt":"time-a"}],"outbox":[]}\n',
  ],
  [
    "S18",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","action":[],' +
      '"status":"pending","proposedAt":"time-a"}],"outbox":[]}\n',
  ],
  [
    "S19",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","action":{' +
      '"subject":"b","body":"c"},"status":"pending","proposedAt":"time-a"}],"outbox":[]}\n',
  ],
  [
    "S20",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","action":{"to":"a",' +
      '"body":"c"},"status":"pending","proposedAt":"time-a"}],"outbox":[]}\n',
  ],
  [
    "S21",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","action":{"to":"a",' +
      '"subject":"b"},"status":"pending","proposedAt":"time-a"}],"outbox":[]}\n',
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
      '"subject":"b","body":"c"},"proposedAt":"time-a"}],"outbox":[]}\n',
  ],
  [
    "S26",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","action":{"to":"a",' +
      '"subject":"b","body":"c"},"status":"PENDING","proposedAt":"time-a"}],"outbox":[]}\n',
  ],
  [
    "S27",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","action":{"to":"a",' +
      '"subject":"b","body":"c"},"status":null,"proposedAt":"time-a"}],"outbox":[]}\n',
  ],
  [
    "S28",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-a","jobId":"job-a","action":{"to":"a",' +
      '"subject":"b","body":"c"},"status":"rejected","proposedAt":"time-a","reason":7}],' +
      '"outbox":[]}\n',
  ],
  [
    "S29",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-duplicate","jobId":"job-a","action":{' +
      '"to":"TARGET-RECIPIENT-MUST-NOT-LEAK@example.test","subject":"b","body":"c"},' +
      '"status":"pending","proposedAt":"time-a"},' +
      '{"id":"appr-duplicate","jobId":"job-b","action":{"to":"d","subject":"e","body":"f"},' +
      '"status":"sent","proposedAt":"time-b"}],"outbox":[]}\n',
  ],
  [
    "S30",
    '{"events":[],"jobs":[],"approvals":[{"id":"appr-valid-first","jobId":"job-valid",' +
      '"action":{"to":"TARGET-RECIPIENT-MUST-NOT-LEAK@example.test","subject":"b",' +
      '"body":"c"},"status":"pending","proposedAt":"time-a"},{"id":"appr-invalid-second",' +
      '"jobId":"job-invalid","action":{"to":"d","subject":"e","body":"f"},' +
      '"status":"rejected","proposedAt":"time-b","reason":false}],"outbox":[]}\n',
  ],
  ["S31", "7\n"],
];

const S26_INDEX = 25;
const S29_INDEX = 28;
const S30_INDEX = 29;

const EXPECTED_SENSITIVE_TOKENS = [
  "EVENT-PAYLOAD-MUST-NOT-LEAK",
  "JOB-ERROR-MUST-NOT-LEAK",
  "APPROVAL-ID-TARGET-PENDING-ONE-MUST-NOT-LEAK",
  "JOB-ID-TARGET-PENDING-ONE-MUST-NOT-LEAK",
  "TARGET-RECIPIENT-MUST-NOT-LEAK@example.test",
  "SUBJECT-TARGET-PENDING-ONE-MUST-NOT-LEAK",
  "BODY-TARGET-PENDING-ONE-MUST-NOT-LEAK",
  "APPROVAL-ID-TARGET-PENDING-TWO-MUST-NOT-LEAK",
  "JOB-ID-TARGET-PENDING-TWO-MUST-NOT-LEAK",
  "SUBJECT-TARGET-PENDING-TWO-MUST-NOT-LEAK",
  "BODY-TARGET-PENDING-TWO-MUST-NOT-LEAK",
  "APPROVAL-ID-TARGET-SENT-MUST-NOT-LEAK",
  "JOB-ID-TARGET-SENT-MUST-NOT-LEAK",
  "SUBJECT-TARGET-SENT-MUST-NOT-LEAK",
  "BODY-TARGET-SENT-MUST-NOT-LEAK",
  "APPROVAL-ID-TARGET-REJECTED-MUST-NOT-LEAK",
  "JOB-ID-TARGET-REJECTED-MUST-NOT-LEAK",
  "SUBJECT-TARGET-REJECTED-MUST-NOT-LEAK",
  "BODY-TARGET-REJECTED-MUST-NOT-LEAK",
  "REJECTION-REASON-MUST-NOT-LEAK",
  "APPROVAL-ID-TARGET-BLOCKED-MUST-NOT-LEAK",
  "JOB-ID-TARGET-BLOCKED-MUST-NOT-LEAK",
  "SUBJECT-TARGET-BLOCKED-MUST-NOT-LEAK",
  "BODY-TARGET-BLOCKED-MUST-NOT-LEAK",
  "APPROVAL-ID-LEADING-SENT-MUST-NOT-LEAK",
  "JOB-ID-LEADING-SENT-MUST-NOT-LEAK",
  " TARGET-RECIPIENT-MUST-NOT-LEAK@example.test",
  "SUBJECT-LEADING-SENT-MUST-NOT-LEAK",
  "BODY-LEADING-SENT-MUST-NOT-LEAK",
  "APPROVAL-ID-OTHER-PENDING-MUST-NOT-LEAK",
  "JOB-ID-OTHER-PENDING-MUST-NOT-LEAK",
  "OTHER-RECIPIENT-MUST-NOT-LEAK@example.test",
  "SUBJECT-OTHER-PENDING-MUST-NOT-LEAK",
  "BODY-OTHER-PENDING-MUST-NOT-LEAK",
  "IGNORED-APPROVAL-FIELD-MUST-NOT-LEAK",
  "APPROVAL-ID-UNICODE-PENDING-MUST-NOT-LEAK",
  "JOB-ID-UNICODE-PENDING-MUST-NOT-LEAK",
  "SUBJECT-UNICODE-PENDING-MUST-NOT-LEAK",
  "BODY-UNICODE-PENDING-MUST-NOT-LEAK",
  "APPROVAL-ID-NUMERIC-BLOCKED-MUST-NOT-LEAK",
  "JOB-ID-NUMERIC-BLOCKED-MUST-NOT-LEAK",
  "IGNORED-ACTION-FIELD-MUST-NOT-LEAK",
  "APPROVAL-ID-SPACE-PENDING-MUST-NOT-LEAK",
  "JOB-ID-SPACE-PENDING-MUST-NOT-LEAK",
  "SUBJECT-SPACE-PENDING-MUST-NOT-LEAK",
  "BODY-SPACE-PENDING-MUST-NOT-LEAK",
  "OUTBOX-CONTENT-MUST-NOT-LEAK",
  "TOP-LEVEL-METADATA-MUST-NOT-LEAK",
  "OPAQUE-OUTBOX-MUST-NOT-LEAK",
  "MALFORMED-PAYLOAD-MUST-NOT-LEAK",
  "arity-state-MUST-NOT-LEAK.json",
  "arity-state-MUST-NOT-LEAK",
  "filter-state-MUST-NOT-LEAK.json",
  "filter-state-MUST-NOT-LEAK",
  "PATH-MUST-NOT-LEAK.json",
  "PATH-MUST-NOT-LEAK",
  "DIRECTORY-MUST-NOT-LEAK",
  COMPOSED_RECIPIENT,
  DECOMPOSED_RECIPIENT,
  ...PROPOSED_AT_LITERALS,
].sort();

function collectLeakStrings(value, into) {
  if (typeof value === "string") {
    if (value.includes(LEAK_MARKER)) {
      into.add(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const element of value) {
      collectLeakStrings(element, into);
    }
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) {
      collectLeakStrings(value[key], into);
    }
  }
}

const SENSITIVE_TOKENS = (() => {
  const tokens = new Set();
  collectLeakStrings(FIXTURE_A_VALUE, tokens);
  collectLeakStrings(JSON.parse(FIXTURE_B), tokens);
  tokens.add(MALFORMED_TOKEN);

  const jsonBasenames = [ARITY_CANDIDATE_NAME, FILTER_CANDIDATE_NAME, ABSENT_CANDIDATE_NAME];
  for (const basename of [...jsonBasenames, DIRECTORY_CANDIDATE_NAME]) {
    if (basename.includes(LEAK_MARKER)) {
      tokens.add(basename);
    }
  }
  for (const basename of jsonBasenames) {
    const stem = basename.slice(0, basename.length - ".json".length);
    if (stem.endsWith(LEAK_MARKER)) {
      tokens.add(stem);
    }
  }

  tokens.add(COMPOSED_RECIPIENT);
  tokens.add(DECOMPOSED_RECIPIENT);
  for (const literal of PROPOSED_AT_LITERALS) {
    tokens.add(literal);
  }
  return [...tokens].sort();
})();

function makeTempDir(label) {
  return fs.mkdtempSync(
    path.join(os.tmpdir(), `relay-approval-status-recipient-count-${label}-`)
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

function jointMatches(status, recipient) {
  return APPROVALS.filter(
    approval => approval.status === status && approval.action.to === recipient
  );
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

test("AC1: two invocations for pending plus the target recipient each print the frozen count of two and leave Fixture A untouched", () => {
  const dir = makeTempDir("ac1");
  try {
    const fixture = writeFixture(dir, "state.json", FIXTURE_A);
    const before = snapshotFile(fixture);
    const parentBefore = entryNames(dir);

    for (const attempt of [1, 2]) {
      const result = runTool([fixture, "pending", TARGET_RECIPIENT]);

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

test("AC2: the seven frozen single-match status-and-recipient rows each print the frozen count of one in table order", () => {
  const rows = [
    ["sent-target", "sent", TARGET_RECIPIENT],
    ["rejected-target", "rejected", TARGET_RECIPIENT],
    ["blocked-target", "blocked_recipient", TARGET_RECIPIENT],
    ["sent-leading-space", "sent", LEADING_SPACE_RECIPIENT],
    ["pending-other", "pending", OTHER_RECIPIENT],
    ["pending-composed-unicode", "pending", COMPOSED_RECIPIENT],
    ["pending-one-space", "pending", SPACE_RECIPIENT],
  ];

  for (const [label, status, recipient] of rows) {
    assert.strictEqual(
      jointMatches(status, recipient).length,
      1,
      `${label}'s two filters are strictly equal to exactly one stored approval's fields`
    );
  }

  const dir = makeTempDir("ac2");
  try {
    const fixture = writeFixture(dir, "state.json", FIXTURE_A);
    const before = snapshotFile(fixture);
    const parentBefore = entryNames(dir);

    for (const [label, status, recipient] of rows) {
      const result = runTool([fixture, status, recipient]);

      assert.strictEqual(result.stderr, "", `stderr for ${label}`);
      assert.strictEqual(result.stderrBytes, 0, `stderr byte count for ${label}`);
      assert.strictEqual(result.stdout, COUNT_ONE_STDOUT, `stdout for ${label}`);
      assert.strictEqual(result.status, 0, `exit code for ${label}`);
      assert.deepStrictEqual(snapshotFile(fixture), before, `fixture bytes and stat for ${label}`);
      assert.deepStrictEqual(entryNames(dir), parentBefore, `parent entries for ${label}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AC3: the six frozen zero-match cases succeed with the frozen count of zero", () => {
  for (const [label, status, recipient] of [
    ["sent-other", "sent", OTHER_RECIPIENT],
    ["pending-leading-space", "pending", LEADING_SPACE_RECIPIENT],
  ]) {
    const recipientMatches = APPROVALS.filter(
      approval => approval.action.to === recipient
    );
    assert.strictEqual(
      recipientMatches.length,
      1,
      `${label}'s recipient matches exactly one stored approval`
    );
    const statusMatches = APPROVALS.filter(approval => approval.status === status);
    assert.strictEqual(
      statusMatches.some(approval => approval !== recipientMatches[0]),
      true,
      `${label}'s status matches at least one different approval`
    );
    assert.strictEqual(
      jointMatches(status, recipient).length,
      0,
      `no single approval matches both of ${label}'s filters`
    );
  }

  assert.strictEqual(
    APPROVALS[8].action.to,
    7,
    "Fixture A's numeric approval stores the JSON number 7 as action.to"
  );
  assert.strictEqual(
    typeof APPROVALS[8].action.to,
    "number",
    "Fixture A's numeric stored action.to is a number, not a string"
  );
  assert.strictEqual(typeof NUMERIC_RECIPIENT, "string", "the numeric query is a string");
  assert.strictEqual(NUMERIC_RECIPIENT, "7", "the numeric query is the exact string literal 7");

  for (const storedTo of STORED_ACTION_TO) {
    if (typeof storedTo === "string") {
      assert.notStrictEqual(
        Buffer.from(storedTo, "utf8").toString("hex"),
        Buffer.from(CASE_DISTINCT_RECIPIENT, "utf8").toString("hex"),
        "the case-distinct recipient is byte-distinct from every stored string action.to"
      );
    }
  }

  assert.strictEqual(
    Buffer.from(COMPOSED_RECIPIENT, "utf8").toString("hex"),
    COMPOSED_RECIPIENT_HEX,
    "the composed recipient has its frozen UTF-8 byte sequence"
  );
  assert.strictEqual(
    Buffer.from(DECOMPOSED_RECIPIENT, "utf8").toString("hex"),
    DECOMPOSED_RECIPIENT_HEX,
    "the decomposed recipient has its frozen UTF-8 byte sequence"
  );
  assert.notStrictEqual(
    COMPOSED_RECIPIENT_HEX,
    DECOMPOSED_RECIPIENT_HEX,
    "the composed and decomposed recipients are byte-distinct"
  );

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
    ["OPAQUE-OUTBOX-MUST-NOT-LEAK"],
    "Fixture B keeps its frozen opaque outbox value"
  );
  assert.strictEqual(
    fixtureBValue.metadata,
    false,
    "Fixture B keeps its frozen additional top-level metadata value"
  );

  for (const [label, contents, status, recipient] of [
    ["sent-other", FIXTURE_A, "sent", OTHER_RECIPIENT],
    ["pending-leading-space", FIXTURE_A, "pending", LEADING_SPACE_RECIPIENT],
    ["pending-case-distinct", FIXTURE_A, "pending", CASE_DISTINCT_RECIPIENT],
    ["pending-decomposed-unicode", FIXTURE_A, "pending", DECOMPOSED_RECIPIENT],
    ["blocked-numeric-string", FIXTURE_A, "blocked_recipient", NUMERIC_RECIPIENT],
    ["fixture-b-empty-approvals", FIXTURE_B, "pending", TARGET_RECIPIENT],
  ]) {
    const dir = makeTempDir(`ac3-${label}`);
    try {
      const fixture = writeFixture(dir, "state.json", contents);
      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);

      const result = runTool([fixture, status, recipient]);

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

test("AC4: wrong arity, invalid statuses, and the empty recipient fail before file access with the frozen envelopes and precedence", () => {
  assert.notStrictEqual(
    Buffer.from(UPPERCASE_STATUS, "utf8").toString("hex"),
    Buffer.from("pending", "utf8").toString("hex"),
    "direct literal PENDING is byte-distinct from valid pending"
  );

  for (const label of ["zero", "one", "two", "four"]) {
    const dir = makeTempDir(`ac4-arity-${label}`);
    try {
      const candidate = path.join(dir, ARITY_CANDIDATE_NAME);
      let args;
      if (label === "zero") {
        args = [];
      } else if (label === "one") {
        args = [candidate];
      } else if (label === "two") {
        args = [candidate, "pending"];
      } else {
        args = [candidate, "pending", TARGET_RECIPIENT, "extra"];
      }

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

  const filterCases = [
    ["empty-status", EMPTY_STATUS, TARGET_RECIPIENT, INVALID_STATUS_ERROR],
    ["uppercase-status", UPPERCASE_STATUS, TARGET_RECIPIENT, INVALID_STATUS_ERROR],
    ["unknown-status", UNKNOWN_STATUS, TARGET_RECIPIENT, INVALID_STATUS_ERROR],
    ["padded-status", PADDED_STATUS, TARGET_RECIPIENT, INVALID_STATUS_ERROR],
    ["empty-recipient", "pending", EMPTY_RECIPIENT, EMPTY_RECIPIENT_ERROR],
    ["status-before-recipient", UPPERCASE_STATUS, EMPTY_RECIPIENT, INVALID_STATUS_ERROR],
  ];

  for (const [label, status, recipient, expectedStderr] of filterCases) {
    const dir = makeTempDir(`ac4-filter-${label}`);
    try {
      const candidate = path.join(dir, FILTER_CANDIDATE_NAME);

      const result = runTool([candidate, status, recipient]);

      assert.strictEqual(result.stdout, "", `stdout for ${label}`);
      assert.strictEqual(result.stdoutBytes, 0, `stdout byte count for ${label}`);
      assert.strictEqual(result.stderr, expectedStderr, `stderr for ${label}`);
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
    const missing = path.join(missingParent, ABSENT_CANDIDATE_NAME);
    const parentBefore = entryNames(missingParent);

    const result = runTool([missing, "pending", TARGET_RECIPIENT]);

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
    const stateDirectory = path.join(directoryParent, DIRECTORY_CANDIDATE_NAME);
    fs.mkdirSync(stateDirectory);
    const before = snapshotDirectory(stateDirectory);
    const parentBefore = entryNames(directoryParent);

    const result = runTool([stateDirectory, "pending", TARGET_RECIPIENT]);

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

      const result = runTool([fixture, "pending", TARGET_RECIPIENT]);

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

test("AC7: every S1-S31 structural-invalid fixture fails with the exact invalid-state envelope after a distinctness proof", () => {
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
    "S26 freezes the direct literal PENDING status"
  );
  assert.notStrictEqual(
    Buffer.from(s26.approvals[0].status, "utf8").toString("hex"),
    Buffer.from("pending", "utf8").toString("hex"),
    "S26's PENDING bytes differ from the valid pending status bytes"
  );

  const s29 = JSON.parse(STRUCTURAL_INVALID_FIXTURES[S29_INDEX][1]);
  assert.strictEqual(
    s29.approvals[0].id,
    s29.approvals[1].id,
    "S29 freezes two approvals sharing one ID"
  );
  assert.strictEqual(
    s29.approvals[0].status,
    "pending",
    "S29's first duplicate-ID approval carries the queried status"
  );
  assert.strictEqual(
    s29.approvals[0].action.to,
    TARGET_RECIPIENT,
    "S29's first duplicate-ID approval matches the queried recipient"
  );

  const s30 = JSON.parse(STRUCTURAL_INVALID_FIXTURES[S30_INDEX][1]);
  assert.strictEqual(s30.approvals.length, 2, "S30 holds two approvals");
  assert.strictEqual(
    s30.approvals[0].action.to,
    TARGET_RECIPIENT,
    "S30's first approval matches the queried recipient"
  );
  assert.strictEqual(
    s30.approvals[0].status,
    "pending",
    "S30's first approval is a complete valid approval with the queried status"
  );
  assert.strictEqual(
    s30.approvals[1].reason,
    false,
    "S30's invalid sibling carries a boolean reason"
  );

  for (const [label, contents] of STRUCTURAL_INVALID_FIXTURES) {
    const dir = makeTempDir(`ac7-${label.toLowerCase()}`);
    try {
      const fixture = writeFixture(dir, "state.json", contents);
      const before = snapshotFile(fixture);
      const parentBefore = entryNames(dir);

      const result = runTool([fixture, "pending", TARGET_RECIPIENT]);

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
  assert.deepStrictEqual(
    SENSITIVE_TOKENS,
    EXPECTED_SENSITIVE_TOKENS,
    "the derived sensitive-token set equals the frozen expected token list"
  );

  const dir = makeTempDir("ac8");
  try {
    const fixture = writeFixture(dir, "state.json", FIXTURE_A);
    const result = runTool([fixture, "pending", TARGET_RECIPIENT]);

    assert.strictEqual(result.status, 0, "timed child completed successfully");
    assert.strictEqual(result.stdout, COUNT_TWO_STDOUT, "timed child stdout");
    assert.strictEqual(result.stderr, "", "timed child stderr");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  assert.strictEqual(fs.existsSync(TOOL), true, "the production command file exists");
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

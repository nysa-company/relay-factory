const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TOOL = path.join(__dirname, "..", "tools", "approval-job-proposed-count.js");
const TIMEOUT = 5_000;
const USAGE = "usage: node app/tools/approval-job-proposed-count.js <state-file> <job-id> <proposed-at>\n";
const CANNOT_READ = "approval-job-proposed-count: cannot read state file\n";
const NOT_JSON = "approval-job-proposed-count: state file is not valid JSON\n";
const INVALID = "approval-job-proposed-count: invalid Relay state\n";

function approval(id, jobId, proposedAt, extra = {}) {
  return {
    id,
    jobId,
    proposedAt,
    status: "pending",
    action: { to: "to", subject: "subject", body: "body" },
    ...extra,
  };
}

function state(approvals = []) {
  return { events: [], jobs: [], approvals, outbox: [] };
}

function temp(label, body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `relay-approval-job-proposed-${label}-`));
  try {
    return body(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function fixture(dir, value, name = "state.json") {
  const file = path.join(dir, name);
  fs.writeFileSync(file, typeof value === "string" ? value : `${JSON.stringify(value)}\n`);
  return file;
}

function run(args) {
  const result = spawnSync(process.execPath, [TOOL, ...args], {
    encoding: "buffer",
    timeout: TIMEOUT,
  });
  assert.strictEqual(result.error, undefined, `child error: ${result.error && result.error.message}`);
  assert.strictEqual(result.signal, null, "child must terminate without a signal");
  return {
    code: result.status,
    stdout: result.stdout.toString("utf8"),
    stderr: result.stderr.toString("utf8"),
  };
}

function snapshot(file) {
  const stat = fs.statSync(file, { bigint: true });
  return { bytes: fs.readFileSync(file).toString("hex"), size: stat.size, mtimeNs: stat.mtimeNs };
}

function assertSuccess(result, count) {
  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.stderr, "");
  assert.strictEqual(result.stdout, `{"approvalsWithJobAndProposedAt":${count}}\n`);
}

function assertFailure(result, stderr, code) {
  assert.strictEqual(result.code, code);
  assert.strictEqual(result.stdout, "");
  assert.strictEqual(result.stderr, stderr);
}

test("AC1: exactly three positional arguments emit the compact frozen success envelope", () => {
  temp("ac1", dir => {
    const file = fixture(dir, state([approval("a", "job-a", "2026-08-24T12:00:00.000Z")]));
    assertSuccess(run([file, "job-a", "2026-08-24T12:00:00.000Z"]), 1);
  });
});

test("AC2: zero, one, two, and four-or-more arguments use usage without accessing a supplied state path", () => {
  temp("ac2", dir => {
    const file = fixture(dir, "STATE-BYTES-MUST-STAY-UNCHANGED");
    const before = snapshot(file);
    for (const args of [[], [file], [file, "job"], [file, "job", "time", "extra"], [file, "job", "time", "extra", "more"]]) {
      assertFailure(run(args), USAGE, 2);
      assert.deepStrictEqual(snapshot(file), before);
    }
  });
});

test("AC3: empty job ID or proposal timestamp uses usage before state-file access", () => {
  temp("ac3", dir => {
    const file = fixture(dir, "STATE-BYTES-MUST-STAY-UNCHANGED");
    const before = snapshot(file);
    for (const args of [[file, "", "time"], [file, "job", ""]]) {
      assertFailure(run(args), USAGE, 2);
      assert.deepStrictEqual(snapshot(file), before);
    }
  });
});

test("AC4: absent and directory state paths use the frozen read-error envelope without mutation", () => {
  temp("ac4", dir => {
    const absent = path.join(dir, "absent.json");
    assertFailure(run([absent, "job", "time"]), CANNOT_READ, 1);
    assert.strictEqual(fs.existsSync(absent), false);
    const directory = path.join(dir, "state-directory");
    fs.mkdirSync(directory);
    const listing = fs.readdirSync(dir).sort();
    assertFailure(run([directory, "job", "time"]), CANNOT_READ, 1);
    assert.strictEqual(fs.statSync(directory).isDirectory(), true);
    assert.deepStrictEqual(fs.readdirSync(dir).sort(), listing);
  });
});

test("AC5: malformed JSON uses the frozen parse-error envelope and never echoes its bytes", () => {
  temp("ac5", dir => {
    const malformed = '{"secret":"MALFORMED-CONTENT-MUST-NOT-LEAK"\n';
    const file = fixture(dir, malformed);
    const result = run([file, "job", "time"]);
    assertFailure(result, NOT_JSON, 1);
    assert.strictEqual(result.stdout.includes("MALFORMED-CONTENT-MUST-NOT-LEAK"), false);
    assert.strictEqual(result.stderr.includes("MALFORMED-CONTENT-MUST-NOT-LEAK"), false);
  });
});

const INVALID_FIXTURES = (() => {
  const valid = approval("appr-a", "job-a", "time-a");
  const one = change => state([change({ ...valid, action: { ...valid.action } })]);
  return [
    ["S1", null], ["S2", []], ["S3", { events: [], jobs: [], approvals: [] }],
    ["S4", { events: {}, jobs: [], approvals: [], outbox: [] }],
    ["S5", { events: [], jobs: {}, approvals: [], outbox: [] }],
    ["S6", { events: [], jobs: [], approvals: {}, outbox: [] }],
    ["S7", { events: [], jobs: [], approvals: [], outbox: {} }],
    ["S8", state([null])], ["S9", state([[]])],
    ["S10", one(a => { delete a.id; return a; })], ["S11", one(a => ({ ...a, id: "" }))],
    ["S12", one(a => ({ ...a, id: 7 }))], ["S13", one(a => { delete a.jobId; return a; })],
    ["S14", one(a => ({ ...a, jobId: "" }))], ["S15", one(a => ({ ...a, jobId: 7 }))],
    ["S16", one(a => { delete a.action; return a; })], ["S17", one(a => ({ ...a, action: null }))],
    ["S18", one(a => ({ ...a, action: [] }))], ["S19", one(a => ({ ...a, action: { subject: "b", body: "c" } }))],
    ["S20", one(a => ({ ...a, action: { to: "a", body: "c" } }))], ["S21", one(a => ({ ...a, action: { to: "a", subject: "b" } }))],
    ["S22", one(a => { delete a.proposedAt; return a; })], ["S23", one(a => ({ ...a, proposedAt: "" }))],
    ["S24", one(a => ({ ...a, proposedAt: 7 }))], ["S25", one(a => { delete a.status; return a; })],
    ["S26", one(a => ({ ...a, status: "PENDING" }))], ["S27", one(a => ({ ...a, status: null }))],
    ["S28", state([valid, approval("appr-a", "job-b", "time-b")])],
    ["S29", state([approval("valid-first", "job-a", "time-a"), (() => { const a = approval("invalid-second", "job-b", "time-b"); delete a.proposedAt; return a; })()])],
  ];
})();

test("AC6: every frozen S1-S29 structurally-invalid state uses the invalid-state envelope without mutation", () => {
  const s26 = JSON.stringify(INVALID_FIXTURES[25][1]);
  assert.strictEqual(s26.includes('"status":"PENDING"'), true, "S26 derives a byte-distinct status value");
  assert.notStrictEqual(s26, JSON.stringify(state([approval("appr-a", "job-a", "time-a")])), "S26 differs from valid state");
  const s29 = INVALID_FIXTURES[28][1].approvals;
  assert.strictEqual(s29[0].id, "valid-first", "S29 begins with a valid approval");
  assert.strictEqual(Object.hasOwn(s29[1], "proposedAt"), false, "S29 invalid sibling lacks proposedAt");
  for (const [id, value] of INVALID_FIXTURES) {
    temp(`ac6-${id}`, dir => {
      const file = fixture(dir, value);
      const before = snapshot(file);
      assertFailure(run([file, "job-a", "time-a"]), INVALID, 1);
      assert.deepStrictEqual(snapshot(file), before, `${id} fixture is unchanged`);
    });
  }
});

test("AC7: job ID and proposed-at comparisons are exact, case-sensitive, and conjunctive", () => {
  temp("ac7", dir => {
    const file = fixture(dir, state([
      approval("exact", "Job-A", "2026-08-24T12:00:00.000Z"),
      approval("job-only", "Job-A", "2026-08-24T12:00:00Z"),
      approval("time-only", "job-a", "2026-08-24T12:00:00.000Z"),
    ]));
    assertSuccess(run([file, "Job-A", "2026-08-24T12:00:00.000Z"]), 1);
    assertSuccess(run([file, "job-a", "2026-08-24T12:00:00.000Z"]), 1);
    assertSuccess(run([file, "Job-A", "2026-08-24T12:00:00Z"]), 1);
  });
});

test("AC8: mixed matching records count only both-field matches, while zero matches, empty approvals, and unrelated fields remain successful", () => {
  temp("ac8", dir => {
    const targetJob = "job-target";
    const targetTime = "not-an-iso-time";
    const file = fixture(dir, state([
      approval("one", targetJob, targetTime, { status: "sent", reason: { any: "value" }, action: { to: null, subject: false, body: 7 } }),
      approval("two", targetJob, targetTime, { status: "rejected", reason: null }),
      approval("job-only", targetJob, "other"), approval("time-only", "other", targetTime),
    ]));
    assertSuccess(run([file, targetJob, targetTime]), 2);
    assertSuccess(run([file, "no-job", "no-time"]), 0);
    const empty = fixture(dir, state([]), "empty.json");
    assertSuccess(run([empty, targetJob, targetTime]), 0);
  });
});

test("AC9: two immediate invocations are deterministic and leave the fixture and parent listing unchanged", () => {
  temp("ac9", dir => {
    const file = fixture(dir, state([approval("a", "job", "time")]));
    const before = snapshot(file);
    const entries = fs.readdirSync(dir).sort();
    const first = run([file, "job", "time"]);
    const second = run([file, "job", "time"]);
    assertSuccess(first, 1);
    assert.deepStrictEqual(second, first);
    assert.deepStrictEqual(snapshot(file), before);
    assert.deepStrictEqual(fs.readdirSync(dir).sort(), entries);
  });
});

test("AC10: production source is offline, uses only readFileSync from node:fs, and spawned calls time out at five seconds", () => {
  assert.strictEqual(fs.existsSync(TOOL), true, "production command must exist");
  const source = fs.readFileSync(TOOL, "utf8");
  const specifiers = [...source.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)].map(match => match[1]);
  assert.deepStrictEqual(specifiers, ["node:fs"]);
  assert.deepStrictEqual([...source.matchAll(/\b(?:fs\.)?([A-Za-z]+Sync)\s*\(/g)].map(match => match[1]), ["readFileSync"]);
  for (const forbidden of ["server.js", "fetch(", "WebSocket", "node:http", "node:https", "node:net", "node:child_process", "setTimeout", "setInterval"]) {
    assert.strictEqual(source.includes(forbidden), false, `forbidden source token ${forbidden}`);
  }
  temp("ac10", dir => assertSuccess(run([fixture(dir, state([])), "job", "time"]), 0));
});

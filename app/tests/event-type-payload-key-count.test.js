const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TOOL = path.join(__dirname, "..", "tools", "event-type-payload-key-count.js");
const TIMEOUT = 5_000;
const USAGE = "usage: node app/tools/event-type-payload-key-count.js <state-file> <event-type> <payload-key>\n";
const READ_ERROR = "event-type-payload-key-count: cannot read state file\n";
const PARSE_ERROR = "event-type-payload-key-count: state file is not valid JSON\n";
const INVALID_ERROR = "event-type-payload-key-count: invalid Relay state\n";

function event(id, type, payload) {
  const value = { id, type, receivedAt: `2026-08-26T12:00:0${id.length % 10}.000Z` };
  if (arguments.length === 3) value.payload = payload;
  return value;
}

function state(events) {
  return JSON.stringify({ events, jobs: [], approvals: [], outbox: [] }, null, 2) + "\n";
}

function temp(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `relay-event-type-payload-key-${label}-`));
}

function fixture(dir, contents, name = "state.json") {
  const file = path.join(dir, name);
  fs.writeFileSync(file, contents);
  return file;
}

function snapshot(file) {
  const stat = fs.statSync(file, { bigint: true });
  return { bytes: fs.readFileSync(file).toString("hex"), mode: stat.mode, size: stat.size, mtimeNs: stat.mtimeNs };
}

function directorySnapshot(dir) {
  const stat = fs.statSync(dir, { bigint: true });
  return { entries: entries(dir), mode: stat.mode, size: stat.size, mtimeNs: stat.mtimeNs };
}

function entries(dir) {
  return fs.readdirSync(dir).sort();
}

function run(args) {
  const result = spawnSync(process.execPath, [TOOL, ...args], { stdio: "pipe", timeout: TIMEOUT });
  assert.strictEqual(result.error, undefined, result.error && result.error.message);
  assert.strictEqual(result.signal, null, `child terminated by ${result.signal}`);
  return { status: result.status, stdout: result.stdout.toString("utf8"), stderr: result.stderr.toString("utf8") };
}

function expect(result, status, stdout, stderr) {
  assert.strictEqual(result.status, status, "exit code");
  assert.strictEqual(result.stdout, stdout, "stdout");
  assert.strictEqual(result.stderr, stderr, "stderr");
}

function withFixture(label, contents, check) {
  const dir = temp(label);
  try { check(dir, fixture(dir, contents)); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const INVALID = [
  ["S1", "null\n"], ["S2", "[]\n"], ["S3", '{"events":[],"jobs":[],"approvals":[]}\n'],
  ["S4", '{"events":{},"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S5", '{"events":[],"jobs":{},"approvals":[],"outbox":[]}\n'],
  ["S6", '{"events":[],"jobs":[],"approvals":{},"outbox":[]}\n'],
  ["S7", '{"events":[],"jobs":[],"approvals":[],"outbox":{}}\n'],
  ["S8", '{"events":[null],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S9", '{"events":[[]],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S10", '{"events":[{"type":"meeting","receivedAt":"time"}],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S11", '{"events":[{"id":"","type":"meeting","receivedAt":"time"}],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S12", '{"events":[{"id":7,"type":"meeting","receivedAt":"time"}],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S13", '{"events":[{"id":"a","receivedAt":"time"}],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S14", '{"events":[{"id":"a","type":"","receivedAt":"time"}],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S15", '{"events":[{"id":"a","type":7,"receivedAt":"time"}],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S16", '{"events":[{"id":"a","type":"meeting"}],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S17", '{"events":[{"id":"a","type":"meeting","receivedAt":""}],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S18", '{"events":[{"id":"a","type":"meeting","receivedAt":null}],"jobs":[],"approvals":[],"outbox":[]}\n'],
  ["S19", '{"events":[{"id":"a","type":"meeting","receivedAt":"time"},{"id":"a","type":"email","receivedAt":"later"}],"jobs":[],"approvals":[],"outbox":[]}\n'],
];

test("AC1: exactly three arguments emit the compact one-key count JSON", () => {
  withFixture("ac1", state([event("one", "meeting", { target: 1 })]), (dir, file) => {
    const before = snapshot(file); const listing = entries(dir);
    expect(run([file, "meeting", "target"]), 0, '{"eventsWithTypeAndPayloadKey":1}\n', "");
    assert.deepStrictEqual(snapshot(file), before); assert.deepStrictEqual(entries(dir), listing);
  });
});

test("AC2: zero, one, two, and four arguments use usage before accessing a state path", () => {
  for (const [label, extra] of [["zero", []], ["one", ["candidate.json"]], ["two", ["candidate.json", "meeting"]], ["four", ["candidate.json", "meeting", "target", "extra"]]]) {
    const dir = temp(`ac2-${label}`);
    try { const candidate = path.join(dir, extra[0] || "candidate.json"); expect(run(extra.map((value, i) => i === 0 ? candidate : value)), 2, "", USAGE); assert.strictEqual(fs.existsSync(candidate), false); assert.deepStrictEqual(entries(dir), []); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});

test("AC3: empty event type or payload key uses usage before state-file access", () => {
  for (const args of [["", "target"], ["meeting", ""]]) {
    const dir = temp("ac3");
    try { const file = fixture(dir, state([event("one", "meeting", { target: 1 })])); const before = snapshot(file); expect(run([file, ...args]), 2, "", USAGE); assert.deepStrictEqual(snapshot(file), before); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});

test("AC4: absent and directory state paths return the read error without changes", () => {
  const dir = temp("ac4");
  try {
    const absent = path.join(dir, "absent.json"); expect(run([absent, "meeting", "target"]), 1, "", READ_ERROR); assert.strictEqual(fs.existsSync(absent), false);
    const directory = path.join(dir, "directory"); fs.mkdirSync(directory); const before = directorySnapshot(directory); expect(run([directory, "meeting", "target"]), 1, "", READ_ERROR); assert.deepStrictEqual(directorySnapshot(directory), before);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AC5: malformed JSON returns only the frozen parse error", () => {
  const malformed = '{"events":["MALFORMED-PAYLOAD-MUST-NOT-LEAK"\n';
  withFixture("ac5", malformed, (dir, file) => { const before = snapshot(file); const result = run([file, "meeting", "target"]); expect(result, 1, "", PARSE_ERROR); assert.strictEqual(result.stderr.includes("MALFORMED-PAYLOAD-MUST-NOT-LEAK"), false); assert.deepStrictEqual(snapshot(file), before); });
});

test("AC6: every frozen S1-S19 invalid state returns the invalid-state error unchanged", () => {
  for (const [label, contents] of INVALID) withFixture(`ac6-${label}`, contents, (dir, file) => { const before = snapshot(file); expect(run([file, "meeting", "target"]), 1, "", INVALID_ERROR); assert.deepStrictEqual(snapshot(file), before); });
});

test("AC7: event type comparison is exact and case-sensitive", () => {
  withFixture("ac7", state([event("one", "meeting", { target: true })]), (dir, file) => expect(run([file, "Meeting", "target"]), 0, '{"eventsWithTypeAndPayloadKey":0}\n', ""));
});

test("AC8: only an own key on a plain payload object matches without traversal or normalization", () => {
  const events = [
    event("own", "meeting", { target: 1 }), event("missing", "meeting", { other: 1 }), event("null", "meeting", null), event("string", "meeting", "target"), event("number", "meeting", 1), event("boolean", "meeting", true), event("array", "meeting", ["target"]), event("nested", "meeting", { nested: { target: 1 } }), event("case", "meeting", { Target: 1 }),
  ];
  withFixture("ac8", state(events), (dir, file) => expect(run([file, "meeting", "target"]), 0, '{"eventsWithTypeAndPayloadKey":1}\n', ""));
});

test("AC9: mixed matches and both frozen zero-match cases take the success path", () => {
  withFixture("ac9-mixed", state([event("one", "meeting", { target: 1 }), event("two", "meeting", { target: 2 }), event("three", "meeting", { no: 3 }), event("four", "email", { target: 4 })]), (dir, file) => expect(run([file, "meeting", "target"]), 0, '{"eventsWithTypeAndPayloadKey":2}\n', ""));
  withFixture("ac9-no-type", state([event("one", "email", { target: 1 })]), (dir, file) => expect(run([file, "meeting", "target"]), 0, '{"eventsWithTypeAndPayloadKey":0}\n', ""));
  withFixture("ac9-no-key", state([event("one", "meeting", { other: 1 })]), (dir, file) => expect(run([file, "meeting", "target"]), 0, '{"eventsWithTypeAndPayloadKey":0}\n', ""));
});

test("AC10: two immediate invocations are byte-identical and read-only", () => {
  withFixture("ac10", state([event("one", "meeting", { target: 1 })]), (dir, file) => { const before = snapshot(file); const listing = entries(dir); const first = run([file, "meeting", "target"]); const second = run([file, "meeting", "target"]); assert.strictEqual(first.stdout, second.stdout); expect(first, 0, '{"eventsWithTypeAndPayloadKey":1}\n', ""); assert.deepStrictEqual(snapshot(file), before); assert.deepStrictEqual(entries(dir), listing); });
});

test("AC11: production source stays within the frozen offline module boundary", () => {
  assert.strictEqual(fs.existsSync(TOOL), true, "production tool exists");
  if (!fs.existsSync(TOOL)) return;
  const source = fs.readFileSync(TOOL, "utf8");
  const specifiers = [...source.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)].map(match => match[1]);
  assert.deepStrictEqual(specifiers, ["node:fs"]); assert.deepStrictEqual([...source.matchAll(/\b(?:fs\.)?([A-Za-z]+Sync)\b/g)].map(match => match[1]).filter(name => name === "readFileSync"), ["readFileSync"]);
  for (const forbidden of ["server.js", "fetch(", "WebSocket", "node:http", "node:https", "node:net", "node:child_process", "setTimeout", "setInterval"]) assert.strictEqual(source.includes(forbidden), false, forbidden);
  withFixture("ac11", state([event("one", "meeting", { target: 1 })]), (dir, file) => expect(run([file, "meeting", "target"]), 0, '{"eventsWithTypeAndPayloadKey":1}\n', ""));
  const testSource = fs.readFileSync(__filename, "utf8"); assert.deepStrictEqual([...new Set([...testSource.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)].map(match => match[1]))].sort(), ["node:assert", "node:child_process", "node:fs", "node:os", "node:path", "node:test"]);
});

test("AC13: payload-absent matching-type events are valid, non-matching, and do not suppress qualifying events", () => {
  const absent = event("absent", "meeting"); assert.strictEqual(Object.hasOwn(absent, "payload"), false);
  withFixture("ac13-zero", state([absent]), (dir, file) => expect(run([file, "meeting", "target"]), 0, '{"eventsWithTypeAndPayloadKey":0}\n', ""));
  withFixture("ac13-mixed", state([absent, event("present", "meeting", { target: 1 })]), (dir, file) => expect(run([file, "meeting", "target"]), 0, '{"eventsWithTypeAndPayloadKey":1}\n', ""));
});

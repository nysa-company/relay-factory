// Acceptance tests for T-107 — factory/backend-readiness.sh (frozen contract v3).
//
// These are the failing acceptance tests written before implementation. They
// assert against the frozen contract only: the exact KIT_PIN release selection,
// the two composed non-task calls, the byte-for-byte wrapper output template,
// exit statuses, the deterministic CALL_LOG / TASK_TRACE / ENV_LOG proofs, and
// the symlink / foreign-cwd / environment-passthrough guarantees added in v3.
//
// KIT_PIN and the sealed release are not modified. Each test builds an isolated
// repo layout (its own factory/KIT_PIN) plus an isolated HOME holding a stub
// contract-test.sh at the pinned path, exactly as the frozen fixtures require.
// Until factory/backend-readiness.sh exists, every test fails at setup with a
// clear "not implemented yet" — the missing feature, not a harness defect.

const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const REPO = path.join(__dirname, "..", "..");
const REAL_SCRIPT = path.join(REPO, "factory", "backend-readiness.sh");
const FIXTURE_SHA = "1111111111111111111111111111111111111111";

const lines = (...ls) => ls.map(l => l + "\n").join("");
const tmp = prefix => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const readOr = p => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");

// ---- Frozen fixture output blocks (byte-for-byte from contract v3) ----------

const A_ADAPTER_OUT = lines(
  "[contract-test] codex: READY (local_contract_ready)",
  "[contract-test] cursor-openai: READY (local_contract_ready)",
  "[contract-test] claude-code: READY (local_contract_ready)",
  "[contract-test] cursor-anthropic: READY (local_contract_ready)",
  "[contract-test] requested adapter contracts hold",
);
const A_ROUTE_OUT = lines(
  "[contract-test] planner route: codex (primary_ready)",
  "[contract-test] spec-linter route: claude-code (primary_ready)",
  "[contract-test] requested adapter contracts hold",
);

const B_ADAPTER_OUT = lines(
  "[contract-test] codex: READY (local_contract_ready)",
  "[contract-test] claude-code: READY (local_contract_ready)",
);
const B_ADAPTER_ERR = lines(
  "[contract-test] FAIL: cursor-openai: UNAVAILABLE (fallback_disabled)",
  "[contract-test] FAIL: cursor-anthropic: UNAVAILABLE (fallback_disabled)",
  "[contract-test] One or more routes are unavailable or invalid. Fix config/auth/version before any factory run.",
);

const C_ADAPTER_OUT = lines(
  "[contract-test] cursor-openai: READY (local_contract_ready)",
  "[contract-test] cursor-anthropic: READY (local_contract_ready)",
);
const C_ADAPTER_ERR = lines(
  "[contract-test] FAIL: codex: UNAVAILABLE (test_primary_down)",
  "[contract-test] FAIL: claude-code: UNAVAILABLE (test_primary_down)",
  "[contract-test] One or more routes are unavailable or invalid. Fix config/auth/version before any factory run.",
);
const C_ROUTE_OUT = lines(
  "[contract-test] planner route: cursor-openai (primary_test_primary_down)",
  "[contract-test] spec-linter route: cursor-anthropic (primary_test_primary_down)",
  "[contract-test] requested adapter contracts hold",
);

const D_ADAPTER_OUT = lines(
  "[contract-test] claude-code: READY (local_contract_ready)",
);
const D_ADAPTER_ERR = lines(
  "[contract-test] FAIL: codex: UNAVAILABLE (test_primary_down)",
  "[contract-test] FAIL: cursor-openai: UNAVAILABLE (fallback_disabled)",
  "[contract-test] FAIL: cursor-anthropic: UNAVAILABLE (fallback_disabled)",
  "[contract-test] One or more routes are unavailable or invalid. Fix config/auth/version before any factory run.",
);
const D_ROUTE_OUT = lines(
  "[contract-test] spec-linter route: claude-code (primary_ready)",
);
const D_ROUTE_ERR = lines(
  "[contract-test] FAIL: planner route: no_ready_route_primary_test_primary_down_fallback_fallback_disabled",
  "[contract-test] One or more routes are unavailable or invalid. Fix config/auth/version before any factory run.",
);

// Frozen wrapper output template, populated with each fixture's two stdout bodies.
function wrapperOut(adapterOut, adapterExit, routeOut, routeExit, result) {
  return (
    lines("[relay-readiness] adapters=openai:codex,cursor-openai;anthropic:claude-code,cursor-anthropic") +
    adapterOut +
    lines(
      `[relay-readiness] adapter_check_exit=${adapterExit}`,
      "[relay-readiness] routes=production/openai;checking/anthropic",
    ) +
    routeOut +
    lines(
      `[relay-readiness] route_check_exit=${routeExit}`,
      `[relay-readiness] result=${result}`,
    )
  );
}

const OUT_A = wrapperOut(A_ADAPTER_OUT, 0, A_ROUTE_OUT, 0, "SAFE");
const OUT_B = wrapperOut(B_ADAPTER_OUT, 1, A_ROUTE_OUT, 0, "SAFE");
const OUT_C = wrapperOut(C_ADAPTER_OUT, 1, C_ROUTE_OUT, 0, "SAFE");
const OUT_D = wrapperOut(D_ADAPTER_OUT, 1, D_ROUTE_OUT, 1, "UNSAFE");
const ERR_B = B_ADAPTER_ERR;
const ERR_C = C_ADAPTER_ERR;
const ERR_D = D_ADAPTER_ERR + D_ROUTE_ERR;

const SPEC_A = { adapterOut: A_ADAPTER_OUT, adapterErr: "", adapterExit: 0, routeOut: A_ROUTE_OUT, routeErr: "", routeExit: 0 };
const SPEC_B = { adapterOut: B_ADAPTER_OUT, adapterErr: B_ADAPTER_ERR, adapterExit: 1, routeOut: A_ROUTE_OUT, routeErr: "", routeExit: 0 };
const SPEC_C = { adapterOut: C_ADAPTER_OUT, adapterErr: C_ADAPTER_ERR, adapterExit: 1, routeOut: C_ROUTE_OUT, routeErr: "", routeExit: 0 };
const SPEC_D = { adapterOut: D_ADAPTER_OUT, adapterErr: D_ADAPTER_ERR, adapterExit: 1, routeOut: D_ROUTE_OUT, routeErr: D_ROUTE_ERR, routeExit: 1 };

const CALL_LOG_EXPECTED = lines("--adapters codex,cursor-openai,claude-code,cursor-anthropic", "--routes");
const ENV_LOG_EXPECTED = lines(
  "caller-environment|--adapters codex,cursor-openai,claude-code,cursor-anthropic",
  "caller-environment|--routes",
);

const PIN_ERR = "backend-readiness: factory/KIT_PIN must contain exactly one lowercase 40-character SHA\n";
const UNAVAIL_ERR = "backend-readiness: pinned adapter contract check is unavailable\n";
const USAGE_ERR = "usage: factory/backend-readiness.sh\n";

// ---- Isolated fixture builders ----------------------------------------------

// Generic stub honoring the two frozen calls; logs every call and would log a
// task to TASK_TRACE on any non-frozen (task-bearing) call.
function specStub(payload) {
  return (
`#!/bin/sh
P='${payload}'
printf '%s\\n' "$*" >> "$CALL_LOG"
[ -n "$ENV_LOG" ] && printf '%s|%s\\n' "$RELAY_READINESS_SENTINEL" "$*" >> "$ENV_LOG"
case "$1" in
  --adapters) cat "$P/a.out"; cat "$P/a.err" >&2; exit "$(cat "$P/a.code")";;
  --routes) cat "$P/r.out"; cat "$P/r.err" >&2; exit "$(cat "$P/r.code")";;
  *) printf 'task\\n' >> "$TASK_TRACE"; exit 99;;
esac
`);
}

// Fixture E's link target: if ever executed it records a call and a task, so an
// empty CALL_LOG and TASK_TRACE prove the symlink was rejected before running.
const SYMLINK_TARGET =
`#!/bin/sh
printf '%s\\n' "$*" >> "$CALL_LOG"
printf 'task\\n' >> "$TASK_TRACE"
exit 0
`;

// mode: "regular" | "missing" | "nonexec" | "symlink"
function makeHome(sha, spec, mode) {
  const home = tmp("relay-t107-home-");
  const releaseDir = path.join(home, ".factory", "kits", "releases", sha, "scripts", "adapters");
  fs.mkdirSync(releaseDir, { recursive: true });
  const checkPath = path.join(releaseDir, "contract-test.sh");

  if (mode === "missing") return home; // pinned check absent entirely

  if (mode === "symlink") {
    const target = path.join(home, "real-contract-test.sh");
    fs.writeFileSync(target, SYMLINK_TARGET, { mode: 0o755 });
    fs.symlinkSync(target, checkPath);
    return home;
  }

  const payload = path.join(releaseDir, "_payload");
  fs.mkdirSync(payload, { recursive: true });
  const w = (name, val) => fs.writeFileSync(path.join(payload, name), val);
  w("a.out", spec.adapterOut); w("a.err", spec.adapterErr); w("a.code", String(spec.adapterExit));
  w("r.out", spec.routeOut); w("r.err", spec.routeErr); w("r.code", String(spec.routeExit));
  fs.writeFileSync(checkPath, specStub(payload), { mode: mode === "nonexec" ? 0o644 : 0o755 });
  return home;
}

function makeRepo(kitPin) {
  if (!fs.existsSync(REAL_SCRIPT)) {
    throw new Error(`factory/backend-readiness.sh not implemented yet at ${REAL_SCRIPT}`);
  }
  const repo = tmp("relay-t107-repo-");
  const factory = path.join(repo, "factory");
  fs.mkdirSync(factory, { recursive: true });
  const script = path.join(factory, "backend-readiness.sh");
  fs.copyFileSync(REAL_SCRIPT, script);
  fs.chmodSync(script, 0o755);
  if (kitPin !== null) fs.writeFileSync(path.join(factory, "KIT_PIN"), kitPin);
  return { repo, script };
}

function makeLogs(withEnv) {
  const dir = tmp("relay-t107-logs-");
  const logs = { dir, callLog: path.join(dir, "call.log"), taskTrace: path.join(dir, "task.trace") };
  fs.writeFileSync(logs.callLog, "");
  fs.writeFileSync(logs.taskTrace, "");
  if (withEnv) { logs.envLog = path.join(dir, "env.log"); fs.writeFileSync(logs.envLog, ""); }
  return logs;
}

function scenario({ kitPin = FIXTURE_SHA + "\n", sha = FIXTURE_SHA, spec = SPEC_A, mode = "regular", withEnv = false } = {}) {
  const { repo, script } = makeRepo(kitPin);
  const home = makeHome(sha, spec, mode);
  const logs = makeLogs(withEnv);
  const cleanup = () => [repo, home, logs.dir].forEach(d => fs.rmSync(d, { recursive: true, force: true }));
  return { repo, script, home, logs, cleanup };
}

function envFor(home, logs) {
  const env = { ...process.env, HOME: home, CALL_LOG: logs.callLog, TASK_TRACE: logs.taskTrace };
  delete env.ENV_LOG;
  delete env.RELAY_READINESS_SENTINEL;
  if (logs.envLog) { env.ENV_LOG = logs.envLog; env.RELAY_READINESS_SENTINEL = "caller-environment"; }
  return env;
}

function run(script, args, env, cwd) {
  return spawnSync(script, args, {
    cwd: cwd || path.dirname(path.dirname(script)), // repo root, unless overridden
    env,
    encoding: "utf8",
  });
}

// ---- Acceptance criteria ----------------------------------------------------

test("AC1: all adapters and primary routes ready → exit 0, exact Fixture A stdout, empty stderr", (t) => {
  const s = scenario({ spec: SPEC_A });
  t.after(s.cleanup);
  const r = run(s.script, [], envFor(s.home, s.logs));
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, OUT_A);
  assert.strictEqual(r.stderr, "");
});

test("AC2: optional fallbacks disabled but route ready → exit 0, exact Fixture B stdout+stderr", (t) => {
  const s = scenario({ spec: SPEC_B });
  t.after(s.cleanup);
  const r = run(s.script, [], envFor(s.home, s.logs));
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, OUT_B);
  assert.strictEqual(r.stderr, ERR_B);
});

test("AC3: primaries down but startup fallbacks selected → exit 0, exact Fixture C stdout+stderr", (t) => {
  const s = scenario({ spec: SPEC_C });
  t.after(s.cleanup);
  const r = run(s.script, [], envFor(s.home, s.logs));
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, OUT_C);
  assert.strictEqual(r.stderr, ERR_C);
});

test("AC4: no safe production route → exit 1, UNSAFE, exact Fixture D stdout+stderr", (t) => {
  const s = scenario({ spec: SPEC_D });
  t.after(s.cleanup);
  const r = run(s.script, [], envFor(s.home, s.logs));
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.stdout, OUT_D);
  assert.strictEqual(r.stderr, ERR_D);
});

test("AC5: exactly two ordered non-task calls and an empty task trace across Fixtures A-D", (t) => {
  for (const spec of [SPEC_A, SPEC_B, SPEC_C, SPEC_D]) {
    const s = scenario({ spec });
    t.after(s.cleanup);
    run(s.script, [], envFor(s.home, s.logs));
    const callLog = readOr(s.logs.callLog);
    assert.strictEqual(callLog, CALL_LOG_EXPECTED);
    assert.strictEqual(readOr(s.logs.taskTrace), "");
    for (const forbidden of ["T-107", "run-agent.sh", "task"]) {
      assert.ok(!callLog.includes(forbidden), `call log must not contain ${forbidden}`);
    }
  }
});

test("AC6: invalid KIT_PIN or unavailable pinned check → exit 2, no stdout, exact stderr, zero stub calls", (t) => {
  const cases = [
    { name: "missing KIT_PIN", kitPin: null, mode: "regular", err: PIN_ERR },
    { name: "multi-line KIT_PIN", kitPin: FIXTURE_SHA + "\n" + FIXTURE_SHA + "\n", mode: "regular", err: PIN_ERR },
    { name: "non-SHA KIT_PIN", kitPin: "not-a-sha\n", mode: "regular", err: PIN_ERR },
    { name: "no executable check", kitPin: FIXTURE_SHA + "\n", mode: "nonexec", err: UNAVAIL_ERR },
  ];
  for (const c of cases) {
    const s = scenario({ kitPin: c.kitPin, mode: c.mode });
    t.after(s.cleanup);
    const r = run(s.script, [], envFor(s.home, s.logs));
    assert.strictEqual(r.status, 2, c.name);
    assert.strictEqual(r.stdout, "", c.name);
    assert.strictEqual(r.stderr, c.err, c.name);
    assert.strictEqual(readOr(s.logs.callLog), "", c.name);
  }
});

test("AC7: any argument → exit 2, no stdout, usage on stderr, zero stub calls, empty task trace", (t) => {
  for (const arg of ["sentinel-task", "--routes", "T-107"]) {
    const s = scenario({ spec: SPEC_A });
    t.after(s.cleanup);
    const r = run(s.script, [arg], envFor(s.home, s.logs));
    assert.strictEqual(r.status, 2, arg);
    assert.strictEqual(r.stdout, "", arg);
    assert.strictEqual(r.stderr, USAGE_ERR, arg);
    assert.strictEqual(readOr(s.logs.callLog), "", arg);
    assert.strictEqual(readOr(s.logs.taskTrace), "", arg);
  }
});

test("AC2 (v3): symlinked pinned check rejected → exit 2, no stdout, unavailable stderr, zero stub calls, empty task trace", (t) => {
  const s = scenario({ mode: "symlink" });
  t.after(s.cleanup);
  const r = run(s.script, [], envFor(s.home, s.logs));
  assert.strictEqual(r.status, 2);
  assert.strictEqual(r.stdout, "");
  assert.strictEqual(r.stderr, UNAVAIL_ERR);
  assert.strictEqual(readOr(s.logs.callLog), "");
  assert.strictEqual(readOr(s.logs.taskTrace), "");
});

test("AC3 (v3): KIT_PIN resolved relative to the script, not caller cwd → exit 0, Fixture A stdout, two call-log lines", (t) => {
  const s = scenario({ spec: SPEC_A });
  const outsideCwd = tmp("relay-t107-cwd-");
  t.after(() => { s.cleanup(); fs.rmSync(outsideCwd, { recursive: true, force: true }); });
  const r = run(s.script, [], envFor(s.home, s.logs), outsideCwd);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, OUT_A);
  assert.strictEqual(r.stderr, "");
  assert.strictEqual(readOr(s.logs.callLog), CALL_LOG_EXPECTED);
});

test("AC4 (v3): caller environment reaches both composed calls → exit 0, ENV_LOG two sentinel lines, plus AC1/AC5", (t) => {
  const s = scenario({ spec: SPEC_A, withEnv: true });
  t.after(s.cleanup);
  const r = run(s.script, [], envFor(s.home, s.logs));
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, OUT_A);
  assert.strictEqual(r.stderr, "");
  assert.strictEqual(readOr(s.logs.callLog), CALL_LOG_EXPECTED);
  assert.strictEqual(readOr(s.logs.taskTrace), "");
  assert.strictEqual(readOr(s.logs.envLog), ENV_LOG_EXPECTED);
});

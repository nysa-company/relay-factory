# T-107 Evidence Bundle — backend-readiness operator check

## 1. What this does

Relay operators now have one command that checks all four configured AI adapters and confirms whether the production/OpenAI and checking/Anthropic routes are safe before work starts. It uses the exact sealed factory release selected by Relay and never submits a task or sends anything externally.

## 2. Review link

[Review protected PR #13](https://github.com/nysa-company/relay-factory/pull/13) — inspect the files, then use the executable commands below to confirm safe, unsafe, and invalid-setup behavior.

Preview deployment: **not applicable** — this is an internal operator CLI with no deployable UI.

## 3. Screenshots

**Not applicable.** There is no visual interface or design reference. Evidence comes from exact command output, exit status, call logs, CI, and the tests below; no screenshot was invented.

## 4. Acceptance criteria

| # | Criterion | How verified | Result |
|---|---|---|---|
| v2 AC1 | All adapters and primary routes ready: exact Fixture A output, empty stderr, exit 0 | `node --test app/tests/backend-readiness.test.js` — `AC1: all adapters and primary routes ready` | **PASS** |
| v2 AC2 | Optional fallbacks disabled while required routes remain ready: exact Fixture B streams, exit 0 | Same command — `AC2: optional fallbacks disabled but route ready` | **PASS** |
| v2 AC3 | Primaries unavailable and startup fallbacks selected: exact Fixture C streams, exit 0 | Same command — `AC3: primaries down but startup fallbacks selected` | **PASS** |
| v2 AC4 | Production has no safe route: exact Fixture D streams, `UNSAFE`, exit 1 | Same command — `AC4: no safe production route` | **PASS** |
| v2 AC5 | Exactly two ordered non-task calls; no ticket, task, runner, adapter wrapper, or task trace | Same command — `AC5: exactly two ordered non-task calls and an empty task trace across Fixtures A-D` | **PASS** |
| v2 AC6 | Missing, malformed, or multi-line pin and unavailable pinned check fail before calls with exact error and exit 2 | Same command — `AC6: invalid KIT_PIN or unavailable pinned check` | **PASS** |
| v2 AC7 | Every argument is rejected with exact usage, no calls or task trace, and exit 2 | Same command — `AC7: any argument` | **PASS** |
| v2 AC8 | README gives the exact command, four adapters, both route families, exit 0/1/2 meanings, and fallback-before-submission rule | Demo-check: `rg` matched `factory/backend-readiness.sh` and the complete explanatory sentence in `README.md` | **PASS** |
| v3 AC2 | A symlinked pinned check is rejected without execution | Same test command — `AC2 (v3): symlinked pinned check rejected` | **PASS** |
| v3 AC3 | The repository pin is used when invoked by absolute path from an unrelated directory | Same test command — `AC3 (v3): KIT_PIN resolved relative to the script, not caller cwd` | **PASS** |
| v3 AC4 | The caller environment reaches both exact calls in order | Same test command — `AC4 (v3): caller environment reaches both composed calls` | **PASS** |

Fresh evidence on PR head `adb0f6103c284071e5ae814063efcdb31489daad`:

```text
node --test app/tests/backend-readiness.test.js
tests 10, pass 10, fail 0

npm test --prefix app
tests 35, pass 35, fail 0

.github/scripts/test-immutability-check.sh
test immutability holds for app/tests/
```

Protected PR checks are green: [CI success](https://github.com/nysa-company/relay-factory/actions/runs/29417107808/job/87357902675), [test-immutability success](https://github.com/nysa-company/relay-factory/actions/runs/29417107808/job/87357902672), and Cursor Bugbot success. The reviewer verdict is **APPROVE**.

Exact kit identity also passed: `factory/KIT_PIN`, ticket `Kit-SHA`, installed kit manifest, and Relay active activation record all contain `3b63cc71609676fe5fde30a878032e999df05976`.

## 5. Risk

**Low — internal change only; no external send; no schema change.** The command reads the pinned release and runs two non-task diagnostics. A defect could report a safe route as unsafe, block an operator on invalid setup, or report unsafe infrastructure as safe; exact output/status fixtures, zero-task traces, pin validation, and CI guard those failures.

## 6. Cost

**$11.9223635 across 10 ledger attempts** at bundle time, from the canonical `factory/ledger.csv`, including the current narrator's $2.00 conservative reservation.

Attempts: planner 2, spec-linter 2, test-author 3, builder 1, reviewer 1, narrator 1. The first test-author attempt timed out; the second completed the test commit but exceeded its budget; the third was the authorized validation-only closeout.

## 7. Rollback

Revert PR #13 to restore the previous behavior. No data migration or external action needs undoing.

---

**Decision needed: approve to merge, or send back with what's wrong.**

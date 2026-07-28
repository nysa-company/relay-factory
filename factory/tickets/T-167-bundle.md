# T-167 Evidence Bundle — read one Relay job

## 1. What this does

Relay can now return one saved job together with the event that created it. If the job does not exist, Relay returns a clear “no such job” response, and either lookup leaves all saved data unchanged.

## 2. Preview link

**FAILED — required preview missing.** No PR number or preview deploy URL was supplied or recorded for T-167, and this run does not have the trusted `FACTORY_DEV_PRLESS_EVIDENCE_V1` marker. This bundle is **not approvable** and must go back to the Builder for a working PR preview.

**What to try once provided:** open `GET /api/jobs/job-event-job-detail` on the preview and confirm it returns the complete job and its creating event; then request `GET /api/jobs/job-missing` and confirm the exact `404` response is `{"error":"no such job"}`.

## 3. Screenshots

**FAILED — required preview evidence missing.** No captures from a PR preview were supplied. Although this ticket changes a backend HTTP API rather than a visual interface, the normal production lane still requires evidence from the preview deploy; capture both the successful job-detail response and the exact missing-job `404` response before merge.

There is no product design reference or changed visual UI to compare.

## 4. Acceptance criteria

| # | Criterion | How verified | Result |
|---|---|---|---|
| AC1 | The known job returns `200` JSON containing exactly the complete stored `job` and related `event` | `AC1: GET /api/jobs/job-event-job-detail returns 200 JSON with exactly {job,event}...` in `app/tests/job-detail.test.js` | **PASS** |
| AC2 | An unknown job returns `404` JSON exactly equal to `{"error":"no such job"}` | `AC2: GET /api/jobs/job-missing returns 404 JSON...` in `app/tests/job-detail.test.js` | **PASS** |
| AC3 | Both lookups leave public and persisted state unchanged, with empty approvals and outbox | `AC3: /api/state snapshot and state.json bytes are unchanged...` in `app/tests/job-detail.test.js` | **PASS** |
| AC4 | Tests precede implementation and each role stayed within its frozen file boundary | Git history: test commit `3766e00` precedes builder commit `edc10f8`; per-commit file diffs and the immutability check passed | **PASS** |
| AC5 | Full application tests and test-immutability check both exit `0` | Fresh bundle run: `npm test --prefix app` → 38/38 pass; `.github/scripts/test-immutability-check.sh` → exit `0` | **PASS** |

**Overall evidence gate: FAILED.** The acceptance checks pass locally, but no PR preview, preview captures, PR number, or protected PR CI result is available. Local checks do not replace the required production PR-preview evidence.

## 5. Risk

**Low — internal change; no external send; no schema change.** A defect could return the wrong job or event, expose extra data, mishandle an unknown ID, or accidentally alter saved state. Exact response and before/after state tests guard those cases, but the missing preview means the deployed behavior has not been verified.

## 6. Cost

**$12.00 across 6 ledger attempts**, from T-167’s effective runtime-ledger entries, including the current narrator’s $2.00 conservative reservation.

Attempts: planner 1, spec-linter 1, test-author 1, builder 1, reviewer 1, narrator 1.

## 7. Rollback

**FAILED — PR number unavailable.** The required rollback binding cannot be finalized until the PR exists; once assigned, “revert PR #N restores the previous behavior.”

---

**Approve to merge, or send back with what's wrong?**

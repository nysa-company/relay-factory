# T-169 Evidence Bundle — read one Relay sandbox outbox receipt

## 1. What this does

Relay can now look up one saved sandbox delivery receipt by its approval ID. Looking up a receipt does not change saved information, create another receipt, or send anything outside Relay; an unknown ID returns a clear not-found response.

## 2. Preview link

**FAILED — [PR #60](https://github.com/nysa-company/relay-factory/pull/60) has no supplied or recorded preview deploy URL.** This run does not have the trusted `FACTORY_DEV_PRLESS_EVIDENCE_V1` marker, so local backend evidence cannot replace the required PR preview.

**What to try once provided:** request `/api/outbox/appr-outbox-detail` and confirm the saved “Receipt detail” receipt is returned, then request `/api/outbox/appr-missing` and confirm Relay says there is no such outbox receipt.

The missing required preview makes this bundle **not approvable** and sends it back to the Builder.

## 3. Screenshots

**FAILED — required preview evidence missing.** No captures from a PR preview were supplied. The frozen contract has no visual interface or design reference, but the production evidence lane still requires preview captures of the successful receipt response and the exact not-found response before merge.

## 4. Acceptance criteria

| # | Criterion | How it was verified | Result |
|---|---|---|---|
| AC1 | A known approval ID returns the second saved receipt, unchanged, with a successful JSON response and no extra wrapper fields. | Fresh targeted run: `AC1: GET /api/outbox/appr-outbox-detail returns 200 with exactly the sandbox envelope around the stored second receipt` passed. | **PASS** |
| AC2 | An unknown approval ID returns the exact not-found JSON response. | Same fresh targeted run: `AC2: GET /api/outbox/appr-missing returns 404 with exactly the no-such-receipt error body` passed. | **PASS** |
| AC3 | Successful and missing lookups are read-only, and repeating a successful lookup returns the same receipt. | Same fresh targeted run: `AC3: both detail-route branches are read-only — state snapshot unchanged and repeated reads return the same receipt` passed. | **PASS** |
| AC4 | Tests precede implementation; role file boundaries and factory controls are preserved; all required checks pass. | Reviewer round 7 approved the reviewed content. Fresh runs: targeted **3/3 passed**; `npm test --prefix app` **44/44 passed**; `BASE_REF=origin/main .github/scripts/test-immutability-check.sh` reported test immutability holds. The branch diff has no package, lockfile, `factory/KIT_PIN`, or Factory control-script change. | **PASS** |

**Overall evidence gate: FAILED.** PR #60 points at branch SHA `a55ef1c` and contains reviewer round 7's approved SHA `34f0309`, but no preview URL, preview captures, or protected hosted CI result was available to this run. Local checks do not replace the required production PR-preview evidence.

## 5. Risk

**Low — internal change; no external send; no schema change.** A defect could return the wrong saved receipt, expose extra saved information, mishandle an unknown ID, or change state during a lookup. Exact-response and before/after-state tests guard those cases, but missing preview evidence leaves deployed behavior unverified.

## 6. Cost

**$36.00 across 19 attempts** from T-169's entries in the effective `factory/runtime-ledger.csv`, including this Narrator's $2.00 reservation.

Attempts: planner 1, spec-linter 1, test-author 5, builder 1, reviewer 8, narrator 3. This count includes the zero-cost reviewer launch attempt recorded by the ledger.

## 7. Rollback

Revert PR #60 restores the previous behavior.

---

**Approve to merge, or send back with what's wrong?**

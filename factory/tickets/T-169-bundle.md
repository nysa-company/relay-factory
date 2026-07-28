# T-169 Evidence Bundle — read one Relay sandbox outbox receipt

## 1. What this does

Relay can now look up one saved sandbox delivery receipt by its approval ID. Looking up a receipt does not change saved information, create another receipt, or send anything outside Relay; an unknown ID returns a clear not-found response.

## 2. Preview link

**FAILED — required preview missing.** No PR number, preview deploy URL, or preview CI result was supplied or recorded for T-169. This run does not have the trusted `FACTORY_DEV_PRLESS_EVIDENCE_V1` marker, so the backend-only development exception does not apply; this bundle is **not approvable** and must go back to the Builder for a working PR preview.

**What to try once provided:** request `/api/outbox/appr-outbox-detail` and confirm the saved “Receipt detail” receipt is returned, then request `/api/outbox/appr-missing` and confirm Relay says there is no such outbox receipt.

## 3. Screenshots

**FAILED — required preview evidence missing.** No captures from a PR preview were supplied. The frozen contract has no visual interface or design reference, but the production evidence lane still requires preview captures of the successful receipt response and the exact not-found response before merge.

## 4. Acceptance criteria

| Criterion | How it was verified | Result |
|---|---|---|
| 1. A known approval ID returns the second saved receipt, unchanged, with a successful JSON response and no extra wrapper fields. | `AC1: GET /api/outbox/appr-outbox-detail returns 200 with exactly the sandbox envelope around the stored second receipt` in `app/tests/outbox-detail.test.js`; fresh full-suite run passed. | **PASS** |
| 2. An unknown approval ID returns the exact not-found JSON response. | `AC2: GET /api/outbox/appr-missing returns 404 with exactly the no-such-receipt error body`; fresh full-suite run passed. | **PASS** |
| 3. Successful and missing lookups are read-only, and repeating a successful lookup returns the same receipt. | `AC3: both detail-route branches are read-only — state snapshot unchanged and repeated reads return the same receipt`; fresh full-suite run passed. | **PASS** |
| 4. Tests precede implementation; role file boundaries and factory controls are preserved; all required checks pass. | Reviewer round 5 approved current branch content. Fresh evidence run: `npm test --prefix app` passed 41/41; `BASE_REF=origin/main .github/scripts/test-immutability-check.sh` exited 0; the branch diff has no package, lockfile, `factory/KIT_PIN`, or Factory control-script change. | **PASS** |

**Overall evidence gate: FAILED.** Reviewer round 5 approved the current branch and every frozen acceptance criterion passes locally, but there is no PR preview, preview capture, PR number, or protected CI result. Local checks do not replace the required production preview evidence.

## 5. Risk

**Internal change — low risk; no external send; no schema change.** A defect could return the wrong saved receipt, expose extra saved information, mishandle an unknown ID, or change state during a lookup. Exact response and before/after state tests guard those cases, but the missing preview means the deployed behavior has not been verified.

## 6. Cost

The effective runtime ledger records **$28.00 across 14 attempts**, including the current Narrator reservation: Planner 1, Spec Linter 1, Test Author 4, Builder 1, Reviewer 5, and Narrator 2.

## 7. Rollback

**FAILED — PR number unavailable.** The rollback binding cannot be finalized until the PR exists; once assigned, “revert PR #N restores the previous behavior.”

Approve to merge, or send back with what's wrong?

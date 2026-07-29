# T-168 Evidence Bundle — read one Relay approval

## 1. What this does

Relay can now return one stored approval together with the stored job that produced it. Looking up an unknown approval gives a clear not-found response, and neither lookup changes stored data.

## 2. Preview link

**FAILED — [PR #61](https://github.com/nysa-company/relay-factory/pull/61) has no supplied or recorded preview deploy URL.** This run does not have the trusted `FACTORY_DEV_PRLESS_EVIDENCE_V1` marker, so local backend evidence cannot replace the required PR preview.

**What to try once provided:** request `GET /api/approvals/appr-approval-detail` and confirm it returns the approval with job `job-approval-detail`; then request `GET /api/approvals/appr-missing` and confirm the exact `404` response is `{"error":"no such approval"}`.

The missing required preview makes this bundle **not approvable** and sends it back to the Builder.

## 3. Screenshots

**FAILED — required preview evidence missing.** No response captures from the PR preview were supplied. Capture the successful approval-detail response and the exact missing-approval `404` response before merge.

This backend HTTP API has no changed visual UI or product design reference to compare, but without the trusted development marker that does not waive normal PR-preview evidence.

## 4. Acceptance criteria

| # | Criterion | How verified | Result |
|---|---|---|---|
| AC1 | A known approval returns `200` JSON containing exactly the stored approval and related job, with no extra keys. | Fresh `node --test app/tests/approval-detail.test.js` run: named AC1 test passed. | **PASS** |
| AC2 | An unknown approval returns `404` JSON exactly equal to `{"error":"no such approval"}`. | Same fresh targeted run: named AC2 test passed. | **PASS** |
| AC3 | Successful and unknown-ID reads leave the complete state response and `state.json` bytes unchanged. | Same fresh targeted run: named AC3 test passed. | **PASS** |
| AC4 | Complete acceptance tests precede implementation, and each stage changes only its permitted file. | Commit graph and per-commit diffs: test commit `6efcb37` changes only `app/tests/approval-detail.test.js` and precedes implementation commit `27c7294`, which changes only `app/server.js`; `app/package.json` is unchanged. | **PASS** |
| AC5 | Targeted tests, full regression, and test immutability each exit `0`. | Fresh runs: targeted **3/3 passed**; `npm test --prefix app` **41/41 passed**; `BASE_REF=origin/main .github/scripts/test-immutability-check.sh` reported test immutability holds. | **PASS** |

**Overall evidence gate: FAILED.** Reviewer round 4 approved the code, PR #61 points at reviewed SHA `5c1615a`, and its merge ref exists against current `origin/main`. However, no preview URL, preview captures, or protected hosted CI result was available to this run. Local checks do not replace the required production PR-preview evidence.

## 5. Risk

**Low — internal change; no external send; no schema change.** A defect could return the wrong approval or job, expose extra stored fields, mishandle an unknown ID, or alter state during a read. Exact-response and byte-immutability tests guard these cases, but missing preview evidence leaves deployed behavior unverified.

## 6. Cost

**$38.00 across 27 attempts** from T-168's entries in the effective `factory/runtime-ledger.csv`, including this narrator's $2.00 reservation.

Attempts: planner 1, spec-linter 1, test-author 3, builder 1, reviewer 19, narrator 2. This count includes zero-cost launch attempts recorded by the ledger.

## 7. Rollback

Revert PR #61 restores the previous behavior.

---

**Approve to merge, or send back with what's wrong?**

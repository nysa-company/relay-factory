# T-168 Evidence Bundle — read one Relay approval

## 1. What this does

Relay can now return one stored approval together with the stored job that produced it. Looking up an unknown approval gives a clear not-found response, and neither lookup changes stored data.

## 2. Preview link

**FAILED — no preview deploy URL was supplied.** The trusted `FACTORY_DEV_PRLESS_EVIDENCE_V1` marker is not present, so backend-only development evidence cannot replace the required PR preview. Once a preview is available, try a known approval ID and an unknown ID; the first should return the approval and related job, while the second should say that no such approval exists.

This missing required preview makes the bundle **not approvable** and must go back to the Builder.

## 3. Screenshots

**Not applicable — backend-only contract.** This change has no browser or visual surface and no design reference, so there is no changed screen to capture.

## 4. Acceptance criteria

| # | Criterion | How verified | Result |
|---|---|---|---|
| AC1 | A known approval returns `200`, JSON, exactly the stored approval and related job, with no extra keys. | `node --test app/tests/approval-detail.test.js` — `AC1: GET /api/approvals/appr-approval-detail...`; fresh run passed. | **PASS** |
| AC2 | An unknown approval returns `404`, JSON, and exactly `{"error":"no such approval"}`. | Same command — `AC2: GET /api/approvals/appr-missing...`; fresh run passed. | **PASS** |
| AC3 | Successful and unknown-ID reads leave the complete state response and `state.json` bytes unchanged. | Same command — `AC3: GET /api/state and <DATA_DIR>/state.json bytes are unchanged...`; fresh run passed. | **PASS** |
| AC4 | Acceptance tests precede implementation and each stage changes only its permitted file. | Commit graph and diffs: `468c56e` changes only `app/tests/approval-detail.test.js` and precedes `1635c49`, which changes only `app/server.js`. `app/package.json`, dependencies, existing tests, and Factory controls are untouched by those stages. | **PASS** |
| AC5 | Targeted tests, full regression, and test immutability each exit `0`. | Fresh runs: targeted **3/3 pass**; `npm test --prefix app` **38/38 pass**; `.github/scripts/test-immutability-check.sh` reports test immutability holds. | **PASS** |
| Evidence gate | The approved PR must provide a working preview deploy before operator approval. | No PR number, preview deploy URL, or trusted PR-less marker was supplied. | **FAIL** |

Reviewer round 1 returned **APPROVE**, but the missing preview evidence remains a publication blocker.

## 5. Risk

**Low — internal change; no external send; no schema change.** A defect could return the wrong approval or job, expose extra stored fields, mishandle an unknown ID, or alter state during a read; the exact-response and byte-immutability tests guard these failures.

## 6. Cost

**$12.00 across 6 attempts** from this ticket's entries in the effective `factory/runtime-ledger.csv`, including the current narrator reservation.

Attempts: planner 1, spec-linter 1, test-author 1, builder 1, reviewer 1, narrator 1.

## 7. Rollback

**Blocked pending PR creation:** no exact PR number was supplied. Once created, reverting that PR restores the previous behavior; there is no migration or external action to undo.

---

**Approve to merge, or send back with what's wrong?**

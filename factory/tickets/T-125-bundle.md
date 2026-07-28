# T-125 Evidence Bundle — read one sandbox outbox receipt

**Bundle status: NOT APPROVABLE — the required preview deployment evidence is missing. Send this back to the Builder for a working preview and preview evidence.**

## 1. What this does

Relay can now retrieve one already-created sandbox receipt by its approval ID, without downloading all Relay state. Looking up a receipt does not approve anything, create another receipt, or send anything.

## 2. Preview link

**FAIL — no preview deploy URL was supplied for [PR #45](https://github.com/nysa-company/relay-factory/pull/45), and the trusted `FACTORY_DEV_PRLESS_EVIDENCE_V1` marker is not present.**

**What to try once the preview exists:** create and approve the `outbox-detail-existing` fixture, then request `GET /api/outbox/appr-outbox-detail-existing`; it must return the one stored sandbox receipt, including its unchanged `sentAt` value.

## 3. Screenshots

**FAIL — no changed-behavior evidence was captured from a PR preview.** This contract adds a backend HTTP endpoint and no UI or design reference, but without the trusted development marker its preview evidence cannot be marked not applicable. Capture the successful preview response and both `404` responses for the missing and still-pending approval IDs.

## 4. Acceptance criteria

| # | Criterion | How verified | Result |
|---|---|---|---|
| 1 | An approved existing receipt returns `200`, JSON, and exactly the stored sandbox receipt with its original `sentAt`. | `node --test app/tests/outbox-detail.test.js` — test 1, fresh run on reviewed SHA `d969bdb5f5dda1a86d1d4b525e670b7cbde57755` | **PASS** |
| 2 | A missing approval ID returns `404`, JSON, and exactly `{"error":"no such outbox receipt"}`. | Same command — test 2 | **PASS** |
| 3 | A pending approval with no receipt returns the same exact `404` response. | Same command — test 3 | **PASS** |
| 4 | Repeated successful and unsuccessful reads leave in-memory state and persisted `state.json` bytes unchanged. | Same command — test 4 compares full state and file bytes before and after all four reads | **PASS** |
| 5 | Test and implementation commits obey file/order boundaries; package, existing tests, and Factory controls remain unchanged; required verification exits `0`. | Git commit/path checks; `npm test --prefix app` → 39/39 pass; `BASE_REF=main .github/scripts/test-immutability-check.sh` → exit `0` | **PASS** |

Targeted verification: `node --test app/tests/outbox-detail.test.js` → **4/4 pass**. Reviewer round 1 verdict: **APPROVE**.

Protected PR CI results were not supplied and could not be read anonymously from the private repository. The command results above are fresh repository-local runs, not claimed CI results.

## 5. Risk

**Low — internal change; no external send; no schema change.** A defect could return the wrong receipt, expose a pending approval as a receipt, or mutate persisted state during a read. Exact response-shape, missing/pending, repeated-read, full-state, and file-byte tests passed; the missing preview remains the release blocker.

## 6. Cost

**$12.00 across 6 ledger attempts** at bundle time, from the effective runtime ledger, including the current Narrator's $2.00 conservative reservation.

Attempts: planner 1, spec-linter 1, test-author 1, builder 1, reviewer 1, narrator 1.

## 7. Rollback

Revert PR #45 to restore the previous behavior.

---

**Approve to merge, or send back with what's wrong?**

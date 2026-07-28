# T-166 Evidence Bundle — read one Relay event

> **Development-only evidence — not a production attestation.** This isolated
> PR-less lane has no GitHub PR, deploy, or network. The trusted publication
> gate must bind the exact PR and resolve normal publication checks before
> merge.

## 1. What this does

Relay can now return one stored event together with the job created for it,
without making callers download all Relay state. Asking for an event that does
not exist returns a clear error, and neither kind of request changes stored
data.

## 2. Preview

Not applicable — backend-only contract

The frozen contract adds only an HTTP API and explicitly has no browser or
visual surface. **What to try:** request the known fixture event and then an
unknown event; confirm the known event returns its related job, the unknown
event returns `{"error":"no such event"}`, and stored state remains unchanged.

## 3. Screenshots

Not applicable — backend-only contract

There is no changed page, browser view, or design reference to capture.
Reviewer-approved focused API evidence checks the exact response bytes and
both the in-memory and on-disk state snapshots.

## 4. Acceptance criteria

The reviewer approved the deterministic evidence at reviewed head `8cf4a11`.
The later reconciliation commit changed only the ticket record. Per the
trusted development-lane instruction, this Narrator did not rerun those
commands.

| # | Criterion | How verified | Result |
|---|---|---|---|
| 1 | The known fixture event returns HTTP 200, JSON, exactly the frozen `event` and `job` response, with the job linked to that event. | `node --test app/tests/event-detail.test.js` — `1. GET /api/events/evt-detail-001 returns 200 JSON with exactly the frozen {event,job} body`; reviewer reported the focused tests and all 38 app tests passing. | **PASS** |
| 2 | An unknown event returns HTTP 404, JSON, and exactly `{"error":"no such event"}`. | Same focused suite — `2. GET /api/events/evt-detail-missing returns 404 JSON with exact body {"error":"no such event"}`; reviewer confirmed the byte-for-byte assertion passed. | **PASS** |
| 3 | One successful lookup and one unknown-event lookup leave both Relay state and `state.json` bytes unchanged. | Same focused suite — `3. one successful and one unknown-event detail request leave /api/state and state.json bytes unchanged`; reviewer confirmed both snapshots passed. | **PASS** |
| 4 | Acceptance tests were committed before implementation, with the required file boundaries and no dependency or Factory-control drift by Test-author or Builder. | Git inspection: test commit `9cf08ff` adds only `app/tests/event-detail.test.js` and precedes implementation commit `27d38ec`, which changes only `app/server.js`; no package, lockfile, or `factory/KIT_PIN` change. The reviewer also reported `.github/scripts/test-immutability-check.sh` passing. | **PASS** |

Reviewer result: **APPROVE**. Existing evidence reports the focused 3 tests
passing, the full app suite at **38 passed / 0 failed**, and test immutability
holding. This development bundle has no PR CI result; trusted publication owns
the production PR and required checks.

## 5. Risk

**Low — internal change only; no external send; no schema change.** A defect
could return the wrong event or job, mishandle an unknown ID, or accidentally
change stored state during a read. Exact-response, relationship, error, and
before/after state checks cover those failures.

## 6. Cost

**$12.00 across 6 ledger attempts** from the effective runtime ledger,
including this Narrator's $2.00 reservation.

Attempts: planner 1, spec-linter 1, test-author 1, builder 1, reviewer 1,
narrator 1.

## 7. Rollback

Revert the eventual publication PR to restore the previous behavior; there is
no data migration or external action to undo.

---

**Approve to merge, or send back with what's wrong?**

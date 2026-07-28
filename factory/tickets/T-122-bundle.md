# T-122 Evidence Bundle — read one Relay event

## 1. What this does

Relay operators can now look up one accepted event by its ID and see both the
event and the job created for it. An unknown ID gets a clear error, and neither
kind of lookup changes Relay's saved state.

## 2. Preview link

**FAILED — the required preview deploy is missing.** [PR #43](https://github.com/nysa-company/relay-factory/pull/43)
points to the reviewed commit, but no preview deploy URL was supplied. The
trusted `FACTORY_DEV_PRLESS_EVIDENCE_V1` marker is also absent, so this
backend-only HTTP contract cannot use the development-only N/A form.

**What to try once the Builder supplies the preview:** request
`GET /api/events/evt-detail-001` against the seeded preview and confirm it
returns the event with `job-evt-detail-001`; then request
`GET /api/events/evt-missing` and confirm the exact "no such event" response.

This evidence bundle is **NOT APPROVABLE** until the required preview works.

## 3. Screenshots

**FAILED — changed-behavior evidence could not be captured because the required
preview is missing.** This contract has no browser or visual interface, but
without the trusted development marker that does not waive production
PR-preview evidence. No screenshot or response transcript was invented.

## 4. Acceptance criteria

| # | Criterion | How verified | Result |
|---|---|---|---|
| AC1 | The frozen event ID returns `200`, JSON, and exactly the stored event plus its related job. | Fresh `npm test --prefix app`: `1. GET /api/events/evt-detail-001 with the frozen fixture returns 200, application/json, and exactly the frozen {event, job} response` | **PASS** |
| AC2 | The frozen missing ID returns `404`, JSON, and exactly `{"error":"no such event"}`. | Fresh `npm test --prefix app`: `2. GET /api/events/evt-missing with the frozen fixture returns 404, application/json, and exactly {"error":"no such event"}` | **PASS** |
| AC3 | A successful and a missing-event lookup leave both public and saved state unchanged. | Fresh `npm test --prefix app`: `3. After one successful lookup and one unknown-event lookup, /api/state and the DATA_DIR/state.json bytes are unchanged` | **PASS** |
| AC4 | Tests precede implementation; implementation changes only `app/server.js`; dependencies and factory paths stay within the frozen boundary. | Git history shows test commit `f697768` before implementation commit `c0b87b6`; `.github/scripts/test-immutability-check.sh` passed; branch diff confirms `app/package.json` is unchanged. | **PASS** |

Fresh local verification on reviewed head
`c92e671734bd1c0b68fdaae9a628327e11668b84` passed **38/38** application
tests and the test-immutability check. Reviewer round 1 recorded **APPROVE**.

**FAILED evidence gate:** remote CI results were not supplied in readable form,
and the required preview deploy is missing. Local verification does not replace
either required publication input.

## 5. Risk

**Low — internal change; no external send; no schema change.** A defect could
return the wrong event or job, expose an unexpected response shape, or mutate
saved state during a lookup. Exact response and before/after state tests guard
those failures, but the missing preview prevents production-like confirmation.

## 6. Cost

**$12.00 across 6 ledger attempts** at bundle time, from the effective
`factory/runtime-ledger.csv`, including the current narrator's $2.00
conservative reservation.

Attempts: planner 1, spec-linter 1, test-author 1, builder 1, reviewer 1,
narrator 1.

## 7. Rollback

Revert PR #43 to restore the previous behavior.

---

**Decision needed: approve to merge, or send back with what's wrong.**

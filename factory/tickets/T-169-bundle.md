# T-169 Development-only Evidence Bundle — not a production attestation

## What this does

Relay can now look up one saved sandbox delivery receipt by its approval ID. Looking up a receipt does not change saved information, create another receipt, or send anything outside Relay; an unknown ID returns a clear not-found response.

## Preview

Not applicable — backend-only contract. This frozen change has no browser or visual surface, and this isolated development lane has no PR or deploy.

What to try at publication: request `/api/outbox/appr-outbox-detail` and confirm the saved “Receipt detail” receipt is returned, then request `/api/outbox/appr-missing` and confirm the not-found response.

## Screenshots

Not applicable — backend-only contract. The frozen contract explicitly makes no UI, markup, or selector changes. Reviewer-approved automated evidence verifies the exact success and not-found responses and proves that both lookups leave all saved state unchanged.

## Acceptance criteria

| Criterion | How it was verified | Result |
|---|---|---|
| 1. A known approval ID returns the second saved receipt, unchanged, with a successful JSON response and no extra wrapper fields. | `AC1: GET /api/outbox/appr-outbox-detail returns 200 with exactly the sandbox envelope around the stored second receipt` in `app/tests/outbox-detail.test.js`; independently checked by Reviewer round 1. | PASS |
| 2. An unknown approval ID returns the exact not-found JSON response. | `AC2: GET /api/outbox/appr-missing returns 404 with exactly the no-such-receipt error body`; independently checked by Reviewer round 1. | PASS |
| 3. Successful and missing lookups are read-only, and repeating a successful lookup returns the same receipt. | `AC3: both detail-route branches are read-only — state snapshot unchanged and repeated reads return the same receipt`; independently checked by Reviewer round 1. | PASS |
| 4. Tests were committed before implementation; role file boundaries and factory controls were preserved; all required checks pass. | Reviewer confirmed test commit `7d1fea0` precedes implementation commit `3c7da45`, checked the changed-file boundaries, and recorded `npm test --prefix app` at 38/38 passing plus `.github/scripts/test-immutability-check.sh` exiting 0. | PASS |

Reviewer round 1 approved the ticket. In this development-only lane there is no PR CI run; the trusted publication gate must run its broad deterministic checks before merge.

## Risk

**Internal change — low risk.** There is no external send and no schema change. The worst plausible failure is returning the wrong saved receipt or changing state during a lookup; exact receipt-selection and before/after state tests guard against both.

## Cost

The effective runtime ledger records **$12.00 across 6 attempts**: one each for Planner, Spec Linter, Test Author, Builder, Reviewer, and Narrator. Each row uses a conservative $2.00 reservation, including the current Narrator attempt.

## Rollback

Revert the later T-169 publication PR to restore the previous behavior.

Approve to merge, or send back with what's wrong?

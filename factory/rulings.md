# Relay product rulings

- 2026-07-28 — Detail-route envelopes and concurrent ownership (T-162 through
  T-165): successful detail responses are exactly
  `{"event":<stored event>,"job":<stored related job>}` for
  `GET /api/events/:id`,
  `{"job":<stored job>,"event":<stored related event>}` for
  `GET /api/jobs/:id`, and
  `{"approval":<stored approval>,"job":<stored related job>}` for
  `GET /api/approvals/:id`. The outbox response remains the ticket's exact
  `{"sandbox":true,"receipt":<stored outbox item>}` shape. These four additive
  routes may concurrently declare Builder ownership of `app/server.js`;
  protected publication remains serialized, and each later branch refreshes
  from current protected main before merge.

- 2026-08-10 — T-178 verification: keep the Factory-owned `ticket/T-178`
  branch. Its pre-merge acceptance checks are exactly the targeted job-inspect
  test, the full app suite, and immutability. Repository baseline checks remain
  protected-CI controls and must not be added to T-178's frozen contract.

- 2026-08-27 — Commit-reorder execution ownership (T-287, applying the
  T-104 precedent): when closing a `test-immutability-check.sh`
  test-before-implementation ordering finding requires reordering a branch's
  existing commits (preserving each commit's authored diff and message),
  executing that reorder is an operator action, not a Test-author or Builder
  action — both roles are append-only and forbidden from rebase, reset,
  amend, or other authenticated-history rewrites. Contracts must not assign
  `FIX-OWNER: test-author` (or `builder`) to a finding whose only remedy is a
  history rewrite; state the reorder as an operator-authorized step instead.

- 2026-08-27 — Test-immutability ordering is defined by the pinned gate
  script, not a separate literal whole-history reading (T-287): once
  `.github/scripts/test-immutability-check.sh` recognizes frozen-contract
  epochs (commit `2da67f6`, "fix: recognize frozen contract epochs in test
  gate (#275)", operator-authored), a passing run of that script — the sole
  gate named by `factory/PROJECT.env`'s `DONE_REQUIRED_CHECKS=ci,test-immutability`
  — is the complete definition of "test commits precede implementation
  commits" for a ticket's contract. Contracts must not layer an additional,
  stricter whole-branch-order sub-requirement on top of what the pinned
  script computes; a passing run needs no further operator-executed history
  reorder.

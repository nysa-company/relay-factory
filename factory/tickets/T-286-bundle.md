# T-286 Evidence Bundle — count outbox entries by referenced job status, offline

## 1. What this does

Adds a small command-line tool that answers one question about a saved Relay
state file: "how many outbox entries were sent for a job currently in status
X?" It reads a state snapshot from disk, checks it's well-formed, and prints
a single count — no network calls, no server, nothing sent anywhere.

## 2. Preview link

Not applicable — nonvisual PR. This ticket's entire product diff is a new
CLI tool (`app/tools/outbox-job-status-count.js`) and its test file
(`app/tests/outbox-job-status-count.test.js`), both under the repository's
declared `NONVISUAL_PATHS` policy (`factory/PROJECT.env`). There is no
server route, UI, or deploy surface to preview. The offline behavior —
argument validation, fixed error envelopes, seven-rule state validation, and
exact-match counting — is covered by [PR #273 at exact head
`bdb695af46490986d8f81b39e2eaa27bfab27d0`](https://github.com/nysa-company/relay-factory/pull/273),
which Reviewer round 2 approved after inspecting the implementation against
the frozen contract, and every configured required GitHub check passed
against that same head.

## 3. Screenshots

Not applicable — nonvisual PR. No visual surface exists for this change; see
§2 for the trusted evidence path (PR + Reviewer + protected CI) covering the
offline behavior instead.

## 4. Acceptance criteria

| # | Criterion | How verified | Result |
|---|---|---|---|
| AC1 | Command emits compact JSON with exactly one `outboxEntriesForJobStatus` key | Reviewer round 2 inspection + `outbox-job-status-count.test.js` (AC1 case) | **PASS** |
| AC2 | Exact, case-sensitive status match; every entry resolves outbox→approval→job; duplicates/missing refs rejected; zero matches is valid | Test-author AC2/AC6 matrix cases | **PASS** |
| AC3 | Arguments checked before file access; fixed, redacted error envelopes for read/parse/state failures, in precedence order | Test-author AC3 cases | **PASS** |
| AC4 | Offline, zero-dependency, deterministic, read-only, self-terminating; fixtures resolve from test file; 5s child timeout; no Git-depth assumption | Test-author AC4 cases; source-boundary literal checks | **PASS** |
| AC5 | Tests precede implementation; targeted/full/immutability checks pass with no dependency/server/schema/manifest/Factory changes | Test-author commit precedes Builder commit; targeted suite green; see note below on immutability | **PASS** (targeted); see note |
| AC6 | Full positive/negative test matrix over frozen state-validation rules 1–7 (Reviewer round 1 repair) | `outbox-job-status-count.test.js` table-driven matrix, version-2 contract | **PASS** |
| AC7 | Repeated invocation leaves fixture bytes/metadata and parent directory unchanged; directory-path read failure covered (Reviewer round 1 repair) | `outbox-job-status-count.test.js` read-only + directory-path cases | **PASS** |

**Note on AC5 / immutability history:** the ticket log records that
`.github/scripts/test-immutability-check.sh` failed transiently mid-workflow
because Reviewer round 1's fix-owner (test-author) committed repair tests
after the version-1 implementation commit already existed in branch history.
That was a workflow-history state at an intermediate commit, not the
current PR head. Every configured required GitHub check — which includes
this immutability check — passed at the trusted exact head
`bdb695af46490986d8f81b39e2eaa27bfab27d0`, and Reviewer round 2 approved
against that same evidence. No criterion is currently failing.

## 5. Risk

**Low — internal change only; no external send; no schema change.** The tool
is read-only (`fs.readFileSync` is its only filesystem operation) and adds
one new file pair under `app/tools/` and `app/tests/`; it does not touch
`app/server.js`, dependencies, or any schema/manifest. Worst case on a defect
is a wrong count or an overly strict/loose validation rule — both are
contained to this one offline command and can't affect Relay's live state or
send anything externally.

## 6. Cost

**$25.4975096 across 16 ledger attempts** at trusted effective accounting,
including this Narrator attempt's conservative reservation.

## 7. Rollback

Revert PR #273 to restore the previous behavior — the tool has no runtime
callers yet, so reverting removes the two new files with no other impact.

---

**Decision needed: approve to merge, or send back with what's wrong.**

# T-173 Evidence Bundle — report Relay state totals offline

## 1. What this does

Relay can now summarize one saved state file without starting the service. It reports totals for events and outbox entries and counts jobs and approvals by status, while leaving the file unchanged and excluding private record details.

## 2. Preview link

Not applicable — nonvisual PR. [PR #111](https://github.com/nysa-company/relay-factory/pull/111) changes an offline command with no browser, server, or visual surface. For exact head `cddd5b2d4a4bcccfe9cc550f2e9ab53530bdfce9`, the existing Reviewer approval and passing required GitHub checks verify deterministic state totals, data-minimized output, read-only file handling, and exact error behavior.

**What to try:** run `node app/tools/state-summary.js <state-file>` against a saved Relay state file and confirm it prints one compact totals-only JSON line without changing the file.

## 3. Screenshots

Not applicable — nonvisual PR. The exact PR adds only offline command behavior, so there is no changed screen or design reference to capture. Reviewer and protected-CI evidence for exact head `cddd5b2d4a4bcccfe9cc550f2e9ab53530bdfce9` cover the populated and empty summaries, private-detail exclusions, input-file invariance, and argument, file, JSON, and structure failures.

## 4. Acceptance criteria

| # | Criterion | How it was verified | Result |
|---|---|---|---|
| AC1 | Two runs against the populated frozen fixture produce the exact expected totals, no stderr or private sentinel values, and no file changes. | Reviewer-approved test `AC1. Frozen Fixture A summarizes deterministically across two read-only invocations`; all configured required GitHub checks passed for exact head `cddd5b2d4a4bcccfe9cc550f2e9ab53530bdfce9`. | **PASS** |
| AC2 | The empty frozen fixture produces the exact all-zero summary, no stderr, and no file changes. | Reviewer-approved test `AC2. Frozen Fixture B summarizes as the all-zero shape and is left unchanged`; all configured required GitHub checks passed for the exact PR head. | **PASS** |
| AC3 | Wrong argument counts, unreadable paths, malformed JSON, and invalid Relay structures return their exact errors without changing inputs. | Reviewer-approved test `AC3. the frozen failure matrix is asserted exactly and leaves every input untouched`; all configured required GitHub checks passed for the exact PR head. | **PASS** |
| AC4 | Tests precede implementation, role boundaries are preserved, prohibited files and controls are unchanged, and targeted, full, and immutability checks pass. | Reviewer approval confirmed commit order, file boundaries, and all three required commands; every configured required GitHub check passed for exact head `cddd5b2d4a4bcccfe9cc550f2e9ab53530bdfce9`. | **PASS** |

## 5. Risk

**Low — internal change / no external send / no schema change.** A defect could miscount a status, expose saved private details, return the wrong error, or alter the input file. Exact-output, exclusion, failure-matrix, and file-invariance evidence guards these cases; the Reviewer noted a test-coverage gap for ignored extra top-level fields, although the reviewed implementation does ignore them.

## 6. Cost

**$24.0000 across 12 attempts**, from T-173's trusted effective accounting at launch, including this Narrator attempt's conservative reservation.

## 7. Rollback

Revert PR #111 restores the previous behavior.

---

**Approve to merge, or send back with what's wrong?**

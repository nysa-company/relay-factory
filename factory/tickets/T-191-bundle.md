# T-191 Evidence Bundle — inspect one Relay job's attempt counts offline

## 1. What this does

Relay operators can now inspect one job's total attempt count and its attempt count since the latest retry from a saved state file while Relay is stopped. The command reports only the job ID and those two counts, rejects invalid state with safe errors, and does not change the file.

## 2. Preview link

Not applicable — nonvisual PR. [PR #188](https://github.com/nysa-company/relay-factory/pull/188) at exact head `f0482e44effcf60e7743c7aa7de16725564e598e` adds a local offline command with no browser, HTTP, or visual surface. The existing Reviewer approval and every configured required GitHub check passing for this exact protected nonvisual head verify exact attempt-count output and lookup, privacy-safe failures, complete state validation, read-only operation, and offline termination.

**What to try:** With Relay stopped, run `node app/tools/job-attempts.js <state-file> <job-id>` and confirm it prints only that job's ID, total attempts, and attempts since the latest retry without changing the file.

## 3. Screenshots

Not applicable — nonvisual PR. The exact PR changes only local file-to-output command behavior and has no page, browser view, design reference, or HTTP endpoint to capture. The existing Reviewer approval and passing protected CI at exact head `f0482e44effcf60e7743c7aa7de16725564e598e` verify the three frozen counter results, exact case- and space-sensitive lookup, fixed redacted errors, unchanged files and directories, self-termination, and absence of Relay or network startup.

## 4. Acceptance criteria

| # | Criterion | How it was verified | Result |
|---|---|---|---|
| AC1 | Pending, completed, and dead jobs print exactly `jobId`, `attempts`, and `attemptsSinceRetry` in order; repeated output is identical, private data is withheld, and the fixture remains unchanged. | Named acceptance test `AC1: Fixture A projects each job's frozen attempt-count line with exactly three ordered keys, repeats byte-identically, withholds every sentinel, and leaves the fixture untouched`; Reviewer approval and protected CI passed at the exact PR head. | **PASS** |
| AC2 | Unknown, uppercase, and trailing-space IDs return only the exact lookup error without echoing the ID or private state. | Named acceptance test `AC2: each frozen unknown ID exits 1 with only the lookup error, proving case- and space-sensitive matching without echoing the supplied ID`; Reviewer approval and protected CI passed. | **PASS** |
| AC3 | Zero, one, or three arguments return the exact usage error before any file access and leave absent paths absent. | Named acceptance test `AC3: every invalid arity exits 2 with the exact usage line before any file access`; Reviewer approval and protected CI passed. | **PASS** |
| AC4 | Missing-file and directory paths return only the safe unreadable-state error and change nothing on disk. | Named acceptance test `AC4: a nonexistent path and a directory path each exit 1 with only the unreadable error and change nothing on disk`; Reviewer approval and protected CI passed. | **PASS** |
| AC5 | Malformed JSON returns only the safe parse error, leaks no input content, and leaves the fixture unchanged. | Named acceptance test `AC5: Fixture B exits 1 with only the parse error and leaks no malformed state content`; Reviewer approval and protected CI passed. | **PASS** |
| AC6 | All 25 invalid state shapes return only the invalid-state error; a valid requested job beside an invalid job is rejected, proving every job is validated before lookup. | Named acceptance test `AC6: every structural-invalid fixture S1-S25 exits 1 with only the invalid-state error, and S25 proves whole-array validation precedes lookup`; Reviewer approval and protected CI passed. | **PASS** |
| AC7 | Every invocation ends on its own, changes no path, and stays offline using only the permitted file-system module. | Named acceptance test `AC7: every invocation terminates unaided and static inspection finds only the frozen offline module specifiers`, plus Reviewer inspection; protected CI passed. | **PASS** |
| AC8 | Acceptance tests precede implementation, each stage changes only its owned file, protected product and Factory files remain unchanged, and all required verification passes. | Reviewer approved that test commit `e7888de` precedes implementation commit `5ab24a3` and that each changes only its owned path. Every configured required GitHub check passed at exact head `f0482e44effcf60e7743c7aa7de16725564e598e`, whose complete semantic diff is bound to the protected nonvisual path policy. | **PASS** |

## 5. Risk

**Low — internal change; no external send; no schema change.** A defect could report the wrong counts, expose private saved state, accept corrupt state, alter the saved file, or start Relay or network resources; exact-output, validation, privacy, immutability, and termination evidence covers those risks.

## 6. Cost

**$12.0000 across 6 attempts** from T-191's trusted effective accounting at launch, including this Narrator attempt's conservative reservation.

## 7. Rollback

Revert PR #188 restores the previous behavior.

---

**Approve to merge, or send back with what's wrong?**

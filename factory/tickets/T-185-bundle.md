# T-185 Evidence Bundle — inspect one Relay job's progress offline

## 1. What this does

Relay operators can now check one job's status, attempts, and retries from a saved state file while Relay is stopped. The command returns only safe progress details, rejects invalid state with fixed errors, and does not change the file.

## 2. Preview link

Not applicable — nonvisual PR. [PR #179](https://github.com/nysa-company/relay-factory/pull/179) at exact head `58e85e46d279c269c95d1470cc9f984c0e9895a6` adds a local offline command with no browser, HTTP, or visual surface. Reviewer round 1 approved the offline behavior, and every configured required GitHub check passed for the exact head, covering exact progress output, safe failures, whole-state validation, privacy, read-only operation, and offline termination.

**What to try:** With Relay stopped, run `node app/tools/job-progress.js <state-file> <job-id>` and confirm it prints only that job's ID, status, attempts, and retries without changing the file.

## 3. Screenshots

Not applicable — nonvisual PR. The exact PR changes only local file-to-output command behavior and has no page, browser view, design reference, or HTTP endpoint to capture. Reviewer round 1 approval and passing protected CI at exact head `58e85e46d279c269c95d1470cc9f984c0e9895a6` verify deterministic progress and errors, withheld private fields, unchanged files and directories, self-termination, and absence of Relay or network startup.

## 4. Acceptance criteria

| # | Criterion | How it was verified | Result |
|---|---|---|---|
| AC1 | Pending, completed, and dead jobs print exactly their four safe progress fields; repeated inspection is byte-identical, leaks no sentinel, and changes nothing on disk. | Named acceptance test `AC1: Fixture A version 2 projects each job's frozen progress line, repeats byte-identically, withholds every sentinel, and leaves the fixture untouched`; Reviewer round 1 approved and all required GitHub checks passed at the exact PR head. | **PASS** |
| AC2 | Unknown and differently cased job IDs return only the exact lookup error without echoing the ID or leaking state, and leave the fixture unchanged. | Named acceptance test `AC2: unknown IDs are rejected with the exact lookup error, proving case-sensitive matching without echoing the supplied ID`; Reviewer approval and protected CI passed. | **PASS** |
| AC3 | Zero, one, or three arguments return the exact usage error before any file access and do not create the named path. | Named acceptance test `AC3: every invalid arity exits 2 with the exact usage line before any file access`; Reviewer approval and protected CI passed. | **PASS** |
| AC4 | A missing path or directory path returns only the safe unreadable-state error and changes nothing on disk. | Named acceptance test `AC4: a nonexistent path and a directory path each exit 1 with only the unreadable error and change nothing on disk`; Reviewer approval and protected CI passed. | **PASS** |
| AC5 | Malformed JSON returns only the safe parse error, leaks no state content, and leaves the fixture unchanged. | Named acceptance test `AC5: the malformed fixture exits 1 with only the parse error and leaks no state content`; Reviewer approval and protected CI passed. | **PASS** |
| AC6 | All 22 invalid state shapes return only the invalid-state error; a valid requested job beside an invalid job is rejected, proving all jobs are validated before lookup. | Named acceptance test `AC6: every structural-invalid fixture S1-S22 exits 1 with only the invalid-state error, and S19 proves whole-array validation precedes lookup`; Reviewer approval and protected CI passed. | **PASS** |
| AC7 | Every invocation ends on its own, changes no path, and stays offline with only the permitted file-system module. | Named acceptance test `AC7: every invocation terminates unaided and static inspection finds only the frozen offline module specifiers`, plus Reviewer inspection; protected CI passed. | **PASS** |
| AC8 | Acceptance tests precede implementation, each role stays within its owned file, protected product and Factory files remain unchanged, and all frozen repository checks pass. | Reviewer round 1 approved. Test commit `125b79c` precedes implementation commit `b7a37a0`, each changes only its owned path; every configured required GitHub check passed at exact head `58e85e46d279c269c95d1470cc9f984c0e9895a6`, whose complete semantic diff is bound to the protected nonvisual path policy. | **PASS** |

## 5. Risk

**Low — internal change; no external send; no schema change.** A defect could report incorrect progress, leak private state, accept corrupt job data, alter the saved file, or start Relay or network resources; exact-output, validation, privacy, immutability, and termination evidence covers those risks.

## 6. Cost

**$16.0000 across 8 attempts** from T-185's trusted effective accounting at launch, including this Narrator attempt's conservative reservation.

## 7. Rollback

Revert PR #179 restores the previous behavior.

---

**Approve to merge, or send back with what's wrong?**

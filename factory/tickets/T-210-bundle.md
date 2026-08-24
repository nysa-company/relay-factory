# T-210 Evidence Bundle — count Relay jobs with one exact status offline

## 1. What this does

Relay operators can now count jobs with one exact status in a saved state file while Relay is stopped. The command reports only the count, rejects invalid state with safe errors, and does not change the file or reveal private job and workflow details.

## 2. Preview link

Not applicable — nonvisual PR. [PR #226](https://github.com/nysa-company/relay-factory/pull/226) at exact head `2cdb31e77dc7479f1211b8f86d59c4bdd7f722b1` adds a local offline command with no browser, HTTP, or visual surface. The existing Reviewer approval and every configured required GitHub check passing for this exact protected nonvisual head verify exact status matching and counts, complete state validation, privacy-safe output and errors, read-only operation, offline termination, and the absence of network or external-send behavior.

**What to try:** With Relay stopped, run `node app/tools/job-status-count.js <state-file> <status>` and confirm it prints only the number of jobs whose saved status exactly matches the supplied status without changing the file.

## 3. Screenshots

Not applicable — nonvisual PR. The exact PR changes only local file-to-output command behavior and has no page, browser view, design reference, or HTTP endpoint to capture. The existing Reviewer approval and passing protected CI at exact head `2cdb31e77dc7479f1211b8f86d59c4bdd7f722b1` verify repeated and per-status counts, case-sensitive and untrimmed zero matches, empty-status and empty-jobs queries, fixed redacted errors, complete validation before counting, unchanged files and directories, self-termination, and the absence of Relay, network, or send activity.

## 4. Acceptance criteria

| # | Criterion | How it was verified | Result |
|---|---|---|---|
| AC1 | Two runs for status `dead` return exactly `{"jobsWithStatus":2}`, expose no sensitive content, and leave the fixture and directory unchanged. | Named acceptance test `AC1: two invocations for status dead against Fixture A each print the frozen count of two and leave the fixture untouched`; existing Reviewer approval and protected CI passed. | **PASS** |
| AC2 | Statuses `pending` and `done` each return exactly `{"jobsWithStatus":1}`, expose no sensitive content, and change nothing. | Named acceptance test `AC2: statuses pending and done against Fixture A each print the frozen count of one and leave the fixture untouched`; existing Reviewer approval and protected CI passed. | **PASS** |
| AC3 | Case-distinct, space-prefixed, empty-status, and empty-jobs queries each return exactly `{"jobsWithStatus":0}`, expose no sensitive content, and change nothing. | Named acceptance test `AC3: all four frozen zero-match cases succeed with a zero count instead of an error`; existing Reviewer approval and protected CI passed. | **PASS** |
| AC4 | Wrong argument counts return only the exact usage error before file access and leave candidate paths absent. | Named acceptance test `AC4: zero, one, and three positional arguments fail with the exact usage envelope and never touch the candidate path`; existing Reviewer approval and protected CI passed. | **PASS** |
| AC5 | Missing-file and directory paths return only the exact safe read error and remain unchanged. | Named acceptance test `AC5: an absent path and a directory path fail with the exact read-failure envelope and change nothing`; existing Reviewer approval and protected CI passed. | **PASS** |
| AC6 | Malformed and empty JSON files return only the exact safe parse error, leak no input content, and remain unchanged. | Named acceptance test `AC6: Fixtures C and D fail with the exact parse-failure envelope and never echo the malformed bytes`; existing Reviewer approval and protected CI passed. | **PASS** |
| AC7 | All 25 frozen invalid state shapes return only the exact invalid-state error and remain unchanged; a matching job followed by an invalid job proves complete validation occurs before counting. | Named acceptance test `AC7: every S1-S25 structural-invalid fixture fails with the exact invalid-state envelope after a distinctness proof`; existing Reviewer approval and protected CI passed. | **PASS** |
| AC8 | Every invocation ends within the required timeout, leaks no frozen sensitive token, and the command remains a zero-dependency, file-read-only offline tool with no server, network, child-process, or timer behavior. | Named acceptance test `AC8: the command self-terminates under the frozen timeout and both files stay inside their frozen source boundaries`, plus Reviewer inspection; protected CI passed at the exact PR head. | **PASS** |
| AC9 | Complete acceptance tests precede implementation, each stage changes only its owned application file, protected product and Factory surfaces remain unchanged, and all required verification passes. | Reviewer approved the test-first history: test-author commit `54d8633` precedes implementation commit `b4b7662`, with exact role-owned paths. Every configured required GitHub check passed at exact head `2cdb31e77dc7479f1211b8f86d59c4bdd7f722b1`, whose complete semantic diff is bound to the protected nonvisual path policy. | **PASS** |

## 5. Risk

**Low — internal change; no external send; no schema change.** A defect could report the wrong status count, expose private saved state, accept corrupt state, alter the saved file, or start Relay or network activity; exact-output, strict-match, validation, privacy, immutability, offline, and termination evidence covers those risks.

## 6. Cost

**$12.0000 across 6 attempts** from T-210's trusted effective accounting at launch, including this Narrator attempt's conservative reservation.

## 7. Rollback

Revert PR #226 restores the previous behavior.

---

**Approve to merge, or send back with what's wrong?**

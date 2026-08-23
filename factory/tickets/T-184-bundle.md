# T-184 Evidence Bundle — inspect one Relay event offline

## 1. What this does

Relay operators can now look up one event's ID, type, and receipt time from a saved state file while Relay is stopped. The command returns only those three safe details, rejects invalid state with fixed errors, and does not change the file.

## 2. Preview link

Not applicable — nonvisual PR. [PR #180](https://github.com/nysa-company/relay-factory/pull/180) at exact head `2990414d5f34947fd1cbc3607980a51f97957535` adds a local offline command with no browser, HTTP, or visual surface. The existing Reviewer approval and every configured required GitHub check passing for that exact head verify exact event lookup and output, safe failures, privacy, read-only operation, and offline termination.

**What to try:** With Relay stopped, run `node app/tools/event-metadata.js <state-file> <event-id>` and confirm it prints only that event's ID, type, and receipt time without changing the file.

## 3. Screenshots

Not applicable — nonvisual PR. The exact PR changes only local file-to-output command behavior and has no page, browser view, design reference, or HTTP endpoint to capture. The existing Reviewer approval and passing protected CI at exact head `2990414d5f34947fd1cbc3607980a51f97957535` verify deterministic output and errors, withheld payload and related state, unchanged files and directories, self-termination, and absence of Relay or network startup.

## 4. Acceptance criteria

| # | Criterion | How it was verified | Result |
|---|---|---|---|
| AC1 | Two `event-alpha` lookups print exactly its three safe metadata fields, leak no sensitive content, and leave the fixture and parent unchanged after each run. | Named acceptance test `AC1: repeated event-alpha lookups against Fixture A print the frozen projection and leave the fixture untouched`; Reviewer approved and all required GitHub checks passed at the exact PR head. | **PASS** |
| AC2 | Looking up `event-zulu` prints exactly its own three safe metadata fields, with no error output or file changes. | Named acceptance test `AC2: the event-zulu lookup against Fixture A prints its own frozen projection and leaves the fixture untouched`; Reviewer approval and protected CI passed. | **PASS** |
| AC3 | Missing and differently cased event IDs return only the exact not-found error and leave every fixture and parent unchanged. | Named acceptance test `AC3: every frozen lookup miss, including the case-distinct ID, fails with the exact not-found envelope`; Reviewer approval and protected CI passed. | **PASS** |
| AC4 | Zero, one, or three arguments return the exact usage error before reading or creating a state path. | Named acceptance test `AC4: zero, one, and three positional arguments fail with the exact usage envelope and read nothing`; Reviewer approval and protected CI passed. | **PASS** |
| AC5 | A missing path or directory path returns only the safe read error and changes no path or parent entry. | Named acceptance test `AC5: an absent path and a directory path fail with the exact read-failure envelope and change nothing`; Reviewer approval and protected CI passed. | **PASS** |
| AC6 | Malformed JSON returns only the safe parse error, does not echo sensitive input, and leaves the fixture and parent unchanged. | Named acceptance test `AC6: Fixture C fails with the exact parse-failure envelope and never echoes the malformed bytes`; Reviewer approval and protected CI passed. | **PASS** |
| AC7 | Every frozen invalid state shape returns only the invalid-state error and remains unchanged; all fixtures are proved byte-distinct first. | Named acceptance test `AC7: every S1-S19 structural-invalid fixture fails with the exact invalid-state envelope after a distinctness proof`; Reviewer approval and protected CI passed. | **PASS** |
| AC8 | Every invocation ends on its own, leaks none of the frozen sensitive values, and stays offline using only the permitted read operation. | Named acceptance test `AC8: the production command self-terminates under the frozen timeout and stays inside its offline source boundary`, plus Reviewer inspection; protected CI passed. | **PASS** |
| AC9 | Acceptance tests precede implementation, each stage stays within its owned file, protected product and Factory files remain unchanged, and all frozen verification commands pass. | Reviewer approved the repository-level evidence. Test commit `a30e80f` precedes implementation commit `63f297c`, each creates only its owned application path; every configured required GitHub check passed at exact head `2990414d5f34947fd1cbc3607980a51f97957535`, whose complete semantic diff is bound to the protected nonvisual path policy. | **PASS** |

## 5. Risk

**Low — internal change; no external send; no schema change.** A defect could return the wrong event, expose payload or related private state, accept corrupt state, alter the saved file, or start Relay or network resources; exact-output, validation, privacy, immutability, and termination evidence covers those risks.

## 6. Cost

**$16.0000 across 8 attempts** from T-184's trusted effective accounting at launch, including this Narrator attempt's conservative reservation.

## 7. Rollback

Revert PR #180 restores the previous behavior.

---

**Approve to merge, or send back with what's wrong?**

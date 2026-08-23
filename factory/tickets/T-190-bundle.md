# T-190 Evidence Bundle — inspect one Relay event timestamp offline

## 1. What this does

Relay operators can now look up one event by its exact ID in a saved state file while Relay is stopped. The command reports only the event ID and its stored timestamp, without changing the file or exposing payloads, errors, approvals, outbox content, or unrelated state.

## 2. Preview link

Not applicable — nonvisual PR. [PR #189](https://github.com/nysa-company/relay-factory/pull/189) at exact head `f66d13cb5c275026b237513d5e821eaf04255c9c` adds a local offline command with no browser, HTTP, or visual surface. Existing Reviewer approval and every configured required GitHub check passing for this exact protected nonvisual head cover exact-ID timestamp lookup, byte-for-byte timestamp copying, privacy-safe output and errors, complete state validation, read-only operation, and offline termination.

**What to try:** With Relay stopped, run `node app/tools/event-timestamp.js <state-file> <event-id>` and confirm it prints only that event's ID and stored timestamp without changing the file.

## 3. Screenshots

Not applicable — nonvisual PR. The exact PR changes only offline command, acceptance-test, and ticket evidence behavior and has no page, browser view, design reference, or HTTP endpoint to capture. Existing Reviewer approval and passing protected CI at exact head `f66d13cb5c275026b237513d5e821eaf04255c9c` verify exact and case-sensitive lookup, verbatim stored-timestamp output, opaque private fields, fixed redacted errors, unchanged files and directories, self-termination, and absence of Relay or network startup.

## 4. Acceptance criteria

| # | Criterion | How it was verified | Result |
|---|---|---|---|
| AC1 | Two `event-alpha` lookups return the exact frozen ID and timestamp, leak no sensitive content, and leave the fixture and parent unchanged. | Named acceptance test `AC1: repeated event-alpha lookups against Fixture A print the frozen timestamp projection and leave the fixture untouched`; existing Reviewer approval and protected CI passed at the exact PR head. | **PASS** |
| AC2 | The `event-zulu` lookup returns its own exact frozen ID and timestamp, leaks nothing sensitive, and changes nothing. | Named acceptance test `AC2: the event-zulu lookup against Fixture A prints its own frozen timestamp projection and leaves the fixture untouched`; Reviewer approval and protected CI passed. | **PASS** |
| AC3 | Missing and differently cased event IDs return only the exact not-found error and leave all queried state unchanged. | Named acceptance test `AC3: every frozen lookup miss, including the case-distinct ID, fails with the exact not-found envelope`; Reviewer approval and protected CI passed. | **PASS** |
| AC4 | Zero, one, or three arguments return the exact usage error before file access and do not create the supplied path. | Named acceptance test `AC4: zero, one, and three positional arguments fail with the exact usage envelope before any file access`; Reviewer approval and protected CI passed. | **PASS** |
| AC5 | Missing-file and directory paths return only the safe read error and remain unchanged. | Named acceptance test `AC5: an absent path and a directory path fail with the exact read-failure envelope and change nothing`; Reviewer approval and protected CI passed. | **PASS** |
| AC6 | Malformed and empty JSON files return only the exact parse error, leak no input content, and remain unchanged. | Named acceptance test `AC6: Fixtures C and D fail with the exact parse-failure envelope and never echo the malformed bytes`; Reviewer approval and protected CI passed. | **PASS** |
| AC7 | Every frozen invalid state shape, including duplicate event IDs, returns only the exact invalid-state error after fixture-distinctness checks and remains unchanged. | Named acceptance test `AC7: every S1-S16 structural-invalid fixture fails with the exact invalid-state envelope after a distinctness proof`; Reviewer approval and protected CI passed. | **PASS** |
| AC8 | Every invocation ends within the frozen timeout, leaks none of the 19 sensitive tokens, and the command stays within its read-only offline file-access boundary. | Named acceptance test `AC8: the production command self-terminates under the frozen timeout and stays inside its offline source boundary`, plus Reviewer inspection; protected CI passed at the exact PR head. | **PASS** |
| AC9 | Complete acceptance tests precede implementation, each role changes only its owned file, protected product and Factory files remain unchanged, and all required repository checks pass. | Reviewer approved the test-first history: test commit `8bfb881` precedes implementation commit `de41d6b`, with each stage confined to its owned path. Every configured required GitHub check passed at exact head `f66d13cb5c275026b237513d5e821eaf04255c9c`, whose complete semantic diff is bound to the protected nonvisual path policy. | **PASS** |
| AC10 | A non-date timestamp is copied byte-for-byte, and events with absent or nonstandard extra fields remain valid while private fields stay hidden. | Named acceptance test `AC10: Fixture E proves createdAt copies the stored receivedAt bytes verbatim and that extra event fields are opaque`; Reviewer approval and protected CI passed. | **PASS** |

## 5. Risk

**Low — internal change; no external send; no schema change.** A defect could return the wrong event or timestamp, normalize stored timestamp text, expose private state, accept malformed state, alter the saved file, or leave resources running; exact-output, redaction, validation, immutability, and termination evidence covers those risks.

## 6. Cost

**$20.0000 across 10 attempts** from T-190's trusted effective accounting at launch, including this Narrator attempt's conservative reservation.

## 7. Rollback

Revert PR #189 restores the previous behavior.

---

**Approve to merge, or send back with what's wrong?**

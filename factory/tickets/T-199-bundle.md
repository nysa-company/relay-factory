# T-199 Evidence Bundle — count Relay events by type offline

## 1. What this does

Relay operators can now count events of one exact type in a saved state file while Relay is stopped. The command reports only the requested type and count, uses safe errors for invalid input, and does not change the saved file or expose private event or workflow details.

## 2. Preview link

Not applicable — nonvisual PR. [PR #200](https://github.com/nysa-company/relay-factory/pull/200) at exact head `74cd528f9cc92e4577a274d8b430e6e4c751c1f2` adds a local offline command with no browser, HTTP, or visual surface. Existing Reviewer approval and every configured required GitHub check passing for this exact protected nonvisual head verify exact event-type counts, case-sensitive matching, privacy-safe output and errors, complete state validation, read-only operation, and offline termination.

**What to try:** With Relay stopped, run `node app/tools/event-type-count.js <state-file> <event-type>` and confirm it prints only the supplied event type and its exact count without changing the file.

## 3. Screenshots

Not applicable — nonvisual PR. The exact PR changes only local file-to-output command behavior and has no page, browser view, design reference, or HTTP endpoint to capture. Existing Reviewer approval and passing protected CI at exact head `74cd528f9cc92e4577a274d8b430e6e4c751c1f2` verify nonzero and zero counts, exact case-sensitive matching, fixed redacted errors, unchanged files and directories, self-termination, and absence of Relay or network startup.

## 4. Acceptance criteria

| # | Criterion | How it was verified | Result |
|---|---|---|---|
| AC1 | Two repeated `meeting` queries return exactly `{"eventType":"meeting","events":2}`, expose no sensitive content, and leave the fixture and its directory unchanged. | Named acceptance test `AC1: repeated meeting counts against Fixture A print the frozen two-event line and leave the fixture untouched`; existing Reviewer approval and protected CI passed at the exact PR head. | **PASS** |
| AC2 | An `email` query returns exactly `{"eventType":"email","events":1}`, exposes no sensitive content, and changes nothing. | Named acceptance test `AC2: the email count against Fixture A prints the frozen one-event line and leaves the fixture untouched`; Reviewer approval and protected CI passed. | **PASS** |
| AC3 | A case-distinct `Meeting` query and a `meeting` query against an empty event collection both succeed with exact zero counts, expose no sensitive content, and change nothing. | Named acceptance test `AC3: both frozen zero-match cases succeed with a zero count instead of a not-found error`; Reviewer approval and protected CI passed. | **PASS** |
| AC4 | Zero, one, or three arguments return the exact usage error before file access, print no normal output, and leave candidate paths absent. | Named acceptance test `AC4: zero, one, and three positional arguments fail with the exact usage envelope and never touch the candidate path`; Reviewer approval and protected CI passed. | **PASS** |
| AC5 | Missing-file and directory paths return only the exact safe read error and remain unchanged. | Named acceptance test `AC5: an absent path and a directory path fail with the exact read-failure envelope and change nothing`; Reviewer approval and protected CI passed. | **PASS** |
| AC6 | Malformed and empty JSON files return only the exact safe parse error, leak no input content, and remain unchanged. | Named acceptance test `AC6: Fixtures C and D fail with the exact parse-failure envelope and never echo the malformed bytes`; Reviewer approval and protected CI passed. | **PASS** |
| AC7 | All 19 frozen invalid state shapes return only the exact invalid-state error and remain unchanged; duplicate IDs prove complete validation occurs before counting. | Named acceptance test `AC7: every S1-S19 structural-invalid fixture fails with the exact invalid-state envelope after a distinctness proof`; Reviewer approval and protected CI passed. | **PASS** |
| AC8 | Every invocation ends within the required timeout, leaks no frozen sensitive token, and the command remains a zero-dependency, file-read-only offline tool with no server, network, child-process, or timer behavior. | Named acceptance test `AC8: the production command self-terminates under the frozen timeout and both files stay inside their frozen source boundaries`, plus Reviewer inspection; protected CI passed at the exact PR head. | **PASS** |
| AC9 | Complete acceptance tests precede implementation, each stage changes only its owned application file, protected product and Factory surfaces remain unchanged, and all required verification passes. | Reviewer approved the test-first history: test commit `35b789e` precedes implementation commit `238ee42`. Every configured required GitHub check passed at exact head `74cd528f9cc92e4577a274d8b430e6e4c751c1f2`, whose complete semantic diff is bound to the protected nonvisual path policy. | **PASS** |

## 5. Risk

**Low — internal change; no external send; no schema change.** A defect could report the wrong count, expose private saved state, accept corrupt state, alter the saved file, or start Relay or network resources; exact-output, validation, privacy, immutability, and termination evidence covers those risks.

## 6. Cost

**$12.0000 across 6 attempts** from T-199's trusted effective accounting at launch, including this Narrator attempt's conservative reservation.

## 7. Rollback

Revert PR #200 restores the previous behavior.

---

**Approve to merge, or send back with what's wrong?**

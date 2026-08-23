# T-187 Evidence Bundle — inspect one Relay outbox receipt offline

## 1. What this does

Relay operators can now look up one outbox receipt by its exact approval ID in a saved state file while Relay is stopped. The command reports only the approval ID and send time, without changing the file or exposing message contents or unrelated saved data.

## 2. Preview link

Not applicable — nonvisual PR. [PR #185](https://github.com/nysa-company/relay-factory/pull/185) at exact head `5e001324a8f331dbb80aad82eb066e9537376d04` adds an offline command with no browser, HTTP, or visual surface. Existing Reviewer approval and every configured required GitHub check passing for this exact protected nonvisual head cover exact receipt lookup, privacy-safe output and errors, complete state validation, read-only operation, and offline termination.

**What to try:** With Relay stopped, run `node app/tools/outbox-receipt.js <state-file> <approval-id>` and confirm it prints only that receipt's approval ID and send time without changing the file.

## 3. Screenshots

Not applicable — nonvisual PR. The exact PR changes only offline command, acceptance-test, and ticket evidence behavior and has no page, browser view, design reference, or HTTP endpoint to capture. Existing Reviewer approval and passing protected CI at exact head `5e001324a8f331dbb80aad82eb066e9537376d04` verify exact and case-sensitive selection, withheld message and unrelated state content, fixed safe errors, unchanged files and directories, self-termination, and absence of Relay or network startup.

## 4. Acceptance criteria

| # | Criterion | How it was verified | Result |
|---|---|---|---|
| AC1 | Two exact lookups return only the selected receipt's `approvalId` and `sentAt`, leak no sensitive or unrelated data, and leave the fixture unchanged. | Named acceptance test `AC1: two appr-receipt-alpha lookups against Fixture A print the frozen receipt projection and leave the fixture untouched`; existing Reviewer evidence approved the exact projection, redaction, repeatability, and unchanged-file behavior, and protected CI passed at the exact PR head. | **PASS** |
| AC2 | Missing and differently cased approval IDs return only the exact not-found error and leave valid state unchanged. | Named acceptance test `AC2: every frozen lookup miss, including the case-distinct ID, fails with the exact not-found envelope`; Reviewer approval and protected CI passed. | **PASS** |
| AC3 | Zero, one, or three arguments return the exact usage error, print no normal output, and create no supplied path. | Named acceptance test `AC3: zero, one, and three positional arguments fail with the exact usage envelope and touch no path`; Reviewer approval and protected CI passed. | **PASS** |
| AC4 | A missing path or directory path returns only the safe read error and changes nothing on disk. | Named acceptance test `AC4: an absent path and a directory in place of a state file fail with the exact read-failure envelope and change nothing`; Reviewer approval and protected CI passed. | **PASS** |
| AC5 | Malformed JSON returns only the safe parse error, exposes none of the malformed content, and leaves the fixture unchanged. | Named acceptance test `AC5: Fixture C fails with the exact parse-failure envelope and never echoes the malformed bytes`; Reviewer approval and protected CI passed. | **PASS** |
| AC6 | All 19 structurally invalid states return only the invalid-state error, leak no sensitive data, and remain unchanged; duplicate IDs are rejected before lookup. | Named acceptance test `AC6: every S1-S19 structural-invalid fixture fails with the exact invalid-state envelope after a distinctness proof`; Reviewer approval and protected CI passed. | **PASS** |
| AC7 | The command only reads the supplied file, starts no server or network activity, uses no timers, and every invocation terminates on its own. | Named acceptance test `AC7: both files stay inside their frozen offline module boundaries`, together with the runtime assertions in AC1–AC6 and Reviewer inspection; protected CI passed at the exact PR head. | **PASS** |
| AC8 | Complete acceptance tests precede implementation, each stage changes only its owned file, and protected product, schema, dependency, and Factory files remain unchanged while required checks pass. | Reviewer approved the staged history. Test commit `c53e548` precedes implementation commit `0bea341`, each creates only its owned path; every configured required GitHub check passed at exact head `5e001324a8f331dbb80aad82eb066e9537376d04`, whose complete semantic diff is bound to the protected nonvisual path policy. | **PASS** |

## 5. Risk

**Low — internal change; no external send; no schema change.** A defect could select the wrong receipt, expose private saved data, accept corrupt state, alter the state file, or start Relay or network resources; exact-output, validation, privacy, immutability, and termination evidence covers those risks.

## 6. Cost

**$12.0000 across 6 attempts** from T-187's trusted effective accounting at launch, including this Narrator attempt's conservative reservation.

## 7. Rollback

Revert PR #185 restores the previous behavior.

---

**Approve to merge, or send back with what's wrong?**

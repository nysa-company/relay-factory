# T-198 Evidence Bundle — count outbox entries for one Relay approval offline

## 1. What this does

Relay operators can now count the saved outbox entries linked to one approval while Relay is stopped. The command reports only the approval ID and count, including zero or repeated links, without changing the saved file or exposing private details.

## 2. Preview link

Not applicable — nonvisual PR. [PR #195](https://github.com/nysa-company/relay-factory/pull/195) at exact head `7b47bc99711801042aa8a8154d9f1f39b003dcbc` adds a local offline command with no browser, HTTP, or visual surface. Existing Reviewer approval and every configured required GitHub check passing for this exact protected nonvisual head cover exact outbox counting, privacy-safe output and errors, complete state validation, read-only operation, and offline termination.

**What to try:** With Relay stopped, run `node app/tools/approval-outbox-count.js <state-file> <approval-id>` and confirm it prints only that approval's ID and number of linked outbox entries without changing the file.

## 3. Screenshots

Not applicable — nonvisual PR. The exact PR changes only local file-to-output command behavior and has no page, browser view, design reference, or HTTP endpoint to capture. Existing Reviewer approval and passing protected CI at exact head `7b47bc99711801042aa8a8154d9f1f39b003dcbc` verify zero, one, and repeated outbox counts; exact case- and space-sensitive lookup; fixed redacted errors; unchanged files and directories; deterministic termination; and absence of Relay or network startup.

## 4. Acceptance criteria

| # | Criterion | How it was verified | Result |
|---|---|---|---|
| AC1 | Exact lookups return counts `0`, `1`, and `2` with only `approvalId` and `outboxEntries` in order, no stderr, and no private or unrelated data. | Named acceptance test `AC1: Frozen Fixture A returns the byte-exact zero, one, and two outbox counts and nothing else`; existing Reviewer approval and protected CI passed at the exact PR head. | **PASS** |
| AC2 | Missing, uppercase, trailing-space, and empty-state lookups return only the exact not-found error, proving exact case- and space-sensitive matching. | Named acceptance test `AC2: every frozen unknown ID and empty valid Fixture C exit 1 with the exact no-such-approval line`; Reviewer approval and protected CI passed. | **PASS** |
| AC3 | Zero, one, three, or four arguments return the exact usage error, print no normal output, and leave candidate paths absent. | Named acceptance test `AC3: zero, one, three, or four positional arguments exit 2 with the exact usage line and touch no path`; Reviewer approval and protected CI passed. | **PASS** |
| AC4 | Missing-file and directory paths return the exact safe read error and remain unchanged. | Named acceptance test `AC4: each frozen read-failure path exits 1 with the exact cannot-read line and is left as it was`; Reviewer approval and protected CI passed. | **PASS** |
| AC5 | Invalid JSON returns the exact safe parse error, exposes no input content, and leaves the file and directory unchanged. | Named acceptance test `AC5: Frozen Fixture B exits 1 with the exact invalid-JSON line, unchanged bytes, and no leakage`; Reviewer approval and protected CI passed. | **PASS** |
| AC6 | All 20 frozen invalid state shapes return the exact invalid-state error and remain unchanged; complete approval and outbox validation happens before lookup and counting. | Named acceptance test `AC6: every frozen structural-invalid fixture exits 1 with the exact invalid-state line and unchanged bytes`; Reviewer approval and protected CI passed. | **PASS** |
| AC7 | Every covered invocation ends on its own, repeats byte-for-byte, changes no input, and neither starts Relay nor uses network or child-process behavior. | Named acceptance test `AC7: every invocation self-terminates, repeats byte-identically, and stays read-only and offline`, plus Reviewer inspection; protected CI passed at the exact PR head. | **PASS** |
| AC8 | Successes and failures expose no private state, unrelated approval, file path, parser detail, operating-system error, stack trace, or extra error line. | Named acceptance test `AC8: no result in criteria 1-6 exposes excluded content, an input path, an OS error, or a second line`; Reviewer approval and protected CI passed. | **PASS** |
| AC9 | Complete acceptance tests precede implementation, each stage changes only its owned application file, and required checks pass without changes to existing tests, server, dependencies, schema, kit pin, or Factory controls. | Reviewer approved that test commit `77d2cd8` precedes implementation commit `0831692` and that each creates only its owned file. Every configured required GitHub check passed at exact head `7b47bc99711801042aa8a8154d9f1f39b003dcbc`, whose complete semantic diff is bound to the protected nonvisual path policy. | **PASS** |

## 5. Risk

**Low — internal change; no external send; no schema change.** A defect could report the wrong count, expose private saved state, accept malformed state, reject valid state, alter the saved file, or leave resources running; the exact-output, privacy, validation, immutability, and termination evidence covers those risks.

## 6. Cost

**$12.0000 across 6 attempts** from T-198's trusted effective accounting at launch, including this Narrator attempt's conservative reservation.

## 7. Rollback

Revert PR #195 restores the previous behavior.

---

**Approve to merge, or send back with what's wrong?**

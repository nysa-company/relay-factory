# T-192 Evidence Bundle — inspect one Relay approval link offline

## 1. What this does

Relay operators can now look up one approval by its exact ID in a saved state file while Relay is offline. The command reports only the approval ID, the related event ID, and the approval status, without changing the file or exposing private details.

## 2. Preview link

Not applicable — nonvisual PR. [PR #187](https://github.com/nysa-company/relay-factory/pull/187) at exact head `285daa0ed49f926bfb59d6877b9bf68589362c04` adds a local offline command with no browser, HTTP, or visual surface. Existing Reviewer approval and every configured required GitHub check passing for this exact protected nonvisual head cover approval-to-event lookup, privacy-safe output and errors, complete state validation, read-only operation, and offline termination.

**What to try:** With Relay stopped, run `node app/tools/approval-link.js <state-file> <approval-id>` and confirm it prints only that approval's ID, related event ID, and status without changing the file.

## 3. Screenshots

Not applicable — nonvisual PR. The exact PR changes only local file-to-output command behavior and has no page, browser view, design reference, or HTTP endpoint to capture. Existing Reviewer approval and passing protected CI at exact head `285daa0ed49f926bfb59d6877b9bf68589362c04` verify all four approval statuses, exact case- and space-sensitive lookup, fixed redacted errors, unchanged files and directories, deterministic termination, and absence of Relay or network startup.

## 4. Acceptance criteria

| # | Criterion | How it was verified | Result |
|---|---|---|---|
| AC1 | Exact lookups for pending, sent, rejected, and blocked approvals return only `approvalId`, `eventId`, and `status` in the required order, with no private or unrelated data. | Named acceptance test `AC1: Frozen Fixture A returns each approval's byte-exact approval-to-event link and nothing else`; existing Reviewer approval and protected CI passed at the exact PR head. | **PASS** |
| AC2 | Missing, uppercase, and trailing-space approval IDs return only the exact not-found error, proving lookup is case- and space-sensitive. | Named acceptance test `AC2: every frozen unknown ID and empty valid Fixture C exit 1 with the exact no-such-approval line`; Reviewer approval and protected CI passed. | **PASS** |
| AC3 | Zero, one, three, or four arguments return the exact usage error, print no normal output, and leave supplied candidate paths absent. | Named acceptance test `AC3: zero, one, three, or four positional arguments exit 2 with the exact usage line and touch no path`; Reviewer approval and protected CI passed. | **PASS** |
| AC4 | Missing-file and directory paths return the exact safe read error and remain unchanged. | Named acceptance test `AC4: each frozen read-failure path exits 1 with the exact cannot-read line and is left as it was`; Reviewer approval and protected CI passed. | **PASS** |
| AC5 | Invalid JSON returns the exact safe parse error, exposes no input content, and leaves the file and directory unchanged. | Named acceptance test `AC5: Frozen Fixture B exits 1 with the exact invalid-JSON line, unchanged bytes, and no leakage`; Reviewer approval and protected CI passed. | **PASS** |
| AC6 | All 24 frozen invalid state shapes return the exact invalid-state error and remain unchanged. | Named acceptance test `AC6: every frozen structural-invalid fixture exits 1 with the exact invalid-state line and unchanged bytes`; Reviewer approval and protected CI passed. | **PASS** |
| AC7 | Every covered invocation ends on its own, repeats byte-for-byte, changes no input, and neither starts Relay nor uses network or child-process behavior. | Named acceptance test `AC7: every invocation self-terminates, repeats byte-identically, and stays read-only and offline`, plus Reviewer inspection; protected CI passed at the exact PR head. | **PASS** |
| AC8 | Successes and failures expose no approval action, rejection reason, event payload, job error, outbox content, unrelated record, file path, parser detail, operating-system error, stack trace, or extra error line. | Named acceptance test `AC8: no result in criteria 1-6 exposes excluded content, an input path, an OS error, or a second line`; Reviewer approval and protected CI passed. | **PASS** |
| AC9 | Complete acceptance tests precede implementation, each stage changes only its owned application file, and required repository checks pass without changes to protected product, schema, dependency, or Factory files. | Reviewer approved the test-first history: test commit `13b3172` precedes implementation commit `ce593a0`. Every configured required GitHub check passed at exact head `285daa0ed49f926bfb59d6877b9bf68589362c04`, whose complete semantic diff is bound to the protected nonvisual path policy. | **PASS** |

## 5. Risk

**Low — internal change; no external send; no schema change.** A defect could return the wrong event link or status, expose private saved data, reject valid state, accept malformed state, change the saved file, or leave resources running; the exact-output, privacy, validation, immutability, and termination evidence covers those risks.

## 6. Cost

**$16.0000 across 8 attempts** from T-192's trusted effective accounting at launch, including this Narrator attempt's conservative reservation.

## 7. Rollback

Revert PR #187 restores the previous behavior.

---

**Approve to merge, or send back with what's wrong?**

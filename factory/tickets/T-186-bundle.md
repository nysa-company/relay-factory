# T-186 Evidence Bundle — inspect one Relay approval offline

## 1. What this does

Relay operators can now look up one approval by its exact ID in a saved state file while Relay is offline. The command reports only the approval ID, job ID, and status, without changing the file or exposing private approval, event, job, or outbox details.

## 2. Preview link

Not applicable — nonvisual PR. [PR #178](https://github.com/nysa-company/relay-factory/pull/178) at exact head `41a7577ac3cc5f27630ea116df1e98e10e5e5283` adds an offline command with no browser, HTTP, or visual surface. Existing Reviewer approval and every configured required GitHub check passing for this exact protected nonvisual head cover exact-ID lookup, privacy-safe output and errors, read-only operation, and offline termination.

**What to try:** With Relay stopped, run `node app/tools/approval-state.js <state-file> <approval-id>` and confirm it prints only that approval's ID, job ID, and status without changing the file.

## 3. Screenshots

Not applicable — nonvisual PR. The exact PR changes only offline command, acceptance-test, and ticket evidence behavior and has no page, browser view, design reference, or HTTP endpoint to capture. Existing Reviewer approval and passing protected CI at exact head `41a7577ac3cc5f27630ea116df1e98e10e5e5283` verify all four approval statuses, exact case- and space-sensitive lookup, fixed redacted errors, unchanged files and directories, self-termination, and absence of Relay or network startup.

## 4. Acceptance criteria

| # | Criterion | How it was verified | Result |
|---|---|---|---|
| AC1 | Exact lookups for pending, sent, rejected, and blocked approvals return only `approvalId`, `jobId`, and `status` in the required order, with no private or unrelated data. | Named acceptance test `AC1: Frozen Fixture A returns each approval's byte-exact projection and leaks nothing else`; existing Reviewer evidence approved the exact projections and redaction, and protected CI passed at the exact PR head. | **PASS** |
| AC2 | Unknown, uppercase, and trailing-space IDs return only the exact not-found error, proving lookup is case- and space-sensitive. | Named acceptance test `AC2: each frozen unknown ID exits 1 with the exact no-such-approval line`; Reviewer approval and protected CI passed at the exact PR head. | **PASS** |
| AC3 | Zero, one, or three arguments return the exact usage error, print no normal output, and create no supplied path. | Named acceptance test `AC3: zero, one, or three positional arguments exit 2 with the exact usage line and create no path`; Reviewer approval and protected CI passed. | **PASS** |
| AC4 | Missing-file and directory paths return the exact safe read error and remain unchanged. | Named acceptance test `AC4: each frozen read-failure path exits 1 with the exact cannot-read line and is left as it was`; Reviewer approval and protected CI passed. | **PASS** |
| AC5 | Invalid JSON returns the exact safe parse error, exposes no input content, and leaves the file and directory unchanged. | Named acceptance test `AC5: Frozen Fixture B exits 1 with the exact invalid-JSON line, unchanged bytes, and no leakage`; Reviewer approval and protected CI passed. | **PASS** |
| AC6 | Every frozen structurally invalid state, including duplicate approval IDs, returns the exact invalid-state error and remains unchanged. | Named acceptance test `AC6: every frozen structural-invalid fixture exits 1 with the exact invalid-state line and unchanged bytes`; Reviewer specifically approved the duplicate-ID rejection, and protected CI passed. | **PASS** |
| AC7 | Every covered invocation ends on its own, repeats byte-for-byte, changes no input, and neither starts Relay nor uses network or child-process behavior. | Named acceptance test `AC7: every invocation self-terminates, repeats byte-identically, and stays read-only and offline`, plus Reviewer inspection; protected CI passed at the exact PR head. | **PASS** |
| AC8 | Complete acceptance tests precede implementation, each stage changes only its owned file, and required repository checks pass without changes to protected product or Factory files. | Reviewer approved that test commit `1d2894b` precedes implementation commit `17b0406` and that each changes only its owned path. Every configured required GitHub check passed at exact head `41a7577ac3cc5f27630ea116df1e98e10e5e5283`, whose complete semantic diff is bound to the protected nonvisual path policy. | **PASS** |

## 5. Risk

**Low — internal change; no external send; no schema change.** A defect could return the wrong approval, expose private saved data, reject valid state, accept malformed state, alter the saved file, or leave resources running; the exact-output, redaction, validation, immutability, and termination evidence covers those risks.

## 6. Cost

**$12.0000 across 6 attempts** from T-186's trusted effective accounting at launch, including this Narrator attempt's conservative reservation.

## 7. Rollback

Revert PR #178 restores the previous behavior.

---

**Approve to merge, or send back with what's wrong?**

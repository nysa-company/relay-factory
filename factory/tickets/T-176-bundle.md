# T-176 Evidence Bundle — report safety-blocked Relay approvals offline

## 1. What this does

Relay operators can now list approvals blocked for an unsafe recipient from a saved state file while Relay is offline. The report is consistently ordered, shows only the approval ID, job ID, and proposal time, and neither changes the saved state nor carries out an approval.

## 2. Preview link

Not applicable — nonvisual PR. [PR #130](https://github.com/nysa-company/relay-factory/pull/130) at exact head `9e22807c86046a293c375f00bd148e4de99339c5` adds an offline command with no browser, HTTP, or visual surface. Reviewer round 1 approved the offline reporting behavior, and every configured required GitHub check passed for that exact head, covering deterministic output and errors, sensitive-data omission, read-only operation, and offline termination.

**What to try:** With Relay stopped, run `node app/tools/blocked-approvals.js <state-file>` and confirm it prints only approvals blocked for an unsafe recipient in approval-ID order without changing the file.

## 3. Screenshots

Not applicable — nonvisual PR. The exact PR changes only offline command behavior and has no page, browser view, design reference, or HTTP endpoint to capture. Reviewer round 1 approval and passing protected CI at exact head `9e22807c86046a293c375f00bd148e4de99339c5` verify the sorted report, safe fixed errors, unchanged files and directories, self-termination, and absence of Relay or network startup.

## 4. Acceptance criteria

| # | Criterion | How it was verified | Result |
|---|---|---|---|
| AC1 | Mixed saved approvals produce exactly the two `blocked_recipient` entries, ordered `appr-alpha` then `appr-zulu`, with only `id`, `jobId`, and `proposedAt`; no sensitive or non-blocked data appears. | Named acceptance test `AC1: Frozen Fixture A reports exactly the two blocked approvals, id-sorted and projected`; Reviewer round 1 approved and all required GitHub checks passed at the exact PR head. | **PASS** |
| AC2 | A valid state with no blocked approvals prints exactly `[]` followed by one line break, with no error output. | Named acceptance test `AC2: Frozen Fixture B reports an empty blocked selection as exactly []`; Reviewer approval and protected CI passed at the exact PR head. | **PASS** |
| AC3 | Zero, two, or three arguments produce the exact usage error, exit `2`, print nothing to standard output, and create no supplied path. | Named acceptance test `AC3: zero, two, or three positional arguments exit 2 with the exact usage line and create no path`; Reviewer approval and protected CI passed. | **PASS** |
| AC4 | Missing-file and directory paths produce the exact safe read error, exit `1`, and leave each path unchanged. | Named acceptance test `AC4: each frozen read-failure path exits 1 with the exact cannot-read line and leaves the path as it was`; Reviewer approval and protected CI passed. | **PASS** |
| AC5 | Invalid JSON produces the exact safe parse error, leaks no sensitive input, and leaves file bytes and metadata unchanged. | Named acceptance test `AC5: Frozen Fixture C exits 1 with the exact invalid-JSON line, unchanged bytes, and no secret leakage`; Reviewer approval and protected CI passed. | **PASS** |
| AC6 | Every frozen structurally invalid state produces the exact invalid-state error and remains unchanged. | Named acceptance test `AC6: every frozen structural-invalid fixture exits 1 with the exact invalid-state line and unchanged bytes`; Reviewer approval and protected CI passed. | **PASS** |
| AC7 | Every covered invocation ends on its own, changes no fixture or sibling path, and repeats byte-for-byte; the implementation neither starts Relay nor uses network or child-process behavior. | Named acceptance test `AC7: every invocation self-terminates, repeats byte-identically, and stays read-only and offline`, plus Reviewer inspection; protected CI passed at the exact PR head. | **PASS** |
| AC8 | Complete acceptance tests precede implementation, each stage stays within its owned file, and all frozen repository checks pass without changes to protected product or Factory files. | Reviewer round 1 approved. Test commit `46d8788` precedes implementation commit `f64b2bc`, each changes only its owned path; every configured required GitHub check passed at exact head `9e22807c86046a293c375f00bd148e4de99339c5`, whose complete semantic diff is bound to the protected nonvisual path policy. | **PASS** |

## 5. Risk

**Low — internal change; no external send; no schema change.** A defect could omit a blocked approval, include an unrelated approval or sensitive field, produce unstable ordering, alter the saved state, or accidentally keep Relay resources running; the exact-output, redaction, immutability, repetition, and termination evidence covers those risks.

## 6. Cost

**$12.0000 across 6 attempts** from T-176's trusted effective accounting at launch, including this Narrator attempt's conservative reservation.

## 7. Rollback

Revert PR #130 restores the previous behavior.

---

**Approve to merge, or send back with what's wrong?**

# T-175 Evidence Bundle — report pending Relay approvals offline

## 1. What this does

Relay operators can now list pending approvals from a saved state file while Relay is offline. The report is consistently ordered, shows only the approval ID, job ID, and proposal time, and does not change state or carry out an approval.

## 2. Preview link

Not applicable — nonvisual PR. [PR #110](https://github.com/nysa-company/relay-factory/pull/110) at exact head `68c21960dc9b2eab895e35dd6eb982d0c730e39b` adds an offline command with no browser, HTTP, or visual surface. The existing Reviewer evidence approved the offline reporting behavior, and every configured required GitHub check passed for that exact head, covering deterministic output and errors, sensitive-data omission, read-only operation, and offline termination.

**What to try:** With Relay stopped, run `node app/tools/pending-approvals.js <state-file>` and confirm it prints only pending approvals in approval-ID order without changing the file.

## 3. Screenshots

Not applicable — nonvisual PR. The exact PR changes only offline command behavior and has no page, browser view, design reference, or HTTP endpoint to capture. Existing Reviewer approval and passing protected CI at exact head `68c21960dc9b2eab895e35dd6eb982d0c730e39b` verify the report output, redacted errors, unchanged files, self-termination, and absence of Relay or network startup.

## 4. Acceptance criteria

| # | Criterion | How it was verified | Result |
|---|---|---|---|
| AC1 | Mixed saved approvals produce exactly the two pending entries, ordered `appr-alpha` then `appr-zulu`, with only `id`, `jobId`, and `proposedAt`; no sensitive or non-pending data appears. | Named acceptance test `AC1: Frozen Fixture A reports exactly the two pending approvals, id-sorted and projected`; existing Reviewer evidence approved and all required GitHub checks passed at the exact PR head. | **PASS** |
| AC2 | A valid state with no pending approvals prints exactly `[]` followed by one line break, with no error output. | Named acceptance test `AC2: Frozen Fixture B reports an empty pending selection as exactly []`; Reviewer approval and protected CI passed at the exact PR head. | **PASS** |
| AC3 | Zero or two arguments produce the exact usage error, exit `2`, print nothing to standard output, and do not create or change a state path. | Named acceptance test `AC3: zero or two positional arguments exit 2 with the exact usage line and no state path change`; Reviewer approval and protected CI passed. | **PASS** |
| AC4 | Missing-file and directory paths produce the exact safe read error, exit `1`, and leave each path unchanged. | Named acceptance test `AC4: each frozen read-failure path exits 1 with the exact cannot-read line and leaves the path as it was`; Reviewer approval and protected CI passed. | **PASS** |
| AC5 | Invalid JSON produces the exact safe parse error, leaks no parser or sensitive text, and leaves file bytes and metadata unchanged. | Named acceptance test `AC5: Frozen Fixture C exits 1 with the exact invalid-JSON line, unchanged bytes, and no parser or secret leakage`; Reviewer approval and protected CI passed. | **PASS** |
| AC6 | Every structurally invalid frozen state produces the exact invalid-state error and remains unchanged. | Named acceptance test `AC6: every frozen structural-invalid fixture exits 1 with the exact invalid-state line and unchanged bytes`; Reviewer approval and protected CI passed. | **PASS** |
| AC7 | Every covered invocation ends on its own, writes no sibling file, changes no fixture, and repeats byte-for-byte; it does not start Relay, open a listener, or execute an approval. | Named acceptance test `AC7: every invocation self-terminates, repeats byte-identically, and changes no fixture or sibling path`, plus Reviewer inspection of the offline implementation; protected CI passed. | **PASS** |
| AC8 | Complete acceptance tests precede implementation, each stage stays within its owned file, and all frozen repository checks pass without changes to protected product or Factory files. | Existing Reviewer evidence approved the commit ordering and scope: test commit `129c7f1` precedes implementation commit `d4cae53`, each changes only its owned path. Every configured required GitHub check passed at exact head `68c21960dc9b2eab895e35dd6eb982d0c730e39b`, whose complete semantic diff is bound to the protected nonvisual path policy. | **PASS** |

## 5. Risk

**Low — internal change; no external send; no schema change.** A defect could omit a pending approval, include non-pending or sensitive fields, produce unstable ordering, alter the saved state, or accidentally keep Relay resources running; the exact-output, redaction, immutability, repetition, and termination evidence covers those risks.

## 6. Cost

**$16.0000 across 8 attempts** from T-175's trusted effective accounting at launch, including this Narrator attempt's conservative reservation.

## 7. Rollback

Revert PR #110 restores the previous behavior.

---

**Approve to merge, or send back with what's wrong?**

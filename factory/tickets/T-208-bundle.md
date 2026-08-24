# T-208 Evidence Bundle — count Relay approvals with rejection reasons offline

## 1. What this does

Relay operators can now count approvals with a saved non-empty rejection reason while Relay is stopped. The command reports only the count, uses safe errors for invalid input, and does not change the saved file, reveal private details, or send anything.

## 2. Preview link

Not applicable — nonvisual PR. [PR #216](https://github.com/nysa-company/relay-factory/pull/216) at exact head `079e1b7ccebc0850ebfe9b6abbb14ff6be318e21` adds a local offline command with no browser, HTTP, or visual surface. The existing Reviewer approval and every configured required GitHub check passing for this exact protected nonvisual head verify exact reason counts, privacy-safe output and errors, complete approval validation, read-only operation, offline termination, and the absence of external sends.

**What to try:** With Relay stopped, run `node app/tools/approval-reason-count.js <state-file>` and confirm it prints only the number of approvals with a saved non-empty reason without changing the file or sending anything.

## 3. Screenshots

Not applicable — nonvisual PR. The exact PR changes only local file-to-output command behavior and has no page, browser view, design reference, or HTTP endpoint to capture. The existing Reviewer approval and passing protected CI at exact head `079e1b7ccebc0850ebfe9b6abbb14ff6be318e21` verify nonzero and zero counts, empty/null/missing reason handling, fixed redacted errors, complete validation before counting, unchanged files and directories, self-termination, and the absence of Relay, network, or send activity.

## 4. Acceptance criteria

| # | Criterion | How it was verified | Result |
|---|---|---|---|
| AC1 | Two runs against Fixture A return exactly `{"approvalsWithReasons":3}`, counting the two frozen non-empty reasons and one-space reason but not empty, null, or missing reasons; no sensitive content is exposed and nothing changes. | Named acceptance test `AC1: two invocations against Fixture A each print the frozen three-reason count and leave the fixture untouched`; existing Reviewer approval and protected CI passed. | **PASS** |
| AC2 | Fixture B returns exactly `{"approvalsWithReasons":0}` for missing, null, and empty reasons, exposes no opaque sibling content, and changes nothing. | Named acceptance test `AC2: Fixture B prints the frozen zero count for absent, null, and empty reasons`; existing Reviewer approval and protected CI passed. | **PASS** |
| AC3 | Zero or two arguments return only the exact usage error before file access and leave candidate paths absent. | Named acceptance test `AC3: zero and two positional arguments fail with the exact usage envelope and never touch the candidate path`; existing Reviewer approval and protected CI passed. | **PASS** |
| AC4 | Missing-file and directory paths return only the exact safe read error and remain unchanged. | Named acceptance test `AC4: an absent path and a directory path fail with the exact read-failure envelope and change nothing`; existing Reviewer approval and protected CI passed. | **PASS** |
| AC5 | Malformed and empty JSON files return only the exact safe parse error, leak no input content, and remain unchanged. | Named acceptance test `AC5: Fixtures C and D fail with the exact parse-failure envelope and never echo the malformed bytes`; existing Reviewer approval and protected CI passed. | **PASS** |
| AC6 | All 30 frozen invalid state shapes return only the exact invalid-state error and remain unchanged; duplicate IDs and a valid countable approval followed by an invalid approval prove complete validation before counting. | Named acceptance test `AC6: every S1-S30 structural-invalid fixture fails with the exact invalid-state envelope after a distinctness proof`; existing Reviewer approval and protected CI passed. | **PASS** |
| AC7 | Every invocation ends within the required timeout, leaks no frozen sensitive token, and the command remains a zero-dependency, file-read-only offline tool with no server, network, child-process, or timer behavior. | Named acceptance test `AC7: the production command self-terminates under the frozen timeout and both files stay inside their frozen source boundaries`, plus Reviewer inspection; protected CI passed at the exact PR head. | **PASS** |
| AC8 | Complete acceptance tests precede implementation, each stage changes only its owned application file, protected product and Factory surfaces remain unchanged, and all required verification passes. | Reviewer approved the test-first history: test commit `9d78ad1` precedes implementation commit `30bd8ea`. Every configured required GitHub check passed at exact head `079e1b7ccebc0850ebfe9b6abbb14ff6be318e21`, whose complete semantic diff is bound to the protected nonvisual path policy. | **PASS** |

## 5. Risk

**Low — internal change; no external send; no schema change.** A defect could report the wrong count, expose private saved state, accept corrupt state, alter the saved file, or start Relay, network, or send activity; exact-output, validation, privacy, immutability, offline, and termination evidence covers those risks.

## 6. Cost

**$12.0000 across 6 attempts** from T-208's trusted effective accounting at launch, including this Narrator attempt's conservative reservation.

## 7. Rollback

Revert PR #216 restores the previous behavior.

---

**Approve to merge, or send back with what's wrong?**

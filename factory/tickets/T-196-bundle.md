# T-196 Evidence Bundle — count jobs for one Relay event offline

## 1. What this does

Relay operators can now count the saved jobs linked to one event while Relay is stopped. The command looks up the event by its exact ID, reports only the event ID and job count, and does not change the saved file or expose private state.

## 2. Preview link

Not applicable — nonvisual PR. [PR #196](https://github.com/nysa-company/relay-factory/pull/196) at exact head `1e47843ffc1c1f19e814251515a27a136d3d22db` adds a local offline command with no browser, HTTP, or visual surface. Existing Reviewer approval and every configured required GitHub check passing for this exact protected nonvisual head cover exact event lookup and counting, zero-count output, safe errors, complete state validation, privacy, read-only operation, and offline termination.

**What to try:** With Relay stopped, run `node app/tools/event-job-count.js <state-file> <event-id>` and confirm it prints only that event's ID and saved job count without changing the file.

## 3. Screenshots

Not applicable — nonvisual PR. The exact PR changes only local file-to-output command behavior and has no page, browser view, design reference, or HTTP endpoint to capture. Existing Reviewer approval and passing protected CI at exact head `1e47843ffc1c1f19e814251515a27a136d3d22db` verify counts of three, one, and zero; exact case-sensitive lookup; fixed redacted errors; full structural validation; unchanged files and directories; self-termination; and absence of Relay or network startup.

## 4. Acceptance criteria

| # | Criterion | How it was verified | Result |
|---|---|---|---|
| AC1 | Two `event-alpha` lookups each return the exact count `3`, expose no sensitive content, and leave the fixture and parent unchanged. | Named acceptance test `AC1: repeated event-alpha invocations against Fixture A print the frozen count of three and leave the fixture untouched`; existing Reviewer approval and protected CI passed at the exact PR head. | **PASS** |
| AC2 | `event-zulu` returns `1` and `event-zero` returns `0`; both outputs are exact, private, and read-only. | Named acceptance test `AC2: the event-zulu and event-zero lookups against Fixture A print the frozen counts of one and zero`; Reviewer approval and protected CI passed. | **PASS** |
| AC3 | Missing and differently cased event IDs return only the exact not-found error; a dangling job link remains a valid nonmatch, and queried state stays unchanged. | Named acceptance test `AC3: every frozen lookup miss, including the case-distinct ID and Fixture B's dangling link, fails with the exact not-found envelope`; Reviewer approval and protected CI passed. | **PASS** |
| AC4 | Zero, one, or three arguments return the exact usage error before any state-file read and do not create a supplied path. | Named acceptance test `AC4: zero, one, and three positional arguments fail with the exact usage envelope before any state-file read`; Reviewer approval and protected CI passed. | **PASS** |
| AC5 | Missing-file and directory paths return only the safe read error and remain unchanged. | Named acceptance test `AC5: an absent path and a directory path fail with the exact read-failure envelope and change nothing`; Reviewer approval and protected CI passed. | **PASS** |
| AC6 | Malformed and empty JSON files return only the exact parse error, expose no input content, and remain unchanged. | Named acceptance test `AC6: Fixtures C and D fail with the exact parse-failure envelope and never echo the malformed bytes`; Reviewer approval and protected CI passed. | **PASS** |
| AC7 | All 19 frozen invalid state shapes return only the exact invalid-state error after distinctness checks; complete event and job arrays are validated before lookup or counting. | Named acceptance test `AC7: every S1-S19 structural-invalid fixture fails with the exact invalid-state envelope after a pairwise distinctness proof`; Reviewer specifically approved the ordering-sensitive S13 and S19 coverage, and protected CI passed. | **PASS** |
| AC8 | Every invocation ends within the fixed timeout, emits none of the 18 sensitive tokens, and the command stays within its synchronous, read-only, offline file-access boundary. | Named acceptance test `AC8: the production command self-terminates under the frozen timeout and both roles stay inside their frozen source boundaries`, plus Reviewer inspection; protected CI passed at the exact PR head. | **PASS** |
| AC9 | Complete acceptance tests precede implementation, each stage changes only its owned application file, protected files and schema remain unchanged, and required verification passes. | Reviewer approved that test commit `fcb8224` precedes implementation commit `8883833` and that each changes only its owned path. Every configured required GitHub check passed at exact head `1e47843ffc1c1f19e814251515a27a136d3d22db`, whose complete semantic diff is bound to the protected nonvisual path policy. | **PASS** |

## 5. Risk

**Low — internal change; no external send; no schema change.** A defect could report the wrong count, expose private saved state, accept malformed state, reject valid state, change the saved file, or start Relay or network resources; exact-output, validation, privacy, immutability, and termination evidence covers those risks.

## 6. Cost

**$12.0000 across 6 attempts** from T-196's trusted effective accounting at launch, including this Narrator attempt's conservative reservation.

## 7. Rollback

Revert PR #196 restores the previous behavior.

---

**Approve to merge, or send back with what's wrong?**

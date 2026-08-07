# T-174 Evidence Bundle — report dead Relay jobs offline

## 1. What this does

Relay operators can now list dead jobs from a saved Relay state file without starting Relay or changing the file. The report is consistently ordered, includes only the four useful identifying and retry fields, and gives fixed messages for invalid files or incorrect usage.

## 2. Preview link

Not applicable — nonvisual PR. [PR #116](https://github.com/nysa-company/relay-factory/pull/116) at exact head `70717b1834f45e189e2c296e716623bb4f872af2` adds an offline file-to-JSON command with no browser, HTTP, or deployed surface; the existing Reviewer evidence approved the unchanged offline behavior and every configured required GitHub check passed for this exact protected nonvisual head.

**What to try:** run the command against a saved Relay state file and confirm it prints only dead jobs while leaving the file unchanged.

## 3. Screenshots

Not applicable — nonvisual PR. The exact PR changes only offline command and acceptance-test behavior, so there is no screen or design reference to capture; the existing Reviewer evidence and passing protected GitHub checks cover the sorted report, empty report, structural and read failures, usage errors, and unchanged input files and directories.

## 4. Acceptance criteria

| # | Criterion | How it was verified | Result |
|---|---|---|---|
| AC1 | Fixture A produces the exact sorted four-field dead-job report, with `job-Zulu` before lowercase IDs, and leaves the file and directory unchanged. | Acceptance test `AC1: Fixture A reports the sorted four-field projection of its dead jobs and is left byte-identical`; Reviewer round 3 verified the UTF-16 ordering and file/directory preservation, and protected CI passed at the exact head. | **PASS** |
| AC2 | Fixtures B and C each produce an empty report, accept harmless input formatting and unconsumed collection contents, and remain unchanged. | Acceptance test `AC2: Fixtures B and C each report an empty array and are left byte-identical`; Reviewer round 3 verified the generic reporting path, and protected CI passed at the exact head. | **PASS** |
| AC3 | Every frozen invalid input returns the exact invalid-state error and changes nothing on disk. | Acceptance test `AC3: every frozen invalid input fails with the exact invalid-state envelope and changes nothing on disk`; Reviewer round 3 verified reachable structural validation and disk preservation, and protected CI passed at the exact head. | **PASS** |
| AC4 | Zero or two file arguments return the exact usage error without reading or changing the supplied files. | Acceptance test `AC4: zero and two state-file arguments fail with the exact usage envelope and read nothing`; Reviewer round 3 verified arity-failure immutability, and protected CI passed at the exact head. | **PASS** |
| AC5 | Acceptance tests precede implementation, role boundaries are preserved, only allowed Node modules are used, and Relay's server, schema, retry behavior, dependencies, and Factory controls are unchanged. | Reviewer round 3 approved the commit order, owned paths, dependencies, and offline-only implementation; the trusted host confirms the complete exact-head PR semantic diff is confined to the protected nonvisual path policy. | **PASS** |
| AC6 | The targeted acceptance test, full application regression, and test-immutability check all pass. | Reviewer round 3 recorded 5/5 targeted tests, 56/56 application tests, and a passing immutability check; every configured required GitHub check passed for PR #116 at exact head `70717b1834f45e189e2c296e716623bb4f872af2`. | **PASS** |

## 5. Risk

**Low — internal change; no external send; no schema change.** A defect could omit dead jobs, order or report fields incorrectly, reveal saved error details, mishandle invalid state, or alter the input file; the exact-output, validation, and file-preservation acceptance evidence covers these risks.

## 6. Cost

**$26.0000 across 13 attempts** from T-174's trusted effective runtime-ledger accounting, including this Narrator attempt's conservative reservation.

## 7. Rollback

Revert PR #116 restores the previous behavior.

---

**Approve to merge, or send back with what's wrong?**

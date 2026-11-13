# Nathan Agent Skills

Skills that agents load to carry out an engineering workflow in a consuming repo. This glossary holds the language those skills share.

## Language

### Test audit

**Test audit**:
A review of a repo's test suite that reports unneeded tests and files a ticket for each finding.
_Avoid_: Test cleanup, test review

**Unneeded test**:
A test whose removal or relocation would lose no verification of behaviour. It is one of: tautological, redundant, implementation-coupled, misplaced or dead.
_Avoid_: Bad test, useless test

**Tautological test**:
A test that still passes when the behaviour it claims to verify is broken.
_Avoid_: Trivial test, no-op test

**Redundant test**:
A test that verifies a behaviour another test already verifies through the same interface.
_Avoid_: Duplicate test

**Implementation-coupled test**:
A test that fails on a refactor that changes no behaviour.
_Avoid_: Brittle test, fragile test

**Misplaced test**:
A test that verifies at an expensive level what a cheaper level already covers.

**Dead test**:
A test that is skipped or disabled with no ticket tracking its return.
_Avoid_: Skipped test

**Mutation check**:
Breaking the behaviour under test and confirming a suspected tautological test still passes, which proves the finding.

### Flaky tests

**Flaky test**:
A test that both failed and passed on the same commit with no code change.
_Avoid_: Intermittent test, unstable test

**Flake occurrence**:
One CI run in which a test failed and then passed on the same commit. Repeated retries inside one run are a single occurrence, and a test that fails every attempt is a real failure, not an occurrence.
_Avoid_: Flake, flaky failure

**Flaky-test record**:
The issue-tracker ticket for one flaky test, holding its identity and every flake occurrence.
_Avoid_: Flaky list entry

**Quarantine**:
The state of a flaky test that still runs but cannot fail the build. A test enters it at three flake occurrences within 30 days that span at least two branches, while the quarantine cap set in the repo's CI doc is not reached, and leaves it when fixed or after 30 days, whichever comes first.
_Avoid_: Skip, disable, mute

**Verdict script**:
The script that runs a CI job's tests, retries the failures, records flake occurrences and decides whether the build passes, ignoring failures of quarantined tests.
_Avoid_: Recorder, flaky detector

### CI run times

**Run-time review**:
A scheduled analysis of CI run history that files suggestions for shortening runs.
_Avoid_: CI audit, pipeline analysis

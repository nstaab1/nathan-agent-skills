# Quarantine is a tracker label, not a change to test code

A flaky test enters quarantine when its flaky-test record gets the quarantine label. A verdict script at the end of the CI test job reads the labelled records and fails the build only when a failed test is not among them. We chose this so that quarantine needs no commit, works the same in every test framework, and takes effect on every branch at once.

## Considered Options

- **Framework markers** (for example `@pytest.mark.quarantine` with a non-blocking CI job). Rejected because entering quarantine becomes a code change: CI would need write access to push to a PR branch, cannot push to PRs from forks, and would need to edit test files correctly in every framework.
- **A separate auto-opened quarantine PR.** Rejected because the flaky test keeps blocking builds until someone merges it.

## Consequences

- CI depends on the issue tracker at run time. When the tracker is unreachable the script treats nothing as quarantined, so an outage makes the build stricter and never lets a real failure through.
- Quarantine is not visible in the test code, and local runs still fail on a quarantined test.
- Anyone who can label tickets can make a test non-blocking. A cap on the number of quarantined tests and a 30-day expiry bound the damage.

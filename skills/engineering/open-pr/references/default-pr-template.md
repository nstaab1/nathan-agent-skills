# Default PR template

Use this as the starting point when the repository has no pull request template. Before committing it as `.github/pull_request_template.md`, ask only the tailoring questions that change what contributors should reliably fill in: whether the repository needs screenshots, rollout or migration notes, rollback steps, or a dedicated reviewer-focus section. Copy only the contents of the fenced block into the repository template.

```markdown
## Summary

<!-- Why is this change needed, and what outcome does it create? -->

## Changes

- <!-- Concrete behavior or implementation change -->

## Verification

### Automated checks

- [ ] `<command>` — <!-- Result -->

### Manual test script

1. <!-- Exact action from a cold start -->
   - Expected: <!-- Observable result that proves this step worked -->

## Issues and dependencies

<!-- Add `Closes #123` for each issue completed by this PR, or explain why none applies. -->
- <!-- Closing link or `N/A — ...` -->
- Related: <!-- `#456`, or `N/A — ...` -->
- Unblocks: <!-- `#789` or task link, or `N/A — ...` -->

## Reviewer notes

- Focus: <!-- Decision, risky area, or file that deserves attention -->
- Risks: <!-- Known failure modes, or `N/A — ...` -->
- Rollback: <!-- Safe reversal path, or `N/A — ...` -->

## Screenshots

<!-- For visible UI changes, add before/after images. Otherwise: `N/A — no visual changes`. -->

## Rollout or migration

<!-- Deployment order, data migration, feature flag, or `N/A — no special rollout`. -->
```

The required core is Summary, Changes, Verification with a numbered manual test script, and Issues and dependencies. Keep the remaining sections when they surface decisions or operational risk in that repository; remove them from the committed template when contributors would repeatedly fill them with noise.

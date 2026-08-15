---
name: open-pr-agentic
description: Open an unmerged pull request for committed work, fill the repository template, link the source issue, and advance it from agent-ready to awaiting human verification. Use at the shipping boundary of attended or autonomous implementation.
disable-model-invocation: true
---

# Open PR Agentic

Ship committed work for human verification. The run is done when the PR is open against the correct branch and the linked issue reflects its post-build state. Never merge the PR.

## Resolve the work

Before writing the PR body:

1. Confirm the worktree is clean and the implementation commit exists on the current branch.
2. Identify the source issue from the user's reference, branch name, commits, or repository workflow. Halt if multiple issues are plausible.
3. Resolve the PR target branch from explicit repository instructions, then `origin/HEAD`, then the remote default. Explicit integration-branch instructions win.
4. Read the configured issue-tracker and triage-label docs.

## Fill the repository template

Read the PR template from `.github/pull_request_template.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `docs/pull_request_template.md`, or `.github/PULL_REQUEST_TEMPLATE/`. Fill every applicable section from the work already done, follow its HTML comments as instructions, and remove those comments from the submitted body.

With no template, cover:

- what changed;
- checks run and their results;
- numbered manual-verification steps from a cold start, each naming the expected result; and
- `## Reviewer: look here` for judgment findings passed from review.

When the change has no running-app surface, say so and give the evidence that replaces manual UI verification.

Write the body to a temporary file and pass it with `gh pr create --body-file`; include `Closes #<issue-number>` and set `--base <base-branch>` explicitly.

## Advance the issue

Use the repository's configured label strings. Remove the agent-ready label and add the awaiting-human-verification label, such as `ready-for-testing`, when that lifecycle state exists.

If no post-build verification label is configured, leave labels unchanged and say so. Never substitute `ready-for-human`: that is a pre-build triage verdict, not a post-build verification state.

## Report

Give the user the PR URL, target branch, linked issue, label transition, and any reviewer-look-here items. Do not merge.

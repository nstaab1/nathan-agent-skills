---
name: open-pr
description: "Open a pull request for committed work against the repository's configured base branch."
disable-model-invocation: true
---

# Open PR

Run this manually after `implement-copy` has committed the current branch. The run is done when the latest base-branch changes are integrated, the updated work is verified and pushed, and the PR is open against the explicit base branch. Never merge it.

## Prepare the branch

1. Require a clean worktree, a named topic branch, and at least one commit not in the base branch. Leave intended changes for the user to commit before continuing.
2. Read the **base branch** from `docs/agents/branching.md`, the same source of truth used by `implement-copy`. If the file is missing or ambiguous, inspect `git branch -r`, propose the likely integration branch, and ask the user to confirm it. Never guess the PR target.
3. Stay on the topic branch and bring in the latest remote base:

   ```bash
   git fetch origin
   git merge --no-edit origin/<base-branch>
   ```

   Follow an explicit repository rebase policy when one exists. If integration conflicts, resolve them by the intent of both branches and finish the merge or rebase before continuing.
4. Run the repository's relevant automated checks after integration. Run every manual test needed to cover user-visible behavior, or preserve the numbered manual test script for the user when the check requires their access or judgment. In either case, give the user a reproducible manual test script whose every step names its expected observable result.
5. Push the topic branch to `origin`. Check whether it already has an open PR; return that PR instead of creating a duplicate.

Preparation is complete only when `git status` is clean, `git merge-base --is-ancestor origin/<base-branch> HEAD` succeeds, the checks are accounted for, and the remote topic branch contains `HEAD`.

## Build the PR body

Inspect the full diff and commits from `origin/<base-branch>...HEAD`. Resolve issue relationships from the user's request, branch name, commits, and repository issue-tracker conventions; never invent an issue number or claim that work closes an issue when it does not.

Search case-insensitively for a single-template file named `pull_request_template.md` under the repository root, `docs/`, or `.github/`, and for selectable Markdown templates under `.github/PULL_REQUEST_TEMPLATE/`.

- With one applicable repository template, use its headings, order, and checklists as the exact structure. Follow its comments as instructions, replace its placeholders, and omit instructional comments from the submitted body.
- With several plausible templates, ask the user which one applies.
- With no repository template, read [the default PR template](references/default-pr-template.md). Show it to the user and ask whether to add it at `.github/pull_request_template.md`, tailor it first, or use it only for this PR. Continue once the user chooses; adding the repository file also requires committing and synchronizing that change before opening the PR.

Fill every applicable section from evidence. Distinguish automated checks already run from the manual test script the user still needs to perform. Use GitHub closing syntax only for work this PR completes; list related and newly unblocked work separately. Mark a required section `N/A` with a short reason when it does not apply.

## Open and report

Write the final body to a temporary file, then create the PR with the head and base explicit:

```bash
gh pr create --base <base-branch> --head <topic-branch> --title <title> --body-file <body-file>
```

Use a draft only when the user or repository workflow asks for one. Report the PR URL, base and topic branches, checks run, manual testing left for the user, and the closing, related, and unblocked issue links.

---
name: open-pr
description: "Open a pull request for committed work against the repository's configured base branch, then watch its checks to green."
disable-model-invocation: true
---

# Open PR

Run this manually after `implement-copy` has committed the current branch. The run is done when the latest base-branch changes are integrated, the updated work is verified and pushed, the PR is open against the explicit base branch, and every PR check is green or has been handed to the user. Never merge it.

## Prepare the branch

1. Require a clean worktree, a named topic branch, and at least one commit not in the base branch. Leave intended changes for the user to commit before continuing.
2. Read the **base branch** from `docs/agents/branching.md`, the same source of truth used by `implement-copy`. If the file is missing or ambiguous, inspect `git branch -r`, propose the likely integration branch, and ask the user to confirm it. Never guess the PR target.
3. Stay on the topic branch and bring in the latest remote base:

   ```bash
   git fetch origin
   git merge --no-edit origin/<base-branch>
   ```

   Follow an explicit repository rebase policy when one exists. If integration conflicts, resolve them by the intent of both branches and finish the merge or rebase before continuing.
4. Run each of the repository's relevant automated checks once after integration. A failure gets exactly one rerun, to tell a flake from a defect. Fix a defect you can name; on anything else — a repeat failure you cannot explain, or a rerun that passes — halt and report both outputs verbatim, so the user makes the call. Run every manual test needed to cover user-visible behavior, or preserve the numbered manual test script for the user when the check requires their access or judgment. In either case, give the user a reproducible manual test script whose every step names its expected observable result.
5. Push the topic branch to `origin`. Check whether it already has an open PR; return that PR instead of creating a duplicate.

Preparation is complete only when `git status` is clean, `git merge-base --is-ancestor origin/<base-branch> HEAD` succeeds, every check has passed or been halted on and reported, and the remote topic branch contains `HEAD`.

## Build the PR body

Inspect the full diff and commits from `origin/<base-branch>...HEAD`. Resolve issue relationships from the user's request, branch name, commits, and repository issue-tracker conventions; never invent an issue number or claim that work closes an issue when it does not.

Search case-insensitively for a single-template file named `pull_request_template.md` under the repository root, `docs/`, or `.github/`, and for selectable Markdown templates under `.github/PULL_REQUEST_TEMPLATE/`.

- With one applicable repository template, use its headings, order, and checklists as the exact structure. Follow its comments as instructions, replace its placeholders, and omit instructional comments from the submitted body.
- With several plausible templates, ask the user which one applies.
- With no repository template, read [the default PR template](references/default-pr-template.md). Show it to the user and ask whether to add it at `.github/pull_request_template.md`, tailor it first, or use it only for this PR. Continue once the user chooses; adding the repository file also requires committing and synchronizing that change before opening the PR.

Fill every applicable section from evidence. Distinguish automated checks already run from the manual test script the user still needs to perform. Use GitHub closing syntax only for work this PR completes; list related and newly unblocked work separately. Mark a required section `N/A` with a short reason when it does not apply.

## Open the PR

Write the final body to a temporary file, then create the PR with the head and base explicit:

```bash
gh pr create --base <base-branch> --head <topic-branch> --title <title> --body-file <body-file>
```

Use a draft only when the user or repository workflow asks for one.

## Watch the checks

Watch the PR's checks, on a new PR or a returned one, until none is pending:

```bash
gh pr checks <pr> --watch
```

Checks can take a minute to register after a push, so "no checks reported" means no CI only when the repository has no workflow that runs on pull requests. A watch that outlives your command timeout is still open; start it again.

Triage every red check from its failed log (`gh run view <run-id> --log-failed`), making the same flake-or-defect call as preparation step 4. A log that already names a defect needs no rerun; any other red check gets exactly one (`gh run rerun <run-id> --failed`).

- A **defect** is a failure you can trace to this PR's diff. Fix it, pass the local check that covers it, commit, push, update the PR body where the fix changes what it says, and watch again.
- A **flake** is a failure this PR did not cause: the rerun goes green with no code change, or the same check is red on `<base-branch>` itself. Halt and hand it to the user: the PR URL, the check, the failing test, the failed log excerpt verbatim, and the evidence that clears this PR. Ask whether to fix it in this PR or open a ticket for it, then carry out the choice: fix it on this branch and watch again, or file the ticket by the repository's issue-tracker conventions and list it in the PR body as related work.
- A red check you can place in neither, one that repeats with a cause you cannot name, halts the same way, with both outputs verbatim.

Watching is complete only when no check is pending, every red check has been triaged, and every flake or unplaced failure has the user's decision, including a flake whose rerun went green.

## Report

Report the PR URL, base and topic branches, local checks run, the final state of every PR check, each defect fixed after opening, each flake with the user's decision and any ticket filed, manual testing left for the user, and the closing, related, and unblocked issue links.

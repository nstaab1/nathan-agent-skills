---
name: implement-afk-agentic
description: Implement and ship one agent-ready ticket unattended using its pre-agreed seams, halting instead of guessing when the ticket leaves a decision open. Use for autonomous or cloud-agent coding runs that should end in an unmerged PR ready for human verification.
disable-model-invocation: true
---

# Implement AFK Agentic

Implement one ticket with nobody at the keyboard. The ticket is the human input for the run: execute what it settles and halt on what it leaves open.

When configuring this workflow in a new repository or changing its lifecycle, read [references/afk-implementation.md](references/afk-implementation.md).

## Preconditions

Before writing code, read the issue tracker, triage-label, domain-doc, and repository instructions. Confirm that:

- the ticket carries the configured `ready-for-agent` label;
- the ticket has a filled **Seams under test** section;
- its acceptance criteria are testable and unambiguous;
- the repository declares its PR target/integration branch, or its remote default branch can be resolved unambiguously; and
- the issue tracker operations needed to comment and relabel are available.

Any failed precondition triggers the halt rule. A ticket without named seams was never AFK-ready.

## Branch

Resolve `<base-branch>` in this order:

1. An explicit target or integration branch in `AGENTS.md`, `CLAUDE.md`, or `docs/agents/`.
2. The local `origin/HEAD` symbolic ref.
3. The remote repository's default branch.

An explicit repository workflow beats the remote default. Conflicting instructions trigger the halt rule.

Then:

1. Fetch the latest `<base-branch>` from `origin`.
2. Derive `<simple-title>` from the issue title: lowercase it, replace each run of non-alphanumeric characters with `-`, and trim leading or trailing hyphens.
3. Create and switch to `issue/<issue-number>-<simple-title>` from `origin/<base-branch>`, using the numeric issue number without `#`.

Start the build only when the branch has that exact name and its initial `HEAD` equals `origin/<base-branch>`. An operational failure stops the run with ticket labels unchanged.

## Build

Drive `/tdd` one red-green vertical slice at a time. The ticket's **Seams under test** section is the seam agreement: test only at those seams without asking for reconfirmation.

Run focused tests and typechecking throughout. Run the full relevant test suite once at the end.

## Halt rule

The moment a decision arises that the ticket, spec, domain docs, ADRs, and repository instructions do not settle:

1. Comment on the ticket with the precise ambiguity and the options discovered.
2. Remove the configured `ready-for-agent` label.
3. Add the configured `needs-info` label when facts are missing, or `ready-for-human` when human judgment is required.
4. Stop without opening a PR.

A precise halt is a successful run. Inventing a seam or design choice to keep moving is a failed run.

## Review

Run `/code-review` using `origin/<base-branch>` as the fixed point. Split its findings:

- **Mechanical.** One clear fix with no trade-off. Fix it and rerun the affected checks.
- **Judgment.** Trade-offs, style calls, or anything debatable. Leave the code as-is and record each item under `## Reviewer: look here` in the PR body.

## Ship

Commit the work, then run `/open-pr-agentic` against `<base-branch>`. Open the PR but never merge it.

Done means the full suite is green, the PR is open against the configured branch, the linked issue is awaiting human verification when that state is configured, and every judgment finding is prominent in the PR body.

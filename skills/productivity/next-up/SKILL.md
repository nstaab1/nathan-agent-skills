---
name: next-up
description: "Capture the current work context and recommended next steps in NEXTUP.md."
disable-model-invocation: true
---

# Next Up

Create or refresh `NEXTUP.md` at the current repository root so the user can resume this work after switching contexts. Resolve the root with `git rev-parse --show-toplevel`; outside Git, use the current working directory. Treat the file as one current snapshot rather than a history log.

## Reconstruct the stopping point

1. Review the current agent conversation for the user's goal, completed work, decisions, failed attempts, validation results, unfinished work, and open questions. The conversation is the source of truth for intent.
2. Inspect the repository for the current branch, working-tree status, recent relevant commits, and the diff or changed files. Open only the artifacts needed to resolve uncertainty. The repository is the source of truth for what actually exists.
3. Read an existing `NEXTUP.md` for continuity. Carry forward only context that remains true and useful; rewrite the file as the present snapshot so completed or abandoned work does not accumulate.

Separate what is verified complete, what is still in progress, and what is merely recommended. State uncertainty instead of reconstructing missing context as fact. Keep secrets and sensitive personal data out of the persistent file.

## Write `NEXTUP.md`

Get the current local time from the environment when writing the file. Use a timestamp with date, time, timezone abbreviation, and UTC offset, such as `2026-08-26 14:30:00 EDT (UTC-0400)`.

Use this structure:

```markdown
# Next up

> Last updated: `<local timestamp>`
> Repository: `<repository name or root path>`
> Branch: `<branch, or N/A outside Git>`

## Where I left off

<The active goal and exact stopping point in a few sentences.>

## Completed

- <Verified outcome, with a path, commit, or test result when useful.>

## In progress

- <Unfinished work and its current state.>

## Recommended next steps

1. **<Immediate action>** — <Why it comes next.> Done when: <observable completion criterion>.

## Open questions and blockers

- <Decision, dependency, failure, or `None known`.>

## Resume context

- Relevant files: `<paths>`
- Validation: `<commands and results, or not yet run>`
- Working tree: `<clean, or concise changed-file summary>`
```

Write one to three recommended next steps, ordered by continuity and leverage. The first must be directly actionable from the recorded state. Reference existing specs, issues, commits, and files instead of copying their contents.

When the conversation does not contain enough recent work to identify a stopping point, say what is unknown and recommend the smallest inspection or decision that would recover it.

The run is complete when `NEXTUP.md` has a fresh timestamp, accounts for every meaningful open thread in the current agent window, matches the repository state, and gives the user a concrete first action. Report the file path and that first recommendation.

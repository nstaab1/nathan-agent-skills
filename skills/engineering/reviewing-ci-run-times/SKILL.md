---
name: reviewing-ci-run-times
description: "Run-time review: read the last 30 days of a repo's CI runs and file one ticket of suggestions for shortening them, ranked by minutes saved per week. Use when the user wants CI run times reviewed or CI runs shortened."
---

A **run-time review** reads a repo's CI run history and files one ticket of suggestions for shortening its runs, ranked by minutes saved per week. It runs weekly as a scheduled agent, and by hand when someone wants to check after a change. Each review links the review before it. The first review in a repo is the **baseline**, whose numbers every later review compares against.

The review reads the CI run history, the CI config and the repo's git history. Its only writes are tickets: the review ticket, a child ticket for each clear fix, and the comment that closes the previous review.

Everything provider-specific comes from the repo's CI doc, `docs/agents/ci.md`: the commands, where the CI config lives, the test job and the labels. Tickets follow `docs/agents/issue-tracker.md`. A triage role such as `ready-for-agent` becomes a label through `docs/agents/triage-labels.md`, or keeps its own name when that file is absent. On a tracker with labels, create a label it lacks before applying it. When the CI doc or the issue-tracker doc is missing, tell the developer to run `/setup-agent-skills`, and stop.

## 1. Read the CI doc

Find each field by its heading. A field that reads `None.` isn't set up.

- `## CI provider`: the provider and where its config lives.
- `## Run history`: the commands **List runs**, **Jobs and steps of a run**, **Failed log**, **Full log of a run** and **Results file of a run**.
- `## Test command`: the test **Job** and its **Results file**.
- `## Verdict script`: **Location**, which says whether `fixing-flaky-tests` has wired the verdict script.
- `## Labels`: the **Flaky label** that every flaky-test record carries.
- `## Scheduled agents`: whether a `reviewing-ci-run-times` routine exists.

When **List runs** reads `None.`, the review has no history to read. Tell the developer to fill in the CI doc's Run history by running `/setup-agent-skills`, file nothing, and stop. Any other Run history command or `## Test command` field that reads `None.` is a **gap**. Each check that needs it, as [CHECKS.md](CHECKS.md) lists, is reported as not made.

Done when every field above is read and each one the review lacks is recorded as a gap.

## 2. Find the previous review

Every review ticket is titled `Run-time review <YYYY-MM-DD>`, with the date it was filed. Search the tracker for tickets in every state, open and closed, whose title starts with `Run-time review `. Use the tracker's title search where it has one, and read past the first page of results. The **previous review** is the match created most recently.

No match means this review is the baseline. Otherwise read the previous review in full, comments included, and note:

- Its Numbers table, which this review's Baseline and Previous columns copy.
- Each of its suggestions, and the state of its child ticket when it has one: open, closed with the change made, or declined.
- Every declined suggestion. A suggestion is declined when its child ticket was closed with the `wontfix` role or a comment declining it, when a person declined it in a comment on the review, or when the previous review lists it under Declined.

Done when this review is known to be the baseline, or the previous review's numbers, suggestions and declined suggestions are noted.

## 3. Fetch the history

Save every command's output in a folder outside the repo, such as a temporary directory, and save each log the checks read there too. Compute every figure in later steps with a script over those files, so the numbers come out the same way every week.

1. The window starts 30 days before today. Run **List runs** for runs created since then, once for the default branch and once for PRs, each limited to 200. When the command can't narrow by branch or trigger, filter its output instead.
2. Merge the two lists, drop runs still in progress, sort newest first and keep the newest 200. **Days covered** count from the latest of three times to now: the window's start, the first commit of the CI config the CI doc names, and, when the cap cut the list, the oldest kept run's creation. A repo whose CI is younger than 30 days, or busy enough to hit the cap, covers fewer days, and its rates per week stay true.
3. Run **Jobs and steps of a run** for every kept run, covering every attempt.
4. Run **Results file of a run** for the ten most recent successful runs of the test job, default-branch runs first.
5. Read the CI config the CI doc names.

When **List runs** fails, report its error, file nothing and stop. When it returns no runs, report that the repo had no CI runs in the window, file nothing and stop. Any other command that fails is a gap, whether or not it is marked _untried_. Record its error.

Done when the saved files hold the kept runs, the jobs and steps of each, the results files that downloaded, and each gap with its error.

## 4. Run the checks

Run every check in [CHECKS.md](CHECKS.md) over the saved files: slow jobs and steps, caching, parallelism, sharding, path filters, slow tests, rerun rate and queue time. CHECKS.md defines the measures they share, this review's numbers, and how each check estimates minutes saved per week.

Done when this review's numbers are computed, each of the eight checks ends in suggestions, nothing found, or a gap naming what it lacked, and every suggestion has an estimate and its basis.

## 5. Rank

Sort the suggestions by minutes saved per week, most first. Break ties by runner minutes saved per week. Then give each suggestion one of four dispositions:

- **Declined**: step 2 found it declined. It moves to the Declined section, out of the ranking, and gets no child ticket.
- **Carried**: an open child ticket from an earlier review covers it. Its row links that ticket, and no new ticket is filed.
- **Clear fix**: it names the exact change: the file, the job or step, and what to add, move or remove. It needs no decision only a person can make, such as spending more runner minutes or money, or changing how builds pass. It gets a child ticket.
- **Needs a decision**: every other suggestion. It stays a row in the review ticket for a person to decide.

Done when every suggestion has a rank and a disposition.

## 6. File

Write the tickets from [REVIEW-TICKET.md](REVIEW-TICKET.md), then:

1. File the review ticket with the `needs-triage` role.
2. File each clear fix as a child ticket with the `ready-for-agent` role. Link it to the review ticket the way the issue-tracker doc links a child ticket to its parent. Where the doc names no way, start the child's body with `Part of <review ticket link>`.
3. Edit the review ticket's body so each clear fix's row links its child ticket.
4. Comment on the previous review with this review's link, then close it if it is still open.

When the person running the review by hand asks for a report only, show the ticket bodies instead and file nothing.

Done when the review ticket is filed, every clear fix has a child ticket linked from its row, and any previous review is closed with a link to this one.

## 7. Report

End with:

- The review ticket's link, and whether it is the baseline.
- The top three suggestions with their minutes saved per week.
- The child tickets filed.
- Each gap, with the CI doc field or command to fix.
- When slow tests dominate, the test-audit scope as a line the developer can run: `Run a test audit with auditing-tests over <scope>.`
- When `## Scheduled agents` has no `reviewing-ci-run-times` line, that the weekly review isn't set up, and the routine below.

## The weekly routine

The weekly review is a scheduled agent the developer creates on their agent platform. This skill describes it and doesn't create it.

Run the first review by hand. It becomes the baseline, and it shows that the CI doc's commands work before a routine depends on them. Then create the routine:

- **Cadence**: weekly, early on the first working day, such as Monday at 06:00, so the review is waiting when the week starts.
- **Where it runs**: any scheduled agent that starts from a fresh clone of the repo with its full git history and this skill installed, the CI provider's tools signed in with read access to runs, and the tracker's tools signed in with rights to create, comment on and close tickets.
- **Prompt**:

  > Run a run-time review of this repo with the reviewing-ci-run-times skill. This is the scheduled weekly review: file the review ticket and its child tickets, and close the previous review. Your only writes are tickets. End with the review ticket's link and the top three suggestions.

Then record it under the CI doc's `## Scheduled agents`, in place of `None.` when the section reads that: `- reviewing-ci-run-times: weekly, <where it runs>`.

To run a review by hand, ask for one, such as "run a run-time review". It takes the same steps and files a ticket, which the next scheduled review links as its previous review. Ask for a report only to see the result without filing anything.

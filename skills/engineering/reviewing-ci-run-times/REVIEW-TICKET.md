# Review ticket and child tickets

The tickets a run-time review files. The next review finds a review ticket by its title and reads it by its headings, so keep both as written.

## Review ticket

Title: `Run-time review <YYYY-MM-DD>`, with the date it was filed.

The body opens with two lines:

```markdown
Previous review: <link>. Baseline: <link>.
Window: <start of days covered> to <end date>, <days covered> days, <n> runs, <n> on the default branch and <n> from PRs.
```

The baseline review writes `Previous review: none. This review is the baseline.` A later review copies the Baseline link from the previous review, or links the previous review itself when that one was the baseline. When the days covered are fewer than 30, the Window line says why: the CI is younger than 30 days, or the 200-run cap cut the list.

The sections follow in this order, each under a `##` heading in the ticket.

### Numbers

| Measure | Baseline, <date> | Previous, <date> | This review |
| --- | --- | --- | --- |

One row per measure in the Numbers section of [CHECKS.md](CHECKS.md). Copy the Baseline column from the previous review's Baseline column, or from its This review column when the previous review was the baseline. Copy the Previous column from its This review column. A row the previous review lacks reads `none` there. The baseline review has only the Measure and This review columns.

### Suggestions

| # | Suggestion | Check | Minutes saved per week | Runner minutes saved per week | Basis | Ticket |
| --- | --- | --- | --- | --- | --- | --- |

Rows in rank order. Basis is the estimate's arithmetic and assumptions. Ticket is the child ticket's link, `carried <link>` for an open child ticket from an earlier review, or `needs a decision`. With no suggestions, the section reads `None this week.`

### Nothing found

One line for each check that ran and found nothing, saying what it looked at, such as the slowest install step's median for Caching. Leave the section out when every check found something or was a gap.

### Where time goes

Two lists from the Slow jobs and steps check: the ten jobs with the most runner minutes per week, then the ten steps with the most, each named with its job. Give each its duration and runs per week, and mark any whose trend is growing or shrinking. Then each workflow's critical path in its median run, and the ten slowest tests, with each one's median time and share of the suite, when per-test times exist.

### Since the previous review

Each suggestion the previous review made, with its ticket's state now. For each one whose change was made, the measure its child ticket named under How to confirm, in the previous review and now. The baseline review leaves this section out.

### Declined

Every suggestion people declined, linked to where they declined it. Each review carries the whole list forward, so a declined suggestion stays out of later rankings. Leave the section out when the list is empty.

### Gaps

Each check that couldn't run, with what it lacked, the error where a command failed, and the CI doc field or command to fix. Each problem seen in too few runs to judge, with the runs that showed it. Then each command marked _untried_ that worked, so the developer can take the mark off. Leave the section out when it would be empty.

### Test-audit scope

Only when slow tests dominate, as the Slow tests check in [CHECKS.md](CHECKS.md) says. Give the scope, its share of the suite's time, and its minutes per week, which is the most an audit of it could save. End with the line to run:

```markdown
Run a test audit with auditing-tests over <scope>.
```

## Child ticket

Title: the change as an imperative sentence, such as `Cache the pip download in the test job`.

Body:

```markdown
## Change

<The file, the job and step, and what to add, move or remove.>

## Evidence

<The measured numbers, with links to two or three runs that show them.>

## Estimate

<n> minutes saved per week, <n> runner minutes saved per week. Basis: <arithmetic and assumptions>.

## How to confirm

<The measure the next run-time review compares, and its value now.>
```

When an earlier child ticket for the same change closed with the change made, link it under Evidence and say what the check still finds.

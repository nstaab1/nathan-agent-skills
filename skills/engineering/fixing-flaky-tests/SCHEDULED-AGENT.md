# The scheduled flaky-test agent

One run of the scheduled flaky-test agent. It tidies the flaky-test records, applies quarantine expiry, works the open records into fix PRs, and reports. Its writes are comments, labels and closes on records, and one branch and PR per fix. A person reviews and merges every PR. The run never merges, approves or sets a PR to merge itself.

Steps 1 to 6 run in order, and step 5 takes each record through [Working one record](#working-one-record). The sections after that are the reference the steps use. On GitLab a PR is a merge request.

## 1. Read the docs

Read `docs/agents/issue-tracker.md` and the CI doc, `docs/agents/ci.md`, and `docs/agents/triage-labels.md` and `docs/agents/pull-requests.md` when the repo has them. Stop wherever [step 1 of Setting a repo up](SKILL.md#1-read-the-docs) stops: a missing doc, a tracker the verdict script doesn't support, or no CI. Stop too when the CI doc's Verdict script **Location** reads `None.`, since the repo isn't wired and nothing records occurrences. A stop ends the run with a report saying why, so a person can set the repo up with this skill.

From the CI doc, take the Test command, Run history's **Jobs and steps of a run**, **Full log of a run** and **Results file of a run**, the **Flaky label** and **Quarantine label**, and the Quarantine cap.

A record is ready for the agent when it carries `ready-for-agent`, the name the verdict script writes, or the label `triage-labels.md` maps that role to. The run hands a record to a person with the label that file maps the `ready-for-human` role to, or `ready-for-human` when the file is absent. Create each label from [step 2 of Setting a repo up](SKILL.md#2-create-the-labels) that the tracker lacks.

Note the current time in UTC once, at the start. Every age and date window in the run counts from it.

Done when every field above is read, the tracker holds the labels, and the run has its time.

## 2. Read every record

With the [tracker reads](#tracker-reads), list every flaky-test record, open and closed, and every open PR. Then read the comments of every open record and of every record whose title another record shares, and the label events of every open record that carries the quarantine label. Save each output to a folder outside the repo, such as a temporary directory. Compute every count, age and order in later steps with a script over those files, so each run computes them the same way.

Done when the folder holds every record, every open PR, those comments and those label events.

## 3. Tidy the records

Do the three parts in this order. When any of them changes a record, read the records again as step 2 does before step 4.

**Merge duplicate records.** Records that carry the flaky label and share a title exactly are duplicates, left by two CI runs that each created one. Keep one of each set: the open quarantined one, the one with the earliest [quarantine start](#quarantine-start) when several are; else the oldest open one; else the oldest. For each other record in the set:

1. Comment on the kept record with each of the duplicate's occurrences written as its people lines, the date, branch, job and run link, and a link to the duplicate. End the comment with a `merged` marker. These occurrences don't count toward quarantine on the kept record, because only CI writes occurrence markers, as [The run adds no occurrences](#the-run-adds-no-occurrences) says. Leaving them out can delay a quarantine and never brings one early.
2. Comment on the duplicate with the kept record's link, ending with a `duplicate` marker. When an open PR names the duplicate, comment the kept record's link on that PR too.
3. Take the flaky label off the duplicate, and the quarantine label when it has one. When it carries the `ready-for-human` label, put that label on the kept record. Then close the duplicate, as a duplicate when the tracker has that reason, such as `gh issue close <number> --duplicate-of <kept number>`.

The flaky label has to come off. The verdict script finds a test's record by title among every record with that label, open or closed, and reopens a closed one, so a duplicate that kept the label could be reopened and recorded on.

**Close records for tests that no longer exist.** For each open record, look for its test on the default branch's head. Search the test files for its name, or for the part before a parameterised case's values, and for the file or module its classname names. When the CI doc's Results file of a run works, look for its identity in the newest default-branch results file as well. When no test produces the identity, find the commit on the default branch that removed or renamed the test, such as with `git log -S '<name>' -- <test paths>`. Comment that commit on the record, with the test's new identity when it was renamed, ending with a `test-gone` marker. Take off the quarantine label when it has one, and close the record. Close a record only on such a commit. A test that is missing with no commit removing it may live on a branch not yet merged, so its record stays open and goes in the report.

**Apply quarantine expiry.** For each open record that carries the quarantine label, find its [quarantine start](#quarantine-start) and its age in whole days.

- **23 to 29 days.** Warn once per quarantine, so skip a record whose comments already hold an `expiry-warning` marker with this start. Comment the date quarantine ends, any [open PR](#open-prs) for the record, and the findings so far from earlier comments, ending with an `expiry-warning` marker holding `quarantined_since`. Then take off the ready-for-agent label, both the name the script writes and the mapped one, and add `ready-for-human`. A person who hands the record back to the agent gets no second warning for the same quarantine.
- **30 days or more.** Take the quarantine label off. Comment that quarantine ended 30 days after it started, so the test's failures fail the build again, and that its occurrences from the last 30 days still count, so its next one can quarantine it again. When the record has no warning for this start, as when the routine missed those days, add what the warning gives too. End the comment with an `expired` marker holding `quarantined_since`. When the record lacks `ready-for-human`, swap the ready-for-agent label for it, as the warning does.

Done when no two records with the flaky label share a title, every open record's test has been looked for, and every open quarantined record has its start, with the warning or expiry its age calls for applied.

## 4. Build the queue

The queue is every open record that is ready for the agent, lacks `ready-for-human`, and has no [open PR](#open-prs). Order it:

1. Quarantined records, the oldest quarantine start first.
2. Every other record, by its [occurrence count](#occurrence-count), the most first. Break ties by the newest occurrence, the most recent first.

Break any tie left by the lower record number.

Done when the queue is ordered, and every open record left out of it has its reason: it isn't ready for the agent, it carries `ready-for-human`, or the open PR's link.

## 5. Work the queue

Take the records in queue order, each through [Working one record](#working-one-record), until this run has opened three fix PRs or the queue ends. A record handed to a person or skipped doesn't count toward the three.

Done when three fix PRs are open from this run, or every record in the queue has a fix PR, has been handed to a person, or was skipped with its reason.

## 6. Report

End with:

- The quarantined count, the number of open records that carry the quarantine label, beside the cap from the CI doc. Then each of those records with its quarantine start and the days it has left.
- Each fix PR opened, with its record and the cause in one line.
- Each record handed to a person, with the reason in one line, and each record skipped, with its reason.
- Each warning given and each quarantine ended.
- Each duplicate merged, each record closed for a test that no longer exists, and each record kept open whose test looked gone.
- Each read or command that failed, with its error.

## Working one record

1. **Read its history.** The record's body gives the test's Classname and Name, each exactly; its title joins them with a space. From its comments, take its occurrences, any earlier findings, and each earlier fix PR from its `fix-pr` markers. Read each earlier fix PR's state. A closed unmerged one was declined, so read its review comments, which a new fix must answer. A merged one that the record reopened after didn't hold, so read its diff and find what it missed.
   Done when you hold the identity, every occurrence, and the outcome of every earlier fix PR.
2. **Find the test.** Start from a clean checkout of the latest default branch. Find the test the identity names and the code it exercises, and work out the command that runs this one test on its own and the command that runs its file. When the test isn't on the default branch, it belongs to a branch not yet merged, so skip the record.
   Done when you have both commands, or the record is skipped.
3. **Read the failures.** For the newest occurrences, up to five, list the jobs of the occurrence's `run` with the CI doc's Jobs and steps of a run, and find the one its `job` names, by name or by id. Read that job's log with Full log of a run narrowed to the job. Failed log prints nothing here, because the verdict script passed the job. Copy attempt 1's failure message and stack. Then compare the occurrences: the jobs or systems they ran on, their branches, their times of day and their messages. A log past the CI provider's retention is gone, so note which.
   Done when each occurrence you read has its failure or a note that its log is gone, and the pattern across them is written down.
4. **Reproduce** on the unfixed code, in your own workspace. Run the test again and again under the conditions the failures point at: on its own, with its file, in random order where the framework shuffles, under CPU load, or with the clock, seed or timing the message suggests. A change that forces the failure, such as an injected delay, stays out of every commit. Stop at the first failure and keep its command and output. After about 100 runs across those conditions with no failure, the flake doesn't reproduce here, and you keep what you tried.
   Done when the failure is reproduced with its command and output, or every attempt is written down.
5. **Decide** to fix, delete or hand over.
   - **Fix** when you have found the cause. Remove it in the test or in the code it exercises: wait on the event the test needs, not on time; give the test its own state; pin the clock, the seed or the order. A retry, a skip marker or a longer sleep hides the cause and leaves the test flaky, so it is never the fix. Keep the test's classname and name, so CI keeps recording on this record.
   - **Delete** only a test that meets [Deleting a test](#deleting-a-test), with its kind's evidence. However hard a test is to fix, a test that is the only one verifying its behaviour stays.
   - **Hand over** in every other case: the cause wasn't found, the fix needs a decision only a person can make, such as a new dependency or a change in behaviour, or the cause lies outside the repo, such as a CI runner or a remote service. Go to step 8.
6. **Prove the fix.** On the fixed code, run the test 20 times in a row, each run a new process, at the scope and under the conditions that reproduced the failure. With no reproduction, run it with its file. A loop such as `n=0; for i in $(seq 1 20); do <command> || break; n=$i; done; echo "$n of 20 passed in a row"` shows the count. Fewer than 20 means the fix didn't hold, so go back to step 5. Then run the test's file once, so the fix breaks no other test in it. A deletion takes only the file's run.
   Done when the 20 passes are recorded with their command, or the record has gone to step 8.
7. **Open the fix PR.** Create a branch `flaky-test/<record number>-<YYYY-MM-DD>` off the latest default branch, commit the fix alone, push only that branch, and open the PR against the default branch with the host's CLI, such as `gh pr create` or `glab mr create`, following `docs/agents/pull-requests.md` when the repo has it. Title it `Fix flaky test <name>`, or `Delete <kind> test <name>`. The body holds, in order:
   1. `Fixes #<record number>`. GitHub and GitLab both close the record when the PR merges into the default branch, which ends its quarantine. When the records live in another project, write its full reference, such as `Fixes acme/shop#12`.
   2. The cause, with the evidence from the logs.
   3. The reproduction on the unfixed code: its command and failing output. Without one, "Not reproduced", what was tried, and a line saying the 20 passes show the test still passes, not that the flake is gone.
   4. The fix, and why it removes the cause.
   5. The 20 passes, with the command and its count line.

   A deletion's body holds the closing reference, then the kind and its evidence in place of the rest.
   Then comment on the record with the PR's link and the cause in one line, ending with a `fix-pr` marker holding the PR's URL.
   Done when the PR is open and the record links it.
8. **Hand it to a person.** Comment the findings on the record, ending with a `findings` marker: the pattern across the occurrences, each reproduction attempt and its result, each cause you ruled out and how, your best remaining guess, and what a person could try next. Then take off the ready-for-agent label, both the name the script writes and the mapped one, and add `ready-for-human`.
   Done when the record holds the findings and carries `ready-for-human`.

## The run adds no occurrences

The verdict script records an occurrence when it runs with tracker settings, and counts toward quarantine every comment on a record that holds a `verdict-occurrence` marker line. Only CI writes occurrences, so the run keeps its own work out of both:

- Run tests with the CI doc's test command or your one-test command directly, never wrapped in the verdict script. A routine that runs inside a CI job has the tracker settings in its environment, so the script there would record the agent's own runs.
- Reproduce and run the 20 passes in your own workspace, and push only the finished fix. A pushed commit that forces the failure would run in the PR's CI and record occurrences on the agent's branch, which count toward quarantine as a branch of their own.
- Keep the test's identity in a fix. A renamed test gets a new record at its next occurrence.
- Write an occurrence in a comment as its people lines, and end every comment with [the agent's marker](#the-agents-comments).

The fix PR's own CI runs the verdict script as every PR does. A flake there is a real occurrence on the fixed code, recorded on the record, and it tells the reviewer the fix didn't hold.

## Quarantine start

A record's quarantine started when the quarantine label last went on it. The tracker logs every label change with its time, whoever made it, the verdict script or a person. So the start is the newest event in the record's [label events](#tracker-reads) that added the quarantine label, on GitHub and GitLab alike. The occurrences can't stand in for it: a person can add the label by hand, and the cap can keep a qualifying test out of quarantine for days.

When no event added the label, as on a record moved from another project, the start is the `quarantined_since` of the record's newest `quarantine-start` marker. With no such marker, comment one dated with the run's time, so the 30 days count from this run.

A quarantine's age is the whole days from its start to the run's time. It ends at 30 days, and the warning is due from 23.

## Occurrence count

A record's occurrences are the `verdict-occurrence` markers in its comments, read as the script's header says: a line matching `^<!-- verdict-occurrence (\{.*\}) -->$` whose group parses as JSON. Its occurrence count is the number the script counts toward quarantine. That takes the occurrences from the last one holding `"reopened":true` on, keeps those dated no more than 30 days before the run's time, and counts each `run` once. Its newest occurrence is the latest `date` among all its markers.

## Open PRs

A record has an open PR when the title or description of an open PR from step 2 names it: `#<record number>` with no digit after it, or the record's URL. The agent's own fix PRs always name their record in their closing reference. A PR that names a record for another reason makes the run skip that record, which is the safe way to be wrong.

## Deleting a test

A flaky test may be deleted only when removing it loses no verification. It must be one of the kinds of unneeded test from the test audit, and the PR body gives the evidence that kind demands. When `auditing-tests` is installed, its SKILL.md and `references/mutation-check.md` hold the full rules, and they apply.

| Kind | The test | Evidence |
| --- | --- | --- |
| Tautological | still passes when the behaviour it claims to verify is broken | a mutation check: break the behaviour, show the break is real, run the test on its own and see it pass, then restore the code |
| Redundant | verifies a behaviour another test already verifies through the same interface | the other test, by file and name, and why the two verify the same behaviour |
| Implementation-coupled | fails on a refactor that changes no behaviour | the refactor, and the test that still covers the behaviour |
| Misplaced | verifies at an expensive level what a cheaper level already covers | the cheaper test, by file and name, and why it covers the same check |

The fifth kind, dead, never applies here, because the open record is a ticket tracking the test.

## The agent's comments

Every comment the run writes ends with a hidden marker line, which later runs read:

```
<!-- flaky-agent {"action":"expiry-warning","quarantined_since":"2026-11-02T14:03:11Z"} -->
```

Write the JSON on one line, with each `<`, `>` and `&` in a value as `\u003c`, `\u003e` and `\u0026`, as the verdict script does. Dates are UTC in ISO 8601, to the second.

| Action | On | Other keys |
| --- | --- | --- |
| `fix-pr` | the record, after its fix PR opens | `pr`: the PR's URL |
| `findings` | the record, when it is handed to a person | |
| `expiry-warning` | the record, 7 days before its quarantine ends | `quarantined_since` |
| `expired` | the record, when its quarantine ends | `quarantined_since` |
| `quarantine-start` | the record, when no label event dates its quarantine | `quarantined_since` |
| `duplicate` | a duplicate record, before it closes | `of`: the kept record's URL |
| `merged` | the kept record of a set of duplicates | `from`: the duplicate's URL |
| `test-gone` | a record closed because its test no longer exists | `commit`: the commit that removed or renamed it |

## Tracker reads

`docs/agents/issue-tracker.md` gives the commands to comment on, label and close a record. These are the reads the run needs beyond it. `<owner>/<repo>` and `:id`, which glab fills in from the clone, name the project the records live in: the one the CI config passes the verdict script as `--repo`, or this repo when it passes none. On GitLab, put another project's URL-encoded path in place of `:id`, such as `acme%2Fshop`. URL-encode a label that holds a space. With `--paginate`, read every page the command prints.

On GitHub:

- **Every record**: `gh api --paginate "repos/<owner>/<repo>/issues?labels=<flaky label>&state=all&per_page=100" --jq '.[] | select(.pull_request | not) | {number, title, state, labels: [.labels[].name], url: .html_url, body}'`. `state` is `open` or `closed`.
- **A record's comments**: `gh api --paginate "repos/<owner>/<repo>/issues/<number>/comments?per_page=100" --jq '.[] | {created_at, body}'`, oldest first.
- **A record's label events**: `gh api --paginate "repos/<owner>/<repo>/issues/<number>/events?per_page=100" --jq '.[] | select(.event == "labeled") | {label: .label.name, created_at}'`. Each one added the label it names, at `created_at`.
- **Open PRs**: `gh pr list -R <owner>/<repo> --state open --limit 1000 --json number,title,body,url`.
- **A PR's state**: `gh pr view <url> --json state`, which is `OPEN`, `CLOSED` or `MERGED`.

On GitLab:

- **Every record**: `glab api --paginate "projects/:id/issues?labels=<flaky label>&state=all&per_page=100"`. Each issue's `iid` is the record number, beside `title`, `state` (`opened` or `closed`), `labels`, `web_url` and `description`.
- **A record's comments**: `glab api --paginate "projects/:id/issues/<iid>/notes?sort=asc&order_by=created_at&per_page=100"`. Skip each note whose `system` is true, which GitLab writes for label and state changes.
- **A record's label events**: `glab api --paginate "projects/:id/issues/<iid>/resource_label_events?per_page=100"`. An event whose `action` is `add` added the label in `label.name`, at `created_at`.
- **Open PRs**: `glab api --paginate "projects/:id/merge_requests?state=opened&per_page=100"`, with `iid`, `title`, `description` and `web_url`.
- **A PR's state**: `glab api "projects/:id/merge_requests/<iid>"`, whose `state` is `opened`, `closed` or `merged`.

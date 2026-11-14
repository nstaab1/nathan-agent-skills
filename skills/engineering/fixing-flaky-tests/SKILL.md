---
name: fixing-flaky-tests
description: "Flaky tests: wire the verdict script into a repo's CI, or run the scheduled flaky-test agent. Use when the user wants flaky tests tracked, quarantined or fixed, the verdict script wired or updated, or a scheduled flaky-test agent run."
---

A **flaky test** failed and passed on the same commit with no code change. This skill stops flaky tests blocking a repo's builds and gets them fixed. Its **verdict script**, [scripts/verdict.mjs](scripts/verdict.mjs), runs in the CI test job. It runs the test command, reruns the failures once, records each **flake occurrence** on the test's **flaky-test record** in the issue tracker, and decides whether the build passes. A test whose open record carries the quarantine label is in **quarantine**. It still runs, and its failures don't fail the build.

The script's header is the reference for everything the script does: its flags, the trackers it supports and the settings each one takes, its decision, how it records and quarantines, and its run summary. Read it before wiring or updating a repo, and take every flag and setting from it.

A repo is **wired** when its CI doc's Verdict script **Location** names a copy of the script, and its CI runs that copy. A run a person starts begins with [Setting a repo up](#setting-a-repo-up), which wires an unwired repo by PR and checks a wired one. A run of [the scheduled flaky-test agent](#the-scheduled-flaky-test-agent) follows that agent's own steps instead.

## Setting a repo up

### 1. Read the docs

Read `docs/agents/issue-tracker.md` and the CI doc, `docs/agents/ci.md`. When either is missing, tell the developer to run `/setup-agent-skills`, and stop.

The verdict script keeps flaky-test records on a hosted tracker, through the tracker's web API. When the issue-tracker doc keeps issues as local files, such as under `.scratch/`, tell the developer that flaky-test tracking needs a hosted tracker, one the script's header lists, and stop. Stop the same way on a hosted tracker the header doesn't list. Either way, change nothing.

Find each CI doc field by its heading. A field that reads `None.` isn't set up.

- `## CI provider`: the provider and where its config lives. `None.` means the repo has no CI to wire, so tell the developer so, and stop.
- `## Test command`: the command, and for each test job its **Job**, **Step** and **Results file**.
- `## Rerun-failures command`.
- `## Verdict script`: **Location** and **Version**.
- `## Labels`: the **Flaky label** and the **Quarantine label**.
- `## Quarantine cap`.
- `## Scheduled agents`.

Done when the tracker is known to be one the script supports and every field above is read.

### 2. Create the labels

List the tracker's labels and create each one it lacks:

- The Flaky label, described as "A flaky-test record, holding one test's flake occurrences as the verdict script records them."
- The Quarantine label, described as "A quarantined test still runs, and its failures don't fail the build."
- `ready-for-agent`, which the script puts on every new record by that exact name. When `docs/agents/triage-labels.md` maps the `ready-for-agent` role to another label, tell the developer that new records will carry `ready-for-agent` anyway.
- The `ready-for-human` role's label, which the scheduled agent puts on a record it hands to a person. That is the label `docs/agents/triage-labels.md` maps the role to, or `ready-for-human` when the file is absent.

On GitHub, list with `gh label list -R <owner>/<repo> --limit 1000 --json name` and create with `gh label create "<name>" -R <owner>/<repo> --description "<description>"`. On GitLab, list from the repo's checkout with `glab api "projects/:id/labels?per_page=100" --paginate`, which includes the labels the project takes from its groups, and create with `glab label create --name "<name>" --description "<description>" -R <group>/<project>`. Elsewhere, use the tracker's own way.

Done when the tracker holds all four labels.

### 3. Check the wiring

When Location reads `None.`, the repo is unwired, and the rest of this step doesn't apply.

When no file is at Location, or no CI config runs it, the CI doc says wired and CI disagrees. Report it, and offer the wiring PR of step 4.

Otherwise compare the copy at Location with this skill's `scripts/verdict.mjs`. Line 2 of each is its version line, `// verdict.mjs version <x.y.z>`. Compare the two versions part by part, as numbers.

- **The copy is older.** Report both versions, and offer to update the copy by PR.
- **Same version, different content.** Someone edited the copy. Report it, since an update overwrites the edit.
- **The copy is newer.** The installed skill is out of date. Tell the developer to update it.
- **The CI doc's Version differs from the copy's version line.** Report both.

The script takes its settings from its flags and the environment, never from the CI doc, and people and agents read only the CI doc. Compare the flags the CI config passes the script, `--results`, `--rerun`, `--flaky-label`, `--quarantine-label` and `--quarantine-cap`, with the CI doc's Results file, Rerun-failures command, Labels and Quarantine cap, job by job. A flag left out takes the default the header gives. Report each difference, so the developer can bring the two back in step.

Done when the repo is known to be unwired, CI is known to disagree with the CI doc, or the copy's version and content are compared and every difference between the CI config and the CI doc is listed. Go to step 4 for an unwired repo or an accepted wiring PR, to step 5 for an accepted update, and otherwise to step 6.

### 4. Wire the repo by PR

Wiring opens one PR that changes the CI config, the test setup and the CI doc together. [WIRING.md](WIRING.md) has the specifics: JUnit XML output and retries for each test framework, the test step on GitHub Actions and on GitLab CI, and other CI providers.

1. **Branch.** Create a branch off the latest default branch, such as `wire-verdict-script`, and commit every change below to it. Push only that branch, so the wiring reaches the default branch only when someone merges the PR.
2. **Copy the script.** Copy this skill's `scripts/verdict.mjs` into the folder where the repo keeps its CI scripts. When it keeps none, use `.github/scripts/verdict.mjs` on GitHub Actions and `ci/verdict.mjs` elsewhere. Keep the copy byte for byte, so its version line says exactly what runs.
3. **Turn on JUnit XML output** in the test command, written to a results file inside the workspace. When that file would land in the working tree on a local run, add it to `.gitignore`.
4. **Turn off the framework's own retries**, wherever the framework lets them be set: a flag, the config, single tests or suites. Turn off any CI-level retry of the test step or job too. A retry the script doesn't run hides the failed attempt, and the flake occurrence goes unrecorded.
5. **Wrap the test step** of every test job the CI doc names. The step runs the script with `--results`, `--rerun` when the CI doc has a rerun-failures command, the two label flags and `--quarantine-cap`, all set to the CI doc's values, then `--` and the test command. Pass every tracker setting the header says the provider doesn't supply. Keep the step's name, so the run history of that step continues.
6. **Set the cap.** The script sizes a percentage cap from one job's results file and rounds down, so at 5% a job with fewer than 20 tests can quarantine none. When a test job runs fewer than 20 tests, or the jobs run shards or different parts of the suite, use a whole-number cap: 5% of the whole suite, rounded down, and at least 1. A matrix whose every leg runs the whole suite keeps the percentage.
7. **Run it once locally**, when the suite runs on this machine. Run the wrapped command with no tracker settings, such as `node <location> --results <results-file> -- <test command>`. It records nothing, and prints a run summary that starts with `### Verdict:`. Then read the results file and list each identity, `classname` plus `name`, that more than one testcase shares. Tests that share an identity share one record, and quarantining it ignores the failures of all of them.
8. **Update the CI doc.** Fill in Test command and Results file with JUnit XML output on, and add one line under Test command naming where the framework's retries were turned off. Fill in Rerun-failures command, Verdict script Location and Version, and Quarantine cap. Under Verdict script, add a line saying that the CI config passes the script the results file, the rerun-failures command, the labels and the cap as flags, so a change to any of them goes in both places. In the `## Agent skills` block of `CLAUDE.md` or `AGENTS.md`, change the `### CI` line to say the verdict script is wired.
9. **Open the PR** with the host's CLI, such as `gh pr create` or `glab mr create`, following `docs/agents/pull-requests.md` when the repo has it. Its body lists what the wiring changes, the script's version, where retries were turned off, the cap and why, and each shared identity with a rename that would make it unique. It also says that once merged, CI writes flaky-test records to the tracker and quarantine applies on every branch. Rename tests only when the developer asks.

Done when the PR is open, and its branch holds the script, the wrapped test step of every test job, JUnit XML output, retries turned off and the updated CI doc.

### 5. Update the copy by PR

1. Create a branch off the latest default branch, such as `update-verdict-script`, and push only that branch.
2. Diff the copy against this skill's script, such as with `git diff --no-index <copy> <shipped script>`, and read what changed in the header: new flags, changed defaults, new tracker settings.
3. Copy this skill's script over the copy, byte for byte. Change the CI config where a header change needs it, using WIRING.md.
4. Update the CI doc's Version, and any field the change affects.
5. Push the branch and open the PR. Its body gives the old and new versions, the header changes, and each change to the CI config.

Done when the PR is open.

### 6. Report

End with:

- The wiring or update PR's link, or that the repo is wired with an up-to-date copy and its version. When the wiring works, the run summary of each of the PR's test jobs starts with `### Verdict:`.
- The labels created.
- Each finding of step 3.
- Each identity that more than one test shares, from step 4.
- When `## Scheduled agents` has no `fixing-flaky-tests` line, that the scheduled flaky-test agent isn't set up. Nothing works the open records, and quarantine never expires, since the script never takes the label off an open record. Give the developer [the daily routine](#the-daily-routine) to create.

## The scheduled flaky-test agent

The scheduled flaky-test agent works a repo's flaky-test records every working day. Each run tidies the records, hands each quarantined record to a person 7 days before its quarantine ends and ends it at 30 days, opens at most three fix PRs, and reports how many tests are quarantined. A person reviews and merges every fix PR. Merging it closes the record, which ends the test's quarantine.

A run follows [SCHEDULED-AGENT.md](SCHEDULED-AGENT.md), whether the routine starts it or a person asks for one, such as "run the scheduled flaky-test agent". Read that file in full before its first step.

### The daily routine

The routine is a scheduled agent the developer creates on their agent platform. This skill describes it and doesn't create it.

Once the wiring PR is merged, run the agent once by hand. It shows that the tracker reads and the CI doc's commands work before a routine depends on them. Then create the routine:

- **Cadence**: daily on working days, early, such as 05:00. Quarantine ends on its 30th day and the warning is due on its 23rd, so a daily run applies each within a day. A weekly run can apply them up to six days late.
- **Where it runs**: any scheduled agent that starts from a fresh clone of the repo with its full git history and this skill installed, and can run the repo's test command, with the services the tests need. The tracker's tools are signed in with rights to comment on, label and close issues, git and the host's CLI with rights to push branches and open PRs, and the CI provider's tools with read access to runs and their logs. Protect the default branch with a required review, so merging stays with a person.
- **Prompt**:

  > Run the scheduled flaky-test agent for this repo with the fixing-flaky-tests skill, following its SCHEDULED-AGENT.md from step 1. Tidy the flaky-test records, apply quarantine expiry, then work the queue and open at most three fix PRs. Never merge, approve or auto-merge a PR. End with the quarantined count and what you did to each record.

Then record it under the CI doc's `## Scheduled agents`, in place of `None.` when the section reads that: `- fixing-flaky-tests: daily on working days, <where it runs>`.

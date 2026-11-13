# Checks

The eight checks of a run-time review, the measures they share, and how each one estimates minutes saved per week. Run every check. Each ends in suggestions, nothing found, or a gap naming the CI doc field or command it lacked.

## Measures

Runs, jobs and steps are as the CI doc's commands report them. A **workflow** is the pipeline a run belongs to, and a repo can have several.

- **Test job** and **test step**: the job `## Test command` names, and its step that runs the test command.
- **Per week**: a count or total in the window × 7 ÷ days covered.
- **Run time**: the wall-clock time of a run's first attempt, from the run's creation to its last job's completion. It includes queue time, since a developer waits through both. Without jobs and steps, take the run's own start and end times from runs with one attempt.
- **Duration**: the median time from start to completion of a job or step.
- **Medians**, of run times and durations alike, take successful runs only, so a failure that stopped a run early doesn't shorten them. Counts of runs take every run.
- **Runner minutes**: the sum of every job's time from start to completion, over every attempt.
- **Critical path**: in a workflow's median run, the chain of jobs that ends with the last job to finish, where each job waits on the one before it in the CI config. A cut to a job on the critical path shortens the run by the cut, up to the time by which that chain outlasts the next-longest chain. A cut to a job off it shortens no run.
- **Minutes saved per week**: the wall-clock minutes a change cuts from one affected run, × the affected runs per week. It ranks the suggestions, because it is the time people wait.
- **Runner minutes saved per week**: the runner minutes a change cuts from one affected run, × the affected runs per week. It breaks ties, and it is negative when a change adds runner time.

A suggestion rests on at least five runs. With fewer, report it under Gaps as too few runs to judge.

Write each estimate's basis as its arithmetic and every assumption in it, such as `2.4 min × 38 runs/week, npm ci in test, cached install assumed at a quarter of its duration`. Use a measured figure wherever the saved files hold one, and the assumptions the checks give only where they don't, so estimates stay comparable from week to week.

## Numbers

The review ticket's Numbers table records these, so later reviews can compare:

- For each workflow and trigger, default branch or PR: runs per week, median run time and 90th-percentile run time.
- Runner minutes per week, across every workflow.
- Rerun rate, as the Rerun rate check defines it.
- Median queue time, over every job in the window.

## Slow jobs and steps

Needs **Jobs and steps of a run**.

List the ten jobs and steps with the most runner minutes per week, each with its duration and runs per week, and find each workflow's critical path. These fill Where time goes in the review ticket.

Then look at the top of the list for causes the other checks don't cover, such as the same build done in several jobs, a build no later step uses, or a step that waits a fixed time. Each cause with a change is a suggestion. It saves the step's duration minus what the step would take after the change, per run of its job.

## Caching

Needs **Jobs and steps of a run** and the CI config.

Look for steps that fetch or build something that rarely changes between runs: dependency installs, toolchain setup, container image builds. A finding is such a step with a duration over one minute and either no cache in the config, or a cache it seldom hits. A cache that seldom hits shows as the step taking as long on most runs as it would with no cache. A cache key that changes on every run is the usual cause.

The fix adds a cache keyed on the lockfile or on the files the step builds from, or repairs the key. It saves the step's duration minus its cached duration, per run of its job. Take the cached duration from runs in the window that hit the cache. With none, assume a quarter of the uncached duration.

## Parallelism

Needs **Jobs and steps of a run** and the CI config.

Three findings:

- A job that waits on another job and uses nothing it makes: no artifact, no output and no cache it writes. Running the two side by side saves the shorter job's duration per run.
- Independent steps in one job that run one after another, such as lint and then the tests. Moving the shorter one into its own job saves its duration per run. Runner minutes rise by the setup steps the new job repeats.
- A test step running on one worker, on a runner with more cores, with a test framework that can run tests in parallel workers. It saves the step's duration × (1 − 1 ÷ cores), assuming the tests split evenly across workers. Name the cores in the basis.

## Sharding

Needs **Jobs and steps of a run** and the test **Job** from `## Test command`.

A finding is a test job on the critical path whose test step outlasts the next-longest chain by more than five minutes. The fix splits the suite across N jobs, each running the job's setup steps and one share of the tests. Take N as the test step's duration ÷ the longer of five minutes and the next-longest chain, rounded up, and at least 2. It saves the test step's duration × (1 − 1 ÷ N) per run of the test job, and adds (N − 1) × the duration of the job's setup steps in runner minutes. Since it costs runner minutes, it needs a decision.

## Path filters

Needs the CI config and the repo's git history.

A finding is a workflow or job that runs on changes that can't affect it, such as the full test suite running on a change to docs alone. Read each workflow's triggers and each job's conditions in the config. Then measure, from the default branch's history over the window, the share of commits whose changed files the job can't depend on:

```bash
git log --since=<window start> --name-only --format=%h <default branch>
```

Assume PRs have the same share. The filter saves that share × the job's runs per week × its duration, or × the run time when the whole workflow would be skipped. On some providers a required check that a filter skips blocks the merge, so the child ticket says to check how the provider treats a skipped required check.

## Slow tests

Needs **Results file of a run**, and the **Results file** from `## Test command` to know which file to read. Without them, the test step's duration still tells whether slow tests dominate.

From the saved results files, take each test case's `time` attribute, the median per test across files, and the total per test file or `classname`. List the ten slowest tests with their median and share of the suite's time. They fill Where time goes.

Read the slowest tests' code. A visible cause, such as a fixed sleep, a real network call or a fixture rebuilt for every test, is a suggestion. It saves the time the cause takes, per run of the test job.

Slow tests dominate when the test step takes at least half of its workflow's median run time. Then the review ends with a test-audit scope for `auditing-tests`: the test files holding the slowest tests that together take half the suite's time, or the tests' identities where their files can't be told. Without per-test times, suggest an audit with no scope, which makes `auditing-tests` start from the slowest tests itself.

## Rerun rate

Needs the attempt number from **List runs**, every attempt from **Jobs and steps of a run**, and **Failed log**.

The rerun rate is the share of runs with more than one attempt. Rerun minutes per week are the run times of every attempt after the first. For up to ten rerun runs, read the failed log of the attempt before each rerun and sort its cause:

- **A test** that failed and then passed on the rerun, a flake occurrence. When `## Verdict script` Location reads `None.`, suggest wiring the verdict script with `fixing-flaky-tests`. That needs a decision, since quarantine changes how builds pass. When the script is wired, suggest fixing those tests, and link each one's flaky-test record, the ticket that carries the CI doc's Flaky label and the test's name in its title. Either suggestion saves the test-caused rerun minutes per week.
- **Infrastructure**, such as a failed network fetch, a lost runner, a full disk or a service the job calls. Suggest the fix the log points to. It saves the infrastructure-caused rerun minutes per week.
- **Unknown**: list the runs.

Scale the sample's shares up to every rerun in the window.

## Queue time

Needs **Jobs and steps of a run**.

A job's queue time is the wait from when it could start to when it started. It could start at its creation, or when the last job it waits on completed, whichever is later. Take the median and 90th percentile per job and per runner type. A finding is a median over one minute for a job on the critical path. The usual causes:

- Too few self-hosted runners, or a concurrency limit. Adding capacity saves the median queue time on the critical path per run. It costs money, so it needs a decision.
- Runs for an outdated push that keep going after a newer push to the same branch. Cancelling a run when a newer push to its branch starts saves the runner minutes of every run a newer push overtook. Its minutes saved per week are the queue time those runs caused on the critical path of other runs.

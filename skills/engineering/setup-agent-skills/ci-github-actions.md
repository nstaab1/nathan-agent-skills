# CI: GitHub Actions

How this repo's CI runs and how to read its history, for the CI-health skills `auditing-tests`, `fixing-flaky-tests` and `reviewing-ci-run-times`. The skills find each field by its section heading, so keep the headings as written. A field that reads `None.` isn't set up in this repo yet.

Commands marked _untried_ have not yet been run in this repo.

## CI provider

GitHub Actions, with workflows in `.github/workflows/`. The commands below use the `gh` CLI and name the repo, with `-R <owner>/<repo>` or in the API path, so they read this repo's runs from any clone, including a fork or a clone with no remote.

## Run history

- **List runs**: `gh run list -R <owner>/<repo> --limit 200 --created ">=<YYYY-MM-DD>" --json databaseId,workflowName,event,headBranch,status,conclusion,attempt,createdAt,startedAt,updatedAt,url`. Add `--branch <default-branch>` for runs on the default branch, or `--event pull_request` for PR runs. A run whose `attempt` is above 1 was rerun.
- **Jobs and steps of a run**: `gh api --paginate "repos/<owner>/<repo>/actions/runs/<run-id>/jobs?filter=all" --jq '.jobs[] | {id, name, run_attempt, conclusion, created_at, started_at, completed_at, steps: [.steps[] | {name, conclusion, started_at, completed_at}]}'`. `filter=all` returns the jobs of every attempt. A job's queue time is `started_at` minus `created_at`.
- **Failed log**: `gh run view <run-id> -R <owner>/<repo> --attempt <n> --log-failed`. It can print the failed job's whole log, not only its failed steps.
- **Full log of a run**: `gh run view <run-id> -R <owner>/<repo> --attempt <n> --log`. To narrow it to one job, replace `--attempt <n>` with `--job <job-id>`, an `id` from Jobs and steps of a run. Each line carries a timestamp, which times the work inside a step.
- **Results file of a run**: `gh run download <run-id> -R <owner>/<repo> --name <results-artifact> --dir <dir>` (_untried_), where `<results-artifact>` is the artifact the test job uploads its results file as. When the test job uploads none, this field reads `None.`

Both log commands can label every line `UNKNOWN STEP` in place of its step's name, so find a failure or a step by its text.

## Test command

`<test command>`

- **Job**: `<job>` in `.github/workflows/<workflow-file>`
- **Step**: `<step>`, the step's name as Jobs and steps of a run reports it
- **Results file**: `<results-file>`, the JUnit XML file the test command writes

The test command runs the suite. Once the verdict script is wired, it is the command the script wraps. The job may run other steps too, and Step names the one that runs the test command. A test command that writes no JUnit XML has `None.` as its Results file, until `fixing-flaky-tests` turns JUnit XML output on when it wires the verdict script. With several test jobs, give each its own command, job, step and results file here, and its own line under Rerun-failures command.

## Rerun-failures command

`<rerun-failures command>`

The verdict script's second attempt runs this to rerun only the tests that failed. It must write the same results file as the test command. With `None.`, the verdict script reruns the whole test command.

## Verdict script

- **Location**: None.
- **Version**: None.
- **Tracker user**: None.

`fixing-flaky-tests` fills in the script's path, and the version from its version line, when it wires the script into CI.

## Labels

- **Flaky label**: `flaky-test`. Every flaky-test record carries it.
- **Quarantine label**: `quarantined`. A flaky-test record with this label has its test in quarantine, where it still runs but can't fail the build.

## Quarantine cap

5% of the suite.

The verdict script keeps the number of quarantined tests at or under this cap. When the cap stops a quarantine, the run summary says so.

## Scheduled agents

None.

Once a scheduled agent's routine exists, replace `None.` with one bullet per agent: `- <skill>: <cadence>, <where it runs>`. The skill whose routine it runs gives the routine prompt and cadence.

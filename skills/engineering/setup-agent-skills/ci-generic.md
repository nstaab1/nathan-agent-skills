# CI: <provider>

How this repo's CI runs and how to read its history, for the CI-health skills `auditing-tests`, `fixing-flaky-tests` and `reviewing-ci-run-times`. The skills find each field by its section heading, so keep the headings as written. A field that reads `None.` isn't set up in this repo yet.

Commands marked _untried_ have not yet been run in this repo.

## CI provider

<provider>, configured in `<config-path>`. The commands below use `<CLI or API>`.

## Run history

- **List runs**: `<command>` (_untried_). Lists the runs created since a date, up to 200, with each run's id, pipeline name, trigger, branch, result, attempt number and times, and can narrow them to the default branch or to PRs.
- **Jobs and steps of a run**: `<command>` (_untried_). Gives each job's and step's name and result, and when it was queued, started and finished.
- **Failed log**: `<command>` (_untried_). Prints the log of a run's failed jobs.
- **Results file of a run**: `<command>` (_untried_). Downloads the results file the test job saved.

## Test command

`<test command>`

- **Job**: `<job>` in `<config-path>`
- **Results file**: `<results-file>`, the JUnit XML file the test command writes

The test command runs the suite. Once the verdict script is wired, it is the command the script wraps. With several test jobs, give each its own command, job and results file here, and its own line under Rerun-failures command.

## Rerun-failures command

`<rerun-failures command>`

The verdict script's second attempt runs this to rerun only the tests that failed. With `None.`, the verdict script reruns the whole test command.

## Verdict script

- **Location**: None.
- **Version**: None.

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

# Wiring the verdict script

The specifics behind step 4 of [SKILL.md](SKILL.md): what each test framework needs, the test step on GitHub Actions and on GitLab CI, and other CI providers. The script's header is the reference for its flags and tracker settings.

## Test frameworks

Each framework needs three things: JUnit XML output to the results file, its own retries turned off, and a rerun-failures command when it has one. The rerun-failures command takes the same output flags as the test command, so both write the same results file. Mark a command _untried_ in the CI doc until you have run it at the framework version CI uses.

### pytest

- **JUnit XML**: `--junitxml=<results-file>`.
- **Retries**: add `-p no:rerunfailures` to the test command and the rerun-failures command. It turns pytest-rerunfailures off, `@pytest.mark.flaky(reruns=...)` markers included, and does nothing when the plugin isn't installed. Dropping `--reruns` isn't enough, because a marked test reruns anyway and `--reruns 0` doesn't stop it. With the plugin off, pytest stops on a `--reruns` left in `addopts` with `unrecognized arguments`, so take `--reruns` and its related options out of `addopts`, and the `reruns` ini option out of the config. Take each `flaky` marker out of the tests too, and name its test in the PR body, since someone thought it flaky. With the plugin off, pytest no longer knows the marker, so it warns, and under `--strict-markers` it stops collecting. Another retry plugin, such as `flaky` or `pytest-retry`, needs its own way off.
- **Rerun-failures command**: the test command plus `--lf`, which reads the failures attempt 1 wrote to `.pytest_cache`. A repo that passes `-p no:cacheprovider` has no `--lf`, so its rerun-failures command is `None.` When CI restores `.pytest_cache` from a cache, keep attempt 1's test paths on the rerun, so old failures stay out of it.

The pair, with the results file `results.xml`:

```
pytest -p no:rerunfailures --junitxml=results.xml
pytest -p no:rerunfailures --junitxml=results.xml --lf
```

### Vitest

- **JUnit XML**: `--reporter=default --reporter=junit --outputFile.junit=<results-file>`. The `default` reporter keeps the terminal output.
- **Retries**: `retry` can be set in the config, on a `describe`, or on a single test, as in `test(name, { retry: 2 }, fn)`. `--retry 0` overrides neither of the last two. Search the config and the tests for `retry`, and take each one out. Name every test that had one in the PR body, since someone thought it flaky too.
- **Rerun-failures command**: the test command plus `--lastFailed`, which reads the results cache. The cache is on by default. `--no-cache` or `cache: false` stops it recording, and then `--lastFailed` never finds a failure.
- **Identity**: a `test.each` whose title has no `%` placeholder gives all its cases one identity. Format the parameter into the title, so each case gets its own record. The `classnameTemplate`, `titleTemplate` and `ancestorSeparator` options rewrite every identity, so leave them as they are once records exist.

```
npx vitest run --reporter=default --reporter=junit --outputFile.junit=results.xml
npx vitest run --reporter=default --reporter=junit --outputFile.junit=results.xml --lastFailed
```

### Node's test runner

- **JUnit XML**: `--test-reporter=spec --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination=<results-file>`, before any test file globs. The `spec` pair keeps the terminal output.
- **Retries**: Node 24.16 has no retry option, so there is nothing to turn off.
- **Identity**: Node's JUnit reporter writes `classname="test"` for every test, and `name` is the test's own title, without its file or its `describe` blocks. Two tests with the same title anywhere in the suite share one identity, so they share one record, and quarantining it ignores the failures of both. Give every test a title unique across the whole suite, such as one that starts with the unit it tests. The duplicate check in step 4 of SKILL.md lists the titles that collide today.
- **Subtests**: a test with subtests is written as a `<testsuite>`, so its own failure never reaches the results file. The script sees a non-zero exit with no failed test and fails the build, so that failure never counts as a flake occurrence.
- **Rerun-failures command**: `--test-rerun-failures=<state-file>`, where the Node version CI uses has it. Check `node --help`; Node 24.16 has it. Without it, the rerun-failures command is `None.` The flag needs three things, or a broken test passes:
  1. Attempt 1 passes the same flag and file, because that run writes the state the rerun reads. In the CI config, the test command after `--` carries the flag.
  2. The state file doesn't exist when attempt 1 starts. Node reports every test a leftover file lists as passed without running it, so a test broken since then exits 0. Keep the file out of every CI cache, and give each test step its own file. On GitHub Actions put it under `${{ runner.temp }}`, which the runner empties at the start of every job. On other providers, delete it in the step before the script runs.
  3. The CI doc's Test command leaves the flag out. Local runs use that command, such as a test audit's mutation check, and a leftover state file there would pass the test the check broke. The CI doc's Rerun-failures command carries the flag, with a line under it saying that CI also passes the flag to attempt 1 and starts with no state file.

The CI doc's pair:

```
node --test --test-reporter=spec --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination=results.xml
node --test --test-rerun-failures=<state-file> --test-reporter=spec --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination=results.xml
```

### Other frameworks

- **JUnit XML**: the framework's JUnit reporter, or a reporter package when it has none built in. Adding the package is part of the wiring PR.
- **Retries**: find every place it retries: a command-line flag, its config, and options on single tests or suites, such as Jest's `jest.retryTimes`, Playwright's `retries`, Mocha's `this.retries`, Maven Surefire's `rerunFailingTestsCount` or Gradle's test-retry plugin. Turn each one off, and name each in the PR body.
- **Rerun-failures command**: the framework's flag for running only the tests that failed last time, when it has one. Otherwise `None.`, and attempt 2 reruns the whole test command.

## GitHub Actions

A test job wired for a Vitest suite on a two-OS matrix:

```yaml
jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    permissions:
      contents: read
      issues: write
    steps:
      # The job's existing steps stay as they are, checkout included.
      - name: Test
        env:
          GITHUB_TOKEN: ${{ github.token }}
        run: >-
          node .github/scripts/verdict.mjs
          --results results.xml
          --rerun "npx vitest run --reporter=default --reporter=junit --outputFile.junit=results.xml --lastFailed"
          --job "test (${{ matrix.os }})"
          --flaky-label flaky-test
          --quarantine-label quarantined
          --quarantine-cap 5%
          -- ${{ runner.os == 'Windows' && 'cmd /c' || '' }} npx vitest run --reporter=default --reporter=junit --outputFile.junit=results.xml
```

- **Permissions**: the job needs `issues: write` to record occurrences and apply the quarantine label. A `permissions` block sets every scope it leaves out to none, so list each scope the job already uses beside it, `contents: read` at least, for checkout. A job-level block replaces the workflow-level one for that job.
- **Token**: pass the job's token as `GITHUB_TOKEN: ${{ github.token }}` in the step's `env`. The script reads it from there, never from a flag. When the tracker is somewhere other than this repo's issues, pass a secret holding a token for it as `VERDICT_TRACKER_TOKEN`, with the tracker settings the header gives for that tracker.
- **Matrix**: every leg of a matrix shares one `$GITHUB_JOB`, the job's id. Pass `--job` with the job's id and its matrix values, such as `"test (${{ matrix.os }})"`, which is also the name GitHub shows for the leg when the job sets no `name`. The occurrences then tell the legs apart. Without a matrix, leave `--job` out.
- **Windows**: the script starts the test command after `--` without a shell, and Node on Windows starts a program that way only when it is an `.exe` file. Tools that are `.cmd` files on Windows, such as `npm`, `npx`, `yarn` and `pnpm`, go behind `cmd /c`. In a matrix that mixes Windows and other systems, the expression `${{ runner.os == 'Windows' && 'cmd /c' || '' }}` adds it on Windows only. Running the tool's own entry file with `node`, such as `node node_modules/vitest/vitest.mjs run`, works on every system without it. The `--rerun` command runs through a shell, `cmd.exe` on Windows, and needs no `cmd /c`.
- **Node's test runner**: put the state file under `${{ runner.temp }}`, as in `--test-rerun-failures=${{ runner.temp }}/node-test-rerun.json`, on both the `--rerun` command and the test command after `--`.
- **Fork PRs**: keep the `pull_request` trigger. A fork PR's token is read-only, and the script still reaches a correct verdict and says in the run summary what it couldn't record.
- **Node**: GitHub-hosted runners have Node. A job that runs in a container without Node needs `actions/setup-node` before the test step.

## Other CI providers

The CI doc's `## CI provider` names the provider and its config.

- **Tracker settings**: the script's header lists each setting and where it takes its default. Pass every setting that has no default on this provider, taking the values from the provider's own variables, which its docs list. The run setting must be the same for every job and every attempt of one run, such as a pipeline id. The job setting holds the job's name and any matrix values.
- **Token**: store a token that can read and write issues on the tracker as a masked secret variable named `VERDICT_TRACKER_TOKEN`.
- **Run summary**: the script prints it to the job log. When the provider shows a file as a job summary, pass that file as `--summary`.
- **Windows**: the `.cmd` rule above holds on every provider.

### GitLab CI

A test job wired for a Vitest suite, in `.gitlab-ci.yml`:

```yaml
test:
  image: node:24
  script:
    # The job's existing setup, such as npm ci, stays before this command.
    - >-
      node ci/verdict.mjs
      --results results.xml
      --rerun "npx vitest run --reporter=default --reporter=junit --outputFile.junit=results.xml --lastFailed"
      --flaky-label flaky-test
      --quarantine-label quarantined
      --quarantine-cap 5%
      -- npx vitest run --reporter=default --reporter=junit --outputFile.junit=results.xml
```

- **Tracker settings**: when `$GITLAB_CI` is set, the script picks the GitLab tracker and takes `--tracker-url`, `--repo`, `--branch`, `--job`, `--run` and `--run-url` from GitLab's predefined variables, as its header lists. Pass none of them when the records live in the project's own issues. A `parallel:matrix` job's name already holds its matrix values, so `--job` stays out too.
- **Token**: create a project access token with the `api` scope and the Planner role or higher, or a group or personal access token where project tokens aren't available. Store it as a masked CI/CD variable named `VERDICT_TRACKER_TOKEN`, and leave it unprotected, since a protected variable reaches only pipelines on protected branches and tags. Without it the script falls back to `$CI_JOB_TOKEN`, which can't write issues, so nothing is recorded.
- **Retries**: a job-level `retry:` reruns a job the script already judged. Take it out of the test job, or limit its `when` to infrastructure failures such as `runner_system_failure` and `stuck_or_timeout_failure`.
- **Fork merge requests**: a fork's merge request pipeline runs in the fork by default, without the project's CI/CD variables. The script still reaches a verdict, treats no test as quarantined, and says in the job log what it couldn't record.
- **Node**: the job's image needs Node, such as `node:24`. A job on another image installs Node before the script runs.

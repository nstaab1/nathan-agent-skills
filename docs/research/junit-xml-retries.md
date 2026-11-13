# How pytest and Vitest write a retried test into JUnit XML

This is the first task of the flaky-tests work in [spec #12](https://github.com/nstaab1/nathan-agent-skills/issues/12), done for [ticket #17](https://github.com/nstaab1/nathan-agent-skills/issues/17). The verdict script's wiring guidance rested on third-party reports that a framework's own retries leave no trace in its JUnit XML file. I ran pytest and Vitest on 2026-11-13 with their retries on and off and kept every file they wrote. The sample projects, the capture scripts and the files are in [`junit-xml-retries/`](junit-xml-retries/).

## The answer

| Retries on | A test that fails, then passes | A test that fails every attempt |
| --- | --- | --- |
| pytest with pytest-rerunfailures, `--reruns 2` | Two empty `<testcase>` elements with the same `classname` and `name` | Three `<testcase>` elements: two empty, then one holding `<failure>` |
| Vitest, `--retry 2` | One empty `<testcase>`, the same as a test that passed first time | One `<testcase>` holding three `<failure>` elements, one per attempt |

The reports were right. In both frameworks a test that fails and then passes on a retry exits 0 and leaves no `<failure>`, `<error>`, `flakyFailure` or `rerunFailure` element in the file. pytest leaves one trace, a second testcase with the same identity, but that testcase is empty and reads as a pass. Nothing in it says a failure caused it.

With retries off, both frameworks write the first attempt's failure as a plain `<failure>` inside the testcase, and a second run writes the pass as a plain empty testcase. Comparing the two files finds the flake occurrence, which is what the verdict script does.

The design stands. The verdict script does the retry, and a wired repo switches the framework's retries off. Switching them off takes more than dropping a command-line flag in either framework, so the wiring guidance below lists where else retries hide.

Both frameworks have a built-in rerun-failures command: pytest's `--lf` and Vitest's `--lastFailed`. They differ when no failures are recorded. pytest runs the whole suite and Vitest runs nothing and exits 1.

## Versions

| Tool | Version |
| --- | --- |
| Python | 3.14.7, installed by uv 0.12.17 |
| pytest | 9.2.0 |
| pytest-rerunfailures | 16.7 |
| Node | 24.16.0 |
| Vitest | 5.1.0 |

Python, pytest, pytest-rerunfailures and Vitest were the newest stable releases that day. Node is the version installed on this machine. pytest 9.2.0 has no retry option of its own, and `pytest --help` lists none, so the pytest retries here come from pytest-rerunfailures. Vitest's retry is built in.

## How the files were made

Each project has a test that fails on its first attempt and passes after that. The first time it runs, a pytest fixture or a Vitest helper writes a marker file into `.flake-state/`, and the test fails because the marker was missing. The marker survives a retry inside one process and a fresh process alike, so one test covers the retries-on and retries-off cases. `capture.sh` deletes the state folder and the framework's cache before each case.

To make the files again:

```sh
cd docs/research/junit-xml-retries/pytest && uv run --python 3.14 ./capture.sh
cd docs/research/junit-xml-retries/vitest && npm install && ./capture.sh
```

`capture.sh` records each run's exit code in `captures/exit-codes.txt`. It also rewrites absolute paths in the files to project-relative ones and the home folder to `~`, so the files don't name this machine's folders. Nothing else in the files is edited. pytest writes its file as one line, so the excerpts below are indented by hand.

## pytest

### Retries off

[`retries-off-attempt-1.xml`](junit-xml-retries/pytest/captures/retries-off-attempt-1.xml), from `pytest tests/test_flaky.py`, exit 1:

```xml
<testcase classname="tests.test_flaky" name="test_passes" time="0.000" />
<testcase classname="tests.test_flaky" name="test_fails_once" time="0.000">
  <failure message="AssertionError: fails on its first attempt only&#10;assert not True">...</failure>
</testcase>
```

[`retries-off-attempt-2-lf.xml`](junit-xml-retries/pytest/captures/retries-off-attempt-2-lf.xml), from `pytest --lf tests/test_flaky.py`, exit 0. The file holds one empty `test_fails_once` testcase. `--lf` deselected `test_passes`, so it isn't in the file at all.

### Retries on

[`retries-on.xml`](junit-xml-retries/pytest/captures/retries-on.xml), from `pytest tests/test_flaky.py --reruns 2`, exit 0. The terminal says `2 passed, 1 rerun`.

```xml
<testsuite name="pytest" errors="0" failures="0" skipped="0" tests="2" ...>
  <testcase classname="tests.test_flaky" name="test_passes" time="0.000" />
  <testcase classname="tests.test_flaky" name="test_fails_once" time="0.000" />
  <testcase classname="tests.test_flaky" name="test_fails_once" time="0.000" />
</testsuite>
```

The first `test_fails_once` is the failed attempt. pytest-rerunfailures sets that attempt's report outcome to `rerun`. pytest's own `junitxml` plugin adds a child element only for a passed, failed or skipped report, and it closes a testcase at each teardown, so the failed attempt becomes an empty testcase. See `pytest_runtest_logreport` in `_pytest/junitxml.py`. `tests="2"` counts tests while the file holds three testcases.

[`retries-on-always-fails.xml`](junit-xml-retries/pytest/captures/retries-on-always-fails.xml), from `pytest tests/test_always_fails.py --reruns 2`, exit 1:

```xml
<testcase classname="tests.test_always_fails" name="test_always_fails" time="0.000" />
<testcase classname="tests.test_always_fails" name="test_always_fails" time="0.000" />
<testcase classname="tests.test_always_fails" name="test_always_fails" time="0.000">
  <failure message="AssertionError: fails on every attempt&#10;assert (1 + 1) == 3">...</failure>
</testcase>
```

A reader that keeps the first testcase it meets for each identity reads this real failure as a pass.

pytest-rerunfailures also has `--fail-on-flaky`. [`retries-on-fail-on-flaky.xml`](junit-xml-retries/pytest/captures/retries-on-fail-on-flaky.xml) is the same file as `retries-on.xml` apart from times, but the run exits 7. The verdict script would see a non-zero exit with no failed test and call it a crash.

[Pull request 380](https://github.com/pytest-dev/pytest-rerunfailures/pull/380) on pytest-rerunfailures would write `flakyFailure` elements. It was still open and unmerged on 2026-11-13.

### Rerunning only the failed tests

The command is the attempt-1 command with `--lf` added. Its long form is `--last-failed`.

- pytest keeps the failed list in `.pytest_cache/v/cache/lastfailed` under the rootdir, or under `cache_dir` if the repo sets one. Attempt 1 writes it into the job's own workspace, so nothing has to carry over between jobs.
- With no recorded failures, `--lf` runs the whole suite and says `run-last-failure: no previously failed tests, not deselecting items.` That is the default `--last-failed-no-failures=all`. If pytest can't write `cache_dir` it only warns, records nothing, and `--lf` runs everything.
- `-p no:cacheprovider` removes the option, and pytest stops with `unrecognized arguments: --lf`.
- The list keeps old failures of tests the latest run didn't collect. A fresh CI workspace has none. If CI restores `.pytest_cache` from an earlier run, keep attempt 1's paths on the rerun so tests outside them stay out. In a local check, a bare `pytest --lf` reran a failure two runs old that `pytest --lf tests/test_flaky.py` left alone.
- The rerun file holds only the rerun tests.

## Vitest

### Retries off

[`retries-off-attempt-1.xml`](junit-xml-retries/vitest/captures/retries-off-attempt-1.xml), from `vitest run tests/flaky.spec.js --reporter=junit --outputFile=...`, exit 1:

```xml
<testcase classname="tests/flaky.spec.js" name="passes" time="0.000681416">
</testcase>
<testcase classname="tests/flaky.spec.js" name="fails once" time="0.002489333">
    <failure message="fails on its first attempt only: expected true to be false // Object.is equality" type="AssertionError">...</failure>
</testcase>
```

[`retries-off-attempt-2-lastfailed.xml`](junit-xml-retries/vitest/captures/retries-off-attempt-2-lastfailed.xml), from `vitest run --lastFailed tests/flaky.spec.js`, exit 0. Vitest reran only `fails once`, which is empty. It still lists `passes`, as `<skipped/>`.

### Retries on

[`retries-on.xml`](junit-xml-retries/vitest/captures/retries-on.xml), from `vitest run tests/flaky.spec.js --retry 2`, exit 0:

```xml
<testcase classname="tests/flaky.spec.js" name="passes" time="0.000548875">
</testcase>
<testcase classname="tests/flaky.spec.js" name="fails once" time="0.002080833">
</testcase>
```

Both testcases have the shape of a test that passed first time. The default terminal reporter prints `Tests  2 passed (2)` and doesn't mention the retry. The verbose reporter adds `(retry x1)` after the test. Vitest's JSON reporter does keep the failed attempt's message in `failureMessages` on a test whose status is `passed`. The verdict script reads only JUnit XML, so that changes nothing here.

[`retries-on-always-fails.xml`](junit-xml-retries/vitest/captures/retries-on-always-fails.xml), from `vitest run tests/always-fails.spec.js --retry 2`, exit 1. One testcase holds three identical `<failure>` elements, one per attempt.

### Rerunning only the failed tests

The command is the attempt-1 command with `--lastFailed` added.

- Vitest records each file's result in `results.json` under Vite's `cacheDir`. The default location is `node_modules/.vite/vitest/<hash>/results.json`. Attempt 1 writes it into the job's own workspace.
- It reruns the files that failed and, inside them, only the tests that failed. Going by the 5.1.0 source, a file that failed outside any test, in a hook or on import, reruns whole.
- With no recorded failures it runs nothing, prints `No failed tests found, exiting with code 1`, writes a file holding only `<testsuites name="vitest tests" tests="0" ...>`, and exits 1. Adding `--passWithNoTests` makes that exit 0. pytest does the opposite and runs everything.
- `--no-cache`, or `cache: false` in the config, stops Vitest recording results, so `--lastFailed` then never finds a failure.
- The rerun file lists every other test in each rerun file as `<skipped/>`. A test that passed in attempt 1 shows as skipped in attempt 2. That is harmless, because the script only looks up attempt 1's failures in file 2.

## What the verdict script's reader needs to know

The script's identity is `classname` plus `name`. From [pytest's `shapes.xml`](junit-xml-retries/pytest/captures/shapes.xml), [Vitest's `shapes.xml`](junit-xml-retries/vitest/captures/shapes.xml) and the two import-error files:

| Case | pytest 9.2.0 | Vitest 5.1.0 |
| --- | --- | --- |
| `classname` | Dotted path from the rootdir without `.py`, plus any class: `tests.test_shapes`, `tests.test_shapes.TestGroup`, `tests.sub.test_nested` | File path from the root: `tests/shapes.spec.js`, `tests/sub/nested.spec.js` |
| `name` | Function name, plus `[id]` for a parameterised case: `test_param[1]`, `test_param_odd_ids[a b]`, `test_param_odd_ids[x[y]::z]` | Describe names and the test title joined by ` > `: `outer > inner > nested test` |
| Parameterised, same value twice | pytest makes the ids unique: `test_param_same_values[same0]`, `test_param_same_values[same1]` | The name is the title after `%` formatting. With no placeholder, both cases are named `each without placeholder`, the first with `<failure>` and the second empty |
| Assertion fails | `<failure message="...">` | `<failure message="..." type="AssertionError">` |
| Other exception in the test | `<failure>` | `<failure type="TypeError">` |
| Setup fails | `<error message="failed on setup with ...">` | When `beforeAll` throws, its tests get `<skipped/>` and an extra testcase named after the `describe` holds the `<failure>` |
| Teardown fails | `<error message="failed on teardown with ...">`. A test that fails and then hits a teardown error gets two testcases, one with `<failure>`, then one with `<error>` | When `afterEach` throws, the test gets `<failure>` |
| Skipped | `<skipped type="pytest.skip" message="...">` | `<skipped/>`, also for `test.todo` |
| Expected failure | An xfail test gets `<skipped type="pytest.xfail">` | A `test.fails` test that fails is an empty testcase |
| File fails to import | `classname=""`, `name="broken.test_import_error"`, `<error message="collection failure">`, exit 2, and no other test runs | `classname` and `name` are both the file path, with `<failure>`, exit 1 |

What this means for the script:

1. One identity can appear more than once in a file even with retries off. pytest does it for a failure followed by a teardown error, and Vitest for a `test.each` whose title has no placeholder. Treat an identity as failed when any of its testcases holds `<failure>` or `<error>`. Keeping only the first testcase reads pytest's retried real failure as a pass. Keeping only the last reads Vitest's `each without placeholder` as a pass, though its first case failed.
2. Vitest never wrote `<error>` in these runs, and every `errors` count was 0. Hook errors and import errors arrive as `<failure>`. pytest uses `<error>` for setup, teardown and collection. The spec already treats failure and error the same, and the files show it has to.
3. A Vitest title can itself contain ` > `, as `each odd x > y` does, so a name can't be split back into describe blocks. Treat it as an opaque string.
4. A Vitest parameterised test with no placeholder in its title gives all its cases one identity, so the script can't tell them apart. The spec's case "a parameterised test's cases treated separately" holds for pytest, and for Vitest only when the title formats the parameter.
5. Count `<testcase>` elements and ignore the `tests`, `failures` and `errors` attributes. pytest's retry files say `tests="2"` over three testcases.
6. Some options change the identity. pytest's `--junitprefix` prepends to `classname`. Vitest's `classnameTemplate`, `titleTemplate` and `ancestorSeparator` rewrite `classname` and `name`. A repo that changes one of these after flaky-test records exist leaves those records under the old identity. Options that add a path without touching the identity are pytest's `junit_family=xunit1`, which adds `file` and `line` ([`shapes-xunit1.xml`](junit-xml-retries/pytest/captures/shapes-xunit1.xml)), and Vitest's `addFileAttribute`, which adds `file`. pytest's default family, `xunit2`, writes no file attribute.

## Wiring guidance

A wired repo switches the framework's retries off. Dropping the flag from the test command is not enough in either framework, because both let a single test ask for retries, and an explicit zero on the command line doesn't override that.

- In pytest, a test marked `@pytest.mark.flaky(reruns=2)` reruns with no option set, and `--reruns 0` doesn't stop it. `-p no:rerunfailures` switches the plugin off, markers included. With the plugin off, pytest rejects a `--reruns` left in `addopts` with `unrecognized arguments: --reruns`. Check the `reruns` ini option too.
- In Vitest, `retry` can be set in the config, on a `describe` or on a single test, as in `test(name, { retry: 2 }, fn)`. `--retry 0` overrode neither the `describe` setting nor the test setting. Search the tests for `retry`.

The rerun-failures command for the CI doc:

- pytest: the test command plus `--lf`.
- Vitest: the test command plus `--lastFailed`, with the results cache left on, which is the default.

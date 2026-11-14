# Slowest first

With no scope named, the audit starts with the test files that cost the most CI time.

1. **Timings from CI.** Under Run history in `docs/agents/ci.md`, use the List runs command to find the newest passing run of the default branch, and the Results file of a run command to download the results file that Test command names. Read each test's duration from the `time` attribute on each `testcase` in that JUnit XML file. When the suite runs in several test jobs, take every job's results file from that run.
2. **Local timings.** When the CI doc is missing, either command reads `None.`, or the download fails, run each test file on its own and time the run. When the test command names its own files, as `npm test` running `node --test "spec/*.spec.mjs"` does, run the runner it calls with the one file in place of that pattern. On a suite of more than about a hundred files, run the whole suite once instead, with a reporter that writes a JUnit XML results file outside the working tree, such as in the system temp directory.
3. **Rank.** Give each test file one duration and sort the files slowest first. A `testcase` time leaves out the file's setup hooks, such as starting a server or a browser, and that setup is often what makes a test expensive. So take a file's duration from its own timed run, or from its `testsuite` time when the results give one per file, and sum its `testcase` times only when neither exists.
4. **Bound.** Audit down the ranking until you have covered ten files or the whole suite, unless the user set another bound.

Done when you hold the ranked files with their durations, the source of the timings, either a run link or "local run", and the bound. The report lists them, so the next audit can start at the first file this one left out.

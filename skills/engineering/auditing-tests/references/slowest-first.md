# Slowest first

With no scope named, the audit starts with the test files that cost the most CI time.

1. **Timings from CI.** Use the run-history commands in `docs/agents/ci.md` to find the newest passing run of the default branch whose test results cover the whole suite. Read each test's duration from those results, from the `time` attribute on each `testcase` in a JUnit XML artifact or from the provider's own test report.
2. **Local timings.** When the CI doc is missing, its runs keep no per-test results, or the fetch fails, run the whole suite once locally with a reporter that writes durations, such as the framework's JUnit XML reporter. Write the results file to the system temp directory, outside the working tree, so the audit's clean-tree check still passes.
3. **Rank.** Sum the durations per test file and sort the files slowest first.
4. **Bound.** Audit down the ranking until you have covered ten files or the whole suite, unless the user set another bound.

Done when you hold the ranked files with their durations, the source of the timings, either a run link or "local run", and the bound. The report lists them, so the next audit can start at the first file this one left out.

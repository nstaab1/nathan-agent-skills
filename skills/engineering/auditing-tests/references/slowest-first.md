# Slowest first

With no scope named, the audit starts with the test files that cost the most CI time.

1. **Timings from CI.** Under Run history in `docs/agents/ci.md`, use the List runs command to find the newest passing run of the default branch, and the Results file of a run command to download the results file that Test command names. Read each test's duration from the `time` attribute on each `testcase` in that JUnit XML file. When the suite runs in several test jobs, take every job's results file from that run.
2. **Local timings.** When the CI doc is missing, either command reads `None.`, or the download fails, run the whole suite once locally with a reporter that writes durations, such as the framework's JUnit XML reporter. Write the results file to the system temp directory, outside the working tree, so the audit's clean-tree check still passes.
3. **Rank.** Sum the durations per test file and sort the files slowest first.
4. **Bound.** Audit down the ranking until you have covered ten files or the whole suite, unless the user set another bound.

Done when you hold the ranked files with their durations, the source of the timings, either a run link or "local run", and the bound. The report lists them, so the next audit can start at the first file this one left out.

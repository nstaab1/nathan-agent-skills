# CI-health design Resources

## Knowledge

- [Docs: "Understanding GitHub Actions" (GitHub)](https://docs.github.com/en/actions/learn-github-actions/understanding-github-actions)
  Official definitions of workflow, job, step and runner. Use for: lesson 1, anything about how a run is put together.
- [Docs: "Setting exit codes for actions" (GitHub)](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/set-exit-codes)
  States that exit code 0 is success and any other code is failure. Use for: lessons 1 and 4, how the verdict script fails a build.
- [Docs: "Creating JUnitXML format files" (pytest)](https://docs.pytest.org/en/stable/how-to/output.html#creating-junitxml-format-files)
  How pytest writes the file and the `junit_family` setting. Use for: lesson 2 examples.
- [Docs: Reporters (Vitest)](https://vitest.dev/guide/reporters)
  The JUnit reporter, its output file and how `classname` is filled in. Use for: lesson 2 examples.
- [Docs: "Rerun Failing Tests" (Maven Surefire)](https://maven.apache.org/surefire/maven-surefire-plugin/examples/rerun-failing-tests.html)
  The most concrete description of how retries appear in JUnit XML (`flakyFailure`, `rerunFailure`). Use for: lessons 2 and 3.
- [Docs: JUnit support (cargo-nextest)](https://nexte.st/book/junit)
  A second tool's account of the same flaky elements. Use for: showing that dialects differ.
- [Wiki: test report formats (ligurio/sqa-wiki)](https://github.com/ligurio/sqa-wiki/wiki/test-report-formats)
  Points to the Jenkins-derived schema, the nearest thing to a shared definition of the base elements. Use for: lesson 2.
- [Article: "Flaky Tests at Google and How We Mitigate Them" by John Micco (Google Testing Blog, 2016)](https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html)
  Defines a flaky test as one that passes and fails on the same code, and describes rerunning as a mitigation. Use for: lesson 3.
- Local: `GLOSSARY.md` and `docs/adr/0001-quarantine-is-a-tracker-label.md` at the root of this repo
  The design's own terms and its one recorded decision. Use for: every lesson. Lessons must use these terms.

- [Paper: "Practical Mutation Testing at Scale: A view from Google" by Petrovic et al. (2021)](https://research.google/pubs/pub50658/)
  Defines killed and living mutants. Use for: lesson 6, where the mutation check comes from.
- [Article: Mutation testing (Google Testing Blog, April 2021)](https://testing.googleblog.com/2021/04)
  Short practitioner account of the same idea. Use for: lesson 6.
- [PR: "Record retried failures as flakyFailure elements in JUnit XML" (pytest-rerunfailures #380)](https://github.com/pytest-dev/pytest-rerunfailures/pull/380)
  States that pytest's junitxml plugin ignores rerun outcomes. Release status unconfirmed. Use for: lesson 3, the retry gap.

## Wisdom (Communities)

- None chosen yet. Not asked.

## Gaps

- No single official JUnit XML specification exists. It is a de facto format with dialects per tool.
- How pytest and Vitest report a retried test rests on third-party reports. Nobody here has run them to confirm. The Vitest evidence is one project's PR, which is weak.

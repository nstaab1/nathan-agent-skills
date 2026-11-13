# CI-health lessons

Seven short lessons that explain the design behind the CI-health skills: `auditing-tests`, `fixing-flaky-tests`, `reviewing-ci-run-times` and `ns-code-review`. They were written with the `teach` skill while the design was being settled, and they describe the design before any of it was built.

Open `lessons/0001-what-a-ci-run-is-made-of.html` in a browser and follow the links. Each lesson takes five to seven minutes and ends with a quiz.

| Lesson | Topic |
| --- | --- |
| 1 | What a CI run is made of: run, job, step, runner, exit code |
| 2 | JUnit XML, the results file every framework can write |
| 3 | Retries and flake occurrences |
| 4 | The verdict script |
| 5 | The flaky-test record and quarantine |
| 6 | Tautological tests and the mutation check |
| 7 | The four pieces together |

`reference/glossary.html` and `reference/design-map.html` are the two pages to come back to. The design map lists every decision by ticket.

The design is written up in [spec #12](https://github.com/nstaab1/nathan-agent-skills/issues/12) and split into tickets #13 to #25. The lessons refer to `GLOSSARY.md` and `docs/adr/0001-quarantine-is-a-tracker-label.md` at the repo root, which land with ticket #13.

Sources are listed in `RESOURCES.md`.

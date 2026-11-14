---
name: auditing-tests
description: "Audit a test suite for unneeded tests and file a ticket per finding, proving tautological ones with a mutation check. Use when the user wants tests audited or pruned, or a run-time review suggests a test-audit scope."
---

A **test audit** reads a scope of a repo's tests, finds the **unneeded** ones and files tickets for them. An unneeded test is one whose removal or relocation would lose no verification of behaviour. Each finding is one of five kinds and carries the evidence its kind demands.

Tickets are the audit's only output. Every test stays exactly as it is, and removal happens later, from a ticket, after someone has read the evidence. Besides tickets, the one thing the audit changes is production code during a mutation check, and the check restores it before moving on. On a local-file tracker, the ticket files are the only thing the audit leaves in the working tree. Commit them when the tracker doc says to commit tickets, and otherwise leave them for the user.

Read these docs in the repo first:

- `docs/agents/issue-tracker.md`: how to search, read and file tickets. When it is missing, stop and tell the user to run `/setup-agent-skills`. On a local-file tracker, a ticket is open unless its `Status:` line reads `resolved`.
- `docs/agents/triage-labels.md`: the label string for each triage role. When it is missing, the role names `ready-for-agent` and `needs-triage` are the label strings.
- `docs/agents/ci.md`: its Test command, Run history and Labels sections give the test command, the commands that fetch CI runs and their results files, and the flaky label. When the doc or a field is missing or reads `None.`, take the test command from the repo's own scripts and use `flaky-test` as the flaky label.

## The five kinds

| Kind | The test | Evidence | Label |
| --- | --- | --- | --- |
| Tautological | still passes when the behaviour it claims to verify is broken | a mutation check | `ready-for-agent` |
| Dead | is skipped or disabled with no ticket tracking its return | the skip marker and the tracker searches | `ready-for-agent` |
| Redundant | verifies a behaviour another test already verifies through the same interface | reasoning that names the other test | `needs-triage` |
| Implementation-coupled | fails on a refactor that changes no behaviour | reasoning that names the refactor | `needs-triage` |
| Misplaced | verifies at an expensive level what a cheaper level already covers | reasoning that names the cheaper test | `needs-triage` |

Each finding takes one kind. When two fit, take the one with the harder evidence. A mutation check or a skip marker beats reasoning. Run a mutation check only on a test that looks tautological. A judgement finding that doesn't look tautological keeps its kind.

**Tautological.** Suspect a test whose expected value comes from the code under test, whose assertion checks a value the test itself gave a mock or stub, that compares a value with itself, whose assertions sit in a callback that never runs or a `catch` that swallows them, or whose only assertions are on calls the code makes to its own methods, which check no outcome. Looks only make a suspect. A test with no assertion still fails when the code throws, so a smoke test that claims only "it runs" may be doing its job. The mutation check decides.

**Dead.** The test carries a skip or disable marker in its framework's form, such as `it.skip`, `{ skip: true }`, `@pytest.mark.skip`, `@Disabled`, `t.Skip()` or `#[ignore]`, or it is commented out or excluded in the runner's config. A conditional skip is dead only when no environment the suite runs in, CI included, meets its condition. The marker's form makes a skip conditional, such as `@pytest.mark.skipif(...)` or a skip call inside an `if`, and a reason string that describes a condition leaves the skip unconditional. An open ticket that names the test, or an open ticket the marker links, tracks it. A marker that links a closed ticket leaves the test untracked.

**Redundant.** The test has the same entry point, the same class of input and the same observable outcome as another test. Different values from one input class still count as the same. A test whose setup and entry point match another's, and whose assertions are a subset of the other's, is redundant too. Different input classes or boundaries, such as an empty list, one item and many items, are distinct cases. The same behaviour through a different interface is not redundant, so judge it as misplaced instead. Name the other test and say which of the pair to keep.

**Implementation-coupled.** The test asserts how the code works rather than what it does: call counts, order or arguments on the code's own methods and helpers, spies on internal functions, reads of internal fields or data structures, or snapshots of internal structure. A call across a boundary the behaviour is about, such as an email sent, a request made or a row written, is behaviour, and asserting on it is fine. Name one refactor that keeps the behaviour and fails the test, and the test that still covers the behaviour when one does.

**Misplaced.** The test runs at an expensive level, such as a server, browser, database, subprocess, real network or a sleep, to check logic a cheaper test already checks with the same class of input and outcome. A test of the expensive level's own behaviour, such as routing, serialization, status codes or a database constraint, belongs there, and so does one end-to-end test per route or flow. Judge the others on the logic they check. Name the cheaper test, with both tests' durations when timing data exists.

## 1. Fix the scope

Take the scope the caller names: paths, a module, test names, or the slow tests a run-time review handed over. With no scope, rank the suite slowest first as [references/slowest-first.md](references/slowest-first.md) says.

The scope bounds which tests can become findings. Read outside it freely, since a redundant or misplaced finding often rests on a test elsewhere.

Done when you hold the in-scope test files or tests, in the order you will audit them.

## 2. Leave flaky tests to their records

List open tickets that carry the flaky label. Each one is a flaky-test record for one test. Its body gives the test's identity, as its JUnit XML results file gives it, in its Classname and Name lines. A record whose body gives none, as one a person wrote, names its test in its title, classname plus name. Drop every in-scope test that matches a record, and drop it when the match is uncertain too. The flaky-test work owns those tests. A local-file tracker holds no flaky-test records, so skip this step there.

Done when every in-scope test is kept, or dropped with the record it matched.

## 3. Get a green baseline

Run `git status --porcelain`. The working tree is clean when it prints nothing outside a local-file tracker's ticket folder. When it isn't clean, stop and ask the user to commit or stash their changes, since a mutation check needs a clean working tree. Then run the in-scope tests with the repo's test command, and work out the command that runs one test on its own. A test that fails here is a real failure. Report it and leave it out of the audit. A skipped test neither passes nor fails, so it stays in the audit as a dead suspect.

Done when the tree is clean, every in-scope test passes or is skipped, and you have run one test on its own.

## 4. Classify

Read every in-scope test, the code it exercises, and the other tests of that code. Mark each test with one of the five kinds or with "keep". Write the reasoning for each redundant, implementation-coupled and misplaced finding as you go, naming the other test where the kind needs one.

Done when every in-scope test carries a kind or "keep", and every judgement finding has its reasoning written.

## 5. Prove each tautological suspect

Run a mutation check on each suspect, as [references/mutation-check.md](references/mutation-check.md) says. A suspect that fails under the break is doing its job. Mark it "keep", or classify it again under another kind.

Done when every tautological finding has a passing mutation check on record, and the working tree is clean.

## 6. Confirm each dead suspect is untracked

For each dead suspect, read the marker's reason and the comments beside it for a ticket reference, and fetch any ticket it names. Then search open tickets for the test's name and for its file. When an open ticket about this test turns up either way, the test is tracked, so mark it "keep". Otherwise record the marker line, when it was added according to `git log -S '<marker text>'` or `git blame`, and each search you ran.

Then check the skip's reason when it names a condition you can check without editing a test, such as a bug since fixed or a platform the code no longer treats apart. Read the code, or call it in a one-off probe, and record whether the reason still holds.

Done when every dead finding has its marker, its date and its empty searches on record, and the result of any check of its reason.

## 7. File tickets

File the findings as [references/tickets.md](references/tickets.md) says.

Done when every finding sits in exactly one filed ticket, or is listed against an open ticket that already names it.

## 8. Report

Tell the user:

- The scope audited and, for a slowest-first audit, the ranking, its source and the last file covered.
- Tests dropped for a flaky-test record, and tests that failed the baseline.
- Each ticket filed, with its link or path, kind, label and tests. On a local-file tracker, say whether you committed the ticket files.
- For each tautological finding, the break that left it passing, in one line.

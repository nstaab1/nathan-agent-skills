---
name: ns-code-review
description: "Two-axis pre-merge review of the diff since a fixed point: Standards (the repo's documented coding standards, a code-smell baseline and an unneeded-test rule) and Spec (the originating issue or spec), run as parallel sub-agents. Use when an implement workflow reaches its review step, or the user asks to review a branch, a PR or work in progress. Preferred over `code-review` when both are installed."
---

<!-- Derived from code-review in mattpocock/skills (MIT). See THIRD_PARTY_NOTICES.md. -->

Two-axis review of the diff between `HEAD` and a fixed point the user supplies:

- **Standards**: does the code conform to this repo's documented coding standards, and is every test it adds or changes needed?
- **Spec**: does the code faithfully implement the originating issue / spec?

Both axes run as **parallel sub-agents** so they don't pollute each other's context, then this skill aggregates their findings.

The issue tracker should have been provided to you. If `docs/agents/issue-tracker.md` is missing, tell the user to run `/setup-agent-skills`.

## Process

### 1. Pin the fixed point

Whatever the user said is the fixed point (a commit SHA, branch name, tag, `main`, `HEAD~5`, etc.). If they didn't specify one, ask for it.

Capture the diff command once: `git diff <fixed-point>...HEAD` (three-dot, so the comparison is against the merge-base). Also note the list of commits via `git log <fixed-point>..HEAD --oneline`.

Before going further, confirm the fixed point resolves (`git rev-parse <fixed-point>`) and the diff is non-empty. A bad ref or empty diff should fail here, not inside two parallel sub-agents.

### 2. Identify the spec source

Look for the originating spec, in this order:

1. Issue references in the commit messages (`#123`, `Closes #45`, GitLab `!67`, etc.), fetched via the workflow in `docs/agents/issue-tracker.md`.
2. A path the user passed as an argument.
3. A spec file under `docs/`, `specs/`, or `.scratch/` matching the branch name or feature.
4. If nothing is found, ask the user where the spec is. If they say there isn't one, the **Spec** sub-agent will skip and report "no spec available".

### 3. Identify the standards sources

Anything in the repo that documents how code should be written, such as `CODING_STANDARDS.md` or `CONTRIBUTING.md`.

On top of whatever the repo documents, the Standards axis always carries the **smell baseline** below: a fixed set of Fowler code smells (_Refactoring_, ch.3) that applies even when a repo documents nothing. Two rules bind it:

- **The repo overrides.** A documented repo standard always wins; where it endorses something the baseline would flag, suppress the smell.
- **Always a judgement call.** Each smell is a labelled heuristic ("possible Feature Envy"), never a hard violation. Like any standard here, skip anything tooling already enforces.

Each smell reads *what it is* → *how to fix*; match it against the diff:

- **Mysterious Name**: a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
- **Duplicated Code**: the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
- **Feature Envy**: a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- **Data Clumps**: the same few fields or params keep travelling together (a type wanting to be born). → bundle them into one type, pass that.
- **Primitive Obsession**: a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- **Repeated Switches**: the same `switch`/`if`-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- **Shotgun Surgery**: one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
- **Divergent Change**: one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
- **Speculative Generality**: abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
- **Message Chains**: long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- **Middle Man**: a class or function that mostly just delegates onward. → cut it, call the real target direct.
- **Refused Bequest**: a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

The Standards axis also always carries the _Unneeded-test rule_ section below, which judges the tests in the diff.

### 4. Spawn both sub-agents in parallel

**Standards sub-agent prompt** should include:

- The full diff command and commit list.
- The list of standards-source files you found in step 3, **plus the smell baseline from step 3 and the whole _Unneeded-test rule_ section**, pasted in full (the sub-agent has no other access to them).
- The brief: "Report, per file/hunk where relevant, (a) every place the diff violates a documented standard: cite the standard (file + the rule); (b) any baseline smell you spot: name it and quote the hunk; and (c) every unneeded test the diff adds or changes: name the test and its kind, and give the evidence the unneeded-test rule asks for. Distinguish hard violations from judgement calls: documented-standard breaches can be hard, but baseline smells are always judgement calls, and a documented repo standard overrides the baseline. Unneeded-test findings split as the rule says. Skip anything tooling enforces. Under 400 words."

**Spec sub-agent prompt** should include:

- The diff command and commit list.
- The path or fetched contents of the spec.
- The brief: "Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong. Quote the spec line for each finding. Under 400 words."

If the spec is missing, skip the Spec sub-agent and note this in the final report.

### 5. Aggregate

Present the two reports under `## Standards` and `## Spec` headings, verbatim or lightly cleaned. Do **not** merge or rerank findings, because the two axes are deliberately separate (see _Why two axes_).

When the Standards report names unneeded tests and `auditing-tests` is among your available skills, add one line under it suggesting a test audit scoped to those tests. The audit proves a tautological finding with a mutation check and files a ticket for each finding.

End with a one-line summary: total findings per axis, and the worst issue _within each axis_ (if any). Don't pick a single winner across axes: that's the reranking the separation exists to prevent.

## Unneeded-test rule

An **unneeded test** is one whose removal or relocation would lose no verification of behaviour. Check every test the diff adds or changes against the five kinds below. Read the code each test exercises and the repo's other tests of that code, in the diff or outside it, as far as a finding needs.

A review reads code and runs none, so it has no mutation check to prove a finding. Each finding gives the evidence in the last column instead.

| Kind | The test | Evidence the finding gives |
| --- | --- | --- |
| Tautological | still passes when the behaviour it claims to verify is broken | the assertion, quoted, and a break in the production code that would leave it passing |
| Dead | is skipped or disabled with no ticket tracking its return | the skip marker, quoted, with no ticket named in it or beside it |
| Redundant | verifies a behaviour another test already verifies through the same interface | the other test by file and name, and which of the two to keep |
| Implementation-coupled | fails on a refactor that changes no behaviour | that refactor, and the test that still covers the behaviour when one does |
| Misplaced | verifies at an expensive level what a cheaper level already covers | the cheaper test by file and name |

Tautological and dead findings are hard violations. A reader checks their evidence against the quoted lines, and each has a clear fix. Redundant, implementation-coupled and misplaced findings rest on reasoning, so they are judgement calls. Each test takes one kind, and when a hard kind and a judgement kind both fit, take the hard one.

**Tautological.** Suspect a test whose expected value comes from the code under test, that asserts a value the test itself gave a mock or stub, that compares a value with itself, or whose assertions sit in a callback that never runs or a `catch` that swallows them. A test with no assertion still fails when the code throws, so a smoke test that claims only "it runs" can be doing its job. Report a suspect only when you can name the break that leaves it passing.

**Dead.** The test carries a skip or disable marker in its framework's form, such as `it.skip`, `{ skip: true }`, `@pytest.mark.skip`, `@Disabled` or `t.Skip()`, or it is commented out or left out by the runner's config. A conditional skip is dead only when no environment the suite runs in, CI included, meets its condition. A ticket named in the marker or the comment beside it tracks the test's return, so the test stays.

**Redundant.** The test has the same entry point, the same class of input and the same observable outcome as another test. Different values from one input class count as the same. A test whose setup and entry point match another's, and whose assertions are a subset of the other's, is redundant too. Different input classes or boundaries, such as an empty list, one item and many items, are distinct cases. The same behaviour through a different interface is not redundant, so judge it as misplaced instead.

**Implementation-coupled.** The test asserts how the code works rather than what it does: call counts, order or arguments on the code's own methods and helpers, spies on internal functions, reads of internal fields, or snapshots of internal structure. A call across a boundary the behaviour is about, such as an email sent, a request made or a row written, is behaviour, and asserting on it is fine.

**Misplaced.** The test runs at an expensive level, such as a server, browser, database, subprocess, real network or a sleep, to check logic a cheaper test already checks with the same class of input and outcome. The expensive level's own behaviour, such as routing, serialization, status codes or a database constraint, belongs there, and one test per route or flow keeps that job.

Give each hard finding its fix:

- Tautological: rewrite the test so it fails under the named break, or delete it when another test covers the behaviour.
- Dead: delete the test, or name the ticket that tracks its return in its marker.

A documented repo standard that asks for a test overrides this rule.

## Why two axes

A change can pass one axis and fail the other:

- Code that follows every standard but implements the wrong thing → **Standards pass, Spec fail.**
- Code that does exactly what the issue asked but breaks the project's conventions → **Spec pass, Standards fail.**

Reporting them separately stops one axis from masking the other.

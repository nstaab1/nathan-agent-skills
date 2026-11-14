---
name: setup-agent-skills
description: "Configure this repo for the engineering skills: set up its issue tracker, triage label vocabulary, and domain doc layout. Run once before first use of the other engineering skills."
disable-model-invocation: true
---

# Setup Agent Skills

Scaffold the per-repo configuration that the engineering skills assume:

- **Issue tracker**: where issues live (GitHub by default; local markdown is also supported out of the box)
- **Triage labels**: the strings used for the five canonical triage roles
- **Domain docs**: where `GLOSSARY.md` and ADRs live, and the consumer rules for reading them
- **CI**: how the repo's CI runs, how to read its history, and the flaky-test settings the CI-health skills read

This is a prompt-driven skill, not a deterministic script. Explore, present what you found, confirm with the user, then write.

## Process

### 1. Explore

Look at the current repo to understand its starting state. Read whatever exists; don't assume:

- `git remote -v` and `.git/config`: is this a GitHub repo? Which one?
- `AGENTS.md` and `CLAUDE.md` at the repo root: does either exist? Is there already an `## Agent skills` section in either?
- `GLOSSARY.md` and `GLOSSARY-MAP.md` at the repo root
- `docs/adr/` and any `src/*/docs/adr/` directories
- `docs/agents/`: does this skill's prior output already exist?
- `.scratch/`: a sign that a local-markdown issue tracker convention is already in use
- Is the `triage` skill installed? (a `triage` skill folder alongside this one, or `triage` in your available skills.) This decides whether Section B runs at all.
- Is a CI-health skill installed? It is when an `auditing-tests`, `fixing-flaky-tests` or `reviewing-ci-run-times` folder sits in any of these places: beside this skill's folder, in one of the repo's own skill folders such as `.agents/skills/` or `.claude/skills/`, or among your available skills. One place is enough. This decides whether Section D runs at all.
- CI config: `.github/workflows/` for GitHub Actions, or another provider's config such as `.gitlab-ci.yml`, `.circleci/config.yml` or a `Jenkinsfile`. In it, find the job that runs the tests and the command it runs.
- Monorepo signals: a `pnpm-workspace.yaml`, a `workspaces` field in `package.json`, or a populated `packages/*` with its own `src/`. These are present only in a genuinely large multi-package repo; their absence means single-context, which is almost every repo.

### 2. Present findings and ask

Summarise what's present and what's missing. Then take the sections in order. One section, one answer, then the next.

Lead each section with the recommended answer so the user can accept it in a word. Give a one-line explainer only when the choice genuinely branches; skip the section entirely when exploration already settled it (Section B when `triage` isn't installed, Section C when there's no monorepo).

**Section A: Issue tracker.**

> Explainer: The "issue tracker" is where issues live for this repo. Skills like `to-tickets`, `triage`, and `to-spec` read from and write to it. They need to know whether to call `gh issue create`, write a markdown file under `.scratch/`, or follow some other workflow you describe. Pick the place you actually track work for this repo.

Default posture: these skills were designed for GitHub. If a `git remote` points at GitHub, propose that. If a `git remote` points at GitLab (`gitlab.com` or a self-hosted host), propose GitLab. Otherwise (or if the user prefers), offer:

- **GitHub**: issues live in the repo's GitHub Issues (uses the `gh` CLI)
- **GitLab**: issues live in the repo's GitLab Issues (uses the [`glab`](https://gitlab.com/gitlab-org/cli) CLI)
- **Local markdown**: issues live as files under `.scratch/<feature>/` in this repo (good for solo projects or repos without a remote)
- **Other** (Jira, Linear, etc.): ask the user to describe the workflow in one paragraph; the skill will record it as freeform prose

Record the choice in `docs/agents/issue-tracker.md`. The GitHub and GitLab templates carry a "PRs as a request surface" flag, defaulted **off**. Leave it off and don't raise it: a user who wants external PRs in the triage queue can flip the flag in the file later.

**Section B: Triage label vocabulary.** Skip this section entirely if the `triage` skill isn't installed (exploration told you), since an uninstalled skill needs no labels.

If it is installed, ask exactly one question:

> Do you want to keep the default triage labels? (recommended: **yes**)

The defaults are the five canonical roles, each label string equal to its name: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. On **yes**, write them as-is. Only if the user says no, usually because their tracker already uses other names (e.g. `bug:triage` for `needs-triage`), collect the overrides so `triage` applies existing labels instead of creating duplicates.

**Section C: Domain docs.** Default to **single-context** (one `GLOSSARY.md` + `docs/adr/` at the repo root). This fits almost every repo; write it without asking.

Offer **multi-context** (a root `GLOSSARY-MAP.md` pointing to per-context `GLOSSARY.md` files) only when exploration found monorepo signals. Then confirm which layout they want.

**Section D: CI.** Skip this section entirely when exploration found no CI-health skill installed.

Record how the repo's CI works in `docs/agents/ci.md`, and leave the CI config as it is. `fixing-flaky-tests` wires the verdict script into CI later, by PR, so a repo that only runs `auditing-tests` keeps its pipeline unchanged.

Start from the template for the provider exploration found: `ci-github-actions.md` for `.github/workflows/`, and `ci-generic.md` for any other provider. A repo with no CI also takes `ci-generic.md`, with `None.` under CI provider and Run history. When `docs/agents/ci.md` already exists, start from it instead and keep every field it already fills in. Fill it in:

- **Test command**: the command the test job runs, the job, the step that runs it, and the JUnit XML file it writes. A test command that writes no JUnit XML yet has `None.` as its Results file.
- **Rerun-failures command**: the command that reruns only the tests that failed and writes the same results file. For pytest it is the test command plus `--lf`, and for Vitest plus `--lastFailed`. Node's test runner has `--test-rerun-failures=<state-file>`, which reruns only the failures when the test command passed the same flag and file, and the file didn't exist before the test command ran. Node reports a test that a leftover file lists as passed without running it. For Node, write the command with a note saying so. Whatever the framework, mark the command _untried_ until you have run it at the framework version CI uses. `None.` when the framework has no such flag.
- **Run history**: fill in the repo's owner and name, in each `-R` flag and API path, and the default branch. Keep per-call placeholders such as `<run-id>`. A command whose input the repo lacks gets `None.` and the reason, such as Results file of a run when the test job uploads no results file. Run each other command once in this repo, read-only. Take the _untried_ mark off each one you saw work, and leave it on any you couldn't run, such as Failed log when no run has failed yet.
- **Labels** and **Quarantine cap**: the defaults, `flaky-test`, `quarantined` and 5% of the suite.
- Anything else the repo doesn't have yet, such as a verdict script not yet wired: `None.`

Name the provider and test command you found, then ask exactly one question:

> Do you want to keep the default flaky-test labels and quarantine cap? (recommended: **yes**)

On **no**, collect the overrides, usually label names the tracker already uses. The section is done when every field in the draft holds a value or `None.`, and every command in it has been run or carries the _untried_ mark.

### 3. Confirm and edit

Show the user a draft of:

- The `## Agent skills` block to add to whichever of `CLAUDE.md` / `AGENTS.md` is being edited (see step 4 for selection rules)
- The contents of `docs/agents/issue-tracker.md`, `docs/agents/domain.md`, and `docs/agents/triage-labels.md` (the last only when `triage` is installed)
- The contents of `docs/agents/ci.md`, when Section D ran

Let them edit before writing.

### 4. Write

**Pick the file to edit:**

- If `CLAUDE.md` exists, edit it.
- Else if `AGENTS.md` exists, edit it.
- If neither exists, ask the user which one to create; don't pick for them.

Never create `AGENTS.md` when `CLAUDE.md` already exists (or vice versa); always edit the one that's already there.

When both exist, edit the one that already holds an `## Agent skills` block, even when that is `AGENTS.md`. When neither holds one and `CLAUDE.md` only imports `AGENTS.md` with an `@AGENTS.md` line, edit `AGENTS.md`.

If an `## Agent skills` block already exists in the chosen file, update its contents in-place rather than appending a duplicate. Don't overwrite user edits to the surrounding sections.

The block:

```markdown
## Agent skills

### Issue tracker

[one-line summary of where issues are tracked]. See `docs/agents/issue-tracker.md`.

### Triage labels

[one-line summary of the label vocabulary]. See `docs/agents/triage-labels.md`.

### Domain docs

[one-line summary of layout: "single-context" or "multi-context"]. See `docs/agents/domain.md`.

### CI

[one-line summary: the CI provider, and whether the verdict script is wired]. See `docs/agents/ci.md`.
```

Include the `### Triage labels` sub-block, and write `docs/agents/triage-labels.md`, only when `triage` is installed and Section B ran. When it isn't, both are omitted.

Include the `### CI` sub-block, and write `docs/agents/ci.md`, only when Section D ran.

Then write the docs files using the seed templates in this skill folder as a starting point:

- [issue-tracker-github.md](./issue-tracker-github.md): GitHub issue tracker
- [issue-tracker-gitlab.md](./issue-tracker-gitlab.md): GitLab issue tracker
- [issue-tracker-local.md](./issue-tracker-local.md): local-markdown issue tracker
- [triage-labels.md](./triage-labels.md): label mapping (only if `triage` is installed)
- [domain.md](./domain.md): domain doc consumer rules + layout
- [ci-github-actions.md](./ci-github-actions.md): CI doc for GitHub Actions, when Section D ran
- [ci-generic.md](./ci-generic.md): CI doc for any other provider or no CI, when Section D ran

For "other" issue trackers, write `docs/agents/issue-tracker.md` from scratch using the user's description.

### 5. Done

Tell the user the setup is complete and which engineering skills will now read from these files. Mention they can edit `docs/agents/*.md` directly later; re-running this skill is only necessary if they want to switch issue trackers or restart from scratch.

When `docs/agents/ci.md` was written, name each field left at `None.` and what fills it later. `fixing-flaky-tests` wires the verdict script, and the developer lists each scheduled agent once its routine exists.

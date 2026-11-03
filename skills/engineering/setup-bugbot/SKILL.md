---
name: setup-bugbot
description: "Set up Cursor Bugbot PR reviews in this repo: the shared review base, a repo-specific section confirmed with you, and bugbot.yaml settings, opened as a PR."
disable-model-invocation: true
---

# Setup Bugbot

Writes this repo's Bugbot configuration:

- `.cursor/BUGBOT.md`: the shared **base** (severity, failure examples, finding format, summary shape) inside a marked block, followed by a **This repo** section holding what only this repo knows.
- Nested `<dir>/.cursor/BUGBOT.md` files for folders with invariants of their own. Bugbot reads one only when a PR touches files under its folder.
- `.cursor/config/bugbot.yaml`: when and how hard Bugbot reviews.

The base lives once, in [bugbot-base.md](bugbot-base.md). Re-running this skill refreshes the marked block from it and leaves the **This repo** section alone, so updating every repo is: edit the template, re-run here, open the PR.

Explore, draft, confirm with the user, then write.

## 1. Prepare

Require a clean worktree. Branch `setup-bugbot` from the default branch.

## 2. Explore and draft

Read the repo before asking anything. Sources:

- `.cursor/BUGBOT.md`, any nested `.cursor/BUGBOT.md`, `.cursor/config/bugbot.yaml`: prior setup, with or without the markers
- `AGENTS.md`, `CLAUDE.md`, `GLOSSARY.md`, ADRs, `docs/agents/`
- Schema, migrations, and the modules that own money, auth, permissions, or persisted state
- The test runner and its single-file invocation (`package.json` scripts, `pyproject.toml`, `Makefile`), and the CI workflows
- `gh pr list --state merged --limit 20` and the review comments on those PRs: bugs that recur are invariants waiting to be written down

Draft the **This repo** section, one entry per item:

- **Invariants**: rules a diff can break silently ("money is integer cents", "`events` is append-only"), each naming the file or doc it came from.
- **Hot paths**: folders where a should-fix counts as a blocker (auth, billing, migrations).
- **Ignore**: generated, vendored, and fixture paths.
- **Verify command**: how to run one test file, with a placeholder for the path.
- **Spec source**: where linked issues live (GitHub issues in `owner/repo`, a Linear team).

Mark an invariant that only concerns one folder for a nested file at that folder; the root section keeps the repo-wide ones.

Exploration is done when every item has a draft or reads "none found" with the places you looked.

## 3. Confirm

Ask one round, in the grilling format: numbered questions, each with your recommendation.

1. The drafted **This repo** section, item by item, with its evidence. The user confirms, edits, or adds.
2. Each nested file you propose: folder and contents.
3. An existing `BUGBOT.md` without markers: show it, and propose which of its rules move into **This repo**; the rest is dropped as covered by the base.
4. Each `bugbot.yaml` setting, recommended value first, with the common alternatives:

   | Setting | Recommended | Alternatives |
   | --- | --- | --- |
   | `triggers.frequency` | `everyPush` | `oncePerPr`: cheaper, misses bugs added in later commits |
   | `triggers.drafts` | `false` | `true`: reviews drafts too, more usage |
   | `review.effort` | `default` | `low`: cheaper, shallower; `high`: deeper, costlier; `smart`: Bugbot picks per PR |
   | `review.incremental` | `true` | `false`: re-reviews the whole PR on every push |
   | `prSummary.mode` | `comment` | `description`: writes into the PR body; `disabled` |
   | `prSummary.riskScore` | `true` | `false` |
   | `autofix.mode` | `disabled` | `newBranch`: fixes on a side branch; `existingBranch`: pushes fixes onto the PR branch |

Wait for the answers before writing.

## 4. Write

Root `.cursor/BUGBOT.md`:

```markdown
# Bugbot review rules

<!-- bugbot-base:begin -->
<contents of bugbot-base.md, verbatim>
<!-- bugbot-base:end -->

## This repo

### Invariants
### Hot paths
### Ignore
### Verify command
### Spec source
```

When the markers already exist, replace only what sits between them. Write each confirmed nested file as `<dir>/.cursor/BUGBOT.md`, holding just that folder's invariants under `## This folder`.

`.cursor/config/bugbot.yaml`, with the confirmed values:

```yaml
version: 1
triggers:
  drafts: false
  frequency: everyPush
review:
  effort: default
  incremental: true
prSummary:
  mode: comment
  riskScore: true
autofix:
  mode: disabled
```

Bugbot reads `bugbot.yaml` from the base branch, so the settings take effect once this PR merges.

## 5. Open the PR

Commit, then run `/open-pr`.

Finish by giving the user the steps only they can take:

1. At cursor.com/automations/from-cursor/bugbot, confirm this repo is on. On GitHub, Bugbot covers the repos the Cursor GitHub app can access; grant the app this repo if it is missing.
2. Optional gate: if fail-on-unresolved is available on their plan, turning it on and requiring the `Cursor Bugbot` check blocks merges. It fails on any unresolved finding, nits included, so resolving a nit becomes part of merging.

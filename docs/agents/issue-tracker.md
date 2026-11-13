# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues on `nstaab1/nathan-agent-skills`. Use the `gh` CLI for all operations.

## Pin the repo on every call

This clone has two GitHub remotes: `origin` (`nstaab1/nathan-agent-skills`, the tracker) and `upstream` (`mattpocock/skills`, read-only vendor source). With no `gh` default repo set, `gh` resolves to `upstream` and silently reads or writes Matt's issues. Pass `-R nstaab1/nathan-agent-skills` on every `gh issue`, `gh pr` and `gh label` call, and use `repos/nstaab1/nathan-agent-skills` in every `gh api` path.

## Conventions

- **Create an issue**: `gh issue create -R nstaab1/nathan-agent-skills --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> -R nstaab1/nathan-agent-skills --json number,title,body,author,createdAt,updatedAt,labels,comments --jq '{number,title,author:.author.login,createdAt,updatedAt,body,labels:[.labels[].name],comments:[.comments[]|{author:.author.login,createdAt,body}]}'`. `--jq` needs `--json`, so `--comments --jq` fails.
- **List issues**: `gh issue list -R nstaab1/nathan-agent-skills --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> -R nstaab1/nathan-agent-skills --body "..."`
- **Apply / remove labels**: `gh issue edit <number> -R nstaab1/nathan-agent-skills --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> -R nstaab1/nathan-agent-skills --comment "..."`

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents (still with `-R nstaab1/nathan-agent-skills`):

- **Read a PR**: `gh pr view <number> -R nstaab1/nathan-agent-skills --comments` and `gh pr diff <number> -R nstaab1/nathan-agent-skills` for the diff.
- **List external PRs for triage**: `gh pr list -R nstaab1/nathan-agent-skills --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment -R nstaab1/nathan-agent-skills`, `gh pr edit -R nstaab1/nathan-agent-skills --add-label`/`--remove-label`, `gh pr close -R nstaab1/nathan-agent-skills`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42 -R nstaab1/nathan-agent-skills` and fall back to `gh issue view 42 -R nstaab1/nathan-agent-skills`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue on `nstaab1/nathan-agent-skills`.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> -R nstaab1/nathan-agent-skills --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create -R nstaab1/nathan-agent-skills --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies**, the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/nstaab1/nathan-agent-skills/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/nstaab1/nathan-agent-skills/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only, the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list -R nstaab1/nathan-agent-skills --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> -R nstaab1/nathan-agent-skills --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment <n> -R nstaab1/nathan-agent-skills --body "<answer>"`, then `gh issue close <n> -R nstaab1/nathan-agent-skills`, then append a context pointer (gist + link) to the map's Decisions-so-far.

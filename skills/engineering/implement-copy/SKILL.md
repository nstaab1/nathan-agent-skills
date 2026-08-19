---
name: implement-copy
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

Before writing code, branch from the **base branch**: the branch this work merges into. `docs/agents/branching.md` names it and gives the branch-name convention. When that file is missing, run `git branch -r`, then ask the user which branch to base on and what to call the new one, proposing what you found: a repo with `origin/staging` usually integrates through `staging`, one with only `origin/main` through `main`. Write their answer to `docs/agents/branching.md` so later runs read it instead of asking.

```bash
git fetch origin
git switch <base> && git pull
git switch -c <branch-name>
```

Start writing code once `git status` shows a clean tree on the new branch and `git merge-base --is-ancestor origin/<base> HEAD` exits 0.

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, use /code-review to review the work.

Commit your work to the current branch.

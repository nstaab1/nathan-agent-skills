---
name: implement-copy
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

Before writing code, branch from the **base branch**: the branch this work merges into. `docs/agents/branching.md` names it and gives the branch-name pattern, such as `<type>/<slug>` or `feature/<ticket>-<slug>`. Fill that pattern from the work in hand.

When that file is missing, run `git branch -r` to see both the integration candidates and the naming already in use, then ask the user to confirm the base branch and the pattern, proposing what you found: a repo with `origin/staging` usually integrates through `staging`, one with only `origin/main` through `main`. Write both to `docs/agents/branching.md` so later runs read it instead of asking.

```bash
git fetch origin
git switch <base> && git pull
git switch -c <the pattern, filled in>
```

Start writing code once `git status` shows a clean tree on the new branch and `git merge-base --is-ancestor origin/<base> HEAD` exits 0.

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, use /code-review to review the work. Alongside the review summary, give the user a numbered manual test script: the exact steps to run the changed code by hand, each ending in the observable result that proves the step worked. Cover every user-visible change in the work.

Commit your work to the current branch.

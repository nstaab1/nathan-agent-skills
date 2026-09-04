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

Once done, use /code-review to review the work, then commit to the current branch.

Close the run with one **self-contained** message: the review summary, and under it a manual test script the user follows with the app in one hand — read a step, do it, check it, move on. Everything the reader needs is in that message, written out. A script drafted earlier in the run — while the review was still running, say — is written out again here, in full.

- Open with a **Setup** line that gets the app to the starting screen.
- Number every step. A step is **one action** on its own line, followed by an indented `Expect:` line naming the observable result that proves it worked. A step with two verbs, or a `then`, is two steps.
- When one action changes several things, keep the single action and list each result as its own `Expect:` bullet.
- Name on-screen targets exactly as they appear, in bold; put text the user types in backticks.
- Put a heading over each user-visible change in the work, so the reader can see which behaviour a run of steps proves.

Shape:

```
### Routing a Timebox by Tag

Setup: run `npm start`, open the dev client, open the **Session** tab.

1. Tap **Add Cycle**.
   Expect: the **New Cycle** sheet opens.
2. Type `Routed` in the name field.
   Expect: **Save Cycle** is enabled.
3. Tap **Skip Timebox**.
   Expect: a confirmation dialog appears.
4. Tap **Confirm**.
   Expect:
   - the Timebox reads **Ready** with no funnel icon
   - the lane shows every open entry, including untagged ones
```

Done when the closing message carries the review summary and the whole script, every user-visible change has a heading, and every step under it has one verb and its own `Expect:` line.

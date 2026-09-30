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

Run typechecking and single test files regularly.

`code-review` reads committed work, so commit before reviewing:

1. Commit the work to the current branch.
2. Run /code-review with `origin/<base>` as the fixed point.
3. Split its findings. A **mechanical** finding names a defect or a standards breach with one clear fix: apply it. A **judgment** finding is a trade-off or a style call: leave the code as-is and give a one-line reason.
4. Run the full test suite once.
5. Amend the commit so it carries the fixes and, as the last section of its body, the **code review record**. The branch is unpushed, so the amend rewrites nothing shared.

The record is the single source for the review: the closing message repeats it, and `open-pr` copies it into the PR. Its shape is its length cap: one line per finding, cited by `file:line`, wrapped at 72 columns. The heading is a plain `Code review` line, since commit cleanup can strip lines that start with `#`.

```
Code review

Standards:
- src/timebox/lane.ts:42 — possible Feature Envy in routeEntry — left:
  it reads the tag once; moving it would split the reducer
- src/timebox/lane.ts:80 — Mysterious Name `fn2` — fixed
Spec:
- no findings

Standards: 2 findings, 1 left.
Spec: 0 findings.
```

Each finding line reads `file:line — finding — fixed` or `file:line — finding — left: <reason>`; each axis ends with its totals line. When the review skipped the Spec axis, its list and its totals line both read `no spec available`.

Close the run with one **self-contained** message in four parts, in this order: the code review record as committed, the manual test script, **Next actions**, and **Least confident**. Everything the reader needs is in that message, written out. A script drafted earlier in the run — while the review was still running, say — is written out again here, in full.

The manual test script is followed with the app in one hand: read a line, do it, check it, move on. Every line the reader acts on carries **one action**, so no line has to be split into parts before it can be followed.

- Open with a **Setup** list: the actions that reach the starting screen, one per bullet.
- Number every step. A step is one action on its own line, followed by an indented `Expect:` line naming the observable result that proves it worked. A line with two verbs, a `then`, or an `and` joining actions is two lines; this applies to Setup bullets as much as to steps.
- When one action changes several things, keep the single action and list each result as its own `Expect:` bullet.
- Name on-screen targets exactly as they appear, in bold; put text the user types in backticks.
- Put a heading over each user-visible change in the work, so the reader can see which behaviour a run of steps proves.

Shape:

```
### Routing a Timebox by Tag

Setup:
- Run `npm start`.
- Open the dev client.
- Open the **Session** tab.

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

**Next actions** lists what the user must do by hand, now, for the change to work: a secret to set, an env var to add, a migration to run, a dependency to install, a service to restart, a PR to open or merge. One action per numbered line, naming where it happens and the exact value or command. When the change needs nothing from the user, the section reads `Next actions: none`, so the reader knows the list was checked rather than skipped.

**Least confident** names the parts of the work you trust least: an edge case no test covers, a behaviour inferred from code the spec is silent on, a change proven only by the typechecker. One item per numbered line, stating what it is, why the confidence is low, and how the user can check it. Order by how much it would matter if wrong, most first. Every piece of work has a weakest point, so this section always has at least one item.

Shape:

```
## Next actions

1. Add `TIMEBOX_ROUTING_ENABLED=true` to `.env.local`.
2. Run `npm run db:migrate` against the dev database.

## Least confident

1. Untagged entries landing in the lane: inferred from the reducer, the spec is silent; run step 4 with an entry that has no tag.
```

Done when the commit body ends with the code review record and every finding in it is marked `fixed` or `left`, the closing message carries all four parts, every user-visible change has a heading, every acted-on line (Setup bullets included) has one verb, every step has its own `Expect:` line, and **Least confident** names at least one item.

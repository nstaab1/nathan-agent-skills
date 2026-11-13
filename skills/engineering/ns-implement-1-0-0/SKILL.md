---
name: ns-implement-1-0-0
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

<!-- Derived from implement-copy, which is itself modified from mattpocock/skills (MIT). See THIRD_PARTY_NOTICES.md. -->

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

Close the run with one **self-contained** message in six parts, ordered by urgency so the reader meets what needs their eyes before what can wait: **Look at this first**, **Before this PR merges**, **To run it now**, the manual test, **Least confident**, and the code review record as committed. Everything the reader needs is in that message, written out. A script drafted earlier in the run — while the review was still running, say — is written out again here, in full.

**Look at this first** names every **high-risk** change: one whose failure costs more than a follow-up commit. That means data loss or an irreversible change to data, a migration, auth or permissions, money, a public API or stored format other code depends on, or a destructive user action with no undo. High risk measures the damage if the change is wrong, whatever your confidence in it: a migration you are sure of still belongs here.

- Open with one bold line counting the high-risk changes and the before-merge actions.
- Give each change a `### 🔴` heading that states it as a plain fact, then three bullets: **Where** (`file:line`), **If it's wrong** (the damage, in the user's terms), and **Look at** (the lines to read, or the before-merge item or test step that proves it).
- When no change qualifies, the section is the one line `High risk: none`, so the reader knows the list was checked rather than skipped.

**Before this PR merges** lists what only the user can do between now and the merge: a secret or env var to set in a shared environment, a migration to run against real data, a question the spec left open, a sign-off to get. One action per numbered checkbox, naming where it happens and the exact value or command. Every high-risk change points at an item here or at a test step, so each one has a way to be settled. When nothing is needed, the section reads `Before merge: none`.

**To run it now** lists what the user must do by hand before the manual test will work on their machine: an env var to add locally, a migration to run, a dependency to install, a service to restart. One action per numbered line, with the exact value or command. When nothing is needed, it reads `To run it now: nothing`.

The manual test is followed with the app in one hand: read a line, do it, check it, move on. Every line the reader acts on carries **one action**, so no line has to be split into parts before it can be followed.

- Open with one line counting the flows and steps.
- Give each user-visible change its own flow under a `### Flow N: <the change>` heading, so the reader can see which behaviour a run of steps proves.
- Start each flow with a **Setup** list: the actions that reach its starting screen, one per bullet.
- Number the steps from 1 in each flow. A step is one line: the action, then `→`, then the observable result that proves it worked. A line with two verbs, a `then`, or an `and` joining actions is two lines; this applies to Setup bullets as much as to steps.
- When one action changes several things, end the line at the `→` and list each result as its own indented bullet.
- Name on-screen targets exactly as they appear, in bold; put text the user types in backticks.
- End the step that exercises a high-risk change with `🔴` and that change's number, so the script points back at what matters.

**Least confident** names the parts of the work you trust least: an edge case no test covers, a behaviour inferred from code the spec is silent on, a change proven only by the typechecker. Each numbered item opens with a level and a bolded plain statement, `🟡 **Medium · <what>**` or `🟢 **Low · <what>**`, then three bullets: **Why unsure**, **Check** (the flow and step, or the command, that settles it), and **Where** (`file:line`). 🟡 Medium is behaviour a user would notice as wrong; 🟢 Low is cosmetic or caught on first use. A doubt that would cost more than that is a high-risk change and goes in **Look at this first**, with the doubt stated in its **Look at** bullet. Order by how much it would matter if wrong, most first. Every piece of work has a weakest point beyond its high-risk changes, so this section always has at least one item.

Shape:

````
# 🛑 Look at this first

**2 high-risk changes. 3 things to do by hand before this merges.**

### 🔴 The migration rewrites every row in `entries`

- **Where:** `db/migrations/0042_backfill_entry_tags.ts:18`
- **If it's wrong:** every entry gets the wrong tag, and `down` cannot restore the original empty values.
- **Look at:** the `UPDATE` on line 18, and run it against a copy of real data (Before merge, item 2).

### 🔴 Skip Timebox deletes its pending entries, with no undo

- **Where:** `src/timebox/skip.ts:31`
- **If it's wrong:** users lose entries they expected to keep.
- **Look at:** the spec says "skip" and nothing about the entries. Deleting was my reading; confirm it (Before merge, item 3).

## ✋ Before this PR merges

- [ ] 1. Add `TIMEBOX_ROUTING_ENABLED=true` to the staging environment (Vercel → Settings → Environment Variables).
- [ ] 2. Run `npm run db:migrate` against a copy of the staging database. Check the `entries` row count is unchanged.
- [ ] 3. Ask the spec owner whether skipping a Timebox should delete its pending entries.

## To run it now

1. Add `TIMEBOX_ROUTING_ENABLED=true` to `.env.local`.
2. Run `npm run db:migrate`.

---

# Manual test

2 flows, 8 steps. Each line is one action → what you should see.

### Flow 1: Routing a Timebox by Tag

Setup:
- Run `npm start`.
- Open the dev client.
- Open the **Session** tab.

1. Tap **Add Cycle** → the **New Cycle** sheet opens.
2. Type `Routed` in the name field → **Save Cycle** is enabled.
3. Tap **Save Cycle** → the sheet closes.
4. Tap the **deep-work** tag →
   - the Timebox shows a funnel icon
   - the lane shows only **deep-work** entries

### Flow 2: Skipping a Timebox

Setup:
- Stay on the **Session** tab.

1. Tap **Skip Timebox** → a confirmation dialog appears.
2. Tap **Confirm** →
   - the Timebox reads **Ready** with no funnel icon
   - the lane shows every open entry, including untagged ones
3. Open the **History** tab → the skipped Timebox is listed as **Skipped**.
4. Tap the skipped Timebox → its pending entries are gone. 🔴 *High-risk change 2.*

---

# Least confident

Ranked by how much it matters if wrong.

1. 🟡 **Medium · Untagged entries land in the lane**
   - **Why unsure:** inferred from the reducer; the spec is silent.
   - **Check:** Flow 2, step 2, with an entry that has no tag.
   - **Where:** `src/timebox/lane.ts:42`

2. 🟢 **Low · Funnel icon is hidden in the Ready state**
   - **Why unsure:** only the typechecker proves it; no test renders the card.
   - **Check:** Flow 2, step 2.
   - **Where:** `src/timebox/TimeboxCard.tsx:57`

---

# Code review

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
````

Done when the commit body ends with the code review record and every finding in it is marked `fixed` or `left`; the closing message carries all six parts in order; **Look at this first** lists every high-risk change or reads `High risk: none`, and each change it lists points at a before-merge item or a test step; every user-visible change has its own flow; every acted-on line (Setup bullets included) has one verb; every step has its `→` result; and **Least confident** names at least one item, each with a level.

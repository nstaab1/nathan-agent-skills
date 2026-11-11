---
name: resolving-pr-comments
description: "Work an open PR's review comments, failing checks and base conflicts one round at a time, rechecking for drift from what the PR is for after each round. Use when the user wants PR comments or reviews resolved, or a PR taken to ready."
---

You are the **orchestrator** for one **round** on an open PR. Subagents write the code. You triage, hold the gate, recheck and report. Reviewers, automated or human, mix real bugs with nitpicks, and a PR that takes every suggestion drifts away from what it was for. Your job is to land the real ones and keep the PR on course.

Four words carry this skill:

- **Anchor**: what the PR is for, quoted as numbered lines you cite by number.
- **Drift**: any change in the PR's diff that no anchor line and no approved Fix asks for.
- **Verdict**: Fix, Decline, Defer or Ask. See step 3.
- **Miss**: the earliest stage that should have caught a valid comment before review.

Every PR operation below follows the consumer repo's `docs/agents/pull-requests.md`: finding the PR, reading comments, replying, resolving threads, checks, a fresh automated review, and the checkout. Tickets follow `docs/agents/issue-tracker.md`. When `pull-requests.md` is missing, stop and offer to write it with the developer using [PULL-REQUESTS-DOC.md](PULL-REQUESTS-DOC.md). Resume once it exists. When the doc exists but the repo's existing instruction file, `AGENTS.md` or `CLAUDE.md`, doesn't link it, add the "Pull requests" entry as [PULL-REQUESTS-DOC.md](PULL-REQUESTS-DOC.md) says.

## 1. Pin the anchor

Find the PR from the user's reference or the current branch. Take the anchor from, in order:

1. The ticket the PR closes, plus its parent spec when it has one.
2. The PR body.
3. The developer, when neither says what the PR is for.

Done when the anchor is a numbered list every later verdict can cite.

## 2. Collect the round

Fetch every inline comment, review body, conversation comment and check, and whether the branch conflicts with its base. Read review bodies in full: an automated reviewer's summary can list issues that have no inline comment.

Fetch every page. A list that stops at its first page hides the newest comments and replies, and the settled rule below reads the newest. Read each list command in the PR doc for `--paginate` or a `hasNextPage` loop. When the PR doc's command doesn't page through all results, fix the doc first.

One claim often arrives from several sources: an inline comment, a review body and a summary, from one reviewer or two. Merge them into one item that lists every source, so the claim gets one verdict and one reply per thread.

Earlier rounds are on the PR itself. Each reply posted in step 6 starts with its verdict, so the replies are the record of what was fixed, declined and deferred. An item is settled only while the last reply in its thread is one of yours that starts with a verdict, as listed in step 6. An item with no thread, such as a conversation comment or an issue listed only in a review body, gets its verdict as a PR comment that starts with the verdict and links the source item. It is settled while that verdict comment is the newest comment linking it. A merged item is settled only while every one of its sources is settled. Every other item is **new**, including one where someone replied after your verdict reply, which reopens it. Ask items never got a reply, so they come back as new until the developer decides.

Rerun each failing check as the PR doc says, to tell a flake from a real failure.

Done when every list command was run to its last page, every new item is listed and every failing check is classed flaky or real.

## 3. Triage

Build one table, one row per new item. An item is a claim, so sources that make the same claim share a row:

| # | Item | Verdict | Anchor | Miss | Prevention |
| --- | --- | --- | --- | --- | --- |

- **Item**: a link, the author, and the claim in one line.
- **Verdict**, one of:
  - **Fix**: the claim holds and the anchor needs it.
  - **Decline**: the claim is wrong, or the change it asks for is one the anchor doesn't need, such as a rename or a restyle in passing.
  - **Defer**: the claim holds but sits outside the anchor. It becomes a follow-up ticket.
  - **Ask**: it needs a product or design call only the developer can make.
- **Anchor**: the anchor line the verdict rests on, or "none".
- **Miss**: for Fix and Defer, name the one stage that should have caught it first, and quote the evidence:
  - **spec**: the ticket was silent or wrong. Quote the line.
  - **implementation**: the code was wrong though the spec was clear.
  - **tests**: no test covers the case. Name the test file that should have.
  - **review**: the review before the PR went up saw this code and passed it.
  For a Decline, write why the claim is wrong or why the anchor doesn't need it. A flaky check's miss is **tests**.
- **Prevention**: the one change that would have caught it earlier, and where it lands: a skill in the skills repo, or the consumer repo's lint rules, hooks, tests, `docs/agents` or `AGENTS.md`.

Judge each claim against the code, not the commenter. Open the lines it points at and test the claim yourself. Automated reviewers find real bugs among the nitpicks, and people get things wrong too.

A conflict with the base branch is a row of its own: verdict Fix, with no miss or prevention.

Show the table and end your turn. The developer's approval covers this round's fixes, pushes, replies, thread resolutions and follow-up tickets. Anything beyond that needs a new go-ahead.

Done when every new item has a row with every column filled, and the developer has approved or amended the verdicts.

## 4. Fix

Send each approved Fix to a subagent with [FIX-BRIEF.md](FIX-BRIEF.md). Group Fixes that touch the same code into one subagent. Run subagents one at a time in the PR's checkout, the base conflict first, since later fixes build on the merged code.

After each subagent, read its commit yourself. It resolves the item, changes nothing else, and its tests ran. A subagent's "all clean" is a claim. Its diff and your own test run are the evidence. Send it back with notes when the commit misses.

Done when every approved Fix has a commit you have read.

## 5. Recheck

Recheck the whole PR diff against its base, not only this round's commits:

- **Drift**: walk the diff hunk by hunk. Each hunk traces to an anchor line or an approved Fix. List every hunk that doesn't, from this round or an earlier one. Drift builds up over rounds of fixes that each looked reasonable.
- **Correctness**: typecheck and run the tests that cover the changed files, with the repo's own commands. Read each fixed line against the comment it answers.

When this round's commits change more than about 200 lines, also run the `code-review` skill.

Drift or a failure in a commit made for a Fix approved this round goes back to that Fix's subagent as rework. Anything else the recheck finds, such as drift from an earlier round, becomes new rows in the triage table. Show them and wait for the developer's approval before any subagent touches them.

Done when every hunk traces and every failing check either passes or carries an approved Defer or Ask verdict.

## 6. Publish

Push. Reply to each triaged item, starting with its verdict:

- `Fixed in <sha>.` then what changed and the test that covers it.
- `Declined:` then why.
- `Deferred to <ticket link>:` then why it sits outside this PR. Create the ticket first.
- Ask items get no reply yet.

Reply to an item with no thread with a PR comment that starts with its verdict and links the source item. A merged item gets its verdict reply on every source thread, and a linking PR comment for every source with no thread.

Resolve the threads automated reviewers opened once their fix has landed. Leave threads people opened for those people. Ask for a fresh automated review when the PR doc says how.

Then fetch the PR once more. Automated reviewers sometimes post more comments after their first review.

Done when every triaged item except Ask has a reply on every source.

## 7. Report

Report in four sections, in this order, then end.

### Round

Counts per verdict, the commits pushed, and the Ask items with their questions.

### Recheck

The drift result, either the hunks that don't trace or "every hunk traces to the anchor", and each check you ran with its result.

### Improvements

The round's Prevention entries, grouped by where they land: the skills repo, then this repo. Merge entries that share one cause. Each entry gives the change, the items it would have caught, and a ready-to-paste prompt the developer can start a new chat with. Skill changes go to the skills repo's source, since installed copies are build output. You apply none of these.

### Ready check

Each condition, met or not:

- Every item has a verdict carried out and a reply.
- Checks are green.
- The latest automated review of the current head raised nothing new, or the PR doc says the repo has no automated reviewer.
- The branch doesn't conflict with its base.

When all hold, the PR is **ready** for a person to approve and merge. When the last fetch in step 6 found new items, or a fresh review is still pending, tell the developer to run this skill again once it lands.

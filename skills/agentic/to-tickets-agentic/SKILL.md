---
name: to-tickets-agentic
description: Break a plan, spec, or conversation into tracer-bullet tickets assigned to autonomous or attended lanes, with pre-agreed test seams, blocking edges, and overlap-safe execution frontiers. Use when preparing work for unattended coding agents as well as human-guided implementation.
disable-model-invocation: true
---

# To Tickets Agentic

Break a plan, spec, or conversation into tracer-bullet vertical slices. Every ticket declares its blockers, implementation lane, and test seams.

The issue tracker and triage-label vocabulary should be configured. Run `/setup-agent-skills` if they are missing.

## 1. Gather context

Use the current conversation. When the user supplies a spec, issue, or URL, read its full body and comments. Read relevant domain docs and ADRs.

## 2. Explore when needed

Explore enough code to understand existing seams, likely overlap, and prefactoring opportunities. Prefer making the change easy before making the easy change.

## 3. Draft vertical slices

Each ticket must:

- cut a narrow but complete path through every affected layer;
- be independently demoable or verifiable;
- fit in one fresh agent context;
- name its blocking edges; and
- separate prerequisite prefactoring into earlier tickets.

Use expand-contract tickets for wide mechanical refactors that cannot land green as vertical slices: expand with the new form, migrate callers in blast-radius-sized batches, then contract after every migration completes.

## 4. Assign lanes with the user

Present a numbered draft. For each ticket show its title, blockers, delivered behavior, proposed lane, and seams under test. Confirm:

- granularity and blocking edges;
- merges or further splits;
- **AFK** versus **attended** lane; and
- file or module overlap among tickets sharing an execution frontier.

The lane test is the seam:

- **AFK.** The public seams already exist or are settled now, so they can be named in the ticket.
- **Attended.** The seam or interface design remains a question requiring human judgment.

Tickets on the same frontier must touch disjoint areas. Add a blocking edge between overlapping tickets even when neither logically gates the other; parallel autonomous runs on shared files create avoidable merge conflicts.

Iterate until the user approves every ticket and lane.

## 5. Publish

Prefix every title with `[Ticket]` exactly once.

- **Local tracker.** Write one file per ticket under `.scratch/<feature>/issues/<NN>-<slug>.md` in dependency order.
- **Real tracker.** Create tickets in dependency order, attach them as native children of the parent when available, then wire native blocking edges in a second pass. Confirm the parent lists every child.

Apply the configured `ready-for-agent` label to AFK tickets and `ready-for-human` to attended tickets. Leave the parent spec unchanged and open.

Sub-issue and blocked-by relationships are distinct: the first groups work under its parent; the second controls execution order.

## Ticket template

```markdown
# [Ticket] <title>

## Parent

<parent reference, when one exists>

## What to build

<the end-to-end behavior this ticket delivers>

## Acceptance criteria

- [ ] <observable criterion>

## Seams under test

- <public interface and behavior, or "Attended. Seams to be agreed at the keyboard">

## Blocked by

- <blocking ticket, or "None. Can start immediately">
```

Name interfaces and behaviors, not file paths. A prototype snippet may be included only when it records a settled decision more precisely than prose.

Publishing is done when every approved ticket exists, carries the correct lane label and seams, is attached to its parent when applicable, and has every blocking edge represented.

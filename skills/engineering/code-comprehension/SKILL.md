---
name: code-comprehension
description: "Walk the user through a change section by section, quiz their understanding, and close on its tradeoffs."
disable-model-invocation: true
argument-hint: "fixed point (commit, branch, tag); defaults to the base branch"
---

# Code comprehension

The user wants a pulse on a change without reading its diff: the **code why** (why this line, this shape), the **systems why** (why this module, this boundary, this data flow), and the **architectural why** (why this decision over the alternatives, and what it commits the codebase to). Those three **lenses** structure every explanation and every question below.

The session runs in **rounds**, like a grilling turned around: you explain, show the decisive code, and ask; the user answers; you grade and move on. Nothing is written to disk.

## 1. Pin the fixed point

Resolve the ref the diff is measured from, in this order: the argument → the base branch in `docs/agents/branching.md` → `main` or `master`, whichever exists → ask the user.

Capture `git diff <fixed-point>...HEAD` and `git log <fixed-point>..HEAD --oneline`. If the committed diff is empty and the working tree is dirty, use `git diff <fixed-point>` plus untracked files instead and tell the user the session covers uncommitted work. If both are empty, stop and say so in one line.

Done when the ref resolves and there is a non-empty change to walk.

## 2. Gather the why

Every explanation carries a provenance label. Two kinds:

- **From the session**: this conversation contains the work, so rejected alternatives and intent are known.
- **Inferred from \<evidence\>**: reconstructed from, in order, commit messages → the issue (via `docs/agents/issue-tracker.md` when present) → spec files under `docs/`, `specs/`, `.scratch/` → `CONTEXT.md` and `docs/adr/`. Every source is optional; a missing source only makes more whys inferred.

Read what exists before carving sections. Done when each candidate section has a why and its label.

## 3. Carve sections

A **section** is one unit of change with a single why. Carve by concept: commits and the issue hint at boundaries, files and hunks are the material, neither is the boundary. Order sections most architecturally significant first.

Soft cap of five. Fold the rest into the nearest section and keep a list of what was folded, so the map can name it.

If a section needs more than three questions, it is two sections.

Done when every hunk in the diff belongs to exactly one section.

## 4. Run the rounds

### The map message

The first message carries the map and section 1 together:

1. One line per section: its title and the lens it mostly lives in.
2. The folded leftovers: "N more units of change folded in: \<list\>. Name one to unpack."
3. The four moves, listed once: `skip` (next section, unanswered), `deeper` (more snippets and questions here), `next` (accept, move on), `explain` (walk me through it, no quiz).
4. Section 1.

### A section

```
## Section <n> of <total> — <title>

**Code why** (<label>): …
**Systems why** (<label>): …
**Architectural why** (<label>): … | none

<snippets>

**Tradeoff:** <one line>

❓ **Q1** — <open-ended>
❓ **Q2** — <multiple choice, when a mechanical fact matters>
```

Say `none` for a lens with nothing to say. A **snippet** is the decisive code (a signature, the branch point, the one non-obvious line): resulting code as it now reads, at most 20 lines, headed by a clickable `path:line` reference, a few per section. A pure removal is the one exception: show the removed block labelled **Removed** with its old `path:line`.

Questions draw only on whys labelled *from the session* or verified against the code. An inferred why becomes a confirmation prompt instead: "This appears to be \<X\>; does that match your intent?" Each section asks two questions, three at most:

- One open-ended **why** or **what breaks if** question that needs reasoning past the snippet. A question the snippet answers by itself tests reading.
- One multiple choice when a mechanical fact matters (which layer, which file, which caller). Every option has the same word count, and every wrong option is something a reasonable reader would believe.

A suspected defect noticed while preparing gets one line where it arises, marked **Not reviewed**, with a pointer to `/code-review`, then the section continues.

### Grading

Grade each answer with one verdict word, `Right`, `Partly`, or `Off`, then at most one paragraph anchored to the `path:line` the answer hinges on. For `Off` or "don't know": explain the answer, ask one follow-up, and move on whatever the follow-up yields. Record every `Partly` and `Off` for the close.

A round is done when every question in the section is answered, skipped, or explained. Then the next section.

## 5. Close

After the last section:

1. **Tradeoffs**, consolidated across sections: alternatives rejected, debt deliberately taken, coupling or risk added, what was left undone, and what would have to be true for this design to be wrong. Descriptive; offer `/to-tickets` for any follow-up rather than writing tickets.
2. **Shaky on**: the recorded `Partly` and `Off` items, each with the `path:line` to re-read.
3. **Tell a teammate**: three to five sentences the user could repeat to someone else to explain the change.

The session is done when every section has been visited, the close is delivered, and the folded leftovers were either unpacked or named.

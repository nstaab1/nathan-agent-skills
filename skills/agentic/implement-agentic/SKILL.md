---
name: implement-agentic
description: Implement attended work from an approved spec or ticket set through TDD, review, commit, and an explicit PR handoff. Use when a human remains available for unresolved seams, design calls, and the final ship decision.
disable-model-invocation: true
---

# Implement Agentic

Implement the work described by the user, spec, or tickets.

1. Read the complete source work and the project's domain docs and ADRs. Confirm any missing acceptance criteria or test seams with the user before writing code.
2. Use `/tdd` at the pre-agreed seams. Work one red-green vertical slice at a time.
3. Run focused tests and typechecking throughout. Run the full relevant test suite once at the end.
4. Run `/code-review` against the branch point. Fix mechanical findings; bring judgment calls to the user.
5. Commit the approved work to the current branch.
6. Tell the user to run `/open-pr-agentic` when they are ready to ship it.

Done means the approved scope is implemented, checks pass, review findings are resolved or surfaced, and the committed branch is ready for the user's ship decision.

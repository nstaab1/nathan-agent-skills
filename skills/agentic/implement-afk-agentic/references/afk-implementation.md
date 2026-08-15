# AFK Implementation Design

Use this reference when installing or adapting the autonomous implementation workflow in a repository.

## Relocate the gates

Attended implementation has three human gates: seam confirmation, review-findings triage, and the ship decision. AFK execution relocates them rather than deleting them:

- Move seam confirmation earlier into the ticket, while the spec context is still live. A ticket is agent-ready only when its **Seams under test** section names the public interfaces to test.
- Move judgment findings later into the PR under `## Reviewer: look here`.
- Move the ship decision to PR review. The agent may open the PR; it never merges it.
- Convert every unresolved decision into a halt: comment, relabel, stop.

## Workflow components

| Skill | Responsibility |
| --- | --- |
| `to-tickets-agentic` | Classify AFK versus attended tickets, record seams, and prevent overlapping parallel work |
| `implement-agentic` | Run attended implementation with human gates intact |
| `implement-afk-agentic` | Build one agent-ready ticket unattended and enforce the halt rule |
| `open-pr-agentic` | Open the unmerged PR and advance the issue to human verification |
| `tdd` | Drive red-green vertical slices at the agreed seams |
| `code-review` | Separate standards and spec review before shipping |
| `codebase-design` | Supply the shared seam and deep-module vocabulary |

## Repository contract

Before dispatching AFK work, commit and push:

1. The project-level skills required by the chosen agent harness.
2. Issue-tracker and triage-label instructions, including the labels for agent-ready, needs-info, human-required, and awaiting verification.
3. The PR target/integration branch when it differs from the repository's default branch.
4. Domain docs and ADR pointers used to settle implementation decisions.
5. Agent instructions pointing at this lifecycle.

Cloud agents start from the remote repository, not a developer's global skills or uncommitted files.

## Ticket readiness

An AFK ticket has:

- a narrow, independently verifiable vertical slice;
- unambiguous acceptance criteria;
- named public seams under test;
- explicit blocking edges;
- no overlap with other tickets on the same executable frontier; and
- the configured agent-ready and dispatch labels.

If a seam cannot be named while writing the ticket, the work is attended. A new interface whose quality depends on "does this feel right?" is not AFK-ready.

## Forward test

Start with one small ticket. A successful build ends with a green, unmerged PR awaiting human verification. A successful halt ends with a precise ticket comment and a lifecycle label change. Silence, an invented seam, or an auto-merge is failure.

Verify each target harness can discover project-level skills and run the review mechanism. If parallel review sub-agents are unavailable, configure a sequential review fallback before relying on AFK execution.

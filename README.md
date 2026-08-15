# Nathan Agent Skills

Nathan's version-controlled engineering workflow for Claude Code, Codex, Cursor, and other agents supported by the [`skills`](https://skills.sh/) CLI.

## Skill catalog

The catalog is available for project-level selection:

| Catalog      | Skills | Purpose                    |
| ------------ | -----: | -------------------------- |
| Engineering  |     18 | Main engineering workflows |
| Productivity |      7 | General-purpose workflows  |
| Agentic      |      4 | Autonomous coding workflow |

That is 29 installable skills in total. The recommended core workflow is:

| Skill                | Role                                                            |
| -------------------- | --------------------------------------------------------------- |
| `grill-with-docs`    | Stress-test a design while maintaining its glossary and ADRs    |
| `to-spec`            | Turn the current conversation into an implementation spec       |
| `code-review`        | Review a diff independently against standards and its spec      |
| `setup-agent-skills` | Configure a consuming repo's tracker and domain-doc conventions |
| `grilling`           | Reusable interview discipline used by `grill-with-docs`         |
| `domain-modeling`    | Reusable glossary and ADR discipline used by `grill-with-docs`  |
| `writing-for-agents` | Create and improve skills and agent-facing instructions         |

### Agentic coding

The agentic variants preserve the attended skills while adding an autonomous lane:

| Skill                     | Role                                                        |
| ------------------------- | ----------------------------------------------------------- |
| `to-tickets-agentic`      | Classify AFK and attended tickets and record test seams     |
| `implement-agentic`       | Build attended work through TDD, review, and commit         |
| `implement-afk-agentic`   | Build and ship one agent-ready ticket without a human       |
| `open-pr-agentic`         | Open the unmerged PR and advance it to human verification   |

The AFK flow moves human gates into ticket preparation and PR review. Anything the ticket does not settle triggers a precise halt instead of an invented decision.

## Install into a project

Run this from the project that should consume the skills:

```bash
npx skills@latest add nstaab1/nathan-agent-skills --full-depth
```

The CLI defaults to a project-level install. Choose the skills and agents for that repository; omit `-g`, which would install globally.

For a repeatable project bootstrap, put the exact selection in the consuming project's `package.json` and commit the resulting agent directories and `skills-lock.json`:

```json
{
  "scripts": {
    "skills:install": "npx --yes skills@latest add nstaab1/nathan-agent-skills --skill grill-with-docs to-spec code-review setup-agent-skills domain-modeling grilling --agent claude-code codex -y --full-depth",
    "skills:update": "npx --yes skills@latest update --project --yes"
  }
}
```

Adjust the skill and agent lists per project. Then run `pnpm skills:install` (or the equivalent command for that project's package manager). Run `/setup-agent-skills` once inside each consuming repository before using `to-spec` or `code-review`.

To install every skill for every detected agent instead:

```bash
npx skills@latest add nstaab1/nathan-agent-skills --all --full-depth
```

## Maintain this source repo

Edit skills here, commit and push them, then run the consuming project's install or update script. Treat installed project copies as generated output rather than the editing source.

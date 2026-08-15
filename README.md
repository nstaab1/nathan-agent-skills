# Nathan Agent Skills

Nathan's version-controlled engineering workflow for Claude Code, Codex, Cursor, and other agents supported by the [`skills`](https://skills.sh/) CLI.

This repository has its own Git history. Matt Pocock's [`skills`](https://github.com/mattpocock/skills) repository is configured locally as the `upstream` remote, so upstream changes can be reviewed and selectively incorporated without creating a GitHub fork relationship.

## Included workflow

| Skill | Role |
| --- | --- |
| `grill-with-docs` | Stress-test a design while maintaining its glossary and ADRs |
| `to-spec` | Turn the current conversation into an implementation spec |
| `code-review` | Review a diff independently against standards and its spec |
| `setup-agent-skills` | Configure a consuming repo's tracker and domain-doc conventions |
| `grilling` | Reusable interview discipline used by `grill-with-docs` |
| `domain-modeling` | Reusable glossary and ADR discipline used by `grill-with-docs` |
| `writing-for-agents` | Create and improve skills and agent-facing instructions |

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

## Maintain this source repo

Edit skills here, commit and push them, then run the consuming project's install or update script. Treat installed project copies as generated output rather than the editing source.

To inspect upstream changes:

```bash
git fetch upstream --prune
git diff HEAD upstream/main -- skills
```

Apply useful changes selectively and adapt them here. The renamed `setup-agent-skills` folder maps to upstream's `setup-matt-pocock-skills`, so compare that skill explicitly when upstream changes it.

See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for the imported snapshot and attribution.

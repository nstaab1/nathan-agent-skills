# Writing `docs/agents/pull-requests.md`

Write the consumer repo's PR doc with the developer. Try each command against a real PR in the repo before writing it down, read-only where you can. A write you haven't tried is marked untried in the doc.

The doc has six sections. Each holds the commands, with placeholders like `<pr>` and `<thread-id>`, and the gotchas the host's own docs don't tell you.

1. **Find the PR**: from a number, a link, or the current branch. Include how to get the ticket it closes and its base branch.
2. **Read**: inline comments with their ids and what they reply to, review bodies, and conversation comments. Say how to tell your own replies apart, and the names automated reviewers post under, since one bot can show a different name in each API.
3. **Reply and resolve**: reply to an inline thread and to a conversation comment, and resolve a thread. Include how to post a PR comment that links an item with no thread, such as a conversation comment or an issue listed in a review body.
4. **Checks**: list a PR's checks, read a failed log, including while the run is still going, and rerun a failure enough times to tell a flake from a real failure.
5. **Fresh review**: how an automated reviewer is asked to review again, or that it reviews every push on its own, or that the host has none.
6. **Checkout**: where to check out a PR's branch, and the setup a fresh checkout needs before tests run.

Done when every section has a command the developer has seen work, or is marked untried.

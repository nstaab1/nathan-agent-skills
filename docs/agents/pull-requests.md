# Pull requests: GitHub

Pull requests for this repo live on `nstaab1/nathan-agent-skills`. As with issues, pass `-R nstaab1/nathan-agent-skills` to every `gh pr` call, and use `repos/nstaab1/nathan-agent-skills` in every `gh api` path. `gh api` has no `-R` flag: it fills `{owner}/{repo}` from the current directory's remote, and with two remotes that can be `upstream` (`mattpocock/skills`). GraphQL calls name the owner and repo as variables.

Commands marked _untried_ have not yet been run against a PR in this repo.

## 1. Find the PR

- **From a number or link**: `gh pr view <pr> -R nstaab1/nathan-agent-skills --json number,title,headRefName,baseRefName,state,closingIssuesReferences --jq '{number,title,headRefName,baseRefName,state,closes:[.closingIssuesReferences[].number]}'`
- **From the current branch**: `gh pr view "$(git branch --show-current)" -R nstaab1/nathan-agent-skills --json number --jq .number` (passes the checked-out branch name, because `gh pr view` with `-R` and no argument fails with "argument required when using the --repo flag").
- **The ticket it closes**: `closes` above, filled from `Closes #<n>` in the PR body. Read the ticket and its parent spec with the commands in `issue-tracker.md`.
- **Conflicts with base**: `gh pr view <pr> -R nstaab1/nathan-agent-skills --json mergeable,mergeStateStatus`. `CLEAN` / `MERGEABLE` means no conflict.

## 2. Read

Every list pages through all results.

- **Inline comments**, with ids and what they reply to:
  `gh api --paginate repos/nstaab1/nathan-agent-skills/pulls/<pr>/comments --jq '.[] | {id, user: .user.login, in_reply_to_id, path, line, body}'`
  A reply has `in_reply_to_id` set to the first comment of its thread. `line` is `null` when the comment sits on an outdated diff.
- **Review bodies**:
  `gh api --paginate repos/nstaab1/nathan-agent-skills/pulls/<pr>/reviews --jq '.[] | {id, user: .user.login, state, body}'`
  Read these in full. Cursor's review body holds findings that have no inline comment.
- **Conversation comments**:
  `gh api --paginate repos/nstaab1/nathan-agent-skills/issues/<pr>/comments --jq '.[] | {id, user: .user.login, body}'`
- **Review threads**, with the thread ids needed to resolve them:
  ```
  gh api graphql -F owner=nstaab1 -F name=nathan-agent-skills -F pr=<pr> -f query='
  query($owner:String!,$name:String!,$pr:Int!,$after:String){
    repository(owner:$owner,name:$name){ pullRequest(number:$pr){
      reviewThreads(first:100, after:$after){
        pageInfo{ hasNextPage endCursor }
        nodes{ id isResolved path line
          comments(first:100){ nodes{ databaseId author{login} body } } } } } } }'
  ```
  When `hasNextPage` is true, run it again with `-F after=<endCursor>` until it is false.

**Telling authors apart.** The developer and the agent both post as `nstaab1`, so your own replies are the `nstaab1` comments that start with a verdict (`Fixed in`, `Declined:`, `Deferred to`). Each inline reply posted with the command in section 3 also adds an empty review by its author to the reviews list, so skip empty `nstaab1` reviews. The automated reviewers post as:

| Reviewer | REST login | GraphQL login | Where it writes |
| --- | --- | --- | --- |
| Greptile | `greptile-apps[bot]` | `greptile-apps` | Inline comments, an empty review, and a summary as a conversation comment that repeats the inline findings and can add points of its own, so read it in full |
| Cursor | `cursor[bot]` | `cursor` | One review body with every finding. It says it also posts an inline comment for each blocking finding (_untried_: none seen in this repo yet), so read the inline comments too |

Read bot bodies as returned. They carry HTML badges and comments, but don't strip tags with a filter: it also deletes code in angle brackets, such as `<pr>` or `Array<string>`. The list commands above print JSON, where `<` and `>` arrive as `\u003c` and `\u003e`.

## 3. Reply and resolve

- **Reply in an inline thread**: `gh api --method POST repos/nstaab1/nathan-agent-skills/pulls/<pr>/comments/<comment-id>/replies -f body='<text>'`, where `<comment-id>` is the thread's first comment.
- **Comment on the PR**, for a conversation comment or a review body finding: `gh pr comment <pr> -R nstaab1/nathan-agent-skills --body '<text>'`. GitHub conversation comments have no reply threads, so the reply to a conversation comment is a new PR comment made with this command. Link the source item, for example `https://github.com/nstaab1/nathan-agent-skills/pull/<pr>#pullrequestreview-<review-id>` for a review body or `https://github.com/nstaab1/nathan-agent-skills/pull/<pr>#issuecomment-<comment-id>` for a conversation comment.
- **Resolve a thread**:
  `gh api graphql -f query='mutation($id:ID!){ resolveReviewThread(input:{threadId:$id}){ thread{ isResolved } } }' -F id=<thread-id>`

## 4. Checks

- **List**: `gh pr checks <pr> -R nstaab1/nathan-agent-skills`
- This repo has no GitHub Actions workflows. The only checks are the two automated reviews, "Greptile Review" and "Cursor Automation: Initial Code Review". Each passes once its review posts, whatever it found, so a green check says nothing about the findings.
- **Failed log and rerun**: not applicable while there are no workflows. If workflows are added: `gh run view <run-id> -R nstaab1/nathan-agent-skills --log-failed` and `gh run rerun <run-id> -R nstaab1/nathan-agent-skills --failed` (_untried_).
- **Local checks**: `node scripts/skills.mjs check` (the catalog check) and `node --test scripts/lib/*.test.mjs` (the catalog tooling's tests; passing the directory alone fails).

## 5. Fresh review

- **Greptile**: comment `@greptileai review` on the PR (seen on PR 26). Its summary comment also carries a "retrigger" link (_untried_).
- **Cursor**: add the `re-review` label: `gh pr edit <pr> -R nstaab1/nathan-agent-skills --add-label re-review` (seen on PR 26). The `deep-review` label also starts a review (_untried_).

## 6. Checkout

- Work in the main clone: `gh pr checkout <pr> -R nstaab1/nathan-agent-skills`.
- No install step: the repo has no `package.json`, and the scripts need only Node.
- `node scripts/skills.mjs check` warns "vendor worktree missing; drift not verified" until the `vendor` branch is checked out with `node scripts/skills.mjs init`. The check still passes without it.

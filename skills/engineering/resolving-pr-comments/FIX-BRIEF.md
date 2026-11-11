# Fix brief

The prompt for a step 4 subagent. Fill the placeholders and send it as the whole prompt: the subagent sees nothing else.

## For a review item or a failing check

> You are fixing review items on PR <number> in the checkout at <path>, on branch <branch>.
>
> The PR exists to do this:
> <the anchor's numbered lines>
>
> The items, verbatim, with file and line:
> <each item>
>
> The developer's notes on the verdict: <notes, or "none">
>
> Make the smallest change that resolves these items. The items are the whole scope: leave every other line as it is, including code you would write differently.
>
> When the fix changes behaviour, write a test that fails on the problem first, then make it pass. Then typecheck and run the tests that cover the files you touched, with the repo's own commands.
>
> Commit on the branch with a message naming the items. Leave pushing to the orchestrator.
>
> Report the commit sha, the files changed, the test you added or why none fits, and each command you ran with its result.

## For a conflict with the base branch

> You are bringing <base> into PR <number>'s branch <branch>, in the checkout at <path>.
>
> The PR exists to do this:
> <the anchor's numbered lines>
>
> Fetch, then merge the base's fetched remote-tracking ref, such as `origin/<base>`, into the branch, not the local <base> branch, so the history the reviewers commented on stays as it is and the push stays a normal one. Resolve each conflict to keep what both sides meant. Where they truly clash, stop and report the clash.
>
> Before staging each resolved file, count its marker lines with `grep -cE '^(<<<<<<< |=======$|>>>>>>> )' <file>`, as its own command. Run the same grep on the base and branch versions of that file, `git show origin/<base>:<file>` and `git show HEAD:<file>`. The resolved file's count must not exceed the higher of those two counts, which is usually 0. A higher count means a conflict block is still in the file. Then typecheck and run the tests that cover the conflicted files.
>
> Commit the merge. Leave pushing to the orchestrator.
>
> Report the merge commit sha, each conflicted file with how you resolved it, and each command you ran with its result.

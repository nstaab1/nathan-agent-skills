## Scope

Review for bugs, security holes, and spec drift. Style belongs to the linters.

Skip paths listed under **Ignore** in the **This repo** section.

## Failure example

Every finding is a concrete failure the diff causes, written as:

- **Given**: the inputs or state, with real values
- **When**: the action
- **Actual**: the wrong result
- **Expected**: the right result

When you cannot fill all four with concrete values, the finding is a **suspicion**: one line under Suspicions, with no severity.

## Severity

Grade by what happens to a user or system, regardless of how small the change is:

- **blocker**: data loss or corruption, a security hole, a crash or outage, or a core user path broken. Merging it hurts someone.
- **should-fix**: wrong behaviour on a realistic path or edge case, a missing error path, or spec drift.
- **nit**: correct today but fragile: an unguarded assumption, or a test that would miss a regression.

Under a path listed in **Hot paths**, a should-fix is a blocker.

## Confidence

Severity is how bad the failure is if real; confidence is how sure you are it is real.

- **confirmed**: you traced the failure example through the code line by line.
- **likely**: the example holds on your reading but depends on code or data you could not see: a caller, config, runtime state.

## Finding format

```
<severity> — <title> · <confidence>
`path:line`
Given … When … Actual … Expected …
Verify: <the one command, test, or line range that confirms it>
```

Build the Verify line from the **Verify command** in the **This repo** section when it has one.

## Spec drift

The spec is the issue the PR links (`Closes #N`, `Fixes #N`, or an issue named in the branch), looked up in the **Spec source**. Only when no issue is linked, the PR description is the spec. With neither, add "no spec linked" to Not checked.

Each requirement the diff misses or contradicts is a should-fix whose Expected quotes the requirement.

## Summary

Lay the summary out in this order:

1. **Verdict**: safe to merge, merge after fixes, or needs discussion, with a count per severity.
2. **Risk map**: the files that need a careful human read, then the mechanical ones (renames, generated code, lockfiles, config).
3. Every blocker and should-fix, in full.
4. **Suspicions**.
5. Nits, inside one collapsed `<details>` block.
6. **Not checked**: what this review could not assess and why, such as production data, feature flags, external services, or a missing spec.

Every line carries a finding or a fact the reader acts on.

# Test-audit fixture: answer key

This folder is a small library-loans project that checks the `auditing-tests` skill (#15) and the unneeded-test rule in `ns-code-review` (#16). Its suite holds twelve good tests and one unneeded test of each of the five kinds. This file is the only place that says which tests those are, so leave it out of any copy an agent audits.

## Run the tests

From this folder, run `npm test`, which runs `node --test "spec/*.spec.mjs"` on Node 22 or later. Expect 17 tests: 16 pass and 1 is skipped.

The repo's own `node --test` leaves these tests alone, because no default Node test glob matches `*.spec.mjs`.

## Run a trial

1. Copy the folder without this file: `rsync -a --exclude EXPECTED.md fixtures/test-audit/ <trial>/`.
2. In the copy, run `git init` and commit everything. A mutation check needs a clean working tree.
3. Give the copy a local-file tracker by writing `docs/agents/issue-tracker.md` from `skills/engineering/setup-agent-skills/issue-tracker-local.md`, so tickets land in the copy's `.scratch/`.
4. Run `auditing-tests` in the copy with no scope, and compare its tickets with the key below.

The trial passes when the audit files exactly the five tests below, each under its kind, proves the tautological one with a mutation check, and files nothing against a good test. For #16, present the four spec files to `ns-code-review` as a diff. It should flag the same five tests by kind, without a mutation check.

## Answer key

| Kind | File | Test | Label |
| --- | --- | --- | --- |
| Tautological | `spec/loans.spec.mjs` | a new release is due back one week after checkout | `ready-for-agent` |
| Dead | `spec/dates.spec.mjs` | days between counts whole days across a clock change | `ready-for-agent` |
| Redundant | `spec/fees.spec.mjs` | a book returned three days late owes 75 cents | `needs-triage` |
| Implementation-coupled | `spec/loans.spec.mjs` | checkout checks the book is available first | `needs-triage` |
| Misplaced | `spec/server.spec.mjs` | GET /fees caps the fee for a long-overdue book | `needs-triage` |

### Tautological

The test works out its expected due date with `dueDate`, the same function `checkout` calls, so a wrong loan period moves both sides together. No other test covers the new-release loan period, so its ticket should ask for a replacement test that asserts the date itself.

Mutation check, run by hand when the fixture was written:

```diff
-const NEW_RELEASE_LOAN_DAYS = 7;
+const NEW_RELEASE_LOAN_DAYS = 14;
```

A probe that checks out a new release on 2024-03-01 printed `2024-03-15` instead of `2024-03-08`, so the break is real. The suspect, run alone with `--test-name-pattern`, still passed, and so did the whole suite, 16 passing and 1 skipped. `git restore src/loans.mjs` put the code back and `git status --porcelain` printed nothing. Flipping the new-release condition instead also leaves the suspect passing, while "a book is due back three weeks after checkout" fails.

### Dead

It is skipped with `{ skip: 'fails when TZ is set, look at this later' }`. The reason names no ticket, and no ticket tracks the test. With the marker removed it passes, which doesn't matter to the finding.

### Redundant

It calls `lateFeeCents` with a return three days late, under the cap, and expects 75 cents. "charges 25 cents for each day late" in the same file does the same through the same function with other dates. Keep that one, since its name states the rule.

### Implementation-coupled

It spies on `isAvailable` and asserts `checkout` called it once with `'b2'`. Checked by hand: replacing the call in `checkout` with `this.loans.has(bookId)` changes no behaviour, and this test fails while every other test passes. "a book already on loan cannot be checked out again" covers the behaviour.

### Misplaced

It starts the HTTP server to check the fee cap. "the fee stops growing at five dollars" in `spec/fees.spec.mjs` checks the cap with the same dates and no server. The route's wiring is covered by "GET /fees answers with the fee as JSON".

## Good tests that could draw a false finding

- "GET /fees answers with the fee as JSON" is the only test of the route's status, content type and body.
- "GET /fees answers 400 when the return date is missing" covers date validation, which lives only in the server.
- "returning a book late reports the fee owed" checks that `returnBook` charges the fee, through `LoanDesk` rather than `lateFeeCents`.
- "a returned book is available again" calls `isAvailable` as public API and asserts its answer.

Each of the twelve good tests fails under at least one of thirteen hand-made breaks to the code it covers. The tautological test fails under none of them.

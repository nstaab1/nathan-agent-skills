# Filing audit tickets

File every ticket the way `docs/agents/issue-tracker.md` says, with the label string `docs/agents/triage-labels.md` maps its role to.

## Leave findings already filed

Search open tickets for each finding's test name. When an open ticket already names the test, file nothing new for it, and list it with that ticket in the report.

## Group related findings

File one ticket per group. Findings belong together when they share a kind and either a test file or the production code they cover, such as three tautological tests that all stub the same collaborator. A group holds one kind, so each ticket carries one label. Every other finding gets a ticket of its own.

On a local-file tracker, put one audit's tickets under one feature named `test-audit-<YYYY-MM-DD>`, which needs no spec file.

## Write each ticket

The title names the kind and the test, such as `Tautological test: <test name>`, or the kind and the file for a group, such as `Redundant tests in <file>`.

The body holds, in order:

1. One line saying a test audit found it, with the date and the commit audited.
2. Each test's file and line, its name, and the behaviour it claims to verify.
3. The evidence its kind demands:
   - Tautological: the mutation check record.
   - Dead: the marker line, when it was added, and the searches that found no ticket tracking it.
   - Redundant: the other test, by file and name, and why the two verify the same behaviour through the same interface.
   - Implementation-coupled: the refactor that keeps the behaviour and fails the test, and the test that still covers the behaviour when one does.
   - Misplaced: the cheaper test, by file and name, why it covers the same check, and both durations when known.
4. The suggested change:
   - Tautological: delete the test. When no other test covers its behaviour, replace it with one that fails under the same break.
   - Dead: delete the test and its marker. When the evidence shows the skip's reason no longer holds, offer removing only the marker as the other option.
   - Redundant: delete one of the pair, and name the one to keep.
   - Implementation-coupled: rewrite it to assert the behaviour through the public interface, or delete it when another test already covers that behaviour.
   - Misplaced: move any part of its check the cheaper test misses down to the cheaper level, then delete it.

Label tautological and dead tickets `ready-for-agent`, so an agent can act on the hard evidence. Label the other three kinds `needs-triage`, so a person confirms the reasoning first.

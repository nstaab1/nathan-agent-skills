# Mutation check

A mutation check proves a tautological finding. Break the behaviour the suspect claims to verify, run the suspect on its own, and watch it pass. Check one suspect at a time.

1. Confirm the working tree is clean, as step 3 of the skill defines it.
2. Name the behaviour the suspect claims to verify, from its name and its assertions, and find the production line that implements it.
3. Break that line with the smallest edit that changes the behaviour, such as changing a constant, flipping a condition or comparison, or returning a fixed wrong value. Edit production code only. Pick a break that leaves the suspect's own setup working, so the suspect reaches the assertion that checks the behaviour. A syntax error, a crash on import, or setup that now throws fails the suspect for the wrong reason.
4. Show the break is real: another test of the behaviour now fails, or a one-off probe that calls the code prints the changed result. A break that changes nothing observable proves nothing, so break a different line.
5. Run the suspect on its own. When it passes, the finding is proven. When it fails at the assertion that checks the behaviour, the test is doing its job and is not tautological. When it fails before that assertion, in its setup or on import, the failure is incidental and proves nothing, so restore and try a break that leaves the setup working.
6. Restore with `git restore <file>`, then confirm the working tree is clean. Every check ends here, whatever happened in the steps before.

Record for the ticket:

- The break, as a diff.
- The evidence from step 4.
- The command that ran the suspect, and its passing output.

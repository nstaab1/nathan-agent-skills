#!/usr/bin/env node
// The test command that the verdict script's tests wrap. It reads a plan file
// naming the results file and what each run does, then performs the next run:
// it writes that run's JUnit XML, or nothing when the run has no `xml`, and
// exits with that run's code. A run beyond the plan writes nothing and exits
// 99, so an attempt the test did not expect reads as a crash.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const planFile = process.argv[2];
const { results, runs } = JSON.parse(readFileSync(planFile, 'utf8'));
const countFile = `${planFile}.count`;
const count = existsSync(countFile) ? Number(readFileSync(countFile, 'utf8')) : 0;
writeFileSync(countFile, String(count + 1));

const run = runs[count];
if (!run) {
  process.stderr.write(`fake test command: run ${count + 1} is not in the plan\n`);
  process.exit(99);
}
if (run.xml !== undefined) writeFileSync(results, run.xml);
process.exit(run.exit);

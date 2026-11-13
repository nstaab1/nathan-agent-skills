#!/usr/bin/env node
// verdict.mjs version 0.1.0
//
// The verdict script. It runs a CI job's test command, reruns the failures
// once, and decides whether the build passes. All it reads from the test
// framework is the exit code and the JUnit XML results file. It needs only
// Node, with no dependencies.
//
//   node verdict.mjs --results <file> [--rerun <command>] [--summary <file>] -- <test command>
//
//   --results  The JUnit XML file the test command writes. Required. It is
//              deleted before each attempt, so a stale file is never read.
//   --rerun    The rerun-failures command: a shell command that reruns only
//              the failed tests and writes the same results file, such as
//              "pytest --lf --junitxml=results.xml". Without it, attempt 2
//              runs the whole test command again.
//   --summary  A file to append the run summary to. Defaults to
//              $GITHUB_STEP_SUMMARY. The summary is printed to stdout either way.
//
// The test command after `--` runs as given, without a shell. The rerun
// command runs through the shell.
//
// Exit code: 0 the build passes, 1 it fails, 2 the arguments are wrong.
//
// The decision:
//   1. Run the test command (attempt 1).
//   2. No failed test: pass when the command exited 0, fail when it didn't.
//   3. Any failed test: run attempt 2 with the rerun-failures command when
//      given, the whole test command otherwise.
//   4. For each test that failed in attempt 1: passed in attempt 2 is a flake
//      occurrence and doesn't fail the build. Failed again, skipped or left
//      out of attempt 2 fails it.
//   5. An attempt that writes no readable results file fails the build, and
//      so does a rerun that exits non-zero with no failed test.
//
// A testcase has failed when it holds a failure or error element, and was
// skipped when it holds a skipped element. A test's identity is its classname
// plus its name, verbatim, so each case of a parameterised test is its own
// test. When one identity has several testcases in a file, it has failed if
// any of them failed.
//
// The run summary is Markdown: a "### Verdict: pass" or "### Verdict: fail"
// heading, then one bullet per reason the build fails and one per flake
// occurrence, naming the test as `<classname> <name>`.
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, rmSync } from 'node:fs';

const USAGE =
  'usage: node verdict.mjs --results <file> [--rerun <command>] [--summary <file>] -- <test command>';
const FLAGS = ['--results', '--rerun', '--summary'];

// Settings ----------------------------------------------------------------

// { settings } from the command line, or { problem } saying what is wrong.
const readSettings = (argv) => {
  const split = argv.indexOf('--');
  const flags = split === -1 ? argv : argv.slice(0, split);
  const settings = {
    command: split === -1 ? [] : argv.slice(split + 1),
    summary: process.env.GITHUB_STEP_SUMMARY || undefined,
  };
  for (let i = 0; i < flags.length; i += 2) {
    if (!FLAGS.includes(flags[i])) return { problem: `unknown argument ${flags[i]}` };
    if (flags[i + 1] === undefined) return { problem: `${flags[i]} needs a value` };
    settings[flags[i].slice(2)] = flags[i + 1];
  }
  if (!settings.results) return { problem: 'no --results file' };
  if (settings.command.length === 0) return { problem: 'no test command after --' };
  return { settings };
};

// JUnit XML ---------------------------------------------------------------

const TOKEN =
  /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|[^<]+|</y;

const decode = (text) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (_, entity) => {
    if (entity[0] === '#') {
      const hex = entity[1] === 'x' || entity[1] === 'X';
      return String.fromCodePoint(parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10));
    }
    return { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[entity.toLowerCase()];
  });

const attributes = (text) => {
  const found = {};
  for (const [, key, double, single] of text.matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    found[key] = decode(double ?? single);
  }
  return found;
};

// Every testcase in the file as { classname, name, outcome }, where outcome is
// failed (it holds a failure or error element), skipped or passed. Null when
// the file is not a whole JUnit XML document, such as one cut off mid-write.
const parseJUnit = (xml) => {
  const testcases = [];
  const open = [];
  let root = null;
  let current = null;
  TOKEN.lastIndex = 0;
  for (let token; (token = TOKEN.exec(xml)); ) {
    const [text, closing, opening, attrs, selfClosing] = token;
    if (opening) {
      if (open.length === 0) {
        if (root) return null;
        root = opening;
      }
      if (opening === 'testcase') {
        const { classname = '', name = '' } = attributes(attrs);
        current = { classname, name, outcome: 'passed', depth: open.length };
        testcases.push(current);
      } else if (current && open.length === current.depth + 1) {
        if (opening === 'failure' || opening === 'error') current.outcome = 'failed';
        else if (opening === 'skipped' && current.outcome === 'passed') current.outcome = 'skipped';
      }
      if (selfClosing) {
        if (opening === 'testcase') current = null;
      } else {
        open.push(opening);
      }
    } else if (closing) {
      if (open.pop() !== closing) return null;
      if (closing === 'testcase') current = null;
    } else if (text === '<' || (open.length === 0 && text[0] !== '<' && text.trim())) {
      return null;
    }
  }
  if (open.length > 0 || (root !== 'testsuites' && root !== 'testsuite')) return null;
  return testcases;
};

// Test identity is classname plus name, verbatim.
const identity = ({ classname, name }) => JSON.stringify([classname, name]);
const display = ({ classname, name }) => (classname ? `${classname} ${name}` : name);

// One identity can own several testcases in a file: pytest writes one per
// retry and a second for a teardown error, and Vitest gives every case of a
// test.each with no placeholder in its title the same name. The identity has
// failed if any of them failed, else passed if any of them ran.
const RANK = { failed: 2, passed: 1, skipped: 0 };

// The file's testcases by identity, or null when there is no readable file.
const readResults = (path) => {
  let testcases;
  try {
    testcases = parseJUnit(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
  if (!testcases) return null;
  const byIdentity = new Map();
  for (const testcase of testcases) {
    const key = identity(testcase);
    const seen = byIdentity.get(key);
    if (!seen || RANK[testcase.outcome] > RANK[seen.outcome]) byIdentity.set(key, testcase);
  }
  return byIdentity;
};

const failedIn = (results) => [...results.values()].filter((testcase) => testcase.outcome === 'failed');

// Attempts ----------------------------------------------------------------

// Each attempt starts with no results file, so a run that writes none can't
// be read as the one before it.
const runTestCommand = (results, [file, ...args]) => {
  rmSync(results, { force: true });
  return spawnSync(file, args, { stdio: 'inherit' });
};

const runRerunCommand = (results, command) => {
  rmSync(results, { force: true });
  return spawnSync(command, { stdio: 'inherit', shell: true });
};

const exitOf = ({ status, signal, error }) => {
  if (error) return `could not start (${error.message})`;
  if (signal) return `was stopped by ${signal}`;
  return `exited ${status}`;
};

// The verdict -------------------------------------------------------------

// Runs the attempts and returns what the run summary reports: the reasons the
// build fails, and the flake occurrences, which don't fail it.
const judge = (settings) => {
  const buildFailures = [];
  const occurrences = [];

  const attempt1 = runTestCommand(settings.results, settings.command);
  const results1 = readResults(settings.results);
  if (!results1) {
    buildFailures.push(
      `Attempt 1 wrote no readable results file at \`${settings.results}\`, and the test command ${exitOf(attempt1)}.`,
    );
    return { buildFailures, occurrences };
  }

  const failures = failedIn(results1);
  if (failures.length === 0) {
    if (attempt1.status !== 0) {
      buildFailures.push(`The test command ${exitOf(attempt1)} with no failed test in the results file.`);
    }
    return { buildFailures, occurrences };
  }

  const attempt2 = settings.rerun
    ? runRerunCommand(settings.results, settings.rerun)
    : runTestCommand(settings.results, settings.command);
  const results2 = readResults(settings.results);
  if (!results2) {
    buildFailures.push(
      `Attempt 2 wrote no readable results file at \`${settings.results}\`, and the rerun ${exitOf(attempt2)}.`,
    );
  } else if (attempt2.status !== 0 && failedIn(results2).length === 0) {
    buildFailures.push(`The rerun ${exitOf(attempt2)} with no failed test in the results file.`);
  }

  for (const testcase of failures) {
    const rerun = results2?.get(identity(testcase));
    const test = `\`${display(testcase)}\``;
    if (rerun?.outcome === 'passed') {
      occurrences.push(`Flake occurrence: ${test} failed on attempt 1 and passed on attempt 2.`);
    } else if (rerun?.outcome === 'failed') {
      buildFailures.push(`Failed on both attempts: ${test}.`);
    } else {
      buildFailures.push(`No result on attempt 2: ${test} failed on attempt 1 and the rerun did not report it.`);
    }
  }
  return { buildFailures, occurrences };
};

// Main --------------------------------------------------------------------

const { settings, problem } = readSettings(process.argv.slice(2));
if (problem) {
  process.stderr.write(`verdict.mjs: ${problem}\n${USAGE}\n`);
  process.exit(2);
}

const { buildFailures, occurrences } = judge(settings);
const pass = buildFailures.length === 0;
const summary = [
  `### Verdict: ${pass ? 'pass' : 'fail'}`,
  '',
  ...[...buildFailures, ...occurrences].map((line) => `- ${line}`),
  '',
].join('\n');

process.stdout.write(`\n${summary}`);
if (settings.summary) appendFileSync(settings.summary, summary);
process.exitCode = pass ? 0 : 1;

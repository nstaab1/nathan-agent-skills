// Runs the verdict script the way CI does, as a separate process wrapping a
// test command, and hands back only what CI sees: the exit code and the run
// summary. The test command is fake-test-command.mjs, following a plan the
// test writes.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { startFakeGitHub } from './fake-github.mjs';
import { startFakeGitLab } from './fake-gitlab.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const VERDICT = join(here, '../../skills/engineering/fixing-flaky-tests/scripts/verdict.mjs');
const FAKE = join(here, 'fake-test-command.mjs');

const escape = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const testcase = (classname, name, inside) => {
  const open = `<testcase classname="${escape(classname)}" name="${escape(name)}" time="0.01"`;
  return inside ? `${open}>${inside}</testcase>` : `${open}/>`;
};

export const passed = (classname, name) => testcase(classname, name);
export const failed = (classname, name) =>
  testcase(classname, name, '<failure message="assert 39 == 40">AssertionError</failure>');
export const errored = (classname, name) =>
  testcase(classname, name, '<error message="failed on setup">RuntimeError</error>');
export const skipped = (classname, name) =>
  testcase(classname, name, '<skipped message="not ready"/>');

export const junit = (...testcases) =>
  [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<testsuites>',
    '<testsuite name="suite">',
    ...testcases,
    '</testsuite>',
    '</testsuites>',
    '',
  ].join('\n');

// Test command runs over a suite of `size` tests, in which each `flaky` test
// fails on attempt 1 and passes on attempt 2, each `broken` test fails on both
// attempts, and the rest pass. A test is [classname, name].
export const suite = ({ size = 40, flaky = [], broken = [] }) => {
  const others = Array.from({ length: size - flaky.length - broken.length }, (_, i) =>
    passed('tests.test_other', `test_${i}`),
  );
  const failing = broken.map((test) => failed(...test));
  return {
    testRuns: [
      { exit: 1, xml: junit(...others, ...flaky.map((test) => failed(...test)), ...failing) },
      { exit: failing.length ? 1 : 0, xml: junit(...others, ...flaky.map((test) => passed(...test)), ...failing) },
    ],
  };
};

// The time `days` days before now, in UTC to the second, as the script and
// the trackers write times.
const DAY_MS = 24 * 60 * 60 * 1000;
export const daysAgo = (days) => new Date(Date.now() - days * DAY_MS).toISOString().replace(/\.\d+Z$/, 'Z');

// An earlier flake occurrence as the comment the script writes, in the marker
// format the script's header documents, from `daysAgo` days before now. Each
// gets a run of its own unless given one.
let runs = 1000;
export const earlier = ({ daysAgo: days = 1, branch = 'main', job = 'test', run = String(++runs), reopened } = {}) => {
  const date = daysAgo(days);
  const run_url = `https://ci.example/acme/shop/runs/${run}`;
  const data = { date, branch, job, run, run_url, ...(reopened && { reopened }) };
  return [
    'Flake occurrence: failed on attempt 1 and passed on attempt 2.',
    '',
    `<!-- verdict-occurrence ${JSON.stringify(data)} -->`,
  ].join('\n');
};

const spawnAndWait = (file, args, options) =>
  new Promise((resolve, reject) => {
    const child = spawn(file, args, options);
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, output }));
  });

// The environment the script runs in: this process's, with nothing a real CI
// set that the script reads, plus the variables a test gives.
const CI_VARIABLES = /^(GITHUB_|GITLAB_|CI_|VERDICT_)/;
const scriptEnv = (extra = {}) => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !CI_VARIABLES.test(key)));
  return { ...env, ...extra };
};

// testRuns: what the test command does on each run, in order, as
// { exit, xml }. Leave out xml for a run that writes no results file.
// rerunRuns: when given, a rerun-failures command is configured and these are
// its runs.
// stale: a results file left over from an earlier run, there before attempt 1.
// summaryIn: 'flag' passes --summary; 'github' sets GITHUB_STEP_SUMMARY.
// flags: more arguments for the script, before the `--`.
// env: more environment variables for the script.
export const runVerdict = async ({ testRuns, rerunRuns, stale, summaryIn = 'flag', flags = [], env: extraEnv }) => {
  const dir = mkdtempSync(join(tmpdir(), 'verdict-'));
  try {
    const results = join(dir, 'results.xml');
    const summary = join(dir, 'summary.md');
    if (stale !== undefined) writeFileSync(results, stale);

    const fakeCommand = (planName, runs) => {
      const plan = join(dir, `${planName}.json`);
      writeFileSync(plan, JSON.stringify({ results, runs }));
      return [process.execPath, FAKE, plan];
    };

    const env = scriptEnv(extraEnv);
    const args = [VERDICT, '--results', results, ...flags];
    if (summaryIn === 'github') env.GITHUB_STEP_SUMMARY = summary;
    else args.push('--summary', summary);
    if (rerunRuns) {
      const rerun = fakeCommand('rerun', rerunRuns).map((part) => `"${part}"`).join(' ');
      args.push('--rerun', rerun);
    }
    args.push('--', ...fakeCommand('test', testRuns));

    const { code, output } = await spawnAndWait(process.execPath, args, { cwd: dir, env });
    return { code, output, summary: existsSync(summary) ? readFileSync(summary, 'utf8') : '' };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

// Runs the verdict script with exactly these arguments, in a fresh directory,
// for checking how it treats its own settings.
export const runVerdictWith = async (args) => {
  const dir = mkdtempSync(join(tmpdir(), 'verdict-'));
  try {
    return await spawnAndWait(process.execPath, [VERDICT, ...args], { cwd: dir, env: scriptEnv() });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

// The summary line that names a test, so a test can check what was said about it.
export const lineAbout = (summary, text) =>
  summary.split('\n').find((line) => line.includes(text)) ?? '';

// The settings that point the script at a fake tracker, as one CI job.
export const recordingTo = (tracker, { branch = 'feature/cart', job = 'test', run = '4242' } = {}) => ({
  flags: [
    '--tracker', tracker.kind,
    '--tracker-url', tracker.url,
    '--repo', tracker.repo,
    '--branch', branch,
    '--job', job,
    '--run', run,
    '--run-url', `https://ci.example/acme/shop/runs/${run}`,
  ],
  env: { VERDICT_TRACKER_TOKEN: tracker.token },
});

// A kind of fake tracker. `withTracker` runs body against a fake started with
// these options, then stops it. `unreachable` gives the settings of a tracker
// of this kind at a localhost address nothing answers.
const fakeTracker = (name, start) => ({
  name,
  withTracker: async (options, body) => {
    const tracker = await start(options);
    try {
      await body(tracker);
    } finally {
      await tracker.close();
    }
  },
  unreachable: async () => {
    const tracker = await start();
    await tracker.close();
    return { kind: tracker.kind, url: tracker.url, repo: tracker.repo, token: tracker.token };
  },
});

export const github = fakeTracker('GitHub', startFakeGitHub);
export const gitlab = fakeTracker('GitLab', startFakeGitLab);

// Registers one test per kind of tracker, each named for its tracker, so
// every adapter answers to the same tests. body is given the fake tracker.
export const trackerTest = (name, body) => {
  for (const fake of [github, gitlab]) test(`${name} (${fake.name})`, () => body(fake));
};

// The flake occurrences on a record, read from each comment's occurrence
// marker in the form the script's header documents.
export const OCCURRENCE = /^<!-- verdict-occurrence (\{.*\}) -->$/m;
export const occurrencesOn = (record) =>
  record.comments.flatMap((comment) => {
    const marker = comment.match(OCCURRENCE);
    return marker ? [JSON.parse(marker[1])] : [];
  });

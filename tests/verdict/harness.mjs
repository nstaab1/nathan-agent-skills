// Runs the verdict script the way CI does, as a separate process wrapping a
// test command, and hands back only what CI sees: the exit code and the run
// summary. The test command is fake-test-command.mjs, following a plan the
// test writes.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const spawnAndWait = (file, args, options) =>
  new Promise((resolve, reject) => {
    const child = spawn(file, args, options);
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, output }));
  });

// testRuns: what the test command does on each run, in order, as
// { exit, xml }. Leave out xml for a run that writes no results file.
// rerunRuns: when given, a rerun-failures command is configured and these are
// its runs.
// stale: a results file left over from an earlier run, there before attempt 1.
// summaryIn: 'flag' passes --summary; 'github' sets GITHUB_STEP_SUMMARY.
export const runVerdict = async ({ testRuns, rerunRuns, stale, summaryIn = 'flag' }) => {
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

    const env = { ...process.env };
    delete env.GITHUB_STEP_SUMMARY;
    const args = [VERDICT, '--results', results];
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
    const env = { ...process.env };
    delete env.GITHUB_STEP_SUMMARY;
    return await spawnAndWait(process.execPath, [VERDICT, ...args], { cwd: dir, env });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

// The summary line that names a test, so a test can check what was said about it.
export const lineAbout = (summary, text) =>
  summary.split('\n').find((line) => line.includes(text)) ?? '';

#!/usr/bin/env node
// verdict.mjs version 0.2.0
//
// The verdict script. It runs a CI job's test command, reruns the failures
// once, records each flake occurrence on the test's flaky-test record in the
// issue tracker, and decides whether the build passes. All it reads from the
// test framework is the exit code and the JUnit XML results file. It needs
// only Node, with no dependencies.
//
//   node verdict.mjs --results <file> [--rerun <command>] [--summary <file>] [tracker settings] -- <test command>
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
// Tracker settings. The tracker is a GitHub repo's issues, reached through
// GitHub's REST API. On GitHub Actions every setting but the token defaults
// from the job's environment, and a flag overrides its default.
//
//   --tracker-url  The API's base address. Defaults to $GITHUB_API_URL, then
//                  https://api.github.com.
//   --repo         The repo whose issues hold the records, as owner/name.
//                  Defaults to $GITHUB_REPOSITORY.
//   --branch       The branch the run tests. Defaults to $GITHUB_HEAD_REF, a
//                  PR's own branch, then $GITHUB_REF_NAME.
//   --job          The job's name. Defaults to $GITHUB_JOB, the job's id,
//                  which every leg of a matrix shares. Pass a name that holds
//                  the matrix values, such as "test (${{ matrix.os }})", so
//                  occurrences tell the legs apart.
//   --run          The run's id, the same in every job and every attempt of
//                  the run. Defaults to $GITHUB_RUN_ID.
//   --run-url      The run's link. Defaults to
//                  $GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID.
//   --flaky-label  The label every flaky-test record carries. Defaults to
//                  flaky-test.
//
// The token comes from $VERDICT_TRACKER_TOKEN, then $GITHUB_TOKEN, and never
// from a flag, which keeps it out of logs and process lists. It must be able
// to read and write issues. On GitHub Actions that is the job's own token
// with `permissions: issues: write`, passed as
// `env: GITHUB_TOKEN: ${{ github.token }}`. While a setting is missing, every
// occurrence goes unrecorded and the run summary names what is missing.
//
// Recording a flake occurrence:
//   1. Find the test's record: the issue carrying the flaky label whose title
//      is exactly the test's identity as `<classname> <name>`. The script
//      lists every issue with the flaky label, open and closed, once per job,
//      and compares titles itself. GitHub's search matches loosely and lags
//      behind new issues, so a matrix job could miss a record created seconds
//      earlier by another leg of the run.
//   2. No record: create one with that title, labelled with the flaky label
//      and ready-for-agent.
//   3. A record that already holds an occurrence with this --run: leave it.
//      Every job of a run runs the script, and the run is one occurrence.
//   4. A closed record: reopen it.
//   5. Add the occurrence as a comment on the record.
//
// So a job sends one listing request per 100 records, and per occurrence: for
// a new record, a create and a comment; for an existing one, one request per
// 100 of its comments, then a reopen if it was closed, then a comment.
// Nothing is sent when the run has no flake occurrence.
//
// A tracker that can't be reached, or that refuses a request, as GitHub does
// a fork PR's read-only token, leaves the verdict as it was. The run summary
// says the occurrence was not recorded, and why.
//
// The occurrence comment: lines for people giving the date, branch, job and
// run link, then a last line, hidden when rendered, holding the same facts
// for scripts:
//
//   <!-- verdict-occurrence {"date":"2026-11-13T17:47:05Z","branch":"main","job":"test","run":"4242","run_url":"https://github.com/acme/shop/actions/runs/4242"} -->
//
// A comment is an occurrence when one of its lines matches
// /^<!-- verdict-occurrence (\{.*\}) -->$/ and the group parses as JSON. date
// is UTC in ISO 8601, to the second, and every value is a string, except that
// the occurrence that reopened its record also holds "reopened":true. Any <, >
// or & in a value is written as \u003c, \u003e or \u0026, which JSON.parse
// reads back, so no value can end the HTML comment. Later versions may add
// keys, and these keys keep their meaning.
//
// The run summary is Markdown: a "### Verdict: pass" or "### Verdict: fail"
// heading, then one bullet per reason the build fails and one per flake
// occurrence. An occurrence's bullet names the test as `<classname> <name>`,
// then links the record it was recorded on, or says why it was not recorded.
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, rmSync } from 'node:fs';

const USAGE =
  'usage: node verdict.mjs --results <file> [--rerun <command>] [--summary <file>] [tracker settings] -- <test command>';

// Settings ----------------------------------------------------------------

// One row per flag. A flag left out takes the value `env` reads from the
// environment, which is what GitHub Actions sets, and then `fallback`.
const FLAGS = [
  { flag: '--results' },
  { flag: '--rerun' },
  { flag: '--summary', env: (env) => env.GITHUB_STEP_SUMMARY },
  { flag: '--tracker-url', env: (env) => env.GITHUB_API_URL, fallback: 'https://api.github.com' },
  { flag: '--repo', env: (env) => env.GITHUB_REPOSITORY },
  { flag: '--branch', env: (env) => env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME },
  { flag: '--job', env: (env) => env.GITHUB_JOB },
  { flag: '--run', env: (env) => env.GITHUB_RUN_ID },
  {
    flag: '--run-url',
    env: (env) =>
      env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
        ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
        : undefined,
  },
  { flag: '--flaky-label', fallback: 'flaky-test' },
];

// --tracker-url is settings.trackerUrl.
const key = (flag) => flag.slice(2).replace(/-(.)/g, (_, letter) => letter.toUpperCase());

// { settings } from the command line and environment, or { problem } saying
// what is wrong.
const readSettings = (argv, env) => {
  const split = argv.indexOf('--');
  const flags = split === -1 ? argv : argv.slice(0, split);
  const settings = {
    command: split === -1 ? [] : argv.slice(split + 1),
    token: env.VERDICT_TRACKER_TOKEN || env.GITHUB_TOKEN || undefined,
  };
  for (let i = 0; i < flags.length; i += 2) {
    if (!FLAGS.some((row) => row.flag === flags[i])) return { problem: `unknown argument ${flags[i]}` };
    if (flags[i + 1] === undefined) return { problem: `${flags[i]} needs a value` };
    settings[key(flags[i])] = flags[i + 1];
  }
  for (const row of FLAGS) settings[key(row.flag)] ??= row.env?.(env) || row.fallback;
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

// Runs the attempts and returns the reasons the build fails, and the tests
// with a flake occurrence, which don't fail it.
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
      occurrences.push(testcase);
    } else if (rerun?.outcome === 'failed') {
      buildFailures.push(`Failed on both attempts: ${test}.`);
    } else {
      buildFailures.push(`No result on attempt 2: ${test} failed on attempt 1 and the rerun did not report it.`);
    }
  }
  return { buildFailures, occurrences };
};

// The tracker -------------------------------------------------------------

const TRACKER_TIMEOUT_MS = 30_000;

// A tracker request that failed. Its message completes "Not recorded: ".
class TrackerError extends Error {}

// The GitHub adapter: the tracker operations the script uses, over GitHub's
// REST API.
const githubTracker = ({ trackerUrl, repo, token }) => {
  const issues = `${trackerUrl.replace(/\/+$/, '')}/repos/${repo}/issues`;

  // One request, answered with { data, next }: the parsed JSON and the next
  // page's address, if any. `doing` completes "the tracker refused to ".
  const call = async (doing, method, url, body) => {
    let response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'user-agent': 'verdict.mjs',
          'x-github-api-version': '2022-11-28',
        },
        body: body && JSON.stringify(body),
        signal: AbortSignal.timeout(TRACKER_TIMEOUT_MS),
      });
    } catch (error) {
      const why = error.name === 'TimeoutError' ? `no answer in ${TRACKER_TIMEOUT_MS / 1000}s` : error.cause?.code ?? error.message;
      throw new TrackerError(`the tracker at ${trackerUrl} could not be reached (${why})`);
    }
    if (!response.ok) {
      const { message } = await response.json().catch(() => ({}));
      throw new TrackerError(`the tracker refused to ${doing} (HTTP ${response.status}${message ? ` ${message}` : ''})`);
    }
    const next = response.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
    return { data: await response.json(), next };
  };

  // Every item of a list, following GitHub's pages.
  const callAll = async (doing, url) => {
    const items = [];
    for (let page = url; page; ) {
      const { data, next } = await call(doing, 'GET', page);
      items.push(...data);
      page = next;
    }
    return items;
  };

  const record = (issue) => ({ number: issue.number, title: issue.title, url: issue.html_url, open: issue.state === 'open' });

  return {
    // Every record carrying the flaky label, open or closed.
    listRecords: async (label) =>
      (await callAll('list the flaky-test records', `${issues}?labels=${encodeURIComponent(label)}&state=all&per_page=100`))
        .filter((issue) => !issue.pull_request)
        .map(record),
    createRecord: async ({ title, body, labels }) =>
      record((await call('create the record', 'POST', issues, { title, body, labels })).data),
    reopenRecord: async (target) => {
      await call('reopen the record', 'PATCH', `${issues}/${target.number}`, { state: 'open' });
    },
    // The bodies of every comment on the record, oldest first.
    listComments: async (target) =>
      (await callAll("read the record's comments", `${issues}/${target.number}/comments?per_page=100`)).map(
        (comment) => comment.body,
      ),
    addComment: async (target, body) => {
      await call('comment on the record', 'POST', `${issues}/${target.number}/comments`, { body });
    },
  };
};

// Flake occurrences -------------------------------------------------------

const listOf = (items) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

// Markdown inline code that holds any text, backticks included.
const code = (text) => {
  const fence = '`'.repeat(Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length)) + 1);
  const pad = /^`|`$/.test(text) ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
};

const recordBody = ({ classname, name }) =>
  [
    'The flaky-test record for one test, kept by the verdict script. Each flake occurrence is a comment below.',
    '',
    `- Classname: ${code(classname)}`,
    `- Name: ${code(name)}`,
    '',
  ].join('\n');

// The JSON in a marker escapes <, > and &, so no value can close the HTML
// comment early.
const marker = (data) =>
  `<!-- verdict-occurrence ${JSON.stringify(data).replace(/[<>&]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)} -->`;

const occurrenceComment = (occurrence) =>
  [
    'Flake occurrence: failed on attempt 1 and passed on attempt 2.',
    '',
    `- Date: ${occurrence.date}`,
    `- Branch: ${code(occurrence.branch)}`,
    `- Job: ${code(occurrence.job)}`,
    `- Run: ${occurrence.run_url}`,
    '',
    ...(occurrence.reopened ? ['This occurrence reopened the record.', ''] : []),
    marker(occurrence),
  ].join('\n');

const MARKER = /^<!-- verdict-occurrence (\{.*\}) -->$/m;

// The flake occurrences recorded in these comment bodies, from their markers.
const occurrencesIn = (comments) =>
  comments.flatMap((body) => {
    const found = body?.match(MARKER);
    if (!found) return [];
    try {
      return [JSON.parse(found[1])];
    } catch {
      return [];
    }
  });

// Records each test's flake occurrence on its flaky-test record and returns,
// per test, the sentence the run summary gives about it.
const recordOccurrences = async (settings, tests) => {
  if (tests.length === 0) return [];
  const missing = [
    ...['--repo', '--branch', '--job', '--run', '--run-url'].filter((flag) => !settings[key(flag)]),
    ...(settings.token ? [] : ['a token in VERDICT_TRACKER_TOKEN or GITHUB_TOKEN']),
  ];
  if (missing.length > 0) {
    return tests.map(() => `Not recorded: the tracker settings lack ${listOf(missing)}.`);
  }
  const tracker = githubTracker(settings);
  // Whatever goes wrong while recording, the verdict stands.
  const notRecorded = (error) =>
    error instanceof TrackerError
      ? `Not recorded: ${error.message}.`
      : `Not recorded: the script failed while recording (${error.message}).`;
  let records;
  try {
    records = await tracker.listRecords(settings.flakyLabel);
  } catch (error) {
    return tests.map(() => notRecorded(error));
  }
  const occurrence = {
    date: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    branch: settings.branch,
    job: settings.job,
    run: settings.run,
    run_url: settings.runUrl,
  };
  const said = [];
  for (const testcase of tests) {
    said.push(await recordOne(settings, tracker, records, testcase, occurrence).catch(notRecorded));
  }
  return said;
};

// Records one test's flake occurrence and returns what the summary says of it.
const recordOne = async (settings, tracker, records, testcase, occurrence) => {
  const title = display(testcase);
  let record = records.find((each) => each.title === title);
  if (record) {
    const recorded = occurrencesIn(await tracker.listComments(record));
    if (recorded.some(({ run }) => run === settings.run)) {
      return `Already recorded on [#${record.number}](${record.url}) for this run, so it counts once.`;
    }
  } else {
    record = await tracker.createRecord({
      title,
      body: recordBody(testcase),
      labels: [settings.flakyLabel, 'ready-for-agent'],
    });
  }
  const reopened = !record.open;
  if (reopened) await tracker.reopenRecord(record);
  await tracker.addComment(record, occurrenceComment({ ...occurrence, ...(reopened && { reopened }) }));
  return `Recorded on [#${record.number}](${record.url})${reopened ? ' after reopening it' : ''}.`;
};

// Main --------------------------------------------------------------------

const { settings, problem } = readSettings(process.argv.slice(2), process.env);
if (problem) {
  process.stderr.write(`verdict.mjs: ${problem}\n${USAGE}\n`);
  process.exit(2);
}

const { buildFailures, occurrences } = judge(settings);
const recorded = await recordOccurrences(settings, occurrences);
const pass = buildFailures.length === 0;
const summary = [
  `### Verdict: ${pass ? 'pass' : 'fail'}`,
  '',
  ...buildFailures.map((line) => `- ${line}`),
  ...occurrences.map(
    (testcase, i) =>
      `- Flake occurrence: \`${display(testcase)}\` failed on attempt 1 and passed on attempt 2. ${recorded[i]}`,
  ),
  '',
].join('\n');

process.stdout.write(`\n${summary}`);
if (settings.summary) appendFileSync(settings.summary, summary);
process.exitCode = pass ? 0 : 1;

#!/usr/bin/env node
// verdict.mjs version 0.4.0
//
// The verdict script. It runs a CI job's test command, reruns the failures
// once, records each flake occurrence on the test's flaky-test record in the
// issue tracker, quarantines a test whose record has enough of them, and
// decides whether the build passes, ignoring failures of quarantined tests.
// All it reads from the test framework is the exit code and the JUnit XML
// results file. It needs only Node, with no dependencies.
//
//   node verdict.mjs --results <file> [--rerun <command>] [--summary <file>] [tracker settings] [quarantine settings] -- <test command>
//
//   --results  The JUnit XML file the test command writes. Required. It is
//              deleted before each attempt, so a stale file is never read.
//   --rerun    The rerun-failures command: a shell command that reruns only
//              the failed tests and writes the same results file, such as
//              "pytest --lf --junitxml=results.xml". Without it, attempt 2
//              runs the whole test command again.
//   --summary  A file to append the run summary to. Defaults to
//              $GITHUB_STEP_SUMMARY. The summary is printed to stdout either
//              way, which on GitLab CI, with no step summary, is the job log.
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
//      out of attempt 2 fails it, unless the test is quarantined.
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
// GitHub's REST API, or a GitLab project's issues, reached through GitLab's
// REST API v4. On GitHub Actions and GitLab CI the job's environment gives
// every setting a default except a token that can write issues, and a flag
// overrides its default.
//
//   --tracker      github or gitlab. Defaults to $VERDICT_TRACKER, then
//                  gitlab when $GITLAB_CI is set, then github.
//   --tracker-url  The API's base address. Defaults to $GITHUB_API_URL, then
//                  https://api.github.com. On GitLab, to $CI_API_V4_URL, then
//                  https://gitlab.com/api/v4.
//   --repo         The repo whose issues hold the records, as owner/name.
//                  Defaults to $GITHUB_REPOSITORY. On GitLab, the project's
//                  path, such as acme/web/shop, or its numeric ID, defaulting
//                  to $CI_PROJECT_PATH.
//   --branch       The branch the run tests. Defaults to $GITHUB_HEAD_REF, a
//                  PR's own branch, then $GITHUB_REF_NAME. On GitLab, to
//                  $CI_MERGE_REQUEST_SOURCE_BRANCH_NAME, a merge request's own
//                  branch, then $CI_COMMIT_REF_NAME.
//   --job          The job's name. Defaults to $GITHUB_JOB, the job's id,
//                  which every leg of a matrix shares. Pass a name that holds
//                  the matrix values, such as "test (${{ matrix.os }})", so
//                  occurrences tell the legs apart. On GitLab, to
//                  $CI_JOB_NAME, which holds a parallel:matrix job's values.
//   --run          The run's id, the same in every job and every attempt of
//                  the run. Defaults to $GITHUB_RUN_ID. On GitLab the run is
//                  the pipeline, and it defaults to $CI_PIPELINE_ID.
//   --run-url      The run's link. Defaults to
//                  $GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID.
//                  On GitLab, to $CI_PIPELINE_URL.
//   --flaky-label  The label every flaky-test record carries. Defaults to
//                  flaky-test.
//
// The token never comes from a flag, which keeps it out of logs and process
// lists. It must be able to read and write issues.
//
// On GitHub it comes from $VERDICT_TRACKER_TOKEN, then $GITHUB_TOKEN. On
// GitHub Actions that is the job's own token with
// `permissions: issues: write`, passed as
// `env: GITHUB_TOKEN: ${{ github.token }}`.
//
// On GitLab it comes from $VERDICT_TRACKER_TOKEN, sent in the PRIVATE-TOKEN
// header. Use a project, group or personal access token with the api scope,
// whose user has at least the Planner role in the project, or Reporter on a
// GitLab that predates Planner, since labelling and reopening another
// member's issue take one of those. Store it as a masked CI/CD variable that
// isn't protected, because a protected variable reaches only pipelines on
// protected branches and tags. Without it the token is the job's own
// $CI_JOB_TOKEN, sent in the JOB-TOKEN header, which can't write issues, so
// every occurrence goes unrecorded. It reads the quarantine list only when
// the project grants its job token the fine-grained Read work items
// permission.
//
// While a setting is missing, every occurrence goes unrecorded and the run
// summary names what is missing. Without --repo or a token, the quarantine
// list isn't read either.
//
// Quarantine settings. The CI doc records the same values, and the workflow
// passes them here.
//
//   --quarantine-label  The label that quarantines a flaky-test record.
//                       Defaults to quarantined.
//   --quarantine-cap    The most tests that may be quarantined at once: a
//                       whole percentage of the suite, such as 5%, or a whole
//                       number of tests, such as 12. Defaults to 5%.
//
// Recording a flake occurrence:
//   1. Find the test's record: the issue carrying the flaky label whose title
//      is exactly the test's identity as `<classname> <name>`. The script
//      lists every issue with the flaky label, open and closed, once per job,
//      and compares titles itself. Search matches loosely, and GitHub's lags
//      behind new issues, so a matrix job could miss a record created seconds
//      earlier by another leg of the run.
//   2. No record: create one with that title, labelled with the flaky label
//      and ready-for-agent.
//   3. A record that already holds an occurrence with this --run: leave it.
//      Every job of a run runs the script, and the run is one occurrence.
//   4. A closed record: take off the quarantine label if it kept one, then
//      reopen it.
//   5. Add the occurrence as a comment on the record, which GitLab calls a
//      note.
//   6. Quarantine the test if this occurrence brings it to quarantine.
//
// Quarantine. A test is quarantined while its record is open and carries the
// quarantine label, so closing the record ends it. The script reads the
// quarantine list from the same listing of records, and a quarantined test
// that failed attempt 1 and didn't pass attempt 2 doesn't fail the build.
// The script never takes the label off an open record; the scheduled
// flaky-test agent removes it when quarantine expires.
//
// A record enters quarantine when, after an occurrence is recorded, its
// occurrences that count number at least 3 and span at least 2 branches, and
// the cap allows one more. The occurrences that count are read from the
// record's markers, and are:
//   - those from the last one holding "reopened":true on, that one included,
//     so a fixed test that flakes again starts a new count;
//   - of those, the ones dated no more than 30 days before this run;
//   - with each run counted once, should two of its jobs both record it.
// A record that was closed while quarantined keeps its label. The occurrence
// that reopens it takes the label off first, so the record leaves quarantine
// and its count starts again at 1.
//
// The cap. The quarantined tests are the open records carrying the quarantine
// label, across the whole repo, plus any this job quarantines. A whole-number
// cap is the most there may be. A percentage cap is a share of the suite,
// which is every test identity in attempt 1's results file, skipped ones
// included, rounded down: at 5%, a suite of 39 tests allows 1, of 40 allows 2,
// and of fewer than 20 allows none. Each job sizes the suite from its own
// results file, so in a repo whose jobs run different tests, or shards of one
// suite, a percentage cap is stricter than it reads; give a whole number
// there. Jobs of one run read the list at the same time, so each can
// quarantine a test and together pass the cap by one per extra job.
//
// Tracker requests. A job sends none when no test failed attempt 1. Otherwise
// it sends one listing request per 100 records, which also serves the
// quarantine list.
// Then, per occurrence: for a new record, a create and a comment; for an
// existing one, one request per 100 of its comments, then, if it was closed, a
// label removal when it kept the quarantine label and a reopen, then a
// comment; and one label request when the occurrence quarantines the test. A
// test that failed both attempts costs nothing beyond the listing.
//
// A tracker that can't be reached never lets a failure through: nothing is
// quarantined, so a quarantined test that fails both attempts fails the build,
// and the run summary says the quarantine list was not read, and why. A
// tracker that refuses writes but answers the listing keeps quarantine
// holding, as GitHub does for a fork PR's read-only token, and GitLab for a
// job token granted Read work items. Either way the run summary says an
// occurrence was not recorded, or a test not quarantined, and why.
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
// heading; then, when the cap kept a test out of quarantine, a "> [!WARNING]"
// block saying so for each such test; then one bullet per reason the build
// fails, one saying the quarantine list was not read when that left a failure
// standing, one per failure ignored because its test is quarantined, and one
// per flake occurrence. An occurrence's bullet names the test as
// `<classname> <name>`, then links the record it was recorded on, or says why
// it was not recorded. A recorded occurrence's bullet then gives its count
// toward quarantine, such as "Quarantine count: 2 occurrences on 1 branch in
// 30 days (it takes 3 on at least 2).", and ends "Now quarantined",
// "Already quarantined" or "Not quarantined" when one of those applies.
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, rmSync } from 'node:fs';

const USAGE =
  'usage: node verdict.mjs --results <file> [--rerun <command>] [--summary <file>] [tracker settings] [quarantine settings] -- <test command>';

// Settings ----------------------------------------------------------------

const FLAGS = [
  '--tracker',
  '--results',
  '--rerun',
  '--summary',
  '--tracker-url',
  '--repo',
  '--branch',
  '--job',
  '--run',
  '--run-url',
  '--flaky-label',
  '--quarantine-label',
  '--quarantine-cap',
];

// A flag left out takes its default: the tracker's own, from TRACKERS, or
// else one of these. Each is a function of the environment, which GitHub
// Actions or GitLab CI sets.
const DEFAULTS = {
  '--tracker': (env) => env.VERDICT_TRACKER || (env.GITLAB_CI ? 'gitlab' : 'github'),
  '--summary': (env) => env.GITHUB_STEP_SUMMARY,
  '--flaky-label': () => 'flaky-test',
  '--quarantine-label': () => 'quarantined',
  '--quarantine-cap': () => '5%',
};

// The setting a flag gives: --tracker-url gives settings.trackerUrl.
const settingName = (flag) => flag.slice(2).replace(/-(.)/g, (_, letter) => letter.toUpperCase());

// { settings } from the command line and environment, or { problem } saying
// what is wrong. settings.tracker names a TRACKERS entry, and settings.token,
// when a variable holds one, is { variable, headers }.
const readSettings = (argv, env) => {
  const split = argv.indexOf('--');
  const flags = split === -1 ? argv : argv.slice(0, split);
  const given = {};
  for (let i = 0; i < flags.length; i += 2) {
    if (!FLAGS.includes(flags[i])) return { problem: `unknown argument ${flags[i]}` };
    if (flags[i + 1] === undefined) return { problem: `${flags[i]} needs a value` };
    given[flags[i]] = flags[i + 1];
  }
  const name = given['--tracker'] ?? DEFAULTS['--tracker'](env);
  if (!Object.hasOwn(TRACKERS, name)) return { problem: `--tracker takes github or gitlab, not "${name}"` };
  const tracker = TRACKERS[name];

  const settings = { command: split === -1 ? [] : argv.slice(split + 1) };
  for (const flag of FLAGS) {
    settings[settingName(flag)] = given[flag] ?? (tracker.defaults[flag] ?? DEFAULTS[flag])?.(env);
  }
  const variable = Object.keys(tracker.tokens).find((each) => env[each]);
  settings.token = variable && { variable, headers: tracker.tokens[variable](env[variable]) };

  if (!settings.results) return { problem: 'no --results file' };
  if (settings.command.length === 0) return { problem: 'no test command after --' };
  if (!/^\d+%?$/.test(settings.quarantineCap)) {
    return { problem: `--quarantine-cap takes a whole percentage of the suite, such as 5%, or a whole number of tests, not "${settings.quarantineCap}"` };
  }
  return { settings };
};

// JUnit XML ---------------------------------------------------------------

const XML_TOKEN =
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
  for (const [, attribute, double, single] of text.matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    found[attribute] = decode(double ?? single);
  }
  return found;
};

// A test's identity: its classname and name, verbatim. `key` tells any two
// identities apart. `title` names the test in the run summary and titles its
// flaky-test record, `<classname> <name>`.
const identityOf = (classname, name) => ({
  classname,
  name,
  key: JSON.stringify([classname, name]),
  title: classname ? `${classname} ${name}` : name,
});

// Every testcase in the file as { identity, outcome }, where outcome is
// failed (it holds a failure or error element), skipped or passed. Null when
// the file is not a whole JUnit XML document, such as one cut off mid-write.
const parseJUnit = (xml) => {
  const testcases = [];
  const open = [];
  let root = null;
  let current = null;
  XML_TOKEN.lastIndex = 0;
  for (let token; (token = XML_TOKEN.exec(xml)); ) {
    const [text, closing, opening, attrs, selfClosing] = token;
    if (opening) {
      if (open.length === 0) {
        if (root) return null;
        root = opening;
      }
      if (opening === 'testcase') {
        const { classname = '', name = '' } = attributes(attrs);
        current = { identity: identityOf(classname, name), outcome: 'passed', depth: open.length };
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

// One identity can own several testcases in a file: pytest writes one per
// retry and a second for a teardown error, and Vitest gives every case of a
// test.each with no placeholder in its title the same name. The identity has
// failed if any of them failed, else passed if any of them ran.
const RANK = { failed: 2, passed: 1, skipped: 0 };

// The file's testcases by identity key, or null when there is no readable
// file.
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
    const seen = byIdentity.get(testcase.identity.key);
    if (!seen || RANK[testcase.outcome] > RANK[seen.outcome]) byIdentity.set(testcase.identity.key, testcase);
  }
  return byIdentity;
};

const failedIn = (results) => [...results.values()].filter((testcase) => testcase.outcome === 'failed');

// Attempts ----------------------------------------------------------------

// Runs one attempt of `command`: the test command, a list of arguments run
// without a shell, or the rerun command, a string the shell runs. Each
// attempt starts with no results file, so a run that writes none can't be
// read as the one before it.
const runAttempt = (results, command) => {
  rmSync(results, { force: true });
  return typeof command === 'string'
    ? spawnSync(command, { stdio: 'inherit', shell: true })
    : spawnSync(command[0], command.slice(1), { stdio: 'inherit' });
};

const exitOf = ({ status, signal, error }) => {
  if (error) return `could not start (${error.message})`;
  if (signal) return `was stopped by ${signal}`;
  return `exited ${status}`;
};

// The verdict -------------------------------------------------------------

// Runs the attempts and returns the reasons the build fails; the tests that
// failed attempt 1 and didn't pass attempt 2, each as { identity, failure },
// the sentence saying so, which fail the build unless quarantined; and the
// identities of the tests with a flake occurrence, which don't fail it. Also
// the size of the suite: how many tests attempt 1's results file holds.
const judge = (settings) => {
  const buildFailures = [];
  const stillFailing = [];
  const occurrences = [];

  const attempt1 = runAttempt(settings.results, settings.command);
  const results1 = readResults(settings.results);
  if (!results1) {
    buildFailures.push(
      `Attempt 1 wrote no readable results file at \`${settings.results}\`, and the test command ${exitOf(attempt1)}.`,
    );
    return { buildFailures, stillFailing, occurrences, suite: 0 };
  }

  const suite = results1.size;
  const failures = failedIn(results1);
  if (failures.length === 0) {
    if (attempt1.status !== 0) {
      buildFailures.push(`The test command ${exitOf(attempt1)} with no failed test in the results file.`);
    }
    return { buildFailures, stillFailing, occurrences, suite };
  }

  const attempt2 = runAttempt(settings.results, settings.rerun || settings.command);
  const results2 = readResults(settings.results);
  if (!results2) {
    buildFailures.push(
      `Attempt 2 wrote no readable results file at \`${settings.results}\`, and the rerun ${exitOf(attempt2)}.`,
    );
  } else if (attempt2.status !== 0 && failedIn(results2).length === 0) {
    buildFailures.push(`The rerun ${exitOf(attempt2)} with no failed test in the results file.`);
  }

  for (const { identity } of failures) {
    const rerun = results2?.get(identity.key);
    const test = `\`${identity.title}\``;
    if (rerun?.outcome === 'passed') {
      occurrences.push(identity);
    } else if (rerun?.outcome === 'failed') {
      stillFailing.push({ identity, failure: `Failed on both attempts: ${test}.` });
    } else {
      stillFailing.push({
        identity,
        failure: `No result on attempt 2: ${test} failed on attempt 1 and the rerun did not report it.`,
      });
    }
  }
  return { buildFailures, stillFailing, occurrences, suite };
};

// The tracker -------------------------------------------------------------

const TRACKER_TIMEOUT_MS = 30_000;

// A tracker request that failed. Its message completes "Not recorded: " and
// "Quarantine not read: ".
class TrackerError extends Error {}

// A tracker's REST API, sending these headers with every request. `call`
// sends one request and answers { data, next }: the parsed JSON and the next
// page's address from the Link header, if any. `callAll` answers every item
// of a list, following its pages. `doing` completes "the tracker refused to ".
const restApi = (trackerUrl, headers) => {
  const call = async (doing, method, url, body) => {
    let response;
    try {
      response = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json', 'user-agent': 'verdict.mjs', ...headers },
        body: body && JSON.stringify(body),
        signal: AbortSignal.timeout(TRACKER_TIMEOUT_MS),
      });
    } catch (error) {
      const why = error.name === 'TimeoutError' ? `no answer in ${TRACKER_TIMEOUT_MS / 1000}s` : error.cause?.code ?? error.message;
      throw new TrackerError(`the tracker at ${trackerUrl} could not be reached (${why})`);
    }
    if (!response.ok) {
      const reason = await reasonOf(response);
      throw new TrackerError(`the tracker refused to ${doing} (HTTP ${response.status}${reason ? ` ${reason}` : ''})`);
    }
    const next = response.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
    return { data: await response.json(), next };
  };

  const callAll = async (doing, url) => {
    const items = [];
    for (let page = url; page; ) {
      const { data, next } = await call(doing, 'GET', page);
      items.push(...data);
      page = next;
    }
    return items;
  };

  return { call, callAll };
};

// The reason an error response gives: GitHub's `message`, or GitLab's
// `message` or `error`, without the status GitLab repeats at its start.
const reasonOf = async (response) => {
  const { message, error } = (await response.json().catch(() => null)) ?? {};
  const reason = message ?? error;
  if (reason === undefined || reason === null) return '';
  const text = typeof reason === 'string' ? reason : JSON.stringify(reason);
  return text.replace(new RegExp(`^${response.status}\\s+`), '');
};

// The GitHub adapter: the tracker operations the script uses, over GitHub's
// REST API. A record is { number, title, url, open, labels }.
const githubTracker = ({ trackerUrl, repo, token }) => {
  const issues = `${trackerUrl.replace(/\/+$/, '')}/repos/${repo}/issues`;
  const { call, callAll } = restApi(trackerUrl, {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    ...token.headers,
  });

  const record = (issue) => ({
    number: issue.number,
    title: issue.title,
    url: issue.html_url,
    open: issue.state === 'open',
    labels: (issue.labels ?? []).map((label) => label.name ?? label),
  });

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
    addLabel: async (target, label) => {
      await call('label the record', 'POST', `${issues}/${target.number}/labels`, { labels: [label] });
    },
    removeLabel: async (target, label) => {
      await call('unlabel the record', 'DELETE', `${issues}/${target.number}/labels/${encodeURIComponent(label)}`);
    },
  };
};

// The GitLab adapter: the same operations over GitLab's REST API v4. A
// record's number is its issue's iid, and a comment is a note.
const gitlabTracker = ({ trackerUrl, repo, token }) => {
  const issues = `${trackerUrl.replace(/\/+$/, '')}/projects/${encodeURIComponent(repo)}/issues`;
  const { call, callAll } = restApi(trackerUrl, token.headers);

  const record = (issue) => ({
    number: issue.iid,
    title: issue.title,
    url: issue.web_url,
    open: issue.state === 'opened',
    labels: issue.labels ?? [],
  });

  return {
    listRecords: async (label) =>
      (await callAll('list the flaky-test records', `${issues}?labels=${encodeURIComponent(label)}&state=all&per_page=100`)).map(
        record,
      ),
    // GitLab takes label names comma-separated, and no label name holds a comma.
    createRecord: async ({ title, body, labels }) =>
      record((await call('create the record', 'POST', issues, { title, description: body, labels: labels.join(',') })).data),
    reopenRecord: async (target) => {
      await call('reopen the record', 'PUT', `${issues}/${target.number}`, { state_event: 'reopen' });
    },
    // GitLab lists notes newest first unless asked otherwise. Its own system
    // notes, such as "reopened", come too, and hold no occurrence.
    listComments: async (target) =>
      (
        await callAll("read the record's comments", `${issues}/${target.number}/notes?sort=asc&order_by=created_at&per_page=100`)
      ).map((note) => note.body),
    addComment: async (target, body) => {
      await call('comment on the record', 'POST', `${issues}/${target.number}/notes`, { body });
    },
    addLabel: async (target, label) => {
      await call('label the record', 'PUT', `${issues}/${target.number}`, { add_labels: label });
    },
    removeLabel: async (target, label) => {
      await call('unlabel the record', 'PUT', `${issues}/${target.number}`, { remove_labels: label });
    },
  };
};

const bearer = (token) => ({ authorization: `Bearer ${token}` });

// Each tracker the script supports: the defaults of the flags whose default
// depends on it, the variables its token is read from, the first one set
// winning, with the headers each one is sent in, and its adapter.
const TRACKERS = {
  github: {
    defaults: {
      '--tracker-url': (env) => env.GITHUB_API_URL || 'https://api.github.com',
      '--repo': (env) => env.GITHUB_REPOSITORY,
      '--branch': (env) => env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME,
      '--job': (env) => env.GITHUB_JOB,
      '--run': (env) => env.GITHUB_RUN_ID,
      '--run-url': (env) =>
        env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
          ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
          : undefined,
    },
    tokens: { VERDICT_TRACKER_TOKEN: bearer, GITHUB_TOKEN: bearer },
    adapter: githubTracker,
  },
  gitlab: {
    defaults: {
      '--tracker-url': (env) => env.CI_API_V4_URL || 'https://gitlab.com/api/v4',
      '--repo': (env) => env.CI_PROJECT_PATH,
      '--branch': (env) => env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME || env.CI_COMMIT_REF_NAME,
      '--job': (env) => env.CI_JOB_NAME,
      '--run': (env) => env.CI_PIPELINE_ID,
      '--run-url': (env) => env.CI_PIPELINE_URL,
    },
    tokens: {
      VERDICT_TRACKER_TOKEN: (token) => ({ 'private-token': token }),
      CI_JOB_TOKEN: (token) => ({ 'job-token': token }),
    },
    adapter: gitlabTracker,
  },
};

// The settings named by these flags, and the token, that are missing.
const lacking = (settings, flags) => [
  ...flags.filter((flag) => !settings[settingName(flag)]),
  ...(settings.token ? [] : [`a token in ${Object.keys(TRACKERS[settings.tracker].tokens).join(' or ')}`]),
];

// What went wrong with the tracker, as a phrase that completes "Not recorded: ".
const trackerProblem = (error, doing) =>
  error instanceof TrackerError ? error.message : `the script failed while ${doing} (${error.message})`;

// The job's flaky-test records: every record carrying the flaky label, open
// or closed, and the tracker that holds them, read once per job. One listing
// serves both the quarantine list and recording. When they can't be read,
// `problem` says why, and the job has no records.
const flakyRecords = (settings, { tracker, list = [], problem }) => {
  const quarantined = (record) => record.open && record.labels.includes(settings.quarantineLabel);
  const matching = (identity) => list.filter((record) => record.title === identity.title);
  return {
    tracker,
    problem,
    // A record is quarantined while it is open and carries the quarantine label.
    quarantined,
    quarantinedCount: list.filter(quarantined).length,
    // The test's record, if it has one.
    of: (identity) => matching(identity)[0],
    // The test's quarantined record, if it has one.
    quarantinedOf: (identity) => matching(identity).find(quarantined),
  };
};

const readRecords = async (settings) => {
  const missing = lacking(settings, ['--repo']);
  if (missing.length > 0) return flakyRecords(settings, { problem: `the tracker settings lack ${listOf(missing)}` });
  const tracker = TRACKERS[settings.tracker].adapter(settings);
  try {
    return flakyRecords(settings, { tracker, list: await tracker.listRecords(settings.flakyLabel) });
  } catch (error) {
    return flakyRecords(settings, { problem: trackerProblem(error, 'reading the records') });
  }
};

// Flake occurrences -------------------------------------------------------

const listOf = (items) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

const plural = (count, word, words = `${word}s`) => `${count} ${count === 1 ? word : words}`;

// Markdown inline code that holds any text, backticks included.
const inlineCode = (text) => {
  const fence = '`'.repeat(Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length)) + 1);
  const pad = /^`|`$/.test(text) ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
};

const recordBody = ({ classname, name }) =>
  [
    'The flaky-test record for one test, kept by the verdict script. Each flake occurrence is a comment below.',
    '',
    `- Classname: ${inlineCode(classname)}`,
    `- Name: ${inlineCode(name)}`,
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
    `- Branch: ${inlineCode(occurrence.branch)}`,
    `- Job: ${inlineCode(occurrence.job)}`,
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

// Quarantine --------------------------------------------------------------

const QUARANTINE_OCCURRENCES = 3;
const QUARANTINE_BRANCHES = 2;
const QUARANTINE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// How many of a record's occurrences, oldest first, count toward quarantine
// at the time `now`, and on how many branches, as { occurrences, branches }.
// The count starts again at the occurrence that last reopened the record, and
// a run counts once, even when two of its jobs raced to record it.
const towardQuarantine = (recorded, now) => {
  const sinceReopened = recorded.slice(Math.max(0, recorded.findLastIndex(({ reopened }) => reopened === true)));
  const counting = sinceReopened.filter(({ date }) => now - Date.parse(date) <= QUARANTINE_DAYS * DAY_MS);
  return {
    occurrences: new Set(counting.map(({ run }) => run)).size,
    branches: new Set(counting.map(({ branch }) => branch)).size,
  };
};

const qualifies = ({ occurrences, branches }) =>
  occurrences >= QUARANTINE_OCCURRENCES && branches >= QUARANTINE_BRANCHES;

const countSentence = ({ occurrences, branches }) =>
  `Quarantine count: ${plural(occurrences, 'occurrence')} on ${plural(branches, 'branch', 'branches')} in ${QUARANTINE_DAYS} days (it takes ${QUARANTINE_OCCURRENCES} on at least ${QUARANTINE_BRANCHES}).`;

// The quarantine cap for a suite of `size` tests: the most tests that may be
// quarantined at once, and the words that explain that number. A percentage
// rounds down, so the quarantined share never passes it.
const capOf = (cap, size) => {
  const percent = cap.match(/^(\d+)%$/);
  if (!percent) return { allowed: Number(cap), explained: cap };
  const allowed = Math.floor((Number(percent[1]) * size) / 100);
  return { allowed, explained: `${cap} of the ${plural(size, 'test')} in the results file, which is ${allowed}` };
};

// Recording ---------------------------------------------------------------

// Records each test's flake occurrence on its flaky-test record and returns,
// per test, the sentence the run summary gives about it. `quarantine` holds
// the cap's { allowed, explained }, the count of quarantined records, which
// grows as this job quarantines more, and the cap warnings, as `capped`.
const recordOccurrences = async (settings, records, identities, quarantine) => {
  if (identities.length === 0) return [];
  const missing = lacking(settings, ['--repo', '--branch', '--job', '--run', '--run-url']);
  if (missing.length > 0) {
    return identities.map(() => `Not recorded: the tracker settings lack ${listOf(missing)}.`);
  }
  if (records.problem) return identities.map(() => `Not recorded: ${records.problem}.`);
  const { tracker } = records;
  const label = settings.quarantineLabel;
  const occurrence = {
    date: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    branch: settings.branch,
    job: settings.job,
    run: settings.run,
    run_url: settings.runUrl,
  };
  const now = Date.parse(occurrence.date);

  // Records one test's flake occurrence and returns what the summary says of
  // it. When the occurrence brings the record to quarantine, it applies the
  // quarantine label if the cap allows, and adds to quarantine.capped if not.
  const recordOne = async (identity) => {
    let record = records.of(identity);
    let recorded = [];
    if (record) {
      recorded = occurrencesIn(await tracker.listComments(record));
      if (recorded.some(({ run }) => run === settings.run)) {
        return `Already recorded on [#${record.number}](${record.url}) for this run, so it counts once. ${countSentence(towardQuarantine(recorded, now))}`;
      }
    } else {
      record = await tracker.createRecord({
        title: identity.title,
        body: recordBody(identity),
        labels: [settings.flakyLabel, 'ready-for-agent'],
      });
    }
    const reopened = !record.open;
    // A closed record isn't quarantined, so a label it kept would quarantine
    // the reopened record on one occurrence. The label comes off before the
    // reopen, so a refusal between the two can't leave it quarantined.
    const unquarantined = reopened && record.labels.includes(label);
    if (unquarantined) await tracker.removeLabel(record, label);
    if (reopened) await tracker.reopenRecord(record);
    const added = { ...occurrence, ...(reopened && { reopened }) };
    await tracker.addComment(record, occurrenceComment(added));
    const count = towardQuarantine([...recorded, added], now);
    const labelCode = inlineCode(label);
    const said = [
      `Recorded on [#${record.number}](${record.url})${reopened ? ' after reopening it' : ''}${
        unquarantined ? ` and took off its ${labelCode} label, left from before it closed` : ''
      }.`,
      countSentence(count),
    ];
    if (records.quarantined(record)) {
      said.push('Already quarantined.');
    } else if (qualifies(count) && quarantine.count < quarantine.allowed) {
      try {
        await tracker.addLabel(record, label);
        quarantine.count += 1;
        said.push(`Now quarantined: the record carries the ${labelCode} label, so the test's failures no longer fail the build.`);
      } catch (error) {
        said.push(`Not quarantined: ${trackerProblem(error, 'quarantining')}.`);
      }
    } else if (qualifies(count)) {
      quarantine.capped.push(
        `The quarantine cap kept \`${identity.title}\` ([#${record.number}](${record.url})) out of quarantine: ${plural(quarantine.count, 'test is', 'tests are')} already quarantined, and the cap allows ${quarantine.explained}. Its failures still fail the build until a quarantined test is fixed or the cap is raised.`,
      );
      said.push('Not quarantined: the quarantine cap is reached, as the warning above says.');
    }
    return said.join(' ');
  };

  const notRecorded = (error) => `Not recorded: ${trackerProblem(error, 'recording')}.`;
  const said = [];
  for (const identity of identities) said.push(await recordOne(identity).catch(notRecorded));
  return said;
};

// Main --------------------------------------------------------------------

const { settings, problem } = readSettings(process.argv.slice(2), process.env);
if (problem) {
  process.stderr.write(`verdict.mjs: ${problem}\n${USAGE}\n`);
  process.exit(2);
}

const { buildFailures, stillFailing, occurrences, suite } = judge(settings);
const records =
  stillFailing.length > 0 || occurrences.length > 0 ? await readRecords(settings) : flakyRecords(settings, {});
const ignored = [];
for (const { identity, failure } of stillFailing) {
  const record = records.quarantinedOf(identity);
  if (record) ignored.push(`${failure} Ignored, because its record [#${record.number}](${record.url}) is quarantined.`);
  else buildFailures.push(failure);
}
const unread =
  stillFailing.length > 0 && records.problem
    ? [`Quarantine not read: ${records.problem}, so no test is treated as quarantined.`]
    : [];
const quarantine = { ...capOf(settings.quarantineCap, suite), count: records.quarantinedCount, capped: [] };
const recorded = await recordOccurrences(settings, records, occurrences, quarantine);
const pass = buildFailures.length === 0;
const summary = [
  `### Verdict: ${pass ? 'pass' : 'fail'}`,
  '',
  ...(quarantine.capped.length > 0
    ? ['> [!WARNING]', ...quarantine.capped.flatMap((line, i) => [...(i > 0 ? ['>'] : []), `> ${line}`]), '']
    : []),
  ...[...buildFailures, ...unread, ...ignored].map((line) => `- ${line}`),
  ...occurrences.map(
    (identity, i) => `- Flake occurrence: \`${identity.title}\` failed on attempt 1 and passed on attempt 2. ${recorded[i]}`,
  ),
  '',
].join('\n');

process.stdout.write(`\n${summary}`);
if (settings.summary) appendFileSync(settings.summary, summary);
process.exitCode = pass ? 0 : 1;

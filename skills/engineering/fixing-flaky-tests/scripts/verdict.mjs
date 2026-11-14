#!/usr/bin/env node
// verdict.mjs version 0.6.0
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
//      out of attempt 2 fails it, unless the test is quarantined. A test that
//      passed attempt 1 and failed attempt 2, as a whole-command rerun can
//      show, changes neither, and the run summary names it.
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
//   --tracker-user The user the token posts as. Only the occurrences that
//                  user wrote count, since anyone who can comment on a record
//                  can write an occurrence's marker. Defaults to the user the
//                  tracker's /user endpoint gives for the token: its login on
//                  GitHub, its username on GitLab. GitHub refuses that
//                  endpoint to a GitHub App's installation token, so there it
//                  defaults to github-actions[bot], the user a job's own
//                  $GITHUB_TOKEN posts as. For another GitHub App's token,
//                  pass the app's bot user, such as my-app[bot].
//
// The token never comes from a flag, which keeps it out of logs and process
// lists. It must be able to read and write issues. The test command and the
// rerun command run without $VERDICT_TRACKER_TOKEN and the variable the token
// came from, such as $GITHUB_TOKEN, so no test can write to the tracker with
// it.
//
//   --keep-token   A variable to leave in the environment of both commands
//                  after all, for a suite whose own tests need it, such as
//                  GITHUB_TOKEN.
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
//   1. Find the test's record: the issue carrying the flaky label whose body
//      gives the test's classname and name, or, when its body gives none, as
//      in a record a person wrote, whose title is the one step 2 gives the
//      test. Two identities can share a title, such as "a b" plus "c" and "a"
//      plus "b c", and the body tells their records apart. The script lists
//      every issue with the flaky label, open and closed, once per job, and
//      compares them itself. Search matches loosely, and GitHub's lags behind
//      new issues, so a matrix job could miss a record created seconds
//      earlier by another leg of the run.
//   2. No record: create one, labelled with the flaky label and
//      ready-for-agent. Its title is the test's identity as
//      `<classname> <name>`, exactly as the results file gives it, when the
//      tracker keeps that as it is: no longer than its limit, 256 characters
//      on GitHub and 255 on GitLab, with no whitespace at either end, none
//      but plain spaces inside, and no control character. Otherwise the title
//      is a stand-in that stays the same from run to run: the identity with
//      each run of whitespace and control characters made one space, cut to
//      fit, then "… [", the first 12 hex digits of the SHA-256 of the JSON
//      array [classname, name], and "]". Its body gives the identity in two
//      lines, "- Classname: " and "- Name: ", each followed by the value as
//      Markdown inline code, which reads back exactly by CommonMark's rules,
//      unless the value holds a line break.
//   3. An open record: read its history, when it last closed and when the
//      quarantine label last went on it.
//   4. A record that already holds an occurrence with this --run: leave it.
//      Every job of a run runs the script, and the run is one occurrence.
//   5. A closed record: take off the quarantine label if it kept one, then
//      reopen it. An open record: take off a quarantine label left from
//      before it last closed.
//   6. Add the occurrence as a comment on the record, which GitLab calls a
//      note.
//   7. Quarantine the test if this occurrence brings it to quarantine.
//
// Quarantine. A test is quarantined while its record is open and carries the
// quarantine label, put on since the record last closed, so closing the
// record ends it. A label left from before a close quarantines nothing. A
// record that was closed while quarantined keeps its label, and stays out of
// quarantine whether the script reopens it, taking the label off first, or a
// person does, leaving it on.
//
// The script reads the quarantine list from the same listing of records. A
// quarantined test that failed attempt 1 and didn't pass attempt 2 doesn't
// fail the build, once the record's history shows the label went on after the
// record last closed. When the history can't be read, as with a GitLab job
// token, the label stands as the listing shows it, and the run summary says
// so. The script takes a label off an open record only when it is left from
// before a close and the test has a flake occurrence. The scheduled
// flaky-test agent removes it when quarantine expires, and removes a label
// left from before a close on its next run. Until then, such a label counts
// toward the cap.
//
// A record enters quarantine when, after an occurrence is recorded, its
// occurrences that count number at least 3 and span at least 2 branches, and
// the cap allows one more. The occurrences that count are read from the
// markers on the record that the user the script posts as wrote, and are:
//   - those since the record was last reopened, by the script or a person:
//     dated after it last closed, and from the last one holding
//     "reopened":true on, that one included, so a fixed test starts a new
//     count at its next flake occurrence;
//   - of those, the ones dated no more than 30 days before this run;
//   - with each run counted once, should two of its jobs both record it.
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
//
// Reading an open record's history takes one request per 100 of its events
// on GitHub. On GitLab it takes one per 100 of its state events, and one per
// 100 of its label events when the record carries the quarantine label and
// has closed before.
//
// Then, unless --tracker-user gives it, one request for the user the token
// posts as. Per occurrence: for a new record, a create and a comment. For an
// existing one, one request per 100 of its comments, its history when it is
// open, a label removal when it kept the quarantine label from before a
// close, a reopen when it was closed, then a comment. And one label request
// when the occurrence quarantines the test. A test that failed both attempts
// costs nothing beyond the listing, unless its record carries the quarantine
// label, which costs that record's history.
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
// A comment is an occurrence when the user the script posts as wrote it, one
// of its lines matches /^<!-- verdict-occurrence (\{.*\}) -->$/, and the group
// parses as JSON. date is UTC in ISO 8601, to the second, and every value is
// a string, except that the occurrence that reopened its record also holds
// "reopened":true. Any <, > or & in a value is written as \u003c, \u003e or
// \u0026, which JSON.parse reads back, so no value can end the HTML comment.
// Later versions may add keys, and these keys keep their meaning.
//
// The run summary is Markdown: a "### Verdict: pass" or "### Verdict: fail"
// heading; then, when the cap kept a test out of quarantine, a "> [!WARNING]"
// block saying so for each such test; then one bullet per reason the build
// fails, one saying the quarantine list was not read when that left a failure
// standing, one per failure ignored because its test is quarantined, one per
// flake occurrence, and one per test that passed attempt 1 and failed attempt
// 2, beginning "Failed only on the rerun". A failure whose record carries a
// quarantine label left from before it last closed says so, and so does an
// ignored failure whose record's history couldn't be read. An occurrence's
// bullet names the test as `<classname> <name>`, then links the record it was
// recorded on, or says why it was not recorded. A recorded occurrence's bullet
// then gives its count toward quarantine, such as "Quarantine count: 2
// occurrences on 1 branch in 30 days (it takes 3 on at least 2).", says how
// many occurrences on the record someone else wrote, when any did, and ends
// "Now quarantined", "Already quarantined" or "Not quarantined" when one of
// those applies.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
  '--keep-token',
  '--tracker-user',
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
// identities apart. `title` names the test in the run summary, and titles its
// flaky-test record when the tracker keeps it as it is, `<classname> <name>`.
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
// without a shell, or the rerun command, a string the shell runs, in the
// environment `env`. Each attempt starts with no results file, so a run that
// writes none can't be read as the one before it.
const runAttempt = (results, command, env) => {
  rmSync(results, { force: true });
  return typeof command === 'string'
    ? spawnSync(command, { stdio: 'inherit', shell: true, env })
    : spawnSync(command[0], command.slice(1), { stdio: 'inherit', env });
};

// The environment the attempts run in: the script's own, without the tracker
// token, so no test can write to the tracker with it, unless --keep-token
// names its variable.
const attemptEnv = (settings, env) => {
  const kept = { ...env };
  for (const variable of ['VERDICT_TRACKER_TOKEN', settings.token?.variable]) {
    if (variable && variable !== settings.keepToken) delete kept[variable];
  }
  return kept;
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
// identities of the tests with a flake occurrence, which don't fail it; and
// the identities of the tests that passed attempt 1 and failed attempt 2,
// which neither fail it nor count as flake occurrences, and which the run
// summary names. Also the size of the suite: how many tests attempt 1's
// results file holds.
const judge = (settings, env) => {
  const buildFailures = [];
  const stillFailing = [];
  const occurrences = [];
  const failedOnRerun = [];

  const attempt1 = runAttempt(settings.results, settings.command, attemptEnv(settings, env));
  const results1 = readResults(settings.results);
  if (!results1) {
    buildFailures.push(
      `Attempt 1 wrote no readable results file at \`${settings.results}\`, and the test command ${exitOf(attempt1)}.`,
    );
    return { buildFailures, stillFailing, occurrences, failedOnRerun, suite: 0 };
  }

  const suite = results1.size;
  const failures = failedIn(results1);
  if (failures.length === 0) {
    if (attempt1.status !== 0) {
      buildFailures.push(`The test command ${exitOf(attempt1)} with no failed test in the results file.`);
    }
    return { buildFailures, stillFailing, occurrences, failedOnRerun, suite };
  }

  const attempt2 = runAttempt(settings.results, settings.rerun || settings.command, attemptEnv(settings, env));
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
    const test = inlineCode(identity.title);
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
  for (const { identity } of results2 ? failedIn(results2) : []) {
    if (results1.get(identity.key)?.outcome === 'passed') failedOnRerun.push(identity);
  }
  return { buildFailures, stillFailing, occurrences, failedOnRerun, suite };
};

// The tracker -------------------------------------------------------------

const TRACKER_TIMEOUT_MS = 30_000;

// A tracker request that failed. Its message completes "Not recorded: " and
// "Quarantine not read: ". `status` is the HTTP status of a refusal.
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
      throw Object.assign(
        new TrackerError(`the tracker refused to ${doing} (HTTP ${response.status}${reason ? ` ${reason}` : ''})`),
        { status: response.status },
      );
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

// The time of the latest of these events, in milliseconds, or undefined when
// there are none.
const latest = (events) => (events.length > 0 ? Math.max(...events.map((event) => Date.parse(event.created_at))) : undefined);

// The GitHub adapter: the tracker operations the script uses, over GitHub's
// REST API. A record is { number, title, url, open, labels, body }.
const githubTracker = ({ trackerUrl, repo, token }) => {
  const api = trackerUrl.replace(/\/+$/, '');
  const issues = `${api}/repos/${repo}/issues`;
  const { call, callAll } = restApi(trackerUrl, {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    ...token.headers,
  });

  // A record's events, read once: each close, reopen, label added and more.
  const events = new Map();
  const eventsOf = (target) => {
    if (!events.has(target.number)) {
      events.set(target.number, callAll("read the record's history", `${issues}/${target.number}/events?per_page=100`));
    }
    return events.get(target.number);
  };

  const record = (issue) => ({
    number: issue.number,
    title: issue.title,
    url: issue.html_url,
    open: issue.state === 'open',
    labels: (issue.labels ?? []).map((label) => label.name ?? label),
    body: issue.body ?? '',
  });

  return {
    // The login the token posts as. GitHub refuses /user to a GitHub App's
    // installation token, such as a job's own $GITHUB_TOKEN, which posts as
    // github-actions[bot].
    poster: async () => {
      try {
        return (await call('read the user the token posts as', 'GET', `${api}/user`)).data.login;
      } catch (error) {
        if (error.status === 403) return 'github-actions[bot]';
        throw error;
      }
    },
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
    // Every comment on the record, oldest first, as { body, author }, where
    // author is the login of the user who wrote it.
    listComments: async (target) =>
      (await callAll("read the record's comments", `${issues}/${target.number}/comments?per_page=100`)).map(
        (comment) => ({ body: comment.body, author: comment.user?.login }),
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
    // When the record last closed, or undefined when it never has.
    lastClosed: async (target) => latest((await eventsOf(target)).filter((event) => event.event === 'closed')),
    // When the label last went on the record, or undefined when it never has.
    lastLabelled: async (target, label) =>
      latest((await eventsOf(target)).filter((event) => event.event === 'labeled' && event.label?.name === label)),
  };
};

// The GitLab adapter: the same operations over GitLab's REST API v4. A
// record's number is its issue's iid, and a comment is a note.
const gitlabTracker = ({ trackerUrl, repo, token }) => {
  const api = trackerUrl.replace(/\/+$/, '');
  const issues = `${api}/projects/${encodeURIComponent(repo)}/issues`;
  const { call, callAll } = restApi(trackerUrl, token.headers);

  const record = (issue) => ({
    number: issue.iid,
    title: issue.title,
    url: issue.web_url,
    open: issue.state === 'opened',
    labels: issue.labels ?? [],
    body: issue.description ?? '',
  });

  return {
    // The username of the user the token posts as.
    poster: async () => (await call('read the user the token posts as', 'GET', `${api}/user`)).data.username,
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
    // notes, such as "reopened", come too, and hold no occurrence. A note's
    // author is the username of the user who wrote it.
    listComments: async (target) =>
      (
        await callAll("read the record's comments", `${issues}/${target.number}/notes?sort=asc&order_by=created_at&per_page=100`)
      ).map((note) => ({ body: note.body, author: note.author?.username })),
    addComment: async (target, body) => {
      await call('comment on the record', 'POST', `${issues}/${target.number}/notes`, { body });
    },
    addLabel: async (target, label) => {
      await call('label the record', 'PUT', `${issues}/${target.number}`, { add_labels: label });
    },
    removeLabel: async (target, label) => {
      await call('unlabel the record', 'PUT', `${issues}/${target.number}`, { remove_labels: label });
    },
    lastClosed: async (target) =>
      latest(
        (await callAll("read the record's history", `${issues}/${target.number}/resource_state_events?per_page=100`)).filter(
          (event) => event.state === 'closed',
        ),
      ),
    lastLabelled: async (target, label) =>
      latest(
        (await callAll("read the record's history", `${issues}/${target.number}/resource_label_events?per_page=100`)).filter(
          (event) => event.action === 'add' && event.label?.name === label,
        ),
      ),
  };
};

const bearer = (token) => ({ authorization: `Bearer ${token}` });

// Each tracker the script supports: the defaults of the flags whose default
// depends on it, the variables its token is read from, the first one set
// winning, with the headers each one is sent in, its adapter, and the most
// characters it takes in an issue's title.
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
    titleLimit: 256,
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
    titleLimit: 255,
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
  // Open and carrying the quarantine label, which quarantines the record
  // unless its history shows the label went on before the record last closed.
  const labelled = (record) => record.open && record.labels.includes(settings.quarantineLabel);
  const { titleLimit } = TRACKERS[settings.tracker];
  const matching = (identity) => list.filter((record) => isRecordOf(record, identity, titleLimit));
  return {
    tracker,
    problem,
    labelled,
    labelledCount: list.filter(labelled).length,
    // The test's record, if it has one.
    of: (identity) => matching(identity)[0],
    // The test's record that is open and carries the quarantine label, if any.
    labelledOf: (identity) => matching(identity).find(labelled),
    // When an open record last closed, and whether the quarantine label it
    // carries went on before that, which leaves it from an earlier quarantine.
    historyOf: async (record) => {
      const closedAt = await tracker.lastClosed(record);
      if (closedAt === undefined || !record.labels.includes(settings.quarantineLabel)) return { closedAt, staleLabel: false };
      return { closedAt, staleLabel: !((await tracker.lastLabelled(record, settings.quarantineLabel)) > closedAt) };
    },
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

// Markdown inline code that holds any text, backticks included. CommonMark
// strips one space from each end of code that starts and ends with one, so
// such text gets one more, as does text that starts or ends with a backtick.
const STRIPPED = /^ [\s\S]* $/;
const inlineCode = (text) => {
  const fence = '`'.repeat(Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length)) + 1);
  const pad = /^`|`$/.test(text) || (STRIPPED.test(text) && /[^ ]/.test(text)) ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
};

// The text that inline code holds, read as CommonMark reads it, or undefined
// when `code` isn't inline code.
const fromInlineCode = (code) => {
  const inner = code?.match(/^(`+)([\s\S]*?)\1$/)?.[2];
  return inner !== undefined && STRIPPED.test(inner) && /[^ ]/.test(inner) ? inner.slice(1, -1) : inner;
};

// A record's body gives its test's identity, which its title can't, since
// two identities can share a title.
const recordBody = ({ classname, name }) =>
  [
    'The flaky-test record for one test, kept by the verdict script. Each flake occurrence is a comment below.',
    '',
    `- Classname: ${inlineCode(classname)}`,
    `- Name: ${inlineCode(name)}`,
    '',
  ].join('\n');

// The identity a record's body gives in its Classname and Name lines, as
// recordBody writes them, or undefined when it gives none, as in a record a
// person wrote.
const identityIn = (body) => {
  const line = (label) => body.match(new RegExp(`^- ${label}: (.*?)\\r?$`, 'm'))?.[1];
  const [classname, name] = [fromInlineCode(line('Classname')), fromInlineCode(line('Name'))];
  return classname === undefined || name === undefined ? undefined : identityOf(classname, name);
};

// The title of a test's record, on a tracker that takes `limit` characters.
// A tracker refuses a longer title, and strips whitespace from a title's ends,
// as GitLab does, or may rewrite other whitespace, such as a line break. So a
// title it would refuse or rewrite gets a stand-in that stays the same from
// run to run: the identity's title with each run of whitespace and control
// characters made one space, cut to fit, then a hash of the identity, which
// tells apart two tests the cut leaves alike.
const recordTitle = (identity, limit) => {
  const { title } = identity;
  if ([...title].length <= limit && !/^\s|\s$|[^\S ]|\p{Cc}/u.test(title)) return title;
  const suffix = `… [${createHash('sha256').update(identity.key).digest('hex').slice(0, 12)}]`;
  const readable = [...title.replace(/[\s\p{Cc}]+/gu, ' ').trim()];
  return `${readable.slice(0, limit - suffix.length).join('').trimEnd()}${suffix}`;
};

// A record is a test's when its body gives the test's identity, or, when it
// gives none, as in a record a person wrote or one whose name holds a line
// break, when its title is the one recordTitle gives the test.
const isRecordOf = (record, identity, titleLimit) => {
  const given = identityIn(record.body);
  return given ? given.key === identity.key : record.title === recordTitle(identity, titleLimit);
};

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

// The flake occurrences recorded in these comments, from their markers, as
// { counted, ignored }: the occurrences `poster`, the user the script posts
// as, wrote, and how many anyone else wrote. Anyone who can comment can write
// a marker, so only the script's own count.
const occurrencesIn = (comments, poster) => {
  const found = comments.flatMap(({ body, author }) => {
    const marker = body?.match(MARKER);
    if (!marker) return [];
    try {
      return [{ author, occurrence: JSON.parse(marker[1]) }];
    } catch {
      return [];
    }
  });
  const counted = found.filter(({ author }) => author === poster).map(({ occurrence }) => occurrence);
  return { counted, ignored: found.length - counted.length };
};

// Quarantine --------------------------------------------------------------

const QUARANTINE_OCCURRENCES = 3;
const QUARANTINE_BRANCHES = 2;
const QUARANTINE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// How many of a record's occurrences, oldest first, count toward quarantine
// at the time `now`, and on how many branches, as { occurrences, branches }.
// The count starts again whenever the record is reopened, by the script or by
// a person: it takes the occurrences dated after the record last closed, at
// `closedAt`, from the one that last reopened it on. A run counts once, even
// when two of its jobs raced to record it.
const towardQuarantine = (recorded, now, closedAt = -Infinity) => {
  const sinceReopened = recorded.slice(Math.max(0, recorded.findLastIndex(({ reopened }) => reopened === true)));
  const counting = sinceReopened.filter(
    ({ date }) => Date.parse(date) > closedAt && now - Date.parse(date) <= QUARANTINE_DAYS * DAY_MS,
  );
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
  let poster = settings.trackerUser;
  try {
    poster ||= await tracker.poster();
  } catch (error) {
    return identities.map(() => `Not recorded: ${trackerProblem(error, 'reading the user the token posts as')}.`);
  }
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
    let notCounted = '';
    // A closed record's count starts at this occurrence, which reopens it. An
    // open one's starts after it last closed.
    let history = {};
    if (record) {
      const { counted, ignored } = occurrencesIn(await tracker.listComments(record), poster);
      recorded = counted;
      if (ignored > 0) {
        notCounted = ` Not counted: ${plural(ignored, 'occurrence')} on the record written by someone other than ${inlineCode(poster)}, the user the script posts as.`;
      }
      if (record.open) history = await records.historyOf(record);
      if (recorded.some(({ run }) => run === settings.run)) {
        return `Already recorded on [#${record.number}](${record.url}) for this run, so it counts once. ${countSentence(towardQuarantine(recorded, now, history.closedAt))}${notCounted}`;
      }
    } else {
      record = await tracker.createRecord({
        title: recordTitle(identity, TRACKERS[settings.tracker].titleLimit),
        body: recordBody(identity),
        labels: [settings.flakyLabel, 'ready-for-agent'],
      });
    }
    const reopened = !record.open;
    // A closed record isn't quarantined, so a label it kept would quarantine
    // the reopened record on one occurrence. The label comes off before the
    // reopen, so a refusal between the two can't leave it quarantined. A label
    // an open record kept from before it closed, as when a person reopened
    // it, comes off too.
    const unquarantined = (reopened && record.labels.includes(label)) || history.staleLabel;
    if (unquarantined) await tracker.removeLabel(record, label);
    if (history.staleLabel) quarantine.count -= 1;
    if (reopened) await tracker.reopenRecord(record);
    const added = { ...occurrence, ...(reopened && { reopened }) };
    await tracker.addComment(record, occurrenceComment(added));
    const count = towardQuarantine([...recorded, added], now, history.closedAt);
    const labelCode = inlineCode(label);
    const said = [
      `Recorded on [#${record.number}](${record.url})${reopened ? ' after reopening it' : ''}${
        unquarantined ? ` and took off its ${labelCode} label, left from before it closed` : ''
      }.`,
      `${countSentence(count)}${notCounted}`,
    ];
    if (records.labelled(record) && !unquarantined) {
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
        `The quarantine cap kept ${inlineCode(identity.title)} ([#${record.number}](${record.url})) out of quarantine: ${plural(quarantine.count, 'test is', 'tests are')} already quarantined, and the cap allows ${quarantine.explained}. Its failures still fail the build until a quarantined test is fixed or the cap is raised.`,
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

const { buildFailures, stillFailing, occurrences, failedOnRerun, suite } = judge(settings, process.env);
const records =
  stillFailing.length > 0 || occurrences.length > 0 ? await readRecords(settings) : flakyRecords(settings, {});
// A quarantined test's failure is ignored, unless its quarantine label is left
// from before its record last closed. When the record's history can't be read,
// the label stands as the listing shows it.
const ignored = [];
for (const { identity, failure } of stillFailing) {
  const record = records.labelledOf(identity);
  if (!record) {
    buildFailures.push(failure);
    continue;
  }
  const link = `[#${record.number}](${record.url})`;
  const history = await records
    .historyOf(record)
    .catch((error) => ({ unread: trackerProblem(error, "reading the record's history") }));
  if (history.staleLabel) {
    buildFailures.push(
      `${failure} Its record ${link} carries the ${inlineCode(settings.quarantineLabel)} label from before it last closed, which no longer quarantines the test.`,
    );
  } else {
    ignored.push(
      `${failure} Ignored, because its record ${link} is quarantined${
        history.unread ? `, though its history was not read to confirm the label went on after it last closed: ${history.unread}` : ''
      }.`,
    );
  }
}
const unread =
  stillFailing.length > 0 && records.problem
    ? [`Quarantine not read: ${records.problem}, so no test is treated as quarantined.`]
    : [];
const quarantine = { ...capOf(settings.quarantineCap, suite), count: records.labelledCount, capped: [] };
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
    (identity, i) => `- Flake occurrence: ${inlineCode(identity.title)} failed on attempt 1 and passed on attempt 2. ${recorded[i]}`,
  ),
  ...failedOnRerun.map(
    (identity) =>
      `- Failed only on the rerun: ${inlineCode(identity.title)} passed on attempt 1 and failed on attempt 2, which neither fails the build nor counts as a flake occurrence.`,
  ),
  '',
].join('\n');

process.stdout.write(`\n${summary}`);
if (settings.summary) appendFileSync(settings.summary, summary);
process.exitCode = pass ? 0 : 1;

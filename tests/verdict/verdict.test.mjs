import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runVerdict, runVerdictWith, junit, passed, failed, errored, skipped, lineAbout, codeSpans } from './harness.mjs';

// The failures this guards: a build that passes when a test command crashed or
// a rerun went missing, and a build that fails when the only problem was a
// flake occurrence. Each test runs the real verdict script around a fake test
// command and reads only its exit code and run summary, as CI does.

test('all tests pass: the build passes', async () => {
  const { code, summary, output } = await runVerdict({
    testRuns: [{ exit: 0, xml: junit(passed('tests.test_cart', 'test_add_item')) }],
  });
  assert.equal(code, 0, output);
  assert.match(summary, /verdict: pass/i);
});

test('the test command exits non-zero with no failed test in the results file: the build fails as a crash', async () => {
  const { code, summary } = await runVerdict({
    testRuns: [{ exit: 2, xml: junit(passed('tests.test_cart', 'test_add_item')) }],
  });
  assert.notEqual(code, 0);
  assert.match(summary, /verdict: fail/i);
  assert.match(summary, /exited 2 with no failed test/i);
});

test('a test fails then passes when the whole command reruns: the build passes and the summary names a flake occurrence', async () => {
  const { code, summary, output } = await runVerdict({
    testRuns: [
      {
        exit: 1,
        xml: junit(passed('tests.test_cart', 'test_add_item'), failed('tests.test_cart', 'test_checkout_total')),
      },
      {
        exit: 0,
        xml: junit(passed('tests.test_cart', 'test_add_item'), passed('tests.test_cart', 'test_checkout_total')),
      },
    ],
  });
  assert.equal(code, 0, output);
  assert.match(summary, /verdict: pass/i);
  assert.match(lineAbout(summary, 'tests.test_cart test_checkout_total'), /flake occurrence/i);
});

test('a test fails on both attempts: the build fails and the summary names it', async () => {
  const xml = junit(passed('tests.test_cart', 'test_add_item'), failed('tests.test_cart', 'test_checkout_total'));
  const { code, summary } = await runVerdict({
    testRuns: [
      { exit: 1, xml },
      { exit: 1, xml },
    ],
  });
  assert.notEqual(code, 0);
  assert.match(summary, /verdict: fail/i);
  assert.match(lineAbout(summary, 'tests.test_cart test_checkout_total'), /failed on both attempts/i);
});

test('a configured rerun-failures command runs attempt 2 in place of the whole command', async () => {
  const failing = junit(passed('tests.test_cart', 'test_add_item'), failed('tests.test_cart', 'test_checkout_total'));
  const { code, summary, output } = await runVerdict({
    testRuns: [
      { exit: 1, xml: failing },
      { exit: 1, xml: failing },
    ],
    rerunRuns: [{ exit: 0, xml: junit(passed('tests.test_cart', 'test_checkout_total')) }],
  });
  assert.equal(code, 0, output);
  assert.match(lineAbout(summary, 'tests.test_cart test_checkout_total'), /flake occurrence/i);
});

test('the rerun leaves out a test that failed in attempt 1: the build fails', async () => {
  const { code, summary } = await runVerdict({
    testRuns: [
      {
        exit: 1,
        xml: junit(failed('tests.test_cart', 'test_checkout_total'), failed('tests.test_tax', 'test_vat_rounding')),
      },
    ],
    rerunRuns: [{ exit: 0, xml: junit(passed('tests.test_cart', 'test_checkout_total')) }],
  });
  assert.notEqual(code, 0);
  assert.match(summary, /verdict: fail/i);
  assert.match(lineAbout(summary, 'tests.test_tax test_vat_rounding'), /no result on attempt 2/i);
});

test('an error element counts as a failure', async () => {
  const { code, summary, output } = await runVerdict({
    testRuns: [
      { exit: 1, xml: junit(errored('tests.test_db', 'test_connect')) },
      { exit: 0, xml: junit(passed('tests.test_db', 'test_connect')) },
    ],
  });
  assert.equal(code, 0, output);
  assert.match(lineAbout(summary, 'tests.test_db test_connect'), /flake occurrence/i);
});

test('a skipped test is not a failure', async () => {
  const { code, summary, output } = await runVerdict({
    testRuns: [
      { exit: 0, xml: junit(passed('tests.test_cart', 'test_add_item'), skipped('tests.test_tax', 'test_vat_rounding')) },
    ],
  });
  assert.equal(code, 0, output);
  assert.match(summary, /verdict: pass/i);
});

test('a test skipped on the rerun has no result, so the build fails', async () => {
  const { code, summary } = await runVerdict({
    testRuns: [{ exit: 1, xml: junit(failed('tests.test_cart', 'test_checkout_total')) }],
    rerunRuns: [{ exit: 0, xml: junit(skipped('tests.test_cart', 'test_checkout_total')) }],
  });
  assert.notEqual(code, 0);
  assert.match(lineAbout(summary, 'tests.test_cart test_checkout_total'), /no result on attempt 2/i);
});

// pytest writes a passed attempt and then a failed one under the same identity
// when its own retries are on; Vitest writes a failed case and then a passed
// one for a test.each title with no placeholder.
test('an identity that appears more than once in a file has failed when any of its testcases failed', async () => {
  const { code, summary } = await runVerdict({
    testRuns: [
      { exit: 1, xml: junit(passed('tests.test_cart', 'test_total'), failed('tests.test_cart', 'test_total')) },
      { exit: 1, xml: junit(failed('tests.test_cart', 'test_total'), passed('tests.test_cart', 'test_total')) },
    ],
  });
  assert.notEqual(code, 0);
  assert.match(lineAbout(summary, 'tests.test_cart test_total'), /failed on both attempts/i);
});

test('each case of a parameterised test is judged on its own', async () => {
  const { code, summary } = await runVerdict({
    testRuns: [
      { exit: 1, xml: junit(failed('tests.test_tax', 'test_rate[uk]'), failed('tests.test_tax', 'test_rate[de]')) },
      { exit: 1, xml: junit(passed('tests.test_tax', 'test_rate[uk]'), failed('tests.test_tax', 'test_rate[de]')) },
    ],
  });
  assert.notEqual(code, 0);
  assert.match(lineAbout(summary, 'tests.test_tax test_rate[uk]'), /flake occurrence/i);
  assert.match(lineAbout(summary, 'tests.test_tax test_rate[de]'), /failed on both attempts/i);
});

test('test identity is classname plus name, copied verbatim from the file', async () => {
  const name = 'outer > each odd x > y';
  const { code, summary } = await runVerdict({
    testRuns: [
      { exit: 1, xml: junit(failed('tests/shapes.spec.js', name), failed('tests/other.spec.js', name)) },
      { exit: 1, xml: junit(passed('tests/shapes.spec.js', name), failed('tests/other.spec.js', name)) },
    ],
  });
  assert.notEqual(code, 0);
  assert.match(lineAbout(summary, `tests/shapes.spec.js ${name}`), /flake occurrence/i);
  assert.match(lineAbout(summary, `tests/other.spec.js ${name}`), /failed on both attempts/i);
});

test('the run summary gives a test name holding backticks as inline code that reads back exactly', async () => {
  const flaky = ['spec/view.spec.ts', 'renders `x`'];
  const broken = ['spec/view.spec.ts', '``keeps`` state'];
  const { code, summary } = await runVerdict({
    testRuns: [
      { exit: 1, xml: junit(failed(...flaky), failed(...broken)) },
      { exit: 1, xml: junit(passed(...flaky), failed(...broken)) },
    ],
  });
  assert.notEqual(code, 0);
  for (const [classname, name] of [flaky, broken]) {
    const line = lineAbout(summary, name);
    assert.ok(codeSpans(line).includes(`${classname} ${name}`), line);
  }
});

test('the rerun exits non-zero with no failed test in its results file: the build fails as a crash', async () => {
  const { code, summary } = await runVerdict({
    testRuns: [{ exit: 1, xml: junit(failed('tests.test_cart', 'test_checkout_total')) }],
    rerunRuns: [{ exit: 7, xml: junit(passed('tests.test_cart', 'test_checkout_total')) }],
  });
  assert.notEqual(code, 0);
  assert.match(summary, /verdict: fail/i);
  assert.match(summary, /rerun exited 7 with no failed test/i);
});

test('the rerun writes no results file: the build fails', async () => {
  const { code, summary } = await runVerdict({
    testRuns: [{ exit: 1, xml: junit(failed('tests.test_cart', 'test_checkout_total')) }],
    rerunRuns: [{ exit: 0 }],
  });
  assert.notEqual(code, 0);
  assert.match(summary, /verdict: fail/i);
  assert.match(summary, /attempt 2 wrote no readable results file/i);
});

test('the rerun writes a truncated results file: the build fails', async () => {
  const whole = junit(passed('tests.test_cart', 'test_checkout_total'), passed('tests.test_tax', 'test_vat_rounding'));
  const { code, summary } = await runVerdict({
    testRuns: [{ exit: 1, xml: junit(failed('tests.test_cart', 'test_checkout_total')) }],
    rerunRuns: [{ exit: 0, xml: whole.slice(0, whole.indexOf('<testcase classname="tests.test_tax"')) }],
  });
  assert.notEqual(code, 0);
  assert.match(summary, /attempt 2 wrote no readable results file/i);
});

test('the test command exits 0 but writes no results file: the build fails, whatever an earlier run left behind', async () => {
  const { code, summary } = await runVerdict({
    stale: junit(passed('tests.test_cart', 'test_add_item')),
    testRuns: [{ exit: 0 }],
  });
  assert.notEqual(code, 0);
  assert.match(summary, /verdict: fail/i);
  assert.match(summary, /attempt 1 wrote no readable results file/i);
});

test('on GitHub Actions the run summary goes to the step summary as well as the log', async () => {
  const { code, summary, output } = await runVerdict({
    testRuns: [{ exit: 0, xml: junit(passed('tests.test_cart', 'test_add_item')) }],
    summaryIn: 'github',
  });
  assert.equal(code, 0, output);
  assert.match(summary, /verdict: pass/i);
  assert.match(output, /verdict: pass/i);
});

test('the script refuses to run without a results file or a test command, and says how to call it', async () => {
  for (const args of [[], ['--', 'pytest'], ['--results', 'results.xml']]) {
    const { code, output } = await runVerdictWith(args);
    assert.notEqual(code, 0);
    assert.match(output, /usage: node verdict\.mjs/i, `arguments: ${args.join(' ')}`);
  }
});

test('a test command that cannot start fails the build and says why', async () => {
  const { code, output } = await runVerdictWith(['--results', 'results.xml', '--', 'no-such-test-command-1f3a']);
  assert.notEqual(code, 0);
  assert.match(output, /verdict: fail/i);
  assert.match(output, /could not start/i);
});

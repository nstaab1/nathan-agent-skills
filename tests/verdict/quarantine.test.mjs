import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runVerdict, runVerdictWith, junit, passed, failed, lineAbout, codeSpans, recordingTo, trackerTest, gitlab, suite, earlier, daysAgo } from './harness.mjs';

// The failures this guards: a quarantined test that still fails the build; a
// failure let through by a quarantine read from a closed record, or from a
// label a reopened record kept; a test quarantined on too few occurrences, on
// old ones, on ones from before a reopen or on one branch's; a quarantine past
// the cap, or one the cap stopped without the summary saying so. Each test
// runs the real verdict script against a fake tracker, GitHub's and GitLab's
// in turn, and reads the exit code, the run summary and the records the
// tracker holds afterwards.

const CHECKOUT = ['tests.test_cart', 'test_checkout_total'];
const CHECKOUT_TITLE = 'tests.test_cart test_checkout_total';

const TAX = ['tests.test_tax', 'test_vat_rounding'];
const TAX_TITLE = 'tests.test_tax test_vat_rounding';

// Two recent occurrences on two branches: the next occurrence, from any
// branch, brings the record to quarantine.
const twoOccurrences = () => [earlier({ daysAgo: 3, branch: 'main' }), earlier({ daysAgo: 1, branch: 'feature/tax' })];

// Open records of other tests, already quarantined.
const quarantinedOthers = (count) =>
  Array.from({ length: count }, (_, i) => ({ title: `tests.test_other test_q${i}`, labels: ['flaky-test', 'quarantined'] }));

trackerTest('a test that fails both attempts does not fail the build while its open record carries the quarantine label', ({ withTracker }) =>
  withTracker({ records: [{ title: CHECKOUT_TITLE, labels: ['flaky-test', 'quarantined'] }] }, async (tracker) => {
    const { code, summary, output } = await runVerdict({ ...suite({ broken: [CHECKOUT] }), ...recordingTo(tracker) });
    assert.equal(code, 0, output);
    assert.match(summary, /verdict: pass/i);
    const line = lineAbout(summary, CHECKOUT_TITLE);
    assert.match(line, /failed on both attempts/i);
    assert.match(line, /ignored.*quarantined/i);
    assert.ok(line.includes(tracker.records[0].url), line);
  }));

trackerTest('a closed record ends its quarantine, so a test that fails both attempts fails the build', ({ withTracker }) =>
  withTracker(
    { records: [{ title: CHECKOUT_TITLE, state: 'closed', labels: ['flaky-test', 'quarantined'] }] },
    async (tracker) => {
      const { code, summary } = await runVerdict({ ...suite({ broken: [CHECKOUT] }), ...recordingTo(tracker) });
      assert.equal(code, 1);
      assert.match(summary, /verdict: fail/i);
      assert.doesNotMatch(lineAbout(summary, CHECKOUT_TITLE), /ignored/i);
    },
  ));

trackerTest('with the tracker unreachable nothing is quarantined: a test that fails both attempts fails the build, and the summary says why', async ({ unreachable }) => {
  const tracker = await unreachable();
  const { code, summary } = await runVerdict({ ...suite({ broken: [CHECKOUT] }), ...recordingTo(tracker) });
  assert.equal(code, 1);
  assert.match(summary, /verdict: fail/i);
  assert.match(lineAbout(summary, CHECKOUT_TITLE), /failed on both attempts/i);
  const line = lineAbout(summary, 'could not be reached');
  assert.match(line, /no test is treated as quarantined/i);
});

trackerTest('with a read-only token the quarantine list is still read, so a quarantined test that fails both attempts does not fail the build', ({ withTracker }) =>
  withTracker(
    { readOnly: true, records: [{ title: CHECKOUT_TITLE, labels: ['flaky-test', 'quarantined'] }] },
    async (tracker) => {
      const { code, summary, output } = await runVerdict({ ...suite({ broken: [CHECKOUT] }), ...recordingTo(tracker) });
      assert.equal(code, 0, output);
      assert.match(lineAbout(summary, CHECKOUT_TITLE), /ignored/i);
    },
  ));

test('on GitLab with only the CI job token, the quarantine list is still read, and the summary says the occurrence was not recorded', () =>
  gitlab.withTracker(
    { jobToken: 'fake-job-token', records: [{ title: CHECKOUT_TITLE, labels: ['flaky-test', 'quarantined'] }] },
    async (tracker) => {
      const { flags } = recordingTo(tracker);
      const { code, summary, output } = await runVerdict({
        ...suite({ broken: [CHECKOUT], flaky: [TAX] }),
        flags,
        env: { CI_JOB_TOKEN: tracker.jobToken },
      });
      assert.equal(code, 0, output);
      assert.match(lineAbout(summary, CHECKOUT_TITLE), /ignored/i);
      assert.match(lineAbout(summary, TAX_TITLE), /not recorded: the tracker refused .*403/i);
      assert.equal(tracker.records.length, 1);
    },
  ));

trackerTest('the summary line for each flake occurrence shows its count toward quarantine', ({ withTracker }) =>
  withTracker({ records: [{ title: CHECKOUT_TITLE, comments: [earlier({ daysAgo: 2, branch: 'main' })] }] }, async (tracker) => {
    const { code, summary, output } = await runVerdict({
      ...suite({ flaky: [CHECKOUT, TAX] }),
      ...recordingTo(tracker, { branch: 'feature/cart' }),
    });
    assert.equal(code, 0, output);
    assert.match(lineAbout(summary, CHECKOUT_TITLE), /2 occurrences on 2 branches in 30 days \(it takes 3 on at least 2\)/i);
    assert.match(lineAbout(summary, TAX_TITLE), /1 occurrence on 1 branch in 30 days \(it takes 3 on at least 2\)/i);
  }));

trackerTest('the occurrence that makes three in 30 days across two branches puts the quarantine label on the record', ({ withTracker }) =>
  withTracker(
    {
      records: [
        { title: CHECKOUT_TITLE, comments: [earlier({ daysAgo: 3, branch: 'main' }), earlier({ daysAgo: 1, branch: 'main' })] },
      ],
    },
    async (tracker) => {
      const { code, summary, output } = await runVerdict({
        ...suite({ flaky: [CHECKOUT] }),
        ...recordingTo(tracker, { branch: 'feature/cart' }),
      });
      assert.equal(code, 0, output);
      assert.deepEqual(tracker.records[0].labels.toSorted(), ['flaky-test', 'quarantined']);
      const line = lineAbout(summary, CHECKOUT_TITLE);
      assert.match(line, /3 occurrences on 2 branches in 30 days/i);
      assert.match(line, /now quarantined/i);
    },
  ));

trackerTest('three occurrences on one branch do not quarantine the test', ({ withTracker }) =>
  withTracker(
    {
      records: [
        {
          title: CHECKOUT_TITLE,
          comments: [earlier({ daysAgo: 3, branch: 'feature/cart' }), earlier({ daysAgo: 1, branch: 'feature/cart' })],
        },
      ],
    },
    async (tracker) => {
      const { code, summary, output } = await runVerdict({
        ...suite({ flaky: [CHECKOUT] }),
        ...recordingTo(tracker, { branch: 'feature/cart' }),
      });
      assert.equal(code, 0, output);
      assert.deepEqual(tracker.records[0].labels, ['flaky-test']);
      const line = lineAbout(summary, CHECKOUT_TITLE);
      assert.match(line, /3 occurrences on 1 branch in 30 days/i);
      assert.doesNotMatch(line, /now quarantined/i);
    },
  ));

trackerTest('an occurrence more than 30 days old does not count toward quarantine', ({ withTracker }) =>
  withTracker(
    {
      records: [
        { title: CHECKOUT_TITLE, comments: [earlier({ daysAgo: 31, branch: 'main' }), earlier({ daysAgo: 29, branch: 'main' })] },
      ],
    },
    async (tracker) => {
      const { code, summary, output } = await runVerdict({
        ...suite({ flaky: [CHECKOUT] }),
        ...recordingTo(tracker, { branch: 'feature/cart' }),
      });
      assert.equal(code, 0, output);
      assert.deepEqual(tracker.records[0].labels, ['flaky-test']);
      const line = lineAbout(summary, CHECKOUT_TITLE);
      assert.match(line, /2 occurrences on 2 branches in 30 days/i);
      assert.doesNotMatch(line, /now quarantined/i);
    },
  ));

trackerTest('occurrences from before the record was last reopened do not count toward quarantine', ({ withTracker }) =>
  withTracker(
    {
      records: [
        {
          title: CHECKOUT_TITLE,
          comments: [
            earlier({ daysAgo: 4, branch: 'main' }),
            earlier({ daysAgo: 3, branch: 'feature/tax' }),
            earlier({ daysAgo: 2, branch: 'main', reopened: true }),
          ],
        },
      ],
    },
    async (tracker) => {
      const { code, summary, output } = await runVerdict({
        ...suite({ flaky: [CHECKOUT] }),
        ...recordingTo(tracker, { branch: 'feature/cart' }),
      });
      assert.equal(code, 0, output);
      assert.deepEqual(tracker.records[0].labels, ['flaky-test']);
      const line = lineAbout(summary, CHECKOUT_TITLE);
      assert.match(line, /2 occurrences on 2 branches in 30 days/i);
      assert.doesNotMatch(line, /now quarantined/i);
    },
  ));

trackerTest('a flake occurrence that reopens a record takes off its quarantine label, and the count starts again', ({ withTracker }) =>
  withTracker(
    {
      records: [
        {
          title: CHECKOUT_TITLE,
          state: 'closed',
          labels: ['flaky-test', 'quarantined'],
          comments: [earlier({ daysAgo: 6, branch: 'main' }), earlier({ daysAgo: 5, branch: 'feature/tax' })],
        },
      ],
    },
    async (tracker) => {
      const { code, summary, output } = await runVerdict({
        ...suite({ flaky: [CHECKOUT] }),
        ...recordingTo(tracker, { branch: 'feature/cart' }),
      });
      assert.equal(code, 0, output);
      const [record] = tracker.records;
      assert.equal(record.state, 'open');
      assert.deepEqual(record.labels, ['flaky-test']);
      const line = lineAbout(summary, CHECKOUT_TITLE);
      assert.match(line, /took off its `quarantined` label/i);
      assert.match(line, /1 occurrence on 1 branch in 30 days/i);
    },
  ));

trackerTest('the cap stops a quarantine once 5% of the suite is quarantined, and the summary warns about it first', ({ withTracker }) =>
  withTracker(
    { records: [{ title: CHECKOUT_TITLE, comments: twoOccurrences() }, ...quarantinedOthers(2)] },
    async (tracker) => {
      const { code, summary, output } = await runVerdict({
        ...suite({ size: 40, flaky: [CHECKOUT] }),
        ...recordingTo(tracker, { branch: 'feature/cart' }),
      });
      assert.equal(code, 0, output);
      assert.deepEqual(tracker.records[0].labels, ['flaky-test']);
      const warning = summary.split('\n\n')[1];
      assert.match(warning, /^> \[!WARNING\]\n> /);
      assert.match(warning, /quarantine cap/i);
      assert.ok(warning.includes(CHECKOUT_TITLE), warning);
      assert.match(warning, /2 tests are already quarantined/i);
      assert.match(warning, /5% of the 40 tests/i);
      const line = summary.split('\n').find((each) => each.startsWith('- ') && each.includes(CHECKOUT_TITLE));
      assert.match(line, /not quarantined/i);
    },
  ));

trackerTest('the cap warning gives a test name holding backticks as inline code that reads back exactly', ({ withTracker }) => {
  const test = ['spec/view.spec.ts', 'renders `x`'];
  const title = test.join(' ');
  return withTracker({ records: [{ title, comments: twoOccurrences() }] }, async (tracker) => {
    const { code, summary, output } = await runVerdict({
      ...suite({ size: 19, flaky: [test] }),
      ...recordingTo(tracker, { branch: 'feature/cart' }),
    });
    assert.equal(code, 0, output);
    const warning = lineAbout(summary, 'quarantine cap kept');
    assert.ok(codeSpans(warning).includes(title), warning);
  });
});

trackerTest('a flake occurrence of a quarantined test is recorded, and the summary says it is already quarantined', ({ withTracker }) =>
  withTracker(
    { records: [{ title: CHECKOUT_TITLE, labels: ['flaky-test', 'quarantined'], comments: twoOccurrences() }] },
    async (tracker) => {
      const { code, summary, output } = await runVerdict({
        ...suite({ size: 20, flaky: [CHECKOUT] }),
        ...recordingTo(tracker, { branch: 'feature/cart' }),
      });
      assert.equal(code, 0, output);
      assert.doesNotMatch(summary, /WARNING|cap/);
      const line = lineAbout(summary, CHECKOUT_TITLE);
      assert.match(line, /3 occurrences on 3 branches/i);
      assert.match(line, /already quarantined/i);
      assert.deepEqual(tracker.records[0].labels, ['flaky-test', 'quarantined']);
      assert.equal(tracker.requests.filter(({ action }) => action?.includes('label')).length, 0, 'no label request');
    },
  ));

trackerTest('the default cap is 5% of the tests in the results file, rounded down', async ({ withTracker }) => {
  for (const [size, quarantined] of [
    [39, false],
    [40, true],
  ]) {
    await withTracker(
      { records: [{ title: CHECKOUT_TITLE, comments: twoOccurrences() }, ...quarantinedOthers(1)] },
      async (tracker) => {
        const { code, output } = await runVerdict({
          ...suite({ size, flaky: [CHECKOUT] }),
          ...recordingTo(tracker, { branch: 'feature/cart' }),
        });
        assert.equal(code, 0, output);
        assert.equal(tracker.records[0].labels.includes('quarantined'), quarantined, `a suite of ${size}`);
      },
    );
  }
});

trackerTest('the cap holds across the tests of one job: past it, a second qualifying test is not quarantined', ({ withTracker }) =>
  withTracker(
    {
      records: [
        { title: CHECKOUT_TITLE, comments: twoOccurrences() },
        { title: TAX_TITLE, comments: twoOccurrences() },
      ],
    },
    async (tracker) => {
      const { code, summary, output } = await runVerdict({
        ...suite({ size: 20, flaky: [CHECKOUT, TAX] }),
        ...recordingTo(tracker, { branch: 'feature/cart' }),
      });
      assert.equal(code, 0, output);
      assert.deepEqual(
        tracker.records.map((record) => record.labels.includes('quarantined')),
        [true, false],
      );
      assert.match(summary, /> \[!WARNING\]/);
      assert.match(lineAbout(summary, 'quarantine cap kept'), new RegExp(TAX_TITLE));
    },
  ));

trackerTest('--quarantine-cap sets the cap as a share of the suite or as a number of tests', async ({ withTracker }) => {
  for (const [cap, size, already, quarantined] of [
    ['10%', 30, 2, true],
    ['10%', 29, 2, false],
    ['3', 20, 2, true],
    ['3', 100, 3, false],
  ]) {
    await withTracker(
      { records: [{ title: CHECKOUT_TITLE, comments: twoOccurrences() }, ...quarantinedOthers(already)] },
      async (tracker) => {
        const { flags, env } = recordingTo(tracker, { branch: 'feature/cart' });
        const { code, summary, output } = await runVerdict({
          ...suite({ size, flaky: [CHECKOUT] }),
          flags: [...flags, '--quarantine-cap', cap],
          env,
        });
        assert.equal(code, 0, output);
        const label = `cap ${cap}, suite of ${size}, ${already} quarantined`;
        assert.equal(tracker.records[0].labels.includes('quarantined'), quarantined, label);
        if (!quarantined) assert.match(summary, /> \[!WARNING\]/, label);
      },
    );
  }
});

test('the script refuses a cap that is neither a whole percentage nor a whole number', async () => {
  for (const cap of ['five', '5.5%', '-1', '5 %', '']) {
    const { code, output } = await runVerdictWith(['--results', 'results.xml', '--quarantine-cap', cap, '--', 'pytest']);
    assert.equal(code, 2, `cap ${JSON.stringify(cap)}`);
    assert.match(output, /--quarantine-cap/, `cap ${JSON.stringify(cap)}`);
  }
});

trackerTest('--flaky-label and --quarantine-label set the label names quarantine reads and applies', ({ withTracker }) =>
  withTracker(
    {
      records: [
        { title: CHECKOUT_TITLE, labels: ['ci-flaky', 'ci-quarantine'] },
        { title: TAX_TITLE, labels: ['ci-flaky'], comments: twoOccurrences() },
      ],
    },
    async (tracker) => {
      const { flags, env } = recordingTo(tracker, { branch: 'feature/cart' });
      const { code, summary, output } = await runVerdict({
        ...suite({ broken: [CHECKOUT], flaky: [TAX] }),
        flags: [...flags, '--flaky-label', 'ci-flaky', '--quarantine-label', 'ci-quarantine'],
        env,
      });
      assert.equal(code, 0, output);
      assert.match(lineAbout(summary, CHECKOUT_TITLE), /ignored/i);
      assert.deepEqual(tracker.records[1].labels, ['ci-flaky', 'ci-quarantine']);
      assert.match(lineAbout(summary, TAX_TITLE), /now quarantined.*`ci-quarantine`/i);
    },
  ));

trackerTest('a quarantined test that fails attempt 1 and has no result on attempt 2 does not fail the build', ({ withTracker }) =>
  withTracker({ records: [{ title: CHECKOUT_TITLE, labels: ['flaky-test', 'quarantined'] }] }, async (tracker) => {
    const { code, summary, output } = await runVerdict({
      testRuns: [{ exit: 1, xml: junit(passed(...TAX), failed(...CHECKOUT)) }],
      rerunRuns: [{ exit: 0, xml: junit() }],
      ...recordingTo(tracker),
    });
    assert.equal(code, 0, output);
    const line = lineAbout(summary, CHECKOUT_TITLE);
    assert.match(line, /no result on attempt 2/i);
    assert.match(line, /ignored/i);
  }));

trackerTest('two occurrences of one run on a record, left by two jobs racing, count once toward quarantine', ({ withTracker }) => {
  const race = [earlier({ daysAgo: 1, branch: 'main', run: '777' }), earlier({ daysAgo: 1, branch: 'main', run: '777' })];
  return withTracker(
    { records: [{ title: CHECKOUT_TITLE, comments: race }] },
    async (tracker) => {
      const { code, summary, output } = await runVerdict({
        ...suite({ flaky: [CHECKOUT] }),
        ...recordingTo(tracker, { branch: 'feature/cart' }),
      });
      assert.equal(code, 0, output);
      assert.match(lineAbout(summary, CHECKOUT_TITLE), /2 occurrences on 2 branches/i);
      assert.deepEqual(tracker.records[0].labels, ['flaky-test']);
    },
  );
});

trackerTest('a job whose run another job already recorded shows the count toward quarantine too', ({ withTracker }) =>
  withTracker(
    {
      records: [
        {
          title: CHECKOUT_TITLE,
          comments: [earlier({ daysAgo: 2, branch: 'main' }), earlier({ daysAgo: 0, branch: 'feature/cart', run: '4242' })],
        },
      ],
    },
    async (tracker) => {
      const { code, summary, output } = await runVerdict({
        ...suite({ flaky: [CHECKOUT] }),
        ...recordingTo(tracker, { branch: 'feature/cart', run: '4242' }),
      });
      assert.equal(code, 0, output);
      const line = lineAbout(summary, CHECKOUT_TITLE);
      assert.match(line, /already recorded/i);
      assert.match(line, /2 occurrences on 2 branches in 30 days/i);
    },
  ));

trackerTest('when the tracker refuses the quarantine label, the occurrence still counts as recorded and the summary says the test was not quarantined', ({ withTracker }) =>
  withTracker(
    {
      records: [{ title: CHECKOUT_TITLE, comments: twoOccurrences() }],
      refuse: ({ action }) => action === 'add label',
    },
    async (tracker) => {
      const { code, summary, output } = await runVerdict({
        ...suite({ flaky: [CHECKOUT] }),
        ...recordingTo(tracker, { branch: 'feature/cart' }),
      });
      assert.equal(code, 0, output);
      assert.equal(tracker.records[0].comments.length, 3);
      const line = lineAbout(summary, CHECKOUT_TITLE);
      assert.match(line, /recorded on \[#1\]/i);
      assert.doesNotMatch(line, /not recorded/i);
      assert.match(line, /not quarantined: the tracker refused .*403/i);
    },
  ));

trackerTest('when the tracker refuses to take a closed record\'s quarantine label off, the record stays closed and out of quarantine', ({ withTracker }) =>
  withTracker(
    {
      records: [{ title: CHECKOUT_TITLE, state: 'closed', labels: ['flaky-test', 'quarantined'] }],
      refuse: ({ action }) => action === 'remove label',
    },
    async (tracker) => {
      const { code, summary, output } = await runVerdict({ ...suite({ flaky: [CHECKOUT] }), ...recordingTo(tracker) });
      assert.equal(code, 0, output);
      assert.equal(tracker.records[0].state, 'closed');
      assert.match(lineAbout(summary, CHECKOUT_TITLE), /not recorded/i);
    },
  ));

trackerTest('a quarantined record of another test with the same title does not quarantine this one', ({ withTracker }) =>
  withTracker({}, async (tracker) => {
    const quarantined = ['spec/cart.spec.ts', 'checkout total'];
    const other = ['spec/cart.spec.ts checkout', 'total'];
    for (const [branch, run] of [['main', '1'], ['feature/tax', '2'], ['feature/cart', '3']]) {
      const { code, output } = await runVerdict({ ...suite({ flaky: [quarantined] }), ...recordingTo(tracker, { branch, run }) });
      assert.equal(code, 0, output);
    }
    assert.ok(tracker.records[0].labels.includes('quarantined'), 'the first test is quarantined');
    const { code, summary } = await runVerdict({ ...suite({ broken: [other] }), ...recordingTo(tracker, { run: '4' }) });
    assert.equal(code, 1);
    assert.doesNotMatch(lineAbout(summary, 'failed on both attempts'), /ignored/i);
  }));

// A record's history when a fix closed it two days ago and a person reopened
// it by hand a day later.
const reopenedByHand = (...before) => [
  ...before,
  { action: 'closed', date: daysAgo(2) },
  { action: 'reopened', date: daysAgo(1) },
];

trackerTest('occurrences from before a person reopened the record do not count toward quarantine', ({ withTracker }) =>
  withTracker(
    {
      records: [
        {
          title: CHECKOUT_TITLE,
          comments: [earlier({ daysAgo: 4, branch: 'main' }), earlier({ daysAgo: 3, branch: 'feature/tax' })],
          history: reopenedByHand(),
        },
      ],
    },
    async (tracker) => {
      const { code, summary, output } = await runVerdict({
        ...suite({ flaky: [CHECKOUT] }),
        ...recordingTo(tracker, { branch: 'feature/cart' }),
      });
      assert.equal(code, 0, output);
      assert.deepEqual(tracker.records[0].labels, ['flaky-test']);
      const line = lineAbout(summary, CHECKOUT_TITLE);
      assert.match(line, /1 occurrence on 1 branch in 30 days/i);
      assert.doesNotMatch(line, /quarantined/i);
    },
  ));

trackerTest('a quarantine label left from before the record closed does not quarantine the test once a person reopens it', ({ withTracker }) =>
  withTracker(
    {
      records: [
        {
          title: CHECKOUT_TITLE,
          labels: ['flaky-test', 'quarantined'],
          history: reopenedByHand({ action: 'labeled', label: 'quarantined', date: daysAgo(10) }),
        },
      ],
    },
    async (tracker) => {
      const { code, summary } = await runVerdict({ ...suite({ broken: [CHECKOUT] }), ...recordingTo(tracker) });
      assert.equal(code, 1);
      assert.match(summary, /verdict: fail/i);
      const line = lineAbout(summary, CHECKOUT_TITLE);
      assert.doesNotMatch(line, /ignored/i);
      assert.match(line, /from before it last closed/i);
    },
  ));

trackerTest('a flake occurrence on a record a person reopened takes off the quarantine label left from before it closed', ({ withTracker }) =>
  withTracker(
    {
      records: [
        {
          title: CHECKOUT_TITLE,
          labels: ['flaky-test', 'quarantined'],
          comments: [earlier({ daysAgo: 4, branch: 'main' }), earlier({ daysAgo: 3, branch: 'feature/tax' })],
          history: reopenedByHand({ action: 'labeled', label: 'quarantined', date: daysAgo(10) }),
        },
      ],
    },
    async (tracker) => {
      const { code, summary, output } = await runVerdict({
        ...suite({ flaky: [CHECKOUT] }),
        ...recordingTo(tracker, { branch: 'feature/cart' }),
      });
      assert.equal(code, 0, output);
      assert.deepEqual(tracker.records[0].labels, ['flaky-test']);
      const line = lineAbout(summary, CHECKOUT_TITLE);
      assert.match(line, /took off its `quarantined` label/i);
      assert.match(line, /1 occurrence on 1 branch in 30 days/i);
      assert.doesNotMatch(line, /already quarantined/i);
    },
  ));

trackerTest('a quarantine label put on after a person reopened the record still quarantines the test', ({ withTracker }) =>
  withTracker(
    {
      records: [
        {
          title: CHECKOUT_TITLE,
          labels: ['flaky-test', 'quarantined'],
          history: [...reopenedByHand(), { action: 'labeled', label: 'quarantined', date: daysAgo(0.5) }],
        },
      ],
    },
    async (tracker) => {
      const { code, summary, output } = await runVerdict({ ...suite({ broken: [CHECKOUT] }), ...recordingTo(tracker) });
      assert.equal(code, 0, output);
      assert.match(lineAbout(summary, CHECKOUT_TITLE), /ignored.*quarantined/i);
    },
  ));

trackerTest('when the tracker lists the records but refuses to read a record\'s history, its quarantine label stands, and the summary says so', ({ withTracker }) =>
  withTracker(
    {
      records: [{ title: CHECKOUT_TITLE, labels: ['flaky-test', 'quarantined'], history: reopenedByHand() }],
      refuse: ({ action }) => /events/.test(action ?? ''),
    },
    async (tracker) => {
      const { code, summary, output } = await runVerdict({ ...suite({ broken: [CHECKOUT] }), ...recordingTo(tracker) });
      assert.equal(code, 0, output);
      const line = lineAbout(summary, CHECKOUT_TITLE);
      assert.match(line, /ignored.*quarantined/i);
      assert.match(line, /history .*refused .*403/i);
    },
  ));

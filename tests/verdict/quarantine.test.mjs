import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runVerdict, runVerdictWith, junit, passed, failed, lineAbout, recordingTo, withTracker } from './harness.mjs';
import { unreachableUrl } from './fake-github.mjs';

// The failures this guards: a quarantined test that still fails the build; a
// failure let through by a quarantine read from a closed record, or from a
// label a reopened record kept; a test quarantined on too few occurrences, on
// old ones, on ones from before a reopen or on one branch's; a quarantine past
// the cap, or one the cap stopped without the summary saying so. Each test
// runs the real verdict script against a fake GitHub tracker and reads the
// exit code, the run summary and the records the tracker holds afterwards.

const CHECKOUT = ['tests.test_cart', 'test_checkout_total'];
const CHECKOUT_TITLE = 'tests.test_cart test_checkout_total';

const TAX = ['tests.test_tax', 'test_vat_rounding'];
const TAX_TITLE = 'tests.test_tax test_vat_rounding';

// An earlier flake occurrence as the comment the script writes, in the marker
// format the script's header documents, from `daysAgo` days before now.
const DAY_MS = 24 * 60 * 60 * 1000;
let runs = 1000;
const earlier = ({ daysAgo = 1, branch = 'main', run = String(++runs), reopened } = {}) => {
  const date = new Date(Date.now() - daysAgo * DAY_MS).toISOString().replace(/\.\d+Z$/, 'Z');
  const run_url = `https://ci.example/acme/shop/runs/${run}`;
  const data = { date, branch, job: 'test', run, run_url, ...(reopened && { reopened }) };
  return [
    'Flake occurrence: failed on attempt 1 and passed on attempt 2.',
    '',
    `<!-- verdict-occurrence ${JSON.stringify(data)} -->`,
  ].join('\n');
};

// Two recent occurrences on two branches: the next occurrence, from any
// branch, brings the record to quarantine.
const twoOccurrences = () => [earlier({ daysAgo: 3, branch: 'main' }), earlier({ daysAgo: 1, branch: 'feature/tax' })];

// Open records of other tests, already quarantined.
const quarantinedOthers = (count) =>
  Array.from({ length: count }, (_, i) => ({ title: `tests.test_other test_q${i}`, labels: ['flaky-test', 'quarantined'] }));

// Test command runs over a suite of `size` tests, in which each `flaky` test
// fails on attempt 1 and passes on attempt 2, each `broken` test fails on both
// attempts, and the rest pass.
const suite = ({ size = 40, flaky = [], broken = [] }) => {
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

test('a test that fails both attempts does not fail the build while its open record carries the quarantine label', () =>
  withTracker({ records: [{ title: CHECKOUT_TITLE, labels: ['flaky-test', 'quarantined'] }] }, async (tracker) => {
    const { code, summary, output } = await runVerdict({ ...suite({ broken: [CHECKOUT] }), ...recordingTo(tracker) });
    assert.equal(code, 0, output);
    assert.match(summary, /verdict: pass/i);
    const line = lineAbout(summary, CHECKOUT_TITLE);
    assert.match(line, /failed on both attempts/i);
    assert.match(line, /ignored.*quarantined/i);
    assert.ok(line.includes(tracker.records[0].url), line);
  }));

test('a closed record ends its quarantine, so a test that fails both attempts fails the build', () =>
  withTracker(
    { records: [{ title: CHECKOUT_TITLE, state: 'closed', labels: ['flaky-test', 'quarantined'] }] },
    async (tracker) => {
      const { code, summary } = await runVerdict({ ...suite({ broken: [CHECKOUT] }), ...recordingTo(tracker) });
      assert.equal(code, 1);
      assert.match(summary, /verdict: fail/i);
      assert.doesNotMatch(lineAbout(summary, CHECKOUT_TITLE), /ignored/i);
    },
  ));

test('with the tracker unreachable nothing is quarantined: a test that fails both attempts fails the build, and the summary says why', async () => {
  const tracker = { url: await unreachableUrl(), repo: 'acme/shop', token: 'fake-token' };
  const { code, summary } = await runVerdict({ ...suite({ broken: [CHECKOUT] }), ...recordingTo(tracker) });
  assert.equal(code, 1);
  assert.match(summary, /verdict: fail/i);
  assert.match(lineAbout(summary, CHECKOUT_TITLE), /failed on both attempts/i);
  const line = lineAbout(summary, 'could not be reached');
  assert.match(line, /no test is treated as quarantined/i);
});

test('with a read-only token the quarantine list is still read, so a quarantined test that fails both attempts does not fail the build', () =>
  withTracker(
    { readOnly: true, records: [{ title: CHECKOUT_TITLE, labels: ['flaky-test', 'quarantined'] }] },
    async (tracker) => {
      const { code, summary, output } = await runVerdict({ ...suite({ broken: [CHECKOUT] }), ...recordingTo(tracker) });
      assert.equal(code, 0, output);
      assert.match(lineAbout(summary, CHECKOUT_TITLE), /ignored/i);
    },
  ));

test('the summary line for each flake occurrence shows its count toward quarantine', () =>
  withTracker({ records: [{ title: CHECKOUT_TITLE, comments: [earlier({ daysAgo: 2, branch: 'main' })] }] }, async (tracker) => {
    const { code, summary, output } = await runVerdict({
      ...suite({ flaky: [CHECKOUT, TAX] }),
      ...recordingTo(tracker, { branch: 'feature/cart' }),
    });
    assert.equal(code, 0, output);
    assert.match(lineAbout(summary, CHECKOUT_TITLE), /2 occurrences on 2 branches in 30 days \(it takes 3 on at least 2\)/i);
    assert.match(lineAbout(summary, TAX_TITLE), /1 occurrence on 1 branch in 30 days \(it takes 3 on at least 2\)/i);
  }));

test('the occurrence that makes three in 30 days across two branches puts the quarantine label on the record', () =>
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

test('three occurrences on one branch do not quarantine the test', () =>
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

test('an occurrence more than 30 days old does not count toward quarantine', () =>
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

test('occurrences from before the record was last reopened do not count toward quarantine', () =>
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

test('a flake occurrence that reopens a record takes off its quarantine label, and the count starts again', () =>
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

test('the cap stops a quarantine once 5% of the suite is quarantined, and the summary warns about it first', () =>
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

test('a flake occurrence of a quarantined test is recorded, and the summary says it is already quarantined', () =>
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
      assert.equal(tracker.requests.filter(({ path }) => path.endsWith('/labels')).length, 0, 'no label request');
    },
  ));

test('the default cap is 5% of the tests in the results file, rounded down', async () => {
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

test('the cap holds across the tests of one job: past it, a second qualifying test is not quarantined', () =>
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

test('--quarantine-cap sets the cap as a share of the suite or as a number of tests', async () => {
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

test('--flaky-label and --quarantine-label set the label names quarantine reads and applies', () =>
  withTracker(
    {
      records: [
        { title: CHECKOUT_TITLE, labels: ['ci-flake', 'ci-quarantine'] },
        { title: TAX_TITLE, labels: ['ci-flake'], comments: twoOccurrences() },
      ],
    },
    async (tracker) => {
      const { flags, env } = recordingTo(tracker, { branch: 'feature/cart' });
      const { code, summary, output } = await runVerdict({
        ...suite({ broken: [CHECKOUT], flaky: [TAX] }),
        flags: [...flags, '--flaky-label', 'ci-flake', '--quarantine-label', 'ci-quarantine'],
        env,
      });
      assert.equal(code, 0, output);
      assert.match(lineAbout(summary, CHECKOUT_TITLE), /ignored/i);
      assert.deepEqual(tracker.records[1].labels, ['ci-flake', 'ci-quarantine']);
      assert.match(lineAbout(summary, TAX_TITLE), /now quarantined.*`ci-quarantine`/i);
    },
  ));

test('a quarantined test that fails attempt 1 and has no result on attempt 2 does not fail the build', () =>
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

test('two occurrences of one run on a record, left by two jobs racing, count once toward quarantine', () => {
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

test('a job whose run another job already recorded shows the count toward quarantine too', () =>
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

test('when the tracker refuses the quarantine label, the occurrence still counts as recorded and the summary says the test was not quarantined', () =>
  withTracker(
    {
      records: [{ title: CHECKOUT_TITLE, comments: twoOccurrences() }],
      refuse: ({ method, path }) => method === 'POST' && path.endsWith('/labels'),
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

test('when the tracker refuses to take a closed record\'s quarantine label off, the record stays closed and out of quarantine', () =>
  withTracker(
    {
      records: [{ title: CHECKOUT_TITLE, state: 'closed', labels: ['flaky-test', 'quarantined'] }],
      refuse: ({ method }) => method === 'DELETE',
    },
    async (tracker) => {
      const { code, summary, output } = await runVerdict({ ...suite({ flaky: [CHECKOUT] }), ...recordingTo(tracker) });
      assert.equal(code, 0, output);
      assert.equal(tracker.records[0].state, 'closed');
      assert.match(lineAbout(summary, CHECKOUT_TITLE), /not recorded/i);
    },
  ));

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runVerdict, runVerdictWith, junit, passed, lineAbout, recordingTo, trackerTest, github, gitlab, occurrencesOn, OCCURRENCE, suite, earlier } from './harness.mjs';

// The failures this guards: a flake occurrence that never reaches its
// flaky-test record, a record created twice for one test, a run counted twice
// because several of its jobs saw the same flake occurrence, and a tracker
// problem that changes the verdict. Each test runs the real verdict script
// against a fake tracker, GitHub's and GitLab's in turn unless it names one,
// and reads the exit code, the run summary and what the tracker received.

const CHECKOUT = ['tests.test_cart', 'test_checkout_total'];
const TAX = ['tests.test_tax', 'test_vat_rounding'];

trackerTest('a first flake occurrence creates a flaky-test record titled with the test identity, labelled flaky and ready-for-agent', ({ withTracker }) =>
  withTracker({}, async (tracker) => {
    const { code, summary, output } = await runVerdict({
      ...suite({ flaky: [CHECKOUT] }),
      ...recordingTo(tracker),
    });
    assert.equal(code, 0, output);
    assert.equal(tracker.records.length, 1, output);
    const [record] = tracker.records;
    assert.equal(record.title, 'tests.test_cart test_checkout_total');
    assert.deepEqual(record.labels.toSorted(), ['flaky-test', 'ready-for-agent']);
    assert.match(lineAbout(summary, 'tests.test_cart test_checkout_total'), /recorded on \[#1\]/i);
    assert.ok(lineAbout(summary, 'tests.test_cart test_checkout_total').includes(record.url), summary);
  }));

trackerTest('with no tracker token the build still passes, nothing is sent and the summary says the occurrence was not recorded', ({ withTracker }) =>
  withTracker({}, async (tracker) => {
    const { flags } = recordingTo(tracker);
    const { code, summary, output } = await runVerdict({
      ...suite({ flaky: [CHECKOUT] }),
      flags,
    });
    assert.equal(code, 0, output);
    assert.deepEqual(tracker.requests, []);
    const line = lineAbout(summary, 'tests.test_cart test_checkout_total');
    assert.match(line, /flake occurrence/i);
    assert.match(line, /not recorded/i);
    assert.match(line, /VERDICT_TRACKER_TOKEN/);
  }));

trackerTest('each flake occurrence is a comment on the record giving its date, branch, job and run link', ({ withTracker }) =>
  withTracker({}, async (tracker) => {
    const before = new Date();
    const { code, output } = await runVerdict({
      ...suite({ flaky: [CHECKOUT] }),
      ...recordingTo(tracker, { branch: 'feature/cart', job: 'test (windows-latest)', run: '4242' }),
    });
    const after = new Date();
    assert.equal(code, 0, output);
    const [record] = tracker.records;
    const [occurrence, ...more] = occurrencesOn(record);
    assert.deepEqual(more, [], 'one occurrence');
    assert.equal(occurrence.branch, 'feature/cart');
    assert.equal(occurrence.job, 'test (windows-latest)');
    assert.equal(occurrence.run, '4242');
    assert.equal(occurrence.run_url, 'https://ci.example/acme/shop/runs/4242');
    assert.match(occurrence.date, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    const date = new Date(occurrence.date);
    assert.ok(date >= new Date(before.getTime() - 1000) && date <= after, `${occurrence.date} is during the run`);
    const [comment] = record.comments;
    for (const shown of ['feature/cart', 'test (windows-latest)', 'https://ci.example/acme/shop/runs/4242', occurrence.date]) {
      assert.ok(comment.split('<!--')[0].includes(shown), `the comment shows people ${shown}`);
    }
  }));

trackerTest('a later flake occurrence is a new comment on the record whose title is exactly the test identity', ({ withTracker }) =>
  withTracker(
    {
      records: [
        { title: 'tests.test_cart test_checkout_total_with_tax' },
        { title: 'tests.test_cart test_checkout_total', comments: ['An earlier note.'] },
        { title: 'other tests.test_cart test_checkout_total' },
      ],
    },
    async (tracker) => {
      const { code, summary, output } = await runVerdict({
        ...suite({ flaky: [CHECKOUT] }),
        ...recordingTo(tracker),
      });
      assert.equal(code, 0, output);
      assert.equal(tracker.records.length, 3, 'no record created');
      const [nearBefore, record, nearAfter] = tracker.records;
      const occurrences = occurrencesOn(record);
      assert.equal(occurrences.length, 1);
      assert.equal(occurrences[0].reopened, undefined, 'an open record is not reopened');
      assert.equal(record.comments.length, 2);
      assert.deepEqual([nearBefore.comments, nearAfter.comments], [[], []]);
      const line = lineAbout(summary, 'tests.test_cart test_checkout_total');
      assert.match(line, /recorded on \[#2\]/i);
      assert.doesNotMatch(line, /reopen/i);
    },
  ));

trackerTest('a flake occurrence on a closed record reopens it, and that occurrence says it reopened the record', ({ withTracker }) =>
  withTracker({ records: [{ title: 'tests.test_cart test_checkout_total', state: 'closed' }] }, async (tracker) => {
    const { code, summary, output } = await runVerdict({
      ...suite({ flaky: [CHECKOUT] }),
      ...recordingTo(tracker),
    });
    assert.equal(code, 0, output);
    assert.equal(tracker.records.length, 1, 'no record created');
    const [record] = tracker.records;
    assert.equal(record.state, 'open');
    const [occurrence] = occurrencesOn(record);
    assert.equal(occurrence.reopened, true);
    assert.match(lineAbout(summary, 'tests.test_cart test_checkout_total'), /reopen/i);
  }));

trackerTest('several jobs of one run that see the same flake occurrence leave one occurrence on the record, and a later run adds its own', ({ withTracker }) =>
  withTracker({}, async (tracker) => {
    const runs = suite({ flaky: [CHECKOUT] });
    const linux = await runVerdict({ ...runs, ...recordingTo(tracker, { job: 'test (ubuntu-latest)', run: '4242' }) });
    const windows = await runVerdict({ ...runs, ...recordingTo(tracker, { job: 'test (windows-latest)', run: '4242' }) });
    assert.equal(linux.code, 0, linux.output);
    assert.equal(windows.code, 0, windows.output);
    assert.equal(tracker.records.length, 1, 'one record');
    assert.deepEqual(
      occurrencesOn(tracker.records[0]).map(({ run, job }) => [run, job]),
      [['4242', 'test (ubuntu-latest)']],
    );
    assert.match(lineAbout(windows.summary, 'tests.test_cart test_checkout_total'), /already recorded on \[#1\].* for this run/i);

    const nextRun = await runVerdict({ ...runs, ...recordingTo(tracker, { job: 'test (windows-latest)', run: '4243' }) });
    assert.equal(nextRun.code, 0, nextRun.output);
    assert.deepEqual(
      occurrencesOn(tracker.records[0]).map(({ run }) => run),
      ['4242', '4243'],
    );
  }));

trackerTest('with the tracker unreachable the build still passes and the summary says the occurrence was not recorded', async ({ unreachable }) => {
  const tracker = await unreachable();
  const { code, summary, output } = await runVerdict({
    ...suite({ flaky: [CHECKOUT] }),
    ...recordingTo(tracker),
  });
  assert.equal(code, 0, output);
  assert.match(summary, /verdict: pass/i);
  const line = lineAbout(summary, 'tests.test_cart test_checkout_total');
  assert.match(line, /not recorded/i);
  assert.match(line, /could not be reached/i);
});

trackerTest('with a read-only token the build still passes and the summary says the tracker refused to record the occurrence', ({ withTracker }) =>
  withTracker({ readOnly: true, records: [{ title: 'tests.test_tax test_vat_rounding' }] }, async (tracker) => {
    const { code, summary, output } = await runVerdict({
      ...suite({ flaky: [CHECKOUT, TAX] }),
      ...recordingTo(tracker),
    });
    assert.equal(code, 0, output);
    assert.match(summary, /verdict: pass/i);
    for (const test of ['tests.test_cart test_checkout_total', 'tests.test_tax test_vat_rounding']) {
      const line = lineAbout(summary, test);
      assert.match(line, /not recorded/i, test);
      assert.match(line, /refused .*403/i, test);
    }
    assert.equal(tracker.records.length, 1);
    assert.deepEqual(tracker.records[0].comments, []);
  }));

test('on GitHub Actions the tracker settings come from the job environment', () =>
  github.withTracker({}, async (tracker) => {
    const github = {
      GITHUB_API_URL: tracker.url,
      GITHUB_REPOSITORY: tracker.repo,
      GITHUB_TOKEN: tracker.token,
      GITHUB_SERVER_URL: 'https://github.example',
      GITHUB_JOB: 'test',
    };
    const events = [
      { GITHUB_RUN_ID: '4242', GITHUB_HEAD_REF: 'feature/cart', GITHUB_REF_NAME: '17/merge' },
      { GITHUB_RUN_ID: '4243', GITHUB_HEAD_REF: '', GITHUB_REF_NAME: 'main' },
    ];
    for (const event of events) {
      const { code, output } = await runVerdict({
        ...suite({ flaky: [CHECKOUT] }),
        env: { ...github, ...event },
      });
      assert.equal(code, 0, output);
    }
    assert.deepEqual(
      occurrencesOn(tracker.records[0]).map(({ branch, job, run, run_url }) => ({ branch, job, run, run_url })),
      [
        { branch: 'feature/cart', job: 'test', run: '4242', run_url: 'https://github.example/acme/shop/actions/runs/4242' },
        { branch: 'main', job: 'test', run: '4243', run_url: 'https://github.example/acme/shop/actions/runs/4243' },
      ],
    );
  }));

test('on GitLab CI the tracker and its settings come from the job environment', () =>
  gitlab.withTracker({ repo: 'acme/web/shop' }, async (tracker) => {
    const ci = {
      GITLAB_CI: 'true',
      CI_API_V4_URL: tracker.url,
      CI_PROJECT_PATH: 'acme/web/shop',
      CI_JOB_NAME: 'test: [ubuntu, 22]',
      CI_JOB_TOKEN: 'a-job-token-the-tracker-refuses',
      VERDICT_TRACKER_TOKEN: tracker.token,
    };
    const pipelines = [
      {
        CI_PIPELINE_ID: '4242',
        CI_PIPELINE_URL: 'https://gitlab.example/acme/web/shop/-/pipelines/4242',
        CI_MERGE_REQUEST_SOURCE_BRANCH_NAME: 'feature/cart',
        CI_COMMIT_REF_NAME: 'refs/merge-requests/17/head',
      },
      {
        CI_PIPELINE_ID: '4243',
        CI_PIPELINE_URL: 'https://gitlab.example/acme/web/shop/-/pipelines/4243',
        CI_COMMIT_REF_NAME: 'main',
      },
    ];
    for (const pipeline of pipelines) {
      const { code, output } = await runVerdict({
        ...suite({ flaky: [CHECKOUT] }),
        env: { ...ci, ...pipeline },
      });
      assert.equal(code, 0, output);
    }
    assert.equal(tracker.records.length, 1);
    assert.deepEqual(
      occurrencesOn(tracker.records[0]).map(({ branch, job, run, run_url }) => ({ branch, job, run, run_url })),
      [
        { branch: 'feature/cart', job: 'test: [ubuntu, 22]', run: '4242', run_url: 'https://gitlab.example/acme/web/shop/-/pipelines/4242' },
        { branch: 'main', job: 'test: [ubuntu, 22]', run: '4243', run_url: 'https://gitlab.example/acme/web/shop/-/pipelines/4243' },
      ],
    );
  }));

test('VERDICT_TRACKER chooses the tracker, and --tracker overrides it', async () => {
  const runs = suite({ flaky: [CHECKOUT] });
  await gitlab.withTracker({}, async (tracker) => {
    const { flags, env } = recordingTo(tracker);
    const withoutChoice = flags.filter((_, i) => flags[i] !== '--tracker' && flags[i - 1] !== '--tracker');
    const { code, output } = await runVerdict({ ...runs, flags: withoutChoice, env: { ...env, VERDICT_TRACKER: 'gitlab' } });
    assert.equal(code, 0, output);
    assert.equal(tracker.records.length, 1, output);
  });
  await github.withTracker({}, async (tracker) => {
    const { flags, env } = recordingTo(tracker);
    const { code, output } = await runVerdict({ ...runs, flags, env: { ...env, VERDICT_TRACKER: 'gitlab', GITLAB_CI: 'true' } });
    assert.equal(code, 0, output);
    assert.equal(tracker.records.length, 1, output);
  });
});

test('the script refuses a tracker other than github or gitlab', async () => {
  const { code, output } = await runVerdictWith(['--tracker', 'jira', '--results', 'results.xml', '--', 'pytest']);
  assert.equal(code, 2);
  assert.match(output, /--tracker takes github or gitlab/);
});

trackerTest('a record listed after the first page is still found, so no second record is created', ({ withTracker }) => {
  const others = Array.from({ length: 150 }, (_, i) => ({ title: `tests.test_other test_${i}`, state: 'closed' }));
  return withTracker({ records: [{ title: 'tests.test_cart test_checkout_total' }, ...others] }, async (tracker) => {
    const { code, output } = await runVerdict({
      ...suite({ flaky: [CHECKOUT] }),
      ...recordingTo(tracker),
    });
    assert.equal(code, 0, output);
    assert.equal(tracker.records.length, 151, 'no record created');
    assert.equal(occurrencesOn(tracker.records[0]).length, 1);
  });
});

trackerTest('an occurrence of this run listed after the first page of comments still counts, so no second one is added', ({ withTracker }) => {
  const notes = Array.from({ length: 120 }, (_, i) => `A note ${i}.`);
  const thisRun = earlier({ daysAgo: 0, branch: 'feature/cart', job: 'test (ubuntu-latest)', run: '4242' });
  return withTracker(
    { records: [{ title: 'tests.test_cart test_checkout_total', comments: [...notes, thisRun] }] },
    async (tracker) => {
      const { code, summary, output } = await runVerdict({
        ...suite({ flaky: [CHECKOUT] }),
        ...recordingTo(tracker, { job: 'test (windows-latest)', run: '4242' }),
      });
      assert.equal(code, 0, output);
      assert.equal(tracker.records[0].comments.length, 121, 'no comment added');
      assert.match(lineAbout(summary, 'tests.test_cart test_checkout_total'), /already recorded/i);
    },
  );
});

trackerTest('each case of a parameterised test has its own record', ({ withTracker }) =>
  withTracker({}, async (tracker) => {
    const { code, summary, output } = await runVerdict({
      ...suite({ flaky: [['tests.test_tax', 'test_rate[uk]'], ['tests.test_tax', 'test_rate[de]']] }),
      ...recordingTo(tracker),
    });
    assert.equal(code, 0, output);
    assert.deepEqual(tracker.records.map((record) => record.title).toSorted(), [
      'tests.test_tax test_rate[de]',
      'tests.test_tax test_rate[uk]',
    ]);
    for (const record of tracker.records) assert.equal(occurrencesOn(record).length, 1, record.title);
    assert.notEqual(lineAbout(summary, 'test_rate[uk]'), lineAbout(summary, 'test_rate[de]'));
  }));

trackerTest('a branch or job name holding markup reads back exactly from the occurrence, which stays hidden in one HTML comment', ({ withTracker }) =>
  withTracker({}, async (tracker) => {
    const branch = 'fix/a-->b<c>&d';
    const job = 'test `node` --> <24>';
    const { code, output } = await runVerdict({
      ...suite({ flaky: [CHECKOUT] }),
      ...recordingTo(tracker, { branch, job }),
    });
    assert.equal(code, 0, output);
    const [occurrence] = occurrencesOn(tracker.records[0]);
    assert.equal(occurrence.branch, branch);
    assert.equal(occurrence.job, job);
    const [line] = tracker.records[0].comments[0].match(OCCURRENCE);
    assert.equal(line.indexOf('-->'), line.length - 3, 'the marker holds no earlier -->');
  }));

trackerTest('a run with no flake occurrence sends the tracker nothing', ({ withTracker }) =>
  withTracker({}, async (tracker) => {
    const { code, output } = await runVerdict({
      testRuns: [{ exit: 0, xml: junit(passed('tests.test_cart', 'test_add_item')) }],
      ...recordingTo(tracker),
    });
    assert.equal(code, 0, output);
    assert.deepEqual(tracker.requests, []);
  }));

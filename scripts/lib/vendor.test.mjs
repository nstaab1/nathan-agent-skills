import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractSubtree } from './vendor.mjs';

// The failure this guards: as a shell pipeline the exit status is tar's, so a
// failed `git archive` reported success and the empty result was committed as
// the new baseline, destroying what every adopted skill diffs against.
let repo, dest;

before(() => {
  repo = mkdtempSync(join(tmpdir(), 'skills-vendor-'));
  const run = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  run('init', '-q');
  run('config', 'user.email', 'test@example.com');
  run('config', 'user.name', 'Test');
  mkdirSync(join(repo, 'pack/skills/one'), { recursive: true });
  writeFileSync(join(repo, 'pack/skills/one/SKILL.md'), 'skill\n');
  writeFileSync(join(repo, 'LICENCE'), 'licence\n');
  run('add', '-A');
  run('commit', '-qm', 'seed');
});

after(() => rmSync(repo, { recursive: true, force: true }));

const freshDest = () => {
  dest = mkdtempSync(join(tmpdir(), 'skills-dest-'));
  return dest;
};

test('extracts the requested paths', () => {
  const d = freshDest();
  extractSubtree({ sha: 'HEAD', paths: ['pack', 'LICENCE'], dest: d, cwd: repo });
  assert.equal(readFileSync(join(d, 'pack/skills/one/SKILL.md'), 'utf8'), 'skill\n');
  assert.equal(readFileSync(join(d, 'LICENCE'), 'utf8'), 'licence\n');
  rmSync(d, { recursive: true, force: true });
});

test('strip removes leading path components', () => {
  const d = freshDest();
  extractSubtree({ sha: 'HEAD', paths: ['pack'], strip: 1, dest: d, cwd: repo });
  assert.equal(readFileSync(join(d, 'skills/one/SKILL.md'), 'utf8'), 'skill\n');
  rmSync(d, { recursive: true, force: true });
});

test('a bad ref throws instead of silently leaving an empty mirror', () => {
  const d = freshDest();
  assert.throws(() => extractSubtree({ sha: 'nosuchref', paths: ['pack'], dest: d, cwd: repo }), /git archive failed/);
  assert.equal(readdirSync(d).length, 0);
  rmSync(d, { recursive: true, force: true });
});

test('a path that does not exist at that ref throws', () => {
  const d = freshDest();
  assert.throws(() => extractSubtree({ sha: 'HEAD', paths: ['absent'], dest: d, cwd: repo }), /git archive failed/);
  rmSync(d, { recursive: true, force: true });
});

test('an extraction that produces nothing throws rather than returning', () => {
  const d = freshDest();
  // An empty directory is not tracked by git, so archiving it yields no files.
  assert.throws(
    () => extractSubtree({ sha: 'HEAD', paths: ['pack'], strip: 9, dest: d, cwd: repo }),
    /produced nothing|tar failed/
  );
  rmSync(d, { recursive: true, force: true });
});

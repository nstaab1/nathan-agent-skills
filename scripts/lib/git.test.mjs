import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { showFile, readTree, lsTree } from './git.mjs';

// Reading a blob out of a git tree must be byte-exact. Trailing newlines are
// the whole ballgame: strip them and every adopted file reads as modified.
// Built as a throwaway repo so the assertions never depend on this repo's
// working tree matching HEAD.
let dir;
const NEWLINE = 'ends with a newline\n';
const NO_NEWLINE = 'no trailing newline';

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'skills-git-'));
  const run = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  run('init', '-q');
  run('config', 'user.email', 'test@example.com');
  run('config', 'user.name', 'Test');
  mkdirSync(join(dir, 'pack/skill/nested'), { recursive: true });
  writeFileSync(join(dir, 'pack/skill/SKILL.md'), NEWLINE);
  writeFileSync(join(dir, 'pack/skill/nested/ref.md'), NO_NEWLINE);
  run('add', '-A');
  run('commit', '-qm', 'seed');
});

after(() => rmSync(dir, { recursive: true, force: true }));

const at = (fn) => {
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    return fn();
  } finally {
    process.chdir(cwd);
  }
};

test('showFile keeps a trailing newline', () => {
  assert.equal(at(() => showFile('HEAD', 'pack/skill/SKILL.md')), NEWLINE);
});

test('showFile does not invent a trailing newline', () => {
  assert.equal(at(() => showFile('HEAD', 'pack/skill/nested/ref.md')), NO_NEWLINE);
});

test('readTree returns every file under the prefix, byte for byte', () => {
  const tree = at(() => readTree('HEAD', 'pack/skill'));
  assert.deepEqual([...tree.keys()].sort(), ['SKILL.md', 'nested/ref.md']);
  assert.equal(tree.get('SKILL.md'), NEWLINE);
  assert.equal(tree.get('nested/ref.md'), NO_NEWLINE);
});

test('readTree is empty for a path that does not exist at that ref', () => {
  assert.equal(at(() => readTree('HEAD', 'pack/absent')).size, 0);
});

test('lsTree lists paths relative to the prefix', () => {
  assert.deepEqual(at(() => lsTree('HEAD', 'pack/skill')).sort(), ['SKILL.md', 'nested/ref.md']);
});

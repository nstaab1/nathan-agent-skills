import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { showFile, readTree, lsTree, tryShowFile, branchExists, remoteBranchExists } from './git.mjs';

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

test('tryShowFile returns undefined for a path absent at that ref', () => {
  assert.equal(at(() => tryShowFile('HEAD', 'pack/skill/absent.md')), undefined);
});

test('tryShowFile returns content byte-exactly when present', () => {
  assert.equal(at(() => tryShowFile('HEAD', 'pack/skill/SKILL.md')), NEWLINE);
});

test('remoteBranchExists sees a branch that exists only on the remote', () => {
  const bare = mkdtempSync(join(tmpdir(), 'skills-bare-'));
  const clone = mkdtempSync(join(tmpdir(), 'skills-clone-'));
  const run = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'ignore' });
  try {
    run(bare, 'init', '-q', '--bare', '--initial-branch=main');
    // Publish a `vendor` branch, then clone: locally only origin/vendor exists.
    const seed = mkdtempSync(join(tmpdir(), 'skills-seed-'));
    run(seed, 'init', '-q', '--initial-branch=main');
    run(seed, 'config', 'user.email', 'test@example.com');
    run(seed, 'config', 'user.name', 'Test');
    writeFileSync(join(seed, 'f.txt'), 'x\n');
    run(seed, 'add', '-A');
    run(seed, 'commit', '-qm', 'seed');
    run(seed, 'branch', 'vendor');
    run(seed, 'remote', 'add', 'origin', bare);
    run(seed, 'push', '-q', 'origin', 'main', 'vendor');
    execFileSync('git', ['clone', '-q', bare, clone], { stdio: 'ignore' });

    const cwd = process.cwd();
    process.chdir(clone);
    try {
      assert.equal(branchExists('vendor'), false, 'local branch must not exist yet');
      assert.equal(remoteBranchExists('origin', 'vendor'), true);
      assert.equal(remoteBranchExists('origin', 'nosuchbranch'), false);
    } finally {
      process.chdir(cwd);
    }
    rmSync(seed, { recursive: true, force: true });
  } finally {
    rmSync(bare, { recursive: true, force: true });
    rmSync(clone, { recursive: true, force: true });
  }
});

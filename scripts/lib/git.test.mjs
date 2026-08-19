import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { showFile, readTree, lsTree } from './git.mjs';

// Reading a blob out of a git tree must be byte-exact. Trailing newlines are
// the whole ballgame: strip them and every file looks locally modified.
const SAMPLE = 'scripts/lib/git.mjs';

test('showFile round-trips a committed file byte for byte', () => {
  const fromGit = showFile('HEAD', 'README.md');
  const fromDisk = readFileSync('README.md', 'utf8');
  assert.equal(fromGit.endsWith('\n'), fromDisk.endsWith('\n'));
});

test('readTree preserves trailing newlines', () => {
  const tree = readTree('HEAD', 'skills/engineering/code-review');
  const skill = tree.get('SKILL.md');
  assert.equal(typeof skill, 'string');
  assert.equal(skill, readFileSync('skills/engineering/code-review/SKILL.md', 'utf8'));
});

test('lsTree lists paths relative to the prefix', () => {
  const files = lsTree('HEAD', 'skills/engineering/code-review');
  assert.ok(files.includes('SKILL.md'), files.join(','));
  assert.ok(!files.some((f) => f.startsWith('skills/')));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffSkill, replaceRegion, renderSkillTable, renderNotices } from './provenance.mjs';

const SKILL = `---
name: unslop
description: d
---

Body.
`;
const ADOPTED = `---
name: unslop-copy
description: d
metadata:
  internal: true
---

Body.
`;

test('a skill differing only in script-owned lines is verbatim', () => {
  const r = diffSkill({
    mine: new Map([['SKILL.md', ADOPTED]]),
    base: new Map([['SKILL.md', SKILL]]),
  });
  assert.equal(r.status, 'verbatim');
  assert.deepEqual(r.changed, []);
});

test('a body edit is modified', () => {
  const r = diffSkill({
    mine: new Map([['SKILL.md', ADOPTED.replace('Body.', 'My body.')]]),
    base: new Map([['SKILL.md', SKILL]]),
  });
  assert.equal(r.status, 'modified');
  assert.deepEqual(r.changed, [{ path: 'SKILL.md', kind: 'edited' }]);
});

test('added and removed files are reported', () => {
  const r = diffSkill({
    mine: new Map([['SKILL.md', ADOPTED], ['NOTES.md', 'x']]),
    base: new Map([['SKILL.md', SKILL], ['OLD.md', 'y']]),
  });
  assert.equal(r.status, 'modified');
  assert.deepEqual(r.changed.sort((a, b) => a.path.localeCompare(b.path)), [
    { path: 'NOTES.md', kind: 'added' },
    { path: 'OLD.md', kind: 'removed' },
  ]);
});

test('non-SKILL.md files compare byte for byte', () => {
  const r = diffSkill({
    mine: new Map([['SKILL.md', ADOPTED], ['ref.md', 'a\n']]),
    base: new Map([['SKILL.md', SKILL], ['ref.md', 'b\n']]),
  });
  assert.deepEqual(r.changed, [{ path: 'ref.md', kind: 'edited' }]);
});

test('replaceRegion swaps content between markers and keeps the rest', () => {
  const doc = 'top\n<!-- skills:begin -->\nold\n<!-- skills:end -->\nbottom\n';
  assert.equal(
    replaceRegion(doc, 'skills', 'new'),
    'top\n<!-- skills:begin -->\nnew\n<!-- skills:end -->\nbottom\n'
  );
});

test('replaceRegion is idempotent', () => {
  const doc = 'a\n<!-- skills:begin -->\nx\n<!-- skills:end -->\nb\n';
  assert.equal(replaceRegion(replaceRegion(doc, 'skills', 'n'), 'skills', 'n'), replaceRegion(doc, 'skills', 'n'));
});

test('replaceRegion refuses a document without markers', () => {
  assert.throws(() => replaceRegion('no markers', 'skills', 'x'), /skills:begin/);
});

test('renderSkillTable groups by folder and names the origin', () => {
  const md = renderSkillTable([
    { key: 'productivity/unslop-copy', name: 'unslop-copy', source: 'pstack', status: 'verbatim', internal: true },
    { key: 'agentic/open-pr-agentic', name: 'open-pr-agentic', source: null, status: 'owned', internal: false },
  ]);
  assert.match(md, /unslop-copy/);
  assert.match(md, /pstack/);
  assert.match(md, /internal/);
  assert.match(md, /\bowned\b/);
});

test('renderNotices lists every upstream with its licence holder and pinned sha', () => {
  const md = renderNotices({
    upstreams: {
      mattpocock: { repo: 'mattpocock/skills', sha: '8b78b53', license: 'MIT', holder: 'Matt Pocock' },
      pstack: { repo: 'cursor/plugins', path: 'pstack', sha: 'abc1234', license: 'MIT', holder: 'Lauren Tan' },
    },
    skills: {
      'productivity/unslop-copy': { source: 'pstack' },
      'engineering/tdd': { source: 'mattpocock' },
      'agentic/x': { source: null },
    },
  });
  assert.match(md, /Matt Pocock/);
  assert.match(md, /Lauren Tan/);
  assert.match(md, /8b78b53/);
  assert.match(md, /abc1234/);
  assert.match(md, /cursor\/plugins/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeText, mergeSkillMd } from './merge.mjs';

const base = 'one\ntwo\nthree\nfour\n';

test('non-overlapping edits merge without conflict', () => {
  const r = mergeText({ base, mine: 'one\ntwo\nthree\nFOUR\n', upstream: 'ONE\ntwo\nthree\nfour\n' });
  assert.equal(r.conflicted, false);
  assert.equal(r.text, 'ONE\ntwo\nthree\nFOUR\n');
});

test('an upstream-only change applies cleanly', () => {
  const r = mergeText({ base, mine: base, upstream: 'one\nTWO\nthree\nfour\n' });
  assert.equal(r.conflicted, false);
  assert.equal(r.text, 'one\nTWO\nthree\nfour\n');
});

test('a local-only change survives', () => {
  const r = mergeText({ base, mine: 'one\nMINE\nthree\nfour\n', upstream: base });
  assert.equal(r.conflicted, false);
  assert.equal(r.text, 'one\nMINE\nthree\nfour\n');
});

test('competing edits to the same line conflict and keep both sides', () => {
  const r = mergeText({ base, mine: 'one\nMINE\nthree\nfour\n', upstream: 'one\nTHEIRS\nthree\nfour\n' });
  assert.equal(r.conflicted, true);
  assert.match(r.text, /<<<<<<</);
  assert.match(r.text, /MINE/);
  assert.match(r.text, /THEIRS/);
});

const upstreamSkill = `---
name: unslop
description: Cut AI tells from any writing.
---

Rule one.
Rule two.
`;

const adopted = `---
name: unslop-copy
description: Cut AI tells from any writing.
metadata:
  internal: true
---

Rule one.
Rule two.
`;

test('mergeSkillMd takes an upstream body change without touching script-owned lines', () => {
  const next = upstreamSkill.replace('Rule two.', 'Rule two, revised.');
  const r = mergeSkillMd({ base: upstreamSkill, mine: adopted, upstream: next });
  assert.equal(r.conflicted, false);
  assert.match(r.text, /name: unslop-copy/);
  assert.match(r.text, /internal: true/);
  assert.match(r.text, /Rule two, revised\./);
});

test('mergeSkillMd does not conflict when upstream rewrites the name line', () => {
  const next = upstreamSkill.replace('name: unslop', 'name: unslop-renamed');
  const r = mergeSkillMd({ base: upstreamSkill, mine: adopted, upstream: next });
  assert.equal(r.conflicted, false);
  assert.equal(r.text, adopted);
});

test('mergeSkillMd takes an upstream description change', () => {
  const next = upstreamSkill.replace('Cut AI tells from any writing.', 'Cut the AI tells.');
  const r = mergeSkillMd({ base: upstreamSkill, mine: adopted, upstream: next });
  assert.equal(r.conflicted, false);
  assert.match(r.text, /description: Cut the AI tells\./);
  assert.match(r.text, /name: unslop-copy/);
});

test('mergeSkillMd still conflicts on a genuine competing body edit', () => {
  const mine = adopted.replace('Rule two.', 'Rule two, my way.');
  const next = upstreamSkill.replace('Rule two.', 'Rule two, their way.');
  const r = mergeSkillMd({ base: upstreamSkill, mine, upstream: next });
  assert.equal(r.conflicted, true);
  assert.match(r.text, /name: unslop-copy/);
});

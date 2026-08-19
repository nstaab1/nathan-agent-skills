import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileTree } from './reconcile.mjs';

const m = (o) => new Map(Object.entries(o));

test('a file added upstream is taken', () => {
  const r = reconcileTree({ base: m({}), next: m({ 'new.md': 'x\n' }), mine: m({}) });
  assert.equal(r.result.get('new.md'), 'x\n');
  assert.equal(r.changes, 1);
  assert.equal(r.conflicts, 0);
});

test('a file deleted upstream that was never touched locally is dropped', () => {
  const r = reconcileTree({ base: m({ 'gone.md': 'a\n' }), next: m({}), mine: m({ 'gone.md': 'a\n' }) });
  assert.equal(r.result.has('gone.md'), false);
  assert.equal(r.changes, 1);
});

test('a file deleted upstream but edited locally is kept', () => {
  const r = reconcileTree({ base: m({ 'gone.md': 'a\n' }), next: m({}), mine: m({ 'gone.md': 'mine\n' }) });
  assert.equal(r.result.get('gone.md'), 'mine\n');
});

test('a purely local file is kept', () => {
  const r = reconcileTree({ base: m({}), next: m({}), mine: m({ 'local.md': 'l\n' }) });
  assert.equal(r.result.get('local.md'), 'l\n');
});

test('a file deleted locally stays deleted even when upstream still has it', () => {
  const r = reconcileTree({ base: m({ 'x.md': 'a\n' }), next: m({ 'x.md': 'b\n' }), mine: m({}) });
  assert.equal(r.result.has('x.md'), false);
});

test('non-overlapping edits merge and count as one change', () => {
  const r = reconcileTree({
    base: m({ 'r.md': 'one\ntwo\nthree\n' }),
    next: m({ 'r.md': 'ONE\ntwo\nthree\n' }),
    mine: m({ 'r.md': 'one\ntwo\nTHREE\n' }),
  });
  assert.equal(r.result.get('r.md'), 'ONE\ntwo\nTHREE\n');
  assert.equal(r.conflicts, 0);
  assert.equal(r.changes, 1);
});

test('competing edits conflict and are counted', () => {
  const r = reconcileTree({
    base: m({ 'r.md': 'one\ntwo\n' }),
    next: m({ 'r.md': 'one\nTHEIRS\n' }),
    mine: m({ 'r.md': 'one\nMINE\n' }),
  });
  assert.equal(r.conflicts, 1);
  assert.match(r.result.get('r.md'), /<<<<<<</);
});

test('an untouched file is carried over and counts as no change', () => {
  const same = 'stable\n';
  const r = reconcileTree({ base: m({ 'r.md': same }), next: m({ 'r.md': same }), mine: m({ 'r.md': same }) });
  assert.equal(r.result.get('r.md'), same);
  assert.equal(r.changes, 0);
  assert.equal(r.conflicts, 0);
});

test('SKILL.md keeps its script-owned lines through the merge', () => {
  const base = '---\nname: s\ndescription: d\n---\n\nBody.\n';
  const next = '---\nname: s\ndescription: CHANGED\n---\n\nBody.\n';
  const mine = '---\nname: s-copy\ndescription: d\nmetadata:\n  internal: true\n---\n\nBody.\n';
  const r = reconcileTree({ base: m({ 'SKILL.md': base }), next: m({ 'SKILL.md': next }), mine: m({ 'SKILL.md': mine }) });
  const out = r.result.get('SKILL.md');
  assert.equal(r.conflicts, 0);
  assert.match(out, /name: s-copy/);
  assert.match(out, /internal: true/);
  assert.match(out, /description: CHANGED/);
});

test('a nested SKILL.md is treated as a skill file too', () => {
  const base = '---\nname: s\ndescription: d\n---\nb\n';
  const r = reconcileTree({
    base: m({ 'sub/SKILL.md': base }),
    next: m({ 'sub/SKILL.md': base.replace('description: d', 'description: D') }),
    mine: m({ 'sub/SKILL.md': base.replace('name: s', 'name: s-copy') }),
  });
  assert.match(r.result.get('sub/SKILL.md'), /name: s-copy/);
  assert.match(r.result.get('sub/SKILL.md'), /description: D/);
});

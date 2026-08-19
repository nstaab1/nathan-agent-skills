import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitFrontmatter, getField, setName, setInternal, stripOwnedLines, isInternal } from './frontmatter.mjs';

const BASIC = `---
name: unslop
description: Cut AI tells from any writing. Must always apply.
---

# Unslop

Body text.
`;

test('splitFrontmatter separates frontmatter lines from body', () => {
  const fm = splitFrontmatter(BASIC);
  assert.deepEqual(fm.lines, [
    'name: unslop',
    'description: Cut AI tells from any writing. Must always apply.',
  ]);
  assert.equal(fm.body.startsWith('\n# Unslop'), true);
});

test('splitFrontmatter returns null when there is no frontmatter', () => {
  assert.equal(splitFrontmatter('# Just a heading\n'), null);
});

test('getField reads a scalar field', () => {
  assert.equal(getField(BASIC, 'name'), 'unslop');
});

test('setName replaces the name and leaves everything else byte-identical', () => {
  const out = setName(BASIC, 'unslop-copy');
  assert.equal(getField(out, 'name'), 'unslop-copy');
  assert.equal(out.replace('name: unslop-copy', 'name: unslop'), BASIC);
});

test('setInternal appends a metadata block when none exists', () => {
  const out = setInternal(BASIC, true);
  assert.match(out, /^metadata:\n {2}internal: true$/m);
  assert.equal(splitFrontmatter(out).body, splitFrontmatter(BASIC).body);
});

test('setInternal reuses an existing metadata block', () => {
  const withMeta = `---
name: x
description: y
metadata:
  category: engineering
---
body
`;
  const out = setInternal(withMeta, true);
  assert.equal(splitFrontmatter(out).lines.filter((l) => l === 'metadata:').length, 1);
  assert.match(out, /metadata:\n {2}internal: true\n {2}category: engineering/);
});

test('setInternal is idempotent', () => {
  const once = setInternal(BASIC, true);
  assert.equal(setInternal(once, true), once);
});

test('setInternal(false) removes the flag', () => {
  assert.equal(setInternal(setInternal(BASIC, true), false), BASIC);
});

test('stripOwnedLines removes name and internal so drift comparison ignores them', () => {
  const mine = setInternal(setName(BASIC, 'unslop-copy'), true);
  assert.equal(stripOwnedLines(mine), stripOwnedLines(BASIC));
});

test('stripOwnedLines still sees a real body change', () => {
  const changed = BASIC.replace('Body text.', 'Different body.');
  assert.notEqual(stripOwnedLines(changed), stripOwnedLines(BASIC));
});

test('stripOwnedLines still sees a description change', () => {
  const changed = BASIC.replace('Cut AI tells', 'Cut the tells');
  assert.notEqual(stripOwnedLines(changed), stripOwnedLines(BASIC));
});

test('isInternal detects the nested flag that getField cannot see', () => {
  assert.equal(isInternal(BASIC), false);
  assert.equal(isInternal(setInternal(BASIC, true)), true);
  assert.equal(getField(setInternal(BASIC, true), 'internal'), undefined);
});

test('setInternal and isInternal agree about a flag under a different parent', () => {
  const other = `---
name: x
description: y
other:
  internal: true
---
body
`;
  // Not our flag: isInternal must not claim it, and setInternal must not eat it.
  assert.equal(isInternal(other), false);
  assert.equal(setInternal(other, false), other);
});

test('setInternal only removes the flag it owns', () => {
  const both = setInternal(`---
name: x
description: y
other:
  internal: true
---
body
`, true);
  assert.equal(isInternal(both), true);
  const off = setInternal(both, false);
  assert.equal(isInternal(off), false);
  assert.match(off, /other:\n {2}internal: true/);
});

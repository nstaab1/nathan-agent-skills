import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getField, setName, setInternal, splitFrontmatter, isInternal } from './frontmatter.mjs';

/**
 * Three-way merge via `git merge-file`, the same engine git uses for a real
 * merge. Returns the merged text and whether conflict markers were left behind.
 */
export function mergeText({ base, mine, upstream, labels = {} }) {
  const dir = mkdtempSync(join(tmpdir(), 'skills-merge-'));
  try {
    const paths = {
      mine: join(dir, 'mine'),
      base: join(dir, 'base'),
      upstream: join(dir, 'upstream'),
    };
    writeFileSync(paths.mine, mine);
    writeFileSync(paths.base, base);
    writeFileSync(paths.upstream, upstream);

    const args = [
      'merge-file',
      '-p',
      '-L',
      labels.mine ?? 'yours',
      '-L',
      labels.base ?? 'baseline',
      '-L',
      labels.upstream ?? 'upstream',
      paths.mine,
      paths.base,
      paths.upstream,
    ];

    try {
      const text = execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      return { text, conflicted: false };
    } catch (err) {
      // Exit status is the conflict count; anything negative is a real failure.
      if (typeof err.status !== 'number' || err.status < 0) throw err;
      return { text: err.stdout, conflicted: true };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Merge a SKILL.md while holding the two fields this script owns constant.
 *
 * `name` and `metadata.internal` are set at adopt time and must never be
 * merged, or every upstream frontmatter edit would conflict against the `-copy`
 * rename. They are reverted to the baseline before merging and re-applied after.
 */
export function mergeSkillMd({ base, mine, upstream, labels }) {
  if (!splitFrontmatter(mine)) return mergeText({ base, mine, upstream, labels });

  const ownedName = getField(mine, 'name');
  const ownedInternal = isInternal(mine);

  const baseName = getField(base, 'name');
  const neutral = baseName === undefined ? mine : setName(setInternal(mine, false), baseName);

  const merged = mergeText({ base, mine: neutral, upstream, labels });
  if (!splitFrontmatter(merged.text)) return merged;

  let text = merged.text;
  if (ownedName !== undefined) text = setName(text, ownedName);
  if (ownedInternal) text = setInternal(text, true);
  return { ...merged, text };
}

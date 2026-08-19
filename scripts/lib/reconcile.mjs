import { mergeText, mergeSkillMd } from './merge.mjs';

/**
 * Reconcile one skill directory across three snapshots.
 *
 *   base     the vendored baseline the local copy was last synced from
 *   next     the same skill at the new upstream commit
 *   mine     the local working copy
 *
 * Returns the file set to write, plus how many files changed and how many were
 * left with conflict markers. Pure: no filesystem, no git state.
 */
export function reconcileTree({ base, next, mine, labels }) {
  const result = new Map();
  let changes = 0;
  let conflicts = 0;

  for (const rel of new Set([...base.keys(), ...next.keys(), ...mine.keys()])) {
    const b = base.get(rel);
    const n = next.get(rel);
    const m = mine.get(rel);

    // Upstream added it and we have no copy: take theirs.
    if (b === undefined && n !== undefined && m === undefined) {
      result.set(rel, n);
      changes += 1;
      continue;
    }

    if (n === undefined && m !== undefined) {
      // Upstream deleted it. Honour that only if we never touched it.
      if (b !== undefined && b === m) {
        changes += 1;
        continue;
      }
      result.set(rel, m);
      continue;
    }

    // Deleted locally: stay deleted.
    if (m === undefined) continue;

    const merge = rel.endsWith('SKILL.md') ? mergeSkillMd : mergeText;
    const merged = merge({ base: b ?? '', mine: m, upstream: n ?? '', labels });
    if (merged.text !== m) changes += 1;
    if (merged.conflicted) conflicts += 1;
    result.set(rel, merged.text);
  }

  return { result, changes, conflicts };
}

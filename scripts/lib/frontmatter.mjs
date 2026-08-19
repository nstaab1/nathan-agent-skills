/**
 * Minimal, line-oriented YAML frontmatter handling.
 *
 * Deliberately not a YAML parser. The script owns exactly two fields — `name`
 * and `metadata.internal` — and every other line must survive byte-identical so
 * that three-way merges against a vendored baseline stay clean.
 */

const DELIM = '---';
const INTERNAL_LINE = '  internal: true';

export function splitFrontmatter(content) {
  const lines = content.split('\n');
  if (lines[0] !== DELIM) return null;
  const close = lines.indexOf(DELIM, 1);
  if (close === -1) return null;
  return {
    lines: lines.slice(1, close),
    body: lines.slice(close + 1).join('\n'),
  };
}

function join(fm) {
  return `${DELIM}\n${fm.lines.join('\n')}\n${DELIM}\n${fm.body}`;
}

export function getField(content, key) {
  const fm = splitFrontmatter(content);
  if (!fm) return undefined;
  const line = fm.lines.find((l) => l.startsWith(`${key}:`));
  return line === undefined ? undefined : line.slice(key.length + 1).trim();
}

export function setName(content, name) {
  const fm = splitFrontmatter(content);
  if (!fm) throw new Error('cannot set name: file has no frontmatter');
  const i = fm.lines.findIndex((l) => l.startsWith('name:'));
  if (i === -1) fm.lines.unshift(`name: ${name}`);
  else fm.lines[i] = `name: ${name}`;
  return join(fm);
}

/** Index of `metadata:`, or -1. Only a top-level key counts. */
function metadataIndex(lines) {
  return lines.findIndex((l) => l === 'metadata:');
}

/** True when the line belongs to the block opened by a previous key. */
function isChild(line) {
  return /^\s+\S/.test(line);
}

/** Index of `internal: true` among the children of the `metadata:` at `meta`. */
function internalIndex(lines, meta) {
  for (let i = meta + 1; i < lines.length && isChild(lines[i]); i += 1) {
    if (lines[i].trim() === 'internal: true') return i;
  }
  return -1;
}

export function setInternal(content, on) {
  const fm = splitFrontmatter(content);
  if (!fm) throw new Error('cannot set internal flag: file has no frontmatter');
  const { lines } = fm;
  const meta = metadataIndex(lines);

  if (on) {
    if (meta === -1) {
      lines.push('metadata:', INTERNAL_LINE);
    } else if (internalIndex(lines, meta) === -1) {
      lines.splice(meta + 1, 0, INTERNAL_LINE);
    }
    return join(fm);
  }

  // Only the flag inside our own `metadata:` block, so an `internal: true`
  // under some other key is left alone. `isInternal` reads the same one.
  if (meta === -1) return join(fm);
  const flag = internalIndex(lines, meta);
  if (flag === -1) return join(fm);
  lines.splice(flag, 1);

  // Drop a metadata block that the flag left empty.
  if (!isChild(lines[meta + 1] ?? '')) lines.splice(meta, 1);
  return join(fm);
}

/**
 * Remove the lines this script owns, so a skill copied from a vendored baseline
 * compares equal to that baseline until its content genuinely diverges.
 */
export function stripOwnedLines(content) {
  const fm = splitFrontmatter(setInternal(content, false));
  if (!fm) return content;
  fm.lines = fm.lines.filter((l) => !l.startsWith('name:'));
  return join(fm);
}

/** `metadata.internal` lives one level down, so `getField` cannot reach it. */
export function isInternal(content) {
  const fm = splitFrontmatter(content);
  if (!fm) return false;
  const meta = metadataIndex(fm.lines);
  return meta !== -1 && internalIndex(fm.lines, meta) !== -1;
}

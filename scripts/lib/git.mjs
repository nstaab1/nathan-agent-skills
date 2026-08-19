import { execFileSync } from 'node:child_process';

export function git(args, opts = {}) {
  const out = execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    ...opts,
  });
  // stdio:'inherit' yields null rather than a captured string.
  return out === null ? '' : out.trimEnd();
}

/** Byte-exact variant. File contents must never be trimmed. */
export function gitRaw(args, opts = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    ...opts,
  });
}

export function gitQuiet(args, opts = {}) {
  try {
    return { ok: true, out: git(args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts }) };
  } catch (err) {
    return { ok: false, out: (err.stdout ?? '') + (err.stderr ?? '') };
  }
}

export const repoRoot = () => git(['rev-parse', '--show-toplevel']);

export const objectExists = (sha) => gitQuiet(['cat-file', '-e', `${sha}^{commit}`]).ok;

export const branchExists = (name) =>
  gitQuiet(['show-ref', '--verify', '--quiet', `refs/heads/${name}`]).ok;

export const revParse = (ref) => git(['rev-parse', ref]);

/** File paths under `prefix` at `ref`, relative to `prefix`. */
export function lsTree(ref, prefix) {
  const spec = prefix ? `${ref}:${prefix}` : ref;
  const res = gitQuiet(['ls-tree', '-r', '--name-only', spec]);
  if (!res.ok) return [];
  return res.out.split('\n').filter(Boolean);
}

export const showFile = (ref, path) => gitRaw(['show', `${ref}:${path}`]);

/** Read a whole subtree at `ref` into a Map of relative path to content. */
export function readTree(ref, prefix) {
  const files = lsTree(ref, prefix);
  const out = new Map();
  for (const rel of files) {
    out.set(rel, showFile(ref, prefix ? `${prefix}/${rel}` : rel));
  }
  return out;
}

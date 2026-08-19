import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

/**
 * Copy `paths` at `sha` out of the object store and into `dest`.
 *
 * Deliberately not a shell pipeline: there, the exit status is tar's, so a
 * failed `git archive` still reports success and the empty result gets
 * committed as the new baseline, destroying what every adopted skill diffs
 * against.
 */
export function extractSubtree({ sha, paths, strip = 0, dest, cwd }) {
  const archive = spawnSync('git', ['archive', sha, ...paths], {
    cwd,
    maxBuffer: 512 * 1024 * 1024,
  });
  if (archive.status !== 0) {
    throw new Error(`git archive failed for ${sha}: ${archive.stderr?.toString().trim() ?? ''}`);
  }
  const untar = spawnSync('tar', ['-x', ...(strip ? [`--strip-components=${strip}`] : []), '-C', dest], {
    input: archive.stdout,
    maxBuffer: 512 * 1024 * 1024,
  });
  if (untar.status !== 0) {
    throw new Error(`tar failed extracting ${sha}: ${untar.stderr?.toString().trim() ?? ''}`);
  }
  if (readdirSync(dest).length === 0) {
    throw new Error(
      `extracting ${paths.join(' ')} at ${sha} produced nothing; refusing to commit an empty mirror`
    );
  }
}

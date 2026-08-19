#!/usr/bin/env node
/**
 * Vendor-and-adopt pipeline for this skills repo.
 *
 *   init            create the `vendor` worktree from the orphan vendor branch
 *   sync <up>       mirror an upstream into vendor/<up> and commit it there
 *   adopt <up>/<s>  copy a vendored skill into skills/ as an internal -copy
 *   check           report drift against the baseline; regenerate generated files
 *   update <up>     re-sync, then three-way merge upstream changes into skills/
 *
 * The vendor mirror lives on a separate orphan branch and is gitignored on main,
 * so the `skills` CLI, which downloads a tarball of one ref, can never see it.
 */
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { join, dirname, relative } from 'node:path';

import {
  git,
  gitQuiet,
  repoRoot,
  objectExists,
  branchExists,
  remoteBranchExists,
  revParse,
  readTree,
  tryShowFile,
} from './lib/git.mjs';
import { setName, setInternal, isInternal, getField } from './lib/frontmatter.mjs';
import { reconcileTree } from './lib/reconcile.mjs';
import { mergeText } from './lib/merge.mjs';
import { extractSubtree } from './lib/vendor.mjs';
import {
  diffSkill,
  replaceRegion,
  renderSkillTable,
  renderNotices,
  graduatedName,
} from './lib/provenance.mjs';

const ROOT = repoRoot();
const VENDOR_BRANCH = 'vendor';
const VENDOR_DIR = join(ROOT, 'vendor');
const PROV_PATH = join(ROOT, 'provenance.json');
const SKILLS_DIR = join(ROOT, 'skills');

const log = (...a) => console.log(...a);
const plural = (n, word) => `(${n} ${word}${n === 1 ? '' : 's'})`;
const die = (msg) => {
  console.error(`error: ${msg}`);
  process.exit(1);
};

// ---------------------------------------------------------------- provenance

const loadProvenance = () => JSON.parse(readFileSync(PROV_PATH, 'utf8'));

function saveProvenance(prov) {
  const sorted = (o) => Object.fromEntries(Object.entries(o ?? {}).sort(([a], [b]) => a.localeCompare(b)));
  const ordered = {
    upstreams: prov.upstreams,
    skills: sorted(prov.skills),
    files: sorted(prov.files),
  };
  writeFileSync(PROV_PATH, `${JSON.stringify(ordered, null, 2)}\n`);
}

const upstreamOf = (prov, name) => prov.upstreams[name] ?? die(`unknown upstream "${name}"`);

// ------------------------------------------------------------------ file i/o

function walkFiles(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(abs, base));
    else if (entry.isFile()) out.push(relative(base, abs));
  }
  return out;
}

function readDirTree(dir) {
  const out = new Map();
  if (!existsSync(dir)) return out;
  for (const rel of walkFiles(dir)) out.set(rel, readFileSync(join(dir, rel), 'utf8'));
  return out;
}

function writeDirTree(dir, map) {
  for (const [rel, content] of map) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
}

// -------------------------------------------------------------------- vendor

function ensureWorktree() {
  if (existsSync(join(VENDOR_DIR, '.git'))) return;
  if (existsSync(VENDOR_DIR) && readdirSync(VENDOR_DIR).length > 0) {
    die(`${VENDOR_DIR} exists but is not a worktree; move it aside and re-run init`);
  }
  if (!branchExists(VENDOR_BRANCH)) {
    if (remoteBranchExists('origin', VENDOR_BRANCH)) {
      // Fresh clone: the mirror is published, adopt it rather than starting an
      // empty orphan that would discard it.
      git(['branch', VENDOR_BRANCH, `origin/${VENDOR_BRANCH}`]);
      log(`tracking the published mirror origin/${VENDOR_BRANCH}`);
    } else {
      const empty = git(['hash-object', '-t', 'tree', '/dev/null']);
      const commit = git(['commit-tree', empty, '-m', 'Initialise the vendor mirror branch']);
      git(['branch', VENDOR_BRANCH, commit]);
      log(`created orphan branch ${VENDOR_BRANCH}`);
    }
  } else if (
    remoteBranchExists('origin', VENDOR_BRANCH) &&
    revParse(VENDOR_BRANCH) !== revParse(`origin/${VENDOR_BRANCH}`)
  ) {
    log(`warning: local ${VENDOR_BRANCH} differs from origin/${VENDOR_BRANCH}; reconcile them before syncing`);
  }
  rmSync(VENDOR_DIR, { recursive: true, force: true });
  git(['worktree', 'add', VENDOR_DIR, VENDOR_BRANCH], { stdio: 'inherit' });
  log(`vendor mirror checked out at ${relative(ROOT, VENDOR_DIR)}/`);
}

const vendorHead = () => git(['-C', VENDOR_DIR, 'rev-parse', 'HEAD']);

function requireWorktree() {
  if (!existsSync(join(VENDOR_DIR, '.git'))) {
    die('vendor worktree is missing. Run: node scripts/skills.mjs init');
  }
}

/**
 * `sync` re-mirrors the pinned commit and is idempotent. `update` passes
 * advance:true to move the pin to the head of the tracked ref.
 */
function resolveUpstreamCommit(u, name, advance) {
  if (!advance && u.sha && objectExists(u.sha)) return u.sha;
  log(`fetching ${u.url} ${u.ref} ...`);
  const res = gitQuiet(['fetch', '--depth', '1', u.url, u.ref]);
  if (!res.ok) die(`fetch failed for ${name}:\n${res.out}`);
  return revParse('FETCH_HEAD');
}

function syncUpstream(prov, name, { advance = false } = {}) {
  requireWorktree();
  const u = upstreamOf(prov, name);
  const sha = resolveUpstreamCommit(u, name, advance);
  const dest = join(VENDOR_DIR, name);

  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  extractSubtree({ sha, paths: u.paths, strip: u.strip ?? 0, dest, cwd: ROOT });

  writeFileSync(
    join(dest, '.vendor.json'),
    `${JSON.stringify({ repo: u.repo, url: u.url, ref: u.ref, path: u.path ?? null, sha }, null, 2)}\n`
  );

  git(['-C', VENDOR_DIR, 'add', '-A', name]);
  const committed = gitQuiet(['-C', VENDOR_DIR, 'commit', '-m', `Mirror ${u.repo} at ${sha.slice(0, 7)}`]);
  if (!committed.ok && !committed.out.includes('nothing to commit')) die(committed.out);

  u.sha = sha;
  const vendorCommit = vendorHead();
  log(`${name}: mirrored ${u.repo} at ${sha.slice(0, 7)} (vendor ${vendorCommit.slice(0, 7)})`);
  return { sha, vendorCommit };
}

// ------------------------------------------------------------------ adoption

/** Find a skill directory inside a vendored mirror by its folder name. */
function locateVendoredSkill(upstream, skillName) {
  const root = join(VENDOR_DIR, upstream);
  if (!existsSync(root)) die(`${upstream} is not mirrored yet. Run: node scripts/skills.mjs sync ${upstream}`);
  const hits = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const abs = join(dir, entry.name);
      if (entry.name === skillName && existsSync(join(abs, 'SKILL.md'))) hits.push(abs);
      walk(abs);
    }
  };
  walk(root);
  if (hits.length === 0) die(`no skill named "${skillName}" in vendor/${upstream}`);
  if (hits.length > 1) die(`"${skillName}" is ambiguous in vendor/${upstream}:\n  ${hits.join('\n  ')}`);
  return hits[0];
}

function cmdAdopt(argv) {
  requireWorktree();
  const prov = loadProvenance();
  const spec = argv._[0] ?? die('usage: adopt <upstream>/<skill> --to <folder> [--as <name>] [--unlink]');
  const [upstream, ...rest] = spec.split('/');
  const skillName = rest.at(-1) ?? die('expected <upstream>/<skill>');
  const folders = readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const folder = argv.to ?? die(`--to <folder> is required; one of: ${folders.join(', ')}`);
  if (!folders.includes(folder)) die(`unknown folder "${folder}"; one of: ${folders.join(', ')}`);

  const u = upstreamOf(prov, upstream);
  const srcAbs = locateVendoredSkill(upstream, skillName);
  const sourcePath = relative(join(VENDOR_DIR, upstream), srcAbs);
  const target = argv.as ?? `${skillName}-copy`;
  const destAbs = join(SKILLS_DIR, folder, target);
  const key = `${folder}/${target}`;

  if (existsSync(destAbs)) die(`${relative(ROOT, destAbs)} already exists`);

  const files = readDirTree(srcAbs);
  const skill = files.get('SKILL.md') ?? die('vendored skill has no SKILL.md');
  files.set('SKILL.md', setInternal(setName(skill, target), true));
  writeDirTree(destAbs, files);

  prov.skills[key] = {
    source: upstream,
    sourcePath,
    upstreamSha: u.sha,
    vendorCommit: vendorHead(),
    linked: argv.unlink !== true,
  };
  saveProvenance(prov);

  log(`adopted ${upstream}/${sourcePath} -> skills/${key}`);
  log(`  name: ${target}   internal: true   linked: ${prov.skills[key].linked}`);
  log('Run `node scripts/skills.mjs check` to refresh the generated files.');
}

/**
 * Ship an adopted copy: drop the internal flag and the `-copy` suffix.
 *
 * The suffix lives in three places at once (directory, frontmatter `name`, and
 * the provenance key), so this is a command rather than a hand edit. The link
 * to the vendored baseline is kept, so upstream changes still merge in.
 */
function cmdGraduate(argv) {
  const prov = loadProvenance();
  const key = argv._[0] ?? die('usage: graduate <folder>/<skill> [--as <name>]');
  const entry = prov.skills[key] ?? die(`${key} is not in provenance.json`);
  const [folder, current] = key.split('/');
  const target = argv.as ?? graduatedName(current);

  const from = join(SKILLS_DIR, key);
  const to = join(SKILLS_DIR, folder, target);
  if (!existsSync(from)) die(`${relative(ROOT, from)} does not exist`);
  if (to !== from && existsSync(to)) die(`${relative(ROOT, to)} already exists`);

  const skillPath = join(from, 'SKILL.md');
  writeFileSync(skillPath, setInternal(setName(readFileSync(skillPath, 'utf8'), target), false));
  if (to !== from) {
    renameSync(from, to);
    prov.skills[`${folder}/${target}`] = entry;
    delete prov.skills[key];
  }
  saveProvenance(prov);

  log(`graduated ${key} -> ${folder}/${target}`);
  log(`  name: ${target}   internal: false   still linked to ${entry.source ?? 'nothing'}`);
  log('Run `node scripts/skills.mjs check` to refresh the generated files.');
}

// --------------------------------------------------------------------- check

function listLocalSkills() {
  const out = [];
  for (const folder of readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    const folderAbs = join(SKILLS_DIR, folder.name);
    for (const entry of readdirSync(folderAbs, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const abs = join(folderAbs, entry.name);
      if (!existsSync(join(abs, 'SKILL.md'))) continue;
      out.push({ key: `${folder.name}/${entry.name}`, abs });
    }
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

function baselineFor(entry) {
  return readTree(entry.vendorCommit, `${entry.source}/${entry.sourcePath}`);
}

function cmdCheck() {
  const prov = loadProvenance();
  const local = listLocalSkills();
  const rows = [];
  const haveWorktree = existsSync(join(VENDOR_DIR, '.git'));

  for (const { key, abs } of local) {
    const content = readFileSync(join(abs, 'SKILL.md'), 'utf8');
    const name = getField(content, 'name');
    const internal = isInternal(content);
    const entry = prov.skills[key];

    if (!entry || !entry.source) {
      rows.push({ key, name, source: null, status: 'owned', internal });
      prov.skills[key] = { source: null };
      continue;
    }

    let status = 'unlinked';
    let changed = [];
    if (entry.linked !== false) {
      const base = baselineFor(entry);
      if (base.size === 0) status = 'baseline-missing';
      else ({ status, changed } = diffSkill({ mine: readDirTree(abs), base }));
    }
    rows.push({ key, name, source: entry.source, status, internal, changed });
    entry.status = status;
  }

  for (const key of Object.keys(prov.skills)) {
    if (!local.some((s) => s.key === key)) delete prov.skills[key];
  }

  const width = Math.max(...rows.map((r) => r.key.length));
  for (const r of rows) {
    const detail = r.changed?.length ? `  ${plural(r.changed.length, 'file')}` : '';
    const src = r.source ? `  <- ${r.source}` : '';
    log(`${r.key.padEnd(width)}  ${r.status}${detail}${src}${r.internal ? '  [internal]' : ''}`);
  }

  for (const [path, entry] of Object.entries(prov.files ?? {})) {
    const base = tryShowFile(entry.vendorCommit, `${entry.source}/${entry.sourcePath}`);
    const mine = existsSync(join(ROOT, path)) ? readFileSync(join(ROOT, path), 'utf8') : undefined;
    if (mine === undefined) entry.status = 'missing';
    else if (base === undefined) entry.status = 'baseline-missing';
    else entry.status = base === mine ? 'verbatim' : 'modified';
    log(`${path.padEnd(width)}  ${entry.status}  <- ${entry.source}  [file]`);
  }

  if (haveWorktree) {
    for (const [name, u] of Object.entries(prov.upstreams)) {
      const root = u.skillsRoot ?? 'skills';
      const mirrored = readTree(VENDOR_BRANCH, `${name}/${root}`);
      const adopted = new Set(
        Object.values(prov.skills).filter((e) => e.source === name).map((e) => e.sourcePath)
      );
      const available = new Set(
        [...mirrored.keys()]
          .filter((p) => p.endsWith('/SKILL.md'))
          .map((p) => `${root}/${dirname(p)}`)
      );
      const spare = [...available].filter((p) => !adopted.has(p)).length;
      if (spare > 0) log(`\n${name}: ${spare} skills available upstream, not adopted`);
    }
  } else {
    log('\nvendor worktree missing; drift not verified. Run: node scripts/skills.mjs init');
  }

  saveProvenance(prov);
  writeFileSync(join(ROOT, 'THIRD_PARTY_NOTICES.md'), renderNotices(prov));

  const readmePath = join(ROOT, 'README.md');
  const readme = readFileSync(readmePath, 'utf8');
  writeFileSync(readmePath, replaceRegion(readme, 'skills', renderSkillTable(rows)));

  log('\nregenerated provenance.json, THIRD_PARTY_NOTICES.md, README.md');
}

// -------------------------------------------------------------------- update

function cmdUpdate(argv) {
  requireWorktree();
  const name = argv._[0] ?? die('usage: update <upstream>');
  const prov = loadProvenance();
  upstreamOf(prov, name);

  const linked = Object.entries(prov.skills).filter(
    ([, e]) => e.source === name && e.linked !== false
  );
  const before = new Map(linked.map(([key, e]) => [key, e.vendorCommit]));
  for (const [path, e] of Object.entries(prov.files ?? {})) {
    if (e.source === name) before.set(`file:${path}`, e.vendorCommit);
  }

  const { sha, vendorCommit } = syncUpstream(prov, name, { advance: true });

  let conflicts = 0;
  let touched = 0;
  for (const [key, entry] of linked) {
    const abs = join(SKILLS_DIR, key);
    const oldCommit = before.get(key);
    const path = `${name}/${entry.sourcePath}`;
    const base = readTree(oldCommit, path);
    const next = readTree(vendorCommit, path);
    if (next.size === 0) {
      log(`${key}: upstream removed this skill; left untouched`);
      continue;
    }

    const { result, changes, conflicts: skillConflicts } = reconcileTree({
      base,
      next,
      mine: readDirTree(abs),
      labels: { upstream: name },
    });

    // Write beside the skill and swap, so a throw mid-write cannot leave the
    // directory deleted.
    const staging = `${abs}.merging`;
    rmSync(staging, { recursive: true, force: true });
    writeDirTree(staging, result);
    rmSync(abs, { recursive: true, force: true });
    renameSync(staging, abs);

    entry.vendorCommit = vendorCommit;
    entry.upstreamSha = sha;
    if (changes) touched += 1;
    if (skillConflicts) {
      conflicts += skillConflicts;
      log(`CONFLICT  ${key}  ${plural(skillConflicts, 'file')}`);
    } else if (changes) {
      log(`merged    ${key}`);
    }
  }

  for (const [path, entry] of Object.entries(prov.files ?? {})) {
    if (entry.source !== name || entry.linked === false) continue;
    const rel = `${name}/${entry.sourcePath}`;
    const base = tryShowFile(before.get(`file:${path}`) ?? entry.vendorCommit, rel);
    const next = tryShowFile(vendorCommit, rel);
    const abs = join(ROOT, path);
    if (base === undefined || next === undefined || !existsSync(abs)) {
      log(`${path}: no baseline upstream; left untouched`);
      continue;
    }
    const mine = readFileSync(abs, 'utf8');
    const merged = mergeText({ base, mine, upstream: next, labels: { upstream: name } });
    if (merged.text !== mine) {
      writeFileSync(abs, merged.text);
      touched += 1;
      log(merged.conflicted ? `CONFLICT  ${path}` : `merged    ${path}`);
    }
    if (merged.conflicted) conflicts += 1;
    entry.vendorCommit = vendorCommit;
    entry.upstreamSha = sha;
  }

  saveProvenance(prov);
  log(`\n${touched} item(s) changed, ${conflicts} conflicted file(s).`);
  if (conflicts) log('Resolve the conflict markers, then run: node scripts/skills.mjs check');
  else log('Run: node scripts/skills.mjs check');
}

// ----------------------------------------------------------------------- cli

function parseArgs(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = args[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

const USAGE = `usage: node scripts/skills.mjs <command>

  init                              create the vendor worktree
  sync <upstream>                   mirror an upstream onto the vendor branch
  adopt <upstream>/<skill> --to <folder> [--as <name>] [--unlink]
  graduate <folder>/<skill> [--as <name>]   ship an adopted copy
  check                             report drift, regenerate generated files
  update <upstream>                 re-sync then merge upstream changes
`;

const [command, ...rest] = process.argv.slice(2);
const argv = parseArgs(rest);

switch (command) {
  case 'init':
    ensureWorktree();
    break;
  case 'sync': {
    const prov = loadProvenance();
    syncUpstream(prov, argv._[0] ?? die('usage: sync <upstream>'));
    saveProvenance(prov);
    break;
  }
  case 'adopt':
    cmdAdopt(argv);
    break;
  case 'graduate':
    cmdGraduate(argv);
    break;
  case 'check':
    cmdCheck();
    break;
  case 'update':
    cmdUpdate(argv);
    break;
  default:
    log(USAGE);
    process.exit(command ? 1 : 0);
}

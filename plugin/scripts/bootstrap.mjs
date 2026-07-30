// Zero-command adoption: open Claude Code in a repository and the workspace is there.
//
// ── the constraint, and why this file is so defensive ────────────────────────
//
// Writing into somebody's working tree because a session opened is the most invasive thing
// anything here does, and it is done with no command and no prompt. The owner requires that;
// the council's job was to find the safest shape for it rather than to argue. What came back:
//
//   · **create-only, always.** Nothing that exists is modified. One exception, the settings
//     ladder below, and it too never touches a file the user already has.
//   · **the predicate is the product.** Firing in the wrong repository is the failure, not a
//     missing file. Every rung below refuses something that would otherwise look reasonable.
//   · **the manifest lives outside the repo**, so "removed the workspace" and "never had one"
//     are distinguishable. In-repo state cannot tell those apart, and a bootstrap that cannot
//     tell them apart reinstalls itself forever.
//
// **The cost accepted, stated rather than hidden:** no on-disk predicate distinguishes "my new
// project" from "a repo I cloned to read". Both are a clean repo root with no board. That is
// the irreducible price of zero-command, and the answer is damage-shaping — create-only,
// nothing tracked ever modified, every path recorded, one loud announcement, and a removal
// that leaves a tombstone so it never comes back.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const STAGES = ['0-discovery', '0-backlog', '1-spec', '2-plan', '3-build',
  '4-review', '5-verify', '6-done', '7-operate'];

const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

const git = (dir, args) => {
  try {
    return execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return null; }
};

/** Where state that must outlive the repo goes. Never inside the repo — see the header. */
export const dataDir = () =>
  process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.nexa');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const keyFor = (root) => crypto.createHash('sha256').update(real(root)).digest('hex').slice(0, 16);
export const manifestPath = (root) => path.join(dataDir(), 'manifests', `${keyFor(root)}.json`);
export const tombstonePath = (root) => path.join(dataDir(), 'tombstones', `${keyFor(root)}`);

/**
 * May we scaffold `root`, and if not, loudly or silently?
 *
 * `silent` is the default for "this is not a project that wants a workspace" — a hook that
 * announces itself in every directory a user ever opens is a hook they uninstall. `announce`
 * is reserved for a repository that looks *contested*: something of ours is half-there, or
 * something that is not ours occupies the name. Those deserve a sentence saying why nothing
 * happened.
 */
export function decide(root, { allowTemp = false } = {}) {
  const top = git(root, ['rev-parse', '--show-toplevel']);
  if (!top) return { act: false, level: 'silent', reason: 'not a git repository' };
  if (real(top) !== real(root)) {
    return { act: false, level: 'silent', reason: 'not the repository root' };
  }
  // A `.git` FILE rather than a directory means a linked worktree or a submodule. Scaffolding
  // there pollutes a checkout that shares history with the primary.
  if (!isDir(path.join(root, '.git'))) {
    return { act: false, level: 'silent', reason: 'linked worktree or submodule' };
  }
  if (real(root) === real(os.homedir())) return { act: false, level: 'silent', reason: 'home directory' };
  // `allowTemp` exists for the fixtures, which necessarily live in mkdtemp. The hook never
  // passes it, so the production predicate is the strict one; the tests assert BOTH — that a
  // temp root is refused without the flag, and that the rest of the ladder works with it.
  const tmps = [os.tmpdir(), '/tmp', '/private/tmp'].map(real);
  if (!allowTemp && tmps.some((t) => real(root) === t || real(root).startsWith(`${t}${path.sep}`))) {
    return { act: false, level: 'silent', reason: 'temporary directory' };
  }
  if (fs.existsSync(tombstonePath(root))) {
    return { act: false, level: 'silent', reason: 'removed here before — tombstoned' };
  }

  const cfg = path.join(root, 'workspace.config.json');
  if (fs.existsSync(cfg)) {
    try {
      JSON.parse(fs.readFileSync(cfg, 'utf8'));
      return { act: false, level: 'silent', reason: 'already initialised' };
    } catch {
      return { act: false, level: 'announce', reason: 'workspace.config.json is present but unreadable — nothing was written' };
    }
  }
  // A board that is not ours. The fixture for this is a repo whose `board/index.html` is a
  // deployed static site: nine stage directories inside it would be published on next deploy.
  if (fs.existsSync(path.join(root, 'board'))) {
    return { act: false, level: 'announce', reason: 'a board/ directory is already here and is not ours — nothing was written' };
  }
  return { act: true, level: 'announce', reason: 'clean repository root' };
}

/**
 * Write `content` to `file` without ever leaving a truncated file behind.
 *
 * Temp file in the same directory, then `rename`, which is atomic on a POSIX filesystem. A
 * process death leaves the old bytes or the new bytes and never half of either. The fixture
 * for this is a crash injected between open and close.
 */
function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.nexa-tmp-${process.pid}-${path.basename(file)}`);
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

/** Create-only. Returns true when it wrote, false when something was already there. */
function createOnly(file, content, created) {
  if (fs.existsSync(file)) return false;
  atomicWrite(file, content);
  created.push(file);
  return true;
}

/**
 * The only merge in this file, and it is written to be boring.
 *
 * **The failure being prevented, named because it is silent:** a shallow
 * `{...theirs, ...ours}` replaces the user's whole `permissions` object, so their own
 * `deny: ["Read(./prod-creds/**)"]` disappears. The file stays valid JSON, nothing errors, and
 * they go on believing the rule is live.
 *
 * So: start from *their* object, add only what is missing, never remove, never reorder, and
 * never overwrite a value they chose.
 */
export function mergeSettings(theirs, ours) {
  const out = JSON.parse(JSON.stringify(theirs));
  const conflicts = [];

  out.permissions ??= {};
  const allow = Array.isArray(out.permissions.allow) ? out.permissions.allow : [];

  // `Bash(git push *)` and `Bash(git push:*)` are the same rule written two ways. Comparing
  // raw strings adds a second, semantically identical entry — noise in a file the user reads
  // when they are trying to work out why something was blocked.
  const norm = (r) => String(r).replace(/:\*\)$/, ' *)').replace(/\s+/g, ' ').trim();

  // `Read(./code/**)` -> {tool:'Read', path:'./code/**'}. Anything unparseable yields null and
  // is compared by string only, which is the conservative direction: an unrecognised shape is
  // never treated as covering something.
  const parse = (r) => {
    const m = String(r).match(/^(\w+)\((.*)\)$/);
    return m ? { tool: m[1], pat: m[2].trim() } : null;
  };
  /** Does rule `a` (an allow) cover rule `b` (a deny we would add)? */
  const covers = (a, b) => {
    if (norm(a) === norm(b)) return true;
    const pa = parse(a); const pb = parse(b);
    if (!pa || !pb || pa.tool !== pb.tool) return false;
    // Only the trailing-glob case, which is the one that actually occurs. A prefix ending in
    // `**` or `*` covers any path beneath it.
    const m = pa.pat.match(/^(.*?)\*\*?$/);
    if (!m) return false;
    const prefix = m[1];
    return pb.pat.startsWith(prefix);
  };

  for (const list of ['deny', 'ask']) {
    const mine = ours.permissions?.[list] ?? [];
    if (!mine.length) continue;
    const existing = Array.isArray(out.permissions[list]) ? out.permissions[list] : [];
    const seen = new Set(existing.map(norm));
    const add = [];
    for (const rule of mine) {
      if (seen.has(norm(rule))) continue;
      // **The user's own allow wins, and silently losing to us is the failure.** deny is
      // evaluated before allow, so appending a deny for something they explicitly allowed
      // leaves their rule textually present and completely ineffective — the file still reads
      // as though it were honoured. Skip ours and say so.
      // **Overlap, not equality.** `allow: ["Read(./code/**)"]` is broader than our
      // `Read(./code/.env)`; deny is evaluated first, so appending ours narrows a permission
      // the user deliberately granted — and string equality never sees it. Compare the paths
      // the rules name: if theirs covers ours, theirs wins and we say so.
      if (list === 'deny' && allow.some((a) => covers(a, rule))) {
        conflicts.push(`${rule}: you allow it, so our deny was NOT added`);
        continue;
      }
      seen.add(norm(rule));
      add.push(rule);
    }
    // Never remove, never reorder: a rule the user wrote in their own form stays in their form.
    out.permissions[list] = [...existing, ...add];
  }

  if (ours.model !== undefined) {
    if (out.model === undefined) out.model = ours.model;
    else if (out.model !== ours.model) conflicts.push(`model: yours (${out.model}) kept`);
  }

  if (ours.env) {
    out.env ??= {};
    for (const [k, v] of Object.entries(ours.env)) {
      if (out.env[k] === undefined) out.env[k] = v;
      else if (out.env[k] !== v) conflicts.push(`env.${k}: yours (${out.env[k]}) kept`);
    }
  }

  // `hooks` is deliberately absent: our hooks ship in the plugin's own hooks.json. Writing them
  // into settings as well would double-register every one of them — guard-edit firing twice,
  // session-end writing the record twice.
  return { merged: out, conflicts };
}

/**
 * The settings ladder. Rung 1 is the common case and involves no merge at all.
 *
 *   1. `.claude/settings.json` absent            → create it whole
 *   2. it exists                                  → never touch it; use `settings.local.json`,
 *                                                   which Claude Code gitignores itself, so we
 *                                                   never dirty a tracked file
 *   3. both exist                                 → the merge above, on the local file only
 */
function writeSettings(root, payload, created, modified) {
  const dir = path.join(root, '.claude');
  const shared = path.join(dir, 'settings.json');
  const local = path.join(dir, 'settings.local.json');

  if (!fs.existsSync(shared)) {
    atomicWrite(shared, `${JSON.stringify(payload, null, 2)}\n`);
    created.push(shared);
    return { where: 'settings.json', conflicts: [] };
  }
  if (!fs.existsSync(local)) {
    atomicWrite(local, `${JSON.stringify(payload, null, 2)}\n`);
    created.push(local);
    return { where: 'settings.local.json', conflicts: [] };
  }
  let theirs;
  try { theirs = JSON.parse(fs.readFileSync(local, 'utf8')); }
  catch { return { where: 'none', conflicts: ['settings.local.json does not parse — left untouched'] }; }

  const { merged, conflicts } = mergeSettings(theirs, payload);

  // **The backup goes OUTSIDE the repository, and is never reused.**
  //
  // It was `${local}.pre-nexa`, created only when absent. A second-model review found what
  // that does on the second run: an existing `.pre-nexa` — left by an earlier version, another
  // tool, or a previous adoption — is recorded as *this* run's backup, and removal then copies
  // that unrelated file over live settings. Restoring somebody's settings from a stranger's
  // snapshot is worse than not restoring them, because it looks like it worked.
  const before = fs.readFileSync(local, 'utf8');
  const backup = path.join(dataDir(), 'backups', keyFor(root), 'settings.local.json');
  atomicWrite(backup, before);

  const bytes = `${JSON.stringify(merged, null, 2)}\n`;
  atomicWrite(local, bytes);
  // **Recorded as MODIFIED, not created — the distinction is the whole of undo.** This file
  // existed before us; deleting it on removal would take the user's own settings with it, and
  // leaving it alone (which is what happened until a second-model review found it) leaves our
  // deny rules, model and env behind while the banner promises "to undo all of it". Neither is
  // acceptable, so the pre-existing bytes are restored from the backup instead.
  // The hash of what WE wrote. Removal compares it against what is on disk: if they differ the
  // user has edited the file since, and restoring the backup would throw their work away. That
  // was the second failure path in the same review — "removal blindly copies the original over
  // the current file."
  modified.push({ file: local, backup, wroteHash: sha(bytes) });
  return { where: 'settings.local.json (merged)', conflicts };
}

/** The settings this workspace needs. Kept next to the ladder that writes them. */
export const SETTINGS = {
  permissions: {
    deny: [
      'Read(./code/.env)', 'Read(./code/.env.*)', 'Read(./code/data/**)',
      'Edit(./plan/**)', 'Write(./plan/**)',
      'Edit(./board/6-done/**)', 'Write(./board/6-done/**)',
    ],
    ask: ['Bash(npm run test:live:*)', 'Bash(codex exec:*)', 'Bash(git push:*)'],
  },
  model: 'opus',
  env: { MAX_THINKING_TOKENS: '31999' },
};

const CONFIG = {
  codeDirs: ['code'],
  depthCheckPaths: [],
  planDir: 'plan',
  requireCardForCodeEdits: true,
};

const CLAUDEIGNORE = `node_modules/
graphify-out/
data/
*.db
*.db-wal
*.db-shm
._*
.DS_Store
board/6-done/
`;

const seed = (title, note) => `# ${title}\n\n${note}\n`;

/**
 * Scaffold `root`. Create-only throughout; returns what it did rather than printing, so the
 * caller decides how loud to be and the tests can assert on structure.
 */
export function bootstrap(root, templatesDir, opts = {}) {
  const verdict = decide(root, opts);
  if (!verdict.act) return { ...verdict, created: [] };

  const created = [];
  const modified = [];
  for (const s of STAGES) createOnly(path.join(root, 'board', s, '.gitkeep'), '', created);
  createOnly(path.join(root, 'workspace.config.json'), `${JSON.stringify(CONFIG, null, 2)}\n`, created);
  createOnly(path.join(root, '.claudeignore'), CLAUDEIGNORE, created);
  createOnly(path.join(root, 'docs', 'DECISIONS.md'),
    seed('Decisions', 'One entry per decision that was expensive to reverse. A decision recorded only in chat did not happen.'), created);
  createOnly(path.join(root, 'docs', 'LEARNED.md'),
    seed('Learned', 'Patterns across the records that no single record states. Written by `skills/reflect`.'), created);
  createOnly(path.join(root, 'templates', 'CARD.md'),
    fs.readFileSync(path.join(templatesDir, 'CARD.md'), 'utf8'), created);

  for (const f of ['AGENTS.md', 'CLAUDE.md']) {
    createOnly(path.join(root, f), fs.readFileSync(path.join(templatesDir, f), 'utf8'), created);
  }

  const settings = writeSettings(root, SETTINGS, created, modified);

  atomicWrite(manifestPath(root), `${JSON.stringify({
    root: real(root), created, modified, settings: settings.where, at: new Date().toISOString(),
  }, null, 2)}\n`);

  return { ...verdict, created, modified, settings };
}

/** Undo exactly what the manifest records, then tombstone so it never comes back. */
export function remove(root) {
  const mf = manifestPath(root);
  if (!fs.existsSync(mf)) return { removed: [], reason: 'nothing was recorded for this repository' };
  const { created = [], modified = [] } = JSON.parse(fs.readFileSync(mf, 'utf8'));
  const removed = [];
  const restored = [];
  const keptBack = [];
  // Restore before deleting: a modified file must go back to the bytes it had, not vanish.
  for (const m of modified) {
    try {
      if (!fs.existsSync(m.backup)) continue;
      // Has the user edited it since we wrote it? If so their edits are newer than our backup
      // and restoring would delete them. Leave it, and SAY so — a silent skip here reads as a
      // successful undo.
      if (m.wroteHash && fs.existsSync(m.file) && sha(fs.readFileSync(m.file, 'utf8')) !== m.wroteHash) {
        keptBack.push(m.file);
        continue;
      }
      fs.copyFileSync(m.backup, m.file);
      fs.rmSync(m.backup, { force: true });
      restored.push(m.file);
    } catch { /* leave it rather than make it worse */ }
  }
  // Deepest first, so a directory is empty by the time we reach it.
  for (const f of [...created].sort((a, b) => b.length - a.length)) {
    try { fs.rmSync(f, { force: true }); removed.push(f); } catch { /* already gone */ }
    const dir = path.dirname(f);
    try { if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir); } catch { /* not empty, keep */ }
  }
  atomicWrite(tombstonePath(root), `${new Date().toISOString()}\n`);
  fs.rmSync(mf, { force: true });
  return { removed, restored, keptBack, reason: 'removed and tombstoned' };
}

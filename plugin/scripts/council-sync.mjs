#!/usr/bin/env node
// Fetch the council from GitHub, at whatever version is current.
//
//   node scripts/council-sync.mjs              fetch, or update to the latest
//   node scripts/council-sync.mjs --check      report what is there; change nothing
//   node scripts/council-sync.mjs --ref <sha>  pin to a commit or tag
//
// Exit 0 = present and current. Exit 1 = not, and why.
//
// ── Why it is fetched, and why it is LINKED rather than copied ───────────────
//
// It used to be vendored. Twice in one week the copy went stale, and the second time it
// carried **a silent UTF-8 corruption bug** — member output accumulated as raw Buffers, so a
// 3-byte character split across a pipe boundary became U+FFFD. Every council answer longer
// than one pipe buffer was quietly damaged, and every review in this repo had gone through it.
//
// The first fix was to copy harder: clone, then rewrite every path for this workspace's
// deeper layout. That failed three separate ways in one afternoon — a rewrite that fired on
// its own output and doubled a path segment; a join built from a variable that no regex
// reached, so the suite died on scandir instead of failing a check; and then the suite,
// pointed at this repo, auditing THIS workspace's own files against the council's flag list.
//
// **Chasing a moving layout with regexes is a maintenance debt on someone else's release
// schedule.** So there is no copy and no rewriting:
//
//     .council-src/                    a real clone, gitignored
//     scripts/council               →  .council-src/scripts
//     .agents/skills/council        →  .council-src/skills/council
//     .claude/commands/council*.md  →  .council-src/commands/*
//
// One source. The council's own suite runs in the council's own directory, against its own
// layout, which is the only place its assertions mean anything.
//
// **The cost, stated rather than hidden:** a fresh clone has no council until this runs.
// `npm test` says so and carries on. A missing tool that announces itself beats a present one
// that is silently three weeks behind.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectRootFor } from './hooks/roots.mjs';

// Two roots — see hooks/roots.mjs. This one is the PROJECT being checked, which is not
// where this script lives once the workspace ships as a plugin.
const { root: ROOT, trusted: ROOT_TRUSTED, source: ROOT_SOURCE } = projectRootFor(import.meta.url);
if (!ROOT_TRUSTED) {
  console.error(`no workspace found (looked from ${ROOT_SOURCE}). Run this inside a project, or set CLAUDE_PROJECT_DIR.`);
  process.exit(2);
}
const REPO = 'https://github.com/developerjillur/all-cli-council.git';
// ── where the clone lives, and why it may not be here ───────────────────────
//
// Default: `.council-src/` beside the workspace, which is the obvious place.
//
// But a filesystem without native extended attributes — exFAT, FAT, most portable drives —
// makes macOS write an AppleDouble sidecar beside every file it touches, DURING the read. The
// council's suite correctly refuses untracked files and files containing control bytes, so on
// such a volume it fails on `._members.json` no matter how often the sidecars are swept: they
// are written faster than they can be cleaned. That is not a state to reach, it is a rate to
// outpace, and cleaning harder was the wrong answer.
//
// So on a volume that cannot hold xattrs, the clone goes to the home cache instead. Same
// clone, same commit, a filesystem that does not fight it — and `.council-src` becomes a link
// so every other path in this workspace is unchanged.
function cloneHome() {
  const local = path.join(ROOT, '.council-src');

  // Ask the question that matters, not the adjacent one. The first version asked whether
  // `xattr -w` SUCCEEDS — and on exFAT it does, because macOS transparently fakes it by
  // writing the AppleDouble file. So the probe reported "native xattrs, all good" from inside
  // a directory that had just grown a sidecar.
  //
  // **The observable consequence is the thing to observe.** Write an attribute; then look for
  // the file that should not be there.
  const dir = path.join(ROOT, `.fs-probe-${process.pid}`);
  let writesSidecars = true;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, 'f');
    fs.writeFileSync(f, 'x');
    spawnSync('xattr', ['-w', 'user.probe', '1', f]);
    writesSidecars = fs.existsSync(path.join(dir, '._f'));
  } catch { /* assume the worst */ } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  if (!writesSidecars) return { dir: local, linked: false };
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (!home) return { dir: local, linked: false };
  return { dir: path.join(home, '.cache', 'nexaclaude', 'all-cli-council'), linked: true };
}
const { dir: SRC, linked: SRC_ELSEWHERE } = cloneHome();

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const REF = (() => { const i = args.indexOf('--ref'); return i !== -1 ? args[i + 1] : null; })();

const say = (s) => console.log('  ' + s);
const git = (a, cwd = SRC) => spawnSync('git', a, { cwd, encoding: 'utf8' });

// ── 1 · clone or update ──────────────────────────────────────────────────────
const have = fs.existsSync(path.join(SRC, '.git'));

if (CHECK) {
  if (!have) { say('the council is not fetched — run: node scripts/council-sync.mjs'); process.exit(1); }
  const now = git(['rev-parse', '--short', 'HEAD']).stdout?.trim();
  if (git(['fetch', '-q', 'origin']).status !== 0) { say(`council at ${now} — could not reach origin to compare`); process.exit(0); }
  const behind = Number(git(['rev-list', '--count', 'HEAD..origin/HEAD']).stdout?.trim() || '0');
  say(`council at ${now}` + (behind ? ` — ${behind} commit${behind === 1 ? '' : 's'} behind origin` : ' — current'));
  process.exit(behind ? 1 : 0);
}

if (!have) {
  say(`cloning ${REPO}`);
  fs.rmSync(SRC, { recursive: true, force: true });
  const r = spawnSync('git', ['clone', '-q', '--depth', '50', REPO, SRC], { encoding: 'utf8' });
  if (r.status !== 0) { say('clone FAILED: ' + (r.stderr || '').split('\n')[0]); process.exit(1); }
} else if (git(['fetch', '-q', 'origin']).status !== 0) {
  say('fetch failed — keeping what is already here');
} else {
  git(['reset', '-q', '--hard', 'origin/HEAD']);
}

if (REF && git(['checkout', '-q', REF]).status !== 0) { say(`could not check out ${REF}`); process.exit(1); }

if (SRC_ELSEWHERE) {
  const here = path.join(ROOT, '.council-src');
  fs.rmSync(here, { recursive: true, force: true });
  fs.symlinkSync(SRC, here);
  say(`.council-src → ${SRC.replace(process.env.HOME ?? '', '~')}  (this volume has no native xattrs)`);
}

const at = git(['rev-parse', '--short', 'HEAD']).stdout?.trim() ?? '?';
const when = git(['log', '-1', '--format=%ad', '--date=short']).stdout?.trim() ?? '?';
say(`council ${at} (${when})`);

// ── 2 · link it into place ───────────────────────────────────────────────────
/** Replace whatever is at `to` with a relative symlink to `from`, so the tree stays movable. */
function link(from, to) {
  const abs = path.join(ROOT, to);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.rmSync(abs, { recursive: true, force: true });
  fs.symlinkSync(path.relative(path.dirname(abs), path.join(SRC, from)), abs);
  say(`${to} → .council-src/${from}`);
}

link('scripts', path.join('scripts', 'council'));
link(path.join('skills', 'council'), path.join('.agents', 'skills', 'council'));
for (const c of fs.readdirSync(path.join(SRC, 'commands')).filter((f) => f.endsWith('.md') && !f.startsWith('._'))) {
  link(path.join('commands', c), path.join('.claude', 'commands', c));
}

// The vendored suite is gone: the council's tests belong to the council and run there.
for (const stale of ['council.test.mjs', 'survives-session-death.mjs']) {
  const p = path.join(ROOT, 'tests', stale);
  if (fs.existsSync(p) && !fs.lstatSync(p).isSymbolicLink()) {
    fs.rmSync(p); say(`removed the vendored tests/${stale} — it runs in .council-src now`);
  }
}

// ── 3 · prove it, rather than assume the link resolved ───────────────────────
const pre = spawnSync('node', [path.join(ROOT, 'scripts', 'council', 'council.mjs'), 'x', '--preflight'],
  { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
if (pre.status !== 0) { say(`preflight FAILED (exit ${pre.status}) — the fetched council does not run`); process.exit(1); }
say('preflight ok, through the link');

// This drive is exFAT, so macOS writes an AppleDouble sidecar beside every file it touches.
// They are binary resource forks, not source, and the council's own suite — correctly —
// refuses any file containing a control byte and any untracked file in its tree. Twelve
// failures, none of them about the council.
//
// Stripped here rather than filtered in the suite, because the suite belongs upstream and a
// local edit to it is a local edit with a timer on it. **Reported, never silent:** a sync that
// quietly deletes things in your working tree is a sync nobody should trust.
const strip = (dir) => {
    let n = 0;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.name.startsWith('._')) { fs.rmSync(p, { force: true }); n++; }
      else if (e.isDirectory()) n += strip(p);
    }
  return n;
};
{
  const n = strip(SRC);
  if (n) say(`removed ${n} AppleDouble sidecar${n === 1 ? '' : 's'} this volume wrote into the clone`);
}

let bad = 0;
for (const s of fs.readdirSync(path.join(SRC, 'tests')).filter((f) => f.endsWith('.mjs') && !f.startsWith('._'))) {
  // Again, immediately before each run: the preflight above touched the tree and this volume
  // wrote a fresh sidecar behind it. Cleaning once was not enough, which is the whole
  // character of the problem — it is not a state to reach, it is a rate to outpace.
  strip(SRC);
  const r = spawnSync('node', [path.join(SRC, 'tests', s)], { cwd: SRC, encoding: 'utf8', timeout: 900000 });
  const line = (r.stdout?.match(/\d+ passed, \d+ failed/g) ?? ['no result']).pop();
  say(`${r.status === 0 ? '✓' : '✗'} its own ${s}: ${line}`);
  if (r.status !== 0) bad++;
}
if (bad) { say('fetched, but its own suite is red — not vouching for it'); process.exit(1); }

fs.writeFileSync(path.join(ROOT, '.council-version'),
  `${at}\n${when}\nfetched ${new Date().toISOString().slice(0, 10)}\n`);
say('recorded in .council-version');

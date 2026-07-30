#!/usr/bin/env node
// Generate an image by driving the Codex CLI, and find the file wherever it actually landed.
//
//   nexa-image "a blue circle on white"
//   nexa-image "a logo" --out assets/brand      where to put it, relative to the project
//   nexa-image "a chart" --name revenue.png     name it yourself
//   nexa-image "..." --json                     machine-readable result
//
// Exit 0 = an image exists and its path is printed. Exit 1 = it does not, and why.
//
// ── why the path handling is the whole job ──────────────────────────────────
//
// Codex is an agent, not an image endpoint: it writes and runs code to produce the file. So
// **it decides where the file goes**, and it is inconsistent about saying so. Measured against
// the real CLI:
//
//   · asked to write `/tmp/x/circle.png`, it reported `/private/tmp/x/circle.png` — macOS
//     resolves `/tmp` through a symlink, so the string it prints does not match the string you
//     asked for even though both name the same file
//   · it may answer with an absolute path, a relative one, a `WROTE=` line, a markdown link, or
//     bare prose with the filename in it
//   · it may write the file and never name it at all
//
// A tool that trusts the printed path fails on every one of those. So the printed path is a
// *hint*, checked and used when it resolves, and the authority is the filesystem: the working
// directory is watched, and any image file that appears during the run is the result. Every
// candidate is compared by REAL path, so `/tmp` and `/private/tmp` collapse to one file.
//
// ── things learned by running it, not by reading docs ───────────────────────
//
//   · `codex exec` refuses outside a trusted directory unless `--skip-git-repo-check` is passed
//   · it reads stdin when no prompt argument is given, so stdin must be closed or it hangs
//   · it needs `--sandbox workspace-write` or it cannot write the file it was asked for

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectRootFor, statePath } from './hooks/roots.mjs';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|tiff?|avif)$/i;

/** Magic-byte sniffing, because an "image" that is an HTML error page is not an image. */
export function looksLikeImage(file) {
  let fd;
  try {
    const buf = Buffer.alloc(12);
    fd = fs.openSync(file, 'r');
    const n = fs.readSync(fd, buf, 0, 12, 0);
    if (n < 4) return false;
    const hex = buf.toString('hex');
    if (hex.startsWith('89504e47')) return 'png';
    if (hex.startsWith('ffd8ff')) return 'jpeg';
    if (hex.startsWith('47494638')) return 'gif';
    if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'webp';
    if (hex.startsWith('424d')) return 'bmp';
    // SVG is text; accept only if it really opens as one.
    const head = fs.readFileSync(file, 'utf8').slice(0, 400).trimStart();
    if (/^<(\?xml|svg)/i.test(head) && /<svg[\s>]/i.test(head)) return 'svg';
    return false;
  } catch { return false; }
  finally { if (fd !== undefined) try { fs.closeSync(fd); } catch { /* already closed */ } }
}

/**
 * Every path Codex might have meant, in the order worth trying.
 *
 * **Parsing is best-effort on purpose.** It feeds candidates to a filesystem check that decides;
 * a pattern that matches nothing costs one `existsSync`, and a pattern that is missing costs a
 * fallback scan that would have found the file anyway.
 */
export function parsePaths(out) {
  const hits = [];
  const push = (s) => { if (s && !hits.includes(s)) hits.push(s); };
  for (const m of out.matchAll(/WROTE=(\S+)/g)) push(m[1]);
  for (const m of out.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) push(m[1]);            // markdown image
  for (const m of out.matchAll(/(?:^|[\s'"`(])((?:\/|\.\/|~\/)[^\s'"`)]+\.(?:png|jpe?g|gif|webp|svg|bmp|tiff?|avif))/gi)) push(m[1]);
  for (const m of out.matchAll(/(?:^|[\s'"`(])([\w./-]+\.(?:png|jpe?g|gif|webp|svg|bmp|tiff?|avif))/gi)) push(m[1]);
  return hits;
}

/** Resolve a candidate against the places it could be relative to, by REAL path. */
export function resolveCandidate(candidate, bases) {
  const tries = [];
  if (candidate.startsWith('~/')) tries.push(path.join(os.homedir(), candidate.slice(2)));
  if (path.isAbsolute(candidate)) tries.push(candidate);
  else for (const b of bases) tries.push(path.resolve(b, candidate));
  for (const t of tries) {
    try {
      const real = fs.realpathSync(t);
      if (fs.statSync(real).isFile()) return real;
    } catch { /* not this one */ }
  }
  return null;
}

/** Every image file under `dir`, newest first, that did not exist before the run. */
/**
 * Where `--out` is allowed to point.
 *
 * **An image tool is a file-writing tool, and `--out` is its one attacker-shaped input.**
 * Measured before this existed: `--out ../../../etc` resolved to `/Users/you/orca/etc`,
 * `--out /etc` resolved to `/etc`, and `--out ~/x` created a directory literally named `~`
 * because `path.resolve` does not expand tildes.
 *
 * Two destinations are legitimate and no others: **inside the project** (assets, brand images,
 * anything that belongs in the repo and gets committed) and **inside the project's own state
 * directory** (scratch output that should not touch the repo). Both are compared by real path,
 * so a symlinked prefix cannot smuggle a path past the check.
 *
 * `~` is expanded rather than refused, because a user who types it means their home directory
 * and silently creating `./~/` is the kind of surprise nobody debugs quickly — but it is then
 * held to the same containment rule as everything else.
 *
 * @returns {{dir: string}|{error: string}}
 */
export function resolveOutDir(raw, { root, stateDir }) {
  const expanded = raw.startsWith('~/') || raw === '~'
    ? path.join(os.homedir(), raw.slice(1))
    : raw;
  const abs = path.resolve(root, expanded);
  // Compare against the real path of the nearest existing ancestor: the target itself usually
  // does not exist yet, and realpath of a missing path throws.
  let probe = abs;
  for (let i = 0; i < 64 && !fs.existsSync(probe); i++) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  let realProbe = probe;
  try { realProbe = fs.realpathSync(probe); } catch { /* keep the literal */ }
  const tail = path.relative(probe, abs);
  const real = path.join(realProbe, tail);

  const allowed = [root, stateDir].filter(Boolean).map((d) => {
    try { return fs.realpathSync(d); } catch { return path.resolve(d); }
  });
  const inside = allowed.some((a) => real === a || real.startsWith(`${a}${path.sep}`));
  if (!inside) {
    return { error: `--out must stay inside the project or its state directory — ${raw} resolves to ${real}` };
  }
  return { dir: real };
}

export function newImages(dir, before) {
  const found = [];
  const walk = (d, depth) => {
    if (depth > 4) return;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === '.git' || e.name === 'node_modules' || e.name.startsWith('._')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p, depth + 1); continue; }
      if (!IMAGE_EXT.test(e.name)) continue;
      let real; let st;
      try { real = fs.realpathSync(p); st = fs.statSync(real); } catch { continue; }
      if (before.has(real)) continue;
      found.push({ file: real, mtime: st.mtimeMs });
    }
  };
  walk(dir, 0);
  return found.sort((a, b) => b.mtime - a.mtime).map((f) => f.file);
}

/** Snapshot of every image already present, by real path — so "new" means new. */
export function snapshotImages(dir) {
  const set = new Set();
  const walk = (d, depth) => {
    if (depth > 4) return;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === '.git' || e.name === 'node_modules' || e.name.startsWith('._')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p, depth + 1); continue; }
      if (!IMAGE_EXT.test(e.name)) continue;
      try { set.add(fs.realpathSync(p)); } catch { /* vanished */ }
    }
  };
  walk(dir, 0);
  return set;
}

/**
 * Decide the result from what Codex said and what appeared on disk.
 *
 * Pure, so the decision can be tested without spending minutes and tokens on a real run — the
 * parsing and the precedence are where the bugs live, not in the subprocess call.
 *
 * @returns {{file: string|null, how: string}}
 */
export function pickResult({ out, bases, workdir, before }) {
  for (const c of parsePaths(out)) {
    const resolved = resolveCandidate(c, bases);
    if (resolved && looksLikeImage(resolved)) return { file: resolved, how: 'named in the output' };
  }
  // It wrote something and did not say so, or said so in a form nothing matched.
  const appeared = newImages(workdir, before).filter((f) => looksLikeImage(f));
  if (appeared.length) return { file: appeared[0], how: 'found on disk — the output did not name it usably' };
  return { file: null, how: 'no image was produced' };
}

// ── everything below runs only as a command ─────────────────────────────────
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname)) {
  const argv = process.argv.slice(2);
  const JSON_OUT = argv.includes('--json');
  const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
  const prompt = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--out' && argv[i - 1] !== '--name').join(' ').trim();

  const die = (msg, hint = '') => {
    if (JSON_OUT) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
    else console.error(`  ❌ ${msg}${hint ? `\n       ${hint}` : ''}`);
    process.exit(1);
  };

  if (!prompt) die('no prompt given', 'nexa-image "a blue circle on white" [--out assets] [--name x.png]');

  const codex = spawnSync('codex', ['--version'], { encoding: 'utf8' });
  if (codex.status !== 0) die('the codex CLI is not available', 'install it, or run `codex login`');

  const { root: ROOT, trusted } = projectRootFor(import.meta.url);
  const stateImages = statePath(trusted ? ROOT : process.cwd(), 'images');

  // ── two homes, and the default is the one that touches nothing ─────────────
  //
  // **Scratch output goes to the state directory; source resources go in the repo.** An image
  // that is part of the product — a logo, an icon, a diagram in the docs — belongs beside the
  // code and gets committed, so `--out assets/brand` is a first-class use rather than an escape
  // hatch. Everything else is a by-product and has no business dirtying somebody's git status,
  // so that is the default.
  //
  // `--out` is contained either way; see resolveOutDir for what that is defending against.
  let outDir;
  if (flag('--out')) {
    const r = resolveOutDir(flag('--out'), { root: ROOT, stateDir: stateImages ? path.dirname(stateImages) : null });
    if (r.error) die(r.error, 'use a path inside the project, e.g. --out assets/brand');
    outDir = r.dir;
  } else {
    outDir = stateImages ?? path.join(process.cwd(), 'images');
  }
  fs.mkdirSync(outDir, { recursive: true });
  const inRepo = (() => {
    try { return fs.realpathSync(outDir).startsWith(`${fs.realpathSync(ROOT)}${path.sep}`); }
    catch { return false; }
  })();

  const name = flag('--name') || `image-${Date.now()}.png`;
  const target = path.join(outDir, name);

  // Codex runs IN the output directory, so the ordinary "save it here" answer is already right.
  const before = snapshotImages(outDir);
  const instruction = [
    `Generate an image: ${prompt}`,
    '',
    `Save it as "${name}" in the current working directory.`,
    'Use whatever works locally — python3 with PIL, node, or ImageMagick. If no imaging library',
    'is available, write a valid PNG by hand rather than giving up.',
    'Do not ask questions. When finished, print exactly one line: WROTE=<absolute path>',
  ].join('\n');

  if (!JSON_OUT) console.log(`  generating with codex → ${outDir}`);
  const r = spawnSync('codex', [
    'exec', '--skip-git-repo-check', '--sandbox', 'workspace-write',
    '-c', 'model_reasoning_effort=low', instruction,
  ], { cwd: outDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 900000 });

  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const { file, how } = pickResult({ out, bases: [outDir, ROOT, process.cwd()], workdir: outDir, before });

  if (!file) {
    die('codex ran but no image was produced', out.trim().split('\n').slice(-3).join(' | ').slice(0, 300));
  }

  // Put it at the requested name if codex chose its own, so the caller gets what it asked for.
  let final = file;
  if (path.resolve(file) !== path.resolve(target)) {
    try { fs.copyFileSync(file, target); final = target; } catch { /* keep where it is */ }
  }
  const kind = looksLikeImage(final);
  const size = fs.statSync(final).size;

  if (JSON_OUT) console.log(JSON.stringify({ ok: true, file: final, kind, bytes: size, how, inRepo }, null, 2));
  else {
    console.log(`  ✅ ${final}`);
    console.log(`     ${kind.toUpperCase()}, ${size.toLocaleString()} bytes — ${how}`);
    // Said out loud, because a file that appears in `git status` unannounced is the complaint
    // this whole workspace was reorganised to stop.
    console.log(inRepo
      ? '     in your repository — commit it if it is a source resource'
      : '     outside your repository — pass --out <dir> to put it in the repo');
  }
}

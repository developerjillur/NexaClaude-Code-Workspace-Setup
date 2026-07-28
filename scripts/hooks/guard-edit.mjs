#!/usr/bin/env node
// PreToolUse hook on Write|Edit|NotebookEdit.
//
// This is the file that turns "WIP = 1" and "no code without a spec" from prose into a
// refusal. Everything else in this workspace asks; this one stops.
//
// Contract with Claude Code:
//   stdin  = JSON {tool_name, tool_input:{file_path,...}, ...}
//   exit 0 = allow
//   exit 2 = BLOCK, and stderr is shown to the model so it can correct itself
//
// Deliberately narrow. It guards edits to the *product code*, not to the workspace, the
// plan, or scratch files — a guard that fires on everything gets disabled within a day,
// and a disabled guard is worse than none because everyone still believes in it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

// ── which paths are product code ─────────────────────────────────────────────
//
// Read from workspace.config.json rather than hardcoded, because this hook is the one that
// REFUSES and a refusal aimed at the wrong tree is how a guard gets switched off. If the
// config is missing or malformed the fallback is `code/` — deliberately narrow, so a broken
// config makes the gate quieter rather than turning the whole workspace into product code.
function codeDirs() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'workspace.config.json'), 'utf8'));
    const dirs = Array.isArray(cfg.codeDirs) ? cfg.codeDirs.filter((d) => typeof d === 'string' && d) : [];
    return dirs.length ? dirs : ['code'];
  } catch { return ['code']; }
}
const CODE = codeDirs();
// macOS resolves /var to /private/var, and a path can arrive in either form: the shell hands
// over `/var/...` while ROOT is computed as `/private/var/...`. `path.relative` between the two
// then yields `../../..`, the file reads as outside the workspace, and **the guard passes
// silently** — the same fail-open shape as every other control here, found by running a fresh
// clone from a temp directory rather than by reading the code.
//
// So both the real and the given form of every path are compared, on both sides.
// Walks UP until something exists, then rejoins the tail. One level is not enough: the guard
// is usually asked about a file that does not exist yet, inside a directory that does not
// exist yet either — `code/x.js` in a fresh clone where `code/` is the user's symlink and has
// not been made. A one-level fallback returned the path unchanged, so the fix looked applied
// and the guard still failed open. Found by printing the values instead of reasoning about them.
const realish = (p) => {
  let cur = path.resolve(p);
  const tail = [];
  for (let i = 0; i < 64; i++) {
    try { return path.join(fs.realpathSync(cur), ...tail); } catch { /* keep walking up */ }
    const parent = path.dirname(cur);
    if (parent === cur) return path.resolve(p);
    tail.unshift(path.basename(cur));
    cur = parent;
  }
  return path.resolve(p);
};
const ROOTS = [...new Set([ROOT, realish(ROOT)])];

/**
 * True when `p` names something inside a configured product-code path.
 *
 * **Anchored at the workspace root, not matched anywhere in the string.** The first version
 * tested `(^|/)src(/|$)`, so with `codeDirs: ["src"]` a file at `code/src/thing.js` also
 * matched — a path the config had not named. A gate that fires on paths nobody configured is
 * the shape that gets switched off, so `src` here means `<root>/src` and nothing else.
 *
 * Shell arguments arrive relative to the cwd rather than absolute, so both forms are tried.
 */
const isCode = (p) => {
  const norm = String(p).replace(/\\/g, '/');
  const rels = new Set();
  const add = (abs) => {
    for (const base of ROOTS) {
      const r = path.relative(base, abs).replace(/\\/g, '/');
      if (r && !r.startsWith('..')) rels.add(r);
    }
  };
  if (path.isAbsolute(norm)) { add(norm); add(realish(norm)); }
  else {
    rels.add(norm.replace(/^\.\//, ''));
    add(path.resolve(process.cwd(), norm));
    add(realish(path.resolve(process.cwd(), norm)));
  }
  return [...rels].some((rel) =>
    CODE.some((d) => {
      const clean = d.replace(/^\.\//, '').replace(/\/$/, '');
      return rel === clean || rel.startsWith(`${clean}/`);
    }));
};

const read = () => new Promise((r) => {
  let s = ''; process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { s += d; });
  process.stdin.on('end', () => r(s));
});

const allow = () => process.exit(0);
const block = (why) => { console.error(why); process.exit(2); };

const input = JSON.parse((await read()) || '{}');
let file = input?.tool_input?.file_path ?? '';

// ── the hole the council found ───────────────────────────────────────────────
//
// This hook was wired only to Write|Edit|NotebookEdit. **A shell command writing the same file
// was never seen** — `sed -i`, `cat > f`, `printf >> f`, `python3 - <<EOF`, `tee`, `cp`. Every
// one of those edits product code with the guard silently allowing it, and the session that
// built this workspace used all of them.
//
// Four of five council members named this independently and gave the exact bypass.
//
// **This cannot be complete and the file says so.** A shell is a programming language; a
// command can construct a path at runtime, or pipe base64 into sh. What it catches is the
// CARELESS case — an agent reaching for `sed` because it is convenient — which is the one that
// actually happens. A determined bypass is possible and is a different problem, answered by
// review and by `git diff`, not by a matcher.
if (input?.tool_name === 'Bash') {
  const cmd = String(input?.tool_input?.command ?? '');

  // ── the hole that was not theory ─────────────────────────────────────────────
  //
  // On 2026-07-28 this workspace's own agent destroyed two days of uncommitted work with
  // `git checkout <a source file>` — undoing a demo edit and taking unrelated, uncommitted
  // 26 July fixes with it. **The one blocking hook in the workspace did not see it**, because
  // it was watching for writes and this was a discard.
  //
  // The rule is different from the rest of this file. Not "is there a card" — a card would not
  // have helped. The question is: **would this command throw away something nobody has
  // committed?** If the path is clean, these commands are a no-op and blocking would be pure
  // friction. If it is dirty, this is the exact loss that already happened once.
  //
  // Written by first constructing the case it must stay SILENT on — a clean file — because
  // every control added to this workspace was wrong on its first version in the same
  // direction, and the false-positive case is what catches that.
  // Two shapes, and conflating them is what made the first two versions of this wrong.
  //
  //   PATHSPEC   `git checkout <path>` / `git restore <path>` — the argument names a file
  //   WHOLE TREE `git reset --hard` / `git clean` / `git stash` — the argument, if any, is a
  //              REVISION. Passing `HEAD` to `git status -- HEAD` asks about a file named
  //              "HEAD", finds nothing, and reports the tree as clean. `git reset --hard HEAD`
  //              walked straight through the version of this guard written to stop it.
  const PATHSPEC = [
    /(?:^|[\s;&|])git\s+(?:-[^\s]+\s+)*checkout\s+(?:-[^\s]+\s+)*(?:--\s+)?([^\s;&|]+)/g,
    /(?:^|[\s;&|])git\s+(?:-[^\s]+\s+)*restore\s+(?:-[^\s]+\s+)*(?:--\s+)?([^\s;&|]+)/g,
  ];
  const WHOLE_TREE = [
    /(?:^|[\s;&|])git\s+(?:-[^\s]+\s+)*reset\b[^;&|]*?--hard\b/,
    /(?:^|[\s;&|])git\s+(?:-[^\s]+\s+)*clean\b[^;&|]*?-[^\s;&|]*[fdx]/,
    // Only the forms that STASH something. `list`, `show`, `pop`, `apply`, `drop` do not
    // discard working-tree state and must stay silent.
    /(?:^|[\s;&|])git\s+(?:-[^\s]+\s+)*stash\s*(?:push|save|-[^\s;&|]+)?\s*(?:$|[;&|])/,
  ];
  const discardPaths = new Set();
  let sawDiscard = false;
  for (const re of WHOLE_TREE) if (re.test(cmd)) sawDiscard = true;   // no path — check it all
  for (const re of PATHSPEC) {
    for (const m of cmd.matchAll(re)) {
      // A token is only a discard if it names something on disk. `git checkout main` and
      // `git checkout -b feat/x` name branches, and blocking those is friction with no safety.
      const t = m[1];
      if (t === '.' || fs.existsSync(path.resolve(input?.cwd || process.cwd(), t))) {
        sawDiscard = true; discardPaths.add(t);
      }
    }
  }
  if (sawDiscard && process.env.NEXA_ALLOW_DISCARD !== '1') {
    // Ask git what would actually be lost. `--porcelain` prints nothing for a clean path, so
    // silence here means the command destroys nothing and is allowed through untouched.
    const { spawnSync } = await import('node:child_process');
    const args = ['status', '--porcelain', '--'];
    const paths = [...discardPaths].filter((p) => !p.startsWith('-'));
    const probe = spawnSync('git', paths.length ? [...args, ...paths] : ['status', '--porcelain'],
      { cwd: input?.cwd || process.cwd(), encoding: 'utf8' });
    const dirty = (probe.stdout || '').trim().split('\n').filter(Boolean);
    if (dirty.length) {
      block(
        `BLOCKED — this discards work nobody has committed.\n\n` +
        `  ${cmd.slice(0, 160)}\n\n` +
        `Uncommitted right now:\n${dirty.slice(0, 12).map((l) => `  ${l}`).join('\n')}` +
        (dirty.length > 12 ? `\n  …and ${dirty.length - 12} more` : '') + `\n\n` +
        `This exact command cost this project two days of pricing fixes on 2026-07-28 —\n` +
        `board/6-done/004-pricing-restored.md. A stray edit of your own is not worth\n` +
        `someone else's uncommitted work.\n\n` +
        `Instead: commit or stash by name first, or undo your own edit by rewriting the\n` +
        `file. If you have read the list above and still mean it: NEXA_ALLOW_DISCARD=1.`,
      );
    }
    process.exit(0); // clean path — the command destroys nothing
  }

  // Redirection, in-place edits, and the copy/move family — each followed by a path we care
  // about. Deliberately anchored on the WRITE verb, so `grep code/src/x.js` stays allowed.
  const writes = [
    /(?:^|[\s;&|])(?:>>?)\s*("?)([^\s"'|;&]+)\1/g,
    /(?:^|[\s;&|])sed\s+(?:-[^\s]*\s+)*-i(?:\s+''|\s+"")?\s+(?:-[^\s]*\s+)*(?:"[^"]*"|'[^']*'|\S+)\s+("?)([^\s"'|;&]+)\1/g,
    /(?:^|[\s;&|])(?:tee|cp|mv|install)\s+(?:-[^\s]*\s+)*(?:\S+\s+)*("?)([^\s"'|;&]+)\1/g,
    /(?:^|[\s;&|])(?:truncate|dd)\s[^;&|]*\bof=("?)([^\s"'|;&]+)\1/g,
  ];
  const targets = new Set();
  for (const re of writes) {
    for (const m of cmd.matchAll(re)) if (m[2]) targets.add(m[2]);
  }
  const guarded = [...targets].find(isCode);
  if (guarded) file = guarded;
  else process.exit(0);
}

// ── Escape hatches, in order of how often they are legitimate ────────────────

// 1. The workspace, the plan, and docs are edited by process work, not by cards.
const rel = path.relative(ROOT, file);
const isProductCode = isCode(file);
if (!isProductCode) allow();

// 2. A deliberate override, which is logged rather than silent. Emergencies exist.
if (process.env.NEXA_NO_CARD === '1') {
  console.error('⚠ NEXA_NO_CARD=1 — card check skipped deliberately. Say so in the card later.');
  allow();
}

// ── The rules ────────────────────────────────────────────────────────────────

const buildDir = path.join(ROOT, 'board', '3-build');
const cards = fs.existsSync(buildDir)
  ? fs.readdirSync(buildDir).filter((f) => f.endsWith('.md') && !f.startsWith('._'))
  : [];

if (cards.length === 0) {
  block(
`BLOCKED — nothing is in board/3-build, so this edit belongs to no card.

Editing product code with no card in build is how work drifts from the plan: there is no
spec to check it against and no place to record what was decided.

Do one of:
  · move a card into board/3-build      git mv board/2-plan/NNN-*.md board/3-build/
  · create one                          cp templates/CARD.md board/0-backlog/NNN-slug.md
  · if this is genuinely not card work   NEXA_NO_CARD=1, and say why in the card later

Editing: ${rel || file}`);
}

if (cards.length > 1) {
  block(
`BLOCKED — ${cards.length} cards are in board/3-build. The WIP limit is 1.

  ${cards.join('\n  ')}

Two cards in build is how both end up half-finished: context is split, neither gets
reviewed, and the second one is usually started because the first got hard.

Finish or move one back, then edit.`);
}

// One card, and it must actually have been planned — a card that skipped 2-plan has no
// named files and no reuse ladder, which is exactly the state that produces duplicate code.
const body = fs.readFileSync(path.join(buildDir, cards[0]), 'utf8');
if (!/graphify explain/.test(body)) {
  block(
`BLOCKED — ${cards[0]} has no reuse ladder recorded.

Section "## 2 · Plan" must show the graphify explain that was run before writing. Without it
nobody can tell whether this code already exists somewhere in the repo — and rewriting what
exists is invisible to the author by definition.

Run it, paste the result into the card, then edit:
  graphify explain "<what this change does, in plain words>"`);
}

allow();

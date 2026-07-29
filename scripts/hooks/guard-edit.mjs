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
 * **Compared as absolute paths, both sides resolved.** Three earlier versions each got this
 * wrong in a different way, and all three failed in the direction that matters:
 *
 *   1. `(^|/)code/` matched the string anywhere, so a file in somebody else's repository
 *      demanded a card here — the false-positive direction, which is how a guard gets
 *      switched off.
 *   2. Anchoring with `path.relative` fixed that and broke the opposite case: a codeDir
 *      OUTSIDE the workspace (`../my-app`, the normal setup when the code is its own repo)
 *      produced a relative path starting with `..` and was discarded, so **the product tree
 *      was unguarded whenever it was addressed by its real path.**
 *   3. Resolving symlinks one level up was not enough, because the guard is usually asked
 *      about a file that does not exist yet, inside a directory that does not exist yet.
 *
 * So: resolve every configured directory to an absolute, real path once; resolve the incoming
 * path the same way; compare by prefix. No relative arithmetic, no string search.
 */
const CODE_ABS = CODE.map((d) => realish(path.resolve(ROOT, d)));
const isCode = (p) => {
  const raw = String(p).replace(/\\/g, '/');
  const abs = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  const candidates = new Set([path.resolve(abs), realish(abs)]);
  // A relative argument may also be meant relative to the workspace rather than the cwd.
  if (!path.isAbsolute(raw)) {
    candidates.add(path.resolve(ROOT, raw));
    candidates.add(realish(path.resolve(ROOT, raw)));
  }
  return [...candidates].some((c) =>
    CODE_ABS.some((d) => c === d || c.startsWith(`${d}${path.sep}`)));
};

const read = () => new Promise((r) => {
  let s = ''; process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { s += d; });
  process.stdin.on('end', () => r(s));
});

// @rules discard-uncommitted, no-card-in-build, wip-limit, no-reuse-ladder
const allow = () => process.exit(0);

// ── why a refusal carries an id ──────────────────────────────────────────────
//
// Every control here answers with one bit — exit 2 — and one bit cannot say WHICH rule fired.
// That is not a stylistic complaint; it is the cause of the six defects found in a single day
// by `scripts/kill-audit.mjs`:
//
//   · the `/loop` wakeup fixture was blocked by the short-delay rule, so deleting the rule
//     written for that exact incident changed nothing
//   · the TBD card was refused for missing three other questions
//   · the "lying card" cited a missing file AND a missing proof
//   · `load(id) { return null }` tripped `unused-param` as well as `stub-return`
//   · and one fixture accepted a CRASH as a refusal, because a stack trace also exits 1
//
// Two council members proposed the same repair independently:
//
//   "Make every refusal carry a rule id, and make fixtures assert the id, not the exit code.
//    Then an over-determined fixture stops being silently worthless: delete rule A while rule
//    B also fires, and the assertion 'rule A fired' fails immediately."
//
// This is the pilot on one control, not a workspace-wide change — the claim is testable and
// `kill-audit` can test it, which is the only reason to believe it before doing the rest.
//
// The id goes on its own first line so it is trivially greppable, and the prose that a human
// actually needs follows unchanged.
const block = (id, why) => { console.error(`refused: ${id}\n${why}`); process.exit(2); };

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
  // ── the override has to work where the guard actually fires ─────────────────
  //
  // For a long time the only escape was `NEXA_ALLOW_DISCARD=1`, and the refusal said so. **It
  // cannot work.** This runs as a PreToolUse hook, in a process the agent spawns *before* your
  // command; an inline `NEXA_ALLOW_DISCARD=1 git checkout …` sets that variable for `git`, in a
  // process that does not exist yet. The guard printed an instruction that could not be
  // followed — discovered by following it, twice, and being refused both times.
  //
  // A refusal with an unusable escape hatch is the same category of failure as a fail-open: it
  // is a control nobody can actually live with, and living with it is how it stays switched on.
  //
  // So there is a marker file, which the hook CAN see. It is **consumed on use** — deleted the
  // moment it is honoured — so it cannot be created once and left on, which is what an
  // environment variable in a shell profile becomes.
  const flag = path.join(ROOT, '.nexa-allow-discard');
  let allowed = process.env.NEXA_ALLOW_DISCARD === '1';
  if (!allowed && fs.existsSync(flag)) {
    try { fs.rmSync(flag); } catch { /* honoured anyway; the warning below is the record */ }
    console.error('⚠ .nexa-allow-discard was present — honoured once, and removed.');
    allowed = true;
  }

  if (sawDiscard && !allowed) {
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
'discard-uncommitted',
        `BLOCKED — this discards work nobody has committed.\n\n` +
        `  ${cmd.slice(0, 160)}\n\n` +
        `Uncommitted right now:\n${dirty.slice(0, 12).map((l) => `  ${l}`).join('\n')}` +
        (dirty.length > 12 ? `\n  …and ${dirty.length - 12} more` : '') + `\n\n` +
        `This exact command cost this project two days of pricing fixes on 2026-07-28 —\n` +
        `board/6-done/004-pricing-restored.md. A stray edit of your own is not worth\n` +
        `someone else's uncommitted work.\n\n` +
        `Instead: commit or stash by name first, or undo your own edit by rewriting the\n` +
        `file — \`git show HEAD:path > path\` restores it as a WRITE rather than a discard,\n` +
        `and leaves everything else alone.\n\n` +
        `If you have read the list above and still mean it:\n` +
        `  touch .nexa-allow-discard   # honoured once, then deleted\n\n` +
        `(\`NEXA_ALLOW_DISCARD=1 git checkout …\` does NOT work: this hook runs in a separate\n` +
        `process, before your command exists, so an inline variable never reaches it. It is\n` +
        `still honoured when exported into the session environment.)`,
      );
    }
    process.exit(0); // clean path — the command destroys nothing
  }

  // Redirection, in-place edits, and the copy/move family — each followed by a path we care
  // about. Deliberately anchored on the WRITE verb, so `grep code/src/x.js` stays allowed.
  // ── quoted paths, because this drive's name has a space in it ──────────────
  //
  // Every pattern below used `[^\s"'|;&]+`, which stops at the first space. So
  // `cp /tmp/x.js "/Volumes/T7 Shield/…/src/tools.js"` matched nothing at all and the write
  // went through — a hole, not a false positive, and the one direction that actually matters.
  //
  // A quoted argument is one token no matter what is inside it. Each pattern now takes
  // `"…"`, `'…'` or a bare run, in that order, and the helper strips the quotes.
  const Q = String.raw`(?:"([^"]+)"|'([^']+)'|([^\s"'|;&<>]+))`;
  /** The first non-empty capture group in a match, which is the token whichever form it took. */
  const tok = (m) => m.slice(1).find((g) => g != null && g !== '') ?? '';

  const ARG = String.raw`(?:"[^"]*"|'[^']*'|[^\s"'|;&]+)`;   // one argument, quoted or not
  const writes = [
    new RegExp(String.raw`(?:^|[\s;&|])(?:>>?)\s*${Q}`, 'g'),
    new RegExp(String.raw`(?:^|[\s;&|])sed\s+(?:-[^\s]*\s+)*-i(?:\s+''|\s+"")?\s+(?:-[^\s]*\s+)*${ARG}\s+${Q}`, 'g'),
    // cp / mv / install write to their LAST argument…
    new RegExp(String.raw`(?:^|[\s;&|])(?:cp|mv|install)\s+(?:-[^\s]*\s+)*(?:${ARG}\s+)*${Q}`, 'g'),
    // …and `tee` writes to its FIRST. Folding it in with the others meant
    // `tee code/src/z.js < input` had its destination read as `input`, and the write to
    // product code was allowed. Found by a probe that ran the commands instead of reading
    // the pattern.
    new RegExp(String.raw`(?:^|[\s;&|])tee\s+(?:-[^\s]*\s+)*${Q}`, 'g'),
    new RegExp(String.raw`(?:^|[\s;&|])(?:truncate|dd)\s[^;&|]*\bof=${Q}`, 'g'),
  ];

  // A bare word is not a path, and neither is anything still carrying shell syntax.
  //
  // Both produced false positives within minutes of each other. `**Each` — a word out of
  // prose inside a heredoc — was resolved against the cwd, which happened to be the product
  // repo, and a command that wrote nothing was refused. Then `$(pwd)`, whose value the shell
  // decides at run time, did the same.
  //
  // **A guard that fires on commands nobody is worried about is the one that gets switched
  // off**, so the uncertain case is allowed here and left to review.
  const unexpanded = (t) => /[$`*?{}()[\]]/.test(t);
  // `.` and `..` are never a redirect target, and `fs.existsSync` says yes to both — so a
  // sentence containing `> .` resolved to the cwd, and when the cwd was inside a guarded tree
  // the guard refused a command that wrote nothing. Fifth false positive of this family, and
  // the first where the existence check itself was the hole.
  const selfish = (t) => t === '.' || t === '..' || t === './' || t === '../';
  const looksLikePath = (t) =>
    !unexpanded(t) && !selfish(t) &&
    (path.isAbsolute(t) || t.includes('/') || /\.[A-Za-z0-9]{1,8}$/.test(t) || fs.existsSync(t));

  // A command that begins by changing directory means its relative paths are relative to
  // THERE, not to where the hook happens to be standing. Ignoring the `cd` resolved every
  // relative token against the session's cwd — and when that cwd was inside a guarded tree,
  // an edit to a file in a completely different repository was refused. Third false positive
  // of the same family: **a relative path is meaningless without the directory it is relative
  // to, and the command says which one.**
  // ANY `cd` in the chain, not just a leading one — the LAST absolute one wins, because that
  // is where the shell will be standing by the time the write happens. The first version
  // anchored on `^`, so `node build.mjs && cd /elsewhere && echo x > notes.md` still resolved
  // `notes.md` against the session's cwd. Fourth false positive of this family, and it blocked
  // real work each time.
  let base = input?.cwd || process.cwd();
  for (const m of cmd.matchAll(/(?:^|[\s;&|])cd\s+("([^"]+)"|'([^']+)'|([^\s;&|]+))/g)) {
    const to = m[2] ?? m[3] ?? m[4];
    if (!to || to === '-') continue;                 // `cd -` goes somewhere unknowable
    // A RELATIVE cd moves the base too, and only counting absolute ones was the sixth false
    // positive of this family: `cd "$TMP" && cd w && printf x > board/1-spec/9.md` kept the
    // session's cwd as the base, so a file written inside a throwaway clone was judged against
    // the product repo and refused.
    base = path.resolve(base, to.replace(/^~(?=\/|$)/, process.env.HOME ?? '~'));
  }

  const targets = new Set();
  for (const re of writes) {
    for (const m of cmd.matchAll(re)) {
      // tok() picks whichever of the three quote forms matched, so a path with a space in it
      // is one token rather than the fragment before the space.
      const raw = tok(m);
      if (!raw || !looksLikePath(raw)) continue;
      targets.add(path.isAbsolute(raw) ? raw : path.resolve(base, raw));
    }
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
'no-card-in-build',
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
'wip-limit',
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
'no-reuse-ladder',
`BLOCKED — ${cards[0]} has no reuse ladder recorded.

Section "## 2 · Plan" must show the graphify explain that was run before writing. Without it
nobody can tell whether this code already exists somewhere in the repo — and rewriting what
exists is invisible to the author by definition.

Run it, paste the result into the card, then edit:
  graphify explain "<what this change does, in plain words>"`);
}

allow();

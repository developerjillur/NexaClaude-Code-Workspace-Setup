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
import { projectRoot, isAdoptedWorkspace, paths, codeDirs } from './roots.mjs';

// Two roots, and this one is the *project* — board, config, code directories. `roots.mjs` holds
// the evidence; the short version is that a single root computed from this file's own location
// is correct only while the scripts sit inside the workspace they guard. Packaged, they do not,
// and every check below silently answers about the wrong tree.
const { root: ROOT, source: ROOT_SOURCE, trusted: ROOT_TRUSTED } = projectRoot();
// Every plugin-written location comes from one module — see paths() in roots.mjs.
const P = paths(ROOT);

// ── which paths are product code ─────────────────────────────────────────────
//
// Read from workspace.config.json rather than hardcoded, because this hook is the one that
// REFUSES and a refusal aimed at the wrong tree is how a guard gets switched off. If the
// config is missing or malformed the fallback is `code/` — deliberately narrow, so a broken
// config makes the gate quieter rather than turning the whole workspace into product code.
// **Now resolved by `roots.mjs`, and a corrupt config REFUSES rather than falling back.** The
// local copy ended `catch { return ['code']; }`, which meant `echo '{oops' > workspace.config.json`
// silently returned this guard to a directory that does not exist in a `src/` project — turning
// the only blocking control in the workspace off, with no log and no diff. See `readConfig`.
const CODE_CFG = codeDirs(ROOT);
const CODE = CODE_CFG.dirs;
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

// @rules discard-uncommitted, no-card-in-build, wip-limit, no-reuse-ladder, project-root-unknown, config-unreadable, board-move-unguarded, autopilot-budget
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

  // ── moving a card is a TRANSITION, not a file move ────────────────────────
  //
  // Measured 2026-07-31: `git mv board/1-spec/001.md board/5-verify/001.md` exited 0. Four
  // gates skipped — spec approval, plan, build, review — with no refusal and no record. The
  // `Edit(./board/6-done/**)` deny rule does not help: permission rules never reach Bash.
  //
  // `nexa-move` is the transition function — it refuses a from→to pair the pipeline does not
  // define, runs that transition's guards, and rolls the move back if one refuses. This points
  // at it rather than reimplementing the check, because two implementations of one rule is how
  // `check.mjs` and `card-gate.mjs` came to disagree about the same board.
  //
  // Only `board/<stage>/` → `board/<other-stage>/`. Renaming a card inside its own stage, or
  // moving anything else, is not a transition and stays silent.
  // ── a heredoc DOCUMENTING the command is not the command ──────────────────
  //
  // Caught live: an edit replacing the `git mv` instructions in the docs was itself refused,
  // because the Python heredoc performing the replacement contained the string it was removing.
  // The file already records this failure mode for the discard rule — *"a guard that fires on
  // a read-only command is how `touch .nexa-allow-discard` becomes a reflex"* — and the new
  // rule shipped without the same defence.
  //
  // So the same treatment: quoted heredoc bodies and fenced blocks are stripped before matching.
  // A heredoc that is genuinely performing the move still contains it OUTSIDE the body, and a
  // constructed command remains outside this guard's reach either way — that limit is stated at
  // the end of the writers list rather than implied away.
  const prose = cmd
    // <<'EOF' … EOF and <<"EOF" … EOF — a QUOTED delimiter means the shell does not expand the
    // body, which is exactly the case where the body is data rather than commands.
    .replace(/<<-?\s*(['"])(\w+)\1[\s\S]*?^\s*\2\s*$/gm, '')
    .replace(/```[\s\S]*?```/g, '');
  // **`git` was required, so plain `mv` walked a card 1-spec → 6-done past every gate.** The
  // guard refused the careful spelling and allowed the careless one — including past
  // `invariants-held`, the single executable guard on the whole board. Anyone who typed the
  // obvious command got no refusal at all, which is the worst possible direction for this to
  // fail in: it is not the adversary who reaches for `mv`, it is everybody.
  //
  // `cp` matters for the same reason and is worse — it leaves the card in BOTH stages, so the
  // WIP=1 count and the stage the card claims stop agreeing with each other.
  const mv = prose.match(/(?:^|[\s;&|])(?:git\s+(?:-[^\s]+\s+)*)?(?:mv|cp)\s+(?:-[^\s]+\s+)*["']?([^\s"';&|]+)["']?\s+["']?([^\s"';&|]+)["']?/);
  if (mv) {
    const stageOf = (p) => p.match(/(?:^|\/)board\/([^/]+)\//)?.[1] ?? null;
    const a = stageOf(mv[1]); const b = stageOf(mv[2]);
    if (a && b && a !== b) {
      block('board-move-unguarded',
`BLOCKED — moving a card between stages is a transition, and this bypasses every gate on it.

    ${a} → ${b}

\`git mv\` asks nothing. A card can cross four stages this way with no spec, no plan, no
review and no record that it happened — measured, not hypothetical.

Use the transition function instead, which refuses a move the pipeline does not define and
runs that transition's guards:

  nexa-move ${(mv[1].match(/(\d+)-/) ?? [, '<NNN>'])[1]} ${b}
  nexa-move --list          every transition, and the guards on each
  nexa-move <NNN> ${b} --dry-run

If this genuinely is not a card transition — renaming, tidying, a fixture — NEXA_NO_CARD=1.`);
    }
  }

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
  // ── a dry run destroys nothing, and refusing one teaches the wrong reflex ────
  //
  // `git clean -n` / `--dry-run` PRINTS what it would remove and deletes not one byte, but the
  // pattern above sees the `f`/`d`/`x` and refuses it identically to the real command. Found by
  // this guard refusing `git clean -xfdn` while somebody was checking what was at risk — the
  // exact question the guard wants people to ask.
  //
  // **The cost of a false refusal is not friction, it is the override.** A guard that fires on a
  // read-only command is how `touch .nexa-allow-discard` becomes a reflex, and the next real
  // refusal is then waved through without being read.
  //
  // Each `git clean` is judged on its own arguments, so a genuine one chained after a dry run is
  // still caught. Non-letters after the dash are not considered, so a path named `-n…` cannot
  // pass as a flag; a combination this misses stays refused, which is the safe direction.
  const scanned = cmd.replace(/((?:^|[\s;&|]))(git\s+(?:-[^\s]+\s+)*clean\b[^;&|]*)/g,
    (whole, lead, seg) => (/--dry-run\b|\s-[a-zA-Z]*n[a-zA-Z]*(?:\s|$)/.test(seg) ? lead : whole));

  const discardPaths = new Set();
  let sawDiscard = false;
  for (const re of WHOLE_TREE) if (re.test(scanned)) sawDiscard = true;   // no path — check it all
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
  // **Consumed only when it is actually used, and only in a workspace we were invited into.**
  //
  // This block used to run before `sawDiscard` was consulted, so *any* Bash command deleted the
  // marker — `ls` burned the user's one-shot override, and it did so in repositories the
  // bootstrap had explicitly declined to adopt, which is a write into somebody else's tree by
  // the one hook that is supposed to be read-only until it refuses. Found by a second-model
  // review, which noticed that guarding the four document writers had left the fifth writer
  // — this one — unguarded.
  const flag = path.join(ROOT, '.nexa-allow-discard');
  let allowed = process.env.NEXA_ALLOW_DISCARD === '1';
  if (sawDiscard && !allowed && isAdoptedWorkspace(ROOT) && fs.existsSync(flag)) {
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
  // ── the third spelling of a path with a space, and it was a one-character bypass ──
  //
  // The quoted forms were added because this drive's name has a space in it. The BARE form
  // still stopped at the first unescaped space, and a shell has a third way to write the same
  // path — a backslash. Measured on the same repository, same command, three spellings:
  //
  //     sed -i "" s/a/b/ "code/x.js"                              → BLOCKED
  //     sed -i "" s/a/b/ "/Volumes/T7 Shield/…/code/x.js"         → BLOCKED
  //     sed -i "" s/a/b/ /Volumes/T7\ Shield/…/code/x.js          → ALLOWED
  //
  // `\ ` is the most idiomatic of the three, because it is what tab-completion produces. Any
  // repository whose path contains a space had a bypass reachable by pressing Tab.
  const Q = String.raw`(?:"([^"]+)"|'([^']+)'|((?:\\.|[^\s"'|;&<>])+))`;
  /**
   * The first non-empty capture group in a match, which is the token whichever form it took.
   * Backslash escapes are undone, so `T7\ Shield` becomes `T7 Shield` and compares equal to the
   * quoted spelling of the same path.
   */
  const tok = (m) => (m.slice(1).find((g) => g != null && g !== '') ?? '').replace(/\\(.)/g, '$1');

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
    // ── the writers a probe found walking straight past this list ──────────────
    //
    // Measured 2026-07-31 by feeding twenty ordinary write commands to this hook: four were
    // blocked. The list above covers what somebody reaches for FIRST; everything below is what
    // they reach for SECOND, which is the relevant set once the first attempt was refused.
    //
    // `python3 -c` and `node -e` matter most and are the least tractable — a shell is a
    // programming language and an inline program can build its path at run time. What is
    // matched is the LITERAL case: a quoted path sitting next to a write call. That is the
    // careless reach, which is the one that actually happens; a constructed path stays
    // allowed and is answered by review, exactly as this file already argues about heredocs.
    // GREEDY on the intermediate arguments, so `${Q}` lands on the LAST token. Lazy, the
    // expression matched `perl -i -pe s/a/b/ code/x.js` with `s/a/b/` as the path — it contains
    // a `/`, so `looksLikePath` said yes — and the real target was never examined. The same
    // trap as `tee` reading its destination as the input file, recorded a few lines above.
    new RegExp(String.raw`(?:^|[\s;&|])perl\s+(?:-[^\s]*\s+)*-[^\s]*i[^\s]*\s+(?:-[^\s]*\s+)*(?:${ARG}\s+)*${Q}`, 'g'),
    new RegExp(String.raw`(?:^|[\s;&|])truncate\s+(?:-[^\s]*\s+)*(?:${ARG}\s+)*${Q}`, 'g'),
    new RegExp(String.raw`(?:^|[\s;&|])rm\s+(?:-[^\s]*\s+)*${Q}`, 'g'),
    new RegExp(String.raw`(?:^|[\s;&|])rsync\s+(?:-[^\s]*\s+)*(?:${ARG}\s+)*${Q}`, 'g'),
    new RegExp(String.raw`(?:^|[\s;&|])(?:ed|ex)\s+(?:-[^\s]*\s+)*${Q}`, 'g'),
    // `patch FILE < diff` names its target; `patch -p1 < diff` does not, and that form is
    // caught by the `git apply` sibling below only when it is git. A bare `patch -p1` remains
    // outside this guard and the file says so rather than implying otherwise.
    new RegExp(String.raw`(?:^|[\s;&|])patch\s+(?:-[^\s]*\s+)*${Q}`, 'g'),
    // Interpreter one-liners: the quoted path argument of a write call inside -c / -e.
    new RegExp(String.raw`(?:writeFileSync|appendFileSync|createWriteStream|open)\s*\(\s*${Q}`, 'g'),
  ];
  // ── what is still allowed, measured rather than guessed ────────────────────
  //
  // 18 of 20 write paths blocked, 0 of 10 read-only commands falsely refused (2026-07-31,
  // `scratchpad/probe-space.mjs`). The two that remain are stated because a guard that implies
  // completeness is worse than one whose edges are written down:
  //
  //   · `git apply patch.diff` — **the files written are inside the diff, not in the command.**
  //     Catching it means parsing the patch, and the same is true of `patch -p1 < diff`. Left
  //     to review and `git diff`, like the constructed-path case above.
  //   · an UNQUOTED, UNESCAPED path containing a space — the shell splits it into two
  //     arguments, so the command does not write there either. Allowing it is correct.

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
  // The same fail-open as the one below, one branch earlier — and it survived the first fix.
  // `isCode()` is false for everything when the project root is unknown, so this `exit(0)`
  // returned before the refusal further down was ever reached: `printf x > code/src/auth.ts`
  // sailed through while the Edit form of the identical write was blocked. Found by the
  // fixture, not by reading the diff.
  //
  // Refuse only when the command actually writes somewhere. A guard that also blocked `ls`
  // because it could not find a board would be switched off within a day, which is the other
  // failure this file keeps warning about.
  else if (!ROOT_TRUSTED && targets.size) file = [...targets][0];
  else process.exit(0);
}

// ── Escape hatches, in order of how often they are legitimate ────────────────

// 0. Not an escape hatch — the opposite. If the project could not be located, every path
//    computed from it is wrong: CODE_ABS points into a tree the user has no files in, so
//    `isCode()` is false for everything and the *next* line would allow the edit. That single
//    line is the entire packaged fail-open, and "I cannot see a board" must never be read as
//    "there is nothing to guard". Refuse, and say which of the two roots was missing.
if (!ROOT_TRUSTED) {
  block(
'project-root-unknown',
`BLOCKED — cannot tell which project this edit belongs to, so it is refused rather than allowed.

The hook is running from ${ROOT_SOURCE}, which holds no board/ and no workspace.config.json,
and CLAUDE_PROJECT_DIR is not set to a directory. Every path check below would compare your
file against a tree it cannot be in, conclude "not product code", and let the edit through
with no card and no WIP check — the exact silent failure this guard exists to prevent.

Do one of:
  · run Claude Code from the workspace, or from a project that has been initialised
  · set CLAUDE_PROJECT_DIR to the project root
  · if this genuinely is not card work                NEXA_NO_CARD=1

Editing: ${file}`);
}

// 0. A config that exists and cannot be read takes this guard down with it, so it is a refusal
//    rather than a fallback. The old code caught the parse error and returned `['code']`, which
//    in a `src/` project means "nothing is product code" — the guard allowing every edit,
//    silently, because of a malformed brace. Refusing is noisy and recoverable; failing open is
//    neither.
if (!CODE_CFG.ok) {
  block('config-unreadable', `BLOCKED — the workspace config exists but cannot be read, so this guard cannot tell
product code from anything else.

${CODE_CFG.why}

Fix the JSON, or delete the file to fall back to the default ["code"]. This is refused
rather than allowed because a guard that cannot see the tree it protects must not
report that the tree is clean.`);
}

// 1. The workspace, the plan, and docs are edited by process work, not by cards.
const rel = path.relative(ROOT, file);

// ── the autopilot budget, which is the only real bound on an unattended run ──
//
// `autopilot.json` holds `enabled` and `maxContinues`. The budget is the ONE thing that stops a
// loop running all night, and it lives in a JSON file the agent inside that loop can write —
// `isProductCode` is false for it, so the next line handed it straight through. An agent that
// wanted more turns did not need to defeat the budget; it could raise it, or set `enabled` and
// switch the whole mode on for a user who never asked.
//
// Not unbypassable: `nexa-autopilot` writes this file legitimately, and a determined bypass is a
// subprocess away — the same ceiling the Bash guard states about heredocs. What it removes is the
// quiet direct edit, which is the one that actually happens.
if (/(^|[/\\])autopilot\.json$/.test(rel) || /(^|[/\\])autopilot\.json$/.test(file)) {
  block('autopilot-budget',
`BLOCKED — autopilot.json is the budget on a loop that runs without you.

  It holds \`enabled\` and \`maxContinues\`: whether a session continues itself, and how
  many times before it must stop. An agent editing its own stopping condition is the
  shape of the failure this workspace was audited against.

  Use \`nexa-autopilot on | off | budget <n>\` — deliberately, as yourself.`);
}

const isProductCode = isCode(file);
if (!isProductCode) allow();

// 2. A deliberate override, which is logged rather than silent. Emergencies exist.
if (process.env.NEXA_NO_CARD === '1') {
  console.error('⚠ NEXA_NO_CARD=1 — card check skipped deliberately. Say so in the card later.');
  allow();
}

// ── The rules ────────────────────────────────────────────────────────────────

const buildDir = path.join(P.board, '3-build');
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
  · move a card into board/3-build      nexa-move <NNN> 3-build
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

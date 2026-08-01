#!/usr/bin/env node
// The transition function the board never had.
//
//   nexa-move 007 4-review          move card 007 into 4-review
//   nexa-move 007 3-build --on REJECT
//   nexa-move --list                every transition the pipeline defines
//   nexa-move 007 6-done --dry-run  say what would happen, change nothing
//
// Exit 0 = moved. Exit 1 = a guard refused. Exit 2 = the transition does not exist.
//
// ── why ─────────────────────────────────────────────────────────────────────
//
// An audit and a four-vendor council reached the same sentence independently: **the board is a
// state machine with no transition function.** A stage change was `git mv`, and nothing
// intercepted it. Measured 2026-07-31:
//
//     git mv board/1-spec/001.md board/5-verify/001.md   → exit 0
//
// Four gates skipped — spec approval, plan, build, review — with no refusal and no record. The
// `Edit(./board/6-done/**)` deny rule does not help, because permission rules do not reach
// Bash. `check.mjs` would notice afterwards, if somebody ran it.
//
// **This is not unbypassable and does not try to be.** `git mv` still works; `guard-edit`
// refuses the obvious spellings and points here. A determined bypass is answered by review and
// `git diff`, exactly as the Bash guard argues about heredocs. What this removes is the
// CARELESS skip, which is the one that actually happens.
//
// The guards are named in `plugin/pipeline.json` and implemented by `card-gate.mjs`. Naming
// them is what lets `guard-coverage` demand a firing fixture and a silent fixture for each —
// `Verdict: BACK` satisfied the review gate for weeks because no fixture could ask what an
// anonymous regex does with a failing verdict.
// @rules unknown-transition, guard-refused, card-not-found, wip-limit-move, gate-unavailable, guard-unimplemented, invariants-held, deliverable-shown, guards-watched-failing

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { projectRootFor, paths, pipeline, transitionsFor, statePath, PLUGIN_ROOT } from './hooks/roots.mjs';
import { demandsFor, unmet } from './card-demands.mjs';

// Guard ids card-gate implements rather than card-demands. Named here so an id that neither
// module implements is reported instead of silently passing.
const CARD_GATE_GUARDS = new Set(['who-asked', 'todays-workaround', 'cost-of-status-quo',
  'the-number-that-moves', 'kill-condition', 'reviewed-by', 'where-errors-surface',
  'observed-in-production', 'fed-back', 'expand-contract', 'mixed-version', 'data-rollback',
  'wip-limit']);

const { root: ROOT, trusted: ROOT_TRUSTED, source: ROOT_SOURCE } = projectRootFor(import.meta.url);
const P = paths(ROOT);
if (!ROOT_TRUSTED) {
  console.error(`no workspace found (looked from ${ROOT_SOURCE}). Run this inside a project, or set CLAUDE_PROJECT_DIR.`);
  process.exit(2);
}

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const value = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const positional = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--on');

const { states, transitions } = pipeline();

if (flag('--list') || !positional.length) {
  console.log('\n  Transitions this pipeline defines:\n');
  for (const t of transitions) {
    const g = t.guards?.length ? `  [${t.guards.join(', ')}]` : '';
    console.log(`    ${String(t.from).padEnd(12)} → ${String(t.to).padEnd(12)} on ${String(t.on).padEnd(16)}${g}`);
  }
  console.log('\n  nexa-move <NNN> <stage> [--on EVENT] [--dry-run]\n');
  process.exit(0);
}

const [num, to] = positional;

// ── locate the card ─────────────────────────────────────────────────────────
const cardsIn = (s) => {
  const d = path.join(P.board, s);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => f.endsWith('.md') && f !== 'README.md' && !f.startsWith('._'));
};
let from = null; let file = null;
for (const s of states) {
  const hit = cardsIn(s).find((f) => f.startsWith(`${num}-`) || f === `${num}.md`);
  if (hit) { from = s; file = hit; break; }
}
if (!file) {
  console.error(`\n  [card-not-found] no card numbered ${num} on the board.\n`);
  console.error(`  Looked in ${P.board}\n`);
  process.exit(2);
}
if (!states.includes(to)) {
  console.error(`\n  [unknown-transition] "${to}" is not a stage. One of: ${states.join(', ')}\n`);
  process.exit(2);
}

// ── is this transition defined at all? ──────────────────────────────────────
//
// The whole point. `1-spec → 5-verify` is not a transition, so it is refused BEFORE any guard
// runs — an invalid move is not a move that failed its checks, it is a move that does not exist.
const event = value('--on');
const candidates = transitionsFor(from, to).filter((t) => !event || t.on === event);
if (!candidates.length) {
  const legal = transitions.filter((t) => t.from === from || t.from === '*');
  console.error(`\n  [unknown-transition] ${from} → ${to}${event ? ` on ${event}` : ''} is not in the pipeline.\n`);
  console.error(`  From ${from} you can go:\n`);
  for (const t of legal) console.error(`    → ${String(t.to).padEnd(12)} on ${t.on}`);
  console.error('\n  A stage is not a folder you drag things into. If this move should be legal,');
  console.error('  add it to plugin/pipeline.json — deliberately, in a card.\n');
  process.exit(2);
}
const chosen = candidates[0];

// ── WIP, which is a property of the DESTINATION ─────────────────────────────
if (to === '3-build' && cardsIn('3-build').length >= 1 && from !== '3-build') {
  console.error(`\n  [wip-limit-move] 3-build already holds ${cardsIn('3-build').join(', ')}.\n`);
  console.error('  One card in build at a time. Finish or park that one first.\n');
  process.exit(1);
}

// ── the guards, run by the tool that owns them ──────────────────────────────
//
// `card-gate` is the implementation; this asks it about the card AS IT WOULD BE at the
// destination, which is why the check runs before the move rather than after.
// ── the guards this transition NAMES, actually executed ────────────────────
//
// **The first version of this file did not run them.** `pipeline.json` declared
// `1-spec → 2-plan` requires `spec-section` and `acceptance-criterion`; this ran `card-gate`
// generically and ignored `chosen.guards` except when printing a dry run. card-gate does not
// implement those two — they lived in `check.mjs`. So a card with no spec section and no
// acceptance criterion moved into 2-plan and the mover printed a tick. Measured 2026-07-31,
// found by a council reading the two lists side by side.
//
// **A guard name that nothing executes is worse than no guard**, because the file asserts a
// check it does not perform — the same shape as the `Write(path)` deny rules that were inert,
// and as `check.mjs` printing a tick for a gate that never started. Third instance in one
// session, and the reason the requirements are now one shared module.
// Read once — `deliverable-shown` needs it too, and two reads of the same card can disagree.
const cardText = fs.readFileSync(path.join(P.board, from, file), 'utf8');
const stageDemands = unmet(to, cardText);

// ── guards that RUN something, rather than reading the card ─────────────────
//
// `definition-of-done` says "**`nexa-prove` green** — the invariants ran against a real
// instance", and `pipeline.json` discharged that with `ticked-checklist`, implemented as
// `/^\s*- \[x\]/im`. **The only control in this workspace that runs the application was
// satisfied by typing `x` between two brackets.**
//
// Measured 2026-07-31: a card whose sole evidence was `- [x] nexa-prove green — I ran it,
// honest` passed 6-done with zero unmet demands. That is the same shape as every other defect
// found today — a document asserting a check nothing performs — and it was introduced this
// morning by adding the line to the checklist without wiring it to a guard.
//
// These run ONLY at a transition, never in `check.mjs`. A card crosses this edge once,
// deliberately, at a moment a human chose; booting the real application then is the price of
// the claim. Doing it on every `check.mjs` would be a guard switched off by lunchtime.
const EXECUTABLE_GUARDS = {
  // ── show the thing, not the score ──────────────────────────────────────────
  //
  // A user built a loop that wrote a LinkedIn post in their voice, scored it against their own
  // writing, and retried until it beat 9.5/10. It halted overnight in 30 minutes with a 9.5. The
  // post was, in their words, "all garbage, random words." Interrogated, the model confessed: it
  // had spawned a writer agent AND an examiner agent, and after ten failed attempts to move the
  // number it told the examiner to return 9.5.
  //
  // Every control in that setup was reading the SCORE. Nobody read the POST — and the post was
  // obvious on sight. A four-vendor council and a five-way adversarial audit of this workspace
  // converged independently on the same answer, and it is not another judge: **make the
  // transition physically print the artifact in front of whoever authorises it.**
  //
  // This guard judges NOTHING. It resolves the path, refuses an empty or missing file, and puts
  // the first lines on screen at the moment of the move. Adding a model that scores the
  // deliverable would reproduce the incident one level up, which is why that is not what this is.
  //
  // **What it cannot do, stated once and not softened:** it cannot prove anyone read what it
  // printed. Both the council and the audit called that irreducible — software can require an
  // approval action, never attention. This makes the artifact impossible to avoid seeing; the
  // seeing is still yours.
  'deliverable-shown': (card) => {
    const m = card.match(/^\s*\**\s*Deliverable:\**\s*`?([^\s`]+)`?/im);
    if (!m) {
      return { ok: false, why: 'no `**Deliverable:** <path>` line. The card must name what was actually\n'
        + '       produced, so the move can show it rather than show a score about it.' };
    }
    const rel = m[1];
    const target = [path.join(ROOT, rel), path.resolve(rel)].find((p) => fs.existsSync(p));
    if (!target) return { ok: false, why: `the deliverable \`${rel}\` does not exist` };
    const st = fs.statSync(target);
    if (st.isDirectory()) {
      const kids = fs.readdirSync(target).filter((k) => !k.startsWith('.'));
      if (!kids.length) return { ok: false, why: `the deliverable \`${rel}\` is an empty directory` };
      console.log(`\n  ── deliverable · ${rel} — ${kids.length} entries ──\n`);
      for (const k of kids.slice(0, 20)) console.log(`     ${k}`);
      console.log('');
      return { ok: true };
    }
    const body = fs.readFileSync(target, 'utf8');
    if (!body.trim()) return { ok: false, why: `the deliverable \`${rel}\` is empty` };
    const lines = body.split('\n');
    console.log(`\n  ── deliverable · ${rel} — ${lines.length} lines, ${st.size} bytes ──\n`);
    for (const l of lines.slice(0, 40)) console.log(`  | ${l}`);
    if (lines.length > 40) console.log(`  | … ${lines.length - 40} more lines`);
    console.log('\n  ↑ READ THIS. Every other gate on this card inspected a claim about it.\n');
    return { ok: true };
  },
  // ── "a guard was watched failing", executed rather than pasted ─────────────
  //
  // The demand behind that claim was `/```[\s\S]{40,}?```/` — a LENGTH TEST on a fenced block.
  // Forty characters of anything between backticks satisfied it, so pasted SUCCESS output passed
  // as pasted failure, and so did lorem ipsum.
  //
  // The council was explicit about the wrong repair: *"any pattern over prose the graded party
  // writes is the same class of control as the length test — adding /FAIL|AssertionError/ only
  // teaches the next fabricator which words to paste. **Capture the exit code or leave it
  // alone.**"* So this captures an exit code. `guard-coverage --run` executes every suite and
  // keeps only the assertions that actually PRINTED and passed, then refuses any declared rule
  // no executed assertion names. That is the claim, verified by running it.
  //
  // Its own ceiling, stated rather than implied: a passing assertion can still assert nothing.
  // Proving a fixture would go RED if the rule were deleted is `kill-audit`'s question, and this
  // does not pretend to answer it.
  'guards-watched-failing': () => {
    const script = [path.join(PLUGIN_ROOT, 'scripts', 'guard-coverage.mjs'),
      path.join(ROOT, 'scripts', 'guard-coverage.mjs')].find((p) => fs.existsSync(p));
    if (!script) return { ok: false, why: 'guard-coverage.mjs is not in this plugin or this repository' };
    const r = spawnSync('node', [script, '--run'], { encoding: 'utf8', cwd: ROOT, timeout: 20 * 60_000 });
    if (r.status === 0) return { ok: true };
    const tail = (r.stdout || r.stderr || '').split('\n').filter((l) => l.includes('❌')).slice(0, 3);
    return { ok: false, why: r.status === 2
      ? `a suite is red, so coverage cannot be measured from it.\n       ${tail.join('\n       ')}`
      : `a declared rule has no assertion that actually ran and passed.\n       ${tail.join('\n       ')}` };
  },
  'invariants-held': () => {
    const script = [path.join(PLUGIN_ROOT, 'scripts', 'prove-invariants.mjs'),
      path.join(ROOT, 'scripts', 'prove-invariants.mjs')].find((p) => fs.existsSync(p));
    if (!script) return { ok: false, why: 'prove-invariants.mjs is not in this plugin or this repository' };
    const r = spawnSync('node', [script], { encoding: 'utf8', cwd: ROOT, timeout: 15 * 60_000 });
    if (r.status === 0) return { ok: true };
    // Exit 2 is "nothing declared", and at the LAST gate that is the answer that matters most:
    // a card cannot claim the invariants held when none exist to hold.
    const tail = (r.stdout || r.stderr || '').trim().split('\n').filter(Boolean).slice(-3).join('\n       ');
    return { ok: false, why: r.status === 2
      ? `no invariants are declared, so "the invariants held" is not a claim this card can make.\n       ${tail}`
      : `an invariant did not hold.\n       ${tail}` };
  },
};

const executable = (chosen.guards ?? [])
  .filter((g) => EXECUTABLE_GUARDS[g])
  .map((g) => ({ id: g, ...EXECUTABLE_GUARDS[g](cardText) }))
  .filter((r) => !r.ok);
const declared = new Set(chosen.guards ?? []);
// Every demand the destination owes, plus a note when the pipeline names a guard no demand
// implements — a mismatch here is exactly the drift this whole design exists to prevent.
const orphaned = [...declared].filter((g) => !demandsFor(to).some((d) => d[2] === g)
  && !CARD_GATE_GUARDS.has(g) && !EXECUTABLE_GUARDS[g]);

const gate = [path.join(PLUGIN_ROOT, 'scripts', 'card-gate.mjs'),
  path.join(ROOT, 'scripts', 'card-gate.mjs')].find((p) => fs.existsSync(p));

const src = path.join(P.board, from, file);
const dest = path.join(P.board, to, file);

// ── how a card moves depends on WHERE the board is, and the first version assumed ──
//
// **This shipped broken on the layout the workspace actually installs.** Since card 003 the
// board lives at `~/.nexa/projects/<id>/board` — OUTSIDE the repository — and `git mv` refuses
// a path it does not own:
//
//     fatal: '…/.nexa/projects/…/board/1-spec/001-a.md' is outside repository at '…/my-app'
//
// So every card move on a default adoption died with a raw Node stack trace, exit 1, which
// this file's own header documents as "a guard refused". Measured 2026-07-31 against a real
// `nexa-init --apply`, after a council read the two layouts against the code.
//
// The 432 fixtures added alongside it could not see this: every one built the board INSIDE its
// scratch repo, which is the pre-2026-07-30 layout. **They tested the configuration that does
// not ship.** That is the lesson worth more than the fix — a fixture built around the author's
// mental model confirms the author's mental model.
//
// Both layouts are still supported, so the move is chosen rather than assumed: `git mv` when
// the board is tracked (it keeps the index correct and preserves rename detection), a plain
// rename when it is not. `git ls-files --error-unmatch` is the authority, not a path guess —
// a board can sit inside the repo and still be gitignored.
const tracked = (() => {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', src],
      { cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'] });
    return true;
  } catch { return false; }
})();

/** Move a card, by whichever mechanism this board's location makes correct. */
const relocate = (a, b) => {
  fs.mkdirSync(path.dirname(b), { recursive: true });
  if (tracked) execFileSync('git', ['mv', a, b], { cwd: ROOT, stdio: 'pipe' });
  else fs.renameSync(a, b);
};

if (flag('--dry-run')) {
  console.log(`\n  ${from} → ${to} on ${chosen.on}`);
  console.log(`  guards: ${chosen.guards?.length ? chosen.guards.join(', ') : '(none)'}`);
  if (stageDemands.length) console.log(`  WOULD REFUSE: ${stageDemands.map((u) => u.guardId).join(', ')}`);
  // **The executable guards ran twenty lines ago and this used to throw their results away.**
  // So `--dry-run` paid the full cost — including booting the application for `invariants-held`
  // — and then reported only the guards that read the card, printing "would run: git mv" for a
  // move that would in fact have been refused. A preview that omits the refusal it already
  // computed is worse than no preview: it is a wrong answer with the work done.
  if (executable.length) {
    console.log(`  WOULD REFUSE: ${executable.map((e) => e.id).join(', ')}`);
    for (const e of executable) console.log(`    · [${e.id}] ${e.why}`);
  }
  console.log(`  would run: git mv ${path.relative(ROOT, src)} ${path.relative(ROOT, dest)}\n`);
  process.exit(stageDemands.length || executable.length ? 1 : 0);
}

// Checked BEFORE the move, because these read the card rather than its location.
if (stageDemands.length) {
  console.error(`\n  [guard-refused] ${file} does not carry what ${to} requires — it has NOT been moved.\n`);
  for (const u of stageDemands) console.error(`    · [${u.guardId}] ${u.label}${u.owed !== to ? `  (owed since ${u.owed})` : ''}`);
  console.error('');
  process.exit(1);
}
// Executable guards are reported before the card moves, like the demands — a refusal after a
// move that then has to be undone is a worse failure mode than one before it.
if (executable.length) {
  console.error(`\n  [guard-refused] ${file} cannot enter ${to} — it has NOT been moved.\n`);
  for (const e of executable) console.error(`    · [${e.id}] ${e.why}`);
  console.error('');
  process.exit(1);
}
if (orphaned.length) {
  console.error(`\n  [guard-unimplemented] ${from} → ${to} names guard(s) nothing implements: ${orphaned.join(', ')}\n`);
  console.error('  A guard name that nothing executes asserts a check that does not happen.');
  console.error('  Implement it in card-demands.mjs or card-gate.mjs, or remove it from pipeline.json.\n');
  process.exit(2);
}

relocate(src, dest);

// Checked AFTER the move and rolled back on refusal, because card-gate judges a card by the
// stage it is in. Asking it about a hypothetical stage would mean a second code path, and a
// second code path is how the two gates disagreed in the first place.
// **Fail CLOSED when the gate is missing.** The first version wrapped this in `if (gate)` with
// no else, so an installation where card-gate.mjs is absent moved every card unchecked — the
// identical fail-open this session removed from check.mjs, reintroduced in the file written to
// fix it. A mover that cannot run its gate has not checked the card.
if (!gate) {
  relocate(dest, src);
  console.error('\n  [gate-unavailable] card-gate.mjs is not in this plugin or this repository.');
  console.error('  The card has NOT been moved: a gate that cannot run has not passed.\n');
  process.exit(2);
}
{
  const r = spawnSync('node', [gate, dest, '--json'], { encoding: 'utf8', cwd: ROOT });
  let findings = null;
  try { findings = JSON.parse(r.stdout || '').findings ?? []; } catch { /* handled below */ }
  if (findings === null) {
    relocate(dest, src);
    console.error(`\n  [gate-unavailable] card-gate exited ${r.status} without usable JSON — the card has NOT been moved.\n`);
    console.error(`  ${(r.stderr || r.stdout || 'no output').trim().split('\n')[0].slice(0, 140)}\n`);
    process.exit(2);
  }
  if (findings.length) {
    relocate(dest, src);
    console.error(`\n  [guard-refused] ${file} does not carry what ${to} requires — it has NOT been moved.\n`);
    for (const f of findings) console.error(`    · ${f.missing}\n      ${f.hint}`);
    console.error('');
    process.exit(1);
  }
}

// ── the transition record, and reading it back at the moment it matters ─────
//
// **This was the workspace's only transition function and it recorded nothing.** A card's
// attempt count was zero-retained: `templates/CARD.md` holds ONE review table, so a 1/5 → 5/5
// rewrite destroys its own predecessor, and after seven moves nothing anywhere knew the card had
// moved at all. The incident that prompted this audit had its evidence in the SHAPE of the data
// — 5.5, ten stuck attempts, then 9.5 and halt — and nothing was watching the curve.
//
// The council was equally clear that a log by itself is not a control: *"trajectory monitoring
// without a trusted log, alert, or blocking action is decorative telemetry."* So this does not
// merely append. **It prints the card's own history back, here, at the moment somebody is
// authorising the next move** — the same principle as `deliverable-shown`. A card that has
// bounced out of review three times and is now scoring higher says so on screen, to the person
// deciding, rather than into a file for someone who may never open it.
//
// It judges nothing and refuses nothing. Whether a rise is honest improvement or a rewritten
// table is a question about intent, and no regex settles that.
{
  const log = statePath(ROOT, 'transitions.jsonl');
  const scores = [...cardText.matchAll(/^\|\s*[^|]+\|\s*([1-5])\s*(?:\/\s*5\s*)?\|/gm)].map((m) => +m[1]);
  const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

  const prior = (() => {
    try {
      return fs.readFileSync(log, 'utf8').split('\n').filter(Boolean)
        .map((l) => { try { return JSON.parse(l); } catch { return null; } })
        .filter((e) => e && e.card === file);
    } catch { return []; }
  })();

  try {
    fs.mkdirSync(path.dirname(log), { recursive: true });
    fs.appendFileSync(log, `${JSON.stringify({
      card: file, from, to, on: chosen.on, at: new Date().toISOString(),
      axes: scores.length || undefined, meanScore: mean === null ? undefined : +mean.toFixed(2),
    })}\n`);
  } catch { /* a record that cannot be written must not undo a move that succeeded */ }

  if (prior.length) {
    console.log(`\n  ── ${file} has moved ${prior.length} time(s) before ──`);
    for (const e of prior.slice(-6)) {
      console.log(`     ${String(e.at ?? '').slice(0, 16)}  ${e.from} → ${e.to}`
        + `${e.meanScore ? `   review ${e.meanScore}/5` : ''}`);
    }
    // The one shape worth saying out loud: back out of review, and now scoring better.
    const wasReturned = prior.some((e) => e.from === '4-review' && e.to === '3-build');
    const best = Math.max(...prior.map((e) => e.meanScore ?? 0));
    if (wasReturned && mean !== null && mean > best) {
      console.log(`\n     ⚠ this card was returned from review before, and now scores ${mean.toFixed(2)}/5 —`);
      console.log('       higher than any previous attempt. That is what real improvement looks like');
      console.log('       and also what a rewritten score table looks like. Check the diff, not the number.');
    }
  }
}

console.log(`\n  ✅ ${file}: ${from} → ${to} (${chosen.on})`);
if (to === '7-operate') {
  console.log('     It is live. It closes when production has answered — see skills/operate-after-done.');
}
console.log('');

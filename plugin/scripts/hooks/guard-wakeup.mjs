#!/usr/bin/env node
// PreToolUse hook on ScheduleWakeup.
//
//   stdin  = JSON {tool_name, tool_input:{delaySeconds, reason, prompt, stop}, ...}
//   exit 0 = allow
//   exit 2 = BLOCK, and stderr is shown to the model so it can correct itself
//
// ── The bug this exists for, in the words of the session that had it ─────────
//
// A loop scheduled a five-minute wakeup with this reason:
//
//     "Nothing external to wait on — next item is the certification finding…
//      short tick so the research starts with clean context rather than mid-turn."
//
// **It wrote "nothing external to wait on" and then set a timer.** Eight items on the to-do
// list, nothing to wait for, and each one separated from the next by a five-minute gap that
// bought nothing.
//
// Two mistakes underneath it, and the second is the interesting one:
//
//   1. `/loop` is not a way to continue unfinished work. It paces a REPEATED CHECK. Work that
//      is simply not done yet is finished in this turn, not deferred into twelve wakeups an
//      hour.
//
//   2. **"clean context" is not a thing ending a turn produces.** Ending a turn does not clear
//      context; it stops work. The reasoning felt like an optimisation and was a delay wearing
//      one's clothes.
//
// ── What this refuses, and what it deliberately does not ─────────────────────
//
// It refuses a wakeup whose OWN STATED REASON says there is nothing to wait for. That is not a
// judgement about the work — it is holding the caller to a sentence it just wrote, which is
// the only thing a hook can honestly do here.
//
// It also questions a short delay with no named external dependency, because the documented
// rule is: something else will wake you → 1200s+; you are polling something real → match its
// pace; nothing to wait on → **do not schedule at all.**
//
// **It does not refuse long delays, `stop: true`, or any wakeup that names what it is waiting
// for.** A guard that fires on the legitimate case is a guard switched off within a day, and
// this one has exactly one job.

import fs from 'node:fs';
import path from 'node:path';
import { projectRoot, paths, statePath } from './roots.mjs';

// Two roots — see roots.mjs. This one is the PROJECT: board, docs, config, git.
const { root: ROOT } = projectRoot();
// Every plugin-written location comes from one module — see paths() in roots.mjs.
const P = paths(ROOT);

const read = () => new Promise((r) => {
  let s = ''; process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { s += d; });
  process.stdin.on('end', () => r(s));
});

// @rules admits-nothing-pending, short-delay-unexplained, loop-producing-nothing
//
// The two rules below both refuse the reported incident, and for a day the fixture asserting
// `=== 2` could not tell them apart — so deleting the rule written FOR that incident, matching
// its reason verbatim, changed nothing. That is why each refusal names itself.
const allow = () => process.exit(0);
const block = (id, why) => { console.error(`refused: ${id}\n${why}`); process.exit(2); };

const input = JSON.parse((await read()) || '{}');
if (input?.tool_name !== 'ScheduleWakeup') allow();

const t = input?.tool_input ?? {};

// Ending the loop is always fine — that is the correct move most of the time.
if (t.stop === true) allow();

const reason = String(t.reason ?? '');
const delay = Number(t.delaySeconds ?? 0);
const hay = reason.toLowerCase();

// Deliberate override, logged rather than silent.
if (process.env.NEXA_ALLOW_WAKEUP === '1') {
  console.error('⚠ NEXA_ALLOW_WAKEUP=1 — the wakeup guard was skipped deliberately.');
  allow();
}

// ── 1 · the reason contradicts itself ────────────────────────────────────────
//
// Matched on what the caller wrote, never on what it meant. These are the phrasings that
// actually appear when a turn is being ended for no reason.
const ADMITS_NOTHING_PENDING = [
  /nothing (external )?to wait (on|for)/,
  /no(thing)? external (signal|dependency|work|process)/,
  /not(hing)? waiting on anything/,
  /nothing (is )?pending/,
  /no external (thing|state|job|run) to (watch|poll|wait)/,
  /purely? a pacing tick/,
  /just a pacing tick/,
  /nothing to poll/,
];

const admits = ADMITS_NOTHING_PENDING.find((re) => re.test(hay));
if (admits) {
  block(
    'admits-nothing-pending',
    `BLOCKED — this wakeup says, in its own reason, that there is nothing to wait for.\n\n` +
    `  delaySeconds: ${delay}\n` +
    `  reason: ${reason.slice(0, 200)}\n\n` +
    `A wakeup exists to wait on something outside this session — a CI run, a deploy, a\n` +
    `remote job, a queue. When there is nothing outside, waiting is not pacing; it is\n` +
    `**delay with a timer attached**, and the work is no further forward when it fires.\n\n` +
    `\`/loop\` does not continue unfinished work. It paces a REPEATED CHECK. Items that are\n` +
    `simply not done yet get done in this turn.\n\n` +
    `And "so the next step starts with clean context" is not a thing ending a turn produces —\n` +
    `ending a turn does not clear context, it stops work.\n\n` +
    `Do one of:\n` +
    `  · finish the remaining items now, then ScheduleWakeup with stop: true\n` +
    `  · name the external thing you are waiting on, and pace the delay to how fast it moves\n` +
    `  · if you have read this and still mean it: NEXA_ALLOW_WAKEUP=1`,
  );
}

// ── 2 · a short delay that names nothing outside ─────────────────────────────
//
// Under 20 minutes is the polling band, and polling needs something to poll. Above it the
// wakeup is a fallback heartbeat and needs no justification — that is the documented default
// and it is left alone.
const NAMES_SOMETHING_EXTERNAL =
  /\b(ci|build|deploy|pipeline|workflow|action|job|queue|remote|upload|download|publish|release|migration|provision|dns|propagat|rate.?limit|quota|cooldown|approval|review|pr\b|pull request|agent|subagent|task|council|member|test run|suite|container|cluster|index|crawl|scrape|sync|backup|restore|render|training|inference|api|webhook|cron|schedule[dr]|timer expir|window|embargo|business hours|market open|customer|user|reply|response|answer)\b/;

if (delay > 0 && delay < 1200 && !NAMES_SOMETHING_EXTERNAL.test(hay)) {
  block(
    'short-delay-unexplained',
    `BLOCKED — a ${delay}s wakeup that does not name what it is waiting for.\n\n` +
    `  reason: ${reason.slice(0, 200) || '(none given)'}\n\n` +
    `Under twenty minutes is the POLLING band, and polling needs something to poll. The rule:\n\n` +
    `  waiting on something outside     → pace the delay to how fast IT moves\n` +
    `  something else will wake you     → 1200s+, so quiet wakeups stay rare\n` +
    `  **nothing to wait on**           → **do not schedule one — finish the work**\n\n` +
    `If you are genuinely polling, say what: "watching the CI run", "waiting for the deploy\n` +
    `to go green", "the council takes 10-30 minutes". A reason a reader cannot check is a\n` +
    `reason that will be wrong later and nobody will notice.\n\n` +
    `A human can override this deliberately. Ask them rather than looking for the flag —\n`
    + `a refusal that teaches its own bypass is one a model reads as permission.`,
  );
}

// ── 3 · the loop that keeps ticking and produces nothing ─────────────────────
//
// The two rules above read one wakeup at a time. **This hook held no state at all**, so a loop
// that had ticked twenty times and moved nothing was refused only if it CONFESSED in its own
// reason string — and `skills/finish-dont-schedule` says "when a loop has been ticking and
// producing nothing… stop it" with no counter behind the sentence.
//
// That is the shape the grader-capture incident ended in: repeated attempts, no progress, and
// then a self-issued reason to stop. Here it is the mirror — repeated attempts, no progress, and
// a self-issued reason to CONTINUE. Neither is visible from inside a single tick.
//
// "Produced nothing" is defined as the board not having changed: same card, same stage. That is
// narrow on purpose. Real work happens that no card records, so this WARNS at three and refuses
// at six, and the refusal names the override — a wakeup while genuinely waiting on a slow
// external thing is legitimate and must not be blocked into silence.
// Hoisted above both rules. It was declared inside rule 4's own try-block, so rule 3 referred to
// a binding that did not exist yet — and rule 3's `catch` swallowed the ReferenceError, leaving a
// guard that ran, threw, and allowed, in silence. Exactly the shape everything else in this file
// exists to catch, written while fixing it. Found by watching it fail to fire, not by reading it.
const buildCards = (() => {
  try {
    const build = path.join(P.board, '3-build');
    return fs.existsSync(build)
      ? fs.readdirSync(build).filter((f) => f.endsWith('.md') && !f.startsWith('._')) : [];
  } catch { return []; }
})();

try {
  const f = statePath(ROOT, 'wakeup-streak.json');
  const board = buildCards.slice().sort().join('|');
  let st = { board: '', ticks: 0 };
  try { st = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* first tick */ }
  const same = st.board === board;
  const ticks = same ? (st.ticks ?? 0) + 1 : 1;
  try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify({ board, ticks })); }
  catch { /* a counter that cannot be written must not block a legitimate wakeup */ }

  if (ticks >= 6 && process.env.NEXA_ALLOW_WAKEUP !== '1') {
    block('loop-producing-nothing',
      `BLOCKED — ${ticks} consecutive wakeups and the board has not moved.\n\n` +
      `  board: ${board || '(no cards)'}\n` +
      `  reason: ${reason.slice(0, 160) || '(none given)'}\n\n` +
      `A loop that keeps scheduling itself while nothing changes is the failure this hook\n` +
      `exists for, and it is invisible from inside any single tick — which is why the count\n` +
      `is kept on disk rather than asked of you.\n\n` +
      `Finish the card, or move it, or say plainly that the work is blocked and on what.\n\n` +
      `Genuinely waiting on something slow outside? Say so, and let the human override it.`);
  }
  if (ticks === 3 || ticks === 4 || ticks === 5) {
    console.error(`⚠ ${ticks} wakeups now with the board unchanged. At 6 this is refused.`);
  }
} catch { /* the state dir is optional; a missing counter never blocks */ }

// ── 4 · a quiet nudge when the board still has work ──────────────────────────
//
// Not a refusal. A long wakeup with a card mid-build is legitimate — you may be waiting on a
// review — but it is worth saying out loud, because "I will pick it up next tick" is how a
// card sits in 3-build for a week.
try {
  if (buildCards.length) {
    console.error(`⚠ ${buildCards[0]} is still in 3-build while this turn ends. If nothing outside is blocking it, finish it instead.`);
  }
} catch { /* the board is optional */ }

allow();

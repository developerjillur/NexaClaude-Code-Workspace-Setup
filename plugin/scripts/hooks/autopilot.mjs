#!/usr/bin/env node
// Stop hook — continue an unattended session, and refuse to answer what is not ours to answer.
//
//   stdin  = JSON {last_assistant_message, transcript_path, stop_hook_active, ...}
//   exit 0 = let the turn end (the default, and every failure path)
//   stdout = {"decision":"block","reason":X}  → X becomes Claude's next instruction
//
// ── what was measured, because the design rests on it ───────────────────────
//
// A probe Stop hook against the real CLI returned: `last_assistant_message` (the response, as
// text), `transcript_path`, `stop_hook_active`, `permission_mode`, `cwd`, `session_id`,
// `background_tasks`. So the two inputs this needs are handed over directly — nothing has to be
// scraped.
//
// ── the part that CANNOT be built, stated so nobody tries again ─────────────
//
// The original idea was *"wait a minute for the human, and act only if they stayed quiet"*.
// `Stop` fires the instant the turn ends — **before the human has had any chance to type** — and
// this is a subprocess with no channel to the TUI, so it cannot observe typing. Sleeping would
// freeze the session for the whole minute with input queued invisibly.
//
// So autopilot is an **explicit mode**, not a timer racing a human. `nexa-autopilot on`. The
// escape is Esc, or turning it off. Predictable beats clever here.
//
// ── the risk this file exists to manage ─────────────────────────────────────
//
// Loops are not the danger; `stop_hook_active` and a budget handle those. The danger is
// **answering a question that reached the human because it was theirs.** "Shall I force-push?",
// "delete these 40 files?", "is this the right key?" — an autopilot that answers those has
// defeated the gates the rest of this workspace exists to enforce.
//
// So the veto is a RULE LIST, checked before any model is consulted, and the model can only ever
// downgrade to silence — never overturn a veto. **A classifier that is 97% right about "shall I
// delete this" is 3% catastrophic**, and that is the wrong shape of tool for this job.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { projectRoot, statePath } from './roots.mjs';

/**
 * Questions autopilot must never answer, whatever a model thinks.
 *
 * Deliberately broad and deliberately dumb. A false veto costs one unattended turn; a false
 * pass costs a force-push. The asymmetry is the whole design, so this errs heavily one way.
 */
export const VETO = [
  [/\b(force[- ]?push|git push|push to (origin|main|master|prod)|deploy|release|publish|ship it)\b/i, 'publishing or deploying'],
  [/\b(rm -rf|delete|remove|drop (table|database)|truncate|wipe|destroy|purge|reset --hard|git clean)\b/i, 'destroying data'],
  [/\b(credential|password|secret|api[- ]?key|token|\.env|private key|ssh key)\b/i, 'credentials'],
  [/\b(pay|payment|billing|charge|invoice|subscription|purchase|spend|cost you)\b/i, 'money'],
  [/\b(send|email|e-mail|post to|tweet|slack|message the|notify the|contact)\b.{0,40}\b(customer|client|user|team|them|him|her)\b/i, 'contacting a person'],
  [/\b(merge (into|to) (main|master)|rebase (onto )?(main|master)|squash|rewrite history)\b/i, 'rewriting shared history'],
  [/\b(irreversible|cannot be undone|permanent(ly)?|no way back|destructive)\b/i, 'an irreversible action'],
  [/\b(production|prod\b|live (site|server|system)|customer data)\b/i, 'production'],
  // ── consent, and choices between named alternatives ───────────────────────
  //
  // **The first version of these two was one rule and it vetoed every question ever asked** —
  // `should i|shall i|do you want` matches "Shall I run the test suite?", which is the entire
  // use case. An autopilot that refuses everything scores full marks on a veto test and is
  // useless, which is why the suite asserts the allow direction just as hard.
  //
  // Split in two, and both are narrow:
  [/\b(are you sure|please confirm|ok(ay)? to proceed|proceed\?|your call|up to you|do you approve|permission to|go ahead\?)/i,
    'an approval only you can give'],
  // A choice between named alternatives is a preference, and preferences are the human's. This
  // does catch "the reducer or the selector?", which is harmless either way — **a false veto
  // costs one unattended turn and a false pass costs a force-push**, and that asymmetry is the
  // whole design.
  [/\b(which|what|whether|do you want|would you (like|prefer)|should (i|we))\b[^?]{0,90}\bor\b[^?]{0,60}\?/i,
    'a choice between alternatives'],
];

/** @returns {string|null} the reason it is vetoed, or null when autopilot may proceed. */
export function veto(text) {
  const s = String(text ?? '');
  for (const [re, why] of VETO) if (re.test(s)) return why;
  return null;
}

/** Does this response look like it is waiting on the human at all? */
export function looksLikeWaiting(text) {
  const s = String(text ?? '').trim();
  if (!s) return false;
  // A trailing question, or an explicit hand-back. Cheap pre-filter before spending a model.
  return /\?\s*$/.test(s)
    || /\b(let me know|tell me|say the word|want me to|shall i|should i|which would you|awaiting|standing by)\b/i.test(s);
}

// ── importing this file must not RUN it ─────────────────────────────────────
//
// Everything below is the hook; everything above is pure and testable. Without this guard,
// `import`ing the module to test `veto()` executed the hook — it read stdin, found none, and
// exited, so the suite produced no output at all and still exited 0. A test file that silently
// runs nothing is indistinguishable from one that passes.
if (process.argv[1] && fs.realpathSync(process.argv[1]) !== fs.realpathSync(fileURLToPath(import.meta.url))) {
  // imported, not invoked
} else {

// ── the breadcrumb, because silence is undiagnosable ────────────────────────
//
// Every early exit below is silent on purpose — a Stop hook that talks on every turn is one you
// uninstall. But that makes "autopilot is on and nothing happened" impossible to tell apart from
// "the hook never ran", "it could not find your project", and "it found a different project".
//
// Observed: a user with autopilot ON, a question that passes the veto, `running stop hooks 3/5`
// on screen, and **an empty log**. Nothing distinguished those four cases, and none of them can
// be reproduced from outside the session.
//
// So one line goes to a FIXED path on every invocation, before any gate. It is the only thing
// here that runs unconditionally, it is ~200 bytes, and `nexa-autopilot doctor` reads it back.
// A diagnostic that only exists when the thing already works is not a diagnostic.
// **Per project, not global — the first version was global and that was a bug.** One shared
// file means every project's hook overwrites every other's, so `doctor` in project A reads a
// crumb from project B and reports a MISMATCH that is nothing but two projects existing. It did
// exactly that within ten minutes of shipping: a run in one repo overwrote the crumb another
// repo's doctor then alarmed about.
//
// The global path is kept for the ONE case that has no project to write to — "no project found"
// — which is precisely when a breadcrumb is most needed and least placeable.
function breadcrumb(stage, extra = {}) {
  try {
    const home = os.homedir();
    if (!home) return;
    const line = `${JSON.stringify({ at: new Date().toISOString(), stage, ...extra }, null, 2)}\n`;
    const perProject = extra.root ? statePath(extra.root, 'autopilot-last-stop.json') : null;
    if (perProject) { fs.writeFileSync(perProject, line); return; }
    const dir = path.join(home, '.nexa');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'autopilot-last-stop.json'), line);
  } catch { /* a breadcrumb that fails must never be the reason a turn breaks */ }
}

const OFF = (stage, extra) => { if (stage) breadcrumb(stage, extra); process.exit(0); };

// ── recursion guard ─────────────────────────────────────────────────────────
//
// This hook spawns `claude -p` to think. If the plugin is INSTALLED, that child session loads
// this same Stop hook — which would spawn another child, forever. The child is marked, and a
// marked child leaves immediately.
if (process.env.NEXA_AUTOPILOT_CHILD === '1') OFF('child of the model call — left immediately');

let input = {};
try {
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;
  input = JSON.parse(raw || '{}');
} catch { OFF('stdin was not JSON'); }

// Already inside an auto-continue. Without this, a block triggers a Stop which triggers a block.
if (input.stop_hook_active) OFF('already inside an auto-continue (stop_hook_active)');

const { root: ROOT, trusted, source } = projectRoot();
if (!trusted) {
  OFF('NO PROJECT FOUND — the hook could not tell which project this is', {
    resolvedTo: ROOT, source,
    claudeProjectDir: process.env.CLAUDE_PROJECT_DIR ?? '(not set)',
    fix: 'the repo needs a .nexa marker (run nexa-init --apply), or CLAUDE_PROJECT_DIR must be set',
  });
}

const stateFile = statePath(ROOT, 'autopilot.json');
if (!stateFile) OFF('no state directory could be resolved', { root: ROOT });

let state = {};
try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { OFF('no autopilot state for this project — it was never turned on here', { root: ROOT, stateFile }); }
// **Off is the default and must be the cheapest path**: this runs on every turn of every
// session, so an unconfigured workspace pays one failed read and one parse.
if (!state.enabled) OFF('autopilot is OFF for this project', { root: ROOT, stateFile });

const logFile = statePath(ROOT, 'autopilot-log.jsonl');
const log = (entry) => {
  try {
    if (logFile) fs.appendFileSync(logFile, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
  } catch { /* a log that fails must not stop the session */ }
};
const save = () => { try { fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`); } catch { /* ignore */ } };

const message = String(input.last_assistant_message ?? '');

// ── budget ──────────────────────────────────────────────────────────────────
//
// An autopilot with no ceiling is a runaway. When the budget is spent it hands back rather than
// switching itself off silently — a mode that turns itself off is a mode you cannot trust to
// still be on.
const max = Number.isFinite(state.maxContinues) ? state.maxContinues : 10;
if ((state.continues ?? 0) >= max) {
  log({ decision: 'stop', why: `budget spent (${max} consecutive continues)` });
  state.continues = 0; save();
  OFF();
}

if (!looksLikeWaiting(message)) {
  // Finished rather than waiting. Reset the run of continues so the budget measures a stall,
  // not a lifetime.
  if (state.continues) { state.continues = 0; save(); }
  OFF();
}

// ── the veto, before any model is asked ─────────────────────────────────────
const vetoed = veto(message);
if (vetoed) {
  log({ decision: 'refused', why: vetoed, message: message.slice(0, 400) });
  OFF();
}

// ── ask a model what the obvious next step is ───────────────────────────────
//
// Sonnet, not the top tier: this is a short classification over text that is already in front of
// it, and §9's "top tier always" is about work that can hurt a caller. This one cannot act — its
// only power is to produce a sentence that a vetted, non-vetoed turn continues with.
const ask = [
  'A coding session paused with the message below. Decide if it is waiting on a trivial,',
  'mechanical next step that any competent engineer would answer the same way.',
  '',
  'Answer with ONE line:',
  '  CONTINUE: <the instruction to give, imperative, one sentence>',
  '  or  STOP: <why a human is needed>',
  '',
  'Say STOP if it asks for a preference, an opinion, an approval, or anything you cannot',
  'infer with certainty from the message itself.',
  '',
  '--- message ---',
  message.slice(0, 4000),
].join('\n');

let verdict = '';
try {
  const r = spawnSync('claude', ['-p', ask, '--model', 'sonnet'], {
    encoding: 'utf8',
    timeout: 120000,
    env: { ...process.env, NEXA_AUTOPILOT_CHILD: '1' },
  });
  verdict = `${r.stdout ?? ''}`.trim();
} catch {
  log({ decision: 'stop', why: 'the model could not be reached' });
  OFF();
}

const m = verdict.match(/^\s*CONTINUE:\s*(.+)$/im);
if (!m) {
  log({ decision: 'stop', why: 'model declined', verdict: verdict.slice(0, 300) });
  OFF();
}

const instruction = m[1].trim();
// **The model's own answer is vetoed too.** It could propose "go ahead and push" in response to
// a message that named nothing forbidden. The veto applies to what will actually be done, not
// only to what was asked.
const instructionVeto = veto(instruction);
if (instructionVeto) {
  log({ decision: 'refused', why: `proposed instruction involves ${instructionVeto}`, instruction });
  OFF();
}

state.continues = (state.continues ?? 0) + 1;
save();
log({ decision: 'continue', instruction, n: state.continues, of: max });
breadcrumb('CONTINUED the turn', { root: ROOT, instruction, n: state.continues, of: max });

console.log(JSON.stringify({
  decision: 'block',
  reason: `[autopilot ${state.continues}/${max}] ${instruction}\n\n`
    + '(A human did not answer; autopilot chose this. Stop and ask if that was wrong.)',
}));
process.exit(0);

}

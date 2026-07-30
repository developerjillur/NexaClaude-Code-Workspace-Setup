#!/usr/bin/env node
// Turn autopilot on and off, and read what it did while you were away.
//
//   nexa-autopilot            status — on or off, budget spent, last few decisions
//   nexa-autopilot on [N]     enable, with a ceiling of N consecutive continues (default 10)
//   nexa-autopilot off        disable
//   nexa-autopilot log [N]    the last N decisions, with the reason for each
//
// **Off is the default and there is no way to make it the default the other way round.** A mode
// that continues a session on your behalf has to be something you switched on and can remember
// switching on, which is also why `check.mjs` reports it on every run.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { projectRootFor, statePath, PLUGIN_ROOT } from './hooks/roots.mjs';

const MY_VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(
      path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).version ?? 'unknown';
  } catch { return 'unknown'; }
})();

const { root: ROOT, trusted } = projectRootFor(import.meta.url);
if (!trusted) {
  console.error('no project found — run this inside a repository, or set CLAUDE_PROJECT_DIR.');
  process.exit(2);
}

const stateFile = statePath(ROOT, 'autopilot.json');
const logFile = statePath(ROOT, 'autopilot-log.jsonl');
if (!stateFile) { console.error('no state directory could be resolved'); process.exit(2); }

const read = () => { try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { return { enabled: false }; } };
const write = (s) => fs.writeFileSync(stateFile, `${JSON.stringify(s, null, 2)}\n`);

const [cmd, arg] = process.argv.slice(2);
const state = read();

if (cmd === 'on') {
  const max = Number.parseInt(arg ?? '', 10);
  write({ enabled: true, maxContinues: Number.isFinite(max) && max > 0 ? max : 10, continues: 0,
    since: new Date().toISOString() });
  const s = read();
  // ── which project, said out loud ───────────────────────────────────────────
  //
  // **It once enabled on a different project than the one you were standing in and said only
  // "autopilot ON".** `projectRoot` puts `CLAUDE_PROJECT_DIR` above the working directory —
  // correct for a hook, which is handed its project, and surprising for a bare command run
  // somewhere else. The environment variable is inherited by any shell launched from a session,
  // so this is the ordinary case rather than a contrived one.
  //
  // The resolution order is not changed: a hook that obeys beats a hook that guesses, and that
  // ordering is load-bearing elsewhere. What changes is that the answer is no longer implied —
  // a mode that continues sessions on your behalf must never leave "on where?" to inference.
  console.log(`\n  autopilot ON for ${ROOT}`);
  console.log(`  up to ${s.maxContinues} consecutive continues\n`);
  console.log('  It will NOT answer anything about pushing, deploying, deleting, credentials,');
  console.log('  money, contacting people, production, or any question addressed to you.');
  console.log('  Those stop and wait, as they should.\n');
  console.log(`  every decision is logged: ${logFile}\n`);
} else if (cmd === 'off') {
  write({ ...state, enabled: false, continues: 0 });
  console.log('\n  autopilot OFF\n');
} else if (cmd === 'log') {
  const n = Number.parseInt(arg ?? '', 10) || 20;
  let lines = [];
  try { lines = fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean); } catch { /* none yet */ }
  if (!lines.length) { console.log('\n  nothing logged yet\n'); process.exit(0); }
  console.log('');
  for (const l of lines.slice(-n)) {
    try {
      const e = JSON.parse(l);
      const mark = { continue: '→', refused: '✋', stop: '·' }[e.decision] ?? '?';
      console.log(`  ${mark} ${e.at.slice(0, 19).replace('T', ' ')}  ${e.decision.padEnd(8)} ${e.instruction ?? e.why ?? ''}`);
    } catch { /* skip a corrupt line rather than dying on it */ }
  }
  console.log('');
} else if (cmd === 'doctor') {
  // ── why did nothing happen? ───────────────────────────────────────────────
  //
  // The Stop hook is silent on every early exit, which is right — one that talks on every turn
  // gets uninstalled — and it makes "on, and nothing happened" indistinguishable from "the hook
  // never ran". This reads the breadcrumb the hook drops before any gate, and compares what the
  // hook resolved against what this CLI resolves. **A mismatch between those two is the failure
  // mode**, and it is invisible from either side alone.
  // Per-project first. The global file is only written when NO project could be resolved, so a
  // root that differs there is information, not an alarm — the first version compared them
  // blindly and reported a MISMATCH that was only "you have more than one project".
  const perProject = statePath(ROOT, 'autopilot-last-stop.json');
  const globalCrumb = path.join(os.homedir(), '.nexa', 'autopilot-last-stop.json');
  console.log(`\n  ── what this command sees ─────────────────────────────── (v${MY_VERSION})`);
  console.log(`  project      ${ROOT}`);
  console.log(`  state file   ${stateFile}`);
  console.log(`  enabled      ${state.enabled ? `yes (${state.continues ?? 0}/${state.maxContinues ?? 10} used)` : 'NO'}`);
  console.log(`  marker       ${fs.existsSync(path.join(ROOT, '.nexa')) ? 'present' : 'MISSING — run nexa-init --apply'}`);

  console.log('\n  ── what the Stop hook last saw ──────────────────────────');
  let c = null;
  let scope = 'this project';
  try { c = JSON.parse(fs.readFileSync(perProject, 'utf8')); } catch { /* try the global one */ }
  if (!c) {
    try { c = JSON.parse(fs.readFileSync(globalCrumb, 'utf8')); scope = 'no project resolved'; }
    catch { /* never run */ }
  }
  if (!c) {
    // **The log is independent evidence.** A breadcrumb is missing either because the hook never
    // ran, or because it ran before breadcrumbs existed (1.3.1) — and telling a user "never ran"
    // when their own log shows decisions is worse than saying nothing.
    let last = null;
    try {
      const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean);
      if (lines.length) last = JSON.parse(lines[lines.length - 1]);
    } catch { /* no log either */ }
    if (last) {
      console.log('  No breadcrumb — but the LOG shows the hook has run here:');
      console.log(`    ${last.at}  ${last.decision}  ${last.instruction ?? last.why ?? ''}`);
      console.log('  → breadcrumbs arrived in 1.3.1. Restart Claude Code and the next turn');
      console.log('    will record one.\n');
    } else {
      console.log('  The hook has never run for this project.');
      console.log('  → the plugin was installed or updated after this session started.');
      console.log('    Restart Claude Code; hooks are loaded once, at session start.\n');
    }
  } else {
    console.log(`  at           ${c.at}`);
    console.log(`  hook version ${c.hookVersion ?? 'before 1.4.1 — did not record one'}`);
    console.log(`  outcome      ${c.stage}`);
    for (const [k, v] of Object.entries(c)) {
      if (k === 'at' || k === 'stage' || k === 'hookVersion') continue;
      console.log(`  ${k.padEnd(12)} ${v}`);
    }
    // **The question that took several rounds to become answerable.** Claude Code loads hooks
    // once, at session start, and the cache keeps every version side by side — so a session can
    // be running an old hook while the CLI on PATH is new, and nothing distinguishes that from
    // a genuine bug. It is checked before anything else, because if it is true nothing else
    // here means what it appears to.
    if (c.hookVersion && c.hookVersion !== MY_VERSION) {
      console.log(`\n  ⚠️  VERSION MISMATCH — the running session loaded ${c.hookVersion}`);
      console.log(`      this command is ${MY_VERSION}`);
      console.log('      Hooks load once, at session start. QUIT AND REOPEN Claude Code.');
    } else if (!c.hookVersion) {
      console.log(`\n  ⚠️  The hook that ran predates 1.4.1, so it did not record its version.`);
      console.log(`      This command is ${MY_VERSION}. If they differ, quit and reopen Claude Code.`);
    }

    const mine = path.resolve(ROOT);
    if (scope !== 'this project') {
      console.log('\n  ⚠️  This is the GLOBAL breadcrumb — the hook ran somewhere it could not');
      console.log('      resolve a project, so it had nowhere project-specific to write.');
      if (c.root && path.resolve(c.root) !== mine) {
        console.log(`      It resolved ${c.root}, not ${mine}.`);
      }
    } else if (c.root && path.resolve(c.root) !== mine) {
      console.log(`\n  ⚠️  MISMATCH — the hook used ${c.root}`);
      console.log(`      this command uses ${mine}`);
      console.log('      Turning it on here arms a project the hook never reads.');
    }
    console.log('');
  }
} else {
  console.log(`\n  autopilot: ${state.enabled ? 'ON' : 'off'}`);
  if (state.enabled) {
    console.log(`  budget   : ${state.continues ?? 0}/${state.maxContinues ?? 10} consecutive continues used`);
    console.log(`  since    : ${state.since ?? 'unknown'}`);
  }
  console.log(`  state    : ${stateFile}`);
  console.log(`  log      : ${logFile}`);
  console.log('\n  nexa-autopilot on [N] | off | log [N] | doctor\n');
}

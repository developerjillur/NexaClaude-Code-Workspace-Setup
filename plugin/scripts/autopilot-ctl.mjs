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
import { projectRootFor, statePath } from './hooks/roots.mjs';

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
  console.log(`\n  autopilot ON — up to ${s.maxContinues} consecutive continues\n`);
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
} else {
  console.log(`\n  autopilot: ${state.enabled ? 'ON' : 'off'}`);
  if (state.enabled) {
    console.log(`  budget   : ${state.continues ?? 0}/${state.maxContinues ?? 10} consecutive continues used`);
    console.log(`  since    : ${state.since ?? 'unknown'}`);
  }
  console.log(`  state    : ${stateFile}`);
  console.log(`  log      : ${logFile}`);
  console.log('\n  nexa-autopilot on [N] | off | log [N]\n');
}

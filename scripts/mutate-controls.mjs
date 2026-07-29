// guard-coverage proves the ASSERTIONS exist. This asks the harder question: if a control
// were quietly broken, would the suite notice?
//
// Mutation testing, aimed at the controls themselves. For each one, make a small change of
// exactly the shape these have failed in before — turn a refusal into a pass — and see whether
// the suite goes red. A mutation that SURVIVES is a control the suite is not really watching.
//
// Nothing is left modified: each file is restored before the next mutation.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { fileURLToPath } from 'node:url';

// Resolved from this file, never hardcoded. The suite next door spent a day reporting 6/6
// while testing a different workspace's guard, because it named its paths instead of finding
// them.
const WS = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Each mutation is the smallest edit that makes the control stop refusing — which is the
// failure mode thirteen of sixteen actually had.
const MUTATIONS = [
  ['scripts/hooks/guard-edit.mjs', 'const block = (why) => { console.error(why); process.exit(2); };',
    'const block = (why) => { console.error(why); process.exit(0); };', 'never blocks an edit'],
  ['scripts/hooks/guard-wakeup.mjs', 'const block = (why) => { console.error(why); process.exit(2); };',
    'const block = (why) => { console.error(why); process.exit(0); };', 'never blocks a wakeup'],
  ['scripts/card-gate.mjs', 'process.exit(1);', 'process.exit(0);', 'never refuses a card'],
  ['scripts/guard-coverage.mjs', 'process.exit(report.findings.length ? 1 : 0);',
    'process.exit(0);', 'never refuses an untested control'],
  ['scripts/graph-fresh.mjs', 'process.exit(1);', 'process.exit(0);', 'never refuses a stale graph'],
];

const suites = fs.readdirSync(path.join(WS, 'tests'))
  .filter((f) => f.endsWith('.mjs') && !f.startsWith('._'));

const runSuites = () => {
  for (const s of suites) {
    const r = spawnSync('node', [path.join(WS, 'tests', s)], { cwd: WS, encoding: 'utf8', timeout: 900000 });
    if (r.status !== 0) return { red: true, by: s };
  }
  const g = spawnSync('node', [path.join(WS, 'scripts', 'check.mjs')], { cwd: WS, encoding: 'utf8', timeout: 600000 });
  return g.status !== 0 ? { red: true, by: 'check.mjs' } : { red: false };
};

console.log('  ══ baseline ══');
const base = runSuites();
if (base.red) { console.log(`  ! the suite is already red (${base.by}) — fix that first`); process.exit(1); }
console.log('  green\n');
console.log('  ══ mutations — a SURVIVOR is a control nothing is really watching ══');

let survived = 0;
for (const [rel, from, to, what] of MUTATIONS) {
  const f = path.join(WS, rel);
  const original = fs.readFileSync(f, 'utf8');
  if (!original.includes(from)) { console.log(`  ·  ${rel.padEnd(34)} pattern not present — skipped`); continue; }
  fs.writeFileSync(f, original.replace(from, to));
  let res;
  try { res = runSuites(); } finally { fs.writeFileSync(f, original); }
  const caught = res.red;
  if (!caught) survived++;
  console.log(`  ${caught ? '✅ CAUGHT  ' : '❌ SURVIVED'} ${rel.padEnd(34)} ${what}${caught ? ` — by ${res.by}` : ''}`);
}

console.log(`\n  ── ${MUTATIONS.length - survived} caught, ${survived} survived ──`);
if (survived) {
  console.log('  A survivor means the control could be silently disabled and every test would');
  console.log('  still pass. That is the exact shape thirteen of sixteen defects had.\n');
}
process.exit(survived ? 1 : 0);

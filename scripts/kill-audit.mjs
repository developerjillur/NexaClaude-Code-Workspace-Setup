#!/usr/bin/env node
// Break each control's REAL protection, one at a time, and see whether anything notices.
//
//   node scripts/kill-audit.mjs            every mutation
//   node scripts/kill-audit.mjs --json     machine-readable
//   node scripts/kill-audit.mjs --only=tee run one, by id
//
// Exit 0 = every protection is watched. Exit 1 = at least one can be deleted in silence.
//
// ── How this differs from mutate-controls, and why both exist ────────────────
//
// `mutate-controls` turns a control's `exit(2)` into `exit(0)` — it asks *is this control
// watched at all?* Useful, and answered: five of five caught.
//
// **This asks the harder question a council put after it:**
//
// > "guard-coverage proves only that assertion TEXT exists on both sides. Everything between
// > the text and the behaviour is invisible to it. Two points do not prove the classifier, the
// > execution path, or deployment."
//
// So every mutation below deletes ONE REAL RULE — the `tee` pattern, the placeholder list, the
// uncommitted-work check — leaving the control fully functional in every other respect. A
// control can be watched, and still have nine of its ten rules unwatched.
//
// **A SURVIVOR is a protection that could be removed today and every test would stay green.**
//
// ── Method ───────────────────────────────────────────────────────────────────
//
// Each mutation is applied to the real file, the whole suite runs, and the file is restored in
// a `finally` and again on `exit` — because a test that can leave this workspace disarmed is
// worse than the bug it hunts, and that has already happened here once.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const JSON_OUT = process.argv.includes('--json');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7);

/**
 * Each entry deletes one protection and leaves everything else intact.
 *
 * `to` is chosen so the control still runs and still refuses other things — the point is a
 * control that looks alive and has quietly stopped covering one case.
 */
const KILLS = [
  // ── guard-edit: the shell write-detector ───────────────────────────────────
  { id: 'tee', file: 'scripts/hooks/guard-edit.mjs',
    what: 'guard-edit no longer sees `tee` writing into product code',
    from: "    new RegExp(String.raw`(?:^|[\\s;&|])tee\\s+(?:-[^\\s]*\\s+)*${Q}`, 'g'),",
    to: '' },
  { id: 'sed', file: 'scripts/hooks/guard-edit.mjs',
    what: 'guard-edit no longer sees `sed -i` editing product code',
    fromRe: /\n\s*new RegExp\(String\.raw`\(\?:\^\|\[\\s;&\|\]\)sed[^\n]*\n/,
    to: '\n' },
  { id: 'discard', file: 'scripts/hooks/guard-edit.mjs',
    what: 'guard-edit no longer refuses a git command that destroys uncommitted work',
    from: '  if (sawDiscard && process.env.NEXA_ALLOW_DISCARD !== \'1\') {',
    to: '  if (false) {' },
  { id: 'subdir', file: 'scripts/hooks/guard-edit.mjs',
    what: 'guard-edit only matches a codeDir exactly, so anything INSIDE it is unguarded',
    from: '    CODE_ABS.some((d) => c === d || c.startsWith(`${d}${path.sep}`)));',
    to: '    CODE_ABS.some((d) => c === d));' },

  // ── guard-wakeup ───────────────────────────────────────────────────────────
  { id: 'wakeup-admits', file: 'scripts/hooks/guard-wakeup.mjs',
    what: 'guard-wakeup no longer catches a reason that says there is nothing to wait for',
    from: '  /nothing (external )?to wait (on|for)/,',
    to: '' },
  { id: 'wakeup-short', file: 'scripts/hooks/guard-wakeup.mjs',
    what: 'guard-wakeup no longer questions a short delay that names nothing external',
    from: 'if (delay > 0 && delay < 1200 && !NAMES_SOMETHING_EXTERNAL.test(hay)) {',
    to: 'if (false) {' },

  // ── card-gate ──────────────────────────────────────────────────────────────
  { id: 'card-placeholder', file: 'scripts/card-gate.mjs',
    what: 'card-gate accepts TBD / n/a / ??? as real answers',
    fromRe: /const EMPTY = \/[^\n]*\/i;/,
    to: 'const EMPTY = /^(?!)$/;' },
  { id: 'card-stop', file: 'scripts/card-gate.mjs',
    what: 'card-gate stops requiring a kill condition',
    from: "    ['what would make us stop', /(make us stop|kill condition|would stop)/i, 'the observation that says this was wrong'],",
    to: '' },
  { id: 'card-errors', file: 'scripts/card-gate.mjs',
    what: 'card-gate lets a card reach 6-done without naming where its errors surface',
    from: "  '6-done': [",
    to: "  'never-a-real-stage': [" },

  // ── graph-fresh ────────────────────────────────────────────────────────────
  { id: 'graph-uncommitted', file: 'scripts/graph-fresh.mjs',
    what: 'graph-fresh stops noticing uncommitted work the graph cannot know about',
    from: '  if (dirty.length) {',
    to: '  if (false) {' },

  // ── scan-secrets: the deploy gate that reads the whole git history ─────────
  { id: 'secret-aws', file: 'scripts/scan-secrets.mjs',
    what: 'scan-secrets stops recognising an AWS key id',
    fromRe: /\n\s*\['aws key id',[^\n]*\n/,
    to: '\n' },
  { id: 'secret-assigned', file: 'scripts/scan-secrets.mjs',
    what: 'scan-secrets stops recognising `password = "…"` — the broadest rule it has',
    fromRe: /\n\s*\['assigned secret',[^\n]*\n/,
    to: '\n' },
  { id: 'secret-history', file: 'scripts/scan-secrets.mjs',
    what: 'scan-secrets stops reading git HISTORY — a rotated key still sits in every clone',
    from: 'if (!treeOnly) {',
    to: 'if (false) {' },
  { id: 'secret-report', file: 'scripts/scan-secrets.mjs',
    what: 'scan-secrets finds every secret and reports success anyway',
    // Anchored to the LAST line of the file, which is the refusal. Written first as
    // `process.exit(findings.length …)` on the assumption it exited on a count — it does not,
    // and a mutation whose pattern misses reports "skipped", which reads like coverage.
    // Caught by pre-flighting all eighteen against their targets before the run, not during it.
    fromRe: /process\.exit\(1\);\s*$/,
    to: 'process.exit(0);' },

  // ── depth-check: the six shapes of "done" that is not done ─────────────────
  { id: 'depth-stub', file: 'scripts/depth-check.mjs',
    what: 'depth-check stops seeing a function whose whole body is `return null`',
    fromRe: /return `returns \\`\$\{body\}\\` and nothing else`;/,
    to: 'return null;' },
  { id: 'depth-catch', file: 'scripts/depth-check.mjs',
    what: 'depth-check stops seeing a catch block that swallows the error in silence',
    fromRe: /return 'catch block is empty[^\n]*/,
    to: 'return null;' },
  { id: 'depth-assert', file: 'scripts/depth-check.mjs',
    what: 'depth-check stops seeing an assertion that cannot fail — the one that makes a suite worthless while the count goes up',
    fromRe: /return 'assertion is a constant[^\n]*/,
    to: 'return null;' },

  // ── guard-coverage ─────────────────────────────────────────────────────────
  { id: 'coverage-silent', file: 'scripts/guard-coverage.mjs',
    what: 'guard-coverage stops requiring a SILENT case — the direction every defect came from',
    from: '  } else if (!silent) {',
    to: '  } else if (false) {' },
];

const suites = fs.readdirSync(path.join(ROOT, 'tests'))
  .filter((f) => f.endsWith('.mjs') && !f.startsWith('._'));

/** The real entry points, in the order a person meets them. */
function runEverything() {
  for (const s of suites) {
    const r = spawnSync('node', [path.join(ROOT, 'tests', s)], { cwd: ROOT, encoding: 'utf8', timeout: 900000 });
    if (r.status !== 0) return { red: true, by: s };
  }
  const g = spawnSync('node', [path.join(ROOT, 'scripts', 'check.mjs')], { cwd: ROOT, encoding: 'utf8', timeout: 900000 });
  return g.status !== 0 ? { red: true, by: 'check.mjs' } : { red: false };
}

// Restore-on-exit, unconditionally. This file edits real controls.
const inFlight = new Map();
const restoreAll = () => {
  for (const [f, original] of inFlight) { try { fs.writeFileSync(f, original); } catch { /* nothing else to try */ } }
  inFlight.clear();
};
process.on('exit', restoreAll);
process.on('SIGINT', () => { restoreAll(); process.exit(130); });
process.on('uncaughtException', (e) => { restoreAll(); console.error(e); process.exit(1); });

const say = (s) => { if (!JSON_OUT) console.log(s); };

say('════════════════════════════════════════════════════════════════════════');
say('  KILL AUDIT — delete one real protection at a time');
say('════════════════════════════════════════════════════════════════════════\n');

const base = runEverything();
if (base.red) {
  say(`  ! the suite is already red (${base.by}). An audit against a red baseline says nothing.\n`);
  process.exit(1);
}
say('  baseline: green\n');

const results = [];
for (const k of KILLS) {
  if (ONLY && k.id !== ONLY) continue;
  const f = path.join(ROOT, k.file);
  // A control that is not present here is not a survivor — it is absent. Reporting it as
  // "SURVIVED" would be the same fail-open this file exists to hunt, pointed at itself.
  if (!fs.existsSync(f)) { results.push({ id: k.id, file: k.file, what: k.what, status: 'not-applicable' }); say(`  ·  ${k.id.padEnd(18)} control not present here — skipped`); continue; }
  const original = fs.readFileSync(f, 'utf8');

  let mutated;
  if (k.fromRe) {
    if (!k.fromRe.test(original)) { results.push({ ...k, status: 'not-applicable' }); say(`  ·  ${k.id.padEnd(18)} pattern absent — skipped`); continue; }
    mutated = original.replace(k.fromRe, k.to);
  } else {
    if (!original.includes(k.from)) { results.push({ ...k, status: 'not-applicable' }); say(`  ·  ${k.id.padEnd(18)} pattern absent — skipped`); continue; }
    mutated = original.replace(k.from, k.to);
  }
  if (mutated === original) { results.push({ ...k, status: 'no-op' }); say(`  ·  ${k.id.padEnd(18)} mutation changed nothing — skipped`); continue; }

  inFlight.set(f, original);
  fs.writeFileSync(f, mutated);
  let res;
  try {
    // A mutation that breaks parsing is not a test of coverage; it is a test of node.
    const parses = spawnSync('node', ['--check', f], { encoding: 'utf8' }).status === 0;
    res = parses ? runEverything() : { red: true, by: 'syntax — mutation invalid, result discarded', invalid: true };
  } finally {
    fs.writeFileSync(f, original);
    inFlight.delete(f);
  }

  const status = res.invalid ? 'invalid' : (res.red ? 'caught' : 'SURVIVED');
  results.push({ id: k.id, file: k.file, what: k.what, status, by: res.by ?? null });
  const mark = status === 'caught' ? '✅ caught  ' : status === 'invalid' ? '·  invalid ' : '❌ SURVIVED';
  say(`  ${mark} ${k.id.padEnd(18)} ${k.what}${res.by && status === 'caught' ? `\n${' '.repeat(33)}by ${res.by}` : ''}`);
}

const survived = results.filter((r) => r.status === 'SURVIVED');
const caught = results.filter((r) => r.status === 'caught');

if (JSON_OUT) {
  console.log(JSON.stringify({ caught: caught.length, survived: survived.length, results }, null, 2));
  process.exit(survived.length ? 1 : 0);
}

console.log(`\n  ── ${caught.length} caught, ${survived.length} survived ──`);
if (survived.length) {
  console.log('\n  Each survivor is a protection that could be deleted today with every test');
  console.log('  still green. That is not a gap in the control — it is a gap in what watches it.\n');
  for (const s of survived) console.log(`    ${s.id}: ${s.what}`);
  console.log('');
}
process.exit(survived.length ? 1 : 0);

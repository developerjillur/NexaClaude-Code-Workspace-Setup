#!/usr/bin/env node
// Run the ACTUAL APPLICATION and assert the invariants that take a product down.
//
//   nexa-prove                 run every invariant declared in invariants.json
//   nexa-prove --only=tenant   just one
//   nexa-prove --list          what is declared, and what is not
//
// Exit 0 = every declared invariant held. Exit 1 = one did not. Exit 2 = nothing was proved.
//
// ── why this file exists, and why it is different from everything else here ──
//
// Two independent audits and a four-vendor council reached the same sentence about this
// workspace, from different directions:
//
//   **"Every gate inspects process artifacts — cards, comments, citations. None of them ever
//     runs the application."**
//
// That is the whole gap between the process being good and the OUTPUT being production-ready,
// and it is the objective this workspace is judged against. An agent demonstrated a card whose
// code took the tenant from an `x-org-id` header, interpolated it into SQL, and handled a
// Stripe webhook with no signature check and no dedupe — and it walked 1-spec → 6-done with
// every guard green, because every guard was reading markdown.
//
// `skills/test-the-real-thing` exists because a feature shipped with 532 green assertions, six
// clean gates and 31/31 mutation coverage, then failed ten consecutive times in a user's hands.
// It has been prose since the day it was written. This is its mechanism.
//
// ── what it deliberately is NOT ─────────────────────────────────────────────
//
// Not a test framework. You have one. Not a replacement for your suite — the point is that a
// suite proves your code behaves as you *think*, and these prove the four things whose failure
// costs money regardless of what you think:
//
//   tenant     one tenant cannot read another's row               → the breach
//   idempotent the same event delivered twice charges once        → the double charge
//   authz      an unauthenticated caller is refused               → the open door
//   migration  the previous app version still works after migrate → the rollback outage
//
// Each is a COMMAND YOU WRITE that exits non-zero when the invariant is violated. The workspace
// supplies the discipline — that they are declared, run, and cannot be ticked without running —
// not the assertions, because the assertions are yours and only you know your schema.
//
// ── the honesty rule that makes it worth anything ───────────────────────────
//
// An empty `invariants.json` EXITS 2. "No invariants declared" is not "no invariants violated",
// and this workspace has now shipped that same confusion four times: depth-check scanning zero
// files, mutation-test with no mutations, guard-coverage with zero controls, and a card gate
// that could not start. A tool that examined nothing must never return the code that means
// "examined everything and found nothing wrong".
// @rules invariant-violated, no-invariants, invariant-command-missing, prove-unreachable

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectRootFor, paths, PLUGIN_ROOT } from './hooks/roots.mjs';

const { root: ROOT, trusted: ROOT_TRUSTED, source: ROOT_SOURCE } = projectRootFor(import.meta.url);
if (!ROOT_TRUSTED) {
  console.error(`no workspace found (looked from ${ROOT_SOURCE}). Run this inside a project, or set CLAUDE_PROJECT_DIR.`);
  process.exit(2);
}
const P = paths(ROOT);
const argv = process.argv.slice(2);
const only = argv.find((a) => a.startsWith('--only='))?.split('=')[1];
const JSON_OUT = argv.includes('--json');

/** The four an app with paying users cannot be wrong about. Declared, never inferred. */
const KINDS = {
  tenant: 'one tenant cannot read, write or enumerate another tenant\'s data',
  idempotent: 'the same external event delivered twice has the effect of one',
  authz: 'an unauthenticated or unauthorised caller is refused, not served',
  migration: 'the PREVIOUS application version still works against the new schema',
};

const FILE = path.join(ROOT, 'invariants.json');
const EXAMPLE = path.join(PLUGIN_ROOT, 'templates', 'invariants.example.json');

if (argv.includes('--list')) {
  console.log('\n  The four invariants this can prove, and what each costs when it is wrong:\n');
  for (const [k, why] of Object.entries(KINDS)) console.log(`    ${k.padEnd(12)} ${why}`);
  console.log(`\n  Declare yours in ${FILE}`);
  console.log(`  Worked example:  ${EXAMPLE}\n`);
  process.exit(0);
}

const declared = (() => {
  if (!fs.existsSync(FILE)) return [];
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return Array.isArray(j) ? j : (j.invariants ?? []);
  } catch (e) {
    console.error(`\n  [invariant-command-missing] invariants.json is not valid JSON — ${e.message}`);
    console.error('  Refusing rather than proving zero invariants and calling it a pass.\n');
    process.exit(2);
  }
})();

const chosen = declared.filter((i) => !only || i.kind === only || i.id === only);

// ── nothing declared is not nothing violated ────────────────────────────────
if (!chosen.length) {
  console.log('\n── prove-invariants ──\n');
  console.log('  No invariants declared. This is NOT a pass — nothing was proved.\n');
  console.log('  Every gate in this workspace reads markdown. This is the one that runs your');
  console.log('  application, and it is the difference between "the process was followed" and');
  console.log('  "the software works". Two audits and a council named its absence as the single');
  console.log('  largest gap between this workspace and a production-ready output.\n');
  console.log(`  Declare them in ${FILE} — one per invariant whose failure costs money:\n`);
  for (const [k, why] of Object.entries(KINDS)) console.log(`    ${k.padEnd(12)} ${why}`);
  console.log(`\n  Worked example: ${EXAMPLE}`);
  console.log('  Each entry is a COMMAND that exits non-zero when the invariant is violated.');
  console.log('  Write it against a running instance — a booted server, a real database, a');
  console.log('  replayed webhook. An assertion about a mock proves the mock.\n');
  if (JSON_OUT) console.log(JSON.stringify({ declared: 0, proved: 0, violated: [], status: 'no-invariants' }));
  process.exit(2);
}

// ── run them ────────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(70)}`);
console.log('  PROVE INVARIANTS — run the application, not the paperwork');
console.log('═'.repeat(70));
console.log(`\n  ${chosen.length} invariant(s). Each runs against a real instance; this is not fast.\n`);

const results = [];
for (const inv of chosen) {
  const label = `${inv.kind ?? 'custom'}/${inv.id ?? '?'}`;
  if (!inv.command) {
    console.log(`  ⚠️  ${label.padEnd(26)} no "command" — an invariant with nothing to run proves nothing`);
    results.push({ ...inv, status: 'invariant-command-missing' });
    continue;
  }
  process.stdout.write(`  ${label.padEnd(26)} ${String(inv.what ?? '').slice(0, 44).padEnd(46)}`);
  const started = Date.now();
  // The adopter's command, in their code directory, with their environment. A shell is correct
  // here — this is a user-authored command line, not an interpolated pattern.
  const r = spawnSync(inv.command, {
    shell: true,
    cwd: path.join(ROOT, inv.cwd ?? ''),
    encoding: 'utf8',
    timeout: (inv.timeoutSeconds ?? 300) * 1000,
    env: { ...process.env, ...(inv.env ?? {}) },
  });
  const ms = Date.now() - started;
  if (r.error?.code === 'ETIMEDOUT') {
    console.log(`⏱  TIMED OUT after ${inv.timeoutSeconds ?? 300}s`);
    results.push({ ...inv, status: 'prove-unreachable', detail: 'timed out' });
    continue;
  }
  // **Exit 0 means the invariant HELD.** Anything else means it did not, or the check could not
  // run — and those are both refusals. A proof that could not execute has proved nothing, which
  // is the rule the rest of this workspace learned the hard way.
  if (r.status === 0) {
    console.log(`✅ held  (${ms}ms)`);
    results.push({ ...inv, status: 'held', ms });
  } else {
    console.log(`❌ VIOLATED  (exit ${r.status})`);
    results.push({ ...inv, status: 'invariant-violated', exit: r.status,
      detail: (r.stdout || r.stderr || '').trim().split('\n').slice(-4).join('\n') });
  }
}

const violated = results.filter((r) => r.status === 'invariant-violated');
const broken = results.filter((r) => ['prove-unreachable', 'invariant-command-missing'].includes(r.status));
const held = results.filter((r) => r.status === 'held');

console.log(`\n${'─'.repeat(70)}`);
for (const v of violated) {
  console.log(`\n  ❌ [invariant-violated] ${v.kind}/${v.id} — ${v.what ?? ''}`);
  console.log(`     ${KINDS[v.kind] ?? 'a declared invariant'}`);
  if (v.why) console.log(`     why it matters: ${v.why}`);
  if (v.detail) console.log(v.detail.split('\n').map((l) => `       ${l}`).join('\n'));
}
for (const b of broken) {
  console.log(`\n  ⛔ [${b.status}] ${b.kind}/${b.id} — the check did not run, so nothing was proved.`);
  if (b.detail) console.log(`     ${b.detail}`);
}

console.log(`\n  ${held.length} held, ${violated.length} violated, ${broken.length} could not run.\n`);
if (JSON_OUT) {
  console.log(JSON.stringify({ declared: chosen.length, proved: held.length, violated, broken }, null, 2));
}

if (violated.length || broken.length) {
  console.log('  An invariant that does not hold is not a card that needs a note. It is the');
  console.log('  product being wrong in the way that costs money.\n');
  process.exit(1);
}
console.log('  What this cannot check: an invariant nobody declared. The four above are the');
console.log('  ones that empty a bank account or leak a customer; yours may have a fifth.\n');
process.exit(0);

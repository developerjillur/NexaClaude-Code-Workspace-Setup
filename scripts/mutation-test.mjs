#!/usr/bin/env node
// Break the code on purpose. Does the suite notice?
//
// A green count is a count, not evidence. §4 says a guard nobody has watched fail is not a
// guard — this applies that to your whole suite at once, by deleting an invariant and asking
// whether anything goes red.
//
// **The first run of this, on the project it was extracted from, found the answer is sometimes
// no: a path-traversal guard could be removed entirely and 427 checks still passed** — and that
// guard existed because `id=../package` had been a working exploit against a live instance.
// That is the whole argument for the tool. Four hundred assertions had never touched it.
//
// This is the counterpart to `kill-audit.mjs`, not a duplicate of it: kill-audit mutates the
// WORKSPACE'S controls, this mutates YOUR product's invariants. Neither subsumes the other,
// which is why both are here.
//
//   node scripts/mutation-test.mjs             run them all
//   node scripts/mutation-test.mjs --only=2    just one
//   node scripts/mutation-test.mjs --list
//
// Slow — each mutation runs the whole offline suite. Not in the default CI; it belongs to
// `deploy-gate` and to any card that touches a guard.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// ── your mutations live in mutations.json, not in this file ──────────────────
//
// **This shipped with four mutations against `src/agent-config.js` and `src/redact.js`** —
// files that exist only in the project this workspace was extracted from. For anybody else
// they resolved to nothing, printed "skipping", and the tool reported success having tested
// zero invariants.
//
// `no-product-leakage` did not catch it, and said in advance that it would not: it matches
// words, and a **leaked assumption about directory layout** carries none. That is the ceiling
// of a denylist, demonstrated on this repo rather than argued about.
//
// So the mutations are data now. Write your own in `mutations.json` at the workspace root —
// one entry per security decision your project has actually made, each mapping to a fix in
// your record. Synthetic mutations measure nothing; the point is *"if somebody reverted this
// specific decision, would anything go red?"*
//
//   [{ "id": 1,
//      "file": "src/auth.js",
//      "what": "fail-closed policy becomes fail-open",
//      "why":  "a typo in a policy name must DENY, not grant",
//      "from": "if (policy === 'full') return all;",
//      "to":   "if (policy !== 'readonly') return all;" }]
//
// `codeDirs[0]` from workspace.config.json is the root those paths are relative to, and
// `testCommand` (default `npm run test:offline`) is what must go red.
const cfg = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'workspace.config.json'), 'utf8')); }
  catch { return {}; }
})();
const CODE = path.join(ROOT, (Array.isArray(cfg.codeDirs) && cfg.codeDirs[0]) || 'code');
const TEST_CMD = cfg.mutationTestCommand || 'npm run test:offline';

const MUTATIONS = (() => {
  const f = path.join(ROOT, 'mutations.json');
  if (!fs.existsSync(f)) return [];
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    return Array.isArray(j) ? j : (j.mutations ?? []);
  } catch (e) {
    console.error(`\n  mutations.json is not valid JSON — ${e.message}`);
    console.error('  Refusing rather than running zero mutations and calling it a pass.\n');
    process.exit(2);
  }
})();

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.split('=')[1];

if (args.includes('--list')) {
  for (const m of MUTATIONS) console.log(`  ${m.id}. ${m.file} — ${m.what}\n       ${m.why}`);
  process.exit(0);
}

// ── nothing to run is not a pass ─────────────────────────────────────────────
//
// The old version printed "skipping" for each unresolvable mutation and exited 0. A tool that
// tested zero invariants and reported success is the exact failure this workspace catalogues,
// and it was sitting inside the tool built to catch it.
if (!MUTATIONS.length) {
  console.log('\n── mutation-test ──\n');
  console.log('  No mutations defined. This is not a pass — nothing was tested.\n');
  console.log('  Create `mutations.json` at the workspace root, one entry per security');
  console.log('  decision your project has actually made. See the header of this file for the');
  console.log('  shape, and templates/mutations.example.json for a worked example.\n');
  console.log('  Synthetic mutations measure nothing. The question each one answers is:');
  console.log('  "if somebody reverted this decision, would anything go red?"\n');
  process.exit(0);
}

const resolved = MUTATIONS.filter((m) => {
  if (!m.from) { console.log(`  ⚠️  skipping ${m.id}: no "from" — a mutation that changes nothing tests nothing`); return false; }
  const f = path.join(CODE, m.file);
  if (!fs.existsSync(f)) { console.log(`  ·  skipping ${m.id}: ${m.file} not found`); return false; }
  if (!fs.readFileSync(f, 'utf8').includes(m.from)) {
    console.log(`  ⚠️  skipping ${m.id}: the line it mutates has changed — REWRITE THE MUTATION`);
    console.log(`       expected: ${m.from.trim()}`);
    return false;
  }
  return true;
}).filter((m) => !only || String(m.id) === only);

console.log(`\n${'═'.repeat(70)}`);
console.log('  MUTATION TEST — break it on purpose, see if the suite notices');
console.log('═'.repeat(70));
console.log(`\n  ${resolved.length} mutation(s). Each runs the full offline suite; this takes minutes.\n`);

const results = [];
for (const m of resolved) {
  const file = path.join(CODE, m.file);
  const original = fs.readFileSync(file, 'utf8');
  process.stdout.write(`  ${m.id}. ${m.what} … `);
  try {
    fs.writeFileSync(file, original.replace(m.from, m.to));
    let caught = false;
    try {
      execSync(TEST_CMD, { cwd: CODE, stdio: 'pipe', timeout: 10 * 60_000 });
    } catch { caught = true; }
    results.push({ ...m, caught, original });
    console.log(caught ? '✅ caught' : '❌ SURVIVED');
  } finally {
    // Restored in a finally so an interrupt or a crash cannot leave the tree mutated.
    fs.writeFileSync(file, original);
  }
}

// Prove the restore worked — by comparing the files WE touched against the bytes we saved,
// not against git.
//
// The first version compared `git diff --name-only src/`, which listed fourteen files that
// were already uncommitted before this script ran and had nothing to do with any mutation. It
// reported a scary warning about work it had not touched. Same false-positive shape as four
// other checks in this workspace, and the same fix: measure the thing you actually mean.
const dirty = results
  .filter((r) => fs.readFileSync(path.join(CODE, r.file), 'utf8') !== r.original)
  .map((r) => r.file);

const survived = results.filter((r) => !r.caught);
console.log(`\n${'─'.repeat(70)}`);
console.log(`  ${results.length - survived.length}/${results.length} caught.\n`);

if (survived.length) {
  console.log('  SURVIVED — these invariants can be deleted and the suite stays green:\n');
  for (const s of survived) {
    console.log(`    ${s.file} — ${s.what}`);
    console.log(`      ${s.why}\n`);
  }
  console.log('  A guard with no test is a comment that happens to compile. Each of these');
  console.log('  needs a test that supplies the broken input and asserts the refusal.\n');
}

console.log(dirty.length
  ? `  ⚠  a mutated file was NOT restored — CHECK THIS: ${dirty.join(', ')}\n`
  : '  ✅ source tree restored clean.\n');

process.exit(survived.length ? 1 : 0);

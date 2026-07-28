#!/usr/bin/env node
// Break the code on purpose. Does the suite notice?
//
// 427 green checks is a count, not evidence. §4 says a guard nobody has watched fail is not a
// guard — this applies that to the whole suite at once, by deleting an invariant and asking
// whether anything goes red.
//
// The first run found the answer is sometimes no. **The agent-id traversal guard could be
// removed entirely and all 427 checks still passed** — and that guard exists because
// `id=../package` was a working exploit found by probing a live instance.
//
// Every mutation below reverses a real security decision this project made. They are not
// synthetic: each maps to a fix in the record.
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
const CODE = path.join(ROOT, 'code');

const MUTATIONS = [
  {
    id: 1,
    file: 'src/agent-config.js',
    what: 'fail-closed tool policy becomes fail-open',
    why: 'a typo in a policy name should DENY shell access, not grant it',
    from: "  if (policy === 'full') return tools;",
    to: "  if (policy !== 'readonly') return tools;",
  },
  {
    id: 2,
    file: 'src/agent-config.js',
    what: 'privileged tools reach untrusted callers',
    why: 'run_task is admin/allowlist only — this hands it to anyone who dials',
    from: '    if (privilegedNames?.has(t.name)) return false;',
    to: '    if (privilegedNames?.has(t.name)) return true;',
  },
  {
    id: 3,
    file: 'src/agent-config.js',
    what: 'agent-id traversal guard removed',
    why: 'id=../package was a working exploit: a file-existence oracle and a config dump',
    from: 'const AGENT_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;',
    to: 'const AGENT_ID_RE = /.*/;',
  },
  {
    id: 4,
    file: 'src/redact.js',
    what: 'secret scrubbing disabled',
    why: 'everything Codex returns passes through this before it becomes speech or a log',
    from: null, // resolved at runtime — see below
    to: null,
  },
];

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.split('=')[1];

if (args.includes('--list')) {
  for (const m of MUTATIONS) console.log(`  ${m.id}. ${m.file} — ${m.what}\n       ${m.why}`);
  process.exit(0);
}

// Mutation 4 needs the file's actual shape; skip it rather than guess.
const resolved = MUTATIONS.filter((m) => {
  if (!m.from) return false;
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
      execSync('npm run test:offline', { cwd: CODE, stdio: 'pipe', timeout: 10 * 60_000 });
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

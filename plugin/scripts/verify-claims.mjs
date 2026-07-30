#!/usr/bin/env node
// Check a card's claims against the repository.
//
// Three things exist and none of them talks to the others: the PLAN (§2 names the files), the
// DIFF (what actually changed), and the CLAIMS (§3 prose, and ticked criteria citing evidence).
// A card can pass every existing gate while all three disagree.
//
// The dangerous one is a citation nobody follows. `test/emergency-gate.mjs:88` in a ticked
// criterion looks like proof and costs nothing to write. If the file does not exist, or has 40
// lines, or the npm script named in a backtick is not in package.json, then the evidence rule
// added at 5-verify is satisfied by a sentence rather than by a fact — which is the same
// failure it was built to stop, one level up.
//
//   node scripts/verify-claims.mjs board/<stage>/<card>.md [--base <git-ref>]
//
// Exit 1 on any unresolvable claim. Unplanned changes are reported, not failed — discovery is
// legitimate; discovery nobody wrote down is not.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { projectRootFor, paths } from './hooks/roots.mjs';

// Two roots — see hooks/roots.mjs. This one is the PROJECT being checked, which is not
// where this script lives once the workspace ships as a plugin.
const { root: ROOT, trusted: ROOT_TRUSTED, source: ROOT_SOURCE } = projectRootFor(import.meta.url);
// Every plugin-written location comes from one module — see paths() in roots.mjs.
const P = paths(ROOT);
if (!ROOT_TRUSTED) {
  console.error(`no workspace found (looked from ${ROOT_SOURCE}). Run this inside a project, or set CLAUDE_PROJECT_DIR.`);
  process.exit(2);
}
const args = process.argv.slice(2);
const cardPath = args.find((a) => !a.startsWith('--'));
const base = args.find((a) => a.startsWith('--base='))?.split('=')[1] ?? 'HEAD';

if (!cardPath || !fs.existsSync(cardPath)) {
  console.error('Usage: node scripts/verify-claims.mjs board/<stage>/<card>.md [--base <ref>]');
  process.exit(1);
}

const card = fs.readFileSync(cardPath, 'utf8');
const section = (n) => card.split(new RegExp(`^## ${n} · `, 'm'))[1]?.split(/^## \d+ · /m)[0] ?? '';

let fail = 0, warn = 0;
const bad = (m, d) => { fail++; console.log(`  ❌ ${m}\n       ${d}`); };
const soft = (m, d) => { warn++; console.log(`  ⚠️  ${m}\n       ${d}`); };
const ok = (m) => console.log(`  ✅ ${m}`);

/** Where the product code lives — read from config, never assumed to be `code/`. */
const codeDirs = (() => {
  try {
    const c = JSON.parse(fs.readFileSync(P.config, 'utf8'));
    return Array.isArray(c.codeDirs) && c.codeDirs.length ? c.codeDirs : ['code'];
  } catch { return ['code']; }
})();

/** Resolve a repo-ish path the way a reader would: as given, or under a code dir. */
const resolve = (p) => {
  for (const c of [path.join(ROOT, p), ...codeDirs.map((d) => path.join(ROOT, d, p)), path.resolve(p)]) {
    if (fs.existsSync(c)) return c;
  }
  return null;
};

console.log(`\n── verify-claims · ${path.basename(cardPath)} ──`);

// ── 1 · the plan named files. Do they exist, and were they touched? ──────────
console.log('\n▸ Plan vs diff');
const planFiles = [...section(2).matchAll(/^\|\s*`?([\w./-]+\.\w+)`?[^|]*\|/gm)]
  .map((m) => m[1]).filter((f) => !/^\|/.test(f));

let changed = [];
try {
  changed = execSync(`git diff --name-only ${base}`, { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean);
  const staged = execSync('git diff --cached --name-only', { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean);
  changed = [...new Set([...changed, ...staged])];
} catch { /* not a repo, or no base — reported below */ }

if (!planFiles.length) {
  soft('§2 names no files', 'the plan gate requires a named file per row — nothing to verify against');
} else {
  const missing = planFiles.filter((f) => !resolve(f));
  if (missing.length) bad(`${missing.length} planned file(s) do not exist`, missing.join(', '));
  else ok(`all ${planFiles.length} planned files exist`);

  // A planned file that was never touched is the shape of "we said we would and did not".
  if (changed.length) {
    // WARNING, not a failure — and the reason matters. By the time a card reaches 5-verify
    // its work is often already committed, so `git diff HEAD` is empty of exactly the files
    // that were done properly. Failing on that punishes the honest card and passes the lying
    // one, which is backwards. **Existence is checked hard; timing is only ever a hint.**
    const untouched = planFiles.filter((f) => !changed.some((c) => c.endsWith(f) || f.endsWith(c.replace(/^code\//, ''))));
    if (untouched.length) {
      soft(`${untouched.length} planned file(s) are not in the diff against ${base}`,
        `${untouched.join(', ')} — already committed, or planned and never done. `
        + `Re-run with --base=<the commit before this card started> to tell which`);
    } else ok('every planned file appears in the diff');

    const unplanned = changed.filter((c) => !/^(board|docs)\//.test(c)
      && !planFiles.some((f) => c.endsWith(f) || f.endsWith(c.replace(/^code\//, ''))));
    if (unplanned.length) {
      soft(`${unplanned.length} file(s) changed that the plan did not name`,
        `${unplanned.slice(0, 6).join(', ')} — discovery is fine; discovery nobody recorded is scope creep`);
    }
  } else {
    soft('no diff against ' + base, 'nothing to reconcile the plan against');
  }
}

// ── 2 · every citation in a ticked criterion must resolve ────────────────────
console.log('\n▸ Cited evidence');
const ticked = card.split('\n').filter((l) => /^\s*- \[x\]/i.test(l));
if (!ticked.length) {
  console.log('  ·  no ticked criteria yet');
} else {
  let checked = 0;

  for (const line of ticked) {
    // file:line — the citation that is cheapest to invent and never followed.
    for (const [, file, ln] of line.matchAll(/([\w./-]+\.(?:mjs|js|json|md)):(\d+)/g)) {
      checked++;
      const real = resolve(file);
      if (!real) { bad(`cited file does not exist: ${file}:${ln}`, line.trim().slice(0, 70)); continue; }
      const count = fs.readFileSync(real, 'utf8').split('\n').length;
      if (+ln > count) bad(`${file}:${ln} — file has only ${count} lines`, line.trim().slice(0, 70));
    }

    // `npm run x` — must be a real script, in EITHER package.json.
    //
    // The first version consulted only the workspace's, and refused a card that cited its own
    // product's test command — `npm run test:offline`, which exists in `code/package.json` and
    // nowhere else. **A card documenting the exact command somebody ran was called a false
    // claim.** That is the false-positive direction, the one that gets a guard switched off
    // within a week, and it shipped.
    //
    // A workspace and the code it guards are two npm projects. Either may own the script, and
    // the refusal now says which files were actually consulted, so a genuine miss is
    // debuggable instead of mysterious.
    for (const [, script] of line.matchAll(/`npm run ([\w:-]+)`/g)) {
      checked++;
      const seen = [];
      const known = new Set();
      for (const cand of [path.join(ROOT, 'package.json'), ...codeDirs.map((d) => path.join(ROOT, d, 'package.json'))]) {
        if (!fs.existsSync(cand)) continue;
        seen.push(path.relative(ROOT, cand));
        try { Object.keys(JSON.parse(fs.readFileSync(cand, 'utf8')).scripts ?? {}).forEach((k) => known.add(k)); }
        catch { /* an unparseable package.json is not this check's business */ }
      }
      if (!known.has(script)) {
        bad(`cited script does not exist: npm run ${script}`,
          `${line.trim().slice(0, 70)}\n       looked in: ${seen.join(', ') || 'no package.json found'}`);
      }
    }

    // `node path/to.mjs` — must be a real file.
    for (const [, file] of line.matchAll(/`node ([\w./-]+\.mjs)/g)) {
      checked++;
      if (!resolve(file)) bad(`cited command points at a missing file: node ${file}`, line.trim().slice(0, 70));
    }
  }

  if (checked === 0) {
    bad(`${ticked.length} ticked criteri${ticked.length === 1 ? 'on' : 'a'} cite nothing checkable`,
      'a tick must carry a file:line, an npm script, or a node command');
  } else if (!fail) ok(`${checked} citation(s) across ${ticked.length} ticked criteria all resolve`);
}

// ── 3 · a test was claimed. Does it exist, and does it assert anything? ──────
console.log('\n▸ Proof-by-test');
const provedBy = /\*\*Proved by\.\*\*\s*`?([\w./-]+\.mjs)`?/.exec(card)?.[1];
if (!provedBy) {
  soft('§1 has no "Proved by" test named', 'the spec gate asks which test proves this');
} else {
  const real = resolve(provedBy);
  if (!real) bad(`the test named in "Proved by" does not exist: ${provedBy}`, 'the card claims a proof that is not there');
  else {
    const body = fs.readFileSync(real, 'utf8');
    const asserts = (body.match(/\b(assert|check|expect|ok)\s*\(/g) ?? []).length;
    if (asserts === 0) bad(`${provedBy} contains no assertions`, 'a test file with nothing to fail is not a proof');
    else ok(`${provedBy} exists with ${asserts} assertion(s)`);
  }
}

// ── 4 · the guard, watched failing ──────────────────────────────────────────
console.log('\n▸ The guard, watched failing');
const verify = section(5);
const pasted = /```[\s\S]{40,}?```/.test(verify);
const claimsWatched = /watched (it )?fail|deliberate(ly)? (broke|failure)/i.test(card);
if (claimsWatched && !pasted) {
  bad('the card says a guard was watched failing, and pastes no output',
    '§4 of the contract wants the failure itself, not the report of it');
} else if (pasted) ok('a failure block is pasted in §5');
else console.log('  ·  not at 5-verify yet');

// ── verdict ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
if (fail) {
  console.log(`  ${fail} unresolvable claim${fail > 1 ? 's' : ''}${warn ? `, ${warn} warning${warn > 1 ? 's' : ''}` : ''}.\n`);
  console.log('  A citation nobody follows is a sentence, not evidence. Fix the claim or');
  console.log('  fix the code — editing the card to remove the citation is neither.\n');
  process.exit(1);
}
console.log(`  All claims resolve${warn ? `, ${warn} warning${warn > 1 ? 's' : ''}` : ''}.\n`);
console.log('  What this cannot check: whether the test that exists tests the right thing,');
console.log('  or whether the prose in §3 describes what the diff actually does. Those are');
console.log('  the review, and the review is a different model — §10.\n');

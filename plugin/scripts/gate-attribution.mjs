#!/usr/bin/env node
// Which control actually CAUGHT the defects this project has found?
//
//   nexa-attribution            the table
//   nexa-attribution --json     machine-readable
//   nexa-attribution --show=kill-audit    the sentences behind one row
//
// Exit 0 always. This measures; it does not refuse.
//
// ── why this exists ─────────────────────────────────────────────────────────
//
// A four-vendor council reviewing this workspace said the thing nothing here had checked:
//
//   "Nothing shows the PROCESS gates (card-gate, check.mjs) are what catch real defects.
//    `nexa-prove`, the one gate that runs the actual application, is doing that work. The nine
//    stages of ceremony around it are unproven overhead riding on one proven gate's credibility."
//
// This workspace has a skill called `measure-dont-claim` and a plan carrying 77 disproven
// claims, and it had never once measured which of its own controls earn their keep. It asserted
// a nine-stage pipeline was valuable in the same document that refuses unmeasured claims.
//
// The corpus is the repository's own attribution habit: it records HOW a defect was found —
// "found by running it rather than reading it", "caught by 5-verify", "found by the user rather
// than by the tests". 161 such sentences across 94 tracked files, written before anybody
// thought to count them, which is the closest thing to an unbiased sample available here.
//
// **The first published table was wrong and the correction is worth more than the table.** It
// reported kill-audit at 14, the top row by a wide margin. Two things were inflating it: the
// corpus included `CHANGELOG.md` and a council transcript under `docs/examples/` that CRITICISES
// kill-audit — five sentences about its weaknesses, counted as five findings it made — and the
// bucket order let tool names outrank people, so *"found by the user rather than by the tests"*
// was filed under the suite. Corrected, kill-audit is **4**, and the top row is test fixtures at
// 9 followed by running-the-real-thing at 6.
//
// A control that measures which control works, measured wrong, in the direction that flattered
// the most impressive-sounding tool. Found by a council reading this file rather than by
// anything here.
//
// ── what this CANNOT tell you, and it is the important half ─────────────────
//
// **A gate that PREVENTS a bad card never generates a "found by" sentence.** Prevention leaves
// no trace, so a low count is not proof of low value — `card-gate` refusing a placeholder at
// 1-spec stops a defect from ever existing to be attributed. This measures DETECTION, not
// prevention, and the two are different jobs.
//
// It is also attribution written by whoever wrote the comment, clustered where the work was
// interesting. Treat the shape as evidence and the exact numbers as indicative.
//
// What it can honestly settle: whether a control has EVER been recorded catching anything. A
// control with zero attributions across the whole history is not obviously earning the tokens
// it costs every session, and that is a question worth being asked out loud.
// **No `@rules` line, deliberately.** `guard-coverage` treats any script with a `process.exit(1|2)`
// as a refusing control and demands a firing and a silent fixture per declared rule. This script
// reports; its only non-zero exits are "no workspace here" and "no such control", which are usage
// errors rather than refusals. Writing `@rules none` made the coverage gate parse "none" as a rule
// id and demand a fixture for it — a rule that does not exist, invented by the line claiming there
// were none.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { projectRootFor } from './hooks/roots.mjs';

const { root: ROOT, trusted: TRUSTED, source: SRC } = projectRootFor(import.meta.url);
if (!TRUSTED) {
  console.error(`no workspace found (looked from ${SRC}). Run this inside a project.`);
  process.exit(2);
}
const argv = process.argv.slice(2);
const JSON_OUT = argv.includes('--json');
const SHOW = argv.find((a) => a.startsWith('--show='))?.split('=')[1];

/**
 * The controls this workspace ships, and how a sentence names them.
 *
 * Ordered so the more specific pattern wins when a sentence names two — a sentence about
 * `guard-coverage` catching something in `check.mjs` is a guard-coverage finding.
 */
const CONTROLS = [
  // **WHO found it wins over WHAT was involved, and that ordering was backwards.** These are
  // tried in order and the first match takes the sentence, so the generic buckets — "a test
  // fixture", matched on `fixture|tests?/|suite|assertion` — used to swallow sentences whose
  // actual subject was a person: *"found by the user rather than by the tests"* is an
  // attribution TO the user and against the suite, and it was counted as a suite finding.
  //
  // A council auditing this file put it plainly: the top row "is not a record of detections."
  // The human and user buckets therefore run first, before anything named after a tool.
  ['a USER reported it', /\buser (rather|reported|said|found|hit)|in the user's hands|somebody (?:else )?(?:noticed|hit)/i],
  ['a human reading it', /by eye|reading (?:the|it)|read (?:it|the) side by side|noticed while/i],
  ['kill-audit', /kill-audit|mutation-test|mutation/i],
  ['guard-coverage', /guard-coverage/i],
  ['verify-claims', /verify-claims/i],
  ['depth-check', /depth-check/i],
  ['scan-secrets', /scan-secrets|secret scan/i],
  ['nexa-prove', /nexa-prove|prove-invariants|invariants?-held/i],
  ['verify-install', /verify-install|5-verify/i],
  ['card-gate', /card-gate/i],
  ['guard-edit', /guard-edit/i],
  ['check.mjs', /check\.mjs/i],
  ['the council', /council/i],
  ['a test fixture', /fixture|tests?\/|suite|assertion/i],
  ['running the real thing', /running it|running the|ran it|probing|live session|live instance|by installing|printing the values|by measuring|end to end/i],
];

const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
const files = tracked.filter((f) => (f.endsWith('.mjs') || f.endsWith('.md'))
  // Vendored code is somebody else's history, and node_modules is nobody's.
  && !f.startsWith('plugin/scripts/council/') && !f.includes('node_modules')
  // **Narrative files are not attribution.** `CHANGELOG.md` restates findings in summary form and
  // `docs/examples/` contains a council transcript that CRITICISES kill-audit — five sentences
  // about its weaknesses, counted as five findings it made. Both inflate whichever control is
  // being discussed rather than recording what caught anything, which is the opposite of the
  // question this file asks.
  && !/^CHANGELOG\.md$/.test(f) && !f.startsWith('docs/examples/'));

// A sentence that states how something was found.
const SENT = /[^.\n]{0,220}?\b(?:found|caught|discovered|revealed|surfaced)\b[^.\n]{0,220}\./gi;

const rows = new Map(CONTROLS.map(([n]) => [n, []]));
let scanned = 0; let sentences = 0;
for (const rel of files) {
  let body;
  try { body = fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { continue; }
  scanned++;
  for (const m of body.matchAll(SENT)) {
    const s = m[0].replace(/\s+/g, ' ').trim();
    sentences++;
    for (const [name, rx] of CONTROLS) {
      if (rx.test(s)) { rows.get(name).push({ file: rel, text: s.slice(0, 200) }); break; }
    }
  }
}

if (SHOW) {
  const hits = rows.get(SHOW);
  if (!hits) { console.error(`no such control: ${SHOW}`); process.exit(2); }
  console.log(`\n  ${SHOW} — ${hits.length} recorded finding(s)\n`);
  for (const h of hits) console.log(`  ${h.file}\n    ${h.text}\n`);
  process.exit(0);
}

const ranked = [...rows.entries()].sort((a, b) => b[1].length - a[1].length);
if (JSON_OUT) {
  console.log(JSON.stringify({
    scanned, sentences,
    controls: Object.fromEntries(ranked.map(([n, h]) => [n, h.length])),
  }, null, 2));
  process.exit(0);
}

console.log(`\n${'═'.repeat(70)}`);
console.log('  WHICH CONTROL ACTUALLY CAUGHT SOMETHING');
console.log('═'.repeat(70));
console.log(`\n  ${sentences} attribution sentences across ${scanned} tracked files.\n`);
const max = Math.max(1, ...ranked.map(([, h]) => h.length));
for (const [name, hits] of ranked) {
  const bar = '█'.repeat(Math.round((hits.length / max) * 34));
  console.log(`  ${String(hits.length).padStart(3)}  ${name.padEnd(24)} ${bar}`);
}
const silent = ranked.filter(([, h]) => h.length === 0).map(([n]) => n);
if (silent.length) {
  console.log(`\n  Never recorded catching anything: ${silent.join(', ')}`);
}
console.log(`
  ── read this correctly ───────────────────────────────────────────────
  This measures DETECTION, not prevention. A gate that stops a bad card from
  ever existing generates no "found by" sentence, so a low count is not proof
  of low value. What it settles is whether a control has EVER been recorded
  catching anything — and a control with zero, across the whole history, is
  one whose per-session cost deserves a question rather than an assumption.

  nexa-attribution --show=<control>   the sentences behind a row
`);

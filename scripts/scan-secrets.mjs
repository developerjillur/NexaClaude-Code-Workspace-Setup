#!/usr/bin/env node
// Scan the working tree AND the full git history for credentials, before anything is pushed.
//
// Why history and not just the tree: a secret removed in a later commit is still in the repo
// forever. `git rm` is not a delete. Once it is on a remote it is public whatever the repo's
// visibility says, because the fix is a force-push nobody performs in time.
//
// This exists because a council member dissented. Four of five said the biggest remaining
// exposure was the deploy path; one said **"secrets in git history — and your first planned
// action is the one that publishes them."** READINESS item 1 is *push the workspace*, and
// nothing had ever scanned it. The history turned out clean. The absence of the check did not.
//
// Field data it responds to: AI-assisted commits expose secrets at **2× the human rate**
// (3.2% vs 1.5%), and 1,400 scanned vibe-coded apps leaked 400+ secrets.
//
//   node scripts/scan-secrets.mjs            tree + full history
//   node scripts/scan-secrets.mjs --tree     working tree only (fast)
//
// Exit 1 on any unexplained hit. Test fixtures are allowed, by NAME and with a REASON — never
// by making the pattern looser, which is how a scanner stops finding anything.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const treeOnly = process.argv.includes('--tree');

const PATTERNS = [
  ['openai key', /\bsk-[A-Za-z0-9_-]{20,}/],
  ['anthropic key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['twilio sid', /\bAC[0-9a-fA-F]{32}\b/],
  ['twilio api key', /\bSK[0-9a-fA-F]{32}\b/],
  ['github token', /\bgh[pousr]_[A-Za-z0-9]{20,}/],
  ['aws key id', /\bAKIA[0-9A-Z]{16}\b/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./],
  ['oauth code', /\bcode=ac_[A-Za-z0-9._-]{20,}/],
  ['assigned secret', /\b(?:password|passwd|auth[_-]?token|api[_-]?key|secret)\s*[:=]\s*["'][^"'\s]{12,}["']/i],
];

// Known-benign, each with the reason it is benign. A line here is a claim someone can check —
// which is the difference between an allowlist and a blindfold.
const ALLOW = [
  { file: 'tests/council.test.mjs', why: 'fixtures that prove the context scanner refuses secrets' },
  { file: 'tests/hooks.test.mjs', why: 'scrubber fixtures — values are EXAMPLEexample…, made synthetic after this scanner caught the originals, which were copied from a real prompt' },
  { file: 'scripts/council/context.mjs', why: 'the detection patterns themselves' },
  { file: 'scripts/scan-secrets.mjs', why: 'this file' },
  { file: 'scripts/hooks/save-prompt.mjs', why: 'the prompt scrubber patterns' },
  // Nothing under code/ is allowlisted by default. Add your own entries here when a fixture
  // legitimately contains a credential-SHAPED string — and write down why, because a line here
  // is a claim somebody can check, which is the difference between an allowlist and a blindfold.
  { file: 'code/.env.example', why: 'documents key NAMES with empty values' },
];
const allowed = (f) => ALLOW.find((a) => f.endsWith(a.file));

const git = (c) => {
  try { return execSync(c, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); }
  catch { return ''; }
};

const findings = [];
const scan = (where, file, text) => {
  if (allowed(file)) return;
  for (const [what, re] of PATTERNS) {
    const m = re.exec(text);
    if (m) findings.push({ where, file, what, sample: m[0].slice(0, 28) });
  }
};

// ── working tree ─────────────────────────────────────────────────────────────
console.log('\n── scan-secrets ──\n');
const tracked = git('git ls-files').split('\n').filter(Boolean);
for (const f of tracked) {
  const full = path.join(ROOT, f);
  try {
    if (!fs.statSync(full).isFile() || fs.statSync(full).size > 2_000_000) continue;
    scan('tree', f, fs.readFileSync(full, 'utf8'));
  } catch { /* binary or gone */ }
}
console.log(`  tree     ${tracked.length} tracked files scanned`);

// ── history ──────────────────────────────────────────────────────────────────
//
// **This pass scanned nothing for nine of the ten patterns, and said so in the voice of
// success.** The patterns above are JavaScript regexes and their `.source` was handed to
// `git grep -E`, which is POSIX ERE — and **POSIX ERE has no `\b`.** git's matcher rejected
// every pattern containing one, `git()` swallowed the non-zero exit, and the loop then printed
// `history N commits scanned`. Only `private key block`, the single pattern with no `\b`, was
// ever really searched.
//
// The whole reason this pass exists is the rotated key that still sits in every clone anyone
// made. It had been off since it was written, on macOS git 2.50.
//
// Found by `scripts/kill-audit.mjs`: deleting the history pass outright changed nothing, so a
// fixture was written that commits a secret and then removes it — and that fixture failed
// against the UNMUTATED file. **The mutation did not break the pass; it was already broken,
// and deleting a thing that does nothing is invisible by construction.**
//
// `-P` (PCRE) understands `\b` and is what the tree scan means. Where git was built without
// PCRE, the fallback drops the `\b` anchors instead: that matches MORE, never less, which is
// the only safe direction to be wrong in for a secret scanner.
// Probed rather than assumed: a build without PCRE prints "cannot use Perl-compatible regexes"
// on stderr and exits non-zero, which is indistinguishable from "no match" by exit code alone.
//
// `NEXA_SCAN_NO_PCRE=1` forces the fallback. Not a feature — a seam, because a fallback that
// only runs on machines we do not own is a fallback nobody has ever seen work, and this file
// was broken for exactly that length of time.
const PCRE = process.env.NEXA_SCAN_NO_PCRE === '1' ? false : !/Perl-compatible|not support/i.test(
  execSync('git grep -P -q -e "x" -- . 2>&1; true', { cwd: ROOT, encoding: 'utf8' }),
);

if (!treeOnly) {
  const commits = git('git rev-list --all').split('\n').filter(Boolean);
  for (const [what, re] of PATTERNS) {
    const flag = PCRE ? '-P' : '-E';
    const pattern = PCRE ? re.source : re.source.replace(/\\b/g, '');
    // -I skips binaries. One pass per pattern over every blob in every commit.
    const out = git(`git grep -I -n ${flag} ${JSON.stringify(pattern)} ${commits.join(' ')} -- 2>/dev/null`);
    for (const line of out.split('\n').filter(Boolean)) {
      const m = /^([0-9a-f]{7,40}):([^:]+):/.exec(line);
      if (!m) continue;
      const [, sha, file] = m;
      if (allowed(file)) continue;
      if (findings.some((x) => x.file === file && x.what === what)) continue;
      findings.push({ where: `history ${sha.slice(0, 7)}`, file, what, sample: '' });
    }
  }
  console.log(`  history  ${commits.length} commits scanned`);
}

// ── report ───────────────────────────────────────────────────────────────────
console.log('');
if (!findings.length) {
  console.log(`  ✅ No unexplained credentials.\n`);
  console.log(`  ${ALLOW.length} path(s) are allowlisted, each with a written reason — read them`);
  console.log('  rather than trusting them:\n');
  for (const a of ALLOW) console.log(`    ${a.file.padEnd(34)} ${a.why}`);
  console.log('\n  What this cannot check: a credential in a format nobody has seen, or one that');
  console.log('  looks like ordinary text. A scanner is a floor, never a ceiling.\n');
  process.exit(0);
}

for (const f of findings) {
  console.log(`  ❌ ${f.what} — ${f.file}  (${f.where})${f.sample ? `\n       ${f.sample}…` : ''}`);
}
console.log(`\n  ${findings.length} finding(s).\n`);
console.log('  If it is real: rotate it FIRST, then rewrite history. `git rm` is not a delete,');
console.log('  and a secret that has ever been pushed is public regardless of repo visibility.');
console.log('  If it is a fixture: add it to ALLOW in this file WITH A REASON. Do not loosen');
console.log('  the pattern — that is how a scanner quietly stops finding anything.\n');
process.exit(1);

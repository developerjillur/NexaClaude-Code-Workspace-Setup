#!/usr/bin/env node
// This package must know nothing about the product it was extracted from.
//
//   node scripts/no-product-leakage.mjs           report
//   node scripts/no-product-leakage.mjs --json    machine-readable
//
// Exit 0 = nothing from the original project is left. Exit 1 = something is.
//
// ── Why ──────────────────────────────────────────────────────────────────────
//
// This workspace was extracted from a real product, and the extraction leaked. The CI named
// one private repository in **three jobs**, with hardcoded `code/src`, `code/tools`,
// `code/server.js` — so a stranger cloning it got three jobs that could only ever fail. The
// secret scanner allowlisted a file path that exists in nobody else's repo. Two skills taught
// real lessons in one vendor's vocabulary. A plugin was declared because *that* product needed
// it.
//
// None of that is a security problem. It is an **adoptability** problem, and it is invisible
// to the person who wrote it, because to them every one of those names reads as normal.
//
// So it is a check rather than a memory. The list below is the vocabulary of the original
// project; add your own when you fork this for something else, and delete the ones that stop
// being true.
//
// **What this cannot do:** it matches words. A leak that uses none of them — a hardcoded port,
// a magic number, an assumption about directory layout — walks straight past. This is a floor.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const JSON_OUT = process.argv.includes('--json');

// Names belonging to the project this was extracted from. Each is a word that should never
// appear in a package meant for anyone else's codebase.
const FORBIDDEN = [
  [/\bnexacall\b/i, 'the original product'],
  [/\bnexaconnect\b/i, 'the original deploy host'],
  [/realtime-codex-calling-agent|codex-cli-calling-agent/i, 'the original private repository'],
  [/\bgas safe\b/i, 'a domain term from the original product'],
  [/heating engineer/i, 'the original product\'s customer'],
  [/twilio-developer-kit|hostinger/i, 'a plugin declared for the original stack'],
  [/TWILIO_ALLOWED_CALLERS|TWILIO_AUTH_TOKEN\s*=\s*[A-Za-z0-9]/, 'an env var from the original product'],
];

// Where a forbidden word is legitimate.
//
// `scan-secrets` and `save-prompt` recognise Twilio credential SHAPES (`AC…`, `SK…`), and so
// they should — those are standard formats any project can leak, exactly like `sk-` and
// `AKIA`. Removing them would make the scanner worse for everyone in order to remove a word.
// That is the difference between a product reference and a credential format.
const ALLOWED = [
  { file: 'scripts/no-product-leakage.mjs', why: 'this file lists the words' },
  { file: 'scripts/scan-secrets.mjs', why: 'Twilio credential FORMATS — standard shapes, not a product dependency' },
  { file: 'scripts/hooks/save-prompt.mjs', why: 'the same formats, for redaction' },
  { file: 'docs/DECISIONS.md', why: 'the historical record; it may name where a lesson came from' },
  { file: 'docs/examples/council-run.md', why: 'a verbatim transcript, kept as an example' },
];

const SKIP_DIRS = new Set(['.git', 'node_modules', '.council-src', '.council']);

const files = [];
(function walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('._')) continue;
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p); continue; }
    if (!/\.(mjs|js|json|md|ya?ml|sh|txt)$/.test(e.name)) continue;
    files.push(p);
  }
})(ROOT);

const findings = [];
for (const f of files) {
  const rel = path.relative(ROOT, f);
  if (ALLOWED.some((a) => rel === a.file)) continue;
  let body;
  try {
    if (fs.statSync(f).size > 4_000_000) continue;
    body = fs.readFileSync(f, 'utf8');
  } catch { continue; }
  for (const [re, why] of FORBIDDEN) {
    const m = re.exec(body);
    if (!m) continue;
    const line = body.slice(0, m.index).split('\n').length;
    findings.push({ file: rel, line, match: m[0], why });
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify({ scanned: files.length, findings }, null, 2));
  process.exit(findings.length ? 1 : 0);
}

console.log('\n── no-product-leakage ──\n');
if (!findings.length) {
  console.log(`  ✅ ${files.length} files, nothing from the original project.\n`);
  console.log('  A floor, not a ceiling: this matches WORDS. A leaked assumption about');
  console.log('  directory layout, a hardcoded port, or a magic number walks straight past.\n');
  process.exit(0);
}

for (const f of findings) {
  console.log(`  ❌ ${f.file}:${f.line}  "${f.match}"\n       ${f.why}`);
}
console.log(`\n  ${findings.length} reference${findings.length === 1 ? '' : 's'} to the project this was extracted from.`);
console.log('  This package is meant to be installed into somebody else\'s repo, and every one');
console.log('  of these is a name that means nothing there.\n');
process.exit(1);

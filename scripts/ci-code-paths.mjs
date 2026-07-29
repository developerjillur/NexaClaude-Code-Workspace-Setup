#!/usr/bin/env node
// Where is the product code, and is it actually here?
//
//   node scripts/ci-code-paths.mjs            human-readable
//   node scripts/ci-code-paths.mjs --github   writes present= and paths= to $GITHUB_OUTPUT
//
// Exit 0 = the answer is known (code present, or legitimately absent).
// Exit 1 = code was CONFIGURED and is not there — inspection could not complete.
//
// ── Why this exists ──────────────────────────────────────────────────────────
//
// The CI used to name a private repository in three places, with hardcoded `code/src`,
// `code/tools`, `code/server.js` paths. That made this workspace un-adoptable — a stranger
// cloning it got three jobs that could only ever fail — and it leaked the product into a
// package that is supposed to know nothing about it.
//
// It also had the bug this workspace exists to prevent: **grep over a missing directory exits
// 2, which read as "no matches found"**, so the hygiene job went green having scanned nothing.
//
// So there are three states here and the third must never be confused with the first:
//
//   present   — codeDirs resolve to something real. Run everything.
//   absent    — nothing configured beyond the default, and nothing there. That is a
//               workspace-only checkout, which is a legitimate way to use this repo.
//   MISSING   — code was configured (CODE_REPO set, or codeDirs names something other than
//               the default) and is not on disk. **Refuse.** A checkout that silently failed
//               is the case that produced a green tick for a check that never ran.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const GITHUB = process.argv.includes('--github');

const cfg = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'workspace.config.json'), 'utf8')); }
  catch { return {}; }
})();

const dirs = Array.isArray(cfg.codeDirs) && cfg.codeDirs.length ? cfg.codeDirs : ['code'];
const configured = process.env.CODE_REPO || JSON.stringify(dirs) !== JSON.stringify(['code']);

const present = dirs
  .map((d) => path.resolve(ROOT, d))
  .filter((p) => { try { return fs.existsSync(p); } catch { return false; } })
  // An empty `code/` directory is not code. The install instructions create it as a symlink,
  // and a dangling symlink resolves to "exists" for the parent but holds nothing.
  .filter((p) => { try { return !fs.statSync(p).isDirectory() || fs.readdirSync(p).length > 0; } catch { return false; } });

// depthCheckPaths narrows what the stub scanner reads; empty means "everything under codeDirs".
const scan = (Array.isArray(cfg.depthCheckPaths) && cfg.depthCheckPaths.length
  ? cfg.depthCheckPaths.map((d) => path.resolve(ROOT, d)).filter((p) => fs.existsSync(p))
  : present);

const rel = (p) => path.relative(ROOT, p) || '.';

if (!present.length) {
  if (configured) {
    console.error('::error::product code is configured but not present.');
    console.error(`  codeDirs: ${dirs.join(', ')}`);
    console.error(process.env.CODE_REPO
      ? '  CODE_REPO is set, so the checkout was expected to provide it — it did not.'
      : '  workspace.config.json names directories that are not in this checkout.');
    console.error('  Refusing rather than skipping: a job that scans nothing and goes green is');
    console.error('  worse than one that fails, because everyone believes it ran.');
    process.exit(1);
  }
  console.log('no product code in this checkout — workspace-only, which is a supported setup');
  if (GITHUB && process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, 'present=false\npaths=\nscan=\n');
  }
  process.exit(0);
}

console.log(`product code: ${present.map(rel).join(' ')}`);
if (scan.length !== present.length) console.log(`depth-check scans: ${scan.map(rel).join(' ')}`);
if (GITHUB && process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT,
    `present=true\npaths=${present.map(rel).join(' ')}\nscan=${scan.map(rel).join(' ')}\n`);
}

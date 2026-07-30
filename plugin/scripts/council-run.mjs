#!/usr/bin/env node
// Run the shared council so that its output lands in ~/.nexa, not in your repository.
//
// ── the defect this exists to fix ───────────────────────────────────────────
//
// `council.mjs` does `const ROOT = process.cwd()` and writes every run to
// `<ROOT>/.council/runs/`. So running it from a project drops a `.council/` directory into that
// project — deliberations, in the tree, exactly what card 003 removed everything else from.
//
// **And the shipped `/council` command claimed otherwise.** It told users runs were at
// `~/.nexa/council-runs/<slug>.md`, which was true of nothing. That is the `verify-claims`
// failure shape — a plausible path nobody opened — written by the same hand that added the check
// for it.
//
// The council is a dependency, so the fix is not to patch it: it is to run it **from** the
// project's own directory in ~/.nexa. Then `ROOT` is that directory and `.council/runs/` lands
// inside it, with no change upstream and nothing to re-apply when the clone updates.
//
// ── the part that makes that safe ───────────────────────────────────────────
//
// Changing the working directory would break every relative path the user typed — `--context
// src/a.js` is relative to where they are, not to ~/.nexa. So each argument that names something
// on disk **relative to the real cwd** is rewritten to an absolute path first.
//
// Only arguments that actually exist are touched. A question containing a word that happens to
// look like a filename is left alone, because it will not resolve to a file — and a question is
// the one argument that must never be silently altered.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { councilDir, projectRootFor, stateRoot } from './hooks/roots.mjs';

// Ships inside the plugin, so a missing script is a packaging defect rather than something the
// user forgot to fetch — and the message says so instead of handing them a command to run.
const dir = councilDir();
const script = path.join(dir, 'council.mjs');
if (!fs.existsSync(script)) {
  console.error(`the council is missing from this plugin at ${dir} — reinstall, or report it.`);
  process.exit(1);
}

const { root: ROOT, trusted } = projectRootFor(import.meta.url);
const out = trusted ? stateRoot(ROOT) : null;

// ── run from the PROJECT, then relocate the output ─────────────────────────
//
// **`council.mjs` uses `process.cwd()` as two different things**: the directory it writes
// `.council/runs/` into, and the containment boundary for `--context`. Running it from the
// state directory to get the first silently destroyed the second — every context file in the
// user's repository resolved *outside the workspace* and was refused.
//
// Observed, not theorised: a real review of two cards and three source files came back with
// **"No context was passed. Every answer below is reasoning about code the members could not
// read."** Four models spent minutes producing confident, plausible analysis of a codebase none
// of them had seen — the most expensive possible way for a review tool to do nothing, and it
// looked exactly like a successful run.
//
// So the council runs from the project, where containment means what it says, and the runs are
// moved afterwards. Correctness of the review first; tidiness of the output second.
const cwd = trusted ? ROOT : process.cwd();

const args = process.argv.slice(2).map((a) => {
  if (a.startsWith('-')) return a;                 // a flag, never a path
  if (path.isAbsolute(a)) return a;
  const abs = path.resolve(process.cwd(), a);
  return fs.existsSync(abs) ? abs : a;             // only rewrite what genuinely exists
});

const r = spawnSync('node', [script, ...args], { cwd, stdio: 'inherit' });

/** Move this run's output out of the repository, without clobbering anything already there. */
function relocateRuns() {
  if (!out) return null;
  const from = path.join(cwd, '.council', 'runs');
  const to = path.join(out, '.council', 'runs');
  if (!fs.existsSync(from)) return null;
  fs.mkdirSync(to, { recursive: true });
  let moved = 0;
  for (const f of fs.readdirSync(from)) {
    const dest = path.join(to, f);
    if (fs.existsSync(dest)) continue;             // never overwrite an earlier run
    try { fs.renameSync(path.join(from, f), dest); moved++; }
    catch { try { fs.cpSync(path.join(from, f), dest); moved++; } catch { /* leave it */ } }
  }
  // Only remove what we emptied — a `.council/` holding a BRIEF.md or a roster is the user's.
  try { if (!fs.readdirSync(from).length) fs.rmdirSync(from); } catch { /* not empty */ }
  try { if (!fs.readdirSync(path.dirname(from)).length) fs.rmdirSync(path.dirname(from)); } catch { /* not empty */ }
  return moved ? to : null;
}

const landed = relocateRuns();
if (landed) console.log(`\n  runs: ${landed}`);
process.exit(r.status ?? 1);

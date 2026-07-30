#!/usr/bin/env node
// Move a pre-2026-07-30 in-repo scaffold into ~/.nexa/projects/<id>/.
//
//   nexa-migrate            report what would move and what would not — changes NOTHING
//   nexa-migrate --apply    do it
//
// **Dry run by default, and this is deliberately not a flag on `nexa-remove`.** Migration and
// removal move the same files and differ only in whether they are kept, so sharing a CLI would
// put "tidy this up" one typo away from "delete this". They are separate commands for the same
// reason `--allow-uncontained` is a separate flag from `--local-roster`.
//
// ── the rule ────────────────────────────────────────────────────────────────
//
// **A file git tracks is yours and is never moved.** A board is meant to be reviewed alongside
// the diff and `DECISIONS.md` is meant to travel with a clone, so the user who committed them
// did the right thing — and is exactly the user with the most to lose if this gets it wrong.
// A repository git cannot answer for is treated as tracked, which is the safe direction: the
// cost of not moving something is clutter, and the cost of moving it is loss.

import fs from 'node:fs';
import path from 'node:path';
import { migratable, migrateIntoHome } from './bootstrap.mjs';
import { projectRootFor, stateRoot, isAdoptedWorkspace } from './hooks/roots.mjs';

const { root: ROOT, trusted } = projectRootFor(import.meta.url);
const APPLY = process.argv.includes('--apply');

if (!trusted) {
  console.error('no project found — run this inside a repository, or set CLAUDE_PROJECT_DIR.');
  process.exit(2);
}
if (!isAdoptedWorkspace(ROOT)) {
  console.error(`${ROOT} has not been adopted — nothing to migrate.`);
  process.exit(2);
}

const home = stateRoot(ROOT);
console.log(`\n  repository       ${ROOT}`);
console.log(`  project directory ${home}\n`);

const CANDIDATES = ['board', 'docs', 'templates', 'workspace.config.json', '.council'];

if (!APPLY) {
  let anything = false;
  for (const rel of CANDIDATES) {
    if (!fs.existsSync(path.join(ROOT, rel))) continue;
    anything = true;
    const free = migratable(ROOT, rel);
    console.log(free
      ? `  →  ${rel}  would move (git does not track it)`
      : `  ·  ${rel}  STAYS — git tracks it, so it is yours`);
  }
  if (!anything) console.log('  nothing left in the repository to migrate.');
  console.log('\n  This was a dry run. Nothing changed. Add --apply to do it.\n');
  process.exit(0);
}

const { moved, kept, reason } = migrateIntoHome(ROOT);
if (reason) { console.error(`  ${reason}`); process.exit(1); }
for (const m of moved) console.log(`  ✅ moved   ${m}`);
for (const k of kept) console.log(`  ·  kept    ${k.rel} — ${k.why}`);
console.log(moved.length
  ? `\n  ${moved.length} moved, ${kept.length} left in place.\n`
  : `\n  Nothing moved. ${kept.length} left in place.\n`);

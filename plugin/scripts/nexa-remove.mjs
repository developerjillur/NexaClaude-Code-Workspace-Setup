#!/usr/bin/env node
// Undo the zero-command bootstrap, exactly and only.
//
//   node scripts/nexa-remove.mjs [--dry-run]
//
// Deletes precisely what the manifest recorded and nothing else — a file you edited afterwards
// is still yours, and a file you created that we did not is never touched. Then writes a
// tombstone OUTSIDE the repository, because the next session must be able to tell "removed
// this deliberately" from "never had one", and no in-repo state can carry that distinction.

import path from 'node:path';
import { projectRootFor } from './hooks/roots.mjs';
import { remove, manifestPath, tombstonePath } from './bootstrap.mjs';

const { root, trusted } = projectRootFor(import.meta.url);
if (!trusted) {
  console.error('Cannot tell which project this is — nothing removed. Set CLAUDE_PROJECT_DIR.');
  process.exit(1);
}

if (process.argv.includes('--dry-run')) {
  const fs = await import('node:fs');
  const mf = manifestPath(root);
  if (!fs.existsSync(mf)) { console.log('Nothing was recorded for this repository.'); process.exit(0); }
  const { created = [] } = JSON.parse(fs.readFileSync(mf, 'utf8'));
  console.log(`Would remove ${created.length} file(s):`);
  for (const f of created) console.log(`  ${path.relative(root, f)}`);
  console.log(`\nAnd write a tombstone at ${tombstonePath(root)} so it is not recreated.`);
  process.exit(0);
}

const { removed, reason } = remove(root);
console.log(`${reason} — ${removed.length} file(s).`);
for (const f of removed) console.log(`  ${path.relative(root, f)}`);

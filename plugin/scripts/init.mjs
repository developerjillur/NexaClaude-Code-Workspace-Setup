#!/usr/bin/env node
// Adopt this repository now, instead of waiting for the next session to start.
//
//   nexa-init            what would be written, and where — changes nothing
//   nexa-init --apply    do it
//
// ── why this exists ─────────────────────────────────────────────────────────
//
// Adoption ran only from the `SessionStart` hook, which is right for the zero-command design and
// wrong for every other moment. `git init` a directory mid-session and nothing happens; the
// workspace does not exist until Claude Code is restarted, and nothing on screen says so.
//
// Observed twice in one sitting: a user ran `nexa-autopilot on` in a fresh directory and got
// "no project found", because the directory was not a repository and had never been adopted.
// The refusal was correct and the path forward was invisible — the only cure was to restart,
// which is not a thing anybody guesses.
//
// Same `decide()` ladder as the hook, so this cannot adopt anything the hook would refuse: not a
// git repository, not the repository root, a `.git` file, `$HOME`, a temp directory, a tombstone,
// an unreadable config, or somebody else's `board/`. It is a different trigger, not a different
// policy — and dry-run by default, because a command that writes into your repository on sight
// is the thing this whole workspace was reorganised to stop doing.

import fs from 'node:fs';
import path from 'node:path';
import { decide, bootstrap, detectCodeDirs } from './bootstrap.mjs';
import { PLUGIN_ROOT, stateRoot, isAdoptedWorkspace } from './hooks/roots.mjs';

const APPLY = process.argv.includes('--apply');
const ROOT = process.env.CLAUDE_PROJECT_DIR
  ? path.resolve(process.env.CLAUDE_PROJECT_DIR)
  : process.cwd();

console.log(`\n  repository  ${ROOT}`);

if (isAdoptedWorkspace(ROOT)) {
  console.log(`  project     ${stateRoot(ROOT)}`);
  console.log('\n  Already adopted — nothing to do.\n');
  process.exit(0);
}

const verdict = decide(ROOT, {});
if (!verdict.act) {
  console.error(`\n  ✋ ${verdict.reason}\n`);
  console.error('  Adoption is refused here for the same reason the session hook would refuse it.');
  if (verdict.reason === 'not a git repository') {
    console.error('  A workspace tracks work against history, so it needs one: `git init`.\n');
  } else console.error('');
  process.exit(1);
}

if (!APPLY) {
  console.log(`  project     ${stateRoot(ROOT)}  (would be created)`);
  console.log(`  codeDirs    ${JSON.stringify(detectCodeDirs(ROOT))}  — detected from this repo\n`);
  console.log('  Into your repository:  .nexa, AGENTS.md, CLAUDE.md, .claudeignore, .claude/settings.json');
  console.log('  Everything else — board, docs, templates, config — goes to the project directory.\n');
  console.log('  This was a dry run. Nothing changed. Add --apply to adopt.\n');
  process.exit(0);
}

const res = bootstrap(ROOT, path.join(PLUGIN_ROOT, 'templates'));
if (!res.act) { console.error(`\n  ✋ ${res.reason}\n`); process.exit(1); }

const home = stateRoot(ROOT);
console.log(`  project     ${home}\n`);
for (const c of res.created ?? []) {
  const f = typeof c === 'string' ? c : c.file;
  console.log(`  ✅ ${f.startsWith(ROOT) ? path.relative(ROOT, f) : f}`);
}
console.log(`\n  ${(res.created ?? []).length} created. Undo all of it with nexa-remove.\n`);

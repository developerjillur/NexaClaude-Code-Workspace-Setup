#!/usr/bin/env node
// PostToolUse hook on Write|Edit. Runs the mechanical checks immediately after a change
// rather than at review time, because a defect found four edits later costs four times as
// much to place.
//
// Never blocks — PostToolUse is after the fact. It reports, and the report goes to the model.

import path from 'node:path';
import { projectRoot } from './roots.mjs';
import { execSync } from 'node:child_process';

// Two roots — see roots.mjs. This one is the PROJECT: board, docs, config, git.
const { root: ROOT } = projectRoot();
let s = ''; process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { s += d; });
process.stdin.on('end', () => {
  const file = (() => { try { return JSON.parse(s)?.tool_input?.file_path ?? ''; } catch { return ''; } })();
  const notes = [];

  // The three defects this project has actually shipped, each cheap to detect on write.
  if (/\.(mjs|js|ts)$/.test(file) && !/\/(test|scripts)\//.test(file)) {
    try {
      const src = require('node:fs').readFileSync(file, 'utf8');
      if (/\bTODO\b|\bFIXME\b/.test(src)) notes.push('TODO/FIXME present — unfinished work claiming to be finished (definition-of-done)');
      if (/^\s*\/\/\s*(const|let|function|if|return|await|import)\b/m.test(src))
        notes.push('commented-out code — delete it; git remembers');
      if (/console\.log\(/.test(src) && /\/src\//.test(file))
        notes.push('console.log in src/ — the audio path must not do I/O it did not intend');
    } catch { /* file gone or unreadable */ }
  }

  try { execSync(`node ${path.join(ROOT, 'scripts', 'check.mjs')}`, { stdio: 'pipe' }); }
  catch { notes.push('scripts/check.mjs is failing — run it and fix before moving the card'); }

  if (notes.length) console.log(`Post-edit notes:\n- ${notes.join('\n- ')}`);
});

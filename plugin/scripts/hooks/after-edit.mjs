#!/usr/bin/env node
// PostToolUse hook on Write|Edit. Runs the mechanical checks immediately after a change
// rather than at review time, because a defect found four edits later costs four times as
// much to place.
//
// Never blocks — PostToolUse is after the fact. It reports, and the report goes to the model.
//
// ── everything in this file was dead or lying, and both halves failed silently ──
//
// 1. `require('node:fs')` in a `.mjs` file. `require` is not defined in ESM, so the line threw
//    a ReferenceError on every single edit — caught by the bare `catch {}` two lines down and
//    discarded. **The three content checks had never run once.** A `catch` that swallows the
//    error which proves the code cannot work is the most expensive kind of empty catch, and
//    `depth-check` lists "an empty catch" as one of its six stub shapes — this file shipped one.
//
// 2. `execSync(\`node ${path.join(ROOT, 'scripts', 'check.mjs')}\`)` interpolated an unquoted
//    path into a shell string. On a checkout at `/Volumes/T7 Shield/...` the shell split it at
//    the space, `node` was handed `/Volumes/T7`, and it threw — so the hook appended
//    "check.mjs is failing" after EVERY edit, permanently, while `check.mjs` itself exited 0.
//    A feedback channel that cries wolf on every edit is one the reader learns to ignore, which
//    costs more than having no channel at all.
//
// 3. The exclusion `!/\/(test|scripts)\//` skips this repository's entire product — every
//    control lives under `scripts/`. Fixing (1) without this would have resurrected three
//    checks scoped to nothing. It is meant to skip the ADOPTER's test files, so it is anchored
//    to test directories only.

import fs from 'node:fs';
import path from 'node:path';
import { projectRoot, PLUGIN_ROOT } from './roots.mjs';
import { execFileSync } from 'node:child_process';

// Two roots — see roots.mjs. This one is the PROJECT: board, docs, config, git.
const { root: ROOT } = projectRoot();

// The bundled gate, resolved from the plugin first and the repository second — the same lookup
// `check.mjs` uses. `path.join(ROOT, 'scripts', …)` is the adopter's project, which has no
// `scripts/` directory at all.
const checkScript = [path.join(PLUGIN_ROOT, 'scripts', 'check.mjs'),
  path.join(ROOT, 'scripts', 'check.mjs')].find((p) => fs.existsSync(p));

let s = ''; process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { s += d; });
process.stdin.on('end', () => {
  const file = (() => { try { return JSON.parse(s)?.tool_input?.file_path ?? ''; } catch { return ''; } })();
  const notes = [];

  // The three defects this project has actually shipped, each cheap to detect on write.
  if (/\.(mjs|cjs|jsx?|tsx?|mts|cts)$/.test(file) && !/(^|\/)(tests?|__tests__)\//.test(file)) {
    try {
      const src = fs.readFileSync(file, 'utf8');
      if (/\bTODO\b|\bFIXME\b/.test(src)) notes.push('TODO/FIXME present — unfinished work claiming to be finished (definition-of-done)');
      if (/^\s*\/\/\s*(const|let|function|if|return|await|import)\b/m.test(src))
        notes.push('commented-out code — delete it; git remembers');
      if (/console\.log\(/.test(src) && /\/src\//.test(file))
        notes.push('console.log in src/ — reaching for stdout in a library path is rarely intended');
    } catch { /* the file was deleted or renamed between the write and this hook */ }
  }

  // **execFileSync with an argument array**, so a path containing a space is one argument
  // rather than two. And only when the gate is actually there: reporting "check.mjs is
  // failing" because it could not be found is the same false alarm in a different costume.
  if (checkScript) {
    try { execFileSync('node', [checkScript], { cwd: ROOT, stdio: 'pipe' }); }
    catch { notes.push('check.mjs is failing — run it and fix before moving the card'); }
  }

  if (notes.length) console.log(`Post-edit notes:\n- ${notes.join('\n- ')}`);
});

// Does guard-edit still block a path with a space in it, and does it still catch a real
// product-code write?
//
//   node tests/guard-paths-with-spaces.mjs
//
// ── Why a space ──────────────────────────────────────────────────────────────
//
// The drive this workspace was built on is called "T7 Shield". Every write pattern in
// guard-edit used `[^\s"'|;&]+`, which stops at the first space — so
//
//   cp /tmp/x.js "/Volumes/T7 Shield/…/src/tools.js"
//
// matched nothing at all, and the write to product code was allowed. **Not a false positive:
// a hole, in the one direction that matters.**
//
// ── Why this file builds its own fixtures ────────────────────────────────────
//
// The first version hardcoded four absolute paths from the machine it was written on —
// including the hook it invoked. Copied into another workspace it therefore tested *that other
// workspace's guard*, against *that other workspace's config*, and reported 6/6 while never
// once running the guard sitting beside it.
//
// **A test that passes without touching the thing it names is worse than a missing test**, and
// it passed that way for a day. Everything below is built at run time, under a directory whose
// name contains a space, against THIS workspace's guard and THIS workspace's config.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const HOOK = path.join(ROOT, 'scripts', 'hooks', 'guard-edit.mjs');

// A scratch tree whose name contains a space, because that is the whole point.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'guard spaces '));
const CODE = path.join(TMP, 'my app');       // configured product code
const OTHER = path.join(TMP, 'not my app');  // a sibling that must stay editable
fs.mkdirSync(path.join(CODE, 'src'), { recursive: true });
fs.mkdirSync(path.join(OTHER, 'docs'), { recursive: true });
fs.writeFileSync(path.join(CODE, 'src', 'tools.js'), '// product\n');
fs.writeFileSync(path.join(CODE, 'server.js'), '// product\n');
fs.writeFileSync(path.join(OTHER, 'docs', 'notes.md'), '# notes\n');

// Point the guard at it, and put the original config back at the end.
const CFG = path.join(ROOT, 'workspace.config.json');
const savedCfg = fs.readFileSync(CFG, 'utf8');
fs.writeFileSync(CFG, JSON.stringify({ ...JSON.parse(savedCfg), codeDirs: [CODE] }, null, 2) + '\n');

// A card in 3-build legitimately PERMITS product-code edits — that is the whole design. So a
// workspace with work in flight would see every MUST BLOCK case pass through, and the test
// would report a hole in the guard that is actually the guard working.
//
// Moved aside for the duration and put back in the finally. **This failed for a day in the
// workspace that had a card in build and passed in the one that did not**, which is exactly
// the shape of a test that measures its environment rather than its subject.
const BUILD = path.join(ROOT, 'board', '3-build');
const parked = [];
if (fs.existsSync(BUILD)) {
  for (const f of fs.readdirSync(BUILD)) {
    if (!f.endsWith('.md') || f.startsWith('._')) continue;
    // Park it BESIDE itself, never in the temp dir: os.tmpdir() is often a different
    // volume, and rename across volumes throws EXDEV. The first version did exactly that
    // and crashed before restoring — leaving a card outside the board is a worse outcome
    // than any test failure it could have reported.
    const from = path.join(BUILD, f), to = path.join(BUILD, `.parked-${f}.bak`);
    fs.renameSync(from, to);
    parked.push([to, from]);
  }
}

// A `finally` does not run when the process dies mid-way, and an earlier version of this file
// crashed on EXDEV while the config was still pointed at a temp directory. The workspace was
// left with codeDirs naming a path that no longer existed — **so the guard protected nothing,
// and 21 assertions in the neighbouring suite failed for a reason that had nothing to do with
// them.** A test that can leave the workspace disarmed is worse than the bug it hunts.
const restoreAll = () => {
  try { fs.writeFileSync(CFG, savedCfg); } catch { /* nothing else to try */ }
  for (const [from, to] of parked) { try { fs.renameSync(from, to); } catch { /* already back */ } }
};
process.on('exit', restoreAll);
process.on('uncaughtException', (e) => { restoreAll(); console.error(e); process.exit(1); });

const GT = String.fromCharCode(62);
const fire = (payload) => spawnSync('node', [HOOK], {
  input: JSON.stringify(payload), encoding: 'utf8',
  env: { ...process.env, NEXA_NO_CARD: '', NEXA_ALLOW_DISCARD: '' },
});

const cases = [
  {
    name: 'MUST ALLOW — a quoted path with a space, OUTSIDE the configured code',
    why: 'a sibling directory is not product code, and refusing it is how a guard gets switched off',
    expect: 'allow',
    payload: { tool_name: 'Bash', cwd: CODE,
      tool_input: { command: `cp "${OTHER}/docs/notes.md" "${OTHER}/docs/copy.md"` } },
  },
  {
    name: 'MUST ALLOW — a redirect into that sibling, path has a space',
    expect: 'allow',
    payload: { tool_name: 'Bash', cwd: CODE,
      tool_input: { command: `printf x ${GT}${GT} "${OTHER}/docs/notes.md"` } },
  },
  {
    name: 'MUST BLOCK — a quoted PRODUCT path with a space (the fix must not open a hole)',
    why: 'if the quoted branch swallowed too much, this write would escape',
    expect: 'block',
    payload: { tool_name: 'Bash', cwd: OTHER,
      tool_input: { command: `cp /tmp/x.js "${CODE}/src/tools.js"` } },
  },
  {
    name: 'MUST BLOCK — a bare product path, no quotes (the original guarantee)',
    expect: 'block',
    payload: { tool_name: 'Bash', cwd: CODE,
      tool_input: { command: `printf x ${GT} src/tools.js` } },
  },
  {
    name: 'MUST BLOCK — tee into product code, quoted, with a space',
    why: "tee's destination is its FIRST argument, not its last",
    expect: 'block',
    payload: { tool_name: 'Bash', cwd: OTHER,
      tool_input: { command: `echo x | tee "${CODE}/server.js"` } },
  },
  {
    name: 'MUST BLOCK — the Write tool straight at product code',
    expect: 'block',
    payload: { tool_name: 'Write', tool_input: { file_path: `${CODE}/src/tools.js` } },
  },
];

let pass = 0, fail = 0;
try {
  for (const c of cases) {
    const r = fire(c.payload);
    const blocked = r.status === 2;
    const want = c.expect === 'block';
    if (blocked === want) { pass++; console.log(`  ✅ ${c.name}`); }
    else {
      fail++;
      console.log(`  ❌ ${c.name}`);
      console.log(`       expected ${c.expect}, got ${blocked ? 'block' : 'allow'}`);
      if (c.why) console.log(`       ${c.why}`);
      if (r.stderr) console.log(`       ${r.stderr.split('\n')[0].slice(0, 100)}`);
    }
  }
} finally {
  for (const [from, to] of parked) fs.renameSync(from, to);
  fs.writeFileSync(CFG, savedCfg);
  fs.rmSync(TMP, { recursive: true, force: true });
}

console.log(`\n  ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);

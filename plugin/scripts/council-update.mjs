#!/usr/bin/env node
// The council is vendored at scripts/council/. This is how it stops being stale.
//
//   nexa-council-update            what is pinned, and whether upstream has moved
//   nexa-council-update --apply    re-vendor from upstream and repin
//   nexa-council-update --ref <r>  vendor a specific commit or tag
//
// Exit 0 = pinned and current (or offline, which is reported as offline). Exit 1 = behind.
//
// ── why this exists ─────────────────────────────────────────────────────────
//
// A vendored copy of this council went stale twice in one week, and the second time it carried
// a **silent UTF-8 corruption bug**: member output accumulated as raw Buffers, so a 3-byte
// character split across a pipe boundary became U+FFFD. Every council answer longer than one
// pipe buffer was quietly damaged, and every review had gone through it.
//
// That is the argument that kept the council out of the plugin for three redesigns. It is a real
// argument and it is **not an argument against copying** — it is an argument against copying
// without provenance. That copy recorded no commit and no date, so nobody could tell it had been
// wrong for a week by looking.
//
// So: `.vendored-from` records the upstream commit; this reports drift against it; `check.mjs`
// prints it every run. Staleness that announces itself is a different failure from staleness
// that does not.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { councilDir } from './hooks/roots.mjs';

const REPO = 'https://github.com/developerjillur/all-cli-council.git';
const DIR = councilDir();
const PIN = path.join(DIR, '.vendored-from');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const refIdx = args.indexOf('--ref');
const REF = refIdx >= 0 ? args[refIdx + 1] : null;

const ok = (m) => console.log(`  ✅ ${m}`);
const info = (m) => console.log(`  ·  ${m}`);
const bad = (m, why = '') => { console.log(`  ❌ ${m}${why ? `\n       ${why}` : ''}`); process.exitCode = 1; };

let pin = null;
try { pin = JSON.parse(fs.readFileSync(PIN, 'utf8')); } catch { /* not pinned */ }
if (!pin?.commit) {
  bad('scripts/council/.vendored-from is missing or unreadable',
    'the vendored copy has no provenance — re-vendor with --apply');
  if (!APPLY) process.exit(1);
}

console.log(`\n  vendored at ${DIR}`);
if (pin) console.log(`  pinned to   ${pin.commit?.slice(0, 7)}  (${pin.vendored})\n`);

/** Ask the remote for a ref's sha without cloning. Null when offline. */
function upstream(ref) {
  const r = spawnSync('git', ['ls-remote', REPO, ref ?? 'HEAD'], { encoding: 'utf8', timeout: 20000 });
  if (r.status !== 0) return null;
  return (r.stdout || '').trim().split(/\s+/)[0] || null;
}

if (!APPLY) {
  const head = upstream(REF);
  if (!head) { info('could not reach GitHub — offline, or the remote is down. Nothing is claimed.'); process.exit(0); }
  if (head === pin?.commit) ok(`current — upstream HEAD is the pinned commit ${head.slice(0, 7)}`);
  else bad(`behind — upstream is at ${head.slice(0, 7)}, this plugin ships ${pin?.commit?.slice(0, 7)}`,
    'run: nexa-council-update --apply');
  process.exit(process.exitCode ?? 0);
}

// ── re-vendor ───────────────────────────────────────────────────────────────
//
// Clone to a temp directory, copy `scripts/` verbatim, repin. **Verbatim is the whole
// discipline**: the 2026 version rewrote paths for this workspace's layout and the rewriting is
// what broke, three separate ways in one afternoon. Nothing here edits what it copies.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'council-vendor-'));
try {
  const c = spawnSync('git', ['clone', '--quiet', REPO, tmp], { encoding: 'utf8' });
  if (c.status !== 0) { bad('clone failed', (c.stderr || '').trim().split('\n')[0]); process.exit(1); }
  if (REF) {
    const co = spawnSync('git', ['checkout', '--quiet', REF], { cwd: tmp, encoding: 'utf8' });
    if (co.status !== 0) { bad(`could not check out ${REF}`); process.exit(1); }
  }
  const src = path.join(tmp, 'scripts');
  if (!fs.existsSync(path.join(src, 'council.mjs'))) {
    bad('upstream has no scripts/council.mjs', 'the layout changed — vendoring stopped rather than guessing');
    process.exit(1);
  }
  const commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: tmp, encoding: 'utf8' }).stdout.trim();

  fs.rmSync(DIR, { recursive: true, force: true });
  fs.cpSync(src, DIR, { recursive: true });
  // The upstream reading discipline travels with the code, so the skill can point at a real
  // local file instead of a URL nobody opens.
  const doctrine = path.join(tmp, 'skills', 'council', 'SKILL.md');
  if (fs.existsSync(doctrine)) {
    fs.cpSync(doctrine, path.join(path.dirname(path.dirname(DIR)), 'skills', 'council', 'reference.md'));
  }
  const stamp = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(PIN, `${JSON.stringify({
    repo: REPO.replace(/\.git$/, ''), commit, vendored: stamp,
    licence: 'MIT — Copyright (c) 2026 Jillur Rahman; see LICENSE.council at the repo root',
    note: 'Copied verbatim, no path rewriting. Update with: nexa-council-update',
  }, null, 2)}\n`);
  ok(`re-vendored at ${commit.slice(0, 7)} (${stamp})`);
  info('run the suites — a vendored update is a dependency bump and deserves the same gate');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

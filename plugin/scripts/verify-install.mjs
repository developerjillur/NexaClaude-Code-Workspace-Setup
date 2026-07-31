#!/usr/bin/env node
// 5-verify: the acceptance criteria that unit tests cannot reach.
//
// Everything in tests/ exercises the plugin's code. None of it proves that CLAUDE CODE loads
// the plugin, or that installing it leaves a populated repository untouched. Those are the two
// claims a user actually depends on, and they are the two nobody has watched.
//
//   1. --plugin-dir loads it, and the components are really there
//   2. a session in a POPULATED repo writes nothing   (kill-condition 1)
//   3. a session in a CLEAN repo root scaffolds, and says so   (the product)
//   4. the scaffolded repo is then quiet on a second session
//
// Every arm uses an isolated CLAUDE_CONFIG_DIR so nothing touches the real installation.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PLUGIN_ROOT, projectRootFor, stateRoot } from './hooks/roots.mjs';

const PLUGIN = PLUGIN_ROOT;
const { root: REPO } = projectRootFor(import.meta.url);

let pass = 0; let fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
};

// Fixtures may NOT live in a temp directory: the bootstrap refuses those on purpose, so a
// harness built there would prove only that the predicate works. They go in a dedicated
// directory under $HOME — not $HOME itself, which is refused too — and are removed after.
const ARENA = path.join(os.homedir(), `.nexa-verify-${process.pid}`);
fs.mkdirSync(ARENA, { recursive: true });
const trash = [ARENA];
let seq = 0;
function repo({ populate = false } = {}) {
  const d = path.join(ARENA, `repo-${++seq}`);
  fs.mkdirSync(d, { recursive: true });
  trash.push(d);
  execFileSync('git', ['init', '-q'], { cwd: d, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'v@e.rify'], { cwd: d, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'verify'], { cwd: d, stdio: 'ignore' });
  if (populate) {
    fs.mkdirSync(path.join(d, 'src'), { recursive: true });
    fs.writeFileSync(path.join(d, 'src', 'app.js'), 'export const app = 1;\n');
    fs.writeFileSync(path.join(d, 'README.md'), '# somebody else\n');
    fs.writeFileSync(path.join(d, 'board'), 'not a directory, and not ours\n');
    execFileSync('git', ['add', '-A'], { cwd: d, stdio: 'ignore' });
    execFileSync('git', ['commit', '-qm', 'initial'], { cwd: d, stdio: 'ignore' });
  }
  return d;
}

// The first version isolated CLAUDE_CONFIG_DIR so it could not touch the real installation.
// That directory has no credentials, so every session died with "Not logged in" — and the
// harness then reported 5 PASSES, including "git status is unchanged after a session", which
// was true only because no session had run. A harness that reports success when its subject
// never executed is the same defect as a guard that allows when it cannot see. So: the real
// config is used (nothing is installed — --plugin-dir is session-scoped and the repos are
// throwaway), and a session that did not run is fatal to the whole report rather than a
// finding within it.
/**
 * Can this session's output be believed at all?
 *
 * The first run of this harness isolated CLAUDE_CONFIG_DIR, which has no credentials, so every
 * session died with "Not logged in" — and the harness reported five PASSES, including "git
 * status is unchanged after a session", true only because no session had run. **A harness that
 * reports success when its subject never executed is the defect it exists to find.**
 *
 * @returns {boolean} false when nothing below can be believed
 */
export function sessionUsable({ out = '', timedOut = false } = {}) {
  if (timedOut) return false;
  return !/Not logged in|Please run \/login|Invalid API key|Credit balance/i.test(out);
}

function session(cwd, prompt) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-data-'));
  trash.push(data);
  const r = spawnSync('claude', ['-p', prompt, '--plugin-dir', PLUGIN], {
    cwd, encoding: 'utf8', timeout: 240000,
    env: { ...process.env, CLAUDE_PLUGIN_DATA: data },
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (!sessionUsable({ out, timedOut: r.error?.code === 'ETIMEDOUT' })) {
    console.log(`\n  INCONCLUSIVE — the session did not run: ${out.trim().slice(0, 120)}`);
    console.log('  Nothing below can be believed, so nothing below is reported.');
    for (const d of trash) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* gone */ } }
    process.exit(2);
  }
  return { out, status: r.status, timedOut: false };
}

// Other installed plugins write into the working tree too — `.continuum/` appeared in the
// first run of this harness. That is a real finding about THIS MACHINE, not about
// nexa-workspace, and folding it in would have made our own kill-condition look violated by
// somebody else's behaviour. Reported separately, excluded from our assertion.
const FOREIGN = /^\?\? \.(continuum|DS_Store)/;
const porcelain = (d) =>
  execFileSync('git', ['status', '--porcelain'], { cwd: d, encoding: 'utf8' })
    .trim().split('\n').filter((l) => l && !FOREIGN.test(l)).join('\n');
const foreignWrites = (d) =>
  execFileSync('git', ['status', '--porcelain'], { cwd: d, encoding: 'utf8' })
    .trim().split('\n').filter((l) => FOREIGN.test(l));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
console.log('═'.repeat(72));
console.log('  5-VERIFY — the claims only a real session can settle');
console.log('═'.repeat(72));

// 1 + 2 · a populated repository must be left alone
console.log('\n▸ a populated repository someone else owns');
{
  const d = repo({ populate: true });
  const before = porcelain(d);
  const s = session(d, 'List the skills you can see from the nexa-workspace plugin. Do not create any files.');
  check('the session ran at all', !s.timedOut && s.status === 0, `status ${s.status}`);
  check('KILL-CONDITION 1: git status is unchanged after a session',
    porcelain(d) === before, `was "${before}" now "${porcelain(d)}"`);
  check('...and the pre-existing board file was not touched',
    fs.readFileSync(path.join(d, 'board'), 'utf8') === 'not a directory, and not ours\n');
  const foreign = foreignWrites(d);
  if (foreign.length) console.log(`  ℹ other plugins wrote here: ${foreign.join(', ')} — not ours, reported not asserted`);
  check('the plugin loaded — its skills are visible to the model',
    /session-start|reuse-first|measure-dont-claim|spec-first/i.test(s.out), s.out.slice(0, 200));
}

// 3 · a clean repository root is the only case that writes
console.log('\n▸ a clean repository root');
{
  const d = repo();
  const s = session(d, 'Quote back, verbatim, any workspace-state notice you were given at the start of this session. If there was none, say NONE.');
  check('the session ran', !s.timedOut, `status ${s.status}`);
  // ── these two asserted the pre-1.6.0 layout, and failed on a CORRECT install ──
  //
  // Until 2026-07-30 the scaffold wrote `board/` and `workspace.config.json` into the user's
  // repository. Card 003 moved them to `~/.nexa/projects/<id>/` (`bootstrap.mjs:513-516`) and
  // left this file checking the repository for them, so `nexa-verify-install` reported 2
  // failures out of 15 against an installation with nothing wrong with it.
  //
  // A verifier that cries wolf is the same defect as a gate that passes silently: both teach
  // the reader that the output is not worth reading. So the assertion follows the layout —
  // five entries in the repo, everything else in the project's state directory.
  const stages = ['0-discovery', '3-build', '7-operate'];
  const home = stateRoot(d);
  check('the board was scaffolded into ~/.nexa/projects/<id>/',
    !!home && stages.every((x) => fs.existsSync(path.join(home, 'board', x))),
    `looked in ${home}`);
  check('...and the repository did NOT receive a board',
    !fs.existsSync(path.join(d, 'board')));
  check('created config.json in the state directory',
    !!home && fs.existsSync(path.join(home, 'config.json')), `looked in ${home}`);
  for (const f of ['.nexa', 'AGENTS.md', 'CLAUDE.md', '.claudeignore',
    path.join('.claude', 'settings.json')]) {
    check(`created ${f}`, fs.existsSync(path.join(d, f)));
  }
  check('the permission rules landed in settings',
    fs.existsSync(path.join(d, '.claude', 'settings.json'))
    && JSON.parse(fs.readFileSync(path.join(d, '.claude', 'settings.json'), 'utf8'))
      .permissions?.deny?.length > 0);
  check('and it announced what it created rather than doing it silently',
    /set up|created|nexa-workspace:remove/i.test(s.out), s.out.slice(0, 300));

  // 4 · quiet the second time
  const after = porcelain(d);
  const s2 = session(d, 'Say READY and nothing else.');
  check('a second session changes nothing further', porcelain(d) === after);
  check('...and does not re-announce the scaffold', !/was just set up/i.test(s2.out));
}

for (const d of trash) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* gone */ } }

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
}

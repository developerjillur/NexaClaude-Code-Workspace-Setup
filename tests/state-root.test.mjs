#!/usr/bin/env node
// Session exhaust lives outside the repository — does it, and does moving it lose anything?
//
// Three things go wrong when state stops being stored in the tree, and all three are silent:
//
//   · it lands somewhere shared, so two projects write into one log
//   · the existing in-repo copy is orphaned, and "where did my prompts go" has no good answer
//   · migration overwrites a live log with a stale one — the data-loss shape 4-review already
//     caught once in bootstrap.mjs, where a `.pre-nexa` backup was restored over live settings
//
// The last is the guard watched failing for card 002. It is also the only one whose failure
// destroys something rather than merely misplacing it.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stateRoot, statePath, projectId, markerId } from '../plugin/scripts/hooks/roots.mjs';

let pass = 0; let fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
};

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const write = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };

// Every test restores the environment it changed. A leaked NEXA_STATE_DIR would make every
// later assertion agree with itself for the wrong reason.
const withEnv = (val, fn) => {
  const had = Object.prototype.hasOwnProperty.call(process.env, 'NEXA_STATE_DIR');
  const old = process.env.NEXA_STATE_DIR;
  if (val === null) delete process.env.NEXA_STATE_DIR; else process.env.NEXA_STATE_DIR = val;
  try { return fn(); } finally {
    if (had) process.env.NEXA_STATE_DIR = old; else delete process.env.NEXA_STATE_DIR;
  }
};

console.log('═'.repeat(72));
console.log('  STATE ROOT — session exhaust belongs outside the tree');
console.log('═'.repeat(72));

// ── where it resolves ────────────────────────────────────────────────────────
console.log('\n▸ resolution');
{
  const repo = tmp('state-repo-');
  withEnv(null, () => {
    const base = stateRoot(repo);
    check('a state root resolves without any configuration', typeof base === 'string' && base.length > 0);
    check('...and it is NOT inside the project tree',
      base && !base.startsWith(`${fs.realpathSync(repo)}${path.sep}`) && !base.startsWith(`${repo}${path.sep}`), base);
    check('...and it is under the home directory', base && base.startsWith(os.homedir()), base);
  });

  // An override that re-anchored a relative path to the project would be a surprise, and the
  // kind that is only discovered when a log turns up committed.
  withEnv('.', () => {
    check('NEXA_STATE_DIR overrides, and a relative value resolves against cwd not the project',
      stateRoot(repo) === path.resolve('.'), stateRoot(repo));
  });
  fs.rmSync(repo, { recursive: true, force: true });
}

// ── one directory per checkout ───────────────────────────────────────────────
console.log('\n▸ identity — two checkouts of one repository must not share a log');
{
  const a = tmp('state-a-'); const b = tmp('state-b-');
  withEnv(null, () => {
    check('two different trees get two different state directories', stateRoot(a) !== stateRoot(b));
    check('...and the same tree resolves to the same directory twice', stateRoot(a) === stateRoot(a));
  });

  // The directory NAME is derived from the path and is meant to be read by a human — that is
  // the whole reason it is not a hash.
  check('the name is the path, so `ls ~/.nexa/projects` is readable',
    projectId('/Users/you/work/my-app') === '-Users-you-work-my-app',
    projectId('/Users/you/work/my-app'));
  check('...and characters no filesystem wants are replaced, not passed through',
    !/[^A-Za-z0-9._-]/.test(projectId('/Users/you/my app/a:b')), projectId('/Users/you/my app/a:b'));

  // The id in the `.nexa` marker is the IDENTITY; the readable name is only a label.
  write(path.join(a, '.nexa'), JSON.stringify({ nexaId: 'abc123def456' }));
  check('a marker id is read back', markerId(a) === 'abc123def456', markerId(a));
  write(path.join(b, '.nexa'), '{ not json');
  check('...and an unreadable marker yields null rather than throwing', markerId(b) === null);
  check('...and a repository with no marker yields null too', markerId(tmp('state-none-')) === null);
  for (const d of [a, b]) fs.rmSync(d, { recursive: true, force: true });
}

// ── a renamed repository must not orphan its own board ───────────────────────
//
// Once `board/` and `docs/` live in the project directory, a path-derived NAME stops being
// merely cosmetic: rename the repo and the derived name changes, and everything the user has
// is suddenly under a name nothing points at. `stateRoot` reconciles using the marker id.
console.log('\n▸ a moved repository finds its own directory again');
{
  const base = tmp('state-base-');
  const wasAt = path.join(base, '-Users-old-name');
  write(path.join(wasAt, '.nexa-id'), 'stable-id-0001\n');
  write(path.join(wasAt, 'board', '3-build', 'card.md'), 'the work in flight\n');

  // NEXA_STATE_DIR would short-circuit the reconciliation, so this drives the real thing by
  // pointing HOME at the arena instead.
  const repo = tmp('state-moved-');
  write(path.join(repo, '.nexa'), JSON.stringify({ nexaId: 'stable-id-0001' }));
  const oldHome = process.env.HOME;
  try {
    fs.mkdirSync(path.join(base, '..', 'ignored'), { recursive: true });
    // stateRoot builds <home>/.nexa/projects, so stage the arena to match.
    const home = tmp('state-fakehome-');
    fs.mkdirSync(path.join(home, '.nexa'), { recursive: true });
    fs.renameSync(base, path.join(home, '.nexa', 'projects'));
    process.env.HOME = home;

    const resolved = stateRoot(repo);
    check('the directory was found by its id and renamed to the new path',
      fs.existsSync(path.join(resolved, 'board', '3-build', 'card.md')), resolved);
    check('...and it is now named after the current path',
      path.basename(resolved) === projectId(fs.realpathSync(repo)), path.basename(resolved));
    fs.rmSync(home, { recursive: true, force: true });
  } finally {
    if (oldHome === undefined) delete process.env.HOME; else process.env.HOME = oldHome;
  }
  fs.rmSync(repo, { recursive: true, force: true });
}

// ── migration ────────────────────────────────────────────────────────────────
console.log('\n▸ migration — the in-repo copy must move, not be orphaned');
{
  const repo = tmp('state-mig-'); const home = tmp('state-home-');
  write(path.join(repo, 'docs', 'prompts', '2026-07-01.md'), 'the original prompt log\n');

  withEnv(home, () => {
    const target = statePath(repo, 'prompts');
    check('statePath returns a path under the state root', target === path.join(home, 'prompts'), target);
    check('the legacy log was moved to it',
      fs.existsSync(path.join(target, '2026-07-01.md')));
    check('...and the content survived intact',
      fs.readFileSync(path.join(target, '2026-07-01.md'), 'utf8') === 'the original prompt log\n');
    check('...and the in-repo directory is gone, so there is one copy not two',
      !fs.existsSync(path.join(repo, 'docs', 'prompts')));
  });
  for (const d of [repo, home]) fs.rmSync(d, { recursive: true, force: true });
}

// ── THE GUARD, watched failing ───────────────────────────────────────────────
//
// Staged so that migrating would destroy the live log. If `statePath` ever migrates
// unconditionally, this is the assertion that goes red — and it is the one that matters,
// because every other failure in this file misplaces data where this one deletes it.
console.log('\n▸ never clobber — a live log outranks a legacy one');
{
  const repo = tmp('state-clob-'); const home = tmp('state-home2-');
  write(path.join(repo, 'docs', 'prompts', 'day.md'), 'STALE — the copy left in the repo\n');
  write(path.join(home, 'prompts', 'day.md'), 'LIVE — the log being written today\n');

  withEnv(home, () => {
    const target = statePath(repo, 'prompts');
    check('the live log was NOT overwritten by the legacy one',
      fs.readFileSync(path.join(target, 'day.md'), 'utf8').startsWith('LIVE'),
      fs.readFileSync(path.join(target, 'day.md'), 'utf8').trim());
    check('...and the legacy copy is kept rather than deleted, so nothing is lost either way',
      fs.existsSync(path.join(repo, 'docs', 'prompts', 'day.md')));
  });
  for (const d of [repo, home]) fs.rmSync(d, { recursive: true, force: true });
}

// ── the fail-closed rule survives the move ───────────────────────────────────
console.log('\n▸ fail-closed — an unresolvable state root yields null, never a guess');
{
  const repo = tmp('state-null-');
  // A state root that cannot be created is the realistic failure: a path whose parent is a file.
  const blocked = path.join(tmp('state-block-'), 'a-file');
  fs.writeFileSync(blocked, 'not a directory\n');
  withEnv(path.join(blocked, 'nested'), () => {
    check('statePath returns null when the directory cannot be created', statePath(repo, 'prompts') === null);
  });
  fs.rmSync(repo, { recursive: true, force: true });
}

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\n  State that moves house must arrive, and must not land on top of anything.\n');
  process.exit(1);
}
console.log('');

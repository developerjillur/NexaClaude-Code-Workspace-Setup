#!/usr/bin/env node
// The zero-command bootstrap, tested in the direction that matters.
//
// This is the only thing in the workspace that writes into somebody else's repository with no
// command and no prompt, so the interesting assertions are almost all NEGATIVE: the fixtures
// below are mostly repositories it must leave completely alone. A bootstrap that scaffolds
// correctly and also scaffolds a repo you cloned to read is not 90% right, it is wrong.
//
// Every `decide()` rung has a fixture. Three of them are the destructive sequences the council
// was asked to name, turned into the tests it asked for.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TEMPLATES = path.join(ROOT, 'plugin', 'templates');

// Manifests and tombstones must not land in the real ~/.nexa while testing.
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'nexa-data-'));
process.env.CLAUDE_PLUGIN_DATA = DATA;

const { decide, bootstrap, remove, mergeSettings, manifestPath, tombstonePath } =
  await import(path.join(ROOT, 'plugin', 'scripts', 'bootstrap.mjs'));

let pass = 0; let fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
};

const trash = [DATA];
function repo({ init = true } = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nexa-repo-'));
  trash.push(d);
  if (init) {
    execFileSync('git', ['init', '-q'], { cwd: d, stdio: 'ignore' });
  }
  return d;
}
const OPTS = { allowTemp: true };
const boot = (d) => bootstrap(d, TEMPLATES, OPTS);

console.log('═'.repeat(72));
console.log('  BOOTSTRAP — mostly assertions that nothing happened');
console.log('═'.repeat(72));

// ── the rungs that must refuse silently ──────────────────────────────────────
console.log('\n▸ where it must never fire — silently, because a hook that talks everywhere gets uninstalled');
{
  const plain = repo({ init: false });
  check('a directory that is not a git repository', decide(plain, OPTS).reason === 'not a git repository');

  const r = repo();
  const sub = path.join(r, 'packages', 'api');
  fs.mkdirSync(sub, { recursive: true });
  check('a subdirectory of a repository — the workspace belongs at the root',
    decide(sub, OPTS).reason === 'not the repository root', decide(sub, OPTS).reason);

  // A linked worktree or a submodule has a .git FILE, not a directory.
  const wt = repo({ init: false });
  fs.writeFileSync(path.join(wt, '.git'), 'gitdir: /elsewhere/.git/worktrees/x\n');
  const wtVerdict = decide(wt, OPTS);
  check('a linked worktree or submodule (.git is a file)',
    wtVerdict.act === false, wtVerdict.reason);

  check('the home directory', decide(os.homedir(), OPTS).act === false);

  // Without the fixture flag, every one of these temp roots is refused on that ground alone.
  const t = repo();
  check('a temporary directory, when the flag the hook never passes is absent',
    decide(t).reason === 'temporary directory', decide(t).reason);

  for (const v of [decide(plain, OPTS), decide(sub, OPTS), decide(t)]) {
    check(`...and says nothing about it (${v.reason})`, v.level === 'silent');
  }
}

// ── the rungs that refuse out loud ───────────────────────────────────────────
console.log('\n▸ a contested repository — refused, and told why');
{
  const broken = repo();
  fs.writeFileSync(path.join(broken, 'workspace.config.json'), '{ this is not json');
  const v = decide(broken, OPTS);
  check('an unreadable workspace.config.json is never overwritten', v.act === false, v.reason);
  check('...and it is announced rather than silent', v.level === 'announce');

  // FIXTURE B from the council: board/ is a deployed static site. Nine stage directories
  // inside it would be published on the next deploy.
  const site = repo();
  fs.mkdirSync(path.join(site, 'board'));
  fs.writeFileSync(path.join(site, 'board', 'index.html'), '<h1>roadmap</h1>');
  const before = fs.readdirSync(path.join(site, 'board')).sort();
  const sv = boot(site);
  check('a board/ that is not ours is left exactly as it was', sv.act === false, sv.reason);
  check('...and the file set under board/ is byte-identical afterwards',
    JSON.stringify(fs.readdirSync(path.join(site, 'board')).sort()) === JSON.stringify(before));
  check('...and nothing else was created either', sv.created.length === 0);
}

// ── the happy path ───────────────────────────────────────────────────────────
console.log('\n▸ a clean repository root — the only case that writes');
{
  const r = repo();
  const res = boot(r);
  check('it acts', res.act === true, res.reason);
  const stages = ['0-discovery', '0-backlog', '1-spec', '2-plan', '3-build', '4-review', '5-verify', '6-done', '7-operate'];
  check('all nine board stages exist', stages.every((s) => fs.existsSync(path.join(r, 'board', s, '.gitkeep'))));
  for (const f of ['workspace.config.json', '.claudeignore', 'AGENTS.md', 'CLAUDE.md',
    path.join('docs', 'DECISIONS.md'), path.join('docs', 'LEARNED.md'),
    path.join('templates', 'CARD.md'), path.join('.claude', 'settings.json')]) {
    check(`creates ${f}`, fs.existsSync(path.join(r, f)));
  }
  check('the contract it wrote is the real one, not a stub',
    fs.readFileSync(path.join(r, 'AGENTS.md'), 'utf8').includes('The contract every coding agent works under'));
  check('the settings it wrote carry the deny rules',
    JSON.parse(fs.readFileSync(path.join(r, '.claude', 'settings.json'), 'utf8'))
      .permissions.deny.includes('Read(./code/.env)'));
  check('no temp file is left behind by the atomic writes',
    !fs.readdirSync(r).some((f) => f.startsWith('.nexa-tmp-')));

  // Idempotence is NOT consent — but having consented once, a second session must be a no-op.
  const again = boot(r);
  check('a second session writes nothing and says nothing', again.act === false && again.level === 'silent',
    `${again.reason}/${again.level}`);
  check('...because it recognises its own config', again.reason === 'already initialised');
}

// ── create-only ──────────────────────────────────────────────────────────────
console.log('\n▸ create-only — a file that exists is never touched');
{
  const r = repo();
  const mine = '# my own contract\n\nnothing to do with nexa\n';
  fs.writeFileSync(path.join(r, 'AGENTS.md'), mine);
  fs.mkdirSync(path.join(r, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(r, 'docs', 'DECISIONS.md'), 'mine too\n');
  boot(r);
  check('an existing AGENTS.md survives byte for byte',
    fs.readFileSync(path.join(r, 'AGENTS.md'), 'utf8') === mine);
  check('an existing docs/DECISIONS.md survives too',
    fs.readFileSync(path.join(r, 'docs', 'DECISIONS.md'), 'utf8') === 'mine too\n');
  check('...and the board was still created alongside them',
    fs.existsSync(path.join(r, 'board', '3-build')));
}

// ── the settings ladder ──────────────────────────────────────────────────────
console.log('\n▸ the settings ladder — the merge is the last resort, not the first move');
{
  const r = repo();
  const theirs = { permissions: { deny: ['Read(./prod-creds/**)'] }, model: 'sonnet', hooks: { Stop: [] } };
  fs.mkdirSync(path.join(r, '.claude'), { recursive: true });
  const sharedBytes = `${JSON.stringify(theirs, null, 2)}\n`;
  fs.writeFileSync(path.join(r, '.claude', 'settings.json'), sharedBytes);
  const res = boot(r);
  check('an existing settings.json is never touched',
    fs.readFileSync(path.join(r, '.claude', 'settings.json'), 'utf8') === sharedBytes);
  check('...and ours goes to settings.local.json, which Claude Code gitignores',
    res.settings.where === 'settings.local.json' && fs.existsSync(path.join(r, '.claude', 'settings.local.json')));
}
{
  // Rung 3: both exist. This is FIXTURE A — the silent one.
  const r = repo();
  fs.mkdirSync(path.join(r, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(r, '.claude', 'settings.json'), '{}\n');
  const theirs = {
    permissions: { deny: ['Read(./prod-creds/**)'], allow: ['Bash(ls)'] },
    model: 'sonnet',
    hooks: { PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'scrub' }] }] },
  };
  fs.writeFileSync(path.join(r, '.claude', 'settings.local.json'), `${JSON.stringify(theirs, null, 2)}\n`);
  const res = boot(r);
  const after = JSON.parse(fs.readFileSync(path.join(r, '.claude', 'settings.local.json'), 'utf8'));

  check('THE SILENT FAILURE: the user\'s own deny rule survives the merge',
    after.permissions.deny.includes('Read(./prod-creds/**)'),
    'a shallow spread would have deleted this and never errored');
  check('...and ours were added beside it', after.permissions.deny.includes('Read(./code/.env)'));
  check('...their allow list is untouched', JSON.stringify(after.permissions.allow) === '["Bash(ls)"]');
  check('...their hooks are untouched — ours ship in the plugin, never in settings',
    after.hooks.PreToolUse[0].hooks[0].command === 'scrub' && after.hooks.PreToolUse.length === 1);
  check('...their model choice wins over ours', after.model === 'sonnet');
  check('...and the conflict is reported rather than swallowed',
    res.settings.conflicts.some((c) => c.startsWith('model:')), JSON.stringify(res.settings.conflicts));
  check('...a one-time backup of their file exists',
    fs.existsSync(path.join(r, '.claude', 'settings.local.json.pre-nexa')));
}
{
  // The merge must be pure: it may not mutate what it was handed.
  const theirs = { permissions: { deny: ['a'] } };
  const frozen = JSON.stringify(theirs);
  mergeSettings(theirs, { permissions: { deny: ['b'] }, model: 'opus' });
  check('mergeSettings does not mutate its input', JSON.stringify(theirs) === frozen);
}
{
  // A settings.local.json that does not parse must be left alone, not "repaired".
  const r = repo();
  fs.mkdirSync(path.join(r, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(r, '.claude', 'settings.json'), '{}\n');
  fs.writeFileSync(path.join(r, '.claude', 'settings.local.json'), '{ broken');
  const res = boot(r);
  check('an unparseable settings.local.json is left untouched',
    fs.readFileSync(path.join(r, '.claude', 'settings.local.json'), 'utf8') === '{ broken');
  check('...and that is reported, not silent', res.settings.conflicts.length > 0);
}

// ── manifest, removal, tombstone ─────────────────────────────────────────────
console.log('\n▸ the manifest lives outside the repo, so removal is knowable');
{
  const r = repo();
  const mine = '# mine\n';
  fs.writeFileSync(path.join(r, 'README.md'), mine);
  boot(r);
  check('the manifest is written outside the repository',
    fs.existsSync(manifestPath(r)) && !manifestPath(r).startsWith(fs.realpathSync(r)));

  const rm = remove(r);
  check('removal deletes what it created', !fs.existsSync(path.join(r, 'workspace.config.json')) && rm.removed.length > 0);
  check('...and nothing it did not create', fs.readFileSync(path.join(r, 'README.md'), 'utf8') === mine);
  check('...leaving a tombstone outside the repo', fs.existsSync(tombstonePath(r)));

  const after = decide(r, OPTS);
  check('a tombstoned repository is never scaffolded again',
    after.act === false && /tombstone/.test(after.reason), after.reason);
  check('...silently, because the user already said no', after.level === 'silent');
}

// ── the bin/ commands ────────────────────────────────────────────────────────
//
// Files in `bin/` are added to PATH while the plugin is enabled, so each one is a promise that
// a bare command exists. A wrapper pointing at a script that moved is not a loud failure — it
// is `command not found` at the moment somebody reaches for a gate, which is exactly when they
// are least likely to investigate and most likely to carry on without it.
console.log('\n▸ bin/ — every bare command resolves to a script that is actually there');
{
  const binDir = path.join(ROOT, 'plugin', 'bin');
  const bins = fs.readdirSync(binDir);
  check('there is at least one command', bins.length > 0);
  const broken = [];
  const unexecutable = [];
  for (const b of bins) {
    const body = fs.readFileSync(path.join(binDir, b), 'utf8');
    const m = body.match(/scripts\/([\w.-]+\.mjs)/);
    if (!m || !fs.existsSync(path.join(ROOT, 'plugin', 'scripts', m[1]))) broken.push(b);
    try { fs.accessSync(path.join(binDir, b), fs.constants.X_OK); } catch { unexecutable.push(b); }
  }
  check(`all ${bins.length} commands point at a script that exists`, broken.length === 0, broken.join(', '));
  check('...and every one is executable, which git does track', unexecutable.length === 0, unexecutable.join(', '));
}

// ── nexa-remove, as the command a user actually types ────────────────────────
//
// `remove()` is exercised above as a function. This runs the CLI, because the two can diverge:
// a wrapper that resolves the wrong root, or deletes on a dry run, is a defect the unit test
// cannot see.
console.log('\n▸ nexa-remove — the CLI wrapper, not just the function');
{
  const { spawnSync } = await import('node:child_process');
  const script = path.join(ROOT, 'scripts', 'nexa-remove.mjs');
  const emptyData = fs.mkdtempSync(path.join(os.tmpdir(), 'nexa-nodata-'));
  trash.push(emptyData);
  const r = spawnSync('node', [script, '--dry-run'], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, CLAUDE_PLUGIN_DATA: emptyData },
  });
  check('a dry run with no manifest passes and says nothing was recorded',
    r.status === 0 && /Nothing was recorded/.test(r.stdout), `${r.status}: ${(r.stdout + r.stderr).slice(0, 120)}`);
  check('...and leaves the tree untouched, which is what makes it safe to offer first',
    fs.existsSync(path.join(ROOT, 'workspace.config.json')));

  // WATCHED REFUSING — an installed plugin with no project anywhere. `nexa-remove` deletes
  // files, so "I could not work out which repository this is" must stop it rather than let it
  // resolve to whatever happens to be nearby. Built as a real cache: a plugin manifest at the
  // root, no workspace above it, no CLAUDE_PROJECT_DIR, and a working directory that is not a
  // project either.
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'nexa-cache-'));
  const nowhere = fs.mkdtempSync(path.join(os.tmpdir(), 'nexa-nowhere-'));
  trash.push(cache, nowhere);
  fs.mkdirSync(path.join(cache, 'scripts', 'hooks'), { recursive: true });
  fs.mkdirSync(path.join(cache, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(cache, '.claude-plugin', 'plugin.json'), '{"name":"nexa-workspace"}');
  for (const [from, to] of [
    [path.join(ROOT, 'scripts', 'nexa-remove.mjs'), path.join(cache, 'scripts', 'nexa-remove.mjs')],
    [path.join(ROOT, 'scripts', 'bootstrap.mjs'), path.join(cache, 'scripts', 'bootstrap.mjs')],
    [path.join(ROOT, 'scripts', 'hooks', 'roots.mjs'), path.join(cache, 'scripts', 'hooks', 'roots.mjs')],
  ]) fs.copyFileSync(from, to);

  const refused = spawnSync('node', [path.join(cache, 'scripts', 'nexa-remove.mjs')], {
    cwd: nowhere, encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: '', CLAUDE_PLUGIN_DATA: emptyData },
  });
  check('REFUSES to delete anything when it cannot tell which project it is in',
    refused.status === 1, `exit ${refused.status}: ${(refused.stdout + refused.stderr).slice(0, 140)}`);
  check('...and says so on stderr rather than exiting quietly',
    /Cannot tell which project/.test(refused.stderr), refused.stderr.slice(0, 140));
}

// ── the harness that measures the settings race ──────────────────────────────
//
// `measure-settings-race` answers the question the whole zero-command design rests on: does a
// deny rule written by a SessionStart hook protect the session that wrote it? Its *judgement*
// is tested here; its two arms need a live session and are run by hand.
//
// The case that matters is a leaking BASELINE. If the control arm cannot detect a refusal, a
// green RACE arm means nothing while looking exactly like a pass — a measurement that cannot
// fail its own control belongs in the same bin as a suite that catches nothing.
console.log('\n▸ measure-settings-race — the verdict, including its own failure');
{
  const { verdict } = await import(path.join(ROOT, 'scripts', 'measure-settings-race.mjs'));
  const ok = { leaked: false, timedOut: false };
  const leak = { leaked: true, timedOut: false };
  const slow = { leaked: false, timedOut: true };

  check('both arms refused → the race is closed', verdict(ok, ok).code === 0);
  check('the race arm leaked → the race is OPEN, and that is a failure not a warning',
    verdict(ok, leak).code === 1);
  check('THE CONTROL: a leaking baseline is inconclusive, never a pass',
    verdict(leak, ok).code === 2, 'a broken harness must not be able to report success');
  check('...even when the race arm also leaked', verdict(leak, leak).code === 2);
  check('a timeout is inconclusive rather than rounded either way', verdict(slow, ok).code === 2);
  check('...on either arm', verdict(ok, slow).code === 2);
  check('and the closed verdict says it is one version, not a guarantee',
    /one version, not a guarantee/.test(verdict(ok, ok).message));
}

for (const d of trash) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* gone */ } }

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\n  A bootstrap that writes where it should not is the one failure nobody forgives.\n');
  process.exit(1);
}
console.log('\n  Every refusal above was watched refusing, not assumed to.\n');

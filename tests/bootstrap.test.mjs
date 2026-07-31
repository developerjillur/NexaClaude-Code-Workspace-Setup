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
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TEMPLATES = path.join(ROOT, 'plugin', 'templates');

// Manifests and tombstones must not land in the real ~/.nexa while testing.
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'nexa-data-'));
process.env.CLAUDE_PLUGIN_DATA = DATA;

// **And neither must the project directories themselves.** Since 2026-07-30 the scaffold is
// written to ~/.nexa/projects/<id>/ rather than into the repository, so every fixture here would
// otherwise create a directory in the developer's real home — which is precisely what happened
// the first time and is now asserted against in hooks.test.mjs. HOME is redirected rather than
// NEXA_STATE_DIR set, because a single NEXA_STATE_DIR would make all the fixtures share one
// directory and quietly destroy the isolation between them.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nexa-home-'));
process.env.HOME = HOME;
process.env.USERPROFILE = HOME;

const { decide, bootstrap, remove, mergeSettings, manifestPath, tombstonePath,
  migratable, migrateIntoHome, detectCodeDirs } =
  await import(path.join(ROOT, 'plugin', 'scripts', 'bootstrap.mjs'));
const { stateRoot, projectId } = await import(path.join(ROOT, 'plugin', 'scripts', 'hooks', 'roots.mjs'));

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
// nexa-init resolves its target from CLAUDE_PROJECT_DIR, and needs a decoy TMPDIR so decide()
// does not refuse the fixture for being in a temp directory — the same trick the installed-layout
// tests use, for the same reason.
const DECOY = fs.mkdtempSync(path.join(os.tmpdir(), 'init-decoy-'));
trash.push(DECOY);
function spawnSyncNode(script, args, cwd) {
  const r = spawnSync('node', [script, ...args], {
    cwd, encoding: 'utf8',
    env: { ...process.env, HOME, USERPROFILE: HOME, TMPDIR: DECOY, CLAUDE_PROJECT_DIR: cwd },
  });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
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
  // ── the repository gets three things, and that is the point of card 003 ─────
  //
  // Adopting used to write fourteen files into somebody else's project. The contract now is:
  // `.nexa`, `AGENTS.md`, `CLAUDE.md` — plus `.claudeignore` and `.claude/settings.json`, which
  // Claude Code only reads from the tree and so have nowhere else to live.
  //
  // Asserted as an EXACT set rather than a series of existence checks, because the failure
  // being guarded is a file reappearing in the repository, and an existence check cannot see
  // something it was not told to look for.
  const inRepo = fs.readdirSync(r).filter((f) => f !== '.git' && !f.startsWith('._')).sort();
  check('the repository receives exactly the files that cannot live anywhere else',
    JSON.stringify(inRepo) === JSON.stringify(
      ['.claude', '.claudeignore', '.nexa', 'AGENTS.md', 'CLAUDE.md'].sort()),
    inRepo.join(', '));
  check('...and no board/, docs/ or templates/ among them',
    !inRepo.includes('board') && !inRepo.includes('docs') && !inRepo.includes('templates'));
  check('...and no workspace.config.json — the config moved out too',
    !inRepo.includes('workspace.config.json'));

  const home = stateRoot(r);
  const stages = ['0-discovery', '0-backlog', '1-spec', '2-plan', '3-build', '4-review', '5-verify', '6-done', '7-operate'];
  check('all nine board stages exist, in ~/.nexa',
    stages.every((s) => fs.existsSync(path.join(home, 'board', s, '.gitkeep'))), home);
  for (const f of ['config.json', '.nexa-id',
    path.join('docs', 'DECISIONS.md'), path.join('docs', 'LEARNED.md'),
    path.join('templates', 'CARD.md')]) {
    check(`creates ${f} in the project directory`, fs.existsSync(path.join(home, f)));
  }
  for (const f of ['.claude/settings.json']) check(`creates ${f} in the repo`, fs.existsSync(path.join(r, f)));

  // The marker and the directory must agree, or a rename cannot be reconciled.
  check('the marker id and the directory id are the same',
    JSON.parse(fs.readFileSync(path.join(r, '.nexa'), 'utf8')).nexaId
      === fs.readFileSync(path.join(home, '.nexa-id'), 'utf8').trim());
  check('the project directory is named after the repository path',
    path.basename(home) === projectId(fs.realpathSync(r)), path.basename(home));
  check('the contract it wrote is the real one, not a stub',
    fs.readFileSync(path.join(r, 'AGENTS.md'), 'utf8').includes('The contract every coding agent works under'));
  // ── a deny rule the tool ignores is not a deny rule ───────────────────────
  //
  // A live session printed, twice: "Write(./plan/**) is not matched by file permission checks —
  // only Edit(path) rules are." So every Write(...) deny we wrote was INERT, and the two paths
  // §8 calls boundaries an agent must not touch were guarded by nothing. The warning only
  // appears in a running session, which is why no unit test ever saw it.
  {
    const deny = JSON.parse(fs.readFileSync(path.join(r, '.claude', 'settings.json'), 'utf8'))
      .permissions?.deny ?? [];
    check('no Write(path) deny rules — Claude Code ignores them',
      !deny.some((d) => /^Write\(\.\//.test(d)), deny.filter((d) => /^Write\(/.test(d)).join(', '));
    check('...and the boundaries are covered by Edit(), which applies to every editing tool',
      deny.includes('Edit(./plan/**)') && deny.includes('Edit(./board/6-done/**)'), deny.join(', '));

    // ── the credential rules must name the project's REAL source directories ──
    //
    // They were hardcoded to `./code/` while `detectCodeDirs()` writes the project's actual
    // directories into `config.json` a few lines away. A `src/` project therefore got
    // `{"codeDirs":["src"]}` alongside `Read(./code/.env)` — a rule guarding a path that does
    // not exist, so the credential protection covered nothing while looking present.
    check('.env is denied for READING in every configured code directory',
      deny.includes('Read(./code/.env)'), deny.join(', '));
    // §8 lists .env among the files an agent must not touch, and only reading was denied —
    // so overwriting a credential file was permitted. That destroys a secret rather than
    // leaking one, which is why nobody thought to check for it.
    check('...and for WRITING, which Read() alone left open',
      deny.includes('Edit(./code/.env)'), deny.join(', '));

    // The controls themselves. `ask` rather than `deny`: these are edited legitimately, and a
    // deny that must be worked around teaches people to work around it. But an agent must not
    // be able to silently delete the hook registration that constrains it.
    const ask = JSON.parse(fs.readFileSync(path.join(r, '.claude', 'settings.json'), 'utf8'))
      .permissions?.ask ?? [];
    check('editing the hook registration asks a human first',
      ask.includes('Edit(./.claude/settings.json)'), ask.join(', '));
    check('...and so does editing the contract itself',
      ask.includes('Edit(./AGENTS.md)') && ask.includes('Edit(./workspace.config.json)'), ask.join(', '));
  }

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
  check('...and the board was still created, in the project directory',
    fs.existsSync(path.join(stateRoot(r), 'board', '3-build')));
  // The user already had docs/ in their repo, so that is where docs/ lives for this project —
  // a second empty DECISIONS.md in ~/.nexa would shadow nothing and confuse everything.
  check('...and no second DECISIONS.md was created in ~/.nexa beside their own',
    !fs.existsSync(path.join(stateRoot(r), 'docs', 'DECISIONS.md')));
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
  // The backup deliberately lives OUTSIDE the repository. Keeping it beside the file meant a
  // stale .pre-nexa from an earlier run was later restored over live settings — a second-model
  // review's worst finding, and the reason this assertion changed rather than the code.
  check('...a backup of their file exists, outside the repository',
    res.modified?.length === 1 && fs.existsSync(res.modified[0].backup)
      && !res.modified[0].backup.startsWith(fs.realpathSync(r)),
    JSON.stringify(res.modified));
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

// ── the ways a merge can weaken a user without deleting anything ─────────────
//
// All three found by a second-model review, and none of them removes a line. That is what
// makes them the dangerous kind: the user's file still reads exactly as they wrote it.
console.log('\n▸ the merge must not quietly overrule the user');
{
  // deny is evaluated BEFORE allow. Appending our deny for something they explicitly allowed
  // leaves their rule present and completely ineffective — worse than deleting it, because
  // deleting it would at least be visible in a diff.
  const theirs = { permissions: { allow: ['Read(./code/.env)'] } };
  const { merged, conflicts } = mergeSettings(theirs, {
    permissions: { deny: ['Read(./code/.env)', 'Read(./code/data/**)'] },
  });
  check('a deny we would add is NOT added when the user explicitly allows it',
    !merged.permissions.deny?.includes('Read(./code/.env)'), JSON.stringify(merged.permissions.deny));
  check('...their allow survives untouched', merged.permissions.allow.includes('Read(./code/.env)'));
  check('...and the conflict is reported rather than resolved silently',
    conflicts.some((c) => c.includes('Read(./code/.env)')), JSON.stringify(conflicts));
  check('...while our other rules are still added',
    merged.permissions.deny.includes('Read(./code/data/**)'));
}
{
  // `Bash(git push *)` and `Bash(git push:*)` are the same rule in two spellings. Exact-string
  // dedup adds a second copy — noise in the file a user reads when working out why they were
  // blocked.
  const { merged } = mergeSettings(
    { permissions: { ask: ['Bash(git push *)'] } },
    { permissions: { ask: ['Bash(git push:*)'] } },
  );
  check('two spellings of the same rule do not both end up in the file',
    merged.permissions.ask.length === 1, JSON.stringify(merged.permissions.ask));
  check('...and the spelling kept is the user\'s own',
    merged.permissions.ask[0] === 'Bash(git push *)');
}
{
  // The banner promises "nothing that already existed was modified — to undo all of it".
  // A merged settings.local.json IS modified, and was recorded nowhere, so removal left our
  // rules behind while the promise stayed on screen.
  const r = repo();
  fs.mkdirSync(path.join(r, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(r, '.claude', 'settings.json'), '{}\n');
  const original = `${JSON.stringify({ permissions: { deny: ['Read(./mine/**)'] } }, null, 2)}\n`;
  fs.writeFileSync(path.join(r, '.claude', 'settings.local.json'), original);
  const res = boot(r);
  check('the merged file is recorded as MODIFIED, not created',
    res.modified?.some((m) => m.file.endsWith('settings.local.json')), JSON.stringify(res.modified));
  check('...and our rules really are in it before removal',
    fs.readFileSync(path.join(r, '.claude', 'settings.local.json'), 'utf8').includes('Read(./code/.env)'));

  const rm = remove(r);
  check('removal RESTORES it to the user\'s original bytes',
    fs.readFileSync(path.join(r, '.claude', 'settings.local.json'), 'utf8') === original,
    fs.readFileSync(path.join(r, '.claude', 'settings.local.json'), 'utf8').slice(0, 100));
  check('...and says which files it restored', rm.restored?.length > 0);
  check('...leaving no backup file behind anywhere',
    !fs.existsSync(path.join(r, '.claude', 'settings.local.json.pre-nexa')));
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

// ── consent, for the hooks that WRITE ────────────────────────────────────────
//
// The bootstrap refuses a repository it should not adopt. That refusal is worth nothing if the
// writing hooks then write there anyway — and they did. 5-verify caught `?? docs/` appearing in
// a fixture whose `board` belonged to somebody else: `save-prompt` had started a prompt log in
// a repository we had explicitly declined.
//
// Location is not consent. The marker is `workspace.config.json`, which only the bootstrap
// writes, so "did the user get adopted" has exactly one answer on disk.
console.log('\n▸ the writing hooks — silent in a repository that was never adopted');
{
  const { spawnSync } = await import('node:child_process');
  const hooks = path.join(ROOT, 'scripts', 'hooks');
  const un = repo();                       // a git repo, no workspace.config.json
  const yes = repo();
  fs.writeFileSync(path.join(yes, 'workspace.config.json'), '{"codeDirs":["code"]}');

  // A temp state directory, so a fixture repository cannot leave an entry in the developer's
  // real ~/.nexa. The consent check runs BEFORE the state directory is resolved, so an
  // unadopted repository still produces nothing anywhere — which is what the next block asserts.
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-state-'));
  const fire = (script, cwd) => spawnSync('node', [path.join(hooks, script)], {
    input: JSON.stringify({ prompt: 'hello', session_id: 'verify' }),
    cwd, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: cwd, NEXA_STATE_DIR: state },
  });

  for (const script of ['save-prompt.mjs', 'prompt-check.mjs', 'session-end.mjs']) {
    fire(script, un);
  }
  check('REFUSES to write: no docs/ appears in an unadopted repository',
    !fs.existsSync(path.join(un, 'docs')), fs.existsSync(path.join(un, 'docs'))
      ? fs.readdirSync(path.join(un, 'docs')).join(', ') : '');
  check('...and nothing else was created there either',
    fs.readdirSync(un).filter((f) => f !== '.git').length === 0,
    fs.readdirSync(un).join(', '));

  // THE SILENT CASE — in a workspace that WAS adopted, the log must still be written, or the
  // fix has simply broken the audit trail everywhere instead of leaking it everywhere.
  //
  // Since 2026-07-30 it is written to the STATE directory rather than into the repository, so
  // this asserts the log exists there — and, separately, that the repository stayed clean. Both
  // halves matter: checking only the first would pass a version that wrote in both places.
  fire('save-prompt.mjs', yes);
  check('...but it still writes in a workspace that was adopted',
    fs.existsSync(path.join(state, 'prompts')),
    fs.existsSync(state) ? fs.readdirSync(state).join(', ') : 'no state dir');
  check('...and it wrote OUTSIDE the repository, leaving the tree clean',
    !fs.existsSync(path.join(yes, 'docs')),
    fs.existsSync(path.join(yes, 'docs')) ? fs.readdirSync(path.join(yes, 'docs')).join(', ') : '');
  fs.rmSync(state, { recursive: true, force: true });
}

// ── the bin/ commands ────────────────────────────────────────────────────────
//
// Files in `bin/` are added to PATH while the plugin is enabled, so each one is a promise that
// a bare command exists. A wrapper pointing at a script that moved is not a loud failure — it
// is `command not found` at the moment somebody reaches for a gate, which is exactly when they
// are least likely to investigate and most likely to carry on without it.
// ── nexa-init: adoption you can ask for, instead of waiting for a restart ───
//
// Adoption ran only from `SessionStart`. `git init` a directory mid-session and nothing happens
// until Claude Code restarts, and nothing on screen says so. A user hit this twice in one
// sitting: `nexa-autopilot on` in a fresh directory answered "no project found" — correct, and
// with no visible way forward.
//
// It shares `decide()` with the hook, so it is a different TRIGGER and not a different policy:
// it can never adopt something the hook would refuse.
console.log('\n▸ nexa-init — same policy as the hook, different trigger');
{
  const init = path.join(ROOT, 'plugin', 'scripts', 'init.mjs');
  const run = (cwd, args = []) => spawnSyncNode(init, args, cwd);

  const notGit = repo({ init: false });
  const r1 = run(notGit);
  check('nexa-init REFUSES a directory that is not a git repository', r1.status === 1, `exit ${r1.status}`);
  check('...and names the fix rather than only the fault', /git init/.test(r1.out));

  // Dry run by default — a command that writes into your repository on sight is the behaviour
  // this workspace was reorganised to stop.
  const fresh = repo();
  fs.mkdirSync(path.join(fresh, 'src'), { recursive: true });
  const dry = run(fresh);
  check('a bare nexa-init ALLOWS inspection and changes nothing, exit 0',
    dry.status === 0 && fs.readdirSync(fresh).filter((f) => f !== '.git' && f !== 'src').length === 0,
    fs.readdirSync(fresh).join(', '));
  check('...and reports the codeDirs it detected, before writing anything',
    /"src"/.test(dry.out), dry.out.slice(0, 120));

  const applied = run(fresh, ['--apply']);
  check('--apply adopts it', applied.status === 0 && fs.existsSync(path.join(fresh, '.nexa')));
  check('...writing only what cannot live elsewhere',
    JSON.stringify(fs.readdirSync(fresh).filter((f) => f !== '.git' && f !== 'src').sort())
      === JSON.stringify(['.claude', '.claudeignore', '.nexa', 'AGENTS.md', 'CLAUDE.md'].sort()),
    fs.readdirSync(fresh).join(', '));
  check('...and a second run is a no-op that says so',
    /Already adopted/.test(run(fresh).out));
}

// ── codeDirs: the field the whole card rule rests on ────────────────────────
//
// It defaulted to `['code']` for every repository — right for this workspace's own layout and a
// **fail-open everywhere else.** Measured before the fix: with `src/` at the repo root,
// `guard-edit` allowed an edit to `src/app.js` with no card in build while refusing
// `code/thing.js`. The rule everything else rests on never fired on the user's actual source.
//
// Both directions matter here more than usual. Too permissive and the gate is decoration; too
// strict and it fires on a README and gets switched off within a day. `workspace.config.json`
// says exactly that about this field, and it shipped wrong in the permissive direction anyway.
console.log('\n▸ codeDirs — detected from the repo, not assumed to be code/');
{
  const r = repo();
  for (const d of ['src', 'lib', 'docs']) fs.mkdirSync(path.join(r, d), { recursive: true });
  fs.writeFileSync(path.join(r, 'README.md'), '# x\n');
  check('real source directories are detected', JSON.stringify(detectCodeDirs(r)) === JSON.stringify(['src', 'lib']),
    JSON.stringify(detectCodeDirs(r)));
  check('...and docs/ is NOT among them — a guard that fires on a README gets switched off',
    !detectCodeDirs(r).includes('docs'));

  const bare = repo();
  check('a repo with no recognisable source falls back to code/, as before',
    JSON.stringify(detectCodeDirs(bare)) === JSON.stringify(['code']));

  const legacy = repo();
  fs.mkdirSync(path.join(legacy, 'code'), { recursive: true });
  check('...and an existing code/ is still honoured', detectCodeDirs(legacy).includes('code'));

  // The value actually reaches the config the guard reads.
  boot(r);
  const cfg = JSON.parse(fs.readFileSync(path.join(stateRoot(r), 'config.json'), 'utf8'));
  check('the detected value is written into config.json, where guard-edit reads it',
    JSON.stringify(cfg.codeDirs) === JSON.stringify(['src', 'lib']), JSON.stringify(cfg.codeDirs));
}

// ── migration: the one operation here that can destroy somebody's work ───────
//
// Moving a pre-2026-07-30 in-repo scaffold into ~/.nexa is a tidy-up when the files are ours
// and a **data-loss bug** when they are not. A board and a DECISIONS.md are meant to be
// committed — the board is reviewed alongside the diff, the decisions travel with a clone — so
// the user who did the right thing is exactly the user with the most to lose here.
//
// `git ls-files` decides, and a repository git cannot answer for is treated as tracked.
console.log('\n▸ migration into ~/.nexa — tracked files are the user\'s, not ours');
{
  const r = repo();
  fs.mkdirSync(path.join(r, 'board', '3-build'), { recursive: true });
  fs.writeFileSync(path.join(r, 'board', '3-build', 'card.md'), 'work in flight\n');
  fs.mkdirSync(path.join(r, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(r, 'docs', 'DECISIONS.md'), 'weeks of decisions\n');
  execFileSync('git', ['add', 'docs'], { cwd: r, stdio: 'ignore' });   // docs tracked, board not

  check('git tracking is read, not guessed',
    migratable(r, 'board') === true && migratable(r, 'docs') === false);

  const res = migrateIntoHome(r);
  const home = stateRoot(r);

  // THE REFUSAL, and the reason this control exists at all.
  check('REFUSES to move a tracked docs/ — it stays in the repository',
    fs.existsSync(path.join(r, 'docs', 'DECISIONS.md')), 'weeks of decisions, silently relocated');
  check('...and says which, rather than half-migrating quietly',
    res.kept.some((k) => k.rel === 'docs' && /git tracks it/.test(k.why)), JSON.stringify(res.kept));

  // THE SILENT CASE: an untracked board is ours and must actually move, or migration does
  // nothing and the litter it was written to clear stays exactly where it was.
  check('...while an untracked board/ is moved out',
    !fs.existsSync(path.join(r, 'board')) && fs.existsSync(path.join(home, 'board', '3-build', 'card.md')));
  check('...and the card survived the move intact',
    fs.readFileSync(path.join(home, 'board', '3-build', 'card.md'), 'utf8') === 'work in flight\n');

  // Idempotent: a second run must not clobber the destination with a later, emptier attempt.
  fs.mkdirSync(path.join(r, 'board'), { recursive: true });
  fs.writeFileSync(path.join(r, 'board', 'stray.md'), 'later junk\n');
  const again = migrateIntoHome(r);
  check('a second run refuses rather than overwriting what is already in ~/.nexa',
    again.kept.some((k) => k.rel === 'board' && /already present/.test(k.why))
      && fs.readFileSync(path.join(home, 'board', '3-build', 'card.md'), 'utf8') === 'work in flight\n');

  // A directory git cannot answer for is treated as tracked — the safe direction.
  const notGit = repo({ init: false });
  fs.mkdirSync(path.join(notGit, 'board'), { recursive: true });
  check('a non-git directory is treated as tracked, so nothing is moved',
    migratable(notGit, 'board') === false);
}

console.log('\n▸ bin/ — every bare command resolves to a script that is actually there');
{
  const binDir = path.join(ROOT, 'plugin', 'bin');
  const bins = fs.readdirSync(binDir);
  check('there is at least one command', bins.length > 0);
  // **Nothing delegates outside the plugin any more.** The council is vendored at
  // scripts/council/, so nexa-council and nexa-council-watch both point at plugin scripts like
  // every other wrapper. The exemption set is kept, empty, because an exemption that quietly
  // becomes unnecessary is the shape that hid two defects in this card already — an empty set
  // states "none, deliberately" where a deleted one states nothing.
  const DELEGATES = new Set();
  const broken = [];
  const unexecutable = [];
  for (const b of bins) {
    const body = fs.readFileSync(path.join(binDir, b), 'utf8');
    if (!DELEGATES.has(b)) {
      // Subdirectories allowed: the vendored council lives at scripts/council/, so
      // `nexa-council-watch` points at scripts/council/watch.mjs. The narrower pattern matched
      // no path with a slash in it and reported a working wrapper as broken.
      const m = body.match(/scripts\/([\w./-]+\.mjs)/);
      if (!m || !fs.existsSync(path.join(ROOT, 'plugin', 'scripts', m[1]))) broken.push(b);
    }
    try { fs.accessSync(path.join(binDir, b), fs.constants.X_OK); } catch { unexecutable.push(b); }
  }
  check('no wrapper is exempt — every one points at a script inside the plugin',
    DELEGATES.size === 0);
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

// ── removal must not delete work, and must still find its record ─────────────
//
// Four parallel readers attacked the undo path and three defects survived refutation, each
// reproduced by running it rather than reading it. These are those reproductions.
console.log('\n▸ removal — the files this workspace tells you to fill in');
{
  const r = repo();
  boot(r);
  fs.writeFileSync(path.join(r, 'AGENTS.md'), '# my real contract\n');
  fs.appendFileSync(path.join(stateRoot(r), 'docs', 'DECISIONS.md'), '\n## a decision I made\n');
  const res = remove(r);

  // The hash guard used to cover only the merged settings file. Everything created was deleted
  // unconditionally — including the three files whose templates say "replace this".
  check('REFUSES to delete an AGENTS.md the user has written into',
    fs.existsSync(path.join(r, 'AGENTS.md')), 'weeks of contract, unrecoverable');
  check('...and a DECISIONS.md they appended to',
    fs.existsSync(path.join(stateRoot(r), 'docs', 'DECISIONS.md')));
  check('...and names them rather than skipping quietly', res.keptBack.length === 2, JSON.stringify(res.keptBack));
  // THE SILENT CASE: untouched files must still go, or removal removes nothing.
  check('...while a file nobody touched is still removed', !fs.existsSync(path.join(r, 'CLAUDE.md')));
}
{
  // The manifest was keyed by the repository's realpath — a mutable name. Renaming the repo
  // orphaned the record permanently, because decide() then answers "already initialised" and
  // never writes another one.
  const r = repo();
  boot(r);
  const moved = `${r}-renamed`;
  fs.renameSync(r, moved);
  trash.push(moved);
  const res = remove(moved);
  check('a renamed repository still finds its own record',
    res.reason === 'removed and tombstoned', res.reason);
  check('...and is actually emptied, not just reported',
    fs.readdirSync(moved).filter((x) => x !== '.git').length === 0,
    fs.readdirSync(moved).join(', '));
  check('...which needs relative paths in the manifest, not absolute ones',
    res.removed.length > 10, `${res.removed.length} removed`);
}

// ── verify-install: the harness that must refuse to report ───────────────────
//
// Its two arms need a live authenticated session, so they are run by hand. What is testable —
// and what actually failed — is the judgement of whether a session ran at all. The first
// version isolated CLAUDE_CONFIG_DIR, every session died with "Not logged in", and the harness
// reported five PASSES including "git status is unchanged after a session": true only because
// nothing had happened.
console.log('\n▸ verify-install — a harness that cannot fail its own control is worthless');
{
  const { sessionUsable } = await import(path.join(ROOT, 'scripts', 'verify-install.mjs'));
  check('a normal session passes and is usable', sessionUsable({ out: 'READY' }) === true);
  check('REFUSES an unauthenticated session — the false-pass that shipped',
    sessionUsable({ out: 'Not logged in · Please run /login' }) === false);
  check('...and a bad key', sessionUsable({ out: 'Invalid API key · Please run /login' }) === false);
  check('...and an exhausted balance, which also answers nothing',
    sessionUsable({ out: 'Credit balance is too low' }) === false);
  check('...and a timeout, whatever it printed', sessionUsable({ out: 'READY', timedOut: true }) === false);
  check('an empty transcript is allowed through — the arms judge that, not this',
    sessionUsable({ out: '' }) === true);
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

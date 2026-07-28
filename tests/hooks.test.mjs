#!/usr/bin/env node
// The hooks, tested — including watched failing.
//
// Written 2026-07-28 after reviewing worldflowai/everything-claude-code, whose sharpest
// contribution was not a skill or an agent: it was having a tests/ directory for its hooks
// at all. This workspace had six hooks, a contract whose §4 says "a guard nobody has watched
// fail is not a guard", and no automated test for any of them. Every one had been verified by
// piping JSON in by hand — once, unrepeatably, and never in CI.
//
//   node tests/hooks.test.mjs
//
// Each case states what it proves. The blocking cases matter most: a guard that stops
// blocking is silent, and silence is indistinguishable from "nothing was wrong".

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const HOOKS = path.join(ROOT, 'scripts', 'hooks');
const PRODUCT = path.join(ROOT, 'code', 'src', 'anything.js');

let pass = 0;
let fail = 0;

const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

/**
 * Run a hook with stdin, return {code, stdout, stderr}. Never throws.
 *
 * spawnSync rather than execFileSync deliberately: execFileSync only hands back stderr on
 * failure, so a hook that allows *and warns* looked silent. The first version of this file
 * used it and reported a false failure against NEXA_NO_CARD — the test was wrong, not the
 * hook, which is its own small argument for testing the tests.
 */
function run(script, input = {}, env = {}) {
  const r = spawnSync('node', [script], {
    input: JSON.stringify(input),
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  return { code: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** Put a card in 3-build for the duration of fn, then remove it. */
function withCardInBuild(body, fn) {
  const dir = path.join(ROOT, 'board', '3-build');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, '999-test-fixture.md');
  fs.writeFileSync(file, body);
  try { return fn(file); } finally { fs.rmSync(file, { force: true }); }
}

console.log('═'.repeat(72));
console.log('  HOOKS — including the failures, watched');
console.log('═'.repeat(72));

// ── guard-edit: the only hook that blocks ────────────────────────────────────
console.log('\n▸ guard-edit — refuses product-code edits that belong to no card');
{
  const g = path.join(HOOKS, 'guard-edit.mjs');
  const edit = { tool_name: 'Edit', tool_input: { file_path: PRODUCT } };

  // WATCHED FAILING #1 — nothing in build.
  const none = run(g, edit);
  check('blocks when board/3-build is empty', none.code === 2, `exit ${none.code}`);
  check('...and says why, on stderr where the model reads it',
    /BLOCKED/.test(none.stderr) && /3-build/.test(none.stderr));

  // The escape hatch has to work, or people delete the guard instead of using it.
  check('NEXA_NO_CARD=1 allows, and is not silent',
    run(g, edit, { NEXA_NO_CARD: '1' }).code === 0 && /NEXA_NO_CARD/.test(run(g, edit, { NEXA_NO_CARD: '1' }).stderr));

  // WATCHED FAILING #2 — a card exists but skipped 2-plan.
  withCardInBuild('# 999\n\nNo ladder here.\n', () => {
    const r = run(g, edit);
    check('blocks a card with no reuse ladder recorded', r.code === 2, `exit ${r.code}`);
    check('...and names the missing section', /graphify explain/.test(r.stderr));
  });

  // The allow path — a guard that never allows is just an outage.
  withCardInBuild('# 999\n\n```\ngraphify explain "x"\n```\n', () => {
    check('allows when one planned card is in build', run(g, edit).code === 0);
  });

  // WATCHED FAILING #3 — WIP limit.
  withCardInBuild('# 999\n\ngraphify explain "x"\n', () => {
    const second = path.join(ROOT, 'board', '3-build', '998-second.md');
    fs.writeFileSync(second, '# 998\n\ngraphify explain "y"\n');
    try {
      const r = run(g, edit);
      check('blocks when two cards are in build (WIP=1)', r.code === 2, `exit ${r.code}`);
      check('...and lists both, so the human can pick', /999-test-fixture/.test(r.stderr) && /998-second/.test(r.stderr));
    } finally { fs.rmSync(second, { force: true }); }
  });


  // ── the shell bypass the council found ────────────────────────────────────
  //
  // WAS OPEN: this hook was wired only to Write|Edit|NotebookEdit, so a shell command writing
  // the same file was never seen. Four of five council members named it independently. The
  // session that built this workspace used sed -i, printf >> and python heredocs throughout.
  const bash = (command) => run(g, { tool_name: 'Bash', tool_input: { command } });

  for (const [what, cmd] of [
    ['redirect', 'echo x > code/src/backdoor.js'],
    ['append', 'printf "x" >> code/src/auth.js'],
    ['sed -i', 'sed -i "" "s/a/b/" code/src/tools.js'],
    ['tee', 'cat foo | tee code/src/db.js'],
    ['cp', 'cp /tmp/x code/src/y.js'],
  ]) check(`blocks a shell ${what} into product code`, bash(cmd).code === 2, cmd.slice(0, 40));

  // The allow path matters more here than anywhere else: a guard that blocks `grep` gets
  // switched off within an hour, and then nothing is guarded at all.
  for (const [what, cmd] of [
    ['grep', 'grep -rn "policy" code/src/tools.js'],
    ['cat', 'cat code/src/auth.js | head -20'],
    ['running a test', 'node code/test/pricing.mjs'],
    ['npm', 'npm run test:offline'],
    ['git diff', 'git diff code/src/db.js'],
    ['writing outside product code', 'echo hi > /tmp/scratch.txt'],
    ['editing a workspace doc', 'sed -i "" "s/a/b/" docs/LEARNED.md'],
    ['redirect to /dev/null', 'ls code/src/ > /dev/null'],
  ]) check(`allows ${what}`, bash(cmd).code === 0, cmd.slice(0, 38));

  // Honest limit, stated as a test so nobody mistakes it for coverage: a shell is a
  // programming language and a determined bypass is always available. This catches the
  // careless case, which is the one that happens.
  check('does NOT claim to stop a constructed path — known limit',
    bash('P=code/src/x.js; echo hi > "$P"').code === 0, 'answered by review and git diff, not a matcher');

  // Scope: it must ignore everything that is not product code, or it gets switched off.
  check('ignores workspace edits',
    run(g, { tool_input: { file_path: path.join(ROOT, 'board', '1-spec', 'x.md') } }).code === 0);
  check('ignores plan edits', run(g, { tool_input: { file_path: path.join(ROOT, 'plan', 'SPEC.md') } }).code === 0);
  check('does not crash on empty input', run(g, {}).code === 0);
}

// ── save-prompt: must never block, and must scrub ────────────────────────────
console.log('\n▸ save-prompt — records prompts without ever interrupting one');
{
  const s = path.join(HOOKS, 'save-prompt.mjs');
  const dir = path.join(ROOT, 'docs', 'prompts');
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const file = path.join(dir, `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}.md`);
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;

  // The four secret SHAPES that have appeared in this project's prompts — synthetic values.
  // The first version used a real (expired) OAuth code copied from the prompt history, and
  // scan-secrets caught it in this file. Allowlisting it would have been the wrong fix:
  // test data derived from a real credential does not belong in a repo about to be pushed.
  const secrets = {
    prompt: 'ssh root@203.0.113.10 Ex4mpleP4ssw0rd,x and TWILIO_AUTH_TOKEN=EXAMPLEtokenEXAMPLE99 '
      + 'and callback?code=ac_EXAMPLEexampleEXAMPLEexample00 and sk-proj-EXAMPLEexampleEXAMPLE00',
  };
  check('exits 0 (a logger must never block a prompt)', run(s, secrets).code === 0);

  const written = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  check('scrubs an ssh password', !/Ex4mpleP4ssw0rd/.test(written));
  check('scrubs a token assignment', !/EXAMPLEtokenEXAMPLE99/.test(written));
  check('scrubs an OAuth code', !/ac_EXAMPLEexample/.test(written));
  check('scrubs an sk- key', !/sk-proj-EXAMPLE/.test(written));
  check('still records something readable', /ssh|«/.test(written));

  check('ignores slash commands', run(s, { prompt: '/compact' }).code === 0);
  check('survives malformed input', run(s, {}).code === 0);

  // Leave the log as it was — a test that pollutes the record is a test that gets deleted.
  if (before === null) fs.rmSync(file, { force: true });
  else fs.writeFileSync(file, before);
}

// ── the non-blocking hooks: the only requirement is that they never break a session ──
console.log('\n▸ the rest — must be unable to break a session');
for (const h of ['session-start.mjs', 'after-edit.mjs', 'session-end.mjs']) {
  const p = path.join(HOOKS, h);
  if (!fs.existsSync(p)) { check(`${h} exists`, false); continue; }
  check(`${h} exits 0 on normal input`, run(p, { tool_input: { file_path: 'x.md' } }).code === 0);
  check(`${h} exits 0 on garbage input`, run(p, { nonsense: true }).code === 0);
}

// ── pre-compact: the one chance to write down what the summary will blur ─────
console.log('\n▸ pre-compact — records what CLAUDE.md says compaction loses');
{
  const p = path.join(HOOKS, 'pre-compact.mjs');
  const dir = path.join(ROOT, 'docs', 'compactions');
  const before = fs.existsSync(dir) ? fs.readdirSync(dir) : null;

  check('exits 0 (must never be able to fail a compaction)', run(p, {}).code === 0);

  // `._x.md` are macOS AppleDouble files — this drive is exFAT, so they appear beside every
  // written file and they sort FIRST. check.mjs documents this hazard; the first version of
  // this test read one and reported four false failures against a hook that was working.
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('._')) : [];
  const written = files.length ? fs.readFileSync(path.join(dir, files[0]), 'utf8') : '';
  check('records the board state', /in build|1-spec/.test(written));
  check('records the working tree', /Working tree/.test(written));
  check('records HEAD', /\*\*HEAD:\*\*/.test(written));
  check('prompts for the decision that is not yet written down', /DECISIONS\.md/.test(written));
  // Item 4 cannot be gathered mechanically. A file that quietly omitted it would read as
  // complete, which is the failure this project keeps finding in its own artifacts.
  check('says out loud that measurements are NOT captured', /measurements|Item 4/.test(written));

  check('survives garbage input', run(p, { nonsense: true }).code === 0);
  if (before === null) fs.rmSync(dir, { recursive: true, force: true });
}

// ── the settings drift check: it must know about every hook we actually declare ──
console.log('\n▸ settings drift — the check must not be blind to a hook we added');
{
  const declared = new Set();
  for (const f of ['.claude/settings.json', 'code/.claude/settings.json']) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    for (const k of Object.keys(JSON.parse(fs.readFileSync(p, 'utf8')).hooks ?? {})) declared.add(k);
  }
  const known = fs.readFileSync(path.join(ROOT, 'scripts', 'check.mjs'), 'utf8')
    .match(/const HOOK_EVENTS = \[([^\]]+)\]/)?.[1] ?? '';
  const missing = [...declared].filter((e) => !known.includes(`'${e}'`));
  // This caught PreCompact on the day it was added: the hook was wired on both sides and the
  // drift check could not see it, so a one-sided removal would have gone unnoticed.
  check('check.mjs knows every hook event that is declared', missing.length === 0,
    missing.length ? `blind to: ${missing.join(', ')}` : `${declared.size} events`);
}


// ── prompt-check: cheap, and silent when there is nothing to say ────────────
console.log('\n\u25b8 prompt-check \u2014 silence in the normal case IS the feature');
{
  const pc = path.join(HOOKS, 'prompt-check.mjs');
  const state = path.join(ROOT, 'docs', '.prompt-check-state.json');
  const saved = fs.existsSync(state) ? fs.readFileSync(state, 'utf8') : null;

  check('exits 0 (UserPromptSubmit: a non-zero exit BLOCKS the prompt)', run(pc, {}).code === 0);

  // Prime the memory, then confirm the same state says nothing. WAS THE RISK: reporting an
  // absolute count fired on every prompt, because 45 uncommitted files is a standing state.
  run(pc, {});
  check('says nothing when the state has not changed', run(pc, {}).stdout.trim() === '');

  // WATCHED SPEAKING: WIP over the limit.
  const dir = path.join(ROOT, 'board', '3-build');
  fs.mkdirSync(dir, { recursive: true });
  const a = path.join(dir, '901-fixture-a.md');
  const b = path.join(dir, '902-fixture-b.md');
  fs.writeFileSync(a, '# a\n'); fs.writeFileSync(b, '# b\n');
  const wip = run(pc, {});
  check('speaks when WIP exceeds 1', /WIP is 2/.test(wip.stdout));
  check('...inside a tag the model can recognise', /<workspace-state>/.test(wip.stdout));
  fs.rmSync(a, { force: true }); fs.rmSync(b, { force: true });

  // WATCHED SPEAKING: a stale reflection, which refuses the next commit anyway.
  const learned = path.join(ROOT, 'docs', 'LEARNED.md');
  const orig = fs.readFileSync(learned, 'utf8');
  fs.writeFileSync(learned, orig.replace(/reflected-at: [0-9a-f]+/, 'reflected-at: 0000000'));
  check('speaks when the reflection is stale', /reflection is stale/i.test(run(pc, {}).stdout));
  fs.writeFileSync(learned, orig);

  // It must cost little enough that nobody notices it on every prompt.
  const t0 = Date.now(); run(pc, {}); const ms = Date.now() - t0;
  check('costs under 600ms', ms < 600, `${ms}ms`);

  check('back to silent once the state is clean', run(pc, {}).stdout.trim() === '');
  if (saved === null) fs.rmSync(state, { force: true }); else fs.writeFileSync(state, saved);
}

// ── reflect --check: staleness, and the fail-open bug it used to have ────────
console.log('\n▸ reflect --check — staleness, and the case that silently read as "current"');
{
  const r = path.join(ROOT, 'scripts', 'reflect.mjs');
  const learned = path.join(ROOT, 'docs', 'LEARNED.md');
  const original = fs.existsSync(learned) ? fs.readFileSync(learned, 'utf8') : null;

  const runCheck = () => {
    try { execFileSync('node', [r, '--check'], { cwd: ROOT, stdio: 'pipe' }); return 0; }
    catch (e) { return e.status ?? -1; }
  };

  // Pin the marker to HEAD rather than trusting the repo's ambient state. The first version
  // asserted the *current* state passes, so it failed the moment a reflection fell due — a
  // test that goes red because unrelated work happened teaches people to ignore red.
  if (original !== null) {
    const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    fs.writeFileSync(learned, original.replace(/reflected-at: (?:[0-9a-f]+|INITIAL)/i, `reflected-at: ${head}`));
    check('passes when the marker is current', runCheck() === 0);
    fs.writeFileSync(learned, original);
  } else check('LEARNED.md exists', false);

  // WATCHED FAILING — this returned 0 until 2026-07-28: `git log <bad>..HEAD` failed, the
  // empty result looked like "no new commits", and a broken marker read as up to date.
  if (original !== null) {
    fs.writeFileSync(learned, original.replace(/reflected-at: [0-9a-f]+/, 'reflected-at: 0000000'));
    check('refuses an unresolvable reflected-at marker', runCheck() === 1);

    fs.writeFileSync(learned, original.replace(/<!--\s*reflected-at:[^>]*-->/, ''));
    check('refuses when the marker is missing entirely', runCheck() === 1);

    fs.rmSync(learned);
    check('refuses when LEARNED.md does not exist', runCheck() === 1);
    fs.writeFileSync(learned, original);
  }
}

console.log(`\n${'─'.repeat(72)}`);

// ── guard-edit: the destructive-git family ───────────────────────────────────
//
// Added 2026-07-28, the day this workspace's own agent destroyed two days of uncommitted
// work with `git checkout src/pricing.js`. The one blocking hook did not see it: it watched
// for WRITES, and this was a DISCARD. See board/6-done/004-pricing-restored.md.
//
// The guard asks git what would actually be lost, so these run against a throwaway repo
// rather than against this one — a test that depends on the working tree's mood is a test
// that fails on a clean checkout.
{
  console.log('\n▸ guard-edit refuses to discard uncommitted work');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-discard-'));
  const git = (...a) => spawnSync('git', a, { cwd: tmp, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'src', 'pricing.js'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(tmp, 'package-lock.json'), '{}\n');
  git('add', '-A'); git('commit', '-qm', 'base');
  // The state that matters: one file with work nobody has committed.
  fs.writeFileSync(path.join(tmp, 'src', 'pricing.js'), 'export const a = 2; // uncommitted\n');

  const guard = path.join(HOOKS, 'guard-edit.mjs');
  const fire = (command, env = {}) =>
    run(guard, { tool_name: 'Bash', cwd: tmp, tool_input: { command } }, env);

  // Blocks: the command that actually caused the loss, and its whole-tree relatives.
  for (const cmd of [
    'git checkout src/pricing.js', 'git checkout .', 'git checkout -- .',
    'git restore src', 'git reset --hard', 'git reset --hard HEAD',
    'git reset --hard origin/main', 'git clean -fd', 'git clean -fdx',
    'git stash', 'git stash push', 'git stash -u',
  ]) check('blocks ' + cmd, fire(cmd).code === 2);

  // `git reset --hard HEAD` is listed above on purpose. The first version of this guard
  // matched `reset\s+(?:-[^\s]+\s+)*--hard`, whose optional flag group swallowed `--hard`
  // itself — so the literal never matched and the command it was written to stop went
  // through. Sixth control in this workspace wrong on its first version; all six failed OPEN.
  check('and the block names what would be lost',
    /pricing\.js/.test(fire('git checkout src/pricing.js').stderr));

  // Silent: nothing here loses work, and a guard that fires on these gets switched off.
  for (const cmd of [
    'git reset HEAD~1', 'git reset src/pricing.js', 'git checkout main',
    'git checkout -b feat/x', 'git checkout package-lock.json',
    'git stash list', 'git stash show', 'git stash pop', 'git stash apply',
    'git log --oneline', 'git diff --stat', 'git clean -n', 'git status',
  ]) check('allows ' + cmd, fire(cmd).code === 0);

  check('a deliberate override still works', fire('git checkout .', { NEXA_ALLOW_DISCARD: '1' }).code === 0);

  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`  ${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\n  A hook that stopped guarding is silent. That is why these exist.\n');
  process.exit(1);
}
console.log('\n  Every blocking path above was watched blocking, not assumed to.\n');

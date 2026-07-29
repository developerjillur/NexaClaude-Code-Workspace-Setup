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

// ── the board this suite assumes ─────────────────────────────────────────────
//
// Most assertions below expect an EMPTY 3-build, because that is the state in which the guard
// refuses. A workspace with work in flight has a card there, and every one of those
// assertions then reports a hole in the guard that is the guard working correctly — 23 of
// them, in the workspace that had a card, while the one that did not showed 169 green.
//
// **Third time today a test measured its environment instead of its subject.** So the suite
// owns the state it depends on: park anything real, restore it on the way out, and park it
// BESIDE itself because os.tmpdir() is often another volume and rename across volumes throws.
// A `.bak` suffix, because the guard counts `.md` and a parked card must not be one.
const BUILD_DIR = path.join(ROOT, 'board', '3-build');
const parkedCards = [];
if (fs.existsSync(BUILD_DIR)) {
  for (const f of fs.readdirSync(BUILD_DIR)) {
    if (!f.endsWith('.md') || f.startsWith('._')) continue;
    const from = path.join(BUILD_DIR, f), to = path.join(BUILD_DIR, `.parked-${f}.bak`);
    fs.renameSync(from, to);
    parkedCards.push([to, from]);
  }
}
const restoreCards = () => {
  for (const [from, to] of parkedCards) { try { fs.renameSync(from, to); } catch { /* already back */ } }
  parkedCards.length = 0;
};
process.on('exit', restoreCards);
process.on('SIGINT', () => { restoreCards(); process.exit(130); });

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
      check('...and says WHICH rule refused, not only that something did',
        /^refused: wip-limit$/m.test(r.stderr));
    } finally { fs.rmSync(second, { force: true }); }
  });

  // ── the rule-id pilot, and the case that measures it ────────────────────────
  //
  // The fixture above is isolating by luck: both its cards carry a reuse ladder, so deleting
  // the WIP rule lets the edit through and `=== 2` notices. **This one is genuinely
  // over-determined** — neither card has a ladder, so with WIP enforced the WIP rule refuses,
  // and with WIP deleted the reuse-ladder rule refuses the very same input. Identical exit
  // code either way.
  //
  // Measured, not reasoned, on the same input:
  //
  //     WIP rule present  →  refused: wip-limit        exit 2
  //     WIP rule deleted  →  refused: no-reuse-ladder  exit 2
  //
  // **The first version of this fixture gave the second card a ladder** and the comment claimed
  // it demonstrated the point. It did not: `cards[0]` after sorting was `997`, which had the
  // ladder, so deleting the WIP rule produced exit **0** and the exit code caught it after all.
  // A confident claim about confounding, itself unconfounded, in the block written to explain
  // confounding — found by running it instead of trusting it.
  withCardInBuild('# 999\n\nNo ladder.\n', () => {
    const second = path.join(ROOT, 'board', '3-build', '997-also.md');
    fs.writeFileSync(second, '# 997\n\nNo ladder either.\n');
    try {
      const r = run(g, edit);
      check('an over-determined case still refuses', r.code === 2);
      check('...and names wip-limit specifically, which the exit code cannot',
        /^refused: wip-limit$/m.test(r.stderr));
      check('...and NOT the other rule that would also have fired',
        !/^refused: no-reuse-ladder$/m.test(r.stderr));
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
  // STABLE, not empty. The first version asserted an empty output, which held only in a
  // workspace with nothing in flight — and prompt-check reports standing facts (a stale
  // reflection, a graph behind the tree) that no amount of priming clears. **The design
  // guarantees it speaks about CHANGES, so what must hold is that the same state twice says
  // the same thing**, not that it says nothing.
  run(pc, {});
  const first = run(pc, {}).stdout.trim();
  check('says the same thing when the state has not changed', run(pc, {}).stdout.trim() === first);
  check('...and does not repeat the drift line it already reported',
    (first.match(/uncommitted/g) ?? []).length <= 1);

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
  fs.writeFileSync(learned, orig.replace(/reflected-at: (?:[0-9a-f]+|INITIAL)/i, 'reflected-at: 0000000'));
  check('speaks when the reflection is stale', /reflection is stale/i.test(run(pc, {}).stdout));
  fs.writeFileSync(learned, orig);

  // It must cost little enough that nobody notices it on every prompt.
  const t0 = Date.now(); run(pc, {}); const ms = Date.now() - t0;
  check('costs under 600ms', ms < 600, `${ms}ms`);

  check('back to its baseline once the state is clean', run(pc, {}).stdout.trim() === first);
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
    fs.writeFileSync(learned, original.replace(/reflected-at: (?:[0-9a-f]+|INITIAL)/i, 'reflected-at: 0000000'));
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


// ── the pipeline has to survive a clone ──────────────────────────────────────
//
// The first published version of this repo shipped WITHOUT board/, because git does not
// track empty directories. guard-edit then looked for cards in a directory that did not
// exist, found nothing to complain about, and **passed silently** — the workspace's one
// blocking hook, off by default, in the exact state a new user would first meet it.
//
// Caught by cloning into a clean directory and firing the guard, not by reading the code.
{
  console.log('\n▸ The board survives a clone');

  // A fresh clone has no council — it is fetched, not vendored — and the gate used to report
  // that as three failures blaming the README: "says 24 scripts, there are 9". Every one named
  // the wrong cause. **A gate that points at the wrong file with total confidence is worse
  // than one that stays quiet**, so the counts that depend on the council are not checked
  // until it is there, and the skill link gets a soft "run setup" instead of a hard failure.
  {
    const links = ['scripts/council', '.agents/skills/council', '.council-src'];
    const saved = [];
    for (const l of links) {
      const p = path.join(ROOT, l);
      try { saved.push([p, fs.readlinkSync(p)]); fs.unlinkSync(p); } catch { /* not linked */ }
    }
    try {
      if (saved.length) {
        const r = spawnSync('node', [path.join(ROOT, 'scripts', 'check.mjs')], { cwd: ROOT, encoding: 'utf8' });
        check('the gate passes on a clone where the council is not fetched yet', r.status === 0);
        check('...and says so, rather than blaming the README', /council/i.test(r.stdout));
      }
    } finally {
      for (const [p, target] of saved) { try { fs.symlinkSync(target, p); } catch { /* back already */ } }
    }
  }

  const STAGES = ['0-discovery', '0-backlog', '1-spec', '2-plan', '3-build', '4-review',
    '5-verify', '6-done', '7-operate'];
  for (const st of STAGES) {
    check(`board/${st} is tracked`, fs.existsSync(path.join(ROOT, 'board', st, '.gitkeep')));
  }
  // The consequence, asserted directly rather than inferred from the directory listing.
  const guard = path.join(HOOKS, 'guard-edit.mjs');
  const build = path.join(ROOT, 'board', '3-build');
  const stray = fs.existsSync(build) ? fs.readdirSync(build).filter((f) => f.endsWith('.md')) : [];
  if (!stray.length) {
    check('with an empty 3-build, an edit to product code is REFUSED',
      run(guard, { tool_name: 'Write', tool_input: { file_path: path.join(ROOT, 'code', 'x.js') } }).code === 2);

    // The same file, named through an UNRESOLVED symlink. On macOS /var is a link to
    // /private/var, so a shell hands over `/var/...` while ROOT is `/private/var/...`;
    // path.relative between them yielded `../../..`, the file read as outside the workspace,
    // and the guard passed silently. Found by cloning to a temp dir and firing it by hand.
    const unresolved = ROOT.startsWith('/private/') ? ROOT.slice('/private'.length) : null;
    if (unresolved && fs.existsSync(unresolved)) {
      check('...and still refused when the path arrives unresolved (/var vs /private/var)',
        run(guard, { tool_name: 'Write', tool_input: { file_path: path.join(unresolved, 'code', 'x.js') } }).code === 2);
    }
  }
}


// ── codeDirs, the three shapes a real project actually uses ──────────────────
//
// Each of these broke a different version of isCode, and every break was silent:
//   inside      matched the string `code/` anywhere, so other repositories needed a card here
//   outside     anchored with path.relative, so `../my-app` produced `..` and was DISCARDED —
//               the product tree unguarded whenever addressed by its real path
//   absolute    the same, via a fully-qualified sibling
{
  console.log('\n▸ codeDirs works for code inside, beside, and elsewhere');
  const guard = path.join(HOOKS, 'guard-edit.mjs');
  const cfgPath = path.join(ROOT, 'workspace.config.json');
  const saved = fs.existsSync(cfgPath) ? fs.readFileSync(cfgPath, 'utf8') : null;
  const sibling = fs.mkdtempSync(path.join(os.tmpdir(), 'sibling-'));
  const stranger = fs.mkdtempSync(path.join(os.tmpdir(), 'stranger-'));
  fs.mkdirSync(path.join(stranger, 'code'), { recursive: true });
  const setDirs = (dirs) => fs.writeFileSync(cfgPath,
    JSON.stringify({ ...(saved ? JSON.parse(saved) : {}), codeDirs: dirs }, null, 2));
  const fire = (f) => run(guard, { tool_name: 'Write', tool_input: { file_path: f } }).code;
  try {
    setDirs(['code']);
    check('inside: our code needs a card', fire(path.join(ROOT, 'code', 'x.js')) === 2);
    check('inside: a doc does not', fire(path.join(ROOT, 'README.md')) === 0);
    check("inside: another repo's code/ is not ours",
      fire(path.join(stranger, 'code', 'x.js')) === 0);

    setDirs([sibling]);
    check('absolute: a configured sibling repo needs a card',
      fire(path.join(sibling, 'src', 'api.js')) === 2);
    check('absolute: an unconfigured stranger still does not',
      fire(path.join(stranger, 'code', 'x.js')) === 0);
    check('absolute: code/ is no longer guarded once it is not configured',
      fire(path.join(ROOT, 'code', 'x.js')) === 0);
  } finally {
    if (saved !== null) fs.writeFileSync(cfgPath, saved);
    fs.rmSync(sibling, { recursive: true, force: true });
    fs.rmSync(stranger, { recursive: true, force: true });
  }
}


// ── the Bash write-detector, both directions ─────────────────────────────────
//
// The blocking half and the SILENT half, because this detector produced three false
// positives in one sitting and each one is a reason somebody switches the guard off:
//
//   a bare word from prose inside a heredoc, resolved against a cwd that happened to be the
//     product repo, so a command that wrote nothing at all was refused
//   shell syntax the hook cannot evaluate, guessed at anyway
//   tee folded in with cp/mv, whose destination is the LAST argument — tee's is the FIRST,
//     so a tee into product code had its destination read as the input file and was allowed.
//     That one is the opposite direction: a real hole, found by a probe that RAN the
//     commands instead of reading the pattern.
{
  console.log('\\n▸ Bash write-detection — what it catches and what it must ignore');
  const guard = path.join(HOOKS, 'guard-edit.mjs');
  const fire = (command) =>
    run(guard, { tool_name: 'Bash', cwd: ROOT, tool_input: { command } }).code;

  const q = String.fromCharCode(62);          // >   built, not typed
  const app = q + q;                          // >>
  const code = ['code', 'src'].join('/');

  const SILENT = [
    ['prose in a heredoc', 'python3 - <<PY\\ns = "**Each fix broke it"\\nPY'],
    ['unexpanded shell syntax', 'node x.mjs "$(pwd)/a" "$(pwd)"'],
    ['a redirect to /dev/null', 'echo hello ' + q + ' /dev/null'],
    ['reading, not writing', 'grep -r "code/" .'],
    ['a path inside a sentence', 'echo "see code/src for details"'],
  ];
  for (const [why, cmd] of SILENT) check('ignores ' + why, fire(cmd) === 0);

  const BLOCKED = [
    ['a redirect into product code', 'echo x ' + q + ' ' + code + '/thing.js'],
    ['an append into product code', 'printf hi ' + app + ' ' + code + '/append.js'],
    ['sed -i on product code', "sed -i '' s/a/b/ " + code + '/server.js'],
    ['cp into product code', 'cp /tmp/x ' + code + '/y.js'],
    ['tee into product code (its destination is the FIRST arg)',
      'tee ' + code + '/z.js < /tmp/x'],
  ];
  for (const [why, cmd] of BLOCKED) check('refuses ' + why, fire(cmd) === 2);

  // A leading `cd` changes what a relative path means. Ignoring it resolved every relative
  // token against the session's cwd, and when that cwd sat inside a guarded tree, an edit to
  // a file in a DIFFERENT repository was refused. Three real commands were blocked this way
  // before it was found — the third false positive of the same family.
  {
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'elsewhere-'));
    try {
      check('a leading cd means relative paths are relative to THERE',
        fire(`cd "${elsewhere}" && echo x ${String.fromCharCode(62)} notes.md`) === 0);
      check('...and a cd back INTO the guarded tree still refuses',
        fire(`cd "${ROOT}" && echo x ${String.fromCharCode(62)} code/src/thing.js`) === 2);
    } finally { fs.rmSync(elsewhere, { recursive: true, force: true }); }
  }

}


// ── card-gate — the refusal that turns two skills into gates ─────────────────
//
// The SILENT case first. Ten controls in this workspace were wrong on their first version and
// every one was found by the case it should ignore — this one included: it looked for the
// answer after a colon, so `**Who asked?** Priya` read as unanswered and a card that had done
// all the work was refused.
{
  console.log('\n▸ card-gate — cards must carry what their stage requires');
  const gate = path.join(ROOT, 'scripts', 'card-gate.mjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cardgate-'));
  const mk = (stage, name, body) => {
    const d = path.join(tmp, 'board', stage);
    fs.mkdirSync(d, { recursive: true });
    const f = path.join(d, name);
    fs.writeFileSync(f, body);
    return f;
  };
  const fire = (f) => spawnSync('node', [gate, f], { encoding: 'utf8' }).status;

  const ANSWERED = [
    '# a card that did the work',
    '**Who asked?** Priya, who runs the Ealing branch, twice in October.',
    '**What they do today instead?** A paper list by the till, retyped on Sunday.',
    '**What breaks for them if this never exists?** ~40 minutes a week, two bookings lost.',
    '**What number moves?** Sunday admin minutes: 40 now, under 10 is success.',
    '**What would make us stop?** She still keeps the paper list a month after launch.',
    '**Where errors surface:** the shared ops inbox, checked before opening.',
  ].join('\n');

  check('a bare idea may sit in 0-discovery', fire(mk('0-discovery', 'a.md', '# idea\n\nsomething\n')) === 0);
  check('an answered card passes at 1-spec', fire(mk('1-spec', 'b.md', ANSWERED)) === 0);
  check('...and at 6-done, with errors named', fire(mk('6-done', 'c.md', ANSWERED)) === 0);
  check('card-gate refuses headings with nothing under them',
    fire(mk('1-spec', 'd.md', '# x\n**Who asked?**\n**What they do today instead?**\n')) === 1);
  check('card-gate refuses TBD / n/a / ??? as answers',
    fire(mk('1-spec', 'e.md', '# x\n**Who asked?** TBD\n**What number moves?** n/a\n')) === 1);
  check('card-gate refuses a card that reached 3-build having answered nothing',
    fire(mk('3-build', 'f.md', '# x\n\nstraight to build\n')) === 1);
  check('card-gate refuses 6-done with nowhere named for errors',
    fire(mk('6-done', 'g.md', ANSWERED.replace(/\*\*Where errors surface.*/, ''))) === 1);

  // ── the two above refuse for the wrong reason, and did so silently ──────────
  //
  // `kill-audit` neutered `EMPTY` — the list that rejects TBD / n/a / ??? — and the suite
  // stayed green. Card `e.md` is refused whether or not that list works, because it also omits
  // three questions outright. Same for the kill condition: nothing here answers four and drops
  // only the fifth.
  //
  // **A fixture that differs from the passing one in more than one way proves neither.** The
  // repair is to change exactly one thing, from a card already known to pass.
  check('card-gate refuses a placeholder where a real answer would pass — one word changed',
    fire(mk('1-spec', 'h.md', ANSWERED.replace(/(\*\*What number moves\?\*\*).*/, '$1 TBD'))) === 1);
  check('card-gate refuses a card missing only the kill condition',
    fire(mk('1-spec', 'i.md', ANSWERED.replace(/\*\*What would make us stop\?\*\*.*\n?/, ''))) === 1);

  fs.rmSync(tmp, { recursive: true, force: true });
}


// ── the gate must EXIT, not merely print ─────────────────────────────────────
//
// The eleventh control in this workspace to fail open, and it was introduced while fixing a
// council's criticism that controls here only advise. The card-gate block was inserted AFTER
// check.mjs's summary, so bad() printed five refusals and the process still exited 0 — output
// that looks exactly like a working gate and is not one.
//
// Asserting the printed text would have passed. Only the exit code catches it.
{
  console.log('\n▸ check.mjs refuses, rather than reporting a refusal');
  const gate = path.join(ROOT, 'scripts', 'check.mjs');
  const probe = path.join(ROOT, 'board', '1-spec', '999-exit-probe.md');
  const runGate = () => spawnSync('node', [gate], { cwd: ROOT, encoding: 'utf8' });

  // BASELINE-RELATIVE on purpose. The first version asserted "a clean board exits 0", which
  // tested the board rather than the gate — a real workspace has cards in flight, and two
  // legitimate ones failed it immediately. What must hold is that the probe CHANGES the
  // outcome and removing it puts it back.
  const before = runGate();
  const countRefusals = (s) => (s.match(/❌/g) || []).length;
  const baseline = countRefusals(before.stdout);

  fs.writeFileSync(probe, '# 999 — skipped discovery\n\nJust build it.\n');
  let during;
  try { during = runGate(); } finally { fs.rmSync(probe, { force: true }); }

  check('an unanswered card ADDS refusals to the TOTAL, not just the display',
    countRefusals(during.stdout) > baseline || /and \d+ more/.test(during.stdout));
  check('...and the gate EXITS non-zero, which is the part that was broken', during.status === 1);

  const after = runGate();
  check('and the exit code returns to its baseline once removed', after.status === before.status);
  check('...with the refusal count back where it started', countRefusals(after.stdout) === baseline);
}

// ── a cd anywhere in the chain moves what a relative path means ──────────────
//
// Anchored on ^ at first, so `node build.mjs && cd /elsewhere && echo x > notes.md` still
// resolved notes.md against the session cwd. Fourth false positive of this family; each one
// blocked real work.
{
  console.log('\n▸ guard-edit follows a cd wherever it appears');
  const guard = path.join(HOOKS, 'guard-edit.mjs');
  const fire = (command) =>
    run(guard, { tool_name: 'Bash', cwd: ROOT, tool_input: { command } }).code;
  const away = fs.mkdtempSync(path.join(os.tmpdir(), 'away-'));
  const gt = String.fromCharCode(62);
  try {
    check('a cd mid-chain moves where relative paths point',
      fire(`node x.mjs && cd "${away}" && echo x ${gt} notes.md`) === 0);
    check('a leading cd still does', fire(`cd "${away}" && echo x ${gt} notes.md`) === 0);
    check('a cd INTO the guarded tree still refuses',
      fire(`node x.mjs && cd "${ROOT}" && echo x ${gt} code/src/a.js`) === 2);
    check('no cd at all still refuses', fire(`echo x ${gt} code/src/a.js`) === 2);

  // A RELATIVE cd moves the base too. Counting only absolute ones was the sixth false positive
  // of this family: a file written inside a throwaway clone was judged against the product repo.
  {
    const nest = path.join(away, 'w');
    fs.mkdirSync(nest, { recursive: true });
    check('a relative cd moves the base too',
      fire(`cd "${away}" && cd w && printf x ${gt} notes.md`) === 0);
  }


  // `.` and `..` are never redirect targets, and fs.existsSync says yes to both — so a
  // sentence containing "> ." resolved to the cwd, and with that cwd inside a guarded tree
  // the guard refused a command that wrote nothing at all. Fifth false positive of this
  // family, and the first where the EXISTENCE CHECK was the hole.
  check('prose containing a caret and a dot is not a write', fire('node -e "ends with >. So"') === 0);
  check('nor is a caret and two dots', fire('echo "docs > .. more"') === 0);

  } finally { fs.rmSync(away, { recursive: true, force: true }); }
}


// ── graph-fresh — a stale graph does not error, it answers ───────────────────
//
// The silent case first, as always. Twelve controls here were wrong on their first version
// and every one was caught by the case it should ignore.
{
  console.log('\n▸ graph-fresh — is the graph describing code that still exists');
  const script = path.join(ROOT, 'scripts', 'graph-fresh.mjs');
  const mk = ({ graph = 'fresh', dirty = false, extra = false } = {}) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-'));
    fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
    fs.copyFileSync(script, path.join(root, 'scripts', 'graph-fresh.mjs'));
    fs.writeFileSync(path.join(root, 'workspace.config.json'), JSON.stringify({ codeDirs: ['code'] }));
    const code = path.join(root, 'code');
    fs.mkdirSync(path.join(code, 'src'), { recursive: true });
    fs.writeFileSync(path.join(code, 'src', 'a.js'), 'export const a = 1;\n');
    const g = (...a) => spawnSync('git', a, { cwd: code, encoding: 'utf8' });
    g('init', '-q'); g('config', 'user.email', 't@t'); g('config', 'user.name', 't');
    g('add', '-A'); g('commit', '-qm', 'base');
    if (graph !== 'none') {
      const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: code, encoding: 'utf8' }).stdout.trim();
      fs.mkdirSync(path.join(code, 'graphify-out'), { recursive: true });
      fs.writeFileSync(path.join(code, 'graphify-out', 'graph.json'), JSON.stringify({
        nodes: [{ source_file: 'src/a.js' }], links: [{ source: 'a', target: 'a' }],
        built_at_commit: graph === 'dangling' ? '0'.repeat(40) : head,
      }));
      g('add', '-A'); g('commit', '-qm', 'graph');
    }
    if (dirty) fs.writeFileSync(path.join(code, 'src', 'a.js'), 'export const a = 2; // uncommitted\n');
    if (extra) fs.writeFileSync(path.join(code, 'src', 'b.js'), 'export const b = 2;\n');
    return root;
  };
  const fire = (root) => spawnSync('node', [path.join(root, 'scripts', 'graph-fresh.mjs')], { cwd: root, encoding: 'utf8' }).status;
  const once = (opts, want, why) => {
    const r = mk(opts);
    try { check(why, fire(r) === want); } finally { fs.rmSync(r, { recursive: true, force: true }); }
  };
  once({}, 0, 'a current graph on a clean tree says nothing');
  once({ dirty: true }, 1, 'uncommitted source the graph cannot know about is refused');
  once({ extra: true }, 1, 'a source file never indexed is refused');
  once({ graph: 'dangling' }, 1, 'a built_at_commit that does not resolve is refused');
  once({ graph: 'none' }, 1, 'no graph at all, while the contract says to query one');
}


// ── guard-wakeup — a timer is not a substitute for finishing ─────────────────
//
// A real session scheduled a five-minute wakeup whose own reason began "Nothing external to
// wait on". Eight items left, nothing to wait for, and a timer between each one. The silent
// cases are written first, as always — a guard that refuses a legitimate wakeup gets switched
// off, and then the one it exists for goes through.
{
  console.log('\n▸ guard-wakeup — waiting is for things outside this session');
  const guard = path.join(HOOKS, 'guard-wakeup.mjs');
  const fire = (tool_input, tool_name = 'ScheduleWakeup') =>
    run(guard, { tool_name, tool_input }).code;

  const SILENT = [
    ['polling CI at its own pace', { delaySeconds: 480, reason: 'watching the CI run, about 8 minutes' }],
    ['a short delay that names a deploy', { delaySeconds: 300, reason: 'the deploy pipeline goes green in five' }],
    ['waiting on the council', { delaySeconds: 900, reason: 'the council takes 10-30 minutes' }],
    ['a long fallback needs no justification', { delaySeconds: 1800, reason: 'idle tick' }],
    ['stop: true, always', { stop: true }],
    ['a rate-limit cooldown', { delaySeconds: 60, reason: 'waiting for the rate-limit cooldown' }],
  ];
  for (const [why, inp] of SILENT) check('allows ' + why, fire(inp) === 0);
  check('ignores a different tool entirely', fire({ command: 'echo hi' }, 'Bash') === 0);

  const REFUSED = [
    ['the reported wakeup verbatim', { delaySeconds: 300, reason: 'Nothing external to wait on — next item is the Gas Safe finding, so a short tick so research starts with clean context rather than mid-turn.' }],
    ['the same admission in other words', { delaySeconds: 300, reason: 'nothing to wait for, just pacing' }],
    ['"purely a pacing tick"', { delaySeconds: 600, reason: 'no external signal; purely a pacing tick' }],
    ['a short delay naming nothing outside', { delaySeconds: 180, reason: 'continuing the to-do list' }],
    ['a short delay with no reason at all', { delaySeconds: 120, reason: '' }],
  ];
  for (const [why, inp] of REFUSED) check('refuses ' + why, fire(inp) === 2);

  // ── the five above prove an exit code, not a rule ───────────────────────────
  //
  // `scripts/kill-audit.mjs` deleted the "nothing to wait on" pattern — the one written for
  // the reported incident, matching its reason verbatim — and **every assertion above stayed
  // green.** The reason carries `delaySeconds: 300`, so the SHORT-DELAY rule blocked it just
  // the same, and `=== 2` cannot tell the two apart.
  //
  // **The fixture that must fail differed from the passing one in more than one way**, so it
  // proved neither. The same defect turned up in three other places in this suite on the same
  // run. Two fixes, and both are about isolating the variable:
  //
  //   · a case only rule 1 can catch — a LONG delay, where the short-delay rule cannot fire
  //   · assert on WHICH refusal came back, not merely that one did
  {
    const long = fire({ delaySeconds: 3600, reason: 'Nothing external to wait on — picking the rest up next tick.' });
    check('refuses an admission of nothing pending even at a long delay, where only that rule can fire',
      long === 2);

    const verbatim = run(guard, { tool_name: 'ScheduleWakeup', tool_input: REFUSED[0][1] });
    check('...and the verbatim incident is refused BY that rule, not by the delay rule',
      /in its own reason/.test(verbatim.stderr));

    const short = run(guard, { tool_name: 'ScheduleWakeup', tool_input: REFUSED[3][1] });
    check('...and the short-delay refusal is still attributed to the delay rule',
      /does not name what it is waiting for/.test(short.stderr));
  }
}


// ── the four controls that had no fixtures at all ────────────────────────────
//
// Found by scripts/guard-coverage.mjs on its first run — including itself, which is the
// correct answer and slightly embarrassing. Silent case first for each, because fifteen
// controls here were wrong on their first version and not one was found the other way.
{
  console.log('\n▸ depth-check — real code, or six shapes of stub');
  const depth = path.join(ROOT, 'scripts', 'depth-check.mjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'depth-'));
  const write = (name, body) => { const f = path.join(tmp, name); fs.writeFileSync(f, body); return f; };
  const fire = (f) => spawnSync('node', [depth, f], { cwd: ROOT, encoding: 'utf8' }).status;

  const REAL = [
    'export function price(usage, rates) {',
    '  const input = usage.inputTokens ?? 0;',
    '  const cached = Math.min(usage.cachedTokens ?? 0, input);',
    '  return ((input - cached) * rates.in + cached * rates.cached) / 1e6;',
    '}',
  ].join('\n');
  check('depth-check allows real code with branches and arithmetic', fire(write('real.mjs', REAL)) === 0);
  check('depth-check allows a short but genuine function',
    fire(write('short.mjs', 'export const add = (a, b) => a + b;\n')) === 0);

  check('depth-check refuses a body that only throws not-implemented',
    fire(write('stub.mjs', 'export function go() {\n  throw new Error("not implemented");\n}\n')) === 1);
  check('depth-check refuses an empty catch',
    fire(write('swallow.mjs', 'export async function go(f) {\n  try { await f(); } catch (e) {\n  }\n}\n')) === 1);

  fs.rmSync(tmp, { recursive: true, force: true });
}

{
  console.log('\n▸ verify-claims — does a card cite things that exist');
  const vc = path.join(ROOT, 'scripts', 'verify-claims.mjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'claims-'));
  fs.mkdirSync(path.join(tmp, 'board', '5-verify'), { recursive: true });
  const card = (name, body) => {
    const f = path.join(tmp, 'board', '5-verify', name);
    fs.writeFileSync(f, body);
    return f;
  };
  const fire = (f) => spawnSync('node', [vc, f], { cwd: ROOT, encoding: 'utf8' }).status;

  // Cites only things that are true of THIS repo, so it must stay quiet.
  const HONEST = [
    '# 900 — an honest card', '',
    '**Proved by** \`scripts/check.mjs\`, which exists.', '',
    'Run \`npm run check\` — it is a real script in package.json.', '',
    '\`\`\`', '  ✅ everything green', '\`\`\`', '',
  ].join('\n');
  check('verify-claims allows a card whose citations resolve', fire(card('900-honest.md', HONEST)) === 0);

  const LYING = [
    // The FIRST version put the citation in free prose, and verify-claims said "all claims
    // resolve" — because it reads the STRUCTURED sections (§2's file table, §1's "Proved
    // by"), not every backtick in the document. The control was right; the fixture missed the
    // path. **A fixture that misses the path is indistinguishable from a control that does.**
    '# 901 — a card citing what is not there', '',
    '## 2 · Plan', '',
    '| File | Change |', '|---|---|', '| \`scripts/does-not-exist.mjs\` | invented |', '',
    '**Proved by.** \`tests/no-such-suite.mjs\`', '',
  ].join('\n');
  check('verify-claims refuses a card citing a file that does not exist',
    fire(card('901-lying.md', LYING)) === 1);

  // ── the pair above is confounded, and the audit said so ─────────────────────
  //
  // `901-lying.md` cites a missing planned file AND a missing proof, so deleting the
  // "Proved by" check leaves the planned-file check to refuse it identically. `kill-audit`
  // neutered that rule and nothing went red. **Fifth instance of the same law in one day:** a
  // fixture that differs from the passing case in more than one way proves neither.
  //
  // Note the trailing period — verify-claims reads `**Proved by.**`, and the honest card above
  // writes `**Proved by**`, so its citation was never parsed at all. It passed for a third
  // reason again.
  //
  // And these assert the MESSAGE, not the exit code. Writing the mutation for this rule, the
  // obvious edit (`if (!real) bad(` → `if (false) bad(`) fell through to the `else` and read a
  // null path — so the control **crashed**, node exited 1, and an exit-code assertion accepted
  // a stack trace as a refusal. One bit cannot distinguish "refused" from "died", which is the
  // coarse-oracle problem underneath every survivor found today.
  const PROOF = (test) => ['# 902 — one variable', '', `**Proved by.** \`${test}\``, ''].join('\n');
  const run902 = (f) => spawnSync('node', [vc, f], { cwd: ROOT, encoding: 'utf8' });

  const good = run902(card('902-real-proof.md', PROOF('tests/hooks.test.mjs')));
  check('verify-claims allows a card whose "Proved by" names a suite that exists',
    good.status === 0 && /exists with \d+ assertion/.test(good.stdout));

  const bad_ = run902(card('903-fake-proof.md', PROOF('tests/no-such-suite.mjs')));
  check('...and refuses the same card with only that one name changed',
    bad_.status === 1 && /does not exist: tests\/no-such-suite\.mjs/.test(bad_.stdout));
  check('...refusing it by that rule rather than by dying', !/TypeError|at Object\./.test(bad_.stderr));

  fs.rmSync(tmp, { recursive: true, force: true });
}

{
  console.log('\n▸ council-sync --check — is the council there, and current');
  const sync = path.join(ROOT, 'scripts', 'council-sync.mjs');
  const r = spawnSync('node', [sync, '--check'], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  // Either answer is legitimate; what must hold is that it SAYS which, and never crashes.
  check('council-sync --check reports rather than crashing', r.status === 0 || r.status === 1);
  check('...and names the council in what it says', /council/i.test(r.stdout + r.stderr));
  // Run in a throwaway root rather than by unlinking the live .council-src. Touching the
  // real one to test it is how a test breaks the thing it is testing.
  check('council-sync --check refuses when the council is absent', (() => {
    const t = fs.mkdtempSync(path.join(os.tmpdir(), 'nocouncil-'));
    fs.mkdirSync(path.join(t, 'scripts'), { recursive: true });
    fs.copyFileSync(sync, path.join(t, 'scripts', 'council-sync.mjs'));
    try {
      return spawnSync('node', [path.join(t, 'scripts', 'council-sync.mjs'), '--check'],
        { cwd: t, encoding: 'utf8' }).status === 1;
    } finally { fs.rmSync(t, { recursive: true, force: true }); }
  })());
}

{
  console.log('\n▸ guard-coverage — the gate that found the four above, tested by its own rule');
  const gc = path.join(ROOT, 'scripts', 'guard-coverage.mjs');
  const r = spawnSync('node', [gc, '--json'], { cwd: ROOT, encoding: 'utf8' });
  let out = { controls: [], findings: [] };
  try { out = JSON.parse(r.stdout); } catch { /* leave empty, the checks below will say */ }

  check('guard-coverage allows a control with both directions covered',
    (out.controls ?? []).some((c) => c.name === 'guard-edit' && c.refuses > 0 && c.silent > 0));
  check('...and finds guard-edit specifically, rather than nothing at all',
    (out.controls ?? []).some((c) => c.name === 'guard-edit'));
  check('guard-coverage refuses a control with no fixtures, and names it',
    (() => {
      // A control with no assertions anywhere must be reported. Simulated rather than
      // asserted: a throwaway script that can exit 1, and no test mentioning it.
      // The name is BUILT at run time. Writing it as a literal put it in this suite's own
      // source, so guard-coverage found "assertions" for it — this very block — and reported
      // it as covered. **A probe whose name appears in the thing it probes measures nothing.**
      const probeName = ['zz', String(process.pid), 'probe'].join('-') + '.mjs';
      const probe = path.join(ROOT, 'scripts', probeName);
      fs.writeFileSync(probe, '#!/usr/bin/env node\nprocess.exit(1);\n');
      try {
        const x = spawnSync('node', [gc, '--json'], { cwd: ROOT, encoding: 'utf8' });
        const j = JSON.parse(x.stdout || '{}');
        return x.status === 1 && (j.findings ?? []).some((f) => f.name === probeName.replace(/\.mjs$/, ''));
      } catch { return false; } finally { fs.rmSync(probe, { force: true }); }
    })());

  // ── the probe above has NO assertions, so it can only prove one branch ──────
  //
  // `kill-audit` deleted the `no-silent-case` branch entirely and this block stayed green: a
  // control with nothing written about it trips `no-refusal-case` first and never reaches it.
  // **So the branch aimed at the direction all fifteen defects came from was itself untested.**
  //
  // This probe carries a refusal assertion and no silent one — one variable changed from the
  // case above — which is the only shape that reaches the second branch.
  check('guard-coverage refuses a control watched refusing but never staying silent',
    (() => {
      const name = ['zz', String(process.pid), 'halfprobe'].join('-');
      const probe = path.join(ROOT, 'scripts', `${name}.mjs`);
      const spec = path.join(ROOT, 'tests', `${name}.test.mjs`);
      // Built at run time for the same reason as above: a literal here would put the name in
      // this file, and guard-coverage would read this comment as the fixture.
      // Wording matters — it must trip REFUSES and must not trip SILENT, or the probe tests
      // the classifier's vocabulary instead of the branch.
      //
      // The name goes on a line ABOVE the assertion, the way every real block here is written.
      // Putting it inside the assertion string does not work: guard-coverage slices from where
      // the name first appears, so a `check(` earlier on the SAME line falls outside the slice
      // and the assertion is not counted. A real limitation, found by this fixture — and not
      // one worth another control, because every suite here already writes the banner first.
      fs.writeFileSync(probe, '#!/usr/bin/env node\nprocess.exit(1);\n');
      fs.writeFileSync(spec, `// ${name}\ncheck('blocks a bad input', fire() === 2);\n`);
      try {
        const x = spawnSync('node', [gc, '--json'], { cwd: ROOT, encoding: 'utf8' });
        const j = JSON.parse(x.stdout || '{}');
        const f = (j.findings ?? []).find((k) => k.name === name);
        return x.status === 1 && f?.kind === 'no-silent-case';
      } catch { return false; } finally {
        fs.rmSync(probe, { force: true });
        fs.rmSync(spec, { force: true });
      }
    })());
}


// ── mutate-controls — would the suite notice a control being switched off? ────
//
// guard-coverage proves the assertions EXIST. This asks the harder question: break each
// control the way thirteen of sixteen actually broke — turn its refusal into a pass — and see
// whether anything goes red. A mutation that SURVIVES is a control nothing is really watching.
//
// It is not run inside this suite, because it runs this suite. Asserted here on its shape and
// its refusal instead: it must report per-control, and it must exit non-zero when a mutation
// survives.
{
  console.log('\n▸ mutate-controls — a control that can be silently disabled');
  const mut = path.join(ROOT, 'scripts', 'mutate-controls.mjs');

  check('mutate-controls exists and parses',
    spawnSync('node', ['--check', mut], { encoding: 'utf8' }).status === 0);

  const src = fs.readFileSync(mut, 'utf8');
  check('it restores every file it mutates, in a finally', /finally\s*\{[^}]*writeFileSync/.test(src));
  check('it refuses — exits non-zero — when a mutation survives', /process\.exit\(survived \? 1 : 0\)/.test(src));
  check('it stays silent when every mutation is caught',
    /survived \? 1 : 0/.test(src) && !/process\.exit\(1\);\s*$/.test(src.trim()));
  check('it resolves its own root rather than naming a machine',
    /fileURLToPath\(import\.meta\.url\)/.test(src) && !/\/Volumes\//.test(src));
  check('it refuses to run at all on an already-red suite, rather than reporting nonsense',
    /already red/.test(src));
}

// ── kill-audit — is each PROTECTION watched, or only each control? ────────────
//
// `mutate-controls` turns a control's `exit(2)` into `exit(0)`: is this control watched at
// all? Answered — five of five. A council put the harder question after it:
//
//   "guard-coverage proves only that assertion TEXT exists on both sides. Everything between
//    the text and the behaviour is invisible to it."
//
// So kill-audit deletes ONE REAL RULE at a time — the `tee` pattern, the placeholder list, the
// uncommitted-work check — leaving the control otherwise fully alive. A control can be watched
// and still have nine of its ten rules unwatched.
//
// **These two assertions RUN it**, in a scratch workspace, rather than reading its source —
// because reading the source is the exact weakness being answered. Grepping a file that greps
// files proves nothing twice.
{
  console.log('\n▸ kill-audit — a protection that could be deleted in silence');
  const audit = path.join(ROOT, 'scripts', 'kill-audit.mjs');

  check('kill-audit exists and parses',
    spawnSync('node', ['--check', audit], { encoding: 'utf8' }).status === 0);

  /**
   * A throwaway workspace with ONE control and ONE suite, so every branch of the audit is
   * reachable in milliseconds. The fake control refuses two inputs; the fake suite only ever
   * checks the first. That asymmetry is the point — it makes a genuine survivor available
   * without waiting twenty-five minutes for the real run.
   */
  const scratch = (kills, { suiteExit = null } = {}) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'killaudit-'));
    fs.mkdirSync(path.join(d, 'tests'), { recursive: true });
    fs.mkdirSync(path.join(d, 'scripts'), { recursive: true });
    fs.copyFileSync(audit, path.join(d, 'scripts', 'kill-audit.mjs'));
    fs.writeFileSync(path.join(d, 'scripts', 'check.mjs'), 'process.exit(0);\n');
    fs.writeFileSync(path.join(d, 'scripts', 'fake-control.mjs'),
      "const a = process.argv[2] ?? '';\n"
      + "if (a === 'watched') process.exit(1);\n"
      + "if (a === 'unwatched') process.exit(1);\n"
      + 'process.exit(0);\n');
    fs.writeFileSync(path.join(d, 'tests', 'only.mjs'), suiteExit !== null
      ? `process.exit(${suiteExit});\n`
      : "import { spawnSync } from 'node:child_process';\n"
        + "const f = (a) => spawnSync('node', ['scripts/fake-control.mjs', a]).status;\n"
        + "if (f('watched') !== 1) process.exit(1);\n"   // the rule with a fixture
        + "if (f('') !== 0) process.exit(1);\n"          // and its silent case
        + 'process.exit(0);\n');
    const kf = path.join(d, 'kills.json');
    fs.writeFileSync(kf, JSON.stringify(kills));
    const r = spawnSync('node', [path.join(d, 'scripts', 'kill-audit.mjs')],
      { cwd: d, encoding: 'utf8', timeout: 180000, env: { ...process.env, NEXA_KILLS_FILE: kf } });
    const control = fs.readFileSync(path.join(d, 'scripts', 'fake-control.mjs'), 'utf8');
    fs.rmSync(d, { recursive: true, force: true });
    return { ...r, control };
  };

  const K = (id, from, to = '') => ({ id, file: 'scripts/fake-control.mjs', what: id, from, to });
  const WATCHED = "if (a === 'watched') process.exit(1);";
  const UNWATCHED = "if (a === 'unwatched') process.exit(1);";

  // SILENT: a mutation the suite notices. Nothing survives, nothing is unresolved, exit 0.
  {
    const r = scratch([K('watched', WATCHED)]);
    check('kill-audit is silent when the suite notices the deletion',
      r.status === 0 && /caught/.test(r.stdout) && !/SURVIVED/.test(r.stdout));
    check('...and puts the control back byte for byte', r.control.includes(WATCHED));
  }

  // REFUSES: a real survivor — a rule with no fixture. This is the whole product.
  {
    const r = scratch([K('unwatched', UNWATCHED)]);
    check('kill-audit refuses when a protection can be deleted unnoticed',
      r.status === 1 && /SURVIVED/.test(r.stdout));
    check('...and still restores the control it broke', r.control.includes(UNWATCHED));
  }

  // REFUSES: the fail-open a council read off the source and a run then confirmed.
  // `--only=does-not-exist` printed "0 caught, 0 survived" and exited 0 — an audit that tested
  // nothing, reporting success, inside the file built to find exactly that.
  {
    const r = scratch([K('watched', WATCHED)]);
    const one = spawnSync('node', [audit, '--only=no-such-mutation'], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
    check('kill-audit refuses an --only that names no mutation, rather than testing nothing',
      one.status === 2 && /matches no mutation/.test(one.stderr));
    check('...and a valid selection is still accepted', r.status === 0);
  }

  // REFUSES: a pattern that no longer matches means the CONTROL was edited and the audit was
  // not. It used to vanish from the report — excluded from numerator and denominator both —
  // so the audit converged on printing success while testing less and less.
  {
    const r = scratch([K('drifted', 'a string that is not in the control')]);
    check('kill-audit refuses a mutation whose pattern has drifted, instead of silently skipping it',
      r.status === 1 && /unresolved/.test(r.stdout));
  }

  // REFUSES: a red baseline cannot tell you anything about coverage. Every mutation would read
  // "caught" from a suite already failing for an unrelated reason — the most flattering
  // possible wrong answer.
  {
    const r = scratch([K('watched', WATCHED)], { suiteExit: 1 });
    check('kill-audit refuses to audit against an already-red suite',
      r.status !== 0 && /already red/.test(r.stdout));
  }

  // A timeout is not a catch. spawnSync returns status: null when it kills a child, and
  // null !== 0 — so the first version scored an infrastructure failure as a successful catch.
  check('a run that could not complete is separated from one that refused',
    /no exit status|ETIMEDOUT/.test(fs.readFileSync(audit, 'utf8')));

  check('it restores on exit, not only in a finally',
    /process\.on\('exit', restoreAll\)/.test(fs.readFileSync(audit, 'utf8')));
}

// ── scan-secrets — the credential gate, which had no test at all ─────────────
//
// `kill-audit` deleted four of its rules in turn — the AWS pattern, the `password = "…"`
// pattern, the entire git-history pass, and finally its exit code, so that it could find every
// secret in the tree and **report success** — and all four survived. Every suite stayed green.
//
// The cause is worse than a missing test. `guard-coverage` reported it **✅ 1 refuse · 1
// silent**, because the string "scan-secrets" appears in a PROSE COMMENT inside the prompt
// scrubber's block, and the collector counted that block's assertions as its fixtures.
//
// **So the metacontrol read a comment as coverage for the deploy gate that keeps credentials
// out of a public repo.** That is the council's criticism at full strength — "everything
// between the text and the behaviour is invisible to it" — and here even the text was not a
// fixture.
//
// These run the scanner for real, in a throwaway git repo, because that is the only way to
// separate the tree pass from the history pass. Values are synthetic: `AKIA` + sixteen A-Z0-9
// is the shape, not a key.
{
  console.log('\n▸ scan-secrets — a real repo, a real secret, a real refusal');
  const src = path.join(ROOT, 'scripts', 'scan-secrets.mjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'secrets-'));

  /** A git repo with `files`, then optionally a second commit applying `then`. */
  const repo = (files, then) => {
    const d = fs.mkdtempSync(path.join(tmp, 'r-'));
    fs.mkdirSync(path.join(d, 'scripts'), { recursive: true });
    fs.copyFileSync(src, path.join(d, 'scripts', 'scan-secrets.mjs'));
    const g = (c) => spawnSync('sh', ['-c', c], { cwd: d, encoding: 'utf8' });
    g('git init -q . && git config user.email t@t && git config user.name t');
    for (const [n, b] of Object.entries(files)) fs.writeFileSync(path.join(d, n), b);
    g('git add -A && git commit -qm one');
    if (then) { then(d); g('git add -A && git commit -qm two'); }
    return d;
  };
  const fire = (d, ...args) => {
    const env = args.includes('--no-pcre') ? { NEXA_SCAN_NO_PCRE: '1' } : {};
    const r = spawnSync('node', [path.join(d, 'scripts', 'scan-secrets.mjs'), ...args.filter((a) => a !== '--no-pcre')],
      { cwd: d, encoding: 'utf8', timeout: 120000, env: { ...process.env, ...env } });
    return { code: r.status, out: r.stdout ?? '' };
  };

  // SILENT first — the direction every defect here came from. A scanner that refuses
  // everything is not a scanner, and this is the case that says it does not.
  {
    const d = repo({ 'a.js': 'export const greet = (n) => `hello ${n}`;\n', 'README.md': '# clean\n' });
    check('scan-secrets is silent on a repo with no secrets', fire(d).code === 0);
  }

  // Each of the next three changes exactly ONE thing from that clean repo — the lesson the
  // first audit taught, applied here from the start rather than after.
  {
    const d = repo({ 'a.js': 'const id = "AKIAEXAMPLE123456ABC";\n' });
    const r = fire(d);
    check('scan-secrets refuses an AWS key id in the tree', r.code === 1);
    check('...and names which pattern matched, rather than only failing', /aws key id/.test(r.out));
  }
  {
    const d = repo({ 'a.js': 'const cfg = { password: "hunter2hunter2hunter2" };\n' });
    check('scan-secrets refuses an assigned password — its broadest rule',
      fire(d).code === 1 && /assigned secret/.test(fire(d).out));
  }

  // The history pass, isolated. The secret is committed and then REMOVED, so the working tree
  // is clean and only a history scan can find it. This is the case that matters in practice:
  // a key that was rotated is still in every clone anyone made.
  {
    const d = repo({ 'a.js': 'const id = "AKIAEXAMPLE123456ABC";\n' },
      (dir) => fs.writeFileSync(path.join(dir, 'a.js'), '// removed\n'));
    check('scan-secrets refuses a secret that survives only in git history', fire(d).code === 1);
    check('...and --tree is silent on the same repo, which is what makes that a history finding',
      fire(d, '--tree').code === 0);

    // The no-PCRE fallback, which otherwise only runs on machines nobody here owns — the
    // condition under which the `-E` path stayed broken from the day it was written.
    check('...and finds it too where git has no PCRE, via the widened fallback',
      fire(d, '--no-pcre').code === 1);
  }

  fs.rmSync(tmp, { recursive: true, force: true });
}


// ── depth-check — the two shapes with no fixture ─────────────────────────────
//
// Six rules, four fixtures. `kill-audit` neutered `stub-return` and `always-true-test` and
// nothing went red. The second is the one that matters most here: an assertion that cannot
// fail is how a suite becomes worthless while its count goes up, which is the failure this
// entire workspace is arranged against.
{
  console.log('\n▸ depth-check — the stub shapes nothing was watching');
  const depth = path.join(ROOT, 'scripts', 'depth-check.mjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'depth2-'));
  const w = (n, b) => { const f = path.join(tmp, n); fs.writeFileSync(f, b); return f; };
  const fire = (f) => spawnSync('node', [depth, f], { cwd: ROOT, encoding: 'utf8' }).status;

  // No parameter, deliberately. Written first as `load(id)`, which trips `unused-param` as
  // well — so `kill-audit` neutered `stub-return` and the fixture still refused, via the other
  // rule. **Third time in one afternoon that a fixture tripping two rules proved neither**, and
  // the third time it was found by mutation rather than by reading. It is not a quirk of this
  // codebase; it is what testing a control that has more than one rule costs.
  check('depth-check refuses a function whose whole body is `return null`',
    fire(w('stub.mjs', 'export function load() {\n  return null;\n}\n')) === 1);
  check('...and allows a one-line getter returning a real field, which is the same shape',
    fire(w('getter.mjs', 'export function id(row) {\n  return row.id;\n}\n')) === 0);

  check('depth-check refuses an assertion that cannot fail',
    fire(w('fake.mjs', "check('it works', true);\n")) === 1);
  check('...and allows one that compares something',
    fire(w('realtest.mjs', "check('it works', total === 42);\n")) === 0);

  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── check.mjs — the deploy gate, which had no fixture of its own ─────────────
//
// The audit's scope report named it unaudited, and a council split on how much that matters:
// the **operational** priority, because it is the deploy gate — against needs-it-least, because
// its own refusal protects a number in a doc header. Both are about different risks, and the
// one that decides it is that **check.mjs DELEGATES**. A lost child verdict silently disables
// another control's findings without touching that control at all, so the mutation is invisible
// from anywhere except here.
//
// The oracle has to name the missing gate, not observe "exit 1 somewhere" — otherwise deleting
// the card-gate delegation is masked by any other failure, which is the confounding law again,
// one level up.
//
// This plants a deficient card on the REAL board, because check.mjs reads the whole workspace
// and a scratch copy would fail for twenty unrelated reasons. It is removed in a `finally` and
// again on `exit`: a test that can leave a card on the board is a test that changes WIP.
{
  console.log('\n▸ check.mjs — the gate that delegates');
  const gate = path.join(ROOT, 'scripts', 'check.mjs');
  const planted = path.join(ROOT, 'board', '1-spec', `.probe-${process.pid}.md`);
  const cleanup = () => { try { fs.rmSync(planted, { force: true }); } catch { /* already gone */ } };
  process.on('exit', cleanup);

  const before = spawnSync('node', [gate], { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
  check('check.mjs passes on this workspace before anything is planted', before.status === 0);

  try {
    // A card at 1-spec answering none of discovery-first's five questions. Nothing else about
    // the workspace changes — one variable.
    fs.writeFileSync(planted, '# probe — a card that skipped discovery\n\nStraight to spec.\n');
    const after = spawnSync('node', [gate], { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
    check('check.mjs refuses when a card reaches 1-spec unanswered', after.status === 1);
    check('...and names card-gate as the gate that refused, not merely "a failure"',
      /card-gate/.test(after.stdout));
    check('...and reports the total unanswered first, rather than only the ones it prints',
      /card-gate: \d+ unanswered/.test(after.stdout));
  } finally {
    cleanup();
  }

  const restored = spawnSync('node', [gate], { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
  check('...and the workspace is green again once the probe is removed', restored.status === 0);

  // guard-coverage's findings reach the gate too, and by a different path — the loop over
  // out.findings rather than a count. Proved with the same half-probe shape used above.
  {
    const name = ['zz', String(process.pid), 'gateprobe'].join('-');
    const probe = path.join(ROOT, 'scripts', `${name}.mjs`);
    fs.writeFileSync(probe, '#!/usr/bin/env node\nprocess.exit(1);\n');
    try {
      const r = spawnSync('node', [gate], { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
      check('check.mjs refuses an untested control, and names it',
        r.status === 1 && new RegExp(name).test(r.stdout));
    } finally { fs.rmSync(probe, { force: true }); }
  }
}

console.log(`  ${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\n  A hook that stopped guarding is silent. That is why these exist.\n');
  process.exit(1);
}
console.log('\n  Every blocking path above was watched blocking, not assumed to.\n');

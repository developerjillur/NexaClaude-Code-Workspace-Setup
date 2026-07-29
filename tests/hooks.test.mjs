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
// ── the product path this suite pokes at ─────────────────────────────────────
//
// Read from `workspace.config.json`, exactly as the guard reads it. **It was hardcoded to
// `code/src/anything.js`, and the moment somebody ran `./setup.sh --code ../their-repo` the
// suite reported 26 failures** — every one of them the guard behaving correctly, because
// `code/` was no longer product code and the fixture was no longer a product file.
//
// A new user's first experience was: install, then watch the test suite fail, and be told by
// setup.sh that the workspace is "not ready". Found by actually doing the install into a
// scratch project rather than by reading the script — the same way every other defect in this
// repo was found.
const PRODUCT = (() => {
  let dirs = ['code'];
  try {
    const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'workspace.config.json'), 'utf8'));
    if (Array.isArray(c.codeDirs) && c.codeDirs.length) dirs = c.codeDirs;
  } catch { /* the guard falls back to code/ too, and so does this */ }
  return path.join(path.resolve(ROOT, dirs[0]), 'src', 'anything.js');
})();
/** The same directory, spelled the way a shell command would write it. */
const PRODUCT_REL = path.relative(ROOT, path.dirname(PRODUCT)).split(path.sep).join('/');

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
  check('...naming the rule: no-card-in-build', /^refused: no-card-in-build$/m.test(none.stderr));

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
    ['redirect', `echo x > ${PRODUCT_REL}/backdoor.js`],
    ['append', `printf "x" >> ${PRODUCT_REL}/auth.js`],
    ['sed -i', `sed -i "" "s/a/b/" ${PRODUCT_REL}/tools.js`],
    ['tee', `cat foo | tee ${PRODUCT_REL}/db.js`],
    ['cp', `cp /tmp/x ${PRODUCT_REL}/y.js`],
  ]) check(`blocks a shell ${what} into product code`, bash(cmd).code === 2, cmd.slice(0, 40));

  // The allow path matters more here than anywhere else: a guard that blocks `grep` gets
  // switched off within an hour, and then nothing is guarded at all.
  for (const [what, cmd] of [
    ['grep', `grep -rn "policy" ${PRODUCT_REL}/tools.js`],
    ['cat', `cat ${PRODUCT_REL}/auth.js | head -20`],
    ['running a test', 'node code/test/pricing.mjs'],
    ['npm', 'npm run test:offline'],
    ['git diff', `git diff ${PRODUCT_REL}/db.js`],
    ['writing outside product code', 'echo hi > /tmp/scratch.txt'],
    ['editing a workspace doc', 'sed -i "" "s/a/b/" docs/LEARNED.md'],
    ['redirect to /dev/null', `ls ${PRODUCT_REL}/ > /dev/null`],
  ]) check(`allows ${what}`, bash(cmd).code === 0, cmd.slice(0, 38));

  // Honest limit, stated as a test so nobody mistakes it for coverage: a shell is a
  // programming language and a determined bypass is always available. This catches the
  // careless case, which is the one that happens.
  check('does NOT claim to stop a constructed path — known limit',
    bash(`P=${PRODUCT_REL}/x.js; echo hi > "$P"`).code === 0, 'answered by review and git diff, not a matcher');

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
    prompt: 'ssh root@203.0.113.10 Ex4mpleP4ssw0rd,x and SERVICE_AUTH_TOKEN=EXAMPLEtokenEXAMPLE99 '
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
  check('...naming the rule: discard-uncommitted',
    /^refused: discard-uncommitted$/m.test(fire('git checkout src/pricing.js').stderr));

  // Silent: nothing here loses work, and a guard that fires on these gets switched off.
  for (const cmd of [
    'git reset HEAD~1', 'git reset src/pricing.js', 'git checkout main',
    'git checkout -b feat/x', 'git checkout package-lock.json',
    'git stash list', 'git stash show', 'git stash pop', 'git stash apply',
    'git log --oneline', 'git diff --stat', 'git clean -n', 'git status',
  ]) check('allows ' + cmd, fire(cmd).code === 0);

  check('a deliberate override still works', fire('git checkout .', { NEXA_ALLOW_DISCARD: '1' }).code === 0);

  // ── the override the refusal ACTUALLY tells you to use ──────────────────────
  //
  // The env var is only reachable when it is exported into the session. As a hook, this runs
  // in a process the agent spawns BEFORE your command, so an inline
  // `NEXA_ALLOW_DISCARD=1 git checkout …` sets the variable for a process that does not exist
  // yet — and the refusal used to instruct exactly that. **An escape hatch that cannot be
  // operated is not an escape hatch**, and a control nobody can live with is a control that
  // gets deleted rather than obeyed. Found by following the instruction and being refused.
  //
  // The marker file is consumed on use, so it cannot become a permanently-on switch the way an
  // exported variable does.
  //
  // The marker lives at the WORKSPACE root, not in the repo being operated on: it is the
  // workspace's control, and a per-repo marker would let any checkout disarm it.
  {
    const marker = path.join(ROOT, '.nexa-allow-discard');
    try {
      fs.writeFileSync(marker, '');
      check('a .nexa-allow-discard marker is honoured', fire('git checkout .').code === 0);
      check('...and consumed, so it cannot be left switched on', !fs.existsSync(marker));
      check('...and the next discard is refused again', fire('git checkout .').code === 2);

      const why = fire('git checkout .').stderr;
      check('the refusal names the override that works', /touch \.nexa-allow-discard/.test(why));
      check('...and says plainly that the inline env var does not',
        /does NOT work/.test(why) && /separate\s*\n?\s*process/.test(why));
      check('...and offers the non-destructive way back', /git show HEAD:/.test(why));
    } finally { fs.rmSync(marker, { force: true }); }
  }

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
      run(guard, { tool_name: 'Write', tool_input: { file_path: path.join(path.dirname(PRODUCT), 'x.js') } }).code === 2);

    // The same file, named through an UNRESOLVED symlink. On macOS /var is a link to
    // /private/var, so a shell hands over `/var/...` while ROOT is `/private/var/...`;
    // path.relative between them yielded `../../..`, the file read as outside the workspace,
    // and the guard passed silently. Found by cloning to a temp dir and firing it by hand.
    const unresolved = ROOT.startsWith('/private/') ? ROOT.slice('/private'.length) : null;
    if (unresolved && fs.existsSync(unresolved)) {
      check('...and still refused when the path arrives unresolved (/var vs /private/var)',
        run(guard, { tool_name: 'Write', tool_input: { file_path: path.join(unresolved, path.relative(ROOT, path.dirname(PRODUCT)), 'x.js') } }).code === 2);
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
  // The configured product directory, not a hardcoded `code/src`. This block reported five
  // failures the moment somebody ran `./setup.sh --code ../their-repo`, and every one of them
  // was the guard behaving correctly on a path that was no longer product code.
  const code = PRODUCT_REL;

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
        fire(`cd "${ROOT}" && echo x ${String.fromCharCode(62)} ${PRODUCT_REL}/thing.js`) === 2);
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
  //
  // And they assert the RULE, from --json, not the exit code — six requirements share one
  // exit code, so `=== 1` is satisfied by any of them.
  const rulesOf = (f) => {
    const r = spawnSync('node', [gate, f, '--json'], { encoding: 'utf8' });
    try { return (JSON.parse(r.stdout || '{}').findings ?? []).map((x) => x.rule); } catch { return []; }
  };
  check('card-gate refuses a placeholder where a real answer would pass — one word changed',
    rulesOf(mk('1-spec', 'h.md', ANSWERED.replace(/(\*\*What number moves\?\*\*).*/, '$1 TBD')))
      .join() === 'the-number-that-moves');
  check('card-gate refuses a card missing only the kill condition',
    rulesOf(mk('1-spec', 'i.md', ANSWERED.replace(/\*\*What would make us stop\?\*\*.*\n?/, '')))
      .join() === 'kill-condition');
  check('card-gate names who-asked when only that is missing',
    rulesOf(mk('1-spec', 'j.md', ANSWERED.replace(/\*\*Who asked\?\*\*.*\n?/, ''))).join() === 'who-asked');
  check('card-gate names todays-workaround when only that is missing',
    rulesOf(mk('1-spec', 'k.md', ANSWERED.replace(/\*\*What they do today instead\?\*\*.*\n?/, '')))
      .join() === 'todays-workaround');
  check('card-gate names cost-of-status-quo when only that is missing',
    rulesOf(mk('1-spec', 'l.md', ANSWERED.replace(/\*\*What breaks for them if this never exists\?\*\*.*\n?/, '')))
      .join() === 'cost-of-status-quo');
  check('card-gate names where-errors-surface at 6-done',
    rulesOf(mk('6-done', 'm.md', ANSWERED.replace(/\*\*Where errors surface.*\n?/, '')))
      .join() === 'where-errors-surface');

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
      fire(`node x.mjs && cd "${ROOT}" && echo x ${gt} ${PRODUCT_REL}/a.js`) === 2);
    check('no cd at all still refuses', fire(`echo x ${gt} ${PRODUCT_REL}/a.js`) === 2);

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
  const mk = ({ graph = 'fresh', dirty = false, extra = false, behind = false } = {}) => {
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
      const body = graph === 'unreadable'
        ? '{ this is not json'
        : JSON.stringify({
          nodes: [{ source_file: 'src/a.js' }], links: [{ source: 'a', target: 'a' }],
          ...(graph === 'no-marker' ? {} : { built_at_commit: graph === 'dangling' ? '0'.repeat(40) : head }),
        });
      fs.writeFileSync(path.join(code, 'graphify-out', 'graph.json'), body);
      g('add', '-A'); g('commit', '-qm', 'graph');
    }
    if (dirty) fs.writeFileSync(path.join(code, 'src', 'a.js'), 'export const a = 2; // uncommitted\n');
    if (extra) fs.writeFileSync(path.join(code, 'src', 'b.js'), 'export const b = 2;\n');
    // A source commit AFTER the graph was built: the graph is valid, resolvable, and stale.
    if (behind) {
      fs.writeFileSync(path.join(code, 'src', 'a.js'), 'export const a = 3; // moved on\n');
      g('add', '-A'); g('commit', '-qm', 'later');
    }
    return root;
  };
  const fire = (root) => spawnSync('node', [path.join(root, 'scripts', 'graph-fresh.mjs')], { cwd: root, encoding: 'utf8' }).status;
  const once = (opts, want, why) => {
    const r = mk(opts);
    try { check(why, fire(r) === want); } finally { fs.rmSync(r, { recursive: true, force: true }); }
  };
  once({}, 0, 'a current graph on a clean tree says nothing');

  // ── each kind named, because seven of them share one exit code ──────────────
  //
  // The five below were all tested, and every assertion said only `=== 1`. Any one of the
  // seven rules could have been deleted and a sibling would have produced the same exit,
  // which is the confounding law this workspace has now met six times.
  const kindsOf = (opts) => {
    const r = mk(opts);
    try {
      const out = spawnSync('node', [path.join(r, 'scripts', 'graph-fresh.mjs')], { cwd: r, encoding: 'utf8' });
      return { status: out.status, kinds: [...(out.stdout ?? '').matchAll(/\[([a-z-]+)\]/g)].map((m) => m[1]) };
    } finally { fs.rmSync(r, { recursive: true, force: true }); }
  };
  const refusesWith = (opts, kind, why) => {
    const r = kindsOf(opts);
    check(why, r.status === 1 && r.kinds.includes(kind));
  };

  refusesWith({ dirty: true }, 'uncommitted', 'graph-fresh names uncommitted — source the graph cannot know about');
  refusesWith({ extra: true }, 'not-indexed', 'graph-fresh names not-indexed — a source file the graph never saw');
  refusesWith({ graph: 'dangling' }, 'dangling-commit', 'graph-fresh names dangling-commit — a built_at_commit that does not resolve');
  refusesWith({ graph: 'none' }, 'absent', 'graph-fresh names absent — no graph, while the contract says to query one');
  refusesWith({ graph: 'unreadable' }, 'unreadable', 'graph-fresh names unreadable — a graph.json that is not JSON');
  refusesWith({ graph: 'no-marker' }, 'no-commit-marker', 'graph-fresh names no-commit-marker — a graph whose age cannot be judged');
  refusesWith({ behind: true }, 'behind-head', 'graph-fresh names behind-head — source committed after the graph was built');
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
    ['the reported wakeup verbatim', { delaySeconds: 300, reason: 'Nothing external to wait on — next item is the certification finding, so a short tick so research starts with clean context rather than mid-turn.' }],
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

    // These assert the rule ID, which is the form that cannot be satisfied by a sibling rule
    // producing the same exit code. Prose was the first fix and it worked; an id is the same
    // idea in a shape `guard-coverage` can also count, so a rule with no fixture naming it is
    // now a refusal rather than something only a careful reader would notice.
    const verbatim = run(guard, { tool_name: 'ScheduleWakeup', tool_input: REFUSED[0][1] });
    check('...and the verbatim incident is refused by admits-nothing-pending, not the delay rule',
      /^refused: admits-nothing-pending$/m.test(verbatim.stderr));

    const short = run(guard, { tool_name: 'ScheduleWakeup', tool_input: REFUSED[3][1] });
    check('...and the short-delay refusal is attributed to short-delay-unexplained',
      /^refused: short-delay-unexplained$/m.test(short.stderr));
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

  // ── the false positive that shipped ─────────────────────────────────────────
  //
  // A card citing `npm run test:offline` — its own product's test command, run and pasted —
  // was refused, because this consulted only the WORKSPACE's package.json. **A card
  // documenting the exact command somebody ran was called a false claim.** That is the
  // false-positive direction, the one that gets a guard switched off within a week.
  //
  // A workspace and the code it guards are two npm projects; either may own the script.
  check('verify-claims allows a card citing a script from the workspace package.json',
    fire(card('904-ws-script.md', '# 904\n\n- [x] `npm run check` green\n')) === 0);
  check('...and still refuses one citing a script that exists in neither',
    fire(card('905-no-script.md', '# 905\n\n- [x] `npm run no-such-script-anywhere` green\n')) === 1);
  check('...and names where it looked, so a genuine miss is debuggable',
    /looked in: /.test(spawnSync('node', [vc, card('906-where.md', '# 906\n\n- [x] `npm run also-not-real` green\n')],
      { cwd: ROOT, encoding: 'utf8' }).stdout));

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

  // ── the per-RULE branches, which are the newest and least watched ───────────
  //
  // `rule-untested` and `rule-declared-not-emitted` are the two checks that upgrade this file
  // from "the control's NAME appears near assertion text" to per-rule coverage. They had no
  // fixtures — the branch that catches unwatched rules was itself an unwatched rule.
  const perRule = (declared, emitted) => {
    const name = ['zz', String(process.pid), declared.replace(/[^a-z]/g, '')].join('-');
    const probe = path.join(ROOT, 'scripts', `${name}.mjs`);
    const spec = path.join(ROOT, 'tests', `${name}.test.mjs`);
    // The control declares `declared` and emits `emitted` — pass them equal for a rule that
    // exists but nothing tests, unequal for one declared and never emitted.
    fs.writeFileSync(probe, `#!/usr/bin/env node\n// @rules ${declared}\nconsole.log('${emitted}');\nprocess.exit(1);\n`);
    fs.writeFileSync(spec, `// ${name}\ncheck('blocks a bad input', fire() === 2);\ncheck('allows a good one', fire() === 0);\n`);
    try {
      const r = spawnSync('node', [gc, '--json'], { cwd: ROOT, encoding: 'utf8' });
      const j = JSON.parse(r.stdout || '{}');
      return (j.findings ?? []).filter((f) => f.name === name).map((f) => f.kind);
    } catch { return []; } finally {
      fs.rmSync(probe, { force: true });
      fs.rmSync(spec, { force: true });
    }
  };

  // The ids are BUILT, not written — spelling one out here puts it in tests/, which is
  // exactly where guard-coverage looks, so the probe would report itself as covered. Third
  // time this trap has been walked into in this file; the two probes above dodge it the same
  // way, and this one did not until it failed.
  const rid = (w) => ['zz', w, 'rule'].join('-');
  check('guard-coverage refuses rule-untested — a rule the control emits and no fixture names',
    perRule(rid('lonely'), rid('lonely')).includes('rule-untested'));
  check('guard-coverage refuses rule-declared-not-emitted — a rule that can never fire',
    perRule(rid('ghost'), 'a-different-string').includes('rule-declared-not-emitted'));
  check('...and a control whose declared rule is emitted AND named is not flagged for either',
    (() => {
      const name = ['zz', String(process.pid), 'bothok'].join('-');
      const probe = path.join(ROOT, 'scripts', `${name}.mjs`);
      const spec = path.join(ROOT, 'tests', `${name}.test.mjs`);
      fs.writeFileSync(probe, `#!/usr/bin/env node\n// @rules happy-rule\nconsole.log('happy-rule');\nprocess.exit(1);\n`);
      fs.writeFileSync(spec, `// ${name}\ncheck('blocks on happy-rule', fire() === 2);\ncheck('allows otherwise', fire() === 0);\n`);
      try {
        const j = JSON.parse(spawnSync('node', [gc, '--json'], { cwd: ROOT, encoding: 'utf8' }).stdout || '{}');
        return !(j.findings ?? []).some((f) => f.name === name);
      } catch { return false; } finally {
        fs.rmSync(probe, { force: true }); fs.rmSync(spec, { force: true });
      }
    })());
}


// ── kill-audit — is each PROTECTION watched, or only each control? ────────────
//
// There used to be a second tool here that flipped a control's `exit(2)` to `exit(0)` and
// asked "is this control watched at all?". **It was retired on measurement, not taste:** it
// listed five controls against this file's nine, every one of them a subset, and by the end it
// was silently SKIPPING two of its five because their code had moved and its patterns had not
// — reporting "5 caught, 0 survived" having tested three. Same skip fail-open this file had,
// still open, in a tool nothing needed.
//
// A council put the harder question that produced this one:
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
    check('kill-audit refuses unknown-only — an --only naming no mutation, rather than testing nothing',
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
    check('kill-audit refuses a red-baseline — auditing against an already-red suite',
      r.status !== 0 && /already red/.test(r.stdout));
  }

  // A timeout is not a catch. spawnSync returns status: null when it kills a child, and
  // null !== 0 — so the first version scored an infrastructure failure as a successful catch.
  check('a run marked incomplete is separated from one that refused',
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
    check('...and names which pattern matched, rather than only failing', /aws-key-id/.test(r.out));
  }
  {
    const d = repo({ 'a.js': 'const cfg = { password: "hunter2hunter2hunter2" };\n' });
    check('scan-secrets refuses an assigned password — its broadest rule',
      fire(d).code === 1 && /assigned-secret/.test(fire(d).out));
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

  // ── every pattern named, because ten patterns share one exit code ───────────
  //
  // One repo carrying one example of each. Values are SHAPES, not keys — `AKIA` plus sixteen
  // upper-alphanumerics is the format, and none of these authenticate anything.
  //
  // Assembled from parts so the literals are not sitting in this file: it is allowlisted in
  // the scanner, but an allowlist is a thing that can be edited, and a fixture that depends on
  // one is a fixture that breaks quietly when somebody tidies it.
  {
    const hex32 = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
    const long = 'EXAMPLEexampleEXAMPLE00';
    const d = repo({
      'k1.js': `const a = "sk-${long}";\n`,
      'k2.js': `const b = "sk-ant-${long}";\n`,
      'k3.js': `const c = "AC${hex32}";\n`,
      'k4.js': `const d = "SK${hex32}";\n`,
      'k5.js': `const e = "gh${'p'}_${long}";\n`,
      'k6.js': `const f = "AKIA${'EXAMPLE123456ABC'}";\n`,
      'k7.pem': `-----BEGIN RSA PRIVATE KEY-----\n`,
      'k8.js': `const g = "eyJ${long}.${long}.sig";\n`,
      'k9.js': `const h = "?code=ac_${long}";\n`,
      'k10.js': `const cfg = { password: "hunter2hunter2hunter2" };\n`,
    });
    const out = fire(d).out;
    for (const id of ['openai-key', 'anthropic-key', 'twilio-sid', 'twilio-api-key', 'github-token',
      'aws-key-id', 'private-key-block', 'jwt', 'oauth-code', 'assigned-secret']) {
      check(`scan-secrets names ${id}`, new RegExp(id).test(out));
    }
  }

  // Both passes announce themselves, so "it scanned nothing" cannot look like "it found
  // nothing" — which is precisely how the history pass hid for as long as it did.
  {
    const d = repo({ 'a.js': 'export const x = 1;\n' });
    const full = fire(d).out;
    check('scan-secrets reports the tree-pass ran, with a count', /\[tree-pass\]\s+\d+ tracked/.test(full));
    check('...and the history-pass, with the git grep flavour it actually used',
      /\[history-pass\]\s+\d+ commits scanned, via git grep -[PE]/.test(full));
    check('...and --tree omits the history-pass rather than reporting an empty one',
      !/\[history-pass\]/.test(fire(d, '--tree').out));
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

  // ── each rule named, because six rules share one exit code ──────────────────
  //
  // Declaring depth-check's rules turned up a gap nothing else had: **`placeholder-value` had
  // no fixture at all.** It was invisible while coverage was counted per FILE, because five
  // sibling rules were well covered and the control read as tested.
  //
  // These assert the rule that fired, from --json, so a fixture cannot be satisfied by a
  // different rule reaching the same verdict.
  const ruleOf = (f) => {
    const r = spawnSync('node', [depth, f, '--json'], { cwd: ROOT, encoding: 'utf8' });
    try { return (JSON.parse(r.stdout || '{}').findings ?? []).map((x) => x.rule); } catch { return []; }
  };
  check('depth-check names stub-return',
    ruleOf(w('r1.mjs', 'export function go() {\n  return null;\n}\n')).includes('stub-return'));
  check('depth-check names empty-catch',
    ruleOf(w('r2.mjs', 'export async function go(f) {\n  try { await f(); } catch (e) {\n  }\n}\n')).includes('empty-catch'));
  check('depth-check names not-implemented',
    ruleOf(w('r3.mjs', 'export function go() {\n  throw new Error("not implemented");\n}\n')).includes('not-implemented'));
  check('depth-check names placeholder-value',
    ruleOf(w('r4.mjs', 'export const host = "changeme";\n')).includes('placeholder-value'));
  check('depth-check names always-true-test',
    ruleOf(w('r5.mjs', "check('it works', true);\n")).includes('always-true-test'));
  check('depth-check names unused-param',
    ruleOf(w('r6.mjs', 'export function handle(args) {\n  return 42;\n}\n')).includes('unused-param'));
  check('...and a real file trips none of the six',
    ruleOf(w('r7.mjs', 'export const add = (a, b) => a + b;\n')).length === 0);

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

// ── ci-code-paths — three states, and the third must not look like the first ──
//
// CI used to name one private repository in three jobs, with hardcoded `code/src`,
// `code/tools`, `code/server.js`. That made this workspace un-adoptable by anyone else, and it
// carried the failure this repo exists to prevent: **grep over a missing directory exits 2,
// which reads as "no matches found"**, so a hygiene job went green having scanned nothing.
//
// So the answer is three-valued. "There is no code here" is a supported setup and passes.
// "Code was configured and is not on disk" is a checkout that failed, and must refuse.
{
  console.log('\n▸ ci-code-paths — is the product code actually here');
  const cp = path.join(ROOT, 'scripts', 'ci-code-paths.mjs');

  /** A scratch workspace with the given config and, optionally, some code in it. */
  const scratch = (cfg, files = {}, env = {}, emptyDirs = []) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cipaths-'));
    fs.mkdirSync(path.join(d, 'scripts'), { recursive: true });
    fs.copyFileSync(cp, path.join(d, 'scripts', 'ci-code-paths.mjs'));
    fs.writeFileSync(path.join(d, 'workspace.config.json'), JSON.stringify(cfg));
    for (const [f, body] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true });
      fs.writeFileSync(path.join(d, f), body);
    }
    for (const dir of emptyDirs) fs.mkdirSync(path.join(d, dir), { recursive: true });
    const r = spawnSync('node', [path.join(d, 'scripts', 'ci-code-paths.mjs')],
      { cwd: d, encoding: 'utf8', env: { ...process.env, CODE_REPO: '', ...env } });
    fs.rmSync(d, { recursive: true, force: true });
    return r;
  };

  // SILENT, twice — the direction every defect in this workspace came from.
  check('a bare workspace with no code passes, and says so',
    (() => { const r = scratch({ codeDirs: ['code'] });
      return r.status === 0 && /workspace-only/.test(r.stdout); })());
  check('...and a workspace WITH code passes, naming what it found',
    (() => { const r = scratch({ codeDirs: ['code'] }, { 'code/index.js': 'export const a = 1;\n' });
      return r.status === 0 && /product code: code/.test(r.stdout); })());

  // REFUSES: configured and absent. Two ways to configure it, both must refuse.
  check('ci-code-paths refuses when CODE_REPO is set and the checkout brought nothing',
    (() => { const r = scratch({ codeDirs: ['code'] }, {}, { CODE_REPO: 'someone/thing' });
      return r.status === 1 && /^refused: configured-but-absent$/m.test(r.stderr); })());
  check('...and when workspace.config.json names directories this checkout does not have',
    (() => { const r = scratch({ codeDirs: ['src', 'lib'] });
      return r.status === 1 && /configured but not present/.test(r.stderr); })());

  // An empty `code/` is not code. The documented install makes it a symlink, and a dangling
  // one leaves a directory that exists and holds nothing — which would otherwise be scanned
  // as "present" and find, correctly, no problems at all.
  check('an empty code/ directory counts as absent, not as clean code',
    (() => { const r = scratch({ codeDirs: ['code'] }, {}, {}, ['code']);
      return r.status === 0 && /workspace-only/.test(r.stdout); })());
}

// ── no-product-leakage — this package must not know its own birthplace ───────
//
// The extraction leaked, and none of it was a security problem — it was an **adoptability**
// problem, invisible to the person who wrote it because to them every one of those names read
// as normal. CI named a private repository in three jobs; the secret scanner allowlisted a
// path that exists in nobody else's repo; two skills taught real lessons in one vendor's
// vocabulary.
//
// Silent case first, because that is the direction every defect here came from.
{
  console.log('\n▸ no-product-leakage — nothing from the project this came out of');
  const leak = path.join(ROOT, 'scripts', 'no-product-leakage.mjs');

  const scratch = (files) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'leak-'));
    fs.mkdirSync(path.join(d, 'scripts'), { recursive: true });
    fs.copyFileSync(leak, path.join(d, 'scripts', 'no-product-leakage.mjs'));
    for (const [f, body] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true });
      fs.writeFileSync(path.join(d, f), body);
    }
    const r = spawnSync('node', [path.join(d, 'scripts', 'no-product-leakage.mjs'), '--json'],
      { cwd: d, encoding: 'utf8' });
    fs.rmSync(d, { recursive: true, force: true });
    let j = {}; try { j = JSON.parse(r.stdout || '{}'); } catch { /* status still tells us */ }
    return { status: r.status, findings: j.findings ?? [] };
  };

  // SILENT: ordinary content, including words that merely resemble the forbidden ones.
  check('no-product-leakage allows a clean tree',
    scratch({ 'README.md': '# a workspace\n\nIt calls an API and deploys somewhere.\n' }).status === 0);
  check('...and allows a project that legitimately uses a phone vendor SDK by name in prose',
    scratch({ 'docs/x.md': 'We send SMS. Our provider has an auth token.\n' }).status === 0);

  // REFUSES, once per class, and each names the file and the reason.
  //
  // **The forbidden words are BUILT here, never written.** The first version spelled them out
  // and the check then failed on this very file — a gate broken by its own fixtures, and it
  // was pushed that way. Same technique the probes above use for the same reason: a fixture
  // that contains what it hunts is indistinguishable from the thing it hunts.
  const forbidden = {
    repo: ['realtime', 'codex', 'calling', 'agent'].join('-'),
    product: ['Nexa', 'Call'].join(''),
    plugin: `host${'inger'}`,
  };

  check('refuses the original private repository name',
    (() => { const r = scratch({ '.github/workflows/x.yml': `repository: someone/${forbidden.repo}\n` });
      return r.status === 1 && r.findings.every((f) => f.rule === 'forbidden-word'); })());
  check('refuses a product name left in a skill',
    (() => { const r = scratch({ 'a/SKILL.md': `${forbidden.product} does this.\n` });
      return r.status === 1 && r.findings.some((f) => f.file === 'a/SKILL.md'); })());
  check('refuses a stack-specific plugin declaration',
    scratch({ '.claude/settings.json': `{"enabledPlugins":{"${forbidden.plugin}":true}}` }).status === 1);

  // The allowlist is a claim someone can check, not a blindfold: the credential FORMATS in the
  // scanner are standard shapes any project can leak, and removing them to remove a word would
  // make the scanner worse for everyone.
  check('...but the credential-format files are allowlisted, with a reason',
    /Twilio credential FORMATS/.test(fs.readFileSync(leak, 'utf8')));
  check('...and it reports what it scanned, so an empty run cannot read as a clean one',
    scratch({ 'README.md': '# x\n' }).status === 0
      && /scanned/.test(spawnSync('node', [leak, '--json'], { cwd: ROOT, encoding: 'utf8' }).stdout));
}

// ── mutation-test — YOUR invariants, where kill-audit does the workspace's ────
//
// It shipped with four mutations against `src/agent-config.js` and `src/redact.js` — files
// that exist only in the project this was extracted from. For anyone else they resolved to
// nothing, printed "skipping", and it **reported success having tested zero invariants**.
// It also had no fixtures at all, so nothing noticed.
//
// Mutations are data now. These run the real script against a scratch project whose "suite"
// is one file checking one invariant, which makes every branch reachable in milliseconds.
{
  console.log('\n▸ mutation-test — break the product on purpose');
  const mt = path.join(ROOT, 'scripts', 'mutation-test.mjs');

  const scratch = (mutations, { guardHolds = true } = {}) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'muttest-'));
    fs.mkdirSync(path.join(d, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(d, 'code'), { recursive: true });
    fs.copyFileSync(mt, path.join(d, 'scripts', 'mutation-test.mjs'));
    fs.writeFileSync(path.join(d, 'workspace.config.json'),
      JSON.stringify({ codeDirs: ['code'], mutationTestCommand: 'node ./suite.mjs' }));
    fs.writeFileSync(path.join(d, 'code', 'guard.js'), 'const ID_RE = /^[a-z]+$/;\nexport default ID_RE;\n');
    // A suite that watches the invariant, or one that does not — which is what makes a
    // survivor available without waiting for a real project.
    fs.writeFileSync(path.join(d, 'code', 'suite.mjs'), guardHolds
      ? "import fs from 'node:fs';\nprocess.exit(fs.readFileSync(new URL('./guard.js', import.meta.url), 'utf8').includes('/^[a-z]+$/') ? 0 : 1);\n"
      : 'process.exit(0);\n');
    if (mutations !== null) {
      fs.writeFileSync(path.join(d, 'mutations.json'),
        typeof mutations === 'string' ? mutations : JSON.stringify(mutations));
    }
    const r = spawnSync('node', [path.join(d, 'scripts', 'mutation-test.mjs')],
      { cwd: d, encoding: 'utf8', timeout: 120000 });
    const guard = fs.readFileSync(path.join(d, 'code', 'guard.js'), 'utf8');
    fs.rmSync(d, { recursive: true, force: true });
    return { ...r, guard };
  };

  const KILL = [{ id: 1, file: 'guard.js', what: 'id validator stops validating', why: 'traversal',
    from: 'const ID_RE = /^[a-z]+$/;', to: 'const ID_RE = /.*/;' }];

  // SILENT: the suite notices, so nothing survived.
  {
    const r = scratch(KILL);
    check('mutation-test is silent when the suite catches the mutation',
      r.status === 0 && /1\/1 caught/.test(r.stdout));
    check('...and restores the file it broke, byte for byte',
      r.guard.includes('const ID_RE = /^[a-z]+$/;'));
  }

  // REFUSES: an invariant nothing watches. This is the entire product of the tool.
  {
    const r = scratch(KILL, { guardHolds: false });
    check('mutation-test refuses invariant-survived — an invariant deletable unnoticed',
      r.status === 1 && /SURVIVED/.test(r.stdout));
    check('...and still restores the file', r.guard.includes('const ID_RE = /^[a-z]+$/;'));
  }

  // REFUSES: a broken config. Running zero mutations and calling it a pass is the failure
  // this whole workspace catalogues, and it was living inside the tool built to catch it.
  check('mutation-test refuses mutations-unparseable — a mutations.json it cannot read',
    (() => { const r = scratch('{ not json'); return r.status === 2 && /not valid JSON/.test(r.stderr); })());

  // No mutations is not a pass, and says so rather than printing a tick.
  {
    const r = scratch(null);
    check('with no mutations defined it says nothing was tested, rather than reporting success',
      r.status === 0 && /not a pass/.test(r.stdout) && !/caught/.test(r.stdout));
  }

  // A `from` that no longer matches means the CODE moved and the mutation did not.
  check('mutation-test reports mutation-drifted when a mutation no longer applies',
    /REWRITE THE MUTATION/.test(
      scratch([{ ...KILL[0], from: 'a line that is not there' }]).stdout));
}

// ── the first command in the README has to work ──────────────────────────────
//
// `setup.sh` was committed mode 100644. A fresh clone therefore answered the very first line
// of the install instructions with `permission denied` — **the package's opening move, broken,
// in a repo full of controls about things being broken.** Nothing here tested the one thing
// every new user does first.
//
// Checked against git's index, not the working tree: a local `chmod +x` fixes your copy and
// changes nothing for anybody cloning, which is exactly how this survived.
{
  console.log('\n▸ the install path a stranger actually takes');
  const idx = spawnSync('git', ['ls-files', '-s', 'setup.sh'], { cwd: ROOT, encoding: 'utf8' }).stdout ?? '';
  check('setup.sh is executable in the git index, not merely on this machine',
    /^100755 /.test(idx.trim()));

  // ── setup.sh judged suites by scraping their stdout ─────────────────────────
  //
  // It looked for `N passed, M failed` and ignored the exit code. `guard-paths-with-spaces.mjs`
  // says `6/6 passed`, so **every install reported a green suite as a FAILURE** and told the
  // user the workspace was not ready. The inverse was equally possible and worse: a suite that
  // failed while printing the magic string would have been reported as fine.
  //
  // Same shape as the CI job that grepped a missing directory and read exit 2 as "no matches
  // found". Read the thing you actually mean.
  {
    const setup = fs.readFileSync(path.join(ROOT, 'setup.sh'), 'utf8');
    check('setup.sh decides a suite by its exit code, not by parsing its output',
      /out="\$\(node "\$t" 2>&1\)"; rc=\$\?/.test(setup) && /if \[ "\$rc" -eq 0 \]/.test(setup));
    check('...and every suite in tests/ exits 0 when it passes, whatever wording it uses',
      fs.readdirSync(path.join(ROOT, 'tests'))
        .filter((f) => f.endsWith('.mjs') && !f.startsWith('._') && f !== 'hooks.test.mjs')
        .every((f) => spawnSync('node', [path.join(ROOT, 'tests', f)],
          { cwd: ROOT, encoding: 'utf8', timeout: 600000 }).status === 0));
  }

  // Every command the README tells a newcomer to run must at least resolve.
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts ?? {};
  const cited = [...readme.matchAll(/^\s*(?:\$ )?npm run ([\w:-]+)/gm)].map((m) => m[1]);
  const missing = [...new Set(cited)].filter((s) => !(s in scripts));
  check('every `npm run` the README instructs is a real script',
    missing.length === 0, missing.join(', '));

  // Paths the council provides are gitignored and legitimately absent before `./setup.sh`.
  // They are not broken instructions — but a reader has to be told which is which, so the
  // README marks them and this only demands the ones a bare clone is supposed to have.
  const files = [...readme.matchAll(/^\s*(?:\$ )?node (scripts\/[\w./-]+\.mjs|tests\/[\w./-]+\.mjs)/gm)].map((m) => m[1]);
  const fetched = (f) => spawnSync('git', ['check-ignore', '-q', f], { cwd: ROOT }).status === 0;
  const gone = [...new Set(files)].filter((f) => !fs.existsSync(path.join(ROOT, f)) && !fetched(f));
  check('every `node <script>` the README instructs exists in a bare clone', gone.length === 0, gone.join(', '));
  check('...and the ones that do not are the fetched ones, which the README says so about',
    [...new Set(files)].filter((f) => fetched(f)).every(() => /FETCHED, not vendored/.test(readme)));
}

console.log(`  ${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\n  A hook that stopped guarding is silent. That is why these exist.\n');
  process.exit(1);
}
console.log('\n  Every blocking path above was watched blocking, not assumed to.\n');

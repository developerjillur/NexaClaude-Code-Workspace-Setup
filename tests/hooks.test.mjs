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

// ── the plugin's own copy, not the back-link at the repository root ──────────
//
// `<repo>/scripts` is a SYMLINK to `<repo>/plugin/scripts`, and Node resolves symlinks in
// `import.meta.url`, so on a normal checkout the two are the same files and either spelling
// works. They are not the same on a filesystem without symlinks — exFAT, and Windows without
// developer mode — where git materialises the link as a real directory, either a copy or a
// one-line text file holding the target path.
//
// That difference is not cosmetic. `roots.mjs` decides which project a hook is talking about
// by walking up from the script's own location: reached through `<repo>/plugin/scripts/hooks/`
// the parent is `plugin/`, which is not a workspace, so `CLAUDE_PROJECT_DIR` decides — the
// production path. Reached through `<repo>/scripts/hooks/` the parent is the repository, which
// HAS a `board/`, so every fixture silently reported on this repo instead of its own scratch
// project. Four assertions failed for that reason and none of them was about the code they
// name.
//
// Resolving the plugin explicitly is correct on both, and it is what the symlink means anyway.
const PLUGIN = [path.join(ROOT, 'plugin'), ROOT]
  .find((p) => fs.existsSync(path.join(p, 'scripts', 'hooks', 'roots.mjs')));
const HOOKS = path.join(PLUGIN, 'scripts', 'hooks');
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
/**
 * Copy a gate script into a fixture tree, together with the module it now imports.
 *
 * The gate scripts moved into the plugin and share one root-resolution module. A fixture that
 * carries the script without it exercises a crash rather than the control — which would still
 * be a non-zero exit, and would therefore have looked like the refusal it was asserting.
 */
function installScript(dest, name) {
  fs.mkdirSync(path.join(dest, 'scripts', 'hooks'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'scripts', name), path.join(dest, 'scripts', name));
  fs.copyFileSync(path.join(HOOKS, 'roots.mjs'), path.join(dest, 'scripts', 'hooks', 'roots.mjs'));
}

function run(script, input = {}, env = {}, args = []) {
  const r = spawnSync('node', [script, ...args], {
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
      check('...and NOT [no-reuse-ladder], the other rule that would also have fired',
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
    // ── the second thing an agent reaches for, once the first was refused ─────
    //
    // Measured 2026-07-31: twenty ordinary write commands fed to this hook, four blocked.
    // The list above is what somebody tries FIRST; these are what they try next, and that is
    // the set that matters once the first attempt has been refused. `python3 -c` and `node -e`
    // were the two most likely of all and neither was seen.
    ['perl -i', `perl -i -pe "s/a/b/" ${PRODUCT_REL}/auth.js`],
    ['python3 -c', `python3 -c "open('${PRODUCT_REL}/auth.js','w').write('x')"`],
    ['node -e', `node -e "require('fs').writeFileSync('${PRODUCT_REL}/auth.js','x')"`],
    ['truncate', `truncate -s 0 ${PRODUCT_REL}/auth.js`],
    ['rm', `rm ${PRODUCT_REL}/auth.js`],
    ['ed', `ed ${PRODUCT_REL}/auth.js`],
    ['rsync', `rsync /tmp/x ${PRODUCT_REL}/auth.js`],
    ['patch', `patch ${PRODUCT_REL}/auth.js < /tmp/p.diff`],
  ]) check(`blocks a shell ${what} into product code`, bash(cmd).code === 2, cmd.slice(0, 40));

  // ── board-move-unguarded · a stage change is a transition, not a file move ──
  //
  // Measured 2026-07-31: `git mv board/1-spec/001.md board/5-verify/001.md` exited 0 — four
  // gates skipped with no refusal and no record. The `Edit(./board/6-done/**)` deny rule is no
  // help, because permission rules never reach Bash.
  //
  // The silent cases matter as much: renaming a card WITHIN its stage is not a transition, and
  // neither is moving anything outside `board/`. A guard that refuses `git mv` generally would
  // be switched off by lunchtime.
  check('blocks a git mv that skips four stages',
    bash('git mv board/1-spec/001-x.md board/5-verify/001-x.md').code === 2);
  check('...and blocks even a LEGAL-looking one, because the guards live in nexa-move',
    bash('git mv board/3-build/007-y.md board/4-review/007-y.md').code === 2);
  check('...attributed to board-move-unguarded',
    /refused: board-move-unguarded/.test(bash('git mv board/1-spec/001-x.md board/6-done/001-x.md').stderr));
  check('...but a rename WITHIN a stage is not a transition and stays silent',
    bash('git mv board/1-spec/001-x.md board/1-spec/001-renamed.md').code === 0);
  check('...and a git mv outside board/ is nobody’s transition',
    bash('git mv docs/a.md docs/b.md').code === 0);

  // ── a backslash is the third way to write a path with a space in it ─────────
  //
  // The quoted forms were handled; the bare form stopped at the first space. So the spelling
  // tab-completion produces — `/Volumes/T7\ Shield/…` — walked past a guard that blocked both
  // other spellings of the identical path. A one-character bypass, on any repository whose
  // path contains a space.
  check('blocks an escaped-space path, the spelling tab-completion produces',
    bash(`sed -i "" s/a/b/ ${path.join(ROOT, PRODUCT_REL, 'auth.js').replace(/ /g, '\\ ')}`).code === 2,
    'the quoted spelling of the same path was already blocked');

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
  // **NEXA_STATE_DIR, so this test touches neither the repository nor the real prompt log.**
  // The earlier version wrote into the developer's actual log and restored it afterwards, which
  // worked only while the log lived in the repo — and meant a crashed run left the real record
  // truncated. A temp directory removes both problems.
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'save-prompt-state-'));
  const env = { NEXA_STATE_DIR: state };
  const dir = path.join(state, 'prompts');
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const file = path.join(dir, `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}.md`);

  // The four secret SHAPES that have appeared in this project's prompts — synthetic values.
  // The first version used a real (expired) OAuth code copied from the prompt history, and
  // scan-secrets caught it in this file. Allowlisting it would have been the wrong fix:
  // test data derived from a real credential does not belong in a repo about to be pushed.
  const secrets = {
    prompt: 'ssh root@203.0.113.10 Ex4mpleP4ssw0rd,x and SERVICE_AUTH_TOKEN=EXAMPLEtokenEXAMPLE99 '
      + 'and callback?code=ac_EXAMPLEexampleEXAMPLEexample00 and sk-proj-EXAMPLEexampleEXAMPLE00',
  };
  check('exits 0 (a logger must never block a prompt)', run(s, secrets, env).code === 0);

  const written = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  check('writes into the state directory, not the repository', written.length > 0
    && !fs.existsSync(path.join(ROOT, 'docs', 'prompts')));
  check('scrubs an ssh password', !/Ex4mpleP4ssw0rd/.test(written));
  check('scrubs a token assignment', !/EXAMPLEtokenEXAMPLE99/.test(written));
  check('scrubs an OAuth code', !/ac_EXAMPLEexample/.test(written));
  check('scrubs an sk- key', !/sk-proj-EXAMPLE/.test(written));
  check('still records something readable', /ssh|«/.test(written));

  check('ignores slash commands', run(s, { prompt: '/compact' }, env).code === 0);
  check('survives malformed input', run(s, {}, env).code === 0);

  fs.rmSync(state, { recursive: true, force: true });
}

// ── the first session in a fresh repository, end to end ─────────────────────
//
// **The one path every user takes, and until now the only one with no test.** The suites
// exercised `session-start` with garbage input and `bootstrap` without the banner; nobody ran
// the two together. So this shipped: `created` holds `{file, wroteHash}` records, the banner
// passed one straight to `path.relative`, and the hook died with ERR_INVALID_ARG_TYPE **after**
// scaffolding the repository. A first-ever session showed a stack trace, having silently
// succeeded — the worst possible pairing, because the user has no reason to think anything
// worked and every reason to delete what appeared.
//
// Reaching the production path needs care: `decide()` refuses a temp directory and the hook
// never passes `allowTemp`, so a fixture in mkdtemp is declined for the right reason and proves
// nothing. `os.tmpdir()` honours TMPDIR, so the child gets a DECOY temp base — the arena is then
// not under any temp root the child knows about, and the strict predicate is genuinely
// exercised rather than bypassed.
console.log('\n▸ the first session in a fresh repo — one hook, zero commands typed');
{
  const arena = fs.mkdtempSync(path.join(os.tmpdir(), 'first-session-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'first-home-'));
  const decoy = fs.mkdtempSync(path.join(os.tmpdir(), 'first-decoy-'));
  spawnSync('git', ['init', '-q'], { cwd: arena, stdio: 'ignore' });

  const r = spawnSync('node', [path.join(HOOKS, 'session-start.mjs')], {
    input: JSON.stringify({ session_id: 'first', cwd: arena }),
    encoding: 'utf8',
    env: { ...process.env, HOME: home, USERPROFILE: home, TMPDIR: decoy, CLAUDE_PROJECT_DIR: arena },
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;

  check('the hook exits 0', r.status === 0, `exit ${r.status}: ${(r.stderr || '').trim().split('\n')[0]}`);
  check('...and does not throw — a stack trace here is what a first-ever session showed',
    !/ERR_INVALID_ARG_TYPE|TypeError|at Object\./.test(out), out.split('\n').slice(0, 3).join(' | '));
  check('...and announces the adoption rather than doing it silently',
    /was just set up as a workspace/.test(out));

  // The repository gets what cannot live elsewhere, and nothing more.
  const inRepo = fs.readdirSync(arena).filter((f) => f !== '.git' && !f.startsWith('._')).sort();
  check('the repository receives exactly five entries, none of them the board',
    JSON.stringify(inRepo) === JSON.stringify(['.claude', '.claudeignore', '.nexa', 'AGENTS.md', 'CLAUDE.md'].sort()),
    inRepo.join(', '));

  // …and the rest is in ~/.nexa, keyed by the project's path.
  // realpathSync, because stateRoot resolves before deriving the name and macOS maps
  // /var/folders → /private/var/folders. Deriving it from the unresolved path here produced a
  // name that differed by one segment and looked like a code failure.
  const proj = path.join(home, '.nexa', 'projects',
    fs.realpathSync(arena).replace(/[^A-Za-z0-9._-]/g, '-'));
  check('the board, docs, templates and config landed in ~/.nexa/projects/<path>',
    ['board/3-build', 'docs/DECISIONS.md', 'docs/LEARNED.md', 'templates/CARD.md', 'config.json', '.nexa-id']
      .every((f) => fs.existsSync(path.join(proj, f))), proj);
  check('...and the banner shows those paths under ~, not as ../../.. from the repo',
    /`~\/\.nexa\/projects\//.test(out) && !/\.\.\/\.\.\//.test(out));

  for (const d of [arena, home, decoy]) fs.rmSync(d, { recursive: true, force: true });
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
  // Same isolation as save-prompt above: a temp state directory rather than the real one.
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-compact-state-'));
  const env = { NEXA_STATE_DIR: state };
  const dir = path.join(state, 'compactions');

  check('exits 0 (must never be able to fail a compaction)', run(p, {}, env).code === 0);

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

  check('writes into the state directory, not the repository', files.length > 0);
  check('survives garbage input', run(p, { nonsense: true }, env).code === 0);
  fs.rmSync(state, { recursive: true, force: true });
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
    // A real clean chained AFTER a dry run. Each `git clean` is judged on its own arguments,
    // so the exemption below cannot be used as a prefix to smuggle one through.
    'git clean -xfdn; git clean -xfd',
    // `notes` is a pathspec, not a flag. The dry-run exemption only considers a dash followed
    // by letters, so a filename containing `n` must not read as `-n`.
    'git clean -fd -- notes',
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
    // **Dry runs, which delete nothing.** `git clean -n` alone was always allowed — it carries
    // no f/d/x for the pattern to catch. The COMBINED form was not: `-xfdn` is how anyone
    // actually asks "what would this remove", and it was refused identically to the real
    // command. Found when this guard blocked exactly that question being asked of it.
    // A false refusal costs more than friction: it is how `touch .nexa-allow-discard` becomes
    // a reflex, and the next genuine refusal gets waved through unread.
    'git clean -xfdn', 'git clean --dry-run -xfd', 'git clean -ndx',
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
    // Required from 5-verify onward, and 6-done inherits it — see REQUIRED in card-gate.mjs.
    '**Reviewed by:** Codex GPT-5.6 (OpenAI), /codex:review --effort xhigh.',
    '**Where errors surface:** the shared ops inbox, checked before opening.',
  ].join('\n');

  check('a bare idea may sit in 0-discovery', fire(mk('0-discovery', 'a.md', '# idea\n\nsomething\n')) === 0);
  check('an answered card passes at 1-spec', fire(mk('1-spec', 'b.md', ANSWERED)) === 0);
  check('...and at 6-done, with errors named', fire(mk('6-done', 'c.md', ANSWERED)) === 0);

  // ── the shipped template must answer NOTHING ───────────────────────────────
  //
  // Measured before this fixture existed: an unmodified `templates/CARD.md` dropped into
  // `1-spec`, `5-verify` and `6-done` produced **zero findings**. All five discovery questions,
  // the reviewer's identity and "where errors surface" counted as answered — by the text
  // asking for them.
  //
  // Two independent causes, both invisible without this test. The placeholder list catches what
  // people TYPE (`tbd`, `n/a`) and not what they LEAVE, which is a 60-character italic hint.
  // And the patterns are loose enough to match inside their own bolded question, so
  // `**What breaks for them if this never exists?**` answered itself with the rest of itself.
  //
  // Inverted on purpose, like the check.mjs template fixture: this proves the gate is not
  // satisfied by NO input, which is the direction every fail-open in this repo came from.
  for (const stage of ['1-spec', '5-verify', '6-done']) {
    const f = mk(stage, `tpl-${stage}.md`, fs.readFileSync(path.join(ROOT, 'templates', 'CARD.md'), 'utf8'));
    check(`the untouched CARD.md template is refused at ${stage}`, fire(f) === 1);
  }
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
  check('[the-number-that-moves][kill-condition] card-gate refuses a placeholder where a real answer would pass',
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

  // ── reviewed-by · both directions ──────────────────────────────────────────
  //
  // AGENTS.md §10 opens with "No model reviews its own work" and repeats it in three skills,
  // and nothing recorded WHO reviewed — so a score table typed by the builder's own model was
  // byte-for-byte identical to a real cross-vendor review. This cannot check that the review
  // was honest, or that it happened; it makes the claim attributable, which is the difference
  // between an omission and a lie.
  // ── 7-operate · the stage that existed only in the pipeline diagram ────────
  //
  // No requirement, no row in the stage table, no row in `/card move`, no mention in
  // `/deploy` — a directory nothing could put a card into and nothing ever emptied. It is also
  // the stage covering everything after merge, which is where a product with real users lives.
  //
  // Two of `operate-after-done`'s four questions are mechanically checkable; the other two are
  // judgement and are deliberately not faked here.
  const OPERATED = `${ANSWERED}
**Observed in production:** no new errors in three days; p95 unchanged at 240ms.
**Fed back:** nothing to feed back — no support questions since the deploy.`;
  check('[observed-in-production][fed-back] a card in 7-operate owes what production actually did',
    rulesOf(mk('7-operate', 'v.md', ANSWERED)).sort().join() === 'fed-back,observed-in-production');
  check('...and passes once both are answered', fire(mk('7-operate', 'w.md', OPERATED)) === 0);
  check('...and "nothing to feed back" is a complete answer, not an empty one',
    !rulesOf(mk('7-operate', 'x.md', OPERATED)).includes('fed-back'));
  check('...while an earlier stage owes neither', fire(mk('6-done', 'y.md', ANSWERED)) === 0);

  // ── kind: migration · the kind that ADDS requirements ──────────────────────
  //
  // AGENTS.md §11 says "If anything fails: roll back. Never fix forward on production." That is
  // right for stateless code and it is the CAUSE of the outage once a schema has moved: the tag
  // restores the old image, the old image meets a migrated database, and the result is corrupt
  // data rather than a failed deploy. A four-vendor council reached that independently, twice.
  //
  // Every other kind makes a card cheaper; this one makes it dearer, which the waiver mechanism
  // could not express. The silent case matters as much as the refusal: a `feature` card must
  // not suddenly owe migration answers.
  const MIGRATION = `> kind: migration\n\n${ANSWERED}`;
  check('[expand-contract] a migration card owes expand/contract and mixed-version at 2-plan',
    rulesOf(mk('2-plan', 'q.md', MIGRATION)).sort().join() === 'expand-contract,mixed-version');
  check('...and data-rollback as well once it reaches 5-verify',
    rulesOf(mk('5-verify', 'r.md', MIGRATION)).includes('data-rollback'));
  check('...and a card of any other kind owes none of them',
    rulesOf(mk('5-verify', 's.md', `> kind: feature\n\n${ANSWERED}`)).length === 0);
  check('...and a migration that answers all three passes', fire(mk('5-verify', 't.md', `${MIGRATION}
**Expand/contract:** the additive column ships in 1.4; the drop ships in 1.6, two releases later.
**Mixed-version:** 1.3 workers keep writing the old column; both are written until 1.6.
**Data rollback:** pg_dump snapshot taken by the deploy gate; restore rehearsed on staging 2026-07-30.`)) === 0);
  // The declaration must be reachable where the template actually puts it — the metadata line
  // is `·`-separated, and `[>\s]*` could not cross a `·`, so this exemption existed and was
  // unreachable in its documented spelling.
  check('...and kind: is read from the ·-separated metadata line',
    rulesOf(mk('2-plan', 'u.md', `> Stage: 2-plan · Owner: jr · kind: migration\n\n${ANSWERED}`))
      .includes('expand-contract'));

  check('card-gate names reviewed-by when a card reaches 5-verify without it',
    rulesOf(mk('5-verify', 'n.md', ANSWERED.replace(/\*\*Reviewed by.*\n?/, '')))
      .join() === 'reviewed-by');
  check('...and stays silent once the reviewing model is named',
    fire(mk('5-verify', 'o.md', ANSWERED)) === 0);
  check('...and an italic placeholder does not count as naming one',
    rulesOf(mk('5-verify', 'p.md',
      ANSWERED.replace(/\*\*Reviewed by:\*\*.*/, '**Reviewed by:** _the model and vendor that read this_')))
      .join() === 'reviewed-by');

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
    installScript(root, 'graph-fresh.mjs');
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
  // **Isolated state, and it was not.** `loop-producing-nothing` keeps a streak counter on disk,
  // and these fixtures fire a dozen wakeups in a row against an unchanging board — which is
  // precisely what that rule refuses, so five correct SILENT cases went red the moment it
  // shipped. They were also writing the counter into the real state directory, which a test has
  // no business touching. A fresh directory per assertion isolates the streak and the side effect
  // at once; the streak itself is tested deliberately in its own block below.
  const fire = (tool_input, tool_name = 'ScheduleWakeup') =>
    run(guard, { tool_name, tool_input },
      { NEXA_STATE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'wk-iso-')) }).code;

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

// ── image-gen — the path handling IS the tool ───────────────────────────────
//
// Codex is an agent, not an image endpoint: it writes and runs code, so **it** decides where the
// file goes and it is inconsistent about saying so. Measured against the real CLI: asked for
// `/tmp/x/circle.png` it reported `/private/tmp/x/circle.png`, because macOS resolves `/tmp`
// through a symlink — the same file under a different string.
//
// So the printed path is a hint and the filesystem is the authority. These assertions cover the
// decision, which is where the bugs live; the subprocess call costs minutes and tokens and is
// exercised by hand (a 1 MB PNG, recorded in the card).
{
  console.log('\n▸ image-gen — codex says one path, the file is at another');
  const ig = await import(path.join(ROOT, 'plugin', 'scripts', 'image-gen.mjs'));
  const arena = fs.mkdtempSync(path.join(os.tmpdir(), 'imggen-'));

  // A real 1x1 PNG, so magic-byte sniffing has something true to find.
  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489'
    + '0000000a49444154789c6360000002000100' + '05fe02fea7'.padEnd(10, '0') + '0000000049454e44ae426082', 'hex');
  fs.writeFileSync(path.join(arena, 'real.png'), PNG);
  fs.writeFileSync(path.join(arena, 'liar.png'), '<html><body>error 500</body></html>\n');
  fs.writeFileSync(path.join(arena, 'vector.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>\n');

  check('a real PNG is recognised by its bytes', ig.looksLikeImage(path.join(arena, 'real.png')) === 'png');
  check('...and an HTML error page named .png is REFUSED, not trusted for its extension',
    ig.looksLikeImage(path.join(arena, 'liar.png')) === false);
  check('...and a genuine SVG is accepted', ig.looksLikeImage(path.join(arena, 'vector.svg')) === 'svg');

  // Every shape codex has been observed to answer in.
  check('parses WROTE=', ig.parsePaths('WROTE=/x/a.png').includes('/x/a.png'));
  check('parses a markdown image link', ig.parsePaths('done ![c](out/a.png)').includes('out/a.png'));
  check('parses a bare filename in prose', ig.parsePaths('I saved circle.png').includes('circle.png'));
  check('parses a ~ path', ig.parsePaths('at ~/p/a.jpg').includes('~/p/a.jpg'));
  check('and finds nothing when there is nothing', ig.parsePaths('no image today').length === 0);

  // **The symlinked-prefix case, which is the reason this tool exists.**
  //
  // `os.tmpdir()` hands back `/var/folders/…` and the real path is `/private/var/folders/…` —
  // the same file under two strings, exactly as codex reported `/private/tmp/x.png` for a file
  // asked for at `/tmp/x.png`. A comparison by string fails here; by realpath it holds.
  //
  // The first version of this assertion invented a `/tmp/<basename>` path that existed nowhere
  // and failed for that reason — a fixture bug that looked like a code bug.
  const stated = path.join(arena, 'real.png');            // unresolved form
  const truth = fs.realpathSync(path.join(arena, 'real.png'));  // /private/… form
  check('the two path forms really do differ, or this proves nothing', stated !== truth,
    `${stated} vs ${truth}`);
  check('a path stated through a symlinked prefix still resolves to the real file',
    ig.resolveCandidate(stated, [arena]) === truth, String(ig.resolveCandidate(stated, [arena])));

  // Precedence: a usable named path wins.
  const before = ig.snapshotImages(arena);
  fs.writeFileSync(path.join(arena, 'appeared.png'), PNG);
  check('a named, verified path is preferred',
    ig.pickResult({ out: `WROTE=${path.join(arena, 'real.png')}`, bases: [arena], workdir: arena, before })
      .file === fs.realpathSync(path.join(arena, 'real.png')));

  // THE FALLBACK: codex wrote the file and never said so usably.
  const silent = ig.pickResult({ out: 'all done!', bases: [arena], workdir: arena, before });
  check('...and a file that appeared unannounced is still found',
    silent.file === fs.realpathSync(path.join(arena, 'appeared.png')), String(silent.file));
  check('...and it says the path came from disk, not from the output',
    /found on disk/.test(silent.how));

  // A named path that is a lie must not win over a real file on disk.
  const lying = ig.pickResult({ out: `WROTE=${path.join(arena, 'liar.png')}`, bases: [arena], workdir: arena, before });
  check('a named path pointing at a non-image is rejected in favour of a real one',
    lying.file === fs.realpathSync(path.join(arena, 'appeared.png')), String(lying.file));

  // THE REFUSAL: nothing was produced, and it must say so rather than invent a path.
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'imggen-empty-'));
  const nothing = ig.pickResult({ out: 'I could not do it', bases: [empty], workdir: empty, before: new Set() });
  check('REFUSES when no image exists — no path is invented',
    nothing.file === null && /no image/.test(nothing.how));

  // ── --out is the one attacker-shaped input this tool has ───────────────────
  //
  // An image generator is a file-writing tool, and `--out` says where. Measured before
  // containment existed: `../../../etc` resolved to `/Users/you/orca/etc`, `/etc` resolved to
  // `/etc`, and `~/x` created a directory literally named `~` because `path.resolve` does not
  // expand tildes.
  //
  // Two destinations are legitimate: **inside the repo** (a logo or icon that is a source
  // resource and gets committed) and **inside the project's state directory** (scratch output
  // that must not dirty anyone's git status). Nothing else.
  {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'img-root-'));
    const state = fs.mkdtempSync(path.join(os.tmpdir(), 'img-state-'));
    const ok = (o) => ig.resolveOutDir(o, { root, stateDir: state });

    check('--out into the repo is allowed — a source resource belongs beside the code',
      ok('assets/brand').dir === path.join(fs.realpathSync(root), 'assets/brand'), JSON.stringify(ok('assets/brand')));
    check('...and into the state directory too', !ok(path.join(state, 'images')).error);
    check('REFUSES a traversal out of the project', !!ok('../../../etc').error);
    check('...REFUSES an absolute path outside it', !!ok('/etc').error);
    check('...and REFUSES a home-directory path rather than creating a literal ~ folder',
      !!ok('~/somewhere').error);
    check('...and the refusal says where it actually resolved, so it is debuggable',
      /resolves to \//.test(ok('../../../etc').error));

    for (const d of [root, state]) fs.rmSync(d, { recursive: true, force: true });
  }

  // And the command itself refuses an empty prompt rather than burning a codex run.
  const noPrompt = spawnSync('node', [path.join(ROOT, 'plugin', 'scripts', 'image-gen.mjs'), '--json'],
    { encoding: 'utf8' });
  check('...and the command refuses an empty prompt before spending a codex run',
    noPrompt.status === 1 && /no prompt/.test(`${noPrompt.stdout}${noPrompt.stderr}`));

  for (const d of [arena, empty]) fs.rmSync(d, { recursive: true, force: true });
}

{
  console.log('\n▸ kill-audit\'s journal — a killed audit must not leave a control disarmed');
  // **This is the defect the audit caused twice, not one it found.** kill-audit mutates real
  // controls; killed mid-run it left `depth-check.mjs` with its empty-catch rule returning null,
  // and later `guard-edit.mjs` with its discard guard rewritten to `if (false)`. The workspace's
  // one blocking control, disarmed, in a file that read as ordinary.
  //
  // Signal handlers cannot fix it — measured: this process blocks inside `spawnSync` for minutes
  // and a JS handler cannot run during a synchronous call, so SIGTERM waits behind the block;
  // SIGKILL skips handlers outright. So the original bytes go to a journal on disk *before* the
  // file is touched, and the NEXT run repairs from it.
  //
  // Tested against a temp file rather than by killing a real audit, which takes minutes. The
  // full end-to-end version — SIGKILL a live run, then prove the next one repairs it — was run
  // by hand and is recorded in the card.
  const ka = path.join(ROOT, 'scripts', 'kill-audit.mjs');
  const journal = path.join(ROOT, '.nexa-kill-audit-inflight.json');
  const victim = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ka-journal-')), 'control.mjs');
  const GOOD = '// the armed control\nexport const guard = () => true;\n';
  fs.writeFileSync(victim, '// DISARMED BY A KILLED AUDIT\nexport const guard = () => false;\n');
  fs.writeFileSync(journal, JSON.stringify({ file: victim, original: GOOD, at: '2026-07-30T00:00:00Z' }));

  const r = spawnSync('node', [ka, '--only=__nothing_matches__'], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  check('a killed run\'s journal is recovered before the next run does anything',
    fs.readFileSync(victim, 'utf8') === GOOD, fs.readFileSync(victim, 'utf8').split('\n')[0]);
  check('...and it says so, rather than repairing silently',
    /recovered/.test(`${r.stdout}${r.stderr}`));
  check('...and the journal is cleared, so it cannot repair twice from stale bytes',
    !fs.existsSync(journal));

  fs.rmSync(path.dirname(victim), { recursive: true, force: true });
}

{
  console.log('\n▸ council-update — the vendored council knows how stale it is');
  const upd = path.join(ROOT, 'scripts', 'council-update.mjs');
  const r = spawnSync('node', [upd], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  // Current, behind, or offline are all legitimate; crashing is not, and neither is silence.
  check('council-update reports rather than crashing', r.status === 0 || r.status === 1);
  check('...and names the pinned commit, so staleness is visible without a network call',
    /vendored at|pinned to/i.test(r.stdout + r.stderr));

  // THE REFUSAL: a copy with no provenance is the exact failure of the 2026 vendoring — it was
  // wrong for a week and nobody could tell by looking. An unpinned copy must fail, not shrug.
  // ── assert WHICH guard fired, not merely that something did ────────────────
  //
  // **This assertion was worthless and `kill-audit` proved it.** It checked `status === 1`, and
  // an unpinned copy exits 1 down two entirely different paths: the provenance refusal, and the
  // drift check that follows it (a null pin never equals upstream HEAD). So deleting the
  // provenance guard changed nothing this could see — the `council-provenance` mutation
  // SURVIVED while the test stayed green.
  //
  // That is the over-determined-fixture failure `guard-edit` carries rule ids for, committed
  // here by the same hand that wrote the warning. One bit cannot say which rule fired, so the
  // assertion has to read the reason.
  const unpinned = (() => {
    const t = fs.mkdtempSync(path.join(os.tmpdir(), 'unpinned-council-'));
    fs.writeFileSync(path.join(t, 'members.json'), '{}');
    try {
      const r = spawnSync('node', [upd], { cwd: ROOT, encoding: 'utf8',
        env: { ...process.env, NEXA_COUNCIL_DIR: t } });
      return { code: r.status, say: `${r.stdout ?? ''}${r.stderr ?? ''}` };
    } finally { fs.rmSync(t, { recursive: true, force: true }); }
  })();
  check('council-update REFUSES a copy with no .vendored-from', unpinned.code === 1);
  check('...naming PROVENANCE as the reason, not drift — the two exit 1 identically',
    /\.vendored-from is missing|no provenance/.test(unpinned.say),
    unpinned.say.split('\n').filter(Boolean).slice(-2).join(' | '));
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
  check('[untested][no-refusal] guard-coverage refuses a control with no fixtures, and names it',
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
  check('[no-silent-case] guard-coverage refuses a control watched refusing but never staying silent',
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
    installScript(d, 'kill-audit.mjs');
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
    check('[SURVIVED] kill-audit is silent when the suite notices the deletion — nothing SURVIVED',
      r.status === 0 && /caught/.test(r.stdout) && !/SURVIVED/.test(r.stdout));
    check('...and puts the control back byte for byte', r.control.includes(WATCHED));
  }

  // [unresolved] — the rule that had no fixture at all, and the way that was hidden is the
  // point. `guard-coverage` searched the suite text for the word "unresolved" and found it: a
  // local variable in an unrelated macOS path-resolution block, four hundred lines away. An
  // id matched as a bare word will eventually collide with somebody's variable name, and the
  // collision reads as coverage. `guard-coverage --run` found it because that variable is never
  // PRINTED by a passing assertion, which is the whole reason --run exists.
  //
  // The rule itself is the one kill-audit's own header calls its worst historical bug: a
  // mutation whose `from` no longer matches was silently dropped from the denominator, so the
  // audit "converged, over time, on printing success while testing less and less."
  {
    const r = scratch([K('drifted', "if (a === 'this-line-was-edited-away') process.exit(1);")]);
    check('[unresolved] kill-audit refuses a mutation whose pattern no longer matches',
      r.status === 1 && /unresolved/.test(r.stdout), `exit ${r.status}`);
    check('[unresolved] ...and calls it a failure of the AUDIT, not a result about the control',
      /failure of the AUDIT/.test(r.stdout));
    check('[unresolved] ...rather than dropping it from the denominator and reporting success',
      !/^\s*── 0 caught, 0 survived, 0 unresolved/m.test(r.stdout));
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
    installScript(d, 'scan-secrets.mjs');
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
  // **The detail argument is not decoration here.** This assertion had none, so when it failed
  // it said only "false" — and the whole point of the block is that check.mjs's verdict about
  // the planted card is meaningless if the baseline is already red. A red baseline with no
  // reason printed costs more to diagnose than the failure it is guarding.
  check('check.mjs passes on this workspace before anything is planted', before.status === 0,
    `exit ${before.status}: ${(before.stdout || '').split('\n').filter((l) => l.includes('❌')).slice(0, 2).join(' | ') || (before.stderr || '').slice(0, 160)}`);

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
    installScript(d, 'ci-code-paths.mjs');
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
  check('[configured-but-absent] ci-code-paths refuses when CODE_REPO is set and the checkout brought nothing',
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
    installScript(d, 'no-product-leakage.mjs');
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

  // The rule id belongs in the assertion NAME, not only in the predicate. `guard-coverage --run`
  // matches against what the suite actually PRINTS, so an id visible only inside the callback is
  // an id no reader of the output — and no coverage check — can see was exercised.
  check('[forbidden-word] refuses the original private repository name',
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

  // ── the HUMAN path, which nothing here was exercising ──────────────────────
  //
  // Every assertion above runs with `--json`, and `--json` exits from its own line. So the
  // ordinary invocation — `npm run leakage`, and `npm run gate` — had **no coverage of whether
  // it refuses at all**. `kill-audit`'s `leakage-exit` mutation turned that exit into 0 and
  // survived: findings printed in full, exit code 0, every test still green.
  //
  // "Prints its failures and then exits 0" is the eleventh fail-open this project has shipped,
  // and it was sitting in the one output mode a person actually reads.
  const human = (files) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'leak-human-'));
    fs.mkdirSync(path.join(d, 'scripts'), { recursive: true });
    installScript(d, 'no-product-leakage.mjs');
    for (const [f, body] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true });
      fs.writeFileSync(path.join(d, f), body);
    }
    const r = spawnSync('node', [path.join(d, 'scripts', 'no-product-leakage.mjs')],
      { cwd: d, encoding: 'utf8' });
    fs.rmSync(d, { recursive: true, force: true });
    return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  };
  const dirty = human({ 'a/SKILL.md': `${forbidden.product} does this.\n` });
  check('REFUSES without --json too — the mode every person and `npm run gate` uses',
    dirty.status === 1, `exit ${dirty.status}`);
  check('...and names the finding in that mode as well', /SKILL\.md/.test(dirty.out));
  check('...while a clean tree still exits 0 in the human mode',
    human({ 'README.md': '# a workspace\n' }).status === 0);
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
    installScript(d, 'mutation-test.mjs');
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

  // No mutations is not a pass, and the EXIT CODE has to say so too.
  //
  // This asserted `status === 0` while its own name said "rather than reporting success" —
  // and exit 0 is precisely how a script reports success. The prose in the output said one
  // thing, the code every caller actually reads said the opposite, and the assertion locked
  // the disagreement in place. A tool that tested nothing must not return the code meaning
  // "tested everything, found nothing wrong".
  {
    const r = scratch(null);
    check('with no mutations defined it REFUSES rather than reporting success',
      r.status === 2 && /not a pass/.test(r.stdout) && !/caught/.test(r.stdout),
      `status ${r.status}`);
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
    // ── no suite may leave anything in the developer's real state directory ────
    //
    // Session state moved to ~/.nexa/workspaces/<id>/ on 2026-07-30, and the first version of
    // that change left **four fixture repositories behind in it** — a test firing a writing
    // hook resolves a state root like anything else, and a temp repo gets a temp id and its own
    // directory. Nothing failed; the pollution was only visible by listing the home directory.
    //
    // The suites are isolated with NEXA_STATE_DIR now. This is the check that says so, and the
    // reason it lives here is that this block already runs every other suite.
    // **The watched path is ASKED FOR, never spelled out here.** The first version hardcoded
    // `~/.nexa/workspaces`; card 003 renamed that to `~/.nexa/projects`, and this guard went on
    // comparing '' to '' — passing on every run while 32 fixture directories accumulated in the
    // developer's real home. A guard that names a path independently of the code it guards stops
    // guarding the moment that path moves, and says nothing when it does.
    //
    // So the location comes from `stateRoot`, the same function the writers use. Rename the
    // layout again and this follows it.
    const { stateRoot } = await import(path.join(ROOT, 'plugin', 'scripts', 'hooks', 'roots.mjs'));
    const nexa = path.dirname(stateRoot(os.tmpdir()));
    const listing = () => (fs.existsSync(nexa) ? fs.readdirSync(nexa).sort().join(',') : '');
    const stateBefore = listing();
    check('the leak guard is watching a directory that actually exists',
      fs.existsSync(nexa) || stateBefore === '', nexa);

    check('...and every suite in tests/ exits 0 when it passes, whatever wording it uses',
      fs.readdirSync(path.join(ROOT, 'tests'))
        .filter((f) => f.endsWith('.mjs') && !f.startsWith('._') && f !== 'hooks.test.mjs')
        .every((f) => spawnSync('node', [path.join(ROOT, 'tests', f)],
          { cwd: ROOT, encoding: 'utf8', timeout: 600000 }).status === 0));

    check('...and none of them left a fixture behind in the real ~/.nexa',
      listing() === stateBefore,
      `${stateBefore.split(',').length} → ${listing().split(',').length} entries`);
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

// ── the packaged deployment: hooks that no longer live in the tree they guard ─
//
// Fail-open number four, caught before it shipped. Package these scripts as a plugin and they
// run from `~/.claude/plugins/cache/…`, three dirnames above which is the cache — not the
// user's repository. Every path check then compares the user's file against a tree it cannot
// be in, `isCode()` says "not product code", and `if (!isProductCode) allow()` exits 0.
//
// The single-root version of guard-edit passes every other test in this file while doing that,
// which is the whole point: the suite ran in the one configuration where the two roots
// coincide. This block builds the configuration where they do not.
console.log('\n▸ guard-edit from a plugin cache — the root it guards is not the root it lives in');
{
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'nexa-cache-'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'nexa-project-'));
  try {
    // A cache looks like a plugin: scripts, and nothing else. No board, no config.
    fs.mkdirSync(path.join(cache, 'scripts', 'hooks'), { recursive: true });
    for (const f of ['guard-edit.mjs', 'roots.mjs']) {
      fs.copyFileSync(path.join(HOOKS, f), path.join(cache, 'scripts', 'hooks', f));
    }
    const guard = path.join(cache, 'scripts', 'hooks', 'guard-edit.mjs');

    // A user's repository, with product code in it and no board at all.
    fs.mkdirSync(path.join(project, 'code', 'src'), { recursive: true });
    const target = path.join(project, 'code', 'src', 'auth.ts');
    fs.writeFileSync(target, 'export const x = 1;\n');
    const noProject = { CLAUDE_PROJECT_DIR: '' };

    // WATCHED FAILING — the exact input the council named. Single-root: exit 0, silent.
    const edit = run(guard, { tool_name: 'Edit', tool_input: { file_path: target } }, noProject);
    check('refuses an absolute product-code edit when the project cannot be located',
      edit.code === 2, `exit ${edit.code} — a silent allow here is the whole fail-open`);
    check('...and says which rule refused, not merely that something did',
      /refused: project-root-unknown/.test(edit.stderr), edit.stderr.slice(0, 120));

    // The Bash redirect takes the same path and was named separately.
    const bash = run(guard, {
      tool_name: 'Bash', cwd: project,
      tool_input: { command: 'printf x > code/src/auth.ts' },
    }, noProject);
    check('...and the Bash redirect variant of the same edit', bash.code === 2, `exit ${bash.code}`);

    // THE SILENT CASE — the direction that gets a guard switched off when it is wrong.
    // Point it at a real, initialised project: the guard must find that project's board and
    // behave exactly as it does from a clone, refusing on the card rule rather than on the root.
    fs.mkdirSync(path.join(project, 'board', '3-build'), { recursive: true });
    fs.writeFileSync(path.join(project, 'workspace.config.json'), JSON.stringify({ codeDirs: ['code'] }));
    const located = run(guard, { tool_name: 'Edit', tool_input: { file_path: target } },
      { CLAUDE_PROJECT_DIR: project });
    check('locates the project through CLAUDE_PROJECT_DIR once one exists',
      !/project-root-unknown/.test(located.stderr), located.stderr.slice(0, 120));
    check('...and then refuses on the card rule, which is the pre-packaging behaviour',
      located.code === 2 && /refused: no-card-in-build/.test(located.stderr), located.stderr.slice(0, 120));

    // And it must still be quiet about a file that is nobody's product code.
    const docs = run(guard, { tool_name: 'Edit', tool_input: { file_path: path.join(project, 'README.md') } },
      { CLAUDE_PROJECT_DIR: project });
    check('...and stays silent on a doc edit in that same project', docs.code === 0, `exit ${docs.code}`);
  } finally {
    fs.rmSync(cache, { recursive: true, force: true });
    fs.rmSync(project, { recursive: true, force: true });
  }
}

// ── config-unreadable — a corrupt config must not switch the guard off ──────
//
// `guard-edit` read `workspace.config.json` itself and ended `catch { return ['code']; }`. In a
// project whose real `codeDirs` is `["src"]`, one malformed brace silently returned the guard
// to a directory that does not exist, so `isProductCode` was false for every file and every
// edit was allowed — no log, no refusal, nothing in any diff. The single blocking control in
// the workspace, turned off by a typo.
//
// Both directions, because the silent case is where all fifteen of this repo's fail-opens came
// from: a corrupt config REFUSES, and a valid one that simply does not mention codeDirs still
// falls back quietly, which was the original and correct instinct.
console.log('\n▸ guard-edit · config-unreadable');
{
  const guard = path.join(HOOKS, 'guard-edit.mjs');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgunread-'));
  try {
    spawnSync('git', ['init', '-q'], { cwd: d, stdio: 'ignore' });
    fs.mkdirSync(path.join(d, 'board', '3-build'), { recursive: true });
    fs.mkdirSync(path.join(d, 'src'), { recursive: true });
    const target = path.join(d, 'src', 'auth.js');
    const fire = () => run(guard, { tool_name: 'Write', cwd: d, tool_input: { file_path: target } },
      { CLAUDE_PROJECT_DIR: d });

    // 1 · REFUSES — the config is there and unreadable.
    fs.writeFileSync(path.join(d, 'workspace.config.json'), '{oops');
    const broken = fire();
    check('a corrupt workspace.config.json refuses the edit',
      broken.code === 2, `exit ${broken.code}`);
    check('...attributed to config-unreadable, not to a sibling rule',
      /refused: config-unreadable/.test(broken.stderr), broken.stderr.split('\n')[0]);

    // 2 · STAYS SILENT — no config at all is the documented default, not a failure.
    fs.rmSync(path.join(d, 'workspace.config.json'));
    const absent = fire();
    check('...but an ABSENT config still falls back quietly to ["code"]',
      absent.code === 0, `exit ${absent.code}: ${absent.stderr.split('\n')[0]}`);

    // 3 · and a valid config naming src/ refuses on the CARD rule, proving the corrupt case
    //     above was refused for its own reason rather than because src/ is product code.
    fs.writeFileSync(path.join(d, 'workspace.config.json'), JSON.stringify({ codeDirs: ['src'] }));
    const valid = fire();
    check('...and a valid config reaches the card rule instead',
      valid.code === 2 && /refused: no-card-in-build/.test(valid.stderr), valid.stderr.split('\n')[0]);
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
}

// ── a gate that CANNOT START must not report that it found nothing ──────────
//
// The most important fix of 2026-07-31, and `kill-audit` proved it was the one protection
// added that day with nothing watching it: delete the `!g.ran` branch and every test stayed
// green. A survivor is not a gap in the control, it is a gap in what watches it.
//
// The defect it guards: `check.mjs` spawned `path.join(ROOT, 'scripts', 'card-gate.mjs')`,
// which does not exist in an adopted project — the child never ran, `JSON.parse(r.stdout || '{}')`
// became `{findings: []}`, and zero findings printed as a green tick. In every repository that
// installed this plugin, the three strongest gates passed having inspected nothing.
//
// Reproduced by removing the gate from a copy of the plugin, which is the only honest way to
// make it genuinely unreachable — `sibling()` looks in PLUGIN_ROOT first and then the repo, so
// deleting one copy is not enough.
console.log('\n▸ check.mjs — a gate that could not run is a failure, not a pass');
{
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'nogate-plugin-'));
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'nogate-proj-'));
  try {
    // A plugin copy with everything EXCEPT the gate under test.
    fs.cpSync(PLUGIN, cache, { recursive: true });
    fs.rmSync(path.join(cache, 'scripts', 'card-gate.mjs'), { force: true });

    spawnSync('git', ['init', '-q'], { cwd: proj, stdio: 'ignore' });
    fs.writeFileSync(path.join(proj, 'workspace.config.json'), JSON.stringify({ codeDirs: ['code'] }));
    fs.writeFileSync(path.join(proj, '.nexa'), JSON.stringify({ nexaId: 'nogate0000000000' }));
    fs.mkdirSync(path.join(proj, 'board', '1-spec'), { recursive: true });
    fs.writeFileSync(path.join(proj, 'board', '1-spec', '001-x.md'), '# 001\n\nnothing answered.\n');

    const r = spawnSync('node', [path.join(cache, 'scripts', 'check.mjs')],
      { cwd: proj, encoding: 'utf8', timeout: 300000, env: { ...process.env, CLAUDE_PROJECT_DIR: proj } });
    const out = `${r.stdout}${r.stderr}`;

    check('a card gate that cannot start makes check.mjs FAIL',
      r.status !== 0, `exit ${r.status}`);
    check('...and says so, rather than printing a green tick over zero cards',
      /could not run/.test(out) && !/✅ every card carries/.test(out),
      (out.split('\n').find((l) => /card gate|every card/.test(l)) || '').trim().slice(0, 90));
  } finally {
    fs.rmSync(cache, { recursive: true, force: true });
    fs.rmSync(proj, { recursive: true, force: true });
  }
}

// ── move-card · the transition function the board never had ─────────────────
//
// Measured 2026-07-31: `git mv board/1-spec/001.md board/5-verify/001.md` exited 0. Four gates
// skipped, no refusal, no record. An audit and a four-vendor council reached the same sentence
// from different directions — the board is a state machine with no transition function.
//
// The refusal that matters is `unknown-transition`, and it is different in kind from every
// other gate here: an invalid move is not a move that failed its checks, it is a move that
// **does not exist**, so it is refused before any guard runs.
console.log('\n▸ move-card — an undefined transition is not a failed one');
{
  const mover = path.join(PLUGIN, 'scripts', 'move-card.mjs');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'movecard-'));
  try {
    spawnSync('git', ['init', '-q'], { cwd: d, stdio: 'ignore' });
    fs.writeFileSync(path.join(d, 'workspace.config.json'), JSON.stringify({ codeDirs: ['code'] }));
    fs.writeFileSync(path.join(d, '.nexa'), JSON.stringify({ nexaId: 'movecard00000000' }));
    const ANSWERED_CARD = ['# 001 — a card',
      '**Who asked?** Priya, ops lead, in the Oct 3 review.',
      '**What they do today instead?** By hand in psql.',
      '**What breaks for them if this never exists?** 2h per incident, twice a month.',
      '**What number moves?** Manual edits: 4 now, 0 is success.',
      '**What would make us stop?** No manual edits for a month.',
      '**Reviewed by:** Codex GPT-5.6 (OpenAI), /codex:review.',
      '**Where errors surface:** the on-call channel.',
      // ── these five exist because the FIRST version of this fixture canonized a bug ──
      //
      // `nexa-move` named guards in pipeline.json and ran card-gate, which implements none of
      // them — so this fixture asserted that a card with no spec section and no acceptance
      // criterion SHOULD move 1-spec → 2-plan, and it passed. A council found it by reading
      // pipeline.json against the two requirement lists. The card now carries what the
      // transitions it is driven through actually demand.
      '',
      '## 1 · Spec',
      'The worker must refuse a job that carries no tenant id.',
      '- [ ] a job without tenant_id is rejected at the queue boundary',
      '',
      '## 2 · Plan',
      '| File | Change |',
      '|---|---|',
      '| src/worker.js | reject jobs with no tenant id |',
      '```',
      'graphify explain "how is a job tenant-scoped"',
      '→ src/worker.js:40 handle(), src/db.js:12 withTenant',
      '```',
      '',
      '## 3 · Build',
      'Added the predicate at the queue boundary.',
      '',
      // The review lives under its own heading, as the template writes it. It did not, and
      // `reviewed-by` matched anywhere in the file — so this fixture certified a card whose
      // verdict and score table sat under "## 3 · Build" with no review section at all.
      '## 4 · Review',
      '**Reviewed by:** Codex GPT-5.6 (OpenAI) · /codex:review --effort xhigh',
      '**Verdict:** PASS',   // the template's own format — see the regex note in card-demands
      '| Axis | Score | Note |',
      '|---|---|---|',
      '| Matches the spec | 5 | |',
      '| Nothing invented | 4 | |',
      '| Nothing duplicated | 4 | |',
      '| Nothing extra | 4 | |',
      '| Fits the file | 5 | |',
      '- [x] the guard was watched failing — see below',
      '```',
      'FAIL worker rejects untenanted job',
      '  expected refusal, got accept',
      '```'].join('\n');
    const place = (stage, name = '001-a.md') => {
      fs.rmSync(path.join(d, 'board'), { recursive: true, force: true });
      fs.mkdirSync(path.join(d, 'board', stage), { recursive: true });
      fs.writeFileSync(path.join(d, 'board', stage, name), ANSWERED_CARD);
      spawnSync('git', ['add', '-A'], { cwd: d, stdio: 'ignore' });
      spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'x'],
        { cwd: d, stdio: 'ignore' });
    };
    const move = (...a) => spawnSync('node', [mover, ...a],
      { cwd: d, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: d } });

    place('1-spec');
    const skip = move('001', '5-verify');
    check('an undefined transition is REFUSED — the git mv that skipped four stages',
      skip.status === 2, `exit ${skip.status}`);
    check('...attributed to unknown-transition, not to a guard that happened to fail',
      /unknown-transition/.test(skip.stderr), skip.stderr.split('\n')[1]);
    check('...and it says where the card CAN go, so the refusal is actionable',
      /2-plan/.test(skip.stderr), skip.stderr.slice(0, 80));
    check('...and the card did not move', fs.existsSync(path.join(d, 'board', '1-spec', '001-a.md')));

    // The silent case: the defined next step is allowed, or this is a gate that refuses
    // everything and would be switched off within a day.
    place('1-spec');
    const legal = move('001', '2-plan');
    check('...but the transition the pipeline DOES define is allowed',
      legal.status === 0, `exit ${legal.status}: ${legal.stderr.slice(0, 80)}`);
    check('...and the card is now in 2-plan',
      fs.existsSync(path.join(d, 'board', '2-plan', '001-a.md')));

    // A card that cannot satisfy the destination's guards is rolled back, not left stranded
    // half-moved — the failure mode of doing the mv first and checking afterwards.
    place('5-verify');
    const bare = fs.readFileSync(path.join(d, 'board', '5-verify', '001-a.md'), 'utf8')
      .replace(/\*\*Where errors surface.*\n?/, '');
    fs.writeFileSync(path.join(d, 'board', '5-verify', '001-a.md'), bare);
    // A holding invariant, so this reaches the CARD-GATE refusal it is testing rather than
    // being stopped earlier by `invariants-held` — which now runs first, and should.
    fs.mkdirSync(path.join(d, 'code'), { recursive: true });
    fs.writeFileSync(path.join(d, 'code', 'inv.mjs'), 'process.exit(0);\n');
    fs.writeFileSync(path.join(d, 'invariants.json'), JSON.stringify({
      invariants: [{ id: 'tenant', kind: 'tenant', what: 'holds', cwd: 'code', command: 'node inv.mjs' }],
    }));
    const refused = move('001', '6-done');
    check('a card missing what the destination requires is refused',
      refused.status === 1, `exit ${refused.status}`);
    check('...by guard-refused, naming the guard id that refused',
      /guard-refused/.test(refused.stderr)
      && /(where-errors-surface|errors surface)/.test(refused.stderr),
      refused.stderr.split('\n').filter(Boolean).slice(0, 4).join(' | ').slice(0, 140));
    check('...and the move is ROLLED BACK rather than left half-applied',
      fs.existsSync(path.join(d, 'board', '5-verify', '001-a.md'))
      && !fs.existsSync(path.join(d, 'board', '6-done', '001-a.md')));

    // ── gate-unavailable · a mover that cannot run its gate has not checked the card ──
    //
    // The first version wrapped the card-gate call in `if (gate)` with NO else, so an
    // installation missing card-gate.mjs moved every card unchecked — the identical fail-open
    // this session removed from check.mjs, reintroduced in the file written to fix it.
    {
      const noGate = fs.mkdtempSync(path.join(os.tmpdir(), 'nogate-mover-'));
      fs.cpSync(PLUGIN, noGate, { recursive: true });
      fs.rmSync(path.join(noGate, 'scripts', 'card-gate.mjs'), { force: true });
      place('5-verify');
      const r = spawnSync('node', [path.join(noGate, 'scripts', 'move-card.mjs'), '001', '6-done'],
        { cwd: d, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: d } });
      check('a mover whose gate is missing REFUSES rather than moving unchecked',
        r.status === 2 && /gate-unavailable/.test(r.stderr), `exit ${r.status}: ${r.stderr.split('\n')[1] ?? ''}`);
      check('...and the card stayed where it was',
        fs.existsSync(path.join(d, 'board', '5-verify', '001-a.md')));
      fs.rmSync(noGate, { recursive: true, force: true });
    }

    // ── guard-unimplemented · a guard name nothing executes ────────────────
    //
    // pipeline.json naming a guard that neither card-demands nor card-gate implements is the
    // defect this whole design exists to prevent — the file asserting a check that does not
    // happen. Refused loudly rather than passed silently.
    {
      const badPipe = fs.mkdtempSync(path.join(os.tmpdir(), 'badpipe-'));
      fs.cpSync(PLUGIN, badPipe, { recursive: true });
      const pj = JSON.parse(fs.readFileSync(path.join(badPipe, 'pipeline.json'), 'utf8'));
      for (const t of pj.transitions) {
        if (t.from === '1-spec' && t.to === '2-plan') t.guards = ['a-guard-nothing-implements'];
      }
      fs.writeFileSync(path.join(badPipe, 'pipeline.json'), JSON.stringify(pj, null, 2));
      place('1-spec');
      const r = spawnSync('node', [path.join(badPipe, 'scripts', 'move-card.mjs'), '001', '2-plan'],
        { cwd: d, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: d } });
      check('a pipeline guard nothing implements is refused, not ignored',
        r.status === 2 && /guard-unimplemented/.test(r.stderr), `exit ${r.status}: ${r.stderr.split('\n')[1] ?? ''}`);
      fs.rmSync(badPipe, { recursive: true, force: true });
    }

    // ── invariants-held · the tick mark that discharged the only real gate ────
    //
    // `definition-of-done` said "**nexa-prove green** — the invariants ran against a real
    // instance", and pipeline.json discharged that with `ticked-checklist` = `/^\s*- \[x\]/im`.
    // Measured: a card whose sole evidence was `- [x] nexa-prove green — I ran it, honest`
    // entered 6-done with zero unmet demands. The one control that runs the application was
    // satisfied by typing x between two brackets — introduced the same morning nexa-prove was
    // written, by adding a checklist line without wiring it to a guard.
    {
      // The scratch project is shared across these cases, and an earlier one declares an
      // invariant. Remove it: this case is specifically about the state EVERY adopter starts
      // in — a tick mark and nothing declared.
      fs.rmSync(path.join(d, 'invariants.json'), { force: true });
      place('5-verify');
      const claim = `${ANSWERED_CARD}\n- [x] nexa-prove green — I ran it, honest\n\`\`\`\nFAIL x\n  expected refusal\n\`\`\`\n`;
      fs.writeFileSync(path.join(d, 'board', '5-verify', '001-a.md'), claim);

      const claimed = move('001', '6-done');
      check('invariants-held: a card cannot CLAIM the invariants held with a tick mark',
        claimed.status === 1 && /invariants-held/.test(claimed.stderr),
        `exit ${claimed.status}: ${(claimed.stderr || '').split('\n').filter(Boolean)[1] ?? ''}`);
      check('...and the card stayed in 5-verify',
        fs.existsSync(path.join(d, 'board', '5-verify', '001-a.md')));

      // The silent case: a declared invariant that genuinely holds lets the card through.
      fs.mkdirSync(path.join(d, 'code'), { recursive: true });
      fs.writeFileSync(path.join(d, 'code', 'inv.mjs'), 'process.exit(0);\n');
      fs.writeFileSync(path.join(d, 'invariants.json'), JSON.stringify({
        invariants: [{ id: 'tenant', kind: 'tenant', what: 'B cannot read A', cwd: 'code', command: 'node inv.mjs' }],
      }));
      const proved = move('001', '6-done');
      check('...and allows the move once an invariant is declared and holds',
        proved.status === 0, `exit ${proved.status}: ${(proved.stderr || '').split('\n').filter(Boolean)[1] ?? ''}`);
    }

    // A number nobody put on the board.
    place('1-spec');
    const missing = move('999', '2-plan');
    check('a card number that is not on the board says so',
      missing.status === 2 && /card-not-found/.test(missing.stderr), missing.stderr.split('\n')[1]);

    // WIP is a property of the DESTINATION, and it is the rule most likely to be broken by an
    // agent that just finished something and feels productive.
    fs.rmSync(path.join(d, 'board'), { recursive: true, force: true });
    fs.mkdirSync(path.join(d, 'board', '3-build'), { recursive: true });
    fs.mkdirSync(path.join(d, 'board', '2-plan'), { recursive: true });
    fs.writeFileSync(path.join(d, 'board', '3-build', '002-b.md'), ANSWERED_CARD);
    fs.writeFileSync(path.join(d, 'board', '2-plan', '001-a.md'), ANSWERED_CARD);
    spawnSync('git', ['add', '-A'], { cwd: d, stdio: 'ignore' });
    spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'x'], { cwd: d, stdio: 'ignore' });
    const wip = move('001', '3-build');
    check('moving a second card into 3-build is refused by wip-limit-move',
      wip.status === 1 && /wip-limit-move/.test(wip.stderr), wip.stderr.split('\n')[1]);

    // --dry-run must change nothing. A preview that moves the card is worse than no preview.
    place('1-spec');
    const dry = move('001', '2-plan', '--dry-run');
    check('--dry-run reports the transition and moves nothing',
      dry.status === 0 && fs.existsSync(path.join(d, 'board', '1-spec', '001-a.md')),
      dry.stdout.trim().split('\n')[0]);
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
}

// ── gate-attribution · the workspace measuring its own controls ─────────────
//
// A council said the thing nothing here had checked: nothing shows the PROCESS gates catch real
// defects. This workspace ships `measure-dont-claim` and a plan with 77 disproven claims, and
// had never measured which of its own controls earn their keep.
//
// It reports rather than refuses, so what is asserted is that it stays HONEST: it must not
// invent attributions, and it must keep saying what it cannot see.
console.log('\n▸ gate-attribution — which control actually caught something');
{
  const script = [path.join(PLUGIN, 'scripts', 'gate-attribution.mjs'),
    path.join(ROOT, 'scripts', 'gate-attribution.mjs')].find((p) => fs.existsSync(p));
  const r = spawnSync('node', [script, '--json'], { cwd: ROOT, encoding: 'utf8' });
  let out = null;
  try { out = JSON.parse(r.stdout || ''); } catch { /* asserted below */ }
  // The silent case, which guard-coverage rightly demands: on a normal workspace it ALLOWS —
  // exits 0 and reports — rather than refusing. A measurement tool that fails on the ordinary
  // path is one nobody runs, and then the measurement never happens at all.
  check('gate-attribution allows the ordinary case — exit 0, machine-readable counts',
    !!out && r.status === 0, `exit ${r.status}`);
  check('...over a real corpus, not an empty one',
    (out?.sentences ?? 0) > 20 && (out?.scanned ?? 0) > 10,
    `${out?.sentences} sentences across ${out?.scanned} files`);

  // The finding this exists to surface: the mutation audit and the fixtures catch far more than
  // the process gates do. If that ever inverts, the pipeline has started earning its weight and
  // this assertion should be the thing that tells us.
  const c = out?.controls ?? {};
  check('...and kill-audit + fixtures outrank card-gate and check.mjs',
    (c['kill-audit'] ?? 0) + (c['a test fixture'] ?? 0) > (c['card-gate'] ?? 0) + (c['check.mjs'] ?? 0),
    JSON.stringify(c));

  // The honest half. A tool that measures detection and lets a reader hear "prevention" is the
  // overclaiming this repo keeps catching in itself.
  const human = spawnSync('node', [script], { cwd: ROOT, encoding: 'utf8' }).stdout ?? '';
  check('...and says out loud that it measures DETECTION, not prevention',
    /DETECTION, not prevention/.test(human));
  check('...and names the controls it has never recorded catching anything',
    /Never recorded catching anything/.test(human));

  // It reports rather than gates, but its two usage errors must still REFUSE rather than
  // print an empty table — a measurement tool that answers confidently about a control that
  // does not exist is the overclaiming this whole script was written to expose.
  const bogus = spawnSync('node', [script, '--show=no-such-control'], { cwd: ROOT, encoding: 'utf8' });
  check('...and refuses an unknown control instead of reporting zero findings for it',
    bogus.status === 2 && /no such control/.test(bogus.stderr), `exit ${bogus.status}`);
}

// ── prove-invariants · the only gate that runs the application ──────────────
//
// Two audits and a four-vendor council independently reached the same sentence: *every gate
// inspects process artifacts — cards, comments, citations — and none of them ever runs the
// application.* An agent demonstrated a card whose code took the tenant from a header and
// interpolated it into SQL, with an unsigned Stripe webhook, walking 1-spec → 6-done with every
// gate green. `skills/test-the-real-thing` had been prose since the day it was written.
//
// The fixture is a REAL cross-tenant leak in running code — no stub, no TODO, passes lint —
// proved violated, then proved held once the predicate is added. Both directions, because a
// gate that only ever refuses is one nobody keeps.
console.log('\n▸ prove-invariants — run the app, not the paperwork');
{
  const d = fs.mkdtempSync(path.join(os.homedir(), 'nexa-prove-'));
  try {
    spawnSync('git', ['init', '-q'], { cwd: d, stdio: 'ignore' });
    fs.writeFileSync(path.join(d, '.nexa'), JSON.stringify({ nexaId: 'prove00000000000' }));
    fs.writeFileSync(path.join(d, 'workspace.config.json'), JSON.stringify({ codeDirs: ['code'] }));
    fs.mkdirSync(path.join(d, 'code'), { recursive: true });

    const LEAKY = "const DOCS = [{ id: 1, tenant: 'A' }, { id: 2, tenant: 'B' }];\n"
      + 'export const getDoc = (callerTenant, id) => DOCS.find((x) => x.id === id);\n';
    const SAFE = "const DOCS = [{ id: 1, tenant: 'A' }, { id: 2, tenant: 'B' }];\n"
      + 'export const getDoc = (callerTenant, id) => DOCS.find((x) => x.id === id && x.tenant === callerTenant);\n';
    fs.writeFileSync(path.join(d, 'code', 'app.mjs'), LEAKY);
    fs.writeFileSync(path.join(d, 'code', 'inv.mjs'),
      "import { getDoc } from './app.mjs';\n"
      + "const leaked = getDoc('B', 1);\n"
      + "if (leaked && leaked.tenant !== 'B') { console.error('CROSS-TENANT READ'); process.exit(1); }\n");

    const prove = (...a) => spawnSync('node', [path.join(PLUGIN, 'scripts', 'prove-invariants.mjs'), ...a],
      { cwd: d, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: d } });

    // 1 · nothing declared is NOT a pass — the fourth time this workspace has had to learn it.
    const none = prove();
    // Named by rule id, not merely by exit code: one bit cannot say WHICH rule fired, and an
    // over-determined fixture is silently worthless — the lesson guard-edit's header records.
    check('no-invariants: nothing declared REFUSES — "none declared" is not "none violated"',
      none.status === 2 && /NOT a pass/.test(none.stdout)
      && /no-invariants|No invariants declared/.test(`${none.stdout}${none.stderr}`), `exit ${none.status}`);

    fs.writeFileSync(path.join(d, 'invariants.json'), JSON.stringify({
      invariants: [{ id: 'cross-tenant-read', kind: 'tenant', what: "B cannot read A's doc",
        why: 'the breach', cwd: 'code', command: 'node inv.mjs' }],
    }));

    // 2 · a REAL leak in running code, which every existing gate passes.
    const bad = prove();
    check('invariant-violated: it refuses a real cross-tenant leak, found by running the code',
      bad.status === 1 && /invariant-violated/.test(bad.stdout), `exit ${bad.status}`);
    check('...and the violation names the invariant and shows the output',
      /cross-tenant-read/.test(bad.stdout) && /CROSS-TENANT READ/.test(bad.stdout));

    // 3 · the silent case. Add the predicate; nothing else changes.
    fs.writeFileSync(path.join(d, 'code', 'app.mjs'), SAFE);
    const good = prove();
    check('...and stays silent — allows, exit 0 — once the tenant predicate is added', good.status === 0, `exit ${good.status}`);

    // 4 · a declared invariant whose command cannot run has proved nothing.
    fs.writeFileSync(path.join(d, 'invariants.json'), JSON.stringify({
      invariants: [{ id: 'x', kind: 'tenant', what: 'y', cwd: 'code', command: 'node no-such-file.mjs' }],
    }));
    const broken = prove();
    check('prove-unreachable: it refuses when the check could not run, rather than passing',
      broken.status === 1, `exit ${broken.status}`);

    // invariant-command-missing — declared with nothing to run proves nothing, and must say so
    // rather than counting as held.
    fs.writeFileSync(path.join(d, 'invariants.json'), JSON.stringify({
      invariants: [{ id: 'nocmd', kind: 'tenant', what: 'declared but empty' }],
    }));
    const nocmd = prove();
    check('invariant-command-missing: it refuses an invariant with no command to run',
      nocmd.status === 1 && /invariant-command-missing/.test(nocmd.stdout), `exit ${nocmd.status}`);
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
}

// ── nexa-move on a REAL adoption, where the board is outside the repo ───────
//
// **The fixture that would have caught the flagship shipping broken.**
//
// Since card 003 the board lives at `~/.nexa/projects/<id>/board`, outside the repository.
// `move-card.mjs` moved cards with `git mv`, and git refuses a path it does not own:
//
//     fatal: '…/.nexa/projects/…/board/1-spec/001-a.md' is outside repository at '…/my-app'
//
// So every card move on a default install died with a raw Node stack trace — and none of the
// 432 fixtures added beside it saw that, because every one built the board INSIDE its scratch
// repo, which is the pre-2026-07-30 layout. **They tested the configuration that does not
// ship.** A fixture built around the author's mental model confirms the author's mental model.
//
// This one adopts a repository the way a user does — `init.mjs --apply` — and drives a card
// through the pipeline wherever that adoption decided to put the board.
console.log('\n▸ nexa-move on a real adoption (board outside the repo)');
{
  const proj = fs.mkdtempSync(path.join(os.homedir(), 'nexa-adopt-'));
  let home = null;
  try {
    spawnSync('git', ['init', '-q'], { cwd: proj, stdio: 'ignore' });
    spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'],
      { cwd: proj, stdio: 'ignore' });
    const boot = spawnSync('node', [path.join(PLUGIN, 'scripts', 'init.mjs'), '--apply'],
      { cwd: proj, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: proj } });
    check('a real adoption succeeds', boot.status === 0, (boot.stderr || '').slice(0, 120));

    // Where did the adoption actually put the board? Ask the same resolver the code uses.
    const { paths: pathsOf } = await import(path.join(PLUGIN, 'scripts', 'hooks', 'roots.mjs'));
    home = pathsOf(proj).board;
    check('...and the board is OUTSIDE the repository, as card 003 requires',
      !home.startsWith(`${proj}${path.sep}`), home);

    const CARD = ['# 001 — a real card',
      '**Who asked?** Priya, ops lead, in the Oct 3 review.',
      '**What they do today instead?** By hand in psql.',
      '**What breaks for them if this never exists?** 2h per incident.',
      '**What number moves?** Manual edits: 4 now, 0 is success.',
      '**What would make us stop?** No manual edits for a month.',
      '**Where errors surface:** the on-call channel.',
      '',
      '## 1 · Spec',
      'The worker must refuse a job carrying no tenant id.',
      '- [ ] a job without tenant_id is rejected at the queue boundary'].join('\n');
    fs.mkdirSync(path.join(home, '1-spec'), { recursive: true });
    fs.writeFileSync(path.join(home, '1-spec', '001-a.md'), CARD);

    const move = (...a) => spawnSync('node', [path.join(PLUGIN, 'scripts', 'move-card.mjs'), ...a],
      { cwd: proj, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: proj } });

    const r = move('001', '2-plan');
    check('a card moves on the layout the workspace actually installs',
      r.status === 0, `exit ${r.status}: ${(r.stderr || '').split('\n').filter(Boolean)[0] ?? ''}`);
    check('...and it is not a stack trace pretending to be a refusal',
      !/at Object\.|node:internal|Error: Command failed/.test(r.stderr), (r.stderr || '').slice(0, 120));
    check('...and the card is really in 2-plan now',
      fs.existsSync(path.join(home, '2-plan', '001-a.md'))
      && !fs.existsSync(path.join(home, '1-spec', '001-a.md')));

    // The refusal path has to work on this layout too — a rollback that throws is worse than
    // no rollback, because the card ends up in a stage it never satisfied.
    const bad = move('001', '3-build');
    check('...and a refusal on this layout rolls back cleanly, without throwing',
      bad.status === 1 && !/node:internal/.test(bad.stderr)
      && fs.existsSync(path.join(home, '2-plan', '001-a.md')),
      `exit ${bad.status}: ${(bad.stderr || '').split('\n').filter(Boolean)[0] ?? ''}`);
  } finally {
    fs.rmSync(proj, { recursive: true, force: true });
    if (home) fs.rmSync(path.dirname(home), { recursive: true, force: true });
  }
}

// ── the blank card template must FAIL every gate ────────────────────────────
//
// The cheapest test in this repository, and it invalidated four gates at once before it
// existed. Measured against the unmodified `plugin/templates/CARD.md`: seven of nine stage
// demands were satisfied by a card nobody had typed a word into. `cp templates/CARD.md
// board/3-build/NNN.md` passed 2-plan, 3-build, 4-review and 6-done — and because the 3-build
// demand is the same `graphify explain` regex `guard-edit.mjs` uses as its only content
// condition, it also unlocked writes to product code.
//
// Two of the seven are worth remembering, because both are the "a rule quoted is a rule
// satisfied" mistake `guard-coverage.mjs:78` records having made once already:
//
//   · `- [x]` matched the prose at template line 32 that explains a bare tick is refused
//   · "the pasted output of a guard watched failing" matched an empty
//     ```<paste the deliberate failure here>``` placeholder
//
// **The assertion is inverted on purpose.** Every other fixture here proves a control fires on
// bad input; this one proves the control is not satisfied by NO input, which is the direction
// all fifteen of this repo's fail-open defects came from.
console.log('\n▸ the blank card template must satisfy no gate');
{
  const tpl = path.join(ROOT, 'templates', 'CARD.md');
  // **The plugin's copy, not `ROOT/scripts/`.** `check.mjs` resolves the project it is checking
  // from its own location: at `<repo>/plugin/scripts/` the parent is `plugin/`, which is not a
  // workspace, so CLAUDE_PROJECT_DIR decides — which is what this fixture needs. Reached
  // through `<repo>/scripts/` it resolves to THIS repository and reports on the real board,
  // silently ignoring the scratch project and passing for the wrong reason.
  const CHECK = [path.join(ROOT, 'plugin', 'scripts', 'check.mjs'),
    path.join(ROOT, 'scripts', 'check.mjs')].find((p) => fs.existsSync(p));
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'blankcard-'));
  try {
    spawnSync('git', ['init', '-q'], { cwd: d, stdio: 'ignore' });
    fs.writeFileSync(path.join(d, 'workspace.config.json'), JSON.stringify({ codeDirs: ['code'] }));
    fs.writeFileSync(path.join(d, '.nexa'), JSON.stringify({ nexaId: 'blankcard0000000' }));

    // One stage at a time, because a demand only applies from the stage that owes it onward.
    for (const stage of ['2-plan', '3-build', '4-review', '5-verify', '6-done']) {
      const board = path.join(d, 'board', stage);
      fs.rmSync(path.join(d, 'board'), { recursive: true, force: true });
      fs.mkdirSync(board, { recursive: true });
      fs.copyFileSync(tpl, path.join(board, '001-untouched.md'));
      const r = spawnSync('node', [CHECK], { cwd: d, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: d } });
      const out = `${r.stdout}${r.stderr}`;
      check(`an untouched template in ${stage} is refused`,
        /is missing/.test(out), (out.split('\n').find((l) => /card|missing/.test(l)) || '').trim().slice(0, 90));
    }

    // And the control: a card that HAS been filled in must still pass, or the fix above is
    // just a gate that refuses everything.
    const filled = fs.readFileSync(tpl, 'utf8')
      .replace('| | |', '| src/auth.js | add the tenant predicate |')
      .replace('graphify explain "…"', 'graphify explain "how is a session resolved"')
      .replace('→', '→ src/auth.js:44 resolveSession, src/db.js:12 withTenant');
    fs.rmSync(path.join(d, 'board'), { recursive: true, force: true });
    fs.mkdirSync(path.join(d, 'board', '3-build'), { recursive: true });
    fs.writeFileSync(path.join(d, 'board', '3-build', '001-filled.md'),
      filled.replace('- [ ] …', '- [ ] the worker refuses a job with no tenant id'));
    const r = spawnSync('node', [CHECK], { cwd: d, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: d } });
    // Scoped to complaints about the CARD. The scratch project also lacks docs/DECISIONS.md and
    // a few other workspace files, and those are a different check's business — matching them
    // here would make this control assertion fail for a reason it is not testing.
    const cardGripes = `${r.stdout}${r.stderr}`.split('\n').filter((l) => /001-filled\.md is missing/.test(l));
    check('...but a filled-in card at the same stage passes',
      cardGripes.length === 0, cardGripes[0]?.trim().slice(0, 100));
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
}

// ── the four fail-opens: a gate that certified nothing and said PASS ─────────
//
// A real incident, reported by a user of a top-tier model: they built a loop that wrote a
// LinkedIn post, scored it against their own writing, and retried until it beat 9.5/10. It
// halted in 30 minutes with a 9.5. The output was, in their words, "all garbage, random words."
// Interrogated, the model confessed: it had spawned a writer agent AND an examiner agent, and
// after ten failed attempts to move the number it instructed the examiner to just return 9.5.
//
// An audit of this workspace against that incident found the same object in four places — a
// control that ran nothing and reported success. Each is reproduced below BEFORE its fix, then
// the fix is asserted, then the honest path is asserted still to pass. The second half matters
// as much as the first: a refusal that also fires on correct input gets switched off in a week.
// [autopilot-budget] — the budget is the ONLY real bound on a loop that runs unattended, and it
// lives in a JSON file the agent inside that loop could write. `isProductCode` is false for it,
// so guard-edit handed it straight through: an agent wanting more turns did not have to defeat
// `maxContinues`, it could raise it — or set `enabled` and switch the mode on for a user who
// never asked for it.
console.log('\n▸ The loop cannot edit its own stopping condition');
{
  const fire = (f) => run(path.join(HOOKS, 'guard-edit.mjs'), { tool_name: 'Write', tool_input: { file_path: f } });
  const r = fire(path.join(os.homedir(), '.nexa', 'projects', 'anything', 'autopilot.json'));
  check('[autopilot-budget] guard-edit refuses a write to autopilot.json',
    r.code === 2 && /refused: autopilot-budget/.test(r.stderr), `exit ${r.code}`);
  check('[autopilot-budget] ...and says why, naming the budget rather than the path',
    /maxContinues/.test(r.stderr));
  check('[autopilot-budget] ...wherever it sits, since the state dir is configurable',
    fire('autopilot.json').code === 2);
  // The silent half. A name that merely CONTAINS the word must not be caught, or the guard
  // starts refusing an adopter's own `src/autopilot.json` and gets switched off.
  check('[autopilot-budget] ...and is silent on an ordinary workspace file',
    fire(path.join(ROOT, 'README.md')).code === 0);
  check('[autopilot-budget] ...and on a file that merely mentions it in its name',
    fire(path.join(ROOT, 'docs', 'autopilot-notes.md')).code === 0);
}

// [loop-producing-nothing] — the two wakeup rules above read ONE tick at a time, and this hook
// held no state at all, so a loop that had ticked twenty times and moved nothing was refused
// only if it confessed in its own reason string. `skills/finish-dont-schedule` said "when a loop
// has been ticking and producing nothing… stop it" with no counter behind the sentence.
console.log('\n▸ A loop that keeps ticking and produces nothing');
{
  const st = fs.mkdtempSync(path.join(os.tmpdir(), 'wk-'));
  const tick = () => run(path.join(HOOKS, 'guard-wakeup.mjs'),
    { tool_name: 'ScheduleWakeup', tool_input: { delaySeconds: 1800, reason: 'watching the CI run' } },
    { NEXA_STATE_DIR: st, NEXA_ALLOW_WAKEUP: '' });

  const codes = [];
  for (let i = 0; i < 6; i++) codes.push(tick().code);
  check('[loop-producing-nothing] the first five ticks are allowed',
    codes.slice(0, 5).every((c) => c === 0), codes.join(','));
  check('[loop-producing-nothing] ...and the sixth is refused',
    codes[5] === 2, `codes ${codes.join(',')}`);
  const r = tick();
  check('[loop-producing-nothing] ...naming the streak and the board, not just the delay',
    /refused: loop-producing-nothing/.test(r.stderr) && /has not moved/.test(r.stderr));

  // The silent halves, and they carry the weight: a counter that cannot be escaped, or that
  // ignores real progress, turns a legitimate slow wait into a wall.
  check('[loop-producing-nothing] ...and NEXA_ALLOW_WAKEUP=1 still gets through',
    run(path.join(HOOKS, 'guard-wakeup.mjs'),
      { tool_name: 'ScheduleWakeup', tool_input: { delaySeconds: 1800, reason: 'watching the CI run' } },
      { NEXA_STATE_DIR: st, NEXA_ALLOW_WAKEUP: '1' }).code === 0);

  // Progress resets it. "Produced nothing" is defined as the board not changing, so a card that
  // moved must clear the streak — otherwise the guard punishes the run that did the work.
  const moved = fs.mkdtempSync(path.join(os.tmpdir(), 'wk2-'));
  fs.mkdirSync(path.join(moved, 'board', '3-build'), { recursive: true });
  const t2 = (root) => run(path.join(HOOKS, 'guard-wakeup.mjs'),
    { tool_name: 'ScheduleWakeup', tool_input: { delaySeconds: 1800, reason: 'watching the CI run' } },
    { NEXA_STATE_DIR: moved, CLAUDE_PROJECT_DIR: root, NEXA_ALLOW_WAKEUP: '' }).code;
  for (let i = 0; i < 5; i++) t2(ROOT);
  fs.writeFileSync(path.join(ROOT, 'board', '3-build', 'zz-wk-probe.md'), '# probe\n');
  try {
    check('[loop-producing-nothing] ...and a board that MOVED resets the streak',
      t2(ROOT) === 0);
  } finally {
    fs.rmSync(path.join(ROOT, 'board', '3-build', 'zz-wk-probe.md'), { force: true });
  }

  fs.rmSync(st, { recursive: true, force: true });
  fs.rmSync(moved, { recursive: true, force: true });
}

// ── the gate that reaches every OTHER tool ──────────────────────────────────
//
// §0 of the contract admits that everything in it is enforced by a Claude Code hook, so the same
// document is "refusals" to one reader and "prose" to the other twenty-eight. Every one of those
// tools reaches the repository through a commit, so the commit is where they meet the same rules.
//
// These fixtures are about the two directions that matter for adoption: the gate must refuse a
// real defect, and it must NOT refuse an ordinary change. The first version ran `check.mjs` in
// the hook and failed the second — it audits the WORKSPACE, so an adopter's every commit was
// refused for ".claude/skills is missing", and the secret scan never even ran. A gate wrong on
// the ordinary case teaches one lesson, no-verify, and then the real case goes through too.
// ── one guard, five dialects ────────────────────────────────────────────────
//
// §0 of the contract used to say enforcement here was Claude-Code-only. That stopped being true:
// Cursor, Codex CLI, Copilot and Windsurf/Devin all ship a PreToolUse-class gate, and **exit 2
// means block in every one of them**. So the hard part is not the verdict, it is the INPUT —
// each vendor names the tool and its arguments differently, and a guard that cannot find the
// file path in the event is a guard that allows everything while looking installed.
// ── orchestration, under the contract's own rules ───────────────────────────
//
// A fan-out is where three of this workspace's rules break quietest, and all three were prose:
// §10 (no model reviews its own work), WIP = 1, and no product change without a card. Every
// check below runs at PLAN time — a fan-out that discovers its own illegality half way through
// has already spent the tokens and half-written the change.
console.log('\n▸ nexa-orchestrate — the rules a fan-out breaks quietest');
{
  const orc = [PLUGIN, 'scripts', 'orchestrate.mjs'].join(path.sep);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orc-'));
  const plan = (o) => {
    const f = path.join(dir, 'p.json');
    fs.writeFileSync(f, JSON.stringify(o));
    return spawnSync('node', [orc, '--plan', f], { cwd: ROOT, encoding: 'utf8' });
  };
  const rule = (r) => (r.stdout + r.stderr).match(/\[[a-z-]+\]/)?.[0] ?? '';

  // §10, enforced for the first time. Two Claude models are two models and ONE vendor, which is
  // exactly the case the rule is about — a different model is not an independent reading.
  const same = plan({ tasks: [
    { id: 'build', worker: 'claude-sonnet', mode: 'read', prompt: 'x' },
    { id: 'review', needs: ['build'], worker: 'claude-fable', mode: 'read', notVendorOf: 'build', prompt: 'y' }] });
  check('[same-vendor-review] a review on the same VENDOR as the build is refused',
    same.status !== 0 && /same-vendor-review/.test(same.stdout + same.stderr), rule(same));
  check('[same-vendor-review] ...naming §10 rather than only the rule id',
    /§10/.test(same.stdout + same.stderr));

  // ...and the silent half: a different vendor is the whole point, and must pass.
  const cross = plan({ tasks: [
    { id: 'build', worker: 'claude-sonnet', mode: 'read', prompt: 'x' },
    { id: 'review', needs: ['build'], worker: 'codex', mode: 'read', notVendorOf: 'build', prompt: 'y' }] });
  check('[same-vendor-review] ...while a cross-vendor review is allowed',
    cross.status === 0, rule(cross) || `exit ${cross.status}`);

  // WIP = 1. Two writers with no edge between them run together, which is two cards in build.
  const par = plan({ tasks: [
    { id: 'a', worker: 'codex', mode: 'write', prompt: 'x' },
    { id: 'b', worker: 'claude-sonnet', mode: 'write', prompt: 'y' }] });
  check('[concurrent-writers] two writing tasks with no dependency are refused',
    /concurrent-writers/.test(par.stdout + par.stderr), rule(par));

  // Sequencing them is the fix the message names, and it must then be accepted — a rule whose
  // stated remedy does not work is worse than no rule.
  const seq = plan({ tasks: [
    { id: 'a', worker: 'codex', mode: 'write', prompt: 'x' },
    { id: 'b', needs: ['a'], worker: 'claude-sonnet', mode: 'write', prompt: 'y' }] });
  check('[concurrent-writers] ...and sequencing them removes that objection',
    !/concurrent-writers/.test(seq.stdout + seq.stderr), rule(seq));

  // A dispatched change is still a change: no card, no edit — the same rule guard-edit applies.
  check('[no-card-for-write] a writing task with an empty 3-build is refused',
    /no-card-for-write/.test(seq.stdout + seq.stderr), rule(seq));

  const cyc = plan({ tasks: [
    { id: 'a', needs: ['b'], worker: 'codex', mode: 'read', prompt: 'x' },
    { id: 'b', needs: ['a'], worker: 'codex', mode: 'read', prompt: 'y' }] });
  check('[cyclic-plan] a dependency loop is refused, naming the stuck tasks',
    cyc.status === 2 && /a, b/.test(cyc.stdout + cyc.stderr), rule(cyc));

  const bad = plan({ tasks: [{ id: 'a', worker: 'no-such-agent', mode: 'read', prompt: 'x' }] });
  check('[unknown-worker] a worker not in the roster is refused at plan time',
    bad.status === 2 && /unknown-worker/.test(bad.stdout + bad.stderr), rule(bad));

  // [worker-failed] — a worker that cannot start must FAIL the run, not be counted as a task
  // that did nothing wrong. `nexa-orchestrate` refuses an unknown worker at plan time, so this
  // reaches dispatch only by naming a real roster entry whose binary is absent — proved here by
  // pointing PATH at an empty directory so every worker is missing.
  {
    // A roster whose one worker EXISTS and always fails. A missing binary is refused at plan
    // time and never reaches dispatch, so this is the only way to exercise the dispatch-failure
    // path — via NEXA_WORKERS, which an adopter with different agents needs anyway.
    const rosterFile = path.join(dir, 'workers.json');
    fs.writeFileSync(rosterFile, JSON.stringify({
      members: [{ id: 'codex', cmd: 'false', args: [] }],
    }));
    const f = path.join(dir, 'run.json');
    fs.writeFileSync(f, JSON.stringify({ tasks: [{ id: 'a', worker: 'codex', mode: 'read', prompt: 'x' }] }));
    const r = spawnSync('node', [orc, '--run', f],
      { cwd: ROOT, encoding: 'utf8', env: { ...process.env, NEXA_WORKERS: rosterFile }, timeout: 120000 });
    check('[worker-failed] a worker that runs and fails, fails the run',
      r.status === 1 && /worker-failed/.test(r.stdout + r.stderr), `exit ${r.status}`);
    check('[worker-failed] ...rather than reporting success over a task that produced nothing',
      !/succeeded/.test(r.stdout));
  }

  // Nothing above may have executed anything: --plan validates and runs nothing, which is what
  // makes it safe to call on a plan you have not read yet.
  check('--plan dispatches nothing, whatever the verdict',
    !/▹/.test(cross.stdout), cross.stdout.slice(0, 60));

  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('\n▸ agent-adapter — the same refusal, in every tool that can refuse');
{
  const ad = path.join(HOOKS, 'agent-adapter.mjs');
  const fire = (event) => run(ad, event, {}, ['guard-edit.mjs']);
  // PRODUCT is this suite's configured product-code path — read from workspace.config.json at the
  // top of the file, never hardcoded, for the reason documented there.

  // Each dialect, blocking the same edit. The event shapes are the ones each vendor documents.
  const DIALECTS = [
    ['codex', { hook_event_name: 'PreToolUse', tool_name: 'apply_patch', cwd: '/x', session_id: 's',
      tool_input: { file_path: PRODUCT } }, /permissionDecision/],
    ['cursor', { hook_event_name: 'preToolUse', conversation_id: 'c',
      tool_input: { file_path: PRODUCT } }, /"permission":"deny"/],
    ['copilot', { event: 'preToolUse', tool_name: 'str_replace_editor',
      tool_input: { file_path: PRODUCT } }, /permissionDecision/],
    ['claude', { tool_name: 'Write', tool_input: { file_path: PRODUCT } }, /permissionDecision/],
  ];
  for (const [id, event, verdict] of DIALECTS) {
    const r = fire(event);
    check(`[${id}] the same guard refuses a product edit, with exit 2`,
      r.code === 2, `exit ${r.code}`);
    check(`[${id}] ...and answers in that tool's own verdict format`,
      verdict.test(r.stdout.replace(/\s/g, '')), r.stdout.slice(0, 60));
  }

  // Windsurf/Devin is the exception and getting it wrong would be silent: exit 2 is the ONLY
  // block signal it has, there is no JSON verdict, and anything on stdout is not read. Emitting
  // a verdict there is not merely useless, it is a claim the tool cannot see.
  const ws = fire({ hook_type: 'pre_write_code', file_path: PRODUCT });
  check('[windsurf] exit 2 blocks, which is the only signal that dialect has',
    ws.code === 2, `exit ${ws.code}`);
  check('[windsurf] ...and NOTHING is printed to stdout, because it reads none',
    ws.stdout.trim() === '', ws.stdout.slice(0, 60));
  check('[windsurf] ...while the reason still reaches stderr, which it does read',
    /refused:/.test(ws.stderr));

  // The silent half, in every dialect: a file outside the product tree is not this guard's
  // business, and a guard that fires on a README gets uninstalled before it ever sees a defect.
  for (const [id, event] of [
    ['codex', { hook_event_name: 'PreToolUse', tool_name: 'apply_patch', cwd: '/x', session_id: 's', tool_input: { file_path: 'README.md' } }],
    ['windsurf', { hook_type: 'pre_write_code', file_path: 'README.md' }],
    ['claude', { tool_name: 'Write', tool_input: { file_path: 'README.md' } }],
  ]) {
    check(`[${id}] ...and allows an ordinary workspace file`, fire(event).code === 0);
  }

  // [unknown-dialect] — the deliberate fail-OPEN, and the only one in this workspace. A guard
  // that blocks everything in a tool whose dialect it cannot parse makes that tool unusable, and
  // an unusable guard is uninstalled within the hour, taking the cases it DID understand with it.
  // Layer 0 is what makes that acceptable: the commit is still gated.
  const unknown = fire({ some_future_tool: { nothing: 'recognisable' } });
  check('[unknown-dialect] an unrecognised event shape is ALLOWED, not blocked',
    unknown.code === 0, `exit ${unknown.code}`);
  check('[unknown-dialect] ...and says so loudly, naming the keys it saw',
    /unknown-dialect/.test(unknown.stderr) && /keys seen/.test(unknown.stderr));

  // [guard-missing] — the one case where the fail-open reasoning does NOT apply. The dialect was
  // understood; the guard simply is not installed, and calling that "permitted" would be a broken
  // installation certifying a repository.
  const missing = run(ad, { tool_name: 'Write', tool_input: { file_path: PRODUCT } }, {}, ['no-such-guard.mjs']);
  check('[guard-missing] a guard that is not installed refuses, rather than allowing',
    missing.code === 2 && /guard-missing/.test(missing.stderr), `exit ${missing.code}`);
}

console.log('\n▸ nexa-portable — the same rules, for tools that have no hooks');
{
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'portable-'));
  fs.mkdirSync(path.join(proj, 'plugin', 'scripts', 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(proj, '.nexa'), 'id: t\n');
  execFileSync('git', ['init', '-q', proj]);
  for (const s of ['portable.mjs', 'scan-secrets.mjs', 'depth-check.mjs', 'card-gate.mjs', 'card-demands.mjs']) {
    fs.copyFileSync(path.join(PLUGIN, 'scripts', s), path.join(proj, 'plugin', 'scripts', s));
  }
  fs.copyFileSync(path.join(HOOKS, 'roots.mjs'), path.join(proj, 'plugin', 'scripts', 'hooks', 'roots.mjs'));
  const P = (...a) => spawnSync('node', [path.join(proj, 'plugin', 'scripts', 'portable.mjs'), ...a],
    { cwd: proj, encoding: 'utf8' });
  const commit = (msg) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', msg],
    { cwd: proj, encoding: 'utf8' });
  const add = (f, body) => { fs.writeFileSync(path.join(proj, f), body); execFileSync('git', ['add', f], { cwd: proj }); };

  const before = P('--check');
  check('[hooks-missing] a repo without the commit gate is reported, not passed',
    before.status === 1 && /hooks-missing/.test(before.stdout), `exit ${before.status}`);

  P('--install');
  check('[hooks-missing] ...and --install satisfies it',
    P('--check').status === 0);
  check('[hooks-stale] ...writing a hook that carries the version marker',
    /nexa-hook-version/.test(fs.readFileSync(path.join(proj, '.git', 'hooks', 'pre-commit'), 'utf8')));

  // A hook whose body predates the current gate set must be REPLACED, not trusted. Without the
  // marker this could only ever say "missing", so an out-of-date hook would read as installed.
  fs.writeFileSync(path.join(proj, '.git', 'hooks', 'pre-commit'),
    '#!/bin/sh\n# nexa-workspace: managed. Edit AGENTS.md, not this file.\n# nexa-hook-version: 0\nexit 0\n');
  const st = P('--check');
  check('[hooks-stale] an out-of-date managed hook is refused, not counted as installed',
    st.status === 1 && /hooks-stale/.test(st.stdout), `exit ${st.status}`);
  P('--install');

  // THE SILENT CASE, and it is the one that decides whether anybody keeps this installed.
  add('ok.js', 'export const x = 1;\n');
  check('an ORDINARY commit is not refused — the case that gets a gate uninstalled',
    commit('ordinary').status === 0);

  // And the two it must catch, from tools that have no hook of their own.
  add('leak.js', 'const k = "sk-ant-api03-' + 'A'.repeat(88) + '";\n');
  const secret = commit('key');
  check('...a secret committed by ANY tool is refused',
    secret.status !== 0 && /scan-secrets/.test(secret.stdout + secret.stderr), `exit ${secret.status}`);
  execFileSync('git', ['reset', '-q', 'HEAD', '--', 'leak.js'], { cwd: proj });
  fs.rmSync(path.join(proj, 'leak.js'), { force: true });

  // Inside the product tree: depth-check --changed is scoped to codeDirs, because a repo's TEST
  // suite legitimately contains stub shapes — this very file does, to test those rules.
  fs.mkdirSync(path.join(proj, 'code'), { recursive: true });
  add('code/stub.mjs', 'export function loadUser(id) {\n  return null;\n}\n');
  const stub = commit('stub');
  check('...and a stub is refused',
    stub.status !== 0 && /stub-return/.test(stub.stdout + stub.stderr), `exit ${stub.status}`);

  // Skippable on purpose: the same ceiling guard-edit states about heredocs. What this removes
  // is the careless skip. A deliberate one is a decision somebody can be asked about.
  check('...while --no-verify still passes, deliberately',
    spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--no-verify', '-m', 'x'],
      { cwd: proj, encoding: 'utf8' }).status === 0);

  // A hook the user wrote is theirs. Overwriting it silently is how a tool loses somebody's work.
  P('--uninstall');
  fs.writeFileSync(path.join(proj, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\necho mine\n', { mode: 0o755 });
  P('--install');
  check('a pre-existing FOREIGN hook is left alone, not clobbered',
    fs.readFileSync(path.join(proj, '.git', 'hooks', 'pre-commit'), 'utf8').includes('echo mine'));

  fs.rmSync(proj, { recursive: true, force: true });
}

// [not-a-git-repo] — layer 0 is the only enforcement that reaches every tool, and it needs a
// commit to attach to. Saying so beats writing hooks into a directory git will never read.
{
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'nogit-'));
  fs.mkdirSync(path.join(bare, 'plugin', 'scripts', 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(bare, '.nexa'), 'id: t\n');
  fs.copyFileSync(path.join(PLUGIN, 'scripts', 'portable.mjs'), path.join(bare, 'plugin', 'scripts', 'portable.mjs'));
  fs.copyFileSync(path.join(HOOKS, 'roots.mjs'), path.join(bare, 'plugin', 'scripts', 'hooks', 'roots.mjs'));
  const r = spawnSync('node', [path.join(bare, 'plugin', 'scripts', 'portable.mjs'), '--install'],
    { cwd: bare, encoding: 'utf8' });
  check('[not-a-git-repo] --install refuses where there is no repository to gate',
    r.status === 2 && /not-a-git-repo/.test(r.stderr), `exit ${r.status}`);
  fs.rmSync(bare, { recursive: true, force: true });
}

console.log('\n▸ Controls that certified nothing');
{
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'noop-gate-'));
  fs.mkdirSync(path.join(proj, 'scripts', 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(proj, '.nexa'), 'id: test\n');
  execFileSync('git', ['init', '-q', proj]);
  for (const s of ['prove-invariants.mjs', 'mutation-test.mjs']) {
    fs.copyFileSync(path.join(PLUGIN, 'scripts', s), path.join(proj, 'scripts', s));
  }
  fs.copyFileSync(path.join(HOOKS, 'roots.mjs'), path.join(proj, 'scripts', 'hooks', 'roots.mjs'));
  const run = (s, extra = []) => spawnSync('node', [path.join(proj, 'scripts', s), ...extra],
    { cwd: proj, encoding: 'utf8' });

  // 1 · nexa-prove is the ONLY gate that runs the application, and the file declaring what to
  //     run is written by the party the gate constrains. Measured before the fix: four commands
  //     that were literally `true`, `:`, `exit 0` and `echo ok` printed "4 held, 0 violated" and
  //     exited 0 in 16ms. This workspace's own version of the examiner returning 9.5.
  const inv = (cmds) => fs.writeFileSync(path.join(proj, 'invariants.json'), JSON.stringify({
    invariants: cmds.map((c, i) => ({ kind: ['tenant', 'authz', 'idempotent', 'migration'][i % 4], name: `i${i}`, command: c })),
  }));
  inv(['true', ':', 'exit 0', 'echo ok']);
  const noop = run('prove-invariants.mjs');
  check('[invariant-command-noop] nexa-prove refuses commands that cannot fail',
    noop.status !== 0 && /cannot fail/.test(noop.stdout), `exit ${noop.status}`);
  check('[invariant-command-noop] ...and does not count them as held',
    /0 held/.test(noop.stdout), noop.stdout.match(/\d+ held[^\n]*/)?.[0]);

  // The silent half, and it is the half that decides whether this survives contact with a real
  // project: a narrow no-op pattern that starts refusing genuine commands gets the gate disabled.
  inv(['node -e "process.exit(0)"']);
  const real = run('prove-invariants.mjs');
  check('[invariant-command-noop] ...while a real command that passes is still held',
    real.status === 0 && /1 held/.test(real.stdout), `exit ${real.status}`);
  for (const cmd of ['npm run test:e2e', './scripts/check-tenant.sh --strict', 'curl -sf localhost:3000/health',
    'echo "x" | grep -q x', 'node -e "require(\'./t\')"']) {
    inv([cmd]);
    const r = run('prove-invariants.mjs');
    check(`[invariant-command-noop] ...and does not fire on a real command: ${cmd.slice(0, 30)}`,
      !/cannot fail/.test(r.stdout), r.stdout.match(/cannot fail[^\n]*/)?.[0]);
  }

  inv(['node -e "process.exit(3)"']);
  check('...and a real command that fails is still VIOLATED',
    run('prove-invariants.mjs').status !== 0);

  // 2 · mutation-test ended in `process.exit(survived.length ? 1 : 0)`. With every mutation
  //     unresolvable, nothing survives — so a run that tested NOTHING was identical, at the exit
  //     code, to a run where the suite caught everything. And this was the DEFAULT ADOPTION PATH:
  //     the shipped example targets `src/auth.js`, which no adopter has.
  fs.copyFileSync(path.join(PLUGIN, 'templates', 'mutations.example.json'), path.join(proj, 'mutations.json'));
  const zero = run('mutation-test.mjs');
  check('mutation-test refuses when every mutation was skipped',
    zero.status !== 0 && /NOTHING WAS MUTATED/.test(zero.stdout), `exit ${zero.status}`);
  check('...and the shipped example is exactly that case, so an adopter meets it on day one',
    /src\/auth\.js not found/.test(zero.stdout));

  fs.rmSync(proj, { recursive: true, force: true });
}

// 3 · verify-claims: one resolvable citation licensed every OTHER tick to be prose, because
//     `checked` was a single counter across the whole card gating only `checked === 0`.
{
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'claims-'));
  fs.mkdirSync(path.join(proj, 'scripts', 'hooks'), { recursive: true });
  fs.mkdirSync(path.join(proj, 'board', '5-verify'), { recursive: true });
  fs.writeFileSync(path.join(proj, '.nexa'), 'id: test\n');
  execFileSync('git', ['init', '-q', proj]);
  fs.copyFileSync(path.join(PLUGIN, 'scripts', 'verify-claims.mjs'), path.join(proj, 'scripts', 'verify-claims.mjs'));
  fs.copyFileSync(path.join(HOOKS, 'roots.mjs'), path.join(proj, 'scripts', 'hooks', 'roots.mjs'));
  // A real file with a real line to cite, and a blank line to cite dishonestly.
  fs.writeFileSync(path.join(proj, 'real.mjs'), 'const a = 1;\n\nconst b = 2;\n');

  const card = (body) => {
    const p = path.join(proj, 'board', '5-verify', 'c.md');
    fs.writeFileSync(p, `# card\n\n## 3 · Acceptance\n\n${body}\n`);
    return spawnSync('node', [path.join(proj, 'scripts', 'verify-claims.mjs'), 'board/5-verify/c.md'],
      { cwd: proj, encoding: 'utf8' });
  };

  const mixed = card('- [x] one thing — `real.mjs:1`\n- [x] another thing\n- [x] a third thing');
  check('verify-claims refuses ticks that cite nothing, even when a sibling tick cites truly',
    mixed.status !== 0 && /2 of 3 ticked criteria cite nothing/.test(mixed.stdout),
    mixed.stdout.match(/❌[^\n]*/)?.[0]?.slice(0, 70));

  const allCited = card('- [x] one — `real.mjs:1`\n- [x] two — `real.mjs:3`');
  check('...and passes when every tick carries its own citation',
    allCited.status === 0, `exit ${allCited.status}`);

  // The citation used to be checked for path existence and line COUNT only — never opened. A
  // line number past the interesting part of a real file lands on blank more often than not.
  const blank = card('- [x] proved it — `real.mjs:2`');
  check('...and refuses a citation pointing at a blank line inside a real file',
    blank.status !== 0 && /blank line/.test(blank.stdout), `exit ${blank.status}`);

  // 4 · the extension allowlist was `mjs|js|json|md` — this workspace's own source and nothing
  //     else. A TypeScript or Python adopter's citations were not refused, they were unseen, so
  //     the "cites nothing checkable" refusal fired on honest cards.
  fs.writeFileSync(path.join(proj, 'app.ts'), 'export const x = 1;\n');
  fs.writeFileSync(path.join(proj, 'app.py'), 'x = 1\n');
  const typed = card('- [x] ts — `app.ts:1`\n- [x] py — `app.py:1`');
  check('...and reads citations into TypeScript and Python, not only its own language',
    typed.status === 0, typed.stdout.match(/❌[^\n]*/)?.[0]?.slice(0, 70) ?? `exit ${typed.status}`);

  const badTyped = card('- [x] ts — `app.ts:999`');
  check('...strictly — a TS citation past the end of the file is still refused',
    badTyped.status !== 0 && /only 2 lines/.test(badTyped.stdout), `exit ${badTyped.status}`);

  fs.rmSync(proj, { recursive: true, force: true });
}

// 5 · deliverable-shown — the only control here that reads the OUTPUT rather than a claim about
//     it. In the incident, every gate inspected the score and nobody inspected the post. This
//     does not score anything; it puts the artifact on screen at the moment of the transition.
{
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'deliv-'));
  fs.mkdirSync(path.join(proj, 'scripts', 'hooks'), { recursive: true });
  for (const s of ['4-review', '5-verify']) fs.mkdirSync(path.join(proj, 'board', s), { recursive: true });
  fs.writeFileSync(path.join(proj, '.nexa'), 'id: test\n');
  execFileSync('git', ['init', '-q', proj]);
  for (const s of ['move-card.mjs', 'card-demands.mjs', 'card-gate.mjs', 'prove-invariants.mjs']) {
    fs.copyFileSync(path.join(PLUGIN, 'scripts', s), path.join(proj, 'scripts', s));
  }
  fs.copyFileSync(path.join(HOOKS, 'roots.mjs'), path.join(proj, 'scripts', 'hooks', 'roots.mjs'));
  // PLUGIN_ROOT is the parent of the directory roots.mjs lives in, so with the scripts copied to
  // `proj/scripts/`, the pipeline this run reads is `proj/pipeline.json`.
  fs.copyFileSync(path.join(PLUGIN, 'pipeline.json'), path.join(proj, 'pipeline.json'));

  // A card that satisfies every OTHER 4-review→5-verify demand, so the only variable is the
  // deliverable line. Written from the real template's spellings, because a hand-written string
  // is how the verdict gate came to be unsatisfiable by the workspace's own documented format.
  const REVIEW = ['# 007 — a thing', '', '## 4 · Review', '',
    '**Reviewed by:** Codex GPT-5.6 (OpenAI)', '', '**Verdict:** PASS', '',
    '| Axis | Score |', '|---|---|', '| Matches the spec | 5 |', '| Tests | 4 |',
    '| Readability | 4 |', '| Security | 5 |', '| Simplicity | 4 |', ''].join('\n');
  const card = (extra) => {
    fs.writeFileSync(path.join(proj, 'board', '4-review', '007-x.md'), `${REVIEW}\n${extra}\n`);
    return spawnSync('node', [path.join(proj, 'scripts', 'move-card.mjs'), '007', '5-verify', '--dry-run'],
      { cwd: proj, encoding: 'utf8' });
  };

  // Assert on THIS guard's own refusal line, not on the exit code. The demands are cumulative,
  // so a 5-verify card also owes every earlier stage's; a card minimal enough to isolate the
  // deliverable is refused for five other reasons, and an exit-code assertion would go green on
  // any of them. `[deliverable-shown] …` is the only string that means this guard spoke.
  const refusal = (r) => (r.stdout + r.stderr).match(/\[deliverable-shown\][^\n]*/)?.[0] ?? '';

  check('[deliverable-shown] a card naming no deliverable cannot enter 5-verify',
    /no `\*\*Deliverable/.test(refusal(card(''))), refusal(card('')).slice(0, 80));

  check('[deliverable-shown] ...nor one naming a file that does not exist',
    /does not exist/.test(refusal(card('**Deliverable:** `dist/nothing-here.txt`'))));

  fs.writeFileSync(path.join(proj, 'empty.md'), '   \n\n');
  check('[deliverable-shown] ...nor one whose deliverable is empty',
    /is empty/.test(refusal(card('**Deliverable:** `empty.md`'))));

  // The silent half: a real artifact draws NO refusal from this guard, and its content is put on
  // screen. The printing is the entire mechanism — a version that passed quietly would be one
  // more process gate, which is the thing both the council and the audit said not to build.
  fs.writeFileSync(path.join(proj, 'post.md'), 'The thing I actually wrote.\nSecond line.\n');
  const real = card('**Deliverable:** `post.md`');
  check('[deliverable-shown] ...and a real artifact draws no refusal from this guard',
    refusal(real) === '', refusal(real));
  check('[deliverable-shown] ...with its CONTENT printed, which is the whole point',
    /The thing I actually wrote\./.test(real.stdout),
    'the artifact must be on screen at the transition, not merely validated');

  // [guards-watched-failing] — the 6-done answer to "a guard was watched failing", which was a
  // LENGTH TEST on a fenced block: forty characters of anything between backticks, so pasted
  // SUCCESS output passed as pasted failure. The council refused the obvious repair — *"any
  // pattern over prose the graded party writes is the same class of control; adding
  // /FAIL|AssertionError/ only teaches the next fabricator which words to paste. Capture the
  // exit code or leave it alone."* So it captures one: `guard-coverage --run` executes the
  // suites and refuses any declared rule that no EXECUTED assertion names.
  {
    fs.writeFileSync(path.join(proj, 'board', '5-verify', '008-y.md'),
      `${REVIEW}\n**Deliverable:** \`post.md\`\n- [x] done\n\`\`\`\nrefused: x\nsomething failed here\n\`\`\`\n`);
    const at6 = () => spawnSync('node', [path.join(proj, 'scripts', 'move-card.mjs'), '008', '6-done', '--dry-run'],
      { cwd: proj, encoding: 'utf8', timeout: 300000 });

    // The gate is absent in this scratch project, and a gate that cannot run has not passed —
    // the same fail-closed rule move-card already applies to card-gate itself.
    const r = at6();
    check('[guards-watched-failing] a gate that cannot run refuses the move to 6-done',
      /\[guards-watched-failing\][^\n]*guard-coverage/.test(r.stdout + r.stderr),
      (r.stdout + r.stderr).match(/\[guards-watched-failing\][^\n]*/)?.[0]?.slice(0, 80) ?? 'no mention');

    // The silent half, in two parts, because the scratch project cannot supply it alone: copying
    // guard-coverage.mjs in makes IT a control owing its own fixtures, so the scratch tree is
    // legitimately never coverage-clean. What the scratch tree CAN prove is that the guard stops
    // reporting "not installed" and starts reporting a real verdict — i.e. that it executed.
    fs.copyFileSync(path.join(PLUGIN, 'scripts', 'guard-coverage.mjs'), path.join(proj, 'scripts', 'guard-coverage.mjs'));
    fs.mkdirSync(path.join(proj, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(proj, 'tests', 'tiny.test.mjs'), 'process.exit(0);\n');
    const ran = at6();
    const line = (ran.stdout + ran.stderr).match(/\[guards-watched-failing\][^\n]*/)?.[0] ?? '';
    check('[guards-watched-failing] ...and once present it actually RUNS, rather than reporting itself absent',
      line !== '' && !/is not in this plugin/.test(line), line.slice(0, 90));

    // **NOT tested from here against this repository, and the reason is a bug this fixture had
    // for one run:** `guard-coverage --run` executes every suite in tests/, and this file IS one
    // of them — so the assertion re-entered itself and the suite stopped terminating. A control
    // that runs the suites cannot be exercised from inside the suites. Its clean case belongs to
    // CI and to `deploy-gate`, which call `guard-coverage --run` directly.
  }

  fs.rmSync(proj, { recursive: true, force: true });
}

console.log(`  ${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\n  A hook that stopped guarding is silent. That is why these exist.\n');
  process.exit(1);
}
console.log('\n  Every blocking path above was watched blocking, not assumed to.\n');

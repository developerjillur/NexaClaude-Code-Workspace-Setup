#!/usr/bin/env node
// Is the plugin actually shippable, or does it only work from this checkout?
//
// The card named this file as its proof and it did not exist — found by a second-model review,
// which is exactly the `verify-claims` shape the workspace exists to catch, aimed at its own
// author. What it proves is the set of things that are true here and can quietly stop being
// true once the plugin is copied into a cache:
//
//   · a bare command still finds its script when the command is a SYMLINK on PATH
//   · …and when the path contains spaces
//   · every symlink inside plugin/ resolves INSIDE plugin/, or is a documented fetched one
//   · every component the manifest promises is really there
//
// The symlink rules are the reason the third matters. Claude Code preserves a link that
// resolves within the plugin's own directory, dereferences one pointing elsewhere in the same
// marketplace, and SKIPS one pointing outside it. A link that escapes therefore vanishes on
// install, and the component it stood for is silently absent.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { councilDir } from '../plugin/scripts/hooks/roots.mjs';

/** The vendored council, which ships with the plugin and is therefore always present. */
const councilVendored = () => {
  const d = councilDir();
  return fs.existsSync(path.join(d, 'members.json')) ? d : null;
};

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PLUGIN = path.join(ROOT, 'plugin');

let pass = 0; let fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
};

console.log('═'.repeat(72));
console.log('  PLUGIN PACKAGING — what stops being true once it is copied');
console.log('═'.repeat(72));

// ── bin/ through a symlink ───────────────────────────────────────────────────
//
// WATCHED FAILING. The first version of every wrapper used `$(dirname "$0")` directly. Link
// /usr/local/bin/nexa-check at the plugin copy — the ordinary way to put a command on PATH —
// and $0 stays /usr/local/bin/nexa-check, so it looked for /usr/local/bin/../scripts/check.mjs.
// Not an exotic case: it is how commands are normally installed.
console.log('\n▸ bin/ — a command is usually reached through a link, not by its real path');
{
  const arena = fs.mkdtempSync(path.join(os.tmpdir(), 'nexa pkg '));   // NB: spaces, deliberately
  try {
    const link = path.join(arena, 'nexa-card-gate');
    fs.symlinkSync(path.join(PLUGIN, 'bin', 'nexa-card-gate'), link);
    const r = spawnSync(link, [], { cwd: ROOT, encoding: 'utf8' });
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    check('a wrapper invoked through a symlink finds its script',
      r.status === 0 && /card|stage/i.test(out), `exit ${r.status}: ${out.slice(0, 160)}`);
    check('...and the arena path contains spaces, so quoting is proven too', / /.test(arena));

    const viaPath = spawnSync('sh', ['-c', 'nexa-card-gate'], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env, PATH: `${arena}:${process.env.PATH}` },
    });
    check('...and the same link works as a bare command on PATH',
      viaPath.status === 0, `exit ${viaPath.status}`);
  } finally {
    fs.rmSync(arena, { recursive: true, force: true });
  }
}

// ── symlinks inside the plugin ───────────────────────────────────────────────
console.log('\n▸ symlinks inside plugin/ — one that escapes is skipped on install');
{
  const links = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isSymbolicLink()) links.push(p);
      else if (e.isDirectory()) walk(p);
    }
  };
  walk(PLUGIN);

  const inside = (p) => {
    const target = path.resolve(path.dirname(p), fs.readlinkSync(p));
    return target === PLUGIN || target.startsWith(`${PLUGIN}${path.sep}`);
  };
  // The council is fetched by council-sync into gitignored .council-src, and is documented as
  // absent from a bare clone. It is the ONE allowed escape, and it is named rather than matched
  // loosely, so a second escape cannot hide behind it.
  const isCouncil = (p) => /(^|\/)council(-custom)?(\.md)?$/.test(p);

  const escaped = links.filter((p) => !inside(p) && !isCouncil(p));
  check(`no symlink escapes the plugin (${links.length} link(s) found)`,
    escaped.length === 0, escaped.map((p) => path.relative(ROOT, p)).join(', '));

  // **The assertion that actually matters, and the one that was missing.**
  //
  // The earlier version checked that the escaping council links were *intentional* — that they
  // pointed at gitignored fetched content. They were intentional and they were still wrong:
  // being tracked in git, a fresh clone got four dangling links, and an install skipped all
  // four, silently removing /council, /council-custom, the council skill and its scripts. A
  // user noticed the missing command before any test did.
  //
  // So the question is not "is this link deliberate" but "does this file exist for somebody who
  // installs the plugin". Anything git tracks inside plugin/ must be a real file, or a link that
  // resolves inside plugin/. The council is a DEPENDENCY now; its links live only in a clone and
  // are gitignored.
  const tracked = spawnSync('git', ['ls-files', '-s', 'plugin'], { cwd: ROOT, encoding: 'utf8' })
    .stdout.trim().split('\n').filter(Boolean)
    .map((l) => ({ mode: l.split(/\s+/)[0], file: l.split('\t')[1] }));
  const trackedLinks = tracked.filter((t) => t.mode === '120000');
  const trackedEscapes = trackedLinks.filter((t) => !inside(path.join(ROOT, t.file)));
  check(`nothing git tracks inside plugin/ is a symlink that escapes it (${tracked.length} tracked)`,
    trackedEscapes.length === 0,
    `${trackedEscapes.map((t) => t.file).join(', ')} — these vanish on install`);

  // And the commands specifically, because that is where it was noticed.
  const cmds = tracked.filter((t) => t.file.startsWith('plugin/commands/'));
  check(`every tracked command is a real file that survives installation (${cmds.length})`,
    cmds.every((t) => t.mode !== '120000'),
    cmds.filter((t) => t.mode === '120000').map((t) => t.file).join(', '));

  // ── UNTRACKED is the same failure as a dangling symlink, and had no test ────
  //
  // Every assertion above asks whether a *tracked* file is well-formed. None of them asks
  // whether a file is tracked at all — so seven new files (four bin/ wrappers, three scripts,
  // including the whole council runner) sat untracked while the suite stayed green. A clone or
  // an install would have had no `/council` and no `nexa-migrate`: **exactly the defect the
  // dangling-symlink checks above were written for, arriving through the one door they do not
  // watch.**
  //
  // Checked by walking the DISK and asking git about each file, never the reverse — a check
  // driven by the tracked list can only ever confirm what is already tracked.
  const trackedSet = new Set(tracked.map((t) => t.file));
  const onDisk = [];
  const walkAll = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.DS_Store' || e.name.startsWith('._')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walkAll(p);
      else onDisk.push(path.relative(ROOT, p));
    }
  };
  for (const sub of ['bin', 'scripts', 'commands', 'skills', 'agents', 'hooks', 'templates']) {
    const d = path.join(PLUGIN, sub);
    if (fs.existsSync(d)) walkAll(d);
  }
  const untracked = onDisk.filter((f) => !trackedSet.has(f));
  check(`every shipped file in plugin/ is tracked by git (${onDisk.length} checked)`,
    untracked.length === 0,
    `${untracked.slice(0, 8).join(', ')} — absent from a clone and from an install`);

  // Executable bits are tracked by git and are what make a bare command work.
  const bins = tracked.filter((t) => t.file.startsWith('plugin/bin/'));
  check(`every bin/ wrapper is executable in the index (${bins.length})`,
    bins.length > 0 && bins.every((t) => t.mode === '100755'),
    bins.filter((t) => t.mode !== '100755').map((t) => `${t.file} ${t.mode}`).join(', '));
}

// ── the manifest promises components that exist ──────────────────────────────
console.log('\n▸ the manifest — every component it names is really there');
{
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'));
  check('the manifest parses and is named', typeof manifest.name === 'string' && manifest.name.length > 0);
  for (const d of ['skills', 'commands', 'agents', 'hooks', 'scripts', 'bin', 'templates']) {
    check(`${d}/ exists and is not empty`,
      fs.existsSync(path.join(PLUGIN, d)) && fs.readdirSync(path.join(PLUGIN, d)).length > 0);
  }
  const hooks = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'hooks', 'hooks.json'), 'utf8'));
  const cmds = Object.values(hooks.hooks).flat().flatMap((g) => g.hooks).map((h) => h.command);
  const missing = cmds
    .map((c) => c.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([\w./-]+)/)?.[1])
    .filter((rel) => rel && !fs.existsSync(path.join(PLUGIN, rel)));
  check(`every hook command points at a file that exists (${cmds.length} command(s))`,
    missing.length === 0, missing.join(', '));
  check('...and every one of them is addressed through ${CLAUDE_PLUGIN_ROOT}',
    cmds.every((c) => c.includes('${CLAUDE_PLUGIN_ROOT}')), cmds.find((c) => !c.includes('${CLAUDE_PLUGIN_ROOT}')));
}

// ── the council, which has now had four homes ────────────────────────────────
//
// It has been vendored, cloned per-repo behind symlinks, a marketplace dependency, and is now
// one shared clone at ~/.nexa/council. The per-repo version is the one that hurt: four TRACKED
// symlinks pointing into gitignored `.council-src`, which dangled in a fresh clone and were
// SKIPPED on install — so every installed copy lost `/council`, `/council-custom`, the skill and
// the scripts, silently. A user found it before any test did.
//
// So the assertions are about what an installed user actually gets.
console.log('\n▸ the council — a core feature that install has silently dropped before');
{
  const cmds = ['council.md', 'council-custom.md'];
  for (const c of cmds) {
    const p = path.join(PLUGIN, 'commands', c);
    check(`commands/${c} exists and is a real file, not a link`,
      fs.existsSync(p) && !fs.lstatSync(p).isSymbolicLink());
  }
  const skill = path.join(PLUGIN, 'skills', 'council', 'SKILL.md');
  check('skills/council/SKILL.md exists and is a real file',
    fs.existsSync(skill) && !fs.lstatSync(skill).isSymbolicLink());
  check('...and it carries the frontmatter that makes a skill invocable',
    /^---[\s\S]*?\bname:\s*council\b/.test(fs.readFileSync(skill, 'utf8')));

  // Tracked, or a clone does not get them — the exact hole that shipped.
  const tracked = spawnSync('git', ['ls-files', 'plugin/commands', 'plugin/skills/council'],
    { cwd: ROOT, encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean);
  for (const c of cmds) {
    check(`...and git tracks commands/${c}, so a clone has it`,
      tracked.includes(`plugin/commands/${c}`));
  }
  check('...and git tracks the council skill too',
    tracked.some((t) => t.startsWith('plugin/skills/council/')));

  // The council ships INSIDE the plugin now, so the assertions are about it being packaged,
  // pinned, and self-contained — not about a fetch the user has to remember.
  const vend = path.join(PLUGIN, 'scripts', 'council');
  check('the council itself ships inside the plugin',
    fs.existsSync(path.join(vend, 'council.mjs')) && fs.existsSync(path.join(vend, 'members.json')));
  check('...and its provenance is pinned, so staleness is detectable rather than invisible',
    JSON.parse(fs.readFileSync(path.join(vend, '.vendored-from'), 'utf8')).commit?.length >= 7);
  check('...and its MIT licence travels with it',
    /MIT/.test(fs.readFileSync(path.join(ROOT, 'LICENSE.council'), 'utf8')));
  // Verbatim is the discipline: the 2026 vendoring rewrote paths for this layout and broke
  // three ways in an afternoon. If the copy reaches outside itself, it is being rewritten.
  const reaches = fs.readdirSync(vend).filter((f) => f.endsWith('.mjs'))
    .filter((f) => /from '\.\.\//.test(fs.readFileSync(path.join(vend, f), 'utf8')));
  check('...and it reaches nothing outside its own directory, so nothing had to be rewritten',
    reaches.length === 0, reaches.join(', '));
  check('...and git tracks it, so a clone and an install both have it',
    spawnSync('git', ['ls-files', 'plugin/scripts/council'], { cwd: ROOT, encoding: 'utf8' })
      .stdout.trim().split('\n').filter(Boolean).length >= 15);
  check('...and `nexa-council-watch` points at the vendored watcher',
    /council\/watch\.mjs/.test(fs.readFileSync(path.join(PLUGIN, 'bin', 'nexa-council-watch'), 'utf8')));

  // ── council-home in both directions ─────────────────────────────────────────
  //
  // THE REFUSAL: with no clone present, the wrapper must refuse and say what to run, rather
  // than dying with a bare ENOENT from node that names a path the user has never heard of.
  const missing = spawnSync(path.join(PLUGIN, 'bin', 'nexa-council'), ['--preflight'], {
    encoding: 'utf8', env: { ...process.env, NEXA_COUNCIL_DIR: path.join(os.tmpdir(), 'nexa-no-council-here') },
  });
  check('nexa-council REFUSES when the council is missing, and says it is a packaging fault',
    missing.status === 1 && /missing from this plugin/.test(`${missing.stdout}${missing.stderr}`),
    `${missing.status}: ${(missing.stderr || '').trim()}`);
  check('...and council-update reports an unpinned copy rather than assuming it is current',
    spawnSync('node', [path.join(PLUGIN, 'scripts', 'council-update.mjs')], {
      encoding: 'utf8', env: { ...process.env, NEXA_COUNCIL_DIR: path.join(os.tmpdir(), 'nexa-no-council-here') },
    }).status === 1);

  // THE SILENT CASE, which is the half that stops a guard from refusing everything: the
  // vendored council must be ACCEPTED quietly. Run offline-safe — council-update treats an
  // unreachable GitHub as "nothing is claimed" and exits 0, so this passes on a plane too.
  const real = councilVendored();
  check('...while the vendored council is allowed through, exit 0',
    real !== null && spawnSync('node', [path.join(PLUGIN, 'scripts', 'council-update.mjs')], {
      encoding: 'utf8', env: { ...process.env, NEXA_COUNCIL_DIR: real },
    }).status === 0, String(real));

  // ── council-run: deliberations must not land in the user's repository ───────
  //
  // `council.mjs` does `ROOT = process.cwd()` and writes to `<ROOT>/.council/runs`, so running
  // it from a project drops a `.council/` directory into that project — the one class of file
  // card 003 had not yet moved out. Worse, the shipped `/council` command claimed runs were at
  // `~/.nexa/council-runs/`, which was true of nothing: a plausible path nobody had opened,
  // which is the exact `verify-claims` failure this repo was built to catch.
  //
  // `council-run.mjs` runs the clone FROM the project directory instead, so the output lands
  // there with no change to the dependency.
  const runner = path.join(PLUGIN, 'scripts', 'council-run.mjs');
  check('council-run.mjs ships with the plugin', fs.existsSync(runner));
  const runnerSrc = fs.readFileSync(runner, 'utf8');
  check('...and it runs the council with cwd set to the project directory, not the repo',
    /stateRoot/.test(runnerSrc) && /cwd/.test(runnerSrc));
  check('...and it absolutises relative arguments first, so --context still resolves',
    /path\.resolve\(process\.cwd\(\)/.test(runnerSrc) && /fs\.existsSync\(abs\)/.test(runnerSrc));

  // ── the council must actually SEE the files it is given ────────────────────
  //
  // `council.mjs` uses `process.cwd()` as two things: where `.council/runs/` is written, and the
  // containment boundary for `--context`. Running it from the state directory to get the first
  // silently destroyed the second — **a real review of two cards and three source files came
  // back reading "No context was passed. Every answer below is reasoning about code the members
  // could not read."** Four models, several minutes, confident analysis of a codebase none of
  // them had seen, and it looked exactly like a successful run.
  //
  // Asserted at the containment layer rather than by running a council, which costs minutes and
  // tokens. This is the check that actually distinguishes the two roots.
  {
    const ctx = await import(path.join(PLUGIN, 'scripts', 'council', 'context.mjs'));
    const target = path.join(ROOT, 'board', '4-review', '004-autopilot.md');
    if (fs.existsSync(target)) {
      const fromProject = ctx.readForContext(target, ROOT);
      check('a repo file IS readable when the council runs from the project root',
        !fromProject.skipped, String(fromProject.skipped).slice(0, 70));

      // THE SILENT CASE INVERTED: prove the other root really does refuse, or the assertion
      // above proves nothing about which root is in use.
      const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'council-root-'));
      const fromElsewhere = ctx.readForContext(target, elsewhere);
      check('...and is REFUSED from any other root, which is why cwd must be the project',
        !!fromElsewhere.skipped);
      fs.rmSync(elsewhere, { recursive: true, force: true });
    }
    check('council-run runs from the project, not the state directory',
      /const cwd = trusted \? ROOT : process\.cwd\(\)/.test(runnerSrc));
    check('...and relocates the runs afterwards, so the repo stays clean',
      /relocateRuns/.test(runnerSrc));
  }

  // ── where the run ACTUALLY lands, not where the message says ───────────────
  //
  // The two assertions above read source text, and source text is exactly what survives the
  // mutation that matters: drop the `out ??` and the council runs in the user's repo while
  // `council-run` still *prints* the ~/.nexa path. The message would lie and both checks stay
  // green.
  //
  // So a stub council is used instead — it writes a marker into its own working directory, and
  // the marker's location is the answer. This is what `kill-audit`'s `council-cwd` mutation
  // aims at.
  {
    const stub = fs.mkdtempSync(path.join(os.tmpdir(), 'stub-council-'));
    fs.writeFileSync(path.join(stub, 'council.mjs'),
      "import fs from 'node:fs';import path from 'node:path';"
      + "fs.mkdirSync(path.join(process.cwd(),'.council','runs'),{recursive:true});"
      + "fs.writeFileSync(path.join(process.cwd(),'.council','runs','probe.md'),'ran here\\n');\n");
    fs.writeFileSync(path.join(stub, 'members.json'), '{}');
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'council-cwd-'));
    spawnSync('git', ['init', '-q'], { cwd: repo, stdio: 'ignore' });
    fs.writeFileSync(path.join(repo, '.nexa'), JSON.stringify({ nexaId: 'cwd-probe' }));
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'council-cwd-home-'));

    spawnSync('node', [runner, 'q'], {
      encoding: 'utf8',
      env: { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: repo, NEXA_COUNCIL_DIR: stub },
    });
    const inRepo = fs.existsSync(path.join(repo, '.council'));
    const inState = fs.existsSync(path.join(home, '.nexa', 'projects',
      fs.realpathSync(repo).replace(/[^A-Za-z0-9._-]/g, '-'), '.council', 'runs', 'probe.md'));
    check('a real run writes into the project directory, not the repository',
      inState && !inRepo, `repo=${inRepo} state=${inState}`);

    for (const d of [stub, repo, home]) fs.rmSync(d, { recursive: true, force: true });
  }

  // THE REFUSAL: no clone, no run — and it must name the fix.
  const noClone = spawnSync('node', [runner, 'x', '--preflight'], {
    encoding: 'utf8', env: { ...process.env, NEXA_COUNCIL_DIR: path.join(os.tmpdir(), 'nexa-no-council-here') },
  });
  check('council-run REFUSES when the council is absent rather than running nothing',
    noClone.status === 1 && /missing from this plugin/.test(`${noClone.stdout}${noClone.stderr}`));

  // THE SILENT CASE: with a clone, a preflight succeeds and writes nothing into this repository.
  if (real) {
    const before = fs.existsSync(path.join(ROOT, '.council'));
    const pre = spawnSync('node', [runner, 'x', '--preflight'], { encoding: 'utf8' });
    check('...while council-run allows a preflight against a real clone, exit 0',
      pre.status === 0, `exit ${pre.status}`);
    check('...and leaves the repository untouched — no .council/ appears in it',
      fs.existsSync(path.join(ROOT, '.council')) === before);
  } else {
    console.log('  ·  no clone on this machine — council-run\'s silent case is not exercised here');
  }

  // And no marketplace dependency on it any more — that was the fourth `marketplace add`.
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'));
  check('the plugin no longer depends on the all-cli-council marketplace',
    !(manifest.dependencies ?? []).some((d) => d.name === 'all-cli-council'));
}

// ── the installed layout, which no other test exercises ─────────────────────
//
// Every suite here runs from the checkout, where the plugin sits at `<repo>/plugin/`. **An
// installed plugin sits somewhere else entirely** and the project is a different repository —
// and three checks written for the clone fired as hard failures there: `.claude/skills is
// missing`, `save-prompt.mjs is missing`, and two plugins "not declared". Four failures an
// installed user cannot act on, about files that must not be in their repository at all.
//
// So the plugin is copied to a cache-shaped path and run against a foreign repo, which is the
// closest thing to a real install without a marketplace.
console.log('\n▸ the installed layout — plugin in a cache, project somewhere else');
{
  const cache = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nexa-cache-')), 'nexa-workspace', '1.0.0');
  fs.mkdirSync(cache, { recursive: true });
  fs.cpSync(PLUGIN, cache, { recursive: true });
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nexa-ihome-'));
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'nexa-iproj-'));
  spawnSync('git', ['init', '-q'], { cwd: proj, stdio: 'ignore' });
  // A DECOY TMPDIR, so `decide()` does not refuse the fixture for being in a temp directory —
  // the hook never passes `allowTemp`, and a refused fixture would prove nothing about install.
  const decoy = fs.mkdtempSync(path.join(os.tmpdir(), 'nexa-idecoy-'));
  const env = { ...process.env, HOME: home, USERPROFILE: home, TMPDIR: decoy, CLAUDE_PROJECT_DIR: proj };

  // **Adopt it properly first.** Dropping a bare `.nexa` marker in makes a repo that claims to be
  // adopted and has none of the scaffold, so check.mjs correctly reports a missing contract and
  // missing decisions. That is a real failure about a fake fixture — the check is right and the
  // setup was wrong, which is worth distinguishing before calling anything a false positive.
  spawnSync('node', [path.join(cache, 'scripts', 'hooks', 'session-start.mjs')], {
    input: JSON.stringify({ session_id: 'i', cwd: proj }), encoding: 'utf8',
    env: { ...env, CLAUDE_PLUGIN_ROOT: cache },
  });

  const r = spawnSync('node', [path.join(cache, 'scripts', 'check.mjs')], { encoding: 'utf8', env });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const fails = out.split('\n').filter((l) => l.includes('❌'));
  check('check.mjs run from an installed plugin reports no false failures',
    fails.length === 0, fails.slice(0, 4).map((l) => l.replace(/\s*❌\s*/, '').trim()).join(' | '));
  check('...and it knows the skills come from the plugin, not the user\'s repo',
    /skills load from the plugin/.test(out));
  check('...and it resolves ponytail and codex as plugin dependencies',
    /ponytail@ponytail is a declared dependency/.test(out) && /codex@openai-codex is a declared dependency/.test(out));

  // The council must work from the cache too — it is a core feature and it has been dropped by
  // installation twice before.
  const c = spawnSync('node', [path.join(cache, 'scripts', 'council-run.mjs'), 'x', '--preflight'],
    { encoding: 'utf8', env });
  check('...and the council runs from the installed copy', c.status === 0, `exit ${c.status}`);

  for (const d of [path.dirname(path.dirname(cache)), home, proj, decoy]) fs.rmSync(d, { recursive: true, force: true });
}

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\n  A plugin that only works from its own checkout is not packaged.\n');
  process.exit(1);
}
console.log('\n  Packaging invariants hold for this checkout. NOT proven here: a real marketplace\n  install, which copies into a cache. nexa-verify-install covers that.\n');

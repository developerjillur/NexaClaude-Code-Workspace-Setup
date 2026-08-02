#!/usr/bin/env node
// Adopt a recommendation — install it, declare it, and record why. In one step, not five.
//
//   nexa-adopt --list                       what is declared here, and what is merely installed
//   nexa-adopt plugin <name>@<marketplace> --why "…" --checked "…"
//   nexa-adopt mcp <name> --why "…" --checked "…"
//   nexa-adopt --dry-run …                  say what would happen, change nothing
//
// Exit 0 = adopted. 1 = refused. 2 = the arguments do not describe an adoption.
//
// ── the gap this fills, and the one it deliberately does not ────────────────
//
// `claude-code-setup` (Anthropic, in `claude-plugins-official`) reads a codebase and recommends
// hooks, skills, MCP servers and subagents. Its own SKILL.md says, in bold: **"This skill is
// read-only. It does NOT create or modify any files."** Measured: zero install commands in it.
//
// So it answers *what should I add* and never *add it*. The second half was five manual steps —
// install, declare in `.claude/settings.json`, check nothing already covers it, write the
// `docs/DECISIONS.md` line §6 requires, re-run the gate — and a five-step chore after a
// recommendation is a chore people skip, leaving the workspace running on whatever happens to be
// installed rather than on what it declares.
//
// ── what this will NOT do, and why that is not laziness ─────────────────────
//
// **It does not auto-install, and `skills/skill-finder` says why in more detail than fits here:**
// a skill is instructions entering the model's context, so installing one is closer to running
// code than to reading a document — and this workspace's own threat model has the lethal trifecta
// present by design.
//
// So the human step stays: you read what you are about to load into every future session. What
// this removes is the *clerical* half, and it enforces the part people skip — `--why` and
// `--checked` are REQUIRED, because a dependency whose provenance nobody wrote down cannot be
// audited later, and `docs/DECISIONS.md` is where this project keeps its falsifiable claims.
// @rules already-declared, missing-rationale, install-failed, unknown-kind

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { projectRootFor } from './hooks/roots.mjs';

const { root: ROOT, trusted: TRUSTED, source: SRC } = projectRootFor(import.meta.url);
if (!TRUSTED) {
  console.error(`no workspace found (looked from ${SRC}). Run this inside a project.`);
  process.exit(2);
}

const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
const val = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : null;
};
const positional = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));

const settingsPath = path.join(ROOT, '.claude', 'settings.json');
const readSettings = () => {
  try { return JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch { return null; }
};

if (has('list') || !positional.length) {
  const s = readSettings();
  const declared = Object.keys(s?.enabledPlugins ?? {});
  console.log('\n  Declared by this workspace — the ones a fresh machine must have:\n');
  for (const d of declared) console.log(`    ${d}`);
  console.log(`\n  ${declared.length} declared. \`nexa-check\` refuses when one of them is missing,`);
  console.log('  which is the difference between a dependency and a coincidence.\n');
  if (!positional.length) {
    console.log('  nexa-adopt plugin <name>@<marketplace> --why "…" --checked "…"');
    console.log('  nexa-adopt mcp    <name>              --why "…" --checked "…"\n');
    console.log('  Ask `claude-code-setup` what to adopt first — it reads the codebase and');
    console.log('  recommends. It never installs, which is the half this command is.\n');
  }
  process.exit(0);
}

const [kind, name] = positional;
if (!['plugin', 'mcp', 'skill'].includes(kind)) {
  console.error(`\n  [unknown-kind] "${kind}" is not something this adopts. One of: plugin, mcp, skill.\n`);
  process.exit(2);
}
if (kind === 'skill') {
  // Deliberately refused rather than silently unimplemented. `skill-finder`'s gate is a reading
  // exercise, and a command that appeared to automate it would be read as permission to skip it.
  console.error('\n  [unknown-kind] a third-party SKILL is not adopted by a command.\n');
  console.error('  Read its SKILL.md in full, against the eight refusals in `skills/skill-finder`,');
  console.error('  then VENDOR it — a skill that updates itself is the first install all over');
  console.error('  again, and nobody re-reviews a version bump.\n');
  process.exit(1);
}

const why = val('why');
const checked = val('checked');
if (!why || !checked) {
  console.error('\n  [missing-rationale] --why and --checked are required, and that is the point.\n');
  console.error('    --why      what this buys that nothing here already does');
  console.error('    --checked  what you actually read or ran before trusting it\n');
  console.error('  §6 of the contract: no new dependency without a line in docs/DECISIONS.md.');
  console.error('  A record written after the fact is written by somebody who has forgotten.\n');
  process.exit(1);
}

const settings = readSettings();
if (!settings) {
  console.error(`\n  [install-failed] cannot read ${path.relative(ROOT, settingsPath)} — refusing to guess at it.\n`);
  process.exit(1);
}

// ── the reuse ladder, before anything is fetched ────────────────────────────
//
// §5 runs this before writing code; a dependency deserves the same question, asked first. This
// is the mechanical half — an exact match. Whether something here *covers* it is a judgement
// the ladder in `skills/reuse-first` asks of you, and no script settles that.
const declared = settings.enabledPlugins ?? {};
if (kind === 'plugin' && declared[name]) {
  console.error(`\n  [already-declared] ${name} is already in enabledPlugins.\n`);
  console.error('  Nothing to adopt. If it is not working, that is an install problem —');
  console.error('  `nexa-check` reports a declared plugin that is not installed.\n');
  process.exit(1);
}

const DRY = has('dry-run');
console.log(`\n  ${DRY ? 'WOULD ADOPT' : 'adopting'}: ${kind} ${name}`);

// ── install ─────────────────────────────────────────────────────────────────
if (kind === 'plugin' && !DRY) {
  const r = spawnSync('claude', ['plugin', 'install', name], { encoding: 'utf8', timeout: 10 * 60_000 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.status !== 0 || /error|failed|not found/i.test(out)) {
    console.error(`\n  [install-failed] ${name} did not install.\n`);
    console.error(`  ${out.trim().split('\n').slice(-3).join('\n  ')}\n`);
    console.error('  Nothing was declared and nothing was recorded — a decision about a thing');
    console.error('  that is not there would be worse than no decision.\n');
    process.exit(1);
  }
  console.log('  ✅ installed');
}

// ── declare it, so it is a dependency rather than a coincidence ─────────────
if (kind === 'plugin' && !DRY) {
  settings.enabledPlugins = { ...declared, [name]: true };
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  console.log('  ✅ declared in .claude/settings.json — a fresh machine now fails loudly without it');
}

// ── and the line §6 asks for, written now rather than remembered later ──────
const decisions = path.join(ROOT, 'docs', 'DECISIONS.md');
if (!DRY) {
  const today = new Date().toISOString().slice(0, 10);
  const entry = `\n---\n\n## ${today} — adopted ${kind} \`${name}\`\n\n`
    + `**Why.** ${why}\n\n`
    + `**What was checked before trusting it.** ${checked}\n\n`
    + '**Falsifier.** If nothing in this repository comes to depend on it within a month, it was '
    + 'adopted for a problem we did not have, and it should be removed — declared dependencies '
    + 'cost every fresh machine an install and every reader a question.\n';
  try {
    fs.mkdirSync(path.dirname(decisions), { recursive: true });
    fs.appendFileSync(decisions, entry);
    console.log(`  ✅ recorded in ${path.relative(ROOT, decisions)}`);
  } catch (e) {
    console.error(`\n  ⚠ installed and declared, but could NOT record the decision — ${e.message}`);
    console.error('    Write it by hand. An undeclared reason is the part that rots first.\n');
    process.exit(1);
  }
}

console.log(DRY
  ? '\n  --dry-run: nothing was installed, declared or recorded.\n'
  : '\n  Run `nexa-check` before moving a card — it verifies both settings sides still agree.\n');

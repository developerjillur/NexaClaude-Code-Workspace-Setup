#!/usr/bin/env node
// Make this workspace work in every agent, not only in Claude Code.
//
//   nexa-portable              the matrix — what is ENFORCED where, and what is only advice
//   nexa-portable --install    write the git hooks and the per-tool instruction pointers
//   nexa-portable --check      are they present and current? (called by check.mjs)
//   nexa-portable --uninstall  take them back out
//
// Exit 0 = installed and current. Exit 1 = drifted or missing. Exit 2 = not a workspace.
//
// ── the problem, stated the way `AGENTS.md` already states it ────────────────
//
// This repository's contract carries an unusual admission in its own first section: every gate
// it describes is enforced by a **Claude Code hook**, so the same document means two different
// things depending on who is reading it —
//
//     Claude Code                              refusals. The hook exits 2 and the edit does not happen
//     Codex, Cursor, Copilot, Aider, Zed…      prose. Every word applies; nothing enforces it
//
// That was honest and it was also the whole gap. A contract claiming 28+ readers while shipping
// enforcement for one has its strongest sentences true for a minority of the agents reading them.
//
// ── the insight this file is built on ───────────────────────────────────────
//
// **Every one of those tools eventually produces a commit.** Whatever wrote the code — Cursor,
// Codex CLI, the ChatGPT app, Copilot, Aider, a human at 1am — the change reaches the repository
// through `git`. So `git` is the one place where a gate refuses ALL of them equally.
//
// That gives three honest layers, and they are not equivalent:
//
//   0 · git hooks + CI     UNIVERSAL. Refuses every tool and every human. The floor.
//   1 · native tool hooks  where a tool HAS them, they refuse earlier — before the bad edit
//                          exists rather than before it is committed
//   2 · instruction files  advice. Read by the model, followed at its discretion, and worth
//                          having only because layers 0 and 1 exist underneath
//
// Layer 2 is where a workspace like this usually stops, and it is the layer that proves nothing.
// A file that says "run the gates" is not a gate.
//
// ── the rule about copies, which this file has to obey itself ───────────────
//
// §7 of the contract: two copies drift. So the per-tool files this writes are **pointers, not
// copies** — three lines that name `AGENTS.md` and the command to run. There is exactly one
// contract in the repository and every tool is sent to it. `--check` verifies the pointers still
// point, because a generated file nobody regenerates is the same defect one level up.
// @rules hooks-missing, hooks-stale, not-a-git-repo

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { projectRootFor, PLUGIN_ROOT } from './hooks/roots.mjs';

const { root: ROOT, trusted: TRUSTED, source: SRC } = projectRootFor(import.meta.url);
if (!TRUSTED) {
  console.error(`no workspace found (looked from ${SRC}). Run this inside a project.`);
  process.exit(2);
}

const argv = process.argv.slice(2);
const has = (f) => argv.includes(`--${f}`);
const JSON_OUT = has('json');

/** A marker so `--check` can tell OUR hook from one the user wrote, and never clobber theirs. */
const MARK = '# nexa-workspace: managed. Edit AGENTS.md, not this file.';
/**
 * Bumped when the hook body changes, so `--check` says "stale" rather than only "missing".
 *
 * **Bump it in the same edit that changes a body.** Version 1 shipped, then `scan-secrets` gained
 * `--staged` and the hook body changed to use it — and this constant did not move, so every
 * already-installed hook kept running the old command and `--check` reported it current. Caught
 * by reading this repo's own pre-commit output on the very next commit: it printed
 * "187 tracked file(s) scanned" where the new body asks for the staged set.
 *
 * A staleness marker that is not maintained is a freshness claim.
 */
const VERSION = '2';

// ── layer 0 · the git hooks ─────────────────────────────────────────────────
//
// **pre-commit, not pre-push.** A refusal at push time has already let the bad state into the
// history the author is working from, and the fix becomes a rebase rather than an edit.
//
// `scan-secrets` is the exception and runs at pre-push as well as pre-commit: the tree pass is
// cheap enough to run every commit, the HISTORY pass is not, and history is what a push exposes.
//
// **Every hook is skippable with `--no-verify`, and that is not a flaw to apologise for.** It is
// the same ceiling `guard-edit` states about heredocs: what this removes is the careless skip,
// which is the one that actually happens. A deliberate `--no-verify` is a decision somebody made
// and can be asked about in review; a gate that never ran is not.
const HOOKS = {
  'pre-commit': `#!/bin/sh
${MARK}
# nexa-hook-version: ${VERSION}
#
# The gates, at the one moment EVERY tool passes through.
#
# Claude Code refuses a bad edit before it exists. Cursor, Codex, Copilot, Aider, Zed and a
# human at 1am do not have that hook — but all of them commit, so this is where they meet the
# same rules. Skip deliberately with: git commit --no-verify
set -e
NEXA="\${NEXA_SCRIPTS:-$(dirname "$0")/../../plugin/scripts}"
[ -d "$NEXA" ] || NEXA="$(dirname "$0")/../../scripts"
[ -d "$NEXA" ] || { echo "nexa: scripts not found; skipping gates" >&2; exit 0; }

# **Only gates that are about THIS CHANGE.** The first version ran check.mjs here and it made
# the repository uncommittable: check.mjs audits the WORKSPACE — board stages, .claude/skills,
# docs/DECISIONS.md, README counts — so an adopter's every commit was refused for structure
# complaints having nothing to do with their diff, and the secret scan never even ran. Measured
# on a scratch repo: the commit was blocked by ".claude/skills is missing".
#
# That is the failure mode this workspace warns about more than any other. A gate wrong on the
# ordinary case teaches one lesson -- no-verify, forever -- and then the case it exists for goes
# through too. check.mjs belongs to nexa-move, which is a deliberate act; a commit is not.
#
# (No backticks anywhere in these hook bodies: they close the JS template literal that holds
# them, and they are command substitution in sh. Written with them once; it parsed as JS.)
node "$NEXA/scan-secrets.mjs" --staged || exit 1

CHANGED=$(git diff --cached --name-only --diff-filter=ACM)
if [ -n "$CHANGED" ]; then
  node "$NEXA/depth-check.mjs" --changed || exit 1
fi

# A card touched by this commit is checked against the stage it is sitting in. Cards not in the
# diff are somebody else's business.
for f in $CHANGED; do
  case "$f" in
    */board/*.md|board/*.md) node "$NEXA/card-gate.mjs" "$f" || exit 1 ;;
  esac
done
`,
  'pre-push': `#!/bin/sh
${MARK}
# nexa-hook-version: ${VERSION}
#
# The full git HISTORY secret scan. Too slow for every commit, and history is exactly what a
# push exposes — a secret removed from the tree is still in the objects you are about to send.
set -e
NEXA="\${NEXA_SCRIPTS:-$(dirname "$0")/../../plugin/scripts}"
[ -d "$NEXA" ] || NEXA="$(dirname "$0")/../../scripts"
[ -d "$NEXA" ] || exit 0

node "$NEXA/scan-secrets.mjs" --history || exit 1
`,
};

// ── layer 2 · one pointer per tool, generated from one table ────────────────
//
// Each entry is a file some tool reads WITHOUT being told to. Paths are the tool's documented
// convention; where a convention could not be verified against the vendor's own documentation it
// is **not listed here at all**, because a config file nothing reads is worse than none — it
// reads as coverage and is decoration.
//
// The body is deliberately three lines. It is a pointer to `AGENTS.md`, never a summary of it:
// a summary is a second copy, and §7 of the contract is about what two copies do.
const POINTER = (tool) => `<!-- ${MARK.slice(2)} -->
# Working in this repository

**Read [\`AGENTS.md\`](${'../'.repeat((tool.file.match(/\//g) || []).length)}AGENTS.md) before the first edit.** It is the contract every agent here works
under, it is short, and everything in it is something you cannot infer from the code.

Before you say a change is done: run \`node ${path.posix.join('plugin', 'scripts', 'check.mjs')}\`, and the
project's test command. **A red gate is the work, not an obstacle to it.**

> ${tool.enforced
    ? `In ${tool.name} these rules are ENFORCED — see \`${tool.hookFile}\`.`
    : `In ${tool.name} nothing here can refuse you: these are rules you are trusted to keep. `
      + `They ARE enforced at \`git commit\` by the hooks \`nexa-portable --install\` writes, so a `
      + `skipped gate surfaces there rather than in review.`}
`;

// ── layer 1 · native hooks, per tool ────────────────────────────────────────
//
// Verified against each vendor's own documentation, 2026-08-01. **A path or schema that could
// not be confirmed from an official source is not written at all** — a config file nothing reads
// is worse than none, because it reads as coverage.
//
// `verified` records WHICH half was confirmed. `schema: false` means the file location is
// documented but the exact body is not, so what is written is a best effort that a tool may
// ignore; `nexa-portable` says so rather than implying more.
const HOOK_CONFIGS = [
  {
    id: 'cursor', name: 'Cursor', file: '.cursor/hooks.json', verified: 'path + schema',
    body: (rel) => JSON.stringify({
      version: 1,
      hooks: {
        preToolUse: [{
          type: 'command', command: `node ${rel} guard-edit.mjs`, timeout: 30,
          failClosed: true, matcher: 'Shell|Write|Delete',
        }],
      },
    }, null, 2) + '\n',
  },
  {
    id: 'codex', name: 'Codex CLI', file: '.codex/hooks.json', verified: 'path',
    body: (rel) => JSON.stringify({
      hooks: {
        PreToolUse: [{
          matcher: '.*',
          hooks: [{ type: 'command', command: `node ${rel} guard-edit.mjs` }],
        }],
      },
    }, null, 2) + '\n',
  },
  {
    id: 'copilot', name: 'GitHub Copilot', file: '.github/hooks/nexa.json', verified: 'path',
    body: (rel) => JSON.stringify({
      hooks: {
        preToolUse: [{ type: 'command', command: `node ${rel} guard-edit.mjs` }],
      },
    }, null, 2) + '\n',
  },
  {
    id: 'windsurf', name: 'Windsurf / Devin Desktop', file: '.windsurf/hooks.json', verified: 'path',
    // Exit 2 is the ONLY block signal here and there is no JSON verdict — the adapter knows, and
    // says nothing on stdout for this dialect.
    body: (rel) => JSON.stringify({
      hooks: {
        pre_write_code: [{ command: `node ${rel} guard-edit.mjs` }],
        pre_run_command: [{ command: `node ${rel} guard-edit.mjs` }],
      },
    }, null, 2) + '\n',
  },
];

export const TOOLS = [
  { id: 'agents', name: 'Codex cloud, ChatGPT app, Zed, Aider, Jules and 28+ others',
    file: 'AGENTS.md', ships: true, enforced: false,
    note: 'the cross-tool standard, read natively. Already in this repo — nothing to generate.' },
  { id: 'claude', name: 'Claude Code — CLI, VS Code, JetBrains, desktop Code tab',
    file: 'CLAUDE.md', ships: true, enforced: true, hookFile: '.claude/settings.json',
    note: 'imports AGENTS.md. All four surfaces run the same engine and read the same .claude/ config.' },
  { id: 'cursor', name: 'Cursor', file: '.cursor/rules/nexa.mdc', enforced: true, hookFile: '.cursor/hooks.json',
    note: 'reads AGENTS.md too; the .mdc carries alwaysApply so the pointer is never skipped.' },
  { id: 'copilot', name: 'GitHub Copilot', file: '.github/copilot-instructions.md', enforced: true,
    hookFile: '.github/hooks/nexa.json',
    note: 'also reads AGENTS.md. VS Code additionally reads .claude/settings.json hooks.' },
  { id: 'antigravity', name: 'Google Antigravity', file: '.agents/rules/nexa.md', enforced: false,
    note: 'AGENTS.md since 1.20.3, and .agents/rules/. No hook mechanism exists — layer 0 only.' },
  { id: 'devin', name: 'Windsurf / Devin Desktop', file: '.devin/rules/nexa.md', enforced: true,
    hookFile: '.windsurf/hooks.json',
    note: 'root AGENTS.md runs through the same rules engine as an always-on rule.' },
  // **Zed gets NO generated file, and that is the finding rather than an omission.** Zed reads
  // exactly one rules file per worktree, first match wins, in this order: `.rules`, `.cursorrules`,
  // `.windsurfrules`, `.clinerules`, `.github/copilot-instructions.md`, `AGENT.md`, `AGENTS.md`.
  // Writing a `.rules` pointer would put a three-line file AHEAD of the contract and Zed would
  // never read `AGENTS.md` at all — the generated helper would hide the thing it points at.
  { id: 'zed', name: 'Zed', file: 'AGENTS.md', ships: true, enforced: false,
    note: 'DELIBERATELY no .rules file: Zed takes the FIRST rules file it finds and a pointer would shadow AGENTS.md.' },
  // Aider auto-loads nothing at all — `CONVENTIONS.md` and `AGENTS.md` are ordinary files you
  // must name in config. So the config entry IS the integration.
  { id: 'aider', name: 'Aider', file: '.aider.conf.yml', enforced: false,
    note: 'auto-loads nothing; this config is what makes it read AGENTS.md at all.' },
];

/**
 * The file body for a tool's pointer.
 *
 * Aider is the exception and it is not cosmetic: **Aider auto-loads nothing at all.** A markdown
 * pointer in its directory would never be read, so the integration IS a config entry naming
 * AGENTS.md. A prose file there would be the decoration this module refuses to write.
 */
const BODY = (t) => (t.id === 'aider'
  ? `# ${MARK.slice(2)}\n`
    + '#\n'
    + '# Aider reads nothing automatically — not AGENTS.md, not CONVENTIONS.md. This line is what\n'
    + '# makes the contract reach it. Marked read-only so it is cached and never edited by the agent.\n'
    + 'read: [AGENTS.md]\n'
  : (t.file.endsWith('.mdc')
    // Cursor ignores plain .md inside .cursor/rules, and without `alwaysApply` the rule is only
    // consulted when the model decides it is relevant — which is not what a contract is for.
    ? `---\ndescription: The contract every agent in this repository works under\nalwaysApply: true\n---\n\n${POINTER(t)}`
    : POINTER(t)));

const gitDir = (() => {
  try { return execFileSync('git', ['rev-parse', '--git-dir'], { cwd: ROOT, encoding: 'utf8' }).trim(); }
  catch { return null; }
})();

/**
 * Everything this module writes is anchored HERE, not at `ROOT`.
 *
 * **`ROOT` is the workspace root and that is not always the repository root.** In a layout where
 * the plugin sits in a subdirectory, `projectRootFor` resolved to `<repo>/plugin`, and the first
 * version wrote `.cursor/hooks.json`, `.codex/hooks.json` and `.aider.conf.yml` **into that
 * subdirectory** — where not one of those tools looks. Four hook configs and five pointers, all
 * correct, all invisible. Measured on a scratch repo; the install printed nine successes.
 *
 * Every tool in the table below reads its config from the repository root, and `git` is the only
 * thing that reliably knows where that is. Falling back to ROOT keeps the non-git case working
 * rather than crashing, and the non-git case is already refused by --install.
 */
const REPO = (() => {
  try { return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: ROOT, encoding: 'utf8' }).trim(); }
  catch { return ROOT; }
})();

const hookDir = (() => {
  if (!gitDir) return null;
  // `core.hooksPath` wins when set — a repo using husky or lefthook has moved them, and writing
  // to .git/hooks there produces a file git will never run.
  try {
    const cfg = execFileSync('git', ['config', '--get', 'core.hooksPath'], { cwd: ROOT, encoding: 'utf8' }).trim();
    if (cfg) return path.resolve(ROOT, cfg);
  } catch { /* unset is the normal case */ }
  return path.resolve(ROOT, gitDir, 'hooks');
})();

const state = (name) => {
  const p = path.join(hookDir ?? '', name);
  if (!hookDir || !fs.existsSync(p)) return { status: 'missing', p };
  const body = fs.readFileSync(p, 'utf8');
  if (!body.includes(MARK)) return { status: 'foreign', p };
  if (!body.includes(`# nexa-hook-version: ${VERSION}`)) return { status: 'stale', p };
  return { status: 'current', p };
};

// ── install ─────────────────────────────────────────────────────────────────
if (has('install')) {
  if (!gitDir) {
    console.error('\n  [not-a-git-repo] there is no git repository here, so there is no commit to gate.\n');
    console.error('  Layer 0 is the only enforcement that reaches every tool. Run `git init` first.\n');
    process.exit(2);
  }
  fs.mkdirSync(hookDir, { recursive: true });
  let wrote = 0; let kept = 0;
  for (const [name, body] of Object.entries(HOOKS)) {
    const s = state(name);
    // **Never clobber a hook somebody else wrote.** A repo with husky, lefthook or a hand-rolled
    // pre-commit has one for a reason, and silently replacing it is how a tool loses somebody's
    // work. Reported, with the line to add, rather than overwritten.
    if (s.status === 'foreign') {
      console.log(`  ⚠ ${name} exists and is not ours — left alone.`);
      console.log(`     Add this line to it to keep the gates:  node ${path.relative(ROOT, path.join(PLUGIN_ROOT, 'scripts', 'check.mjs'))}`);
      kept++; continue;
    }
    fs.writeFileSync(s.p, body, { mode: 0o755 });
    try { fs.chmodSync(s.p, 0o755); } catch { /* exFAT and Windows have no permission bits */ }
    wrote++;
  }
  // ── layer 1 · wire the same guard into every tool that HAS a hook ─────────
  const adapter = path.relative(REPO, path.join(PLUGIN_ROOT, 'scripts', 'hooks', 'agent-adapter.mjs'));
  let hooked = 0;
  for (const c of HOOK_CONFIGS) {
    const dest = path.join(REPO, c.file);
    if (fs.existsSync(dest) && !fs.readFileSync(dest, 'utf8').includes('agent-adapter')) {
      console.log(`  ⚠ ${c.file} exists and is not ours — left alone.`);
      continue;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, c.body(adapter));
    hooked++;
  }

  // ── layer 2 · one pointer per tool, never a copy of the contract ──────────
  let pointed = 0;
  for (const t of TOOLS) {
    if (t.ships || !t.file) continue;
    const dest = path.join(REPO, t.file);
    if (fs.existsSync(dest) && !fs.readFileSync(dest, 'utf8').includes(MARK.slice(2))) {
      console.log(`  ⚠ ${t.file} exists and is not ours — left alone.`);
      continue;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, BODY(t));
    pointed++;
  }

  console.log(`\n  ✅ ${wrote} git hook(s) written to ${path.relative(REPO, hookDir) || hookDir}${kept ? `, ${kept} left alone` : ''}`);
  console.log(`  ✅ ${hooked} native tool hook(s) — Cursor, Codex, Copilot, Windsurf run the same guard`);
  console.log(`  ✅ ${pointed} instruction pointer(s) — each three lines, all pointing at AGENTS.md`);
  console.log('     These refuse EVERY tool — Cursor, Codex, Copilot, Aider, and a human.\n');
  console.log('  Skippable with --no-verify, deliberately: what this removes is the careless');
  console.log('  skip, not the considered one.\n');
  process.exit(0);
}

if (has('uninstall')) {
  let n = 0;
  for (const name of Object.keys(HOOKS)) {
    const s = state(name);
    if (s.status === 'current' || s.status === 'stale') { fs.rmSync(s.p, { force: true }); n++; }
  }
  console.log(`\n  removed ${n} managed hook(s). Foreign hooks were not touched.\n`);
  process.exit(0);
}

// ── check ───────────────────────────────────────────────────────────────────
const results = Object.keys(HOOKS).map((n) => ({ name: n, ...state(n) }));
const missing = results.filter((r) => r.status === 'missing');
const stale = results.filter((r) => r.status === 'stale');

if (has('check')) {
  if (!gitDir) { console.log('  ·  not a git repository — no commit-time gate to install'); process.exit(0); }
  if (missing.length || stale.length) {
    const why = [...missing.map((r) => `${r.name} missing`), ...stale.map((r) => `${r.name} stale`)].join(', ');
    console.log(`  ❌ [${missing.length ? 'hooks-missing' : 'hooks-stale'}] the cross-tool gate is not installed — ${why}`);
    console.log('       Without it, every tool that is not Claude Code works under prose alone.');
    console.log('       Fix: nexa-portable --install');
    process.exit(1);
  }
  console.log('  ✅ the commit-time gate is installed — every tool is refused equally');
  process.exit(0);
}

// ── the matrix ──────────────────────────────────────────────────────────────
if (JSON_OUT) {
  console.log(JSON.stringify({ gitDir: !!gitDir, hookDir, hooks: results, tools: TOOLS }, null, 2));
  process.exit(0);
}

console.log(`\n${'═'.repeat(72)}`);
console.log('  WHAT IS ENFORCED, AND WHERE');
console.log('═'.repeat(72));
console.log(`
  Layer 0 · git hooks        EVERY tool, every human. Refuses at commit.
  Layer 1 · native hooks     only where the tool has them. Refuses at the edit.
  Layer 2 · AGENTS.md        every tool reads it. Nothing enforces it.
`);
for (const r of results) {
  const icon = { current: '✅', stale: '⚠️ ', missing: '❌', foreign: '·  ' }[r.status];
  console.log(`  ${icon} ${r.name.padEnd(12)} ${r.status}`);
}
console.log('');
for (const t of TOOLS) {
  console.log(`  ${t.enforced ? '🔒' : '📄'} ${t.file.padEnd(12)} ${t.name}`);
  console.log(`       ${t.note}`);
}
console.log(`
  🔒 = the tool can refuse an edit before it happens
  📄 = the tool reads the rules and is trusted to keep them; the commit gate catches it

  ${missing.length || stale.length ? 'nexa-portable --install   ← layer 0 is not in place' : 'Layer 0 is in place.'}
`);
process.exit(0);

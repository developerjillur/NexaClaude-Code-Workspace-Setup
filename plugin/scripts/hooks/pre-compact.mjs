#!/usr/bin/env node
// PreCompact hook — write down what compaction is about to blur.
//
// CLAUDE.md has carried a five-item list of what must survive compaction since the workspace
// was written, and nothing ever wrote any of it down. The list was advice to a model that is
// mid-compaction and therefore in no position to follow advice. Compaction keeps roughly
// 20–30% of the detail; asking the summariser nicely is not a mechanism.
//
// Borrowed from worldflowai/everything-claude-code, which had a PreCompact hook where this
// workspace had only prose. Their version logs that compaction happened. This one records
// the specific things §7 says are irrecoverable — the card, the decisions, whether the suite
// was green — because "a compaction occurred" is not what anyone needs afterwards.
//
//   stdin  = JSON from Claude Code
//   exit 0 = always. A hook that can fail a compaction is worse than one that misses a note.

import fs from 'node:fs';
import path from 'node:path';
import { projectRoot, isAdoptedWorkspace } from './roots.mjs';
import { execSync } from 'node:child_process';

// Two roots — see roots.mjs. This one is the PROJECT: board, docs, config, git.
const { root: ROOT, trusted: TRUSTED } = projectRoot();
// A writer with an unlocatable project must write NOTHING. Observed rather than theorised:
// during the window when these scripts had moved but had not yet been rewired, this hook wrote
// a shadow prompt log into plugin/docs/prompts/ — the audit trail silently forking in two.
// An installed plugin whose project cannot be resolved would do the same into its own cache,
// collecting every project it is loaded in.
// Consent, not merely location. See isAdoptedWorkspace in roots.mjs: a repository the bootstrap
// declined still has a project root, and writing a prompt log into it is kill-condition 1
// through a side door. Caught by 5-verify as `?? docs/` in a repo we had refused to adopt.
if (!TRUSTED || !isAdoptedWorkspace(ROOT)) process.exit(0);

const OUT = path.join(ROOT, 'docs', 'compactions');

const git = (c) => {
  try { return execSync(`git ${c}`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return ''; }
};

try {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} `
    + `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const lines = [`\n## ${stamp}\n`];

  // 1 · The card. CLAUDE.md ranks this first: it IS the work, and its acceptance criteria are
  // the thing a summary paraphrases into uselessness.
  const build = path.join(ROOT, 'board', '3-build');
  const cards = fs.existsSync(build)
    ? fs.readdirSync(build).filter((f) => f.endsWith('.md') && !f.startsWith('._')) : [];
  if (cards.length) {
    for (const c of cards) {
      lines.push(`**Card in build:** \`board/3-build/${c}\``);
      // The criteria verbatim, not summarised — that is the entire point of writing them here.
      const body = fs.readFileSync(path.join(build, c), 'utf8');
      const crit = body.split('\n').filter((l) => /^\s*- \[[ x]\]/.test(l));
      if (crit.length) lines.push('', ...crit.map((l) => l.trim()), '');
    }
  } else {
    const spec = path.join(ROOT, 'board', '1-spec');
    const next = fs.existsSync(spec) ? fs.readdirSync(spec).filter((f) => f.endsWith('.md') && !f.startsWith('._')) : [];
    lines.push(`**Nothing in build.** Next in 1-spec: ${next.join(', ') || '(none)'}`);
  }

  // 2 · Files touched, so a forgotten edit does not become a duplicate edit.
  const dirty = git('status --short').split('\n').filter(Boolean);
  lines.push(`\n**Working tree (${dirty.length}):**`);
  lines.push(dirty.length ? dirty.map((l) => `- \`${l.trim()}\``).join('\n') : '- clean');

  // 3 · Where we are in history.
  const head = git('log --oneline -1');
  if (head) lines.push(`\n**HEAD:** ${head}`);

  // 5 · Decisions. Not re-derivable from code, and the item CLAUDE.md says to write BEFORE
  // compacting rather than after — so this is a prompt to check, not a substitute for doing it.
  const dec = path.join(ROOT, 'docs', 'DECISIONS.md');
  const latest = fs.existsSync(dec)
    ? (fs.readFileSync(dec, 'utf8').match(/^### (?!.*YYYY-MM-DD).+$/m) ?? [])[0] : null;
  if (latest) lines.push(`\n**Last decision recorded:** ${latest.replace(/^###\s*/, '')}`);
  lines.push('\n> Was a decision made since then? It belongs in `docs/DECISIONS.md` **now** —'
    + ' after compaction the reasoning behind it is gone, and a decision without its reasoning'
    + ' cannot be revisited.');

  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${now.getFullYear()}-${pad(now.getMonth() + 1)}.md`);
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file,
`# Compaction notes

Written by \`scripts/hooks/pre-compact.mjs\` immediately before each context compaction.

**Item 4 of CLAUDE.md's list — measurements, with their harness — is deliberately absent.**
It cannot be collected mechanically, and a file that silently omitted it would read as
complete. If you took a number this session, write it into the card yourself.
`);
  }
  fs.appendFileSync(file, lines.join('\n') + '\n');

  // The model is mid-compaction and this is the last thing it reliably sees.
  console.log(`[pre-compact] state written to docs/compactions/${path.basename(file)} — `
    + 'the card, the tree, and the last decision. Item 4 (measurements) is yours to write.');
} catch {
  // Silent and allowing: losing a note is recoverable, breaking compaction is not.
}

process.exit(0);

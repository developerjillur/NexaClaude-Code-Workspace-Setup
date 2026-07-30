#!/usr/bin/env node
// Stop hook — runs when the session ends, while the context is still loaded.
//
// This is the one Anthropic's large-codebase guidance recommends and the first version of
// this workspace missed: "Stop hooks can reflect on sessions and propose CLAUDE.md updates
// while context is fresh."
//
// It does not write anything itself. It asks the questions whose answers are lost the moment
// the window closes — and a lost answer is re-learned by the next session at full price.

import fs from 'node:fs';
import path from 'node:path';
import { projectRoot, isAdoptedWorkspace, paths } from './roots.mjs';
import { execSync } from 'node:child_process';

// Two roots — see roots.mjs. This one is the PROJECT: board, docs, config, git.
const { root: ROOT, trusted: TRUSTED } = projectRoot();
// Every plugin-written location comes from one module — see paths() in roots.mjs.
const P = paths(ROOT);
// A writer with an unlocatable project must write NOTHING. Observed rather than theorised:
// during the window when these scripts had moved but had not yet been rewired, this hook wrote
// a shadow prompt log into plugin/docs/prompts/ — the audit trail silently forking in two.
// An installed plugin whose project cannot be resolved would do the same into its own cache,
// collecting every project it is loaded in.
// Consent, not merely location. See isAdoptedWorkspace in roots.mjs: a repository the bootstrap
// declined still has a project root, and writing a prompt log into it is kill-condition 1
// through a side door. Caught by 5-verify as `?? docs/` in a repo we had refused to adopt.
if (!TRUSTED || !isAdoptedWorkspace(ROOT)) process.exit(0);

const cards = (s) => {
  const d = path.join(P.board, s);
  return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.md') && !f.startsWith('._')) : [];
};

const ask = [];

// 1. Work that moved no card is work nobody can find tomorrow.
let changed = 0;
try {
  changed = execSync('git status --porcelain', { cwd: ROOT, stdio: 'pipe' })
    .toString().split('\n').filter(Boolean).length;
} catch { /* not a repo yet */ }
if (changed > 0 && cards('3-build').length === 0) {
  ask.push(`**${changed} files changed and no card is in build.** Which card does this belong to? If none, it is invisible tomorrow.`);
}

// 2. Decisions evaporate with the window. This is the single highest-value question here.
ask.push('**Did you decide anything?** Architecture, a trade-off, a rejected option — if it is only in this conversation it does not exist. `docs/DECISIONS.md`, with its reversal cost.');

// 3. Anything re-learned this session is something the contract failed to say.
ask.push('**Did you have to work something out that `AGENTS.md` should have told you?** That is a defect in the contract, not in you. Propose the line.');

// 4. A claim made without measurement becomes the 78th disproven one.
ask.push('**Did you state a number you did not measure?** Mark it as an assumption in the card, or measure it now while the harness is still in your head.');

console.log(`## Before this context closes\n\n${ask.map((a) => `- ${a}`).join('\n')}

Answering these takes a minute. Re-deriving them next session costs an hour, and re-deriving
them *wrongly* costs a week — this project has 77 disproven claims that were plausible when
written.`);

#!/usr/bin/env node
// A cheap state check at the start of every prompt. Silent unless something is wrong.
//
// **Silence in the normal case is the whole design.** A banner on every prompt costs tokens on
// every prompt, and this workspace already loads ~6,200 before any work — measured. A check
// that speaks when there is nothing to say is one people learn to skim, and then it is worth
// less than nothing, because it is still being paid for.
//
// What it deliberately does NOT run:
//   check.mjs           1,175 ms and ~438 tokens of output. Measured. Far too expensive per
//                       prompt — it belongs before moving a card, which is where it already is.
//   the test suites     minutes.
//   scan-secrets        seconds, and it matters before a push, not before a sentence.
//
// What it does run totals ~200 ms and prints nothing when green:
//   reflection staleness   101 ms — it blocks commits, so knowing early beats knowing at commit
//   git status             70 ms  — uncommitted work piling up is invisible from inside a session
//   the board              ~1 ms  — WIP is the rule most easily broken by accident
//
// Exit 0 ALWAYS. On UserPromptSubmit a non-zero exit blocks the prompt, and nothing here is
// worth stopping someone mid-thought for.

import fs from 'node:fs';
import path from 'node:path';
import { projectRoot, isAdoptedWorkspace } from './roots.mjs';
import { execSync } from 'node:child_process';

// Two roots — see roots.mjs. This one is the PROJECT: board, docs, config, git.
const { root: ROOT } = projectRoot();
// Same consent rule as the other writers — it persists docs/.prompt-check-state.json.
if (!isAdoptedWorkspace(ROOT)) process.exit(0);
const notes = [];

const run = (cmd, cwd = ROOT) => {
  try { return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000 }).trim(); }
  catch { return null; }
};

try {
  // 1 · WIP. The rule most often broken by accident, and cheapest to check.
  const buildDir = path.join(ROOT, 'board', '3-build');
  const inBuild = fs.existsSync(buildDir)
    ? fs.readdirSync(buildDir).filter((f) => f.endsWith('.md') && !f.startsWith('._')) : [];
  if (inBuild.length > 1) {
    notes.push(`**WIP is ${inBuild.length}, the limit is 1** — ${inBuild.join(', ')}. Two cards in build is how both end up half-finished.`);
  }

  // 2 · Reflection staleness. This already refuses commits; finding out now is strictly better
  // than finding out after eight commits of work, which is what happened twice on 2026-07-28.
  try {
    execSync('node scripts/reflect.mjs --check', { cwd: ROOT, stdio: 'pipe', timeout: 4000 });
  } catch (e) {
    const why = String(e.stderr ?? '').trim().split('\n')[0];
    notes.push(`**The reflection is stale** — ${why || 'run node scripts/reflect.mjs'}. It will refuse the next commit.`);
  }

  // 3 · Uncommitted work — but only when it GROWS.
  //
  // The first version reported the absolute count and fired on every prompt, because the
  // product repo has carried 45 uncommitted files since 26 July. That message was true,
  // correct, and would have been ignored by the second day. **A true statement that never
  // changes is still noise**, and noise is what gets a check switched off.
  //
  // So the last reported count is remembered, and only meaningful growth speaks. A standing 45
  // is silent; 45 → 70 is not.
  const stateFile = path.join(ROOT, 'docs', '.prompt-check-state.json');
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { /* first run */ }
  const now = {};

  for (const [label, dir] of [['workspace', ROOT], ['code/', path.join(ROOT, 'code')]]) {
    const s = run('git status --porcelain', dir);
    if (s === null) continue;
    const n = s.split('\n').filter(Boolean).length;
    now[label] = n;
    const was = prev[label];
    if (n >= 25 && (was === undefined || n >= was + 15)) {
      notes.push(`**${n} uncommitted files in ${label}**${was !== undefined ? ` (was ${was})` : ''} — a diff this size stops being reviewable.`);
    }
  }
  try { fs.writeFileSync(stateFile, JSON.stringify(now)); } catch { /* not worth failing over */ }
} catch { /* a state check must never be the reason a prompt fails */ }

// Silent when there is nothing to say. That is most of the time, and it is the point.
if (notes.length) {
  console.log('<workspace-state>');
  for (const n of notes) console.log(`- ${n}`);
  console.log('</workspace-state>');
}

process.exit(0);

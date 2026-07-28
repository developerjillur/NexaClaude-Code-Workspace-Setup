#!/usr/bin/env node
// Gather everything that has happened since the last reflection.
//
// This is the mechanical half of `skills/reflect`. It does not think — it collects, so that
// the thinking half is not also guessing what changed. The split is the same one the rest of
// this workspace uses: check.mjs catches the mechanical skips, the skills carry the judgement.
//
// Why it exists at all: the workspace RECORDS well (decisions, cards, prompts, commits) and
// never READS BACK. That gap was named by Hindsight (vectorize-io/hindsight), whose Reflect
// step turns raw memories into learned models. Its diagnosis was right; its implementation —
// Postgres, an LLM provider and embeddings — was wrong for a workspace whose entire memory
// is files in git, reviewable in a diff. This is the file-native version of the same idea.
//
//   node scripts/reflect.mjs            what has happened since the last reflection
//   node scripts/reflect.mjs --check    exit 1 if the reflection is stale (used by check.mjs)

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LEARNED = path.join(ROOT, 'docs', 'LEARNED.md');
const CHECK_ONLY = process.argv.includes('--check');

// How much accumulated change is too much to leave unreflected. Not a measured number — a
// deliberately low starting point, because the failure it guards is silent and the cost of
// reflecting early is one short session. Raise it once there is evidence.
const STALE_AFTER_COMMITS = 8;

const git = (cmd, fallback = '') => {
  try {
    return execSync(`git ${cmd}`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch { return fallback; }
};

const learned = fs.existsSync(LEARNED) ? fs.readFileSync(LEARNED, 'utf8') : '';
const marker = learned.match(/<!--\s*reflected-at:\s*([0-9a-f]{7,40})/i);
// A fresh clone ships `INITIAL`: nothing has been reflected on yet, which is a true and
// uninteresting state rather than a broken one. Treat it as "no history to compare".
const uninitialised = /<!--\s*reflected-at:\s*INITIAL\s*-->/i.test(learned);
const since = marker?.[1] ?? '';
const head = git('rev-parse --short HEAD', '');

// Commits since the last reflection — the spine of what to reflect on.
//
// A marker that does not resolve is the dangerous case: `git log <bad-sha>..HEAD` fails, the
// helper returns its fallback, the list comes back empty and the reflection reads as CURRENT.
// Failing open silently is the exact shape LEARNED.md's first pattern is about, so it is
// checked separately rather than folded into the count.
const resolves = uninitialised ? true : (since ? git(`cat-file -e ${since}^{commit} && echo ok`, '') === 'ok' : true);
const range = since && resolves ? `${since}..HEAD` : '';
const commits = resolves ? git(`log --oneline ${range}`, '').split('\n').filter(Boolean) : [];

if (CHECK_ONLY) {
  if (!fs.existsSync(LEARNED)) {
    console.error('docs/LEARNED.md does not exist — nothing has been reflected on yet');
    process.exit(1);
  }
  // A fresh clone is the most ordinary state there is, and this checker's whole design is that
  // silence in the ordinary case IS the feature. Nagging a workspace nobody has committed to
  // yet trains people to ignore the one line it prints, which is the only asset it has. The
  // README explains `--init`; this is not the place to teach it.
  if (uninitialised) process.exit(0);
  if (!since) {
    console.error('docs/LEARNED.md has no `reflected-at` marker — run `node scripts/reflect.mjs --init` once after your first commit');
    process.exit(1);
  }
  if (!resolves) {
    console.error(`docs/LEARNED.md points at ${since}, which is not a commit in this repo — staleness cannot be judged`);
    process.exit(1);
  }
  if (commits.length >= STALE_AFTER_COMMITS) {
    console.error(`${commits.length} commits since the last reflection (${since}) — threshold is ${STALE_AFTER_COMMITS}`);
    process.exit(1);
  }
  process.exit(0);
}

// ── The report ───────────────────────────────────────────────────────────────

const out = [];
out.push('═'.repeat(72));
out.push('  MATERIAL FOR REFLECTION');
out.push('═'.repeat(72));
out.push(since ? `\nLast reflected at ${since}. HEAD is ${head}.` : '\nNo previous reflection — this is the first.');

out.push(`\n── Commits since (${commits.length}) ${'─'.repeat(40)}`);
out.push(commits.length ? commits.map((c) => `  ${c}`).join('\n') : '  (none)');

// Decisions are the highest-signal input: each one already carries its own reasoning, so a
// pattern across several of them is the thing a single decision cannot state.
const decFile = path.join(ROOT, 'docs', 'DECISIONS.md');
const decisions = fs.existsSync(decFile)
  // The file documents its own format in a fenced block whose heading looks exactly like a
  // real entry. Counting it made "5 decisions" out of 4 — a small wrong number, and this
  // project has a rule about those.
  ? (fs.readFileSync(decFile, 'utf8').match(/^### .+$/gm) ?? [])
    .filter((d) => !/YYYY-MM-DD|<the decision/.test(d)) : [];
out.push(`\n── Decisions on record (${decisions.length}) ${'─'.repeat(37)}`);
out.push(decisions.length ? decisions.map((d) => `  ${d.replace(/^###\s*/, '')}`).join('\n') : '  (none)');

// Where the work actually is, which is often not where anyone remembers it being.
out.push(`\n── The board ${'─'.repeat(58)}`);
for (const stage of ['0-backlog', '1-spec', '2-plan', '3-build', '4-review', '5-verify', '6-done']) {
  const dir = path.join(ROOT, 'board', stage);
  const cards = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('._')) : [];
  if (cards.length) out.push(`  ${stage.padEnd(11)} ${cards.join(', ')}`);
}

// Prompts are what was actually ASKED, which is the one record that shows intent drifting.
const pDir = path.join(ROOT, 'docs', 'prompts');
const days = fs.existsSync(pDir) ? fs.readdirSync(pDir).filter((f) => /^\d{4}-\d\d-\d\d\.md$/.test(f)).sort() : [];
out.push(`\n── Prompt log (${days.length} day${days.length === 1 ? '' : 's'}) ${'─'.repeat(45)}`);
out.push(days.length
  ? `  ${days.join(', ')}\n  Read these — they are the only record of what was asked, in the words it was asked in.`
  : '  (none locally — gitignored, so absent on a fresh clone)');

out.push(`\n${'─'.repeat(72)}`);
out.push(`
Now read skills/reflect, then update docs/LEARNED.md.

What goes in it is the pattern ACROSS these, never a restatement of any one of them.
DECISIONS.md already holds each decision with its own reasoning; if a line you are about
to write would fit in a single decision entry, it belongs there, not in LEARNED.md.

Finish by setting the marker, or the next run cannot tell what is new:

    <!-- reflected-at: ${head} -->
`);

console.log(out.join('\n'));

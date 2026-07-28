#!/usr/bin/env node
// SessionStart hook. Prints the state a fresh session cannot infer and would otherwise
// invent — which card is live, whether the suite is green, what was decided last.
//
// This exists because forgetting is indistinguishable from starting, from the inside. An
// agent that has lost the thread does not feel lost; it feels like it is beginning.
// stdout is added to the session context.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const cards = (s) => {
  const d = path.join(ROOT, 'board', s);
  return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.md') && !f.startsWith('._')) : [];
};

const out = [];
out.push('## Workspace state (SessionStart hook — not written by the model)');

const build = cards('3-build');
if (build.length === 1) {
  out.push(`\n**In build: \`${build[0]}\`** — this is the work. Read the whole card before acting.`);
} else if (build.length === 0) {
  const next = ['2-plan', '1-spec', '0-backlog'].map((s) => [s, cards(s)]).find(([, c]) => c.length);
  out.push(next
    ? `\n**Nothing in build.** Next up in \`${next[0]}\`: ${next[1].slice(0, 3).join(', ')}`
    : '\n**The board is empty.** Start with `cp templates/CARD.md board/0-backlog/001-slug.md`');
} else {
  out.push(`\n**⚠ WIP broken — ${build.length} cards in build:** ${build.join(', ')}. Fix this first.`);
}

const waiting = [['4-review', 'awaiting review'], ['5-verify', 'awaiting verification']]
  .map(([s, l]) => [cards(s), l]).filter(([c]) => c.length);
for (const [c, l] of waiting) out.push(`- ${c.length} ${l}: ${c.join(', ')}`);

// The last decision, so a session does not re-open a settled question.
try {
  const dec = fs.readFileSync(path.join(ROOT, 'docs', 'DECISIONS.md'), 'utf8');
  // Skip the format example at the top of the file — telling a fresh session that the last
  // decision was '<the decision, as a sentence>' is worse than telling it nothing.
  const last = [...dec.matchAll(/^### (.+)$/gm)]
    .map((m) => m[1]).find((t) => !/YYYY-MM-DD|<.*>/.test(t));
  if (last) out.push(`\n**Last decision:** ${last}\n(\`docs/DECISIONS.md\` — read it before proposing architecture.)`);
} catch { /* no decisions yet */ }

// Green or red matters more than anything else on this list.
try {
  execSync('npm run test:offline', { cwd: path.join(ROOT, 'code'), stdio: 'pipe', timeout: 240000 });
  out.push('\n**Tests: green.**');
} catch (e) {
  out.push(e.status === undefined
    ? '\n**Tests: not run** (no `code/` link yet — see SETUP.md).'
    : '\n**⚠ Tests are RED. That is the work — do not build on it.**');
}

out.push('\nRules that are enforced, not suggested: WIP=1, no product edit without a card in build,');
out.push('the reuse ladder recorded before writing. See `AGENTS.md`.');
console.log(out.join('\n'));

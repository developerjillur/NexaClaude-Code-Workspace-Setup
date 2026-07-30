#!/usr/bin/env node
// SessionStart hook. Prints the state a fresh session cannot infer and would otherwise
// invent — which card is live, whether the suite is green, what was decided last.
//
// This exists because forgetting is indistinguishable from starting, from the inside. An
// agent that has lost the thread does not feel lost; it feels like it is beginning.
// stdout is added to the session context.

import fs from 'node:fs';
import path from 'node:path';
import { projectRoot, PLUGIN_ROOT, paths } from './roots.mjs';
import { bootstrap } from '../bootstrap.mjs';
import { execFileSync } from 'node:child_process';

// Two roots — see roots.mjs. This one is the PROJECT: board, docs, config, git.
const { root: ROOT, trusted: TRUSTED } = projectRoot();
// Every plugin-written location comes from one module — see paths() in roots.mjs.
const P = paths(ROOT);

// ── zero-command adoption ────────────────────────────────────────────────────
//
// Opening Claude Code in a clean repository root is the whole of adoption. Every rung of the
// refusal ladder lives in bootstrap.mjs and almost all of them refuse — this call is a no-op
// in any repository that is already set up, is not a repository root, is a worktree, is
// somebody else's, or has been removed here before.
//
// **Announced, always.** Writing into a working tree unasked is defensible only if the user is
// told exactly what appeared and how to undo it. Silence here would be the same failure as a
// guard that passes quietly.
// **Never let a bootstrap failure silence the banner.** When it threw — an unwritable backup
// directory was the reproduced case — this hook died before printing anything, so a user
// whose tree had just been half-scaffolded was told nothing at all. The state report is the
// one thing that has to survive, because it is how they find out what appeared.
let boot = { act: false, level: 'silent' };
if (TRUSTED) {
  try {
    boot = bootstrap(ROOT, path.join(PLUGIN_ROOT, 'templates'));
  } catch (e) {
    boot = { act: false, level: 'announce', created: [], failed: String(e?.message ?? e) };
  }
}
const cards = (s) => {
  const d = path.join(P.board, s);
  return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.md') && !f.startsWith('._')) : [];
};

const out = [];
out.push('## Workspace state (SessionStart hook — not written by the model)');

if (boot.created?.length) {
  out.push(`\n**This repository was just set up as a workspace — ${boot.created.length} files were created.**`);
  // **Two shapes and two places, both of which this got wrong.**
  //
  // `created` holds `{file, wroteHash}` records, not strings — passing one straight to
  // `path.relative` threw ERR_INVALID_ARG_TYPE and killed the hook *after* it had already
  // scaffolded the repository. So a first-ever session showed a stack trace instead of the
  // welcome, having silently succeeded. No unit test reached it: the suites exercise
  // `session-start` with garbage input and `bootstrap` without the banner, and the one path a
  // real user always takes ran in neither.
  //
  // And since card 003 the files land in two trees, so a single `path.relative(ROOT, …)` would
  // render the ~/.nexa half as `../../../../.nexa/…`. Repo files show repo-relative; the rest
  // show under `~`, which is where the user will actually go looking.
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const shown = (p) => (p.startsWith(`${ROOT}${path.sep}`)
    ? path.relative(ROOT, p)
    : (home && p.startsWith(home) ? `~${p.slice(home.length)}` : p));
  out.push(boot.created.map((c) => `- \`${shown(typeof c === 'string' ? c : c.file)}\``).join('\n'));
  out.push(`Settings went to \`${boot.settings?.where}\`.` +
    (boot.settings?.conflicts?.length ? ` Yours were kept where they differed: ${boot.settings.conflicts.join('; ')}.` : ''));
  // Worded precisely, because the previous wording was false: a settings.local.json that
  // already existed IS modified by the merge. Saying otherwise is the "nothing invented"
  // defect committed in a banner, where the user is most likely to believe it.
  out.push(/merged/.test(boot.settings?.where ?? '')
    ? 'Everything above was created. One file that already existed, `.claude/settings.local.json`,'
      + ' was merged into — a copy was saved first. `/nexa-workspace:remove` deletes what was'
      + ' created and restores that file to the bytes it had.'
    : 'Nothing that already existed was modified. To undo all of it, run `/nexa-workspace:remove`.');
  // model is read once at session start — documented, and the one thing hot-reload cannot fix.
  out.push('**One caveat:** `model` is read at startup, so this session is still on your default' +
    ' model. Permission rules and hooks are live now; the model applies from your next session.');
} else if (boot.failed) {
  out.push(`\n**⚠ Setting this repository up FAILED part-way: ${boot.failed}**`);
  out.push('Some files may already have been created. `/nexa-workspace:remove --dry-run'
    + '` lists exactly which, and `/nexa-workspace:remove` undoes them.');
} else if (boot.level === 'announce' && boot.act === false) {
  out.push(`\n**Not set up here:** ${boot.reason}`);
}

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
  const dec = fs.readFileSync(path.join(P.docs, 'DECISIONS.md'), 'utf8');
  // Skip the format example at the top of the file — telling a fresh session that the last
  // decision was '<the decision, as a sentence>' is worse than telling it nothing.
  const last = [...dec.matchAll(/^### (.+)$/gm)]
    .map((m) => m[1]).find((t) => !/YYYY-MM-DD|<.*>/.test(t));
  if (last) out.push(`\n**Last decision:** ${last}\n(\`docs/DECISIONS.md\` — read it before proposing architecture.)`);
} catch { /* no decisions yet */ }

// Green or red matters more than anything else on this list — but *absent* is a third state,
// and reporting it as red is how a session is told the wrong emergency. This banner claimed
// "Tests are RED" on 2026-07-30 when the truth was that the council had never been fetched:
// half the suite did not exist. One command fixed it. `e.status === undefined` was meant to
// catch that and does not, because a missing cwd and a failing suite both arrive as exceptions.
// So the question is asked directly instead of inferred from the shape of an error.
const codeDir = path.join(ROOT, 'code');
if (!fs.existsSync(codeDir)) {
  out.push('\n**Tests: not run** — there is no `code/` yet, so there is nothing to run. See SETUP.md.');
} else {
  try {
    execFileSync('npm', ['run', 'test:offline'], { cwd: codeDir, stdio: 'pipe', timeout: 240000 });
    out.push('\n**Tests: green.**');
  } catch {
    out.push('\n**⚠ Tests are RED. That is the work — do not build on it.**');
  }
}

out.push('\nRules that are enforced, not suggested: WIP=1, no product edit without a card in build,');
out.push('the reuse ladder recorded before writing. See `AGENTS.md`.');
console.log(out.join('\n'));

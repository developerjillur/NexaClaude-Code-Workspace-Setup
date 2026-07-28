#!/usr/bin/env node
// The gates, as something that runs.
//
// Everything in AGENTS.md and board/README.md was prose until this file existed, and prose
// is not a gate — it is a reminder that a tired person skips at 1am. This checks the rules
// that can be checked mechanically, and says nothing about the ones that cannot.
//
//   node scripts/check.mjs          before moving any card
//   node scripts/check.mjs --strict exit non-zero on warnings too (use in CI)

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const STRICT = process.argv.includes('--strict');

let fail = 0, warn = 0;
const ok = (m) => console.log(`  ✅ ${m}`);
const bad = (m, why) => { fail++; console.log(`  ❌ ${m}\n       ${why}`); };
const soft = (m, why) => { warn++; console.log(`  ⚠️  ${m}\n       ${why}`); };

const stages = ['0-discovery', '0-backlog', '1-spec', '2-plan', '3-build', '4-review', '5-verify', '6-done', '7-operate'];
const cardsIn = (s) => {
  const d = path.join(ROOT, 'board', s);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => f.endsWith('.md') && f !== 'README.md' && !f.startsWith('._'));
};
const read = (s, f) => fs.readFileSync(path.join(ROOT, 'board', s, f), 'utf8');

console.log('\n── The board ──────────────────────────────────────────────');

// 1. WIP = 1. The rule that stops "running ahead of the plan", and the one most likely
//    to be broken by an agent that finished something and felt productive.
const building = cardsIn('3-build');
if (building.length > 1) {
  bad(`WIP limit broken — ${building.length} cards in 3-build`,
    `${building.join(', ')}. One at a time: two in build is how work gets abandoned half-done.`);
} else ok(`WIP = ${building.length}/1 in 3-build`);

// 2. A card cannot skip a stage. Numbers are unique, so the same number in two stages
//    means someone copied instead of moving.
const seen = new Map();
for (const s of stages) {
  for (const f of cardsIn(s)) {
    const n = f.match(/^(\d+)/)?.[1];
    if (!n) { soft(`${s}/${f} has no number`, 'cards are NNN-slug.md so they sort and are referable'); continue; }
    if (seen.has(n)) bad(`card ${n} is in two stages`, `${seen.get(n)} and ${s} — use git mv, not copy`);
    else seen.set(n, s);
  }
}
if (!fail) ok(`${seen.size} cards, each in exactly one stage`);

console.log('\n── Cards past their gate ──────────────────────────────────');

// 3. Each stage demands its sections be filled. A card sitting in 4-review with an empty
//    review table is the failure this catches: it looks reviewed and is not.
const demands = {
  '2-plan':   [[/## 1 · Spec/, 'spec section'], [/- \[[ x]\] \S/, 'at least one acceptance criterion']],
  '3-build':  [[/\|\s*[^|\s][^|]*\|\s*[^|\s]/, 'a named file in the plan table'],
               [/graphify explain/, 'the reuse ladder — graphify explain is not recorded']],
  '4-review': [[/## 3 · Build/, 'build section']],
  '5-verify': [[/Verdict:\s*(PASS|BACK)/i, 'a review verdict'],
               [/\|\s*Matches the spec\s*\|\s*[1-5]/, 'a score on "Matches the spec"']],
  '6-done':   [[/- \[x\]/i, 'a ticked verification checklist'],
               [/```[\s\S]*?```/, 'the pasted output of a guard watched failing']],
};
let checked = 0;
for (const [stage, rules] of Object.entries(demands)) {
  for (const f of cardsIn(stage)) {
    const body = read(stage, f);
    checked++;
    for (const [re, what] of rules) {
      if (!re.test(body)) bad(`${stage}/${f} is missing ${what}`,
        'it passed a gate it should not have — move it back');
    }

    // A ticked criterion with no evidence is a claim by whoever wants the card to move.
    // This is the check for the failure that everything else here misses: work that LOOKS
    // finished. `- [x]` must carry a command, a file:line, or a §-reference to the pasted
    // output — anything a reviewer can go and disbelieve. "verified" is what a shell says too.
    // depth-check on the product tree, run HERE rather than left as a checklist line.
    //
    // The readiness re-assessment found six of the strongest controls ran only when someone
    // remembered them. This is the cheapest two to fix: both already work, and a card cannot
    // pass 4-review or later without them having actually run.
    if (['4-review', '5-verify', '6-done'].includes(stage) && fs.existsSync(path.join(ROOT, 'code'))) {
      try {
        execSync('node scripts/depth-check.mjs code/src code/tools code/server.js',
          { cwd: ROOT, stdio: 'pipe' });
        ok(`${stage}/${f} — depth-check clean`);
      } catch (e) {
        const lines = String(e.stdout ?? '').split('\n').filter((l) => /^\s{4}\S.*:\d+/.test(l));
        bad(`${stage}/${f} — depth-check found ${lines.length} finding(s)`,
          `${lines.slice(0, 3).map((l) => l.trim()).join('; ')} — fix, or answer each in the card`);
      }
    }

    // Follow the citations, rather than trusting that someone did. A card only reaches these
    // stages once, and "run verify-claims" as a checklist line is a thing people tick.
    if (stage === '5-verify' || stage === '6-done') {
      try {
        execSync(`node scripts/verify-claims.mjs ${JSON.stringify(path.join('board', stage, f))}`,
          { cwd: ROOT, stdio: 'pipe' });
        ok(`${stage}/${f} — every cited claim resolves`);
      } catch (e) {
        const detail = String(e.stdout ?? '').split('\n')
          .filter((l) => l.includes('❌')).map((l) => l.replace(/\s*❌\s*/, '')).slice(0, 4).join('; ');
        bad(`${stage}/${f} cites claims that do not resolve`,
          `${detail || 'run node scripts/verify-claims.mjs for detail'}`);
      }
    }

    if (stage === '5-verify' || stage === '6-done') {
      const bare = body.split('\n')
        .filter((l) => /^\s*- \[x\]/i.test(l))
        .filter((l) => !/`[^`]+`|\.(mjs|js|md):\d+|§\d|\bwatched failing\b/i.test(l));
      if (bare.length) {
        bad(`${stage}/${f} has ${bare.length} ticked criteri${bare.length === 1 ? 'on' : 'a'} with no evidence`,
          `${bare.map((l) => l.trim().slice(6, 60)).join(' | ')} — cite a command, a file:line, or the pasted failure`);
      }
    }
  }
}
if (checked === 0) console.log('  ·  no cards past 1-spec yet');
else if (!fail) ok(`${checked} cards have what their stage requires`);

console.log('\n── The workspace itself ───────────────────────────────────');

// 4. The skills path bug that shipped in the first version of this workspace: skills
//    written to .agents/skills are invisible to Claude Code, which reads .claude/skills.
const skillsLink = path.join(ROOT, '.claude', 'skills');
if (!fs.existsSync(skillsLink)) {
  bad('.claude/skills is missing', 'Claude Code will not load any skill. ln -sfn ../.agents/skills .claude/skills');
} else ok('.claude/skills resolves — skills are loadable by Claude Code and by the Agent-Skills spec');

// 5. Every skill needs frontmatter with a description, or it never gets selected.
// `._name` are macOS AppleDouble files — this drive is exFAT, so they reappear on every
// write. They are not skills and must not be counted as broken ones.
const skillDir = path.join(ROOT, '.agents', 'skills');
const realDirs = (d) => (fs.existsSync(d) ? fs.readdirSync(d) : [])
  .filter((n) => !n.startsWith('._') && n !== '.DS_Store');
for (const s of realDirs(skillDir)) {
  const p = path.join(skillDir, s, 'SKILL.md');
  if (!fs.existsSync(p)) { bad(`skill ${s} has no SKILL.md`, 'the directory alone does nothing'); continue; }
  const head = fs.readFileSync(p, 'utf8').slice(0, 600);
  if (!/^---[\s\S]*?\bname:/.test(head)) bad(`skill ${s} has no name in frontmatter`, 'it cannot be invoked');
  if (!/^---[\s\S]*?\bdescription:/.test(head)) bad(`skill ${s} has no description`,
    'the description is how the model decides to use it — without one it is dead weight');
}
if (!fail) ok('every skill has name + description frontmatter');

// 6. AGENTS.md and CLAUDE.md must not drift. One is the contract; the other imports it.
const claude = fs.existsSync(path.join(ROOT, 'CLAUDE.md'))
  ? fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8') : '';
//
// This check measured word count until 2026-07-28, and word count was the wrong quantity.
// It fired on a CLAUDE.md whose every section was correctly Claude-specific (auto-compaction
// behaviour, subagents, plan mode — none of which mean anything to Codex), and under
// --strict that false positive failed CI. A check that is wrong is not a strict check; it is
// a check people delete. What the rule actually cares about is DUPLICATION: the same rule
// stated in both files, which is how the two drift into disagreeing.
if (!/@AGENTS\.md/.test(claude)) {
  bad('CLAUDE.md does not import AGENTS.md', 'Claude Code does not read AGENTS.md natively — add @AGENTS.md');
} else {
  const agents = fs.existsSync(path.join(ROOT, 'AGENTS.md'))
    ? fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8') : '';
  // Compare headings, since a duplicated rule almost always arrives under its own heading.
  const headings = (md) => new Set(
    (md.match(/^#{2,3} .+$/gm) ?? []).map((h) => h.replace(/^#+\s*/, '').replace(/[^a-z0-9 ]/gi, '').toLowerCase().trim()),
  );
  const shared = [...headings(claude)].filter((h) => h && headings(agents).has(h));
  if (shared.length) {
    soft(`CLAUDE.md repeats ${shared.length} heading(s) from AGENTS.md`,
      `${shared.join(', ')} — one source of truth; delete the copy here`);
  } else if (claude.split(/\s+/).length > 1200) {
    // A backstop, not the rule. Deliberately far above "thin" so it only catches a file
    // that has genuinely become a second contract.
    soft('CLAUDE.md has grown past 1200 words', 'check whether project rules have leaked in from AGENTS.md');
  } else ok('CLAUDE.md imports AGENTS.md and duplicates none of it');
}

// 6b. The contract carries a `contract-meta` header saying when it was last verified against
// the code. Context-engineering practice calls for freshness metadata on context files; the
// version that matters is one a checker can act on, so this compares the recorded commit
// against HEAD rather than trusting a hand-written date.
const agentsMd = fs.existsSync(path.join(ROOT, 'AGENTS.md'))
  ? fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8') : '';
const verifiedAt = agentsMd.match(/verified-at:\s*([0-9a-f]{7,40})/)?.[1];
if (!verifiedAt) {
  soft(/verified-at:\s*INITIAL/.test(agentsMd)
    ? 'AGENTS.md verified-at is still INITIAL — set it to a real commit once you have read the contract'
    : 'AGENTS.md has no `verified-at` in its contract-meta header',
    'nothing can tell whether the contract still describes the code');
} else {
  let behind = 0;
  try {
    behind = execSync(`git log --oneline ${verifiedAt}..HEAD`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim().split('\n').filter(Boolean).length;
  } catch {
    bad(`AGENTS.md verified-at ${verifiedAt} is not a commit here`, 'the freshness marker cannot be judged');
    behind = -1;
  }
  // 25 is a starting point, not a measurement — deliberately loose, because the contract
  // legitimately outlives most commits. Tighten it if it starts arriving stale.
  if (behind >= 25) soft(`AGENTS.md last verified ${behind} commits ago`, 'reread it against the code, then bump verified-at');
  else if (behind >= 0) ok(`AGENTS.md verified ${behind} commit${behind === 1 ? '' : 's'} ago`);
}

// 6c. The contract states its own token cost. Verify it against reality rather than trusting it.
//
// That number has now gone stale twice: written as ~2,000 when it was 4,230, corrected to
// 4,700, and stale again at 5,968 within a day. **A number in prose drifts every time the file
// changes**, and this one is load-bearing — every card's context budget is calculated from it.
//
// So the header is CHECKED here instead of trusted. The same argument as every other check in
// this file: a claim nobody verifies is a claim that will be wrong eventually.
{
  const stated = agentsMd.match(/cost:\s*~?([\d,]+)\s*tokens/)?.[1]?.replace(/,/g, '');

  // `bytes / 4` is a HEURISTIC, not a measurement — and the council caught this file claiming
  // otherwise, which was fair and is the sharpest thing anyone has said about this workspace:
  // the one script whose job is enforcing measure-dont-claim was itself asserting an unverified
  // constant. The comment above used to say "computed, not believed", which overstated it.
  //
  // It is kept because it is the right TOOL for the job — the question here is "has the header
  // drifted from the file", and any monotonic proxy for size answers that. It is not kept as a
  // token count, and the 10% band exists precisely because the proxy is loose. A real count
  // needs a tokeniser, which would be a dependency for a number that is only ever compared
  // against itself.
  const APPROX_BYTES_PER_TOKEN = 4;
  const actual = Math.round(Buffer.byteLength(agentsMd, 'utf8') / APPROX_BYTES_PER_TOKEN);
  if (!stated) {
    soft('AGENTS.md does not state its own token cost', 'add `cost:` to the contract-meta header');
  } else {
    const drift = Math.abs(actual - Number(stated)) / Number(stated);
    if (drift > 0.10) {
      bad(`AGENTS.md says it costs ~${Number(stated).toLocaleString()} tokens; it is ~${actual.toLocaleString()}`,
        `${Math.round(drift * 100)}% out — every card's context budget is computed from this. Update the header and skills/context-budget`);
    } else ok(`AGENTS.md's stated cost matches the file (~${actual.toLocaleString()} tokens, bytes/4)`);
  }

  // And it must not grow without anyone noticing. Not a hard failure — a contract legitimately
  // grows — but growth past the point where it crowds out the work should be visible.
  if (actual > 7000) {
    soft(`AGENTS.md is ~${actual.toLocaleString()} tokens`,
      'detail true of one directory belongs in that directory\'s CLAUDE.md, not here');
  }
}

// 7. Decisions must exist as a file, because a decision that only exists in chat does not.
const dec = path.join(ROOT, 'docs', 'DECISIONS.md');
if (!fs.existsSync(dec)) bad('docs/DECISIONS.md is missing', 'decisions made in chat are lost by definition');
else ok('docs/DECISIONS.md exists');

// 8. The gates are declared in TWO settings.json files — this workspace's, and the product
// repo's — because Claude Code loads only the one for the directory a session starts in.
// Two declarations is the fix for a hole; it is also a new drift risk, and an agent that
// believes a hook is on when one side has lost it is worse off than one that knows it is off.
console.log('\n── The controls, on both sides ────────────────────────────');
const HOOK_EVENTS = ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'SessionStart', 'Stop', 'PreCompact'];
const sides = [
  ['workspace', path.join(ROOT, '.claude', 'settings.json')],
  ['product repo', path.join(ROOT, 'code', '.claude', 'settings.json')],
];
const declared = {};
for (const [label, p] of sides) {
  if (!fs.existsSync(p)) {
    // The product side is a symlink away; if the link is absent that is a setup state, not a
    // defect in this repo. Say which, rather than reporting a generic miss.
    if (label === 'product repo' && !fs.existsSync(path.join(ROOT, 'code'))) {
      soft('product repo settings not checked', 'no code/ link here — see SETUP.md');
    } else {
      bad(`${label} has no .claude/settings.json`, 'the hooks are not declared on that side, so they do not run there');
    }
    continue;
  }
  try {
    const json = JSON.parse(fs.readFileSync(p, 'utf8'));
    declared[label] = HOOK_EVENTS.filter((e) => json.hooks?.[e]?.length);
  } catch (e) {
    bad(`${label} settings.json does not parse`, e.message);
  }
}
// 8a. The tier. `skills/pick-the-model` rule 0: every Claude-side task runs top-tier, and a
// downgrade is exactly the kind of change that is invisible in review — the output still looks
// like work. `explorer` sat on `sonnet` for a day without anyone noticing, and it is the agent
// whose findings everything downstream trusts.
{
  const agentsDir = path.join(ROOT, '.claude', 'agents');
  const files = fs.existsSync(agentsDir)
    ? fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md') && !f.startsWith('._')) : [];
  const downgraded = files.filter((f) => {
    const m = fs.readFileSync(path.join(agentsDir, f), 'utf8').match(/^model:\s*(\S+)/m);
    return m && m[1] !== 'opus';
  });
  if (downgraded.length) {
    bad(`${downgraded.length} subagent(s) are not on the top tier`,
      `${downgraded.join(', ')} — pick-the-model rule 0: there is no task here small enough for a cheaper model`);
  } else if (files.length) ok(`all ${files.length} subagents are on opus`);

  for (const [label, p] of [['workspace', path.join(ROOT, '.claude', 'settings.json')],
                            ['product repo', path.join(ROOT, 'code', '.claude', 'settings.json')]]) {
    if (!fs.existsSync(p)) continue;
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (j.model !== 'opus') bad(`${label} settings.json does not pin model: opus`, 'the tier is a rule, not a session preference');
  }

  // Plugins ship their own subagents with their own `model:` frontmatter, and five of ours
  // arrived pinned to `sonnet` — including `codex-rescue`, which is the §10 cross-vendor
  // review path, and `code-reviewer`. The review that caught card 001 naming the wrong
  // enforcement file ran on a downgraded agent.
  //
  // They live in the plugin CACHE, so a plugin update silently restores the vendor's choice.
  // This is a warning rather than a failure for that reason: it is not a defect in this repo,
  // it is drift from outside it — but it must be visible, because the alternative is trusting
  // a review that quietly got cheaper.
  const cache = path.join(process.env.HOME ?? '', '.claude', 'plugins', 'cache');
  const walk = (d, out = []) => {
    if (!fs.existsSync(d)) return out;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (e.name.endsWith('.md') && p.includes(`${path.sep}agents${path.sep}`)) out.push(p);
    }
    return out;
  };
  const cheap = walk(cache).filter((f) => {
    const m = fs.readFileSync(f, 'utf8').match(/^model:\s*(\S+)/m);
    return m && m[1] !== 'opus';
  });
  if (cheap.length) {
    soft(`${cheap.length} plugin subagent(s) reverted to a cheaper model`,
      `${cheap.map((f) => path.basename(f, '.md')).join(', ')} — a plugin update restored the vendor's tier. `
      + 'Re-pin them, or pass model: "opus" when spawning one.');
  } else if (fs.existsSync(cache)) ok('plugin subagents are all on opus');

  // Codex's tier lives in TWO places and neither is in this repo:
  //   1. ~/.codex/config.toml — the fallback the CLI reads when nothing overrides it
  //   2. the plugin's own instruction, which said "leave --effort unset" and therefore
  //      silently inherited whatever (1) happened to be
  //
  // So Codex was running at xhigh only because this machine's global config says so. On any
  // other machine it would quietly drop to the CLI default, and nothing here would notice —
  // the review would still return an answer, just a cheaper one. Same failure shape as the
  // sonnet subagents. Warn rather than fail: it is outside the repo, but it must be visible.
  // The council is five CLIs from four vendors. Each is a separate thing that can vanish —
  // the `gemini` CLI already did, refusing this account outright ("no longer supported for
  // individuals"), which is why Gemini is reached through Antigravity instead. A council that
  // silently shrinks to three still returns a confident answer, so absence must be loud.
  const membersFile = path.join(ROOT, 'scripts', 'council', 'members.json');
  if (fs.existsSync(membersFile)) {
    const cfg = JSON.parse(fs.readFileSync(membersFile, 'utf8'));
    const dirs = [`${process.env.HOME}/.local/bin`, `${process.env.HOME}/.npm-global/bin`,
      '/usr/local/bin', '/opt/homebrew/bin', ...(process.env.PATH ?? '').split(':')];
    const missing = [...new Set(cfg.members.map((m) => m.cmd))]
      .filter((c) => !dirs.some((d) => d && fs.existsSync(path.join(d, c))));
    if (missing.length) {
      soft(`council: ${missing.join(', ')} not found`,
        `${cfg.members.length} members declared; a council that quietly shrinks still answers confidently`);
    } else ok(`council: all ${cfg.members.length} members reachable`);
  }

  const codexCfg = path.join(process.env.HOME ?? '', '.codex', 'config.toml');
  if (!fs.existsSync(codexCfg)) {
    soft('~/.codex/config.toml not found', 'Codex reasoning effort is whatever the CLI defaults to — see §10');
  } else {
    const effort = fs.readFileSync(codexCfg, 'utf8').match(/^\s*model_reasoning_effort\s*=\s*"([^"]+)"/m)?.[1];
    if (effort === 'xhigh') ok('Codex reasoning effort is xhigh');
    else soft(`Codex reasoning effort is ${effort ?? 'unset'}, not xhigh`,
      'set model_reasoning_effort = "xhigh" in ~/.codex/config.toml, or pass --effort xhigh on every call');
  }
}

// 8c. Plugins §5 and §10 name as load-bearing must actually be declared. Declaration is the
// only thing checkable from here — whether Claude Code has finished installing one is its
// business — but an undeclared plugin is a dependency nobody wrote down, which is the failure
// the ponytail comment above is about.
{
  const p = path.join(ROOT, '.claude', 'settings.json');
  const j = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
  const on = j.enabledPlugins ?? {};
  for (const [plugin, why] of [
    ['ponytail@ponytail', 'the laziness ladder §5 calls part of the contract; skills/reuse-first is derived from it'],
    ['codex@openai-codex', '§10 — how a plan gets reviewed by a model that does not share this one\'s priors'],
  ]) {
    if (on[plugin]) ok(`${plugin} is declared`);
    else bad(`${plugin} is not declared`, why);
  }
  // A plugin from outside the official marketplace needs its source declared too, or a fresh
  // machine silently has no such plugin rather than failing loudly.
  const mk = j.extraKnownMarketplaces ?? {};
  if (on['ponytail@ponytail'] && !mk.ponytail) {
    bad('ponytail is enabled but its marketplace is not declared',
      'add extraKnownMarketplaces.ponytail → github:DietrichGebert/ponytail, or a fresh clone has nothing to install');
  }
}

if (declared.workspace && declared['product repo']) {
  const missing = declared.workspace.filter((e) => !declared['product repo'].includes(e));
  const extra = declared['product repo'].filter((e) => !declared.workspace.includes(e));
  if (missing.length || extra.length) {
    bad('the two settings.json files have drifted',
      `${missing.length ? `product repo is missing ${missing.join(', ')}. ` : ''}${extra.length ? `product repo adds ${extra.join(', ')}.` : ''}`);
  } else ok(`both sides declare the same ${declared.workspace.length} hook events`);
}

// 8b. §5 calls three tools "part of the contract — not optional decoration", and the
// reuse-first skill is derived from one of them. None of that was ever checked, and ponytail
// turned out not to be installed at all: the contract named a load-bearing tool, SETUP.md
// step 4 told you to install it, and nothing noticed for a day. A dependency stated in prose
// is a dependency nobody verifies.
//
// ponytail is deliberately NOT in this list. It was, for one day, and the check was wrong in
// a way worth recording: **ponytail is a Claude Code plugin, not a CLI**, so `which ponytail`
// could never succeed and the warning would have run forever until someone deleted the check
// to silence it. Worse, SETUP.md said `npx ponytail install`, and the npm package actually
// named `ponytail` is an unrelated project ("Rethinking maintenance of multiple sites") — so
// following our own setup guide installed the wrong software. The real one is
// `@dietrichgebert/ponytail`, installed as a plugin. It is verified below with the plugins.
for (const [tool, why] of [
  ['graphify', 'query the graph instead of grepping — §5, and the reuse ladder rung 2'],
  ['vibesec', 'the security scan the deploy gate opens with — §11'],
]) {
  const found = ['/usr/local/bin', '/opt/homebrew/bin', `${process.env.HOME}/.local/bin`,
    `${process.env.HOME}/.npm-global/bin`, ...(process.env.PATH ?? '').split(':')]
    .some((d) => d && fs.existsSync(path.join(d, tool)));
  if (found) ok(`${tool} is installed`);
  else if (process.env.CI) {
    // A CI runner is not a workstation and never has these — warning there would fail
    // --strict on every run for an environmental reason, which is the third time that exact
    // shape has appeared in this file. It is a developer-setup check; CI is not the developer.
    console.log(`  ·  ${tool} not checked (CI)`);
  } else soft(`${tool} is not installed`, why);
}

// 9. Prompts are the design record and are saved as they are typed. Confirm the log is
// actually being written — a logger nobody has seen produce a line is a logger that is off.
const promptDir = path.join(ROOT, 'docs', 'prompts');
if (!fs.existsSync(path.join(ROOT, 'scripts', 'hooks', 'save-prompt.mjs'))) {
  bad('save-prompt.mjs is missing', 'prompts would exist only in Claude Code\'s own logs, outside this repo');
} else {
  // Deliberately NOT a warning when the directory is empty. docs/prompts/ is gitignored, so
  // it never exists in CI — warning on that would fail --strict on every clean checkout,
  // which is the same false-positive-in-a-gate bug this file fixed for CLAUDE.md on the
  // same day. Whether the hook is *wired* is checked above, on both sides; that is the part
  // that can actually break. This line only reports what is on disk.
  const days = fs.existsSync(promptDir)
    ? fs.readdirSync(promptDir).filter((f) => /^\d{4}-\d\d-\d\d\.md$/.test(f)) : [];
  ok(days.length
    ? `prompts are being saved (${days.length} day${days.length > 1 ? 's' : ''} logged locally)`
    : 'prompt capture is wired (no local log here — expected in CI, gitignored)');
}

// 10. Recording without reading back is how a workspace accumulates records nobody uses.
// LEARNED.md is the consolidation; this checks it has not fallen behind the work.
try {
  execSync('node scripts/reflect.mjs --check', { cwd: ROOT, stdio: 'pipe' });
  ok('docs/LEARNED.md is current');
} catch (e) {
  soft('the reflection is stale', `${String(e.stderr ?? '').trim() || 'run node scripts/reflect.mjs'} — see skills/reflect`);
}

console.log('\n───────────────────────────────────────────────────────────');
if (fail) {
  console.log(`  ${fail} failure${fail > 1 ? 's' : ''}${warn ? `, ${warn} warning${warn > 1 ? 's' : ''}` : ''}.`);
  console.log('  A gate that fails is a refusal, not a note. Fix it before moving on.\n');
  process.exit(1);
}
console.log(`  All checks pass${warn ? `, ${warn} warning${warn > 1 ? 's' : ''}` : ''}.`);
if (warn && STRICT) { console.log('  --strict: warnings are failures here.\n'); process.exit(1); }
console.log('\n  What this cannot check: whether the spec is good, whether the review was');
console.log('  honest, or whether the guard that "failed" was the right guard. Those stay');
console.log('  human. This only catches the mechanical skips.\n');// ── The product repo's engineering baseline ──────────────────────────────────
//
// A council put this workspace at "top 10%, not top 1%", and part of why was that it had
// world-class controls against AGENT failure and none of the hygiene an ordinary engineering
// org takes for granted. The tools belong to the code being written, not to the process
// writing it — so this WARNS rather than fails, and ships the configs in
// templates/engineering-baseline/ so the fix is a copy rather than a research task.
//
// It warns forever, though. A workspace that stops mentioning a missing linter has agreed
// with you that it does not matter.
{
  const cfgPath = path.join(ROOT, 'workspace.config.json');
  let dirs = ['code'];
  try { dirs = JSON.parse(fs.readFileSync(cfgPath, 'utf8')).codeDirs ?? dirs; } catch { /* default */ }
  const real = dirs.map((d) => path.resolve(ROOT, d)).filter((d) => fs.existsSync(d));
  if (!real.length) {
    soft('product repo not present', 'no configured codeDirs exist yet — nothing to check');
  } else {
    const pkgPath = real.map((d) => path.join(d, 'package.json')).find((p) => fs.existsSync(p));
    if (!pkgPath) {
      soft('the product repo has no package.json', 'lint, format and typecheck cannot be wired without one — templates/engineering-baseline/');
    } else {
      let scripts = {};
      try { scripts = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).scripts ?? {}; } catch { /* unreadable */ }
      const want = ['lint', 'format', 'typecheck', 'test'];
      const missing = want.filter((s) => !scripts[s]);
      if (missing.length) {
        soft(`the product repo has no ${missing.join(', ')} script`,
          'copy templates/engineering-baseline/ and add them — a linter nobody runs is not a linter');
      } else ok('the product repo wires lint, format, typecheck and test');
    }
  }
}



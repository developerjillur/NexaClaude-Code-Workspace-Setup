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
import { execSync, execFileSync, spawnSync } from 'node:child_process';
import { projectRootFor, stateRoot, paths, councilDir, readConfig, codeDirs, stages as pipelineStages, PLUGIN_ROOT } from './hooks/roots.mjs';
import { demandsFor, scaffolding, meets } from './card-demands.mjs';

// Two roots — see hooks/roots.mjs. This one is the PROJECT being checked, which is not
// where this script lives once the workspace ships as a plugin.
const { root: ROOT, trusted: ROOT_TRUSTED, source: ROOT_SOURCE } = projectRootFor(import.meta.url);
// Every plugin-written location comes from one module — see paths() in roots.mjs.
const P = paths(ROOT);
if (!ROOT_TRUSTED) {
  console.error(`no workspace found (looked from ${ROOT_SOURCE}). Run this inside a project, or set CLAUDE_PROJECT_DIR.`);
  process.exit(2);
}
const STRICT = process.argv.includes('--strict');

// ── which deployment is this? ───────────────────────────────────────────────
//
// **Three checks below were written for a CLONE and fail loudly in an INSTALL.** Run against an
// adopted repository from a plugin cache, this file reported `.claude/skills is missing`,
// `save-prompt.mjs is missing` and two plugins "not declared" — four failures a user cannot act
// on, about files that are not supposed to be in their repository at all.
//
// That is the same defect this file already fixed twice for the council: **a check that reports
// absence where there is none is worse than no check, because it teaches people to ignore the
// ones that matter.** Found by installing the plugin into a cache path and running it against a
// different repository, which no unit test does.
// **Outside the project, not merely a different path.** The first version compared the two roots
// for inequality, which is true in the in-repo layout too — the plugin lives at `<repo>/plugin/`
// — so this repository classified itself as installed and silently stopped checking
// `.claude/skills`, the link whose absence makes every skill invisible to Claude Code. Weakening
// a check while fixing a false positive is the trade this file keeps having to not make.
const INSTALLED = fs.existsSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'))
  && !path.resolve(PLUGIN_ROOT).startsWith(`${path.resolve(ROOT)}${path.sep}`);

let fail = 0, warn = 0;
const ok = (m) => console.log(`  ✅ ${m}`);
const bad = (m, why) => { fail++; console.log(`  ❌ ${m}\n       ${why}`); };
const soft = (m, why) => { warn++; console.log(`  ⚠️  ${m}\n       ${why}`); };

/**
 * Where a BUNDLED sibling script lives — `card-gate.mjs`, `depth-check.mjs`, the rest.
 *
 * ── the defect this exists to prevent, and it was the worst one in this file ──
 *
 * Three gates spawned `path.join(ROOT, 'scripts', <name>)`. `ROOT` is the **adopter's
 * project**, and an adopted project contains five things — `.nexa`, `AGENTS.md`, `CLAUDE.md`,
 * `.claudeignore`, `.claude/settings.json`. It has no `scripts/`. So in the only configuration
 * this ships as, the child never started, `JSON.parse(r.stdout || '{}')` turned the empty
 * output into `{findings: []}`, and zero findings printed as a green tick:
 *
 *     ✅ every card carries what its stage requires (0 checked)
 *     ✅ all 0 controls have a refusal case AND a silent case
 *       All checks pass.                                        exit 0
 *
 * Reproduced end to end against a freshly adopted repository. **The three strongest gates in
 * the workspace passed having inspected nothing**, which is the exact failure mode this file's
 * own header warns about: a check that reports absence where there is none teaches people to
 * ignore the ones that matter. This is its inverse and it is worse — reporting presence where
 * there is none.
 *
 * The correct idiom was already in this file at the `save-prompt` lookup: try the plugin, fall
 * back to the repository. It just was not applied here.
 */
const sibling = (...parts) => [path.join(PLUGIN_ROOT, 'scripts', ...parts),
  path.join(ROOT, 'scripts', ...parts)].find((p) => fs.existsSync(p)) ?? null;

/**
 * Run a bundled gate that speaks `--json`, and **never let "could not run" read as "clean"**.
 *
 * @returns {{ran: boolean, why?: string, out?: object}} `ran: false` is a `bad()` at every
 *   call site. A gate that cannot start is a broken installation, not a passing repository.
 */
const runGate = (name, args = ['--json']) => {
  const script = sibling(name);
  if (!script) return { ran: false, why: `${name} is not in this plugin or this repository` };
  const r = spawnSync('node', [script, ...args], { encoding: 'utf8', cwd: ROOT });
  if (r.error) return { ran: false, why: `${name} could not be spawned — ${r.error.message}` };
  let out;
  try { out = JSON.parse(r.stdout || ''); } catch {
    // Exit 1 with parseable-nothing is the shape of a crash. Exit 0 with unparseable stdout is
    // a gate that changed its output format. Both are "we learned nothing", never "no findings".
    return { ran: false, why: `${name} exited ${r.status} without usable JSON — ${(r.stderr || r.stdout || '').trim().split('\n')[0]?.slice(0, 120) || 'no output'}` };
  }
  return { ran: true, out };
};

const stages = pipelineStages();
const cardsIn = (s) => {
  const d = path.join(P.board, s);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => f.endsWith('.md') && f !== 'README.md' && !f.startsWith('._'));
};
const read = (s, f) => fs.readFileSync(path.join(P.board, s, f), 'utf8');

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
// The stage requirements now live in ONE module, imported by this gate AND by `nexa-move`.
// They were here alone, while `card-gate.mjs` held a different list — so `pipeline.json` could
// name `spec-section` as a guard on `1-spec → 2-plan` and the mover, which runs card-gate,
// enforced nothing of the kind. See the header of card-demands.mjs.
// The same list as `stages`; kept as a name because the loop below reads better for it.
const STAGE_ORDER = stages;
let checked = 0;
// Every stage a card has PASSED, not just the one it sits in — see demandsFor().
for (const stage of STAGE_ORDER) {
  const rules = demandsFor(stage);
  if (!rules.length) continue;
  for (const f of cardsIn(stage)) {
    const body = read(stage, f);
    const stripped = scaffolding(body);
    checked++;
    for (const [re, what, guardId, owed] of rules) {
      if (!meets(re, stripped, body)) bad(`${stage}/${f} is missing ${what} [${guardId}]`,
        owed === stage
          ? 'it passed a gate it should not have — move it back'
          : `owed since ${owed}, and never supplied — it passed that gate without satisfying it`);
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
    //
    // **The paths used to be the literal `code/src code/tools code/server.js`** — the layout of
    // the private product this workspace was extracted from. Every adopter whose code is in
    // `src/` got `depth-check` scanning three directories that do not exist; it exited 0 saying
    // "nothing to check" and this file printed `depth-check clean` over a tree it never opened.
    // The whole block was also gated on `ROOT/code` existing, so the documented
    // `codeDirs: ["src","lib"]` adoption skipped it entirely. `codeDirs` is the answer to
    // "where is the product", and it is two lines away in the config.
    // **execFileSync, not execSync.** These paths come out of `workspace.config.json`, which is
    // a file in the repository an agent can write — interpolating it into a shell string is a
    // command-injection path, not a hypothetical one.
    const cfg = readConfig(ROOT).config;
    const configured = cfg.depthCheckPaths?.length ? cfg.depthCheckPaths : codeDirs(ROOT).dirs;
    const scanPaths = configured.filter((d) => fs.existsSync(path.join(ROOT, d)));
    // **A path that does not exist used to remove this gate in silence.** `scanPaths.length` on
    // the line below is the whole condition: filter every configured dir away and the block never
    // runs, prints nothing, and the card passes. depth-check is the ONE control in this workspace
    // that reads the produced artifact rather than a claim about it, and a typo in `codeDirs`
    // deleted it with no output distinguishing that from a clean scan.
    //
    // depth-check itself already refuses to call an empty scan a clean one. That refusal was
    // simply unreachable from the only gate that invokes it — a check that exists and cannot fire.
    // **Configured-and-missing is a defect; unconfigured-and-missing is a repo without product
    // code yet**, which this very repository is. Refusing both would fire on every workspace-only
    // clone from its first card onward, and a guard that is wrong on the ordinary case gets
    // switched off long before it ever meets the case it was written for.
    // `codeDirs: ["code"]` is what the shipped config says before anybody edits it, so a missing
    // `code/` means "no product code yet" — true of this repository and of every adopter on day
    // one. A path the adopter actually WROTE and that does not exist is the different thing: a
    // typo that removes the gate without saying so.
    const missing = configured.filter((d) => !fs.existsSync(path.join(ROOT, d)));
    const chosen = missing.filter((d) => d !== 'code');
    if (['4-review', '5-verify', '6-done'].includes(stage) && missing.length) {
      if (chosen.length) {
        bad(`${stage}/${f} — depth-check scanned nothing: ${chosen.join(', ')} does not exist`,
          'a code path you configured is missing, so the only gate that reads the artifact was skipped in silence');
      } else {
        soft(`${stage}/${f} — depth-check scanned nothing: no code/ yet`,
          'expected before there is product code — but note that nothing read an artifact for this card');
      }
    }
    const depthScript = sibling('depth-check.mjs');
    if (['4-review', '5-verify', '6-done'].includes(stage) && scanPaths.length && depthScript) {
      try {
        execFileSync('node', [depthScript, ...scanPaths], { cwd: ROOT, stdio: 'pipe' });
        ok(`${stage}/${f} — depth-check clean (${scanPaths.join(', ')})`);
      } catch (e) {
        const lines = String(e.stdout ?? '').split('\n').filter((l) => /^\s{4}\S.*:\d+/.test(l));
        bad(`${stage}/${f} — depth-check found ${lines.length} finding(s)`,
          `${lines.slice(0, 3).map((l) => l.trim()).join('; ')} — fix, or answer each in the card`);
      }
    }

    // Follow the citations, rather than trusting that someone did. A card only reaches these
    // stages once, and "run verify-claims" as a checklist line is a thing people tick.
    const claimsScript = sibling('verify-claims.mjs');
    if ((stage === '5-verify' || stage === '6-done') && claimsScript) {
      try {
        execFileSync('node', [claimsScript, path.join('board', stage, f)], { cwd: ROOT, stdio: 'pipe' });
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
if (INSTALLED) {
  // Installed, the skills come from the plugin and the user's repo is not supposed to have a
  // .claude/skills at all. Demanding one told installed users to create a link they must not.
  const n = fs.existsSync(path.join(PLUGIN_ROOT, 'skills'))
    ? fs.readdirSync(path.join(PLUGIN_ROOT, 'skills')).filter((d) => !d.startsWith('._')).length : 0;
  if (n) ok(`${n} skills load from the plugin — nothing needed in your repository`);
  else bad('the plugin ships no skills', `expected them in ${path.join(PLUGIN_ROOT, 'skills')}`);
} else if (!fs.existsSync(skillsLink)) {
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
  if (!fs.existsSync(p)) {
    // The council skill is a REAL file in this plugin as of 2026-07-30, so a missing SKILL.md
    // here is an ordinary defect again rather than "the council was never fetched". The
    // exemption that used to live here hid exactly the breakage it was written around: four
    // tracked symlinks that dangled in a clone and were skipped on install.
    bad(`skill ${s} has no SKILL.md`, 'the directory alone does nothing');
    continue;
  }
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
    ? 'AGENTS.md verified-at is still INITIAL — expected on a fresh clone; set it once you have read the contract'
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
const dec = path.join(P.docs, 'DECISIONS.md');
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
      soft('product repo settings not checked', 'no code directory configured yet — expected before ./setup.sh --code');
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
// 8·0. **Which SCRIPT each event runs, not merely that the event is declared.**
//
// The check above records event NAMES only, so a hook bound to the wrong script — or to a
// script that does not exist — is invisible to it. That is not hypothetical: `README.md`
// documented `Stop` → `session-end.mjs` with the description "the turn cannot end quietly with
// a gate unrun", while `plugin/hooks/hooks.json` bound `Stop` to `autopilot.mjs`.
// `session-end.mjs` was 60 lines referenced by nothing but that README row.
//
// So the workspace's strongest published enforcement claim named a hook that was not wired,
// and the drift check that exists to catch exactly this was structurally unable to see it.
// Comparing basenames per event is the cheapest thing that would have.
{
  const manifest = path.join(PLUGIN_ROOT, 'hooks', 'hooks.json');
  const readme = path.join(ROOT, 'README.md');
  if (fs.existsSync(manifest) && fs.existsSync(readme)) {
    try {
      const wired = {};
      const json = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      for (const [event, groups] of Object.entries(json.hooks ?? {})) {
        wired[event] = new Set((groups ?? []).flatMap((g) => (g.hooks ?? [])
          .map((h) => (h.command ?? '').match(/([\w.-]+\.mjs)/)?.[1]).filter(Boolean)));
      }
      // Rows look like: | `Stop` | `autopilot.mjs` | what it does |
      const rows = fs.readFileSync(readme, 'utf8').split('\n')
        .map((l) => l.match(/^\|\s*`(\w+)`\s*\|\s*`([\w.-]+\.mjs)`\s*\|/))
        .filter(Boolean).map((m) => [m[1], m[2]]);
      const lies = rows.filter(([event, script]) => wired[event] && !wired[event].has(script));
      const missingEvent = rows.filter(([event]) => !wired[event]);
      if (lies.length) {
        bad(`README documents ${lies.length} hook(s) that hooks.json does not wire`,
          lies.map(([e, s]) => `${e} → ${s}, actually ${[...wired[e]].join(', ') || 'nothing'}`).join('; '));
      } else if (missingEvent.length) {
        bad(`README documents ${missingEvent.length} hook event(s) that hooks.json does not declare`,
          missingEvent.map(([e, s]) => `${e} → ${s}`).join('; '));
      } else if (rows.length) {
        ok(`all ${rows.length} documented hooks are wired to the script the README names`);
      }
      // And the reverse: a script named in the manifest that is not in the plugin at all.
      const absent = Object.entries(wired).flatMap(([event, set]) => [...set]
        .filter((s) => !fs.existsSync(path.join(PLUGIN_ROOT, 'scripts', 'hooks', s)))
        .map((s) => `${event} → ${s}`));
      if (absent.length) bad(`${absent.length} wired hook script(s) do not exist`, absent.join('; '));
    } catch (e) {
      bad('the hook manifest could not be compared against the README', e.message);
    }
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
  // ── the council ships inside the plugin ────────────────────────────────────
  //
  // Its fifth home, and the first that needs no second install step. It has been: vendored with
  // rewritten paths (broke, and went stale carrying a UTF-8 corruption bug), a per-repo clone
  // behind symlinks (skipped on install), a marketplace dependency (a fourth `marketplace add`),
  // and a shared clone in ~/.nexa (still a fetch before a core feature existed).
  //
  // **Each move broke the check that looked in the previous place**, and one of those breakages
  // told every installed user their council was missing while handing them a command their
  // layout did not have. So the location is asked for, never searched for — and absence is now a
  // packaging defect rather than something the user forgot to run.
  const council = (() => {
    const dir = councilDir();
    return fs.existsSync(path.join(dir, 'members.json')) ? { at: dir } : null;
  })();

  if (!council) {
    bad('the council is missing from this plugin — /council will not work',
      `expected members.json in ${councilDir()} — reinstall the plugin`);
  } else {
    // **The pin is printed every run, and that is the whole staleness defence.** The copy that
    // went bad recorded no commit and no date, so nobody could tell by looking that it had been
    // wrong for a week. `nexa-council-update` compares this against upstream on demand; this
    // line only has to make the number impossible to not see.
    let pin = null;
    try { pin = JSON.parse(fs.readFileSync(path.join(council.at, '.vendored-from'), 'utf8')); } catch { /* unpinned */ }
    if (pin?.commit) ok(`council vendored at ${pin.commit.slice(0, 7)} (${pin.vendored}) — nexa-council-update checks for drift`);
    else soft('the vendored council has no .vendored-from', 'its provenance is unknown — run nexa-council-update --apply');
  }
  const membersFile = council ? path.join(council.at, 'members.json') : null;
  if (membersFile && fs.existsSync(membersFile)) {
    const cfg = JSON.parse(fs.readFileSync(membersFile, 'utf8'));
    const dirs = [`${process.env.HOME}/.local/bin`, `${process.env.HOME}/.npm-global/bin`,
      '/usr/local/bin', '/opt/homebrew/bin', ...(process.env.PATH ?? '').split(':')];
    const missing = [...new Set(cfg.members.map((m) => m.cmd))]
      .filter((c) => !dirs.some((d) => d && fs.existsSync(path.join(d, c))));
    if (missing.length) {
      soft(`council: ${missing.join(', ')} not found`,
        `${cfg.members.length} members declared; a council that quietly shrinks still answers confidently`);
    } else ok(`council: all ${cfg.members.length} members reachable (vendored)`);
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
    // Installed, these are `dependencies` in the plugin manifest and Claude Code resolves them.
    // A user's own settings.json is not where they belong, and demanding it there reported a
    // failure whose only fix was to duplicate a declaration the plugin already makes.
    else if (INSTALLED) {
      const deps = (() => {
        try {
          return (JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'))
            .dependencies ?? []).map((d) => `${d.name}@${d.marketplace}`);
        } catch { return []; }
      })();
      if (deps.includes(plugin)) ok(`${plugin} is a declared dependency of this plugin`);
      else bad(`${plugin} is not declared`, `${why} — and this plugin does not depend on it either`);
    } else bad(`${plugin} is not declared`, why);
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
// `stateRoot`, never `statePath` — the latter creates directories and migrates the legacy one,
// and a check that changes the thing it is checking is not a check. This reads only.
const STATE = stateRoot(ROOT);
const promptDir = STATE && path.join(STATE, 'prompts');
// The hook lives with the SCRIPTS, which is the plugin when installed and the repo in a clone.
// Looking only in the repo reported it missing on every installed machine — where it is present,
// wired, and running.
const savePrompt = [path.join(PLUGIN_ROOT, 'scripts', 'hooks', 'save-prompt.mjs'),
  path.join(ROOT, 'scripts', 'hooks', 'save-prompt.mjs')].find((p) => fs.existsSync(p));
if (!savePrompt) {
  bad('save-prompt.mjs is missing', 'prompts would exist only in Claude Code\'s own logs, outside this repo');
} else if (!promptDir) {
  // Reported rather than skipped. A writer with no state root writes nothing at all, so silence
  // here would read as "prompts are being saved" while none were.
  bad('no state directory could be resolved', 'prompts, compaction notes and the prompt-check memory are all being discarded — set NEXA_STATE_DIR');
} else {
  // Deliberately NOT a warning when the directory is empty. The log lives outside the
  // repository, so a fresh clone and every CI runner start with none — warning on that would
  // fail --strict on every clean checkout, which is the same false-positive-in-a-gate bug this
  // file fixed for CLAUDE.md on the same day. Whether the hook is *wired* is checked above, on
  // both sides; that is the part that can actually break. This line only reports what is on disk.
  //
  // The location is printed rather than assumed, because it is now derived — from NEXA_STATE_DIR
  // or from this workspace's id — and "where did my prompts go" must be answerable by running
  // the check rather than by reading this source.
  const days = fs.existsSync(promptDir)
    ? fs.readdirSync(promptDir).filter((f) => /^\d{4}-\d\d-\d\d\.md$/.test(f)) : [];
  const where = process.env.NEXA_STATE_DIR ? `${STATE} (NEXA_STATE_DIR)` : STATE;
  ok(days.length
    ? `prompts are being saved — ${days.length} day${days.length > 1 ? 's' : ''} in ${where}`
    : `prompt capture is wired (no log yet in ${where} — expected on a fresh clone and in CI)`);
}

// 10. Recording without reading back is how a workspace accumulates records nobody uses.
// LEARNED.md is the consolidation; this checks it has not fallen behind the work.
try {
  execSync('node scripts/reflect.mjs --check', { cwd: ROOT, stdio: 'pipe' });
  ok('docs/LEARNED.md is current');
} catch (e) {
  soft('the reflection is stale', `${String(e.stderr ?? '').trim() || 'run node scripts/reflect.mjs'} — see skills/reflect`);
}


// ── The product repo's engineering baseline ──────────────────────────────────
//
// A council put this workspace at "top 10%, not top 1%", and part of why was that it had
// world-class controls against AGENT failure and none of the hygiene an ordinary engineering
// org takes for granted. The tools belong to the code being written, not to the process
// writing it — so this WARNS rather than fails, and ships the configs so the fix is a copy
// rather than a research task.
//
// **The path it names must be one the reader can reach.** It said `templates/engineering-baseline/`,
// which is this repository's layout — the directory sat OUTSIDE `plugin/`, so it was in no
// installed copy, and every adopter was told to copy from a path they do not have. Moved under
// `plugin/templates/` and printed as an absolute path resolved from PLUGIN_ROOT, so the advice
// is followable in both deployments.
//
// It warns forever, though. A workspace that stops mentioning a missing linter has agreed
// with you that it does not matter.
{
  const BASELINE = path.join(PLUGIN_ROOT, 'templates', 'engineering-baseline');
  const cfgPath = P.config;
  let dirs = ['code'];
  try { dirs = JSON.parse(fs.readFileSync(cfgPath, 'utf8')).codeDirs ?? dirs; } catch { /* default */ }
  const real = dirs.map((d) => path.resolve(ROOT, d)).filter((d) => fs.existsSync(d));
  if (!real.length) {
    soft('product repo not present', 'expected until ./setup.sh --code points it at your repo');
  } else {
    const pkgPath = real.map((d) => path.join(d, 'package.json')).find((p) => fs.existsSync(p));
    if (!pkgPath) {
      soft('the product repo has no package.json',
        `lint, format and typecheck cannot be wired without one — see ${BASELINE}`);
    } else {
      let scripts = {};
      try { scripts = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).scripts ?? {}; } catch { /* unreadable */ }
      const want = ['lint', 'format', 'typecheck', 'test'];
      const missing = want.filter((s) => !scripts[s]);
      if (missing.length) {
        soft(`the product repo has no ${missing.join(', ')} script`,
          `copy ${BASELINE} and add them — a linter nobody runs is not a linter`);
      } else ok('the product repo wires lint, format, typecheck and test');
    }
  }
}

// ── Cards carry what their stage requires ────────────────────────────────────
//
// bad(), not soft(). A council rated this workspace 7.5 and would not go higher for one
// reason it said four ways: "a warning that never becomes a refusal is visibility, not a
// gate", and "a skill that only ASKS is not a gate that refuses, and this workspace's whole
// claim is that it refuses."
//
// So discovery-first's five questions and operate-after-done's one are enforced here rather
// than requested in prose. The check is deliberately dumb — it proves the answers EXIST and
// are not placeholders, never that they are true. Nothing mechanical can do the second, and
// the failure that actually happens is the first.
{
  const g = runGate('card-gate.mjs');
  const out = g.out ?? {};
  const n = (out.findings ?? []).length;
  if (!g.ran) {
    bad('the card gate could not run — no card was checked', `${g.why}. Until this runs, every stage requirement is unverified.`);
  } else if (n) {
    // The total is printed FIRST and always. Showing six of nine and saying nothing about the
    // other three is how a bounded report reads as a complete one.
    console.log(`  ⛔ card-gate: ${n} unanswered requirement${n === 1 ? '' : 's'} across ${new Set(out.findings.map((f) => f.card)).size} card${new Set(out.findings.map((f) => f.card)).size === 1 ? '' : 's'}`);
    for (const f of out.findings.slice(0, 6)) {
      bad(`${f.card} (${f.stage}) is missing: ${f.missing}`, f.hint);
    }
    if (n > 6) {
      fail += n - 6;
      console.log(`  ❌ …and ${n - 6} more — node scripts/card-gate.mjs`);
    }
  } else if (!(out.cards ?? 0)) {
    // Said differently from the N-checked case ON PURPOSE. `every card carries what its stage
    // requires (0 checked)` is the exact string this gate printed while it was silently not
    // running at all, and a reader cannot tell a vacuous truth from a broken gate by looking at
    // it. An empty board is fine; it just must not be phrased as an achievement.
    ok('no cards on the board — nothing to check');
  } else ok(`every card carries what its stage requires (${out.cards} checked)`);
}


// ── the README's counts are claims, and claims get checked ───────────────────
//
// Published wrong twice: "21 scripts" against 18, and "37 scripts" against 22. Both had the
// same cause — `.endsWith('.mjs')` also matches `._council.mjs`, the AppleDouble sidecar macOS
// writes beside every file on an exFAT volume. A number nobody counted is a number that drifts.
{
  const readme = path.join(ROOT, 'README.md');
  if (fs.existsSync(readme)) {
    const text = fs.readFileSync(readme, 'utf8');
    const real = (d) => {
      const p = path.join(ROOT, d);
      return fs.existsSync(p) ? fs.readdirSync(p).filter((f) => f.endsWith('.mjs') && !f.startsWith('._')).length : 0;
    };
    // The council is FETCHED, not vendored, so before setup has run its scripts are
    // legitimately absent. Counting them anyway produced "README says 24 scripts; there are 9"
    // on a fresh clone — which sends a new user to edit the README to match a state that is
    // temporary and correct. **A gate that names the wrong cause is worse than a quiet one:
    // it points you at the wrong file with total confidence.**
    const councilHere = fs.existsSync(path.join(ROOT, 'scripts', 'council', 'council.mjs'));
    const counts = [
      ...(councilHere ? [
        ['scripts', real('scripts') + real('scripts/council'), /### (\d+) scripts —/],
        ['council scripts', real('scripts/council'), /\| `council\/\*\.mjs` \| (\d+) files/],
      ] : []),
      // No compensation any more. The council skill used to arrive with the council, so this
      // added a phantom +1 for it whenever the council was absent — and once the skill became
      // a real file in the plugin, that +1 double-counted and demanded a README number one
      // higher than the truth. **A fudge factor outlives the thing it was compensating for**,
      // which is why this counts what is on disk and nothing else.
      ['skills', fs.existsSync(path.join(ROOT, '.agents/skills'))
        ? fs.readdirSync(path.join(ROOT, '.agents/skills')).filter((d) => !d.startsWith('._')).length : 0,
        /### (\d+) skills —/],
      // **Added because it was the number that drifted.** `scripts` and `skills` were checked;
      // `commands` was not, and the README said 7 while eleven existed — four commands shipped
      // and documented nowhere a reader would look. A count nothing verifies is exactly the
      // claim this block exists to catch, and it had one of its own.
      ['commands', fs.existsSync(path.join(ROOT, '.claude/commands'))
        ? fs.readdirSync(path.join(ROOT, '.claude/commands')).filter((d) => !d.startsWith('._')).length : 0,
        /### (\d+) commands —/],
      ['board stages', fs.existsSync(P.board)
        ? fs.readdirSync(P.board).filter((d) => !d.startsWith('._')).length : 0, null],
      // **Added for the same reason `commands` was, and it had drifted further.** The README
      // advertised "15 bare commands" while `bin/` shipped 26 — eleven commands on the reader's
      // PATH that the README gave them no way to discover. `scripts`, `skills` and `commands`
      // were each verified here; the one class of thing a user actually TYPES was not.
      // `bin/` is looked for beside the plugin AND beside the README being read. When neither has
      // one there is nothing to compare, and the regex is set to null so the loop skips it — the
      // same rule as a README with no such section. **This check first shipped counting a missing
      // directory as zero**, which turned "I cannot see bin/" into "your README overstates by 26"
      // — a confident wrong refusal, which is the failure mode that gets a gate deleted rather
      // than fixed.
      (() => {
        const dir = [path.join(PLUGIN_ROOT, 'bin'), path.join(ROOT, 'bin')].find((d) => fs.existsSync(d));
        return ['bare commands',
          dir ? fs.readdirSync(dir).filter((d) => !d.startsWith('.')).length : 0,
          dir ? /\*\*(\d+) bare commands\*\*/ : null];
      })(),
    ];
    let drift = 0;
    for (const [label, actual, re] of counts) {
      if (!re) continue;
      const m = text.match(re);
      // Silent when the README simply has no such section. This exists to catch a STALE
      // number, not to require a particular README shape — and firing on every project whose
      // README is written differently is how a real drift warning gets skimmed past.
      if (!m) continue;
      if (Number(m[1]) !== actual) { bad(`README says ${m[1]} ${label}; there are ${actual}`, 'a number in a README is a claim'); drift++; }
    }
    if (!drift) ok('the README\'s counts match the filesystem');
  }
}

// ── the graph the contract sends every agent to ─────────────────────────────
//
// §5 tells agents to query the graph before reading files. That instruction is only safe
// while the graph is true, and nothing was checking. Measured 2026-07-29: built at HEAD,
// all 61 source files indexed — and 32 of them changed since, uncommitted. A graph is built
// from COMMITS, and this project's work lives uncommitted.
//
// Warned rather than failed: a stale graph is a reason to distrust an answer, not to stop
// work, and a gate that fires on every session with a dirty tree gets switched off by
// lunchtime. It states the number every time, though.
{
  const g = runGate('graph-fresh.mjs');
  const out = g.out ?? {};
  const n = (out.findings ?? []).length;
  // Soft, like every other verdict from this gate: a graph that could not be checked is a
  // reason to distrust an answer, not to stop work. But it must not print the green line.
  if (!g.ran) soft('the graph freshness check could not run', g.why);
  else if (!n) ok('the code graph describes the code that is there');
  else for (const f of out.findings.slice(0, 3)) {
    soft(`graph: ${f.dir} — ${f.detail}`, 'rebuild before trusting graphify explain — a stale graph does not error, it answers');
  }
}

// ── declared is not installed ────────────────────────────────────────────────
//
// check.mjs verified that the settings DECLARED each plugin. setup.sh then found that four of
// the eight were not on this machine at all — including ponytail, whose declaration this file
// had been happily confirming. Reading a config's claim about the world is not checking the
// world, and it is the same shape as every other control here that failed open.
//
// soft(), because a missing plugin does not corrupt anything — it quietly removes a capability
// the contract assumes. That deserves a permanent nag, not a stopped session. `./setup.sh`
// installs them.
{
  const declared = (() => {
    try { return Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, '.claude', 'settings.json'), 'utf8')).enabledPlugins ?? {}); }
    catch { return []; }
  })();
  if (!declared.length) soft('no plugins are declared', 'the review path and the laziness ladder both come from plugins');
  else {
    const list = spawnSync('claude', ['plugin', 'list'], { encoding: 'utf8' });
    if (list.status !== 0) soft('could not ask claude which plugins are installed', 'declared-but-absent cannot be detected without it');
    else {
      const out = list.stdout ?? '';
      // Parse the list into per-plugin BLOCKS. The first version read a 200-character window
      // from each name, and a plugin's own block is only four lines — so the window ran into
      // the NEXT entry and reported two enabled plugins as disabled, one of them the second
      // model the whole review path stands on. **A window is not a record**, and this is the
      // fifteenth control here to be wrong on its first version.
      const blocks = new Map();
      let current = null;
      for (const line of out.split('\n')) {
        const m = line.match(/^\s*❯\s*(\S+)/);
        if (m) { current = m[1]; blocks.set(current, []); continue; }
        if (current) blocks.get(current).push(line);
      }
      const missing = declared.filter((p) => !blocks.has(p));
      const disabled = declared.filter((p) => /disabled/i.test((blocks.get(p) ?? []).join('\n')));
      if (missing.length) soft(`${missing.length} declared plugin${missing.length === 1 ? '' : 's'} not installed: ${missing.join(', ')}`, './setup.sh');
      if (disabled.length) soft(`${disabled.length} declared plugin${disabled.length === 1 ? '' : 's'} installed but DISABLED: ${disabled.join(', ')}`, './setup.sh');
      if (!missing.length && !disabled.length) ok(`all ${declared.length} declared plugins are installed and enabled`);
    }
  }
}

// The council's presence and its pinned commit are checked where the members are, above.
// This block used to shell out to council-sync --check; that script is gone, and a check that
// spawns a missing file reports "not fetched" forever — absence where there is none, which is
// how a check teaches people to ignore it.

// ── every control tested in both directions ──────────────────────────────────
//
// bad(), not soft(). Sixteen controls have been added to this workspace and every one was
// wrong on its first version — thirteen of them failing OPEN, which is indistinguishable from
// working. **Not one was found by the case it was built to catch.** Every single one was found
// by running the case it was supposed to stay silent on.
//
// That lesson is in docs/LEARNED.md three times and kept happening anyway, including twice in
// one afternoon while fixing a council's criticism that the controls here only advise. So it
// is a gate now.
{
  const g = runGate('guard-coverage.mjs');
  const out = g.out ?? {};
  const n = (out.findings ?? []).length;
  const controls = (out.controls ?? []).length;
  // **Zero controls is not full coverage — but only when nothing was scanned.**
  //
  // `✅ all 0 controls have a refusal case AND a silent case` was printed, in green, by an
  // installation where the gate had not run at all. The first fix failed everything with zero
  // controls, which turned a legitimate case into a false failure: a project that has been
  // scanned properly and simply owns no refusing scripts yet. `plugin-packaging.test.mjs`
  // caught that within the same session, which is the test doing exactly its job.
  //
  // So the three states are now distinct: could not run (fail), scanned nothing (fail), and
  // scanned a real tree that holds no controls yet (a note, not a tick).
  if (!g.ran) bad('the coverage gate could not run — no control was checked', g.why);
  else if (out.noSourceTree) soft('the coverage gate had no source tree to scan',
    'no configured code directory exists yet — set codeDirs in workspace.config.json once your code is here.');
  else if (!out.scanned) bad('the coverage gate scanned zero files',
    `it looked in ${(out.roots ?? []).join(', ')} and found no source files. Nothing was verified — this is not coverage.`);
  else if (!controls) soft(`the coverage gate scanned ${out.scanned} file(s) and found no controls`,
    'nothing here can refuse yet, so there is nothing to cover. Not a failure — but not coverage either.');
  else if (!n) ok(`all ${controls} controls have a refusal case AND a silent case`);
  else for (const f of out.findings) {
    bad(`${f.name}: ${f.detail}`, 'write the case it must IGNORE before the case it must catch');
  }
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
console.log('  human. This only catches the mechanical skips.\n');

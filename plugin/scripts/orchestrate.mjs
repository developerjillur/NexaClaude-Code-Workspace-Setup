#!/usr/bin/env node
// Fan work out across agent CLIs — in any editor, under this workspace's rules.
//
//   nexa-orchestrate --workers            which agents are installed here, and what each may do
//   nexa-orchestrate --plan p.json        validate the DAG and print it. Runs nothing.
//   nexa-orchestrate --run p.json         execute it
//   nexa-orchestrate --status             the last run, task by task
//
// Exit 0 = every task succeeded. 1 = a task failed or a rule refused. 2 = the plan is invalid.
//
// ── why this exists rather than a tool's own subagents ──────────────────────
//
// Every agent tool has some way to spawn a helper, and no two are alike: Claude Code has the
// Agent tool, Orca has threaded coordinator loops, Cursor has background agents, Codex has
// subagents, and Aider, Zed and the ChatGPT app have nothing. A workspace whose orchestration
// only works in one of them has the same problem §0 of the contract used to have.
//
// **A process is the one primitive all of them share.** Every agent here ships a headless CLI,
// so a "worker" is a command line and a prompt — which works from Claude Code, from Cursor, from
// a bare terminal, and from a shell script in CI, identically.
//
// ── what makes this OURS rather than a generic DAG runner ───────────────────
//
// Three of this workspace's rules were prose until now, and a fan-out is exactly where each one
// breaks quietest:
//
//   §10 no model reviews its own work   `notVendorOf` REFUSES a review task on the same vendor
//                                       as the task it reviews. This was the most-repeated rule
//                                       in the contract and nothing had ever enforced it.
//   WIP = 1                             concurrent WRITING tasks are refused. Fanning five
//                                       agents at one repository is four cards in build wearing
//                                       a different hat.
//   no product edit without a card      a writable task needs a card in 3-build, same as an edit
//
// ── and what it deliberately does not do ────────────────────────────────────
//
// **If you are inside Orca, Orca's own orchestration is richer than this** — threaded messages,
// blocking ask/reply, worker_done authority, decision gates. Run `orca skills get orchestration`
// and use it. This is not a replacement; it is the floor that exists everywhere else, and it
// runs inside Orca too so a plan written here is not stranded when you change editor.
// @rules same-vendor-review, concurrent-writers, no-card-for-write, unknown-worker, cyclic-plan, worker-failed

import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { projectRootFor, paths, statePath, PLUGIN_ROOT } from './hooks/roots.mjs';

const { root: ROOT, trusted: TRUSTED, source: SRC } = projectRootFor(import.meta.url);
if (!TRUSTED) {
  console.error(`no workspace found (looked from ${SRC}). Run this inside a project.`);
  process.exit(2);
}
const P = paths(ROOT);
const argv = process.argv.slice(2);
const val = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : null; };
const has = (n) => argv.includes(`--${n}`);

/**
 * The worker roster, derived from the council's `members.json`.
 *
 * **Not a second list.** Those invocations are verified — each was measured actually running
 * headlessly, and one of them (`grok`) is marked uncontained there because it was measured able
 * to write outside its sandbox. Writing a parallel roster here would be a copy that drifts, and
 * §7 of the contract is about what two copies do.
 *
 * What this ADDS is the write mode. Council members all run read-only on purpose — a member is
 * asked for an opinion, never for a change. An orchestration worker may be asked to implement,
 * so each entry carries both invocations and the vendor, which `notVendorOf` needs.
 */
const VENDOR = { codex: 'openai', claude: 'anthropic', 'claude-fable': 'anthropic', 'claude-sonnet': 'anthropic', gemini: 'google', agy: 'google', grok: 'xai', orca: 'orca' };

const WRITE_INVOCATION = {
  // Read-only invocations come from members.json; these are the writable counterparts, and each
  // is the vendor's own documented headless-with-edits form.
  codex: ['codex', 'exec', '--skip-git-repo-check', '-'],
  claude: ['claude', '--print', '--permission-mode', 'acceptEdits'],
  gemini: ['gemini', '--prompt'],
};

/**
 * `members.json` is a TEMPLATE, not a command line, and reusing it verbatim was a real failure.
 *
 * Three of its entries carry placeholders the council substitutes at dispatch time — `{prompt}`,
 * `{promptFile}`, `{timeoutMin}`. Handed straight to `spawn`, gemini died with
 * `invalid value "{timeoutMin}m" for flag -print-timeout`. Found by running a real two-vendor
 * DAG rather than by reading the file: codex answered, gemini never started.
 *
 * The reuse ladder says reuse the roster, and that was right. It does not say reuse it without
 * reading how its consumer uses it — which is the part that bit.
 *
 * The other half is a genuine difference between vendors, not a bug: some read the prompt from
 * STDIN, and gemini takes it as an ARGUMENT. A worker whose invocation still holds an
 * unresolved placeholder after substitution is marked unusable at PLAN time, so it is refused
 * before a run spends anything rather than half way through.
 */
const resolveArgs = (args, { prompt, promptFile }) => args.map((a) => String(a)
  .replaceAll('{prompt}', prompt ?? '')
  .replaceAll('{promptFile}', promptFile ?? '')
  .replaceAll('{timeoutMin}', '15'));
const unresolved = (args) => args.filter((a) => /\{\w+\}/.test(String(a)));

const roster = (() => {
  // `NEXA_WORKERS` points at an alternative members.json. Two real uses: an adopter whose agents
  // are not the ones this plugin ships with, and a fixture that needs a worker which is present
  // and FAILS — a case unreachable otherwise, because a missing binary is refused at plan time
  // and never reaches dispatch.
  const f = process.env.NEXA_WORKERS
    || path.join(PLUGIN_ROOT, 'scripts', 'council', 'members.json');
  let members = [];
  try { members = JSON.parse(fs.readFileSync(f, 'utf8')).members ?? []; } catch { /* reported below */ }
  const out = new Map();
  for (const m of members) {
    const id = m.id ?? m.label;
    const bin = m.cmd ?? (m.args ?? [])[0];
    if (!bin) continue;
    const base = String(id).replace(/-.*$/, '');
    const read = [m.cmd, ...(m.args ?? [])].filter(Boolean);
    out.set(id, {
      id,
      bin,
      vendor: VENDOR[id] ?? VENDOR[base] ?? base,
      read,
      write: WRITE_INVOCATION[base] ?? null,
      // The prompt goes on stdin unless the invocation asks for it as an argument.
      promptAsArg: read.some((a) => String(a).includes('{prompt}')),
      // `{promptFile}` needs a file this runner does not write, so those workers are read-only
      // to it and say so, rather than failing at dispatch.
      needsPromptFile: read.some((a) => String(a).includes('{promptFile}')),
      installed: !!spawnSync('command', ['-v', m.cmd ?? bin], { shell: true, encoding: 'utf8' }).stdout.trim(),
    });
  }
  return out;
})();

if (has('workers')) {
  console.log('\n  Workers available in THIS environment:\n');
  for (const w of roster.values()) {
    console.log(`  ${w.installed ? '✅' : '·  '} ${w.id.padEnd(14)} ${w.vendor.padEnd(10)}`
      + `${!w.installed ? 'not installed'
        : w.needsPromptFile ? 'unusable here — its invocation needs a {promptFile} this runner does not write'
          : (w.write ? 'read + write' : 'read only — no verified writable invocation')}`);
  }
  const vendors = new Set([...roster.values()].filter((w) => w.installed).map((w) => w.vendor));
  console.log(`\n  ${vendors.size} vendor(s) present: ${[...vendors].join(', ')}`);
  console.log(vendors.size > 1
    ? '  §10 is satisfiable here — a review can run on a different vendor than the build.\n'
    : '  ⚠ ONE vendor only. §10 cannot be satisfied: every review would be a self-review.\n');
  process.exit(0);
}

// ── the plan ────────────────────────────────────────────────────────────────
const planPath = val('plan') ?? val('run');
if (!planPath) {
  console.error(`
  nexa-orchestrate — fan work out across agent CLIs, under this workspace's rules

    --workers          which agents are installed here
    --plan p.json      validate and print. Runs nothing.
    --run p.json       execute
    --status           the last run

  A plan is tasks with dependencies:

    { "tasks": [
        { "id": "map",    "worker": "codex",  "mode": "read",  "prompt": "Map src/auth" },
        { "id": "build",  "needs": ["map"],   "worker": "claude", "mode": "write",
          "prompt": "Implement the card in board/3-build" },
        { "id": "review", "needs": ["build"], "worker": "gemini", "mode": "read",
          "notVendorOf": "build", "prompt": "Review the diff against the card" } ] }

  In Orca, prefer Orca's own orchestration — it is richer. This is the floor that
  works in every other editor, and in Orca too.
`);
  process.exit(2);
}

let plan;
try { plan = JSON.parse(fs.readFileSync(planPath, 'utf8')); } catch (e) {
  console.error(`\n  [cyclic-plan] ${planPath} is not readable JSON — ${e.message}\n`);
  process.exit(2);
}
const tasks = plan.tasks ?? [];
if (!tasks.length) { console.error('\n  the plan declares no tasks.\n'); process.exit(2); }

const byId = new Map(tasks.map((t) => [t.id, t]));
const problems = [];

// ── the rules, checked BEFORE anything runs ─────────────────────────────────
//
// All of them are refusals at plan time rather than at dispatch time, because a fan-out that
// discovers its own illegality halfway through has already spent the tokens and half-written the
// change. This is the same reason `nexa-move` runs its guards before it moves the card.
for (const t of tasks) {
  const w = roster.get(t.worker);
  if (!w) {
    problems.push(['unknown-worker', `task "${t.id}" names worker "${t.worker}", which is not in the roster.`
      + ` Known: ${[...roster.keys()].join(', ')}`]);
    continue;
  }
  if (!w.installed) problems.push(['unknown-worker', `task "${t.id}" needs "${t.worker}", which is not installed here`]);
  if (w.needsPromptFile) {
    problems.push(['unknown-worker', `task "${t.id}" names "${t.worker}", whose invocation requires a`
      + ' {promptFile}. Refused at plan time rather than at dispatch, where it would have spent'
      + ' every upstream task first.']);
  }
  if (t.mode === 'write' && !w.write) {
    problems.push(['unknown-worker', `task "${t.id}" asks "${t.worker}" to WRITE, and there is no verified`
      + ' writable invocation for it. Read-only workers give opinions, not changes.']);
  }
  for (const n of t.needs ?? []) {
    if (!byId.has(n)) problems.push(['cyclic-plan', `task "${t.id}" needs "${n}", which does not exist`]);
  }

  // §10, mechanically. The contract's most-repeated rule, enforced for the first time here.
  if (t.notVendorOf) {
    const other = byId.get(t.notVendorOf);
    const ow = other && roster.get(other.worker);
    if (!other) problems.push(['same-vendor-review', `task "${t.id}" declares notVendorOf "${t.notVendorOf}", which does not exist`]);
    else if (ow && w && ow.vendor === w.vendor) {
      problems.push(['same-vendor-review',
        `task "${t.id}" reviews "${other.id}" and both run on ${w.vendor}. §10: no model reviews its own work.`
        + ` Available vendors here: ${[...new Set([...roster.values()].filter((x) => x.installed).map((x) => x.vendor))].join(', ')}`]);
    }
  }
}

// A cycle is not a failed task, it is a plan that cannot exist. Kahn's algorithm, so the error
// can name the tasks that are actually stuck rather than "something is circular".
const order = (() => {
  const indeg = new Map(tasks.map((t) => [t.id, (t.needs ?? []).length]));
  const q = [...indeg].filter(([, d]) => d === 0).map(([id]) => id);
  const seq = [];
  while (q.length) {
    const id = q.shift(); seq.push(id);
    for (const t of tasks) {
      if ((t.needs ?? []).includes(id)) {
        indeg.set(t.id, indeg.get(t.id) - 1);
        if (indeg.get(t.id) === 0) q.push(t.id);
      }
    }
  }
  if (seq.length !== tasks.length) {
    problems.push(['cyclic-plan', `these tasks depend on each other in a loop: `
      + `${tasks.map((t) => t.id).filter((id) => !seq.includes(id)).join(', ')}`]);
  }
  return seq;
})();

// WIP = 1 — a property of the board, and a fan-out is where it breaks quietest. Two writing
// tasks that share no dependency edge run at the same time, which is two cards in build wearing
// a different hat.
const writers = tasks.filter((t) => t.mode === 'write');
for (let i = 0; i < writers.length; i++) {
  for (let j = i + 1; j < writers.length; j++) {
    const [a, b] = [writers[i], writers[j]];
    const ordered = (x, y) => (y.needs ?? []).includes(x.id);
    if (!ordered(a, b) && !ordered(b, a)) {
      problems.push(['concurrent-writers',
        `"${a.id}" and "${b.id}" both WRITE and neither waits for the other, so they would run`
        + ` together. WIP is 1: give one a "needs": ["${a.id}"], or make one of them read-only.`]);
    }
  }
}

// A writable task is a product edit, and the same rule applies as to any other: no card, no edit.
if (writers.length) {
  const build = path.join(P.board, '3-build');
  const cards = fs.existsSync(build)
    ? fs.readdirSync(build).filter((f) => f.endsWith('.md') && !f.startsWith('._')) : [];
  if (!cards.length) {
    problems.push(['no-card-for-write',
      `${writers.length} task(s) would WRITE and board/3-build is empty. Dispatching an agent to`
      + ' change the product is still a product change — it needs a card, for the same reason a'
      + ' direct edit does.']);
  }
}

if (problems.length) {
  console.error(`\n  ${problems.length} problem(s) — nothing was dispatched.\n`);
  for (const [rule, why] of problems) console.error(`    · [${rule}] ${why}`);
  console.error('');
  process.exit(problems.some(([r]) => r === 'cyclic-plan' || r === 'unknown-worker') ? 2 : 1);
}

if (!has('run')) {
  console.log(`\n  ✅ the plan is legal. ${tasks.length} task(s), in this order:\n`);
  for (const id of order) {
    const t = byId.get(id); const w = roster.get(t.worker);
    console.log(`    ${id.padEnd(14)} ${t.worker.padEnd(14)} ${w.vendor.padEnd(10)} ${t.mode ?? 'read'}`
      + `${t.needs?.length ? `  ← ${t.needs.join(', ')}` : ''}`);
  }
  console.log('\n  --run to execute.\n');
  process.exit(0);
}

// ── run it ──────────────────────────────────────────────────────────────────
const runDir = statePath(ROOT, path.join('orchestrate', String(process.pid)));
fs.mkdirSync(runDir, { recursive: true });
console.log(`\n  ${tasks.length} task(s). Output: ${runDir}\n`);

const results = new Map();
const dispatch = (t) => new Promise((resolve) => {
  const w = roster.get(t.worker);
  const cmd = t.mode === 'write' ? w.write : w.read;
  // Upstream results are handed on as context, so a DAG is a pipeline rather than N independent
  // prompts that happen to be ordered.
  const upstream = (t.needs ?? []).map((n) => `\n\n--- result of ${n} ---\n${results.get(n)?.text ?? ''}`).join('');
  const prompt = `${t.prompt}${upstream}`;
  const out = path.join(runDir, `${t.id}.txt`);
  process.stdout.write(`  ▹ ${t.id.padEnd(14)} ${t.worker} … `);

  const args = resolveArgs(cmd.slice(1), { prompt });
  const left = unresolved(args);
  if (left.length) {
    console.log(`unresolved placeholder ${left.join(' ')}`);
    resolve({ ok: false, text: '', why: `invocation still holds ${left.join(' ')}` });
    return;
  }
  const child = spawn(cmd[0], args, { cwd: ROOT, env: process.env });
  let text = ''; let err = '';
  child.stdout.on('data', (d) => { text += d; });
  child.stderr.on('data', (d) => { err += d; });
  child.on('error', (e) => { console.log(`could not start — ${e.message}`); resolve({ ok: false, text: '', why: e.message }); });
  child.on('close', (code) => {
    fs.writeFileSync(out, `${text}\n${err}`);
    console.log(code === 0 ? `done (${text.length} chars)` : `exit ${code}`);
    results.set(t.id, { text, ok: code === 0 });
    resolve({ ok: code === 0, text, why: code === 0 ? null : (err || `exit ${code}`) });
  });
  // stdin only when the invocation did not already take the prompt as an argument — writing to
  // stdin of a process that is not reading it hangs the run.
  if (w.promptAsArg) child.stdin.end(); else child.stdin.end(prompt);
});

let failed = null;
for (const id of order) {
  const t = byId.get(id);
  if ((t.needs ?? []).some((n) => !results.get(n)?.ok)) {
    console.log(`  ·  ${id.padEnd(14)} skipped — an upstream task failed`);
    continue;
  }
  const r = await dispatch(t);
  if (!r.ok && !failed) failed = { id, why: r.why };
}

fs.writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify({
  plan: planPath, tasks: order.map((id) => ({ id, ok: results.get(id)?.ok ?? false })),
}, null, 2));

if (failed) {
  console.error(`\n  [worker-failed] ${failed.id} did not succeed — ${String(failed.why).slice(0, 200)}\n`);
  console.error(`  Full output: ${runDir}\n`);
  process.exit(1);
}
console.log(`\n  ✅ all ${order.length} task(s) succeeded. Read them before believing them:`);
console.log(`     ${runDir}\n`);
console.log('  An agent reporting success is a claim. This ran the commands; it did not check');
console.log('  the work — that is still yours, and it is what the board gates are for.\n');

#!/usr/bin/env node
// What a session cost, and what filled the context.
//
//   node scripts/token-cost.mjs                 the 15 dearest sessions of the last 7 days
//   node scripts/token-cost.mjs --days 30       a different window
//   node scripts/token-cost.mjs <file.jsonl>    one session, broken down by what grew it
//   node scripts/token-cost.mjs --json          machine-readable
//
// AGENTS.md §7 states the rule — cost is (context size) × (turns). This is the harness that
// makes the rule checkable, on the same argument as every other gate here: a number nobody
// verifies is a number that will be wrong eventually.
//
// **Why it needed writing at all.** Both halves are invisible while you work. Measured
// 2026-08-03 over 488 sessions: the median context was 543k on EVERY project, and one session
// reached 17,449 turns — 9.28B cache-read tokens, about $13k. No single turn looked alarming,
// which is exactly why nobody noticed for days. The per-turn view is the wrong view; this
// prints the product.
//
// **The dedup is load-bearing, not tidiness.** Claude Code logs streaming updates for the same
// assistant message, so a naive sum over `usage` double-counts by ~2.2x (measured: 38,343 usage
// entries for 17,437 distinct messages). The first version of this script reported $28k for a
// $13k session. Dedup by `message.id` before summing anything.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

// Per million tokens: cache-read, cache-write, output. Published list prices at the time of
// writing; they move, and a wrong price is better than no price only because the RATIO between
// sessions stays honest. Treat the dollar figures as an ordering, not an invoice.
const PRICE = {
  'claude-opus-5': [1.5, 18.75, 75],
  'claude-opus-4-8': [1.5, 18.75, 75],
  'claude-opus-4-7': [1.5, 18.75, 75],
  'claude-sonnet-5': [0.3, 3.75, 15],
  'claude-fable-5': [0.3, 3.75, 15],
  'claude-haiku-4-5-20251001': [0.08, 1.0, 4],
};
const DEFAULT_PRICE = [1.5, 18.75, 75];
const priceOf = (m) => PRICE[m] ?? DEFAULT_PRICE;

const ROOT = path.join(process.env.HOME ?? '', '.claude', 'projects');
const n = (x) => Math.round(x).toLocaleString();

// One pass. `deep` additionally attributes context GROWTH to whatever tool result preceded it,
// which is the part that tells you what to change — a p50 of 400k is a fact, "Bash added 21M
// tokens across 8,570 calls" is an action.
async function scan(file, deep = false) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  const seen = new Set();
  const pendingTool = new Map();
  const growth = new Map();
  const perModel = new Map();
  const contexts = [];
  let previous = null;
  let sinceLast = [];
  let compactions = 0;

  for await (const line of rl) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const message = entry.message;
    if (!message) continue;

    if (deep && Array.isArray(message.content)) {
      for (const block of message.content) {
        if (block.type === 'tool_use') pendingTool.set(block.id, block.name);
        if (block.type === 'tool_result') sinceLast.push(pendingTool.get(block.tool_use_id) ?? '?');
      }
    }

    const u = message.usage;
    if (!u || !message.id || seen.has(message.id)) continue;
    seen.add(message.id);

    const context = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    // `<synthetic>` turns report zero and would drag every percentile down.
    if (context > 1000) contexts.push(context);

    const e = perModel.get(message.model) ?? { turns: 0, read: 0, write: 0, out: 0 };
    e.turns += 1;
    e.read += u.cache_read_input_tokens ?? 0;
    e.write += u.cache_creation_input_tokens ?? 0;
    e.out += u.output_tokens ?? 0;
    perModel.set(message.model, e);

    if (deep && previous !== null) {
      const delta = context - previous;
      // A large negative step is a compaction or a /clear, not negative growth.
      if (delta < -5000) compactions += 1;
      else if (delta > 0) {
        const key = sinceLast.length ? [...new Set(sinceLast)].join('+') : '(your message + my reply)';
        const g = growth.get(key) ?? { times: 0, tokens: 0 };
        g.times += 1;
        g.tokens += delta;
        growth.set(key, g);
      }
    }
    previous = context;
    sinceLast = [];
  }

  let cost = 0;
  for (const [model, v] of perModel) {
    const [read, write, out] = priceOf(model);
    cost += (v.read * read + v.write * write + v.out * out) / 1e6;
  }
  const sorted = contexts.slice().sort((a, b) => a - b);
  const at = (p) => sorted[Math.floor(sorted.length * p)] ?? 0;
  return {
    file,
    cost,
    compactions,
    perModel,
    growth,
    turns: sorted.length,
    p50: at(0.5),
    p90: at(0.9),
    max: sorted[sorted.length - 1] ?? 0,
    // The smallest real context seen is the fixed overhead floor: system prompt, tool schemas,
    // skill descriptions, AGENTS.md. It is paid on every single turn, so it multiplies.
    floor: sorted[0] ?? 0,
  };
}

// Thresholds are judgement, not measurement, and are deliberately loose — a warning that fires
// on a healthy session is a warning nobody reads by the second day.
//
// @rules context-too-large, too-many-turns, overhead-too-high
function verdicts(r) {
  const out = [];
  if (r.p50 > 300000) out.push(`context-too-large: context sits at ${n(r.p50)} — every turn re-reads all of it. Compact or /clear sooner.`);
  if (r.turns > 3000) out.push(`too-many-turns: ${n(r.turns)} turns in one session — split the work across sessions.`);
  if (r.floor > 45000) out.push(`overhead-too-high: ${n(r.floor)} tokens of overhead before your first word — too many plugins or MCP servers enabled.`);
  return out;
}

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const fileArg = args.find((a) => a.endsWith('.jsonl'));

if (fileArg) {
  const r = await scan(fileArg, true);
  if (asJson) {
    console.log(JSON.stringify({
      file: r.file, turns: r.turns, p50: r.p50, p90: r.p90, max: r.max,
      floor: r.floor, compactions: r.compactions, cost: Number(r.cost.toFixed(2)),
      growth: [...r.growth].map(([source, v]) => ({ source, ...v })).sort((a, b) => b.tokens - a.tokens),
    }, null, 2));
  } else {
    console.log(`\n${path.basename(fileArg)}`);
    console.log(`turns ${n(r.turns)}   context p50 ${n(r.p50)}  p90 ${n(r.p90)}  max ${n(r.max)}`);
    console.log(`fixed overhead before your first word: ${n(r.floor)} tokens, paid on every turn`);
    console.log(`compactions: ${r.compactions}`);
    console.log(`\ncost ~$${r.cost.toFixed(0)}   (${n(r.p50)} context × ${n(r.turns)} turns)\n`);
    console.log('per model:');
    for (const [model, v] of [...r.perModel].sort((a, b) => b[1].read - a[1].read)) {
      const [read, write, out] = priceOf(model);
      const c = (v.read * read + v.write * write + v.out * out) / 1e6;
      console.log(`  ${String(model).padEnd(20)} turns ${String(n(v.turns)).padStart(7)}   ~$${c.toFixed(0)}`);
    }
    console.log('\nwhat grew the context:');
    console.log('  tokens added   times     avg   after');
    for (const [source, v] of [...r.growth].sort((a, b) => b[1].tokens - a[1].tokens).slice(0, 12)) {
      console.log(`  ${String(n(v.tokens)).padStart(12)}${String(v.times).padStart(8)}${String(n(v.tokens / v.times)).padStart(8)}   ${source.slice(0, 46)}`);
    }
    const v = verdicts(r);
    if (v.length) console.log('\n' + v.map((x) => '  ! ' + x).join('\n'));
    console.log();
  }
} else {
  const days = Number(args[args.indexOf('--days') + 1]) || 7;
  if (!fs.existsSync(ROOT)) {
    console.error(`no transcripts at ${ROOT} — nothing to measure`);
    process.exit(1);
  }
  const files = [];
  for (const d of fs.readdirSync(ROOT)) {
    const dir = path.join(ROOT, d);
    let st;
    try { st = fs.statSync(dir); } catch { continue; }
    if (!st.isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.jsonl')) continue;
      const fp = path.join(dir, f);
      const fst = fs.statSync(fp);
      // Under half a megabyte a session cannot be expensive, and scanning it costs more than
      // the answer is worth.
      if (Date.now() - fst.mtimeMs < days * 864e5 && fst.size > 500e3) files.push([fp, d, fst.size]);
    }
  }
  files.sort((a, b) => b[2] - a[2]);
  const take = files.slice(0, 15);
  const rows = [];
  let total = 0;
  for (const [f, project] of take) {
    const r = await scan(f);
    total += r.cost;
    rows.push({ project, file: f, cost: r.cost, turns: r.turns, p50: r.p50, floor: r.floor });
  }
  if (asJson) {
    console.log(JSON.stringify({ days, scanned: files.length, total: Number(total.toFixed(2)), sessions: rows }, null, 2));
  } else {
    console.log(`\nlast ${days} days — ${files.length} sessions over 0.5MB, showing the 15 biggest\n`);
    console.log('     cost   turns   ctx p50   start  project');
    for (const r of rows) {
      console.log(`  $${String(r.cost.toFixed(0)).padStart(6)}${String(n(r.turns)).padStart(8)}${String(n(r.p50)).padStart(10)}${String(n(r.floor)).padStart(8)}  ${r.project.slice(0, 40)}`);
    }
    console.log(`\n  total for these 15: ~$${total.toFixed(0)}`);
    console.log(`\n  drill into one:  nexa-tokens <path-to.jsonl>`);
    console.log(`  transcripts are under ${ROOT}\n`);
  }
}

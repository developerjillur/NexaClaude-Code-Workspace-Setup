#!/usr/bin/env node
// Is the code graph describing code that still exists?
//
//   node scripts/graph-fresh.mjs            check the configured product code
//   node scripts/graph-fresh.mjs --json     machine-readable
//
// Exit 0 = the graph matches the tree. Exit 1 = it describes code that has changed.
//
// ── Why ──────────────────────────────────────────────────────────────────────
//
// The contract tells every agent to query the graph before reading files — rung 2 of the reuse
// ladder, and the largest avoidable context cost in a repo. That instruction is only safe
// while the graph is true.
//
// It was not. Measured 2026-07-29 on the project this workspace came from:
//
//   built_at_commit           HEAD          ← commit-fresh
//   source files in graph     61 of 61      ← complete
//   UNCOMMITTED source files  31            ← and the graph knows about none of them
//
// **A graph is built from commits, and this project's work lives uncommitted.** So the graph
// was simultaneously perfect by its own measure and wrong about half the tree — and
// `graphify explain` answers from it without hedging.
//
// That is the workspace's worst failure shape: not an error, a confident wrong answer. The
// same shape as a green suite that never caught anything, and it gets the same treatment —
// something that refuses.
//
// **This checks freshness, never correctness.** A graph can be perfectly current and still
// have extracted the wrong relationships. Nothing here can see that.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectRootFor, paths } from './hooks/roots.mjs';

// @rules absent, unreadable, no-commit-marker, dangling-commit, behind-head, uncommitted, not-indexed
//
// Declared from what the code emits, not from what seemed likely — the first attempt invented
// three ids that appear nowhere, and guard-coverage refused them as declared-but-not-emitted.
// A rule declared and never emitted is a coverage requirement satisfied by a fixture that can
// never fire, which is worse than no declaration at all.
// Two roots — see hooks/roots.mjs. This one is the PROJECT being checked, which is not
// where this script lives once the workspace ships as a plugin.
const { root: ROOT, trusted: ROOT_TRUSTED, source: ROOT_SOURCE } = projectRootFor(import.meta.url);
// Every plugin-written location comes from one module — see paths() in roots.mjs.
const P = paths(ROOT);
if (!ROOT_TRUSTED) {
  console.error(`no workspace found (looked from ${ROOT_SOURCE}). Run this inside a project, or set CLAUDE_PROJECT_DIR.`);
  process.exit(2);
}
const JSON_OUT = process.argv.includes('--json');

const git = (args, cwd) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return r.status === 0 ? (r.stdout ?? '').trim() : null;
};

/** Directories the workspace considers product code. */
function codeDirs() {
  try {
    const cfg = JSON.parse(fs.readFileSync(P.config, 'utf8'));
    const d = Array.isArray(cfg.codeDirs) ? cfg.codeDirs.filter((x) => typeof x === 'string' && x) : [];
    return d.length ? d : ['code'];
  } catch { return ['code']; }
}

const report = { checked: [], findings: [] };

for (const rel of codeDirs()) {
  const dir = path.resolve(ROOT, rel);
  if (!fs.existsSync(dir)) continue;

  const graphPath = path.join(dir, 'graphify-out', 'graph.json');
  if (!fs.existsSync(graphPath)) {
    report.findings.push({ dir: rel, kind: 'absent',
      detail: 'no graphify-out/graph.json — the contract tells agents to query a graph that is not there' });
    continue;
  }

  let g;
  try { g = JSON.parse(fs.readFileSync(graphPath, 'utf8')); }
  catch (e) { report.findings.push({ dir: rel, kind: 'unreadable', detail: String(e.message).slice(0, 120) }); continue; }

  const nodes = g.nodes ?? [];
  // `links`, not `edges` — reading the wrong key once made a complete graph look empty, and
  // "867 nodes, 0 edges" is a very convincing wrong finding.
  const links = g.links ?? g.edges ?? [];
  const at = g.built_at_commit ?? null;

  const entry = { dir: rel, nodes: nodes.length, links: links.length, built_at_commit: at };

  // 1 · does the recorded commit still exist, and how far behind is it?
  if (!at) {
    report.findings.push({ dir: rel, kind: 'no-commit-marker',
      detail: 'the graph records no built_at_commit, so its age cannot be judged at all' });
  } else if (git(['cat-file', '-e', `${at}^{commit}`], dir) === null) {
    report.findings.push({ dir: rel, kind: 'dangling-commit',
      detail: `built at ${at.slice(0, 12)}, which is not a commit in this repository` });
  } else {
    const behind = Number(git(['rev-list', '--count', `${at}..HEAD`], dir) ?? '0');
    entry.commitsBehind = behind;
    if (behind > 0) {
      const changed = (git(['diff', '--name-only', `${at}..HEAD`], dir) ?? '')
        .split('\n').filter((f) => /\.(js|mjs|cjs|ts|tsx|jsx|py|go|rs)$/.test(f));
      if (changed.length) {
        report.findings.push({ dir: rel, kind: 'behind-head',
          detail: `${behind} commit${behind === 1 ? '' : 's'} and ${changed.length} source file${changed.length === 1 ? '' : 's'} newer than the graph`,
          files: changed.slice(0, 8) });
      }
    }
  }

  // 2 · the one that actually bites — uncommitted work the graph cannot know about.
  const dirty = (git(['status', '--porcelain'], dir) ?? '')
    .split('\n').filter(Boolean)
    .map((l) => l.slice(3))
    .filter((f) => /\.(js|mjs|cjs|ts|tsx|jsx|py|go|rs)$/.test(f) && !path.basename(f).startsWith('._'));
  entry.uncommitted = dirty.length;
  if (dirty.length) {
    report.findings.push({ dir: rel, kind: 'uncommitted',
      detail: `${dirty.length} source file${dirty.length === 1 ? '' : 's'} changed but not committed — a graph is built from commits, so it knows about none of them`,
      files: dirty.slice(0, 8) });
  }

  // 3 · files on disk the graph never saw. Uses source_file, which is the key graphify writes.
  const known = new Set(nodes.map((n) => n.source_file ?? n.file ?? n.path).filter(Boolean));
  const onDisk = [];
  const walk = (d, depth = 0) => {
    if (depth > 3) return;
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'graphify-out') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      // Config files are not application source and no extractor indexes them. Counting
      // them as "absent from the graph" put a permanent, unfixable line in the report.
      else if (/\.(js|mjs|cjs)$/.test(e.name) && !/^(eslint|prettier|vite|rollup|webpack|babel|jest|vitest|tailwind|postcss)\.config\./.test(e.name)) {
        onDisk.push(path.relative(dir, p));
      }
    }
  };
  walk(dir);
  const absent = onDisk.filter((f) => !known.has(f));
  entry.filesOnDisk = onDisk.length;
  entry.filesAbsent = absent.length;
  if (absent.length) {
    report.findings.push({ dir: rel, kind: 'not-indexed',
      detail: `${absent.length} of ${onDisk.length} source files are not in the graph`,
      files: absent.slice(0, 8) });
  }

  report.checked.push(entry);
}

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.findings.length ? 1 : 0);
}

console.log('════════════════════════════════════════════════════════════════════════');
console.log('  GRAPH FRESHNESS');
console.log('════════════════════════════════════════════════════════════════════════\n');

if (!report.checked.length && !report.findings.length) {
  console.log('  No configured code directory exists yet — nothing to check.\n');
  process.exit(0);
}

for (const c of report.checked) {
  console.log(`  ${c.dir}: ${c.nodes} nodes, ${c.links} links` +
    (c.built_at_commit ? `, built at ${c.built_at_commit.slice(0, 12)}` : '') +
    (c.commitsBehind != null ? `, ${c.commitsBehind} commits behind` : ''));
}
console.log('');

if (!report.findings.length) {
  console.log('  ✅ The graph describes the code that is actually there.\n');
  console.log('  Freshness only. A current graph can still have extracted the wrong');
  console.log('  relationships, and nothing here can see that.\n');
  process.exit(0);
}

for (const f of report.findings) {
  console.log(`  ❌ [${f.kind}] ${f.dir} — ${f.detail}`);
  if (f.files?.length) console.log(`       ${f.files.join('\n       ')}`);
  console.log('');
}
console.log('  Rebuild it before trusting `graphify explain` — the contract sends every');
console.log('  agent there first, and a stale graph does not error. It answers.\n');
process.exit(1);

#!/usr/bin/env node
// Does the code do what the card says it does — or does it only look like it?
//
// This catches the failure the CI hygiene job cannot: work reported as finished that is a
// shell. A stub has no TODO in it. It has a signature, a doc comment, a plausible name, and a
// body that returns a constant. It passes lint, passes "no TODO/FIXME", and passes a test
// written against the same misunderstanding.
//
// The shapes below are not style opinions. Each is a way of writing code that LOOKS
// implemented and is not, and each is reported with the line so it can be argued with.
//
//   node scripts/depth-check.mjs <path...>          check named files or directories
//   node scripts/depth-check.mjs --changed          check what git says changed
//   node scripts/depth-check.mjs --json
//
// Exit 1 if anything is found. **Findings are not automatically defects** — a legitimately
// empty handler exists. The rule is that each one is either fixed or answered in the card,
// which is a different demand from "make the tool quiet".

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const useChanged = args.includes('--changed');
const targets = args.filter((a) => !a.startsWith('--'));

// ── the shapes ───────────────────────────────────────────────────────────────
//
// `test` gets (line, allLines, index) and returns a reason string, or null.
// @rules stub-return, empty-catch, not-implemented, placeholder-value, always-true-test, unused-param
//
// Six rules, one exit code. Two of them had no fixture at all until a kill audit deleted them
// and nothing went red — so each finding now prints the rule that produced it, and
// guard-coverage refuses a declared rule that no assertion names.
const RULES = [
  {
    id: 'stub-return',
    what: 'function body is a single constant return',
    // Matches `foo() { return null }` / `=> ({})` on one line, or a two-line body whose only
    // statement returns a bare literal. Deliberately narrow: a one-line getter that returns
    // `this.#x` is fine and must not fire.
    test: (l, all, i) => {
      const open = /(?:function\s+\w+\s*\([^)]*\)|\w+\s*\([^)]*\)|=>)\s*\{\s*$/.test(l);
      if (!open) return null;
      const body = (all[i + 1] ?? '').trim();
      const close = (all[i + 2] ?? '').trim();
      if (!/^\}/.test(close)) return null;
      if (/^return\s+(null|undefined|\{\}|\[\]|true|false|0|''|""|`` )\s*;?$/.test(body)) {
        return `returns \`${body}\` and nothing else`;
      }
      return null;
    },
  },
  {
    id: 'empty-catch',
    what: 'catch block swallows the error with no comment',
    // An empty catch with a comment saying why is a decision; without one it is a hidden
    // failure, and this project has already shipped one (an FTS syntax error swallowed as an
    // honest miss).
    // The first version of this rule matched any `catch (e) {` that opened at end of line —
    // which is nearly every catch ever written — and reported 52 findings of which ~0 were
    // real. A check that fires falsely gets deleted, so it now proves the block is EMPTY:
    // either closed on the same line, or the next non-blank line is the closing brace.
    test: (l, all, i) => {
      if (!/\bcatch\s*(?:\([^)]*\))?\s*\{/.test(l)) return null;
      if (/\/\/|\/\*/.test(l)) return null;                    // a comment is the explanation

      const after = l.slice(l.indexOf('catch'));
      const inline = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/.test(after);
      if (inline) return 'empty catch on one line, no comment saying why the error is safe to drop';

      if (!/\{\s*$/.test(l)) return null;                      // body starts on this line
      let j = i + 1;
      while (j < all.length && all[j].trim() === '') j++;
      if (/^\}/.test((all[j] ?? '').trim())) {
        return 'catch block is empty, no comment saying why the error is safe to drop';
      }
      return null;
    },
  },
  {
    id: 'not-implemented',
    what: 'explicitly unimplemented',
    test: (l) => (/throw new (Error|TypeError)\s*\(\s*['"`].*(not implemented|unimplemented|todo|coming soon)/i.test(l)
      ? 'throws "not implemented"' : null),
  },
  {
    id: 'placeholder-value',
    what: 'placeholder standing in for real data',
    test: (l) => (/=\s*['"`](tbd|todo|placeholder|changeme|xxx|foo|bar|lorem)['"`]/i.test(l)
      ? 'assigned a placeholder string' : null),
  },
  {
    id: 'always-true-test',
    what: 'assertion that cannot fail',
    // The one that makes a suite worthless while the count goes up.
    test: (l) => {
      if (!/\b(assert|check|expect|ok)\s*\(/.test(l)) return null;
      if (/\b(true|1\s*===\s*1|!!1)\s*[,)]/.test(l) && !/===|!==|>=|<=|\.test\(|includes\(/.test(l)) {
        return 'assertion is a constant — it cannot fail';
      }
      return null;
    },
  },
  {
    id: 'unused-param',
    what: 'handler ignores the input it was given',
    // A handler that takes `args` and never mentions it again is the classic pretend-handler.
    test: (l, all, i) => {
      const m = /(?:async\s+)?(?:function\s+)?(\w+)\s*\(\s*(\w+)\s*\)\s*\{\s*$/.exec(l);
      if (!m) return null;
      const [, fn, param] = m;
      // `if (x) {` and `while (x) {` match the same shape as `fn(x) {`. The first version of
      // this rule reported four of them as pretend-handlers, which is how a real signal gets
      // buried under noise nobody reads.
      if (['if', 'while', 'for', 'switch', 'catch', 'function', 'return', 'typeof', 'await'].includes(fn)) return null;
      if (param.startsWith('_') || ['e', 'err', 'error'].includes(param)) return null;
      let depth = 1;
      for (let j = i + 1; j < all.length && depth > 0; j++) {
        depth += (all[j].match(/\{/g) ?? []).length - (all[j].match(/\}/g) ?? []).length;
        if (new RegExp(`\\b${param}\\b`).test(all[j])) return null;
        if (j - i > 40) return null; // long body — too weak a signal to claim
      }
      return `\`${fn}\` never uses its parameter \`${param}\``;
    },
  },
];

// ── collecting files ─────────────────────────────────────────────────────────
function filesUnder(p) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      if (e.isDirectory()) walk(full);
      else if (/\.(js|mjs|cjs)$/.test(e.name)) out.push(full);
    }
  };
  const st = fs.existsSync(p) && fs.statSync(p);
  if (!st) return out;
  st.isDirectory() ? walk(p) : out.push(p);
  return out;
}

let files = [];
if (useChanged) {
  try {
    files = execSync('git diff --name-only HEAD', { encoding: 'utf8' })
      .split('\n').filter((f) => /\.(js|mjs|cjs)$/.test(f) && fs.existsSync(f));
  } catch { files = []; }
} else {
  files = targets.flatMap(filesUnder);
}

if (!files.length) {
  console.error('depth-check: nothing to check. Pass paths, or --changed with a dirty tree.');
  process.exit(0);
}

// ── run ──────────────────────────────────────────────────────────────────────
const findings = [];
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // a comment describing a stub is not one
    for (const rule of RULES) {
      const why = rule.test(line, lines, i);
      if (why) findings.push({ file: f, line: i + 1, rule: rule.id, what: rule.what, why, text: line.trim().slice(0, 90) });
    }
  });
}

if (asJson) {
  console.log(JSON.stringify({ files: files.length, findings }, null, 2));
  process.exit(findings.length ? 1 : 0);
}

console.log(`\n── depth-check · ${files.length} file${files.length === 1 ? '' : 's'} ──\n`);
if (!findings.length) {
  console.log('  ✅ Nothing that looks implemented but is not.\n');
  console.log('  What this cannot check: whether the thing that IS implemented is the thing');
  console.log('  the card asked for. That is the review, and it stays human.\n');
  process.exit(0);
}

const byRule = {};
for (const f of findings) (byRule[f.rule] ??= []).push(f);
for (const [rule, list] of Object.entries(byRule)) {
  console.log(`  [${list[0].rule}] ${list[0].what}  (${list.length})`);
  for (const f of list) console.log(`    ${f.file}:${f.line}  ${f.why}\n        ${f.text}`);
  console.log('');
}
console.log(`  ${findings.length} finding${findings.length === 1 ? '' : 's'}.\n`);
console.log('  These are not automatically defects — an empty handler can be correct.');
console.log('  Each one is either fixed, or answered in the card. Silencing the tool is not');
console.log('  one of the two options.\n');
process.exit(1);

#!/usr/bin/env node
// Every control that refuses must be tested in BOTH directions.
//
//   node scripts/guard-coverage.mjs          check every control
//   node scripts/guard-coverage.mjs --json   machine-readable
//
// Exit 0 = every control has both a refusal case and a silent case. Exit 1 = one does not.
//
// ── Why this is a gate and not a paragraph ───────────────────────────────────
//
// **Fifteen controls have been added to this workspace. Every one was wrong on its first
// version.** Not roughly — every one. And they were wrong in a pattern:
//
//   thirteen failed OPEN     they passed when they should have refused, and a passing check
//                            is indistinguishable from a correct one
//   the rest fired on the    which is how a guard gets switched off within a day, after
//   legitimate case          which the case it exists for goes straight through
//
// **Not one was found by the case it was built to catch.** Every single one was found by
// running the case it was supposed to stay SILENT on.
//
// That lesson has been written into `docs/LEARNED.md` three times. It kept happening anyway —
// including twice in one afternoon *while fixing a council's criticism that this workspace's
// controls only advise*. A guard against my own blind spot is worth more than a third
// paragraph about it.
//
// ── What it checks, and what it deliberately cannot ──────────────────────────
//
// It checks that the suite contains, for each control, at least one assertion that it REFUSES
// and at least one that it stays SILENT. It cannot check that those assertions are good ones,
// or that the silent case is the interesting silent case.
//
// **So this is a floor, not a ceiling** — and the floor is the thing that was missing fifteen
// times.

import fs from 'node:fs';
import path from 'node:path';
import { projectRootFor, codeDirs } from './hooks/roots.mjs';

// Two roots — see hooks/roots.mjs. This one is the PROJECT being checked, which is not
// where this script lives once the workspace ships as a plugin.
const { root: ROOT, trusted: ROOT_TRUSTED, source: ROOT_SOURCE } = projectRootFor(import.meta.url);
if (!ROOT_TRUSTED) {
  console.error(`no workspace found (looked from ${ROOT_SOURCE}). Run this inside a project, or set CLAUDE_PROJECT_DIR.`);
  process.exit(2);
}
const JSON_OUT = process.argv.includes('--json');

// ── per-RULE coverage, for controls that declare their rules ─────────────────
//
// Counting by control NAME is what let a **prose comment** stand in as coverage for the secret
// scanner: the string "scan-secrets" appeared in a comment inside another control's block, and
// this file counted that block's assertions as its fixtures. It reported ✅ 1 refuse · 1 silent
// for a control with no test at all, whose entire git-history pass had never worked.
//
// A council named the repair, twice, independently:
//
//   "Make every refusal carry a rule id, and make fixtures assert the id, not the exit code.
//    It upgrades this from 'the control's NAME appears near assertion text' to 'every rule id
//    appears in at least one assertion', which is per-rule coverage."
//
// So a control opts in by declaring its rules on one line:
//
//   // @rules wip-limit, no-card-in-build, no-reuse-ladder, discard-uncommitted
//
// **Opt-in on purpose.** A control that has not declared rules still gets the old name-based
// check, so nothing fails open while this rolls out — and every control that DOES declare
// immediately owes a fixture naming each id. Undeclared is visible in the report rather than
// silently equivalent.
//
// Two things are checked, and the second catches the drift the first cannot:
//   · every declared id appears in some assertion in tests/
//   · every declared id appears in the control's OWN source — a rule declared and never
//     emitted is a coverage requirement satisfied by a fixture that can never fire
// @rules untested, no-refusal, no-silent-case, rule-untested, rule-declared-not-emitted
//
// Declared late, and by hand, because the batch that declared the others skipped this file:
// it tested for `@rules` anywhere in the body and found the EXAMPLE in the comment above.
// A detector that cannot tell a declaration from a description of one — which is the same
// mistake, one level up, as counting a prose comment as coverage. The regex below anchors to
// the start of a line for exactly that reason, so the indented example never matched.
const declaredRules = (body) => {
  const m = /^\s*\/\/\s*@rules\s+(.+)$/m.exec(body);
  return m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
};

// ── which scripts are controls ───────────────────────────────────────────────
//
// A control is something that can REFUSE: exit 1 from a gate, exit 2 from a hook. Anything
// that only reports is not one, and demanding fixtures of it would be the false-positive
// direction this file exists to prevent.
//
// ── `scanned` is reported separately from `controls`, and the difference matters ──
//
// `check.mjs` used to print `✅ all 0 controls have a refusal case AND a silent case` — a green
// tick over an empty list. Two ways to reach zero, and they are opposites:
//
//   · **scanned 0 files** — the scanner is pointed at a tree that does not exist. Nothing was
//     verified, and the tick is a lie. This is what every adopted project produced, because
//     the directories below are THIS repository's layout, not theirs.
//   · **scanned N, found 0 controls** — a real tree with nothing in it that can refuse yet.
//     Legitimate for a new project, and not a failure.
//
// Returning only the second number made them indistinguishable, so the caller could not tell
// "nothing to check" from "could not look".
//
// ── WHERE it looks, which was the larger half of the bug ────────────────────
//
// The roots were the literal `['scripts', 'scripts/hooks']` — **this repository's own layout.**
// An adopted project has neither, so the scanner examined nothing, found nothing, and the
// caller printed a tick. The adopter's tenant check, their webhook signature verification and
// their amount validation carried no coverage obligation whatsoever, while the gate said they
// were covered.
//
// So the tree is chosen rather than assumed: the workspace's own `scripts/` when developing
// the plugin, and otherwise the product directories the project actually declared. `codeDirs`
// is the one place that answers "where is the product", and it is already load-bearing for
// `guard-edit`.
const SOURCE = /\.(jsx?|mjs|cjs|tsx?|mts|cts)$/;

function scanRoots() {
  const own = ['scripts', path.join('scripts', 'hooks')]
    .filter((d) => fs.existsSync(path.join(ROOT, d)));
  if (own.length) return own;
  return codeDirs(ROOT).dirs.filter((d) => fs.existsSync(path.join(ROOT, d)));
}

function controls() {
  const out = [];
  let scanned = 0;
  const roots = scanRoots();
  const walk = (dir, rel) => {
    // **Vendored code is tested upstream, and this repo forbids hand-editing it** (AGENTS.md §8
    // on `scripts/council/**`). The top-level-only scan used to miss it by accident; walking
    // recursively found it and demanded fixtures for 30 files nobody here may change. Skipped
    // by the marker that already records the provenance rather than by name, so a second
    // vendored tree needs no change here.
    if (fs.existsSync(path.join(dir, '.vendored-from'))) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const p = path.join(dir, e.name);
      const r = path.join(rel, e.name);
      if (e.isDirectory()) { walk(p, r); continue; }
      if (!SOURCE.test(e.name)) continue;
      if (fs.lstatSync(p).isSymbolicLink()) continue;      // fetched code is tested upstream
      scanned++;
      const body = fs.readFileSync(p, 'utf8');
      if (!/process\.exit\((?:1|2)\)/.test(body)) continue;
      out.push({ name: e.name.replace(SOURCE, ''), file: r, rules: declaredRules(body) });
    }
  };
  for (const dir of roots) walk(path.join(ROOT, dir), dir);
  out.scanned = scanned;
  out.roots = roots;
  // Nothing to scan at all — a project with no source tree yet. Distinct from a tree that was
  // scanned and held nothing, and from a scanner pointed at a directory that does not exist.
  out.noSourceTree = roots.length === 0;
  return out;
}

// ── the two directions, as they appear in a suite ────────────────────────────
//
// Matched on the assertion TEXT, because that is what a human reads and what an author
// controls. A suite that says `check('refuses X', …)` and `check('allows Y', …)` has stated
// both halves; one that only says `refuses` has tested a guard that might refuse everything.
const REFUSES = /\b(refuse[sd]?|block(s|ed|ing)?|reject(s|ed)?|stops?|fails?|must not|denied|exit 2|=== 2|status === 1)\b/i;
const SILENT = /\b(allow(s|ed)?|ignore[sd]?|silent|stays? quiet|says nothing|passes|permits?|untouched|no.?op|=== 0|exit 0)\b/i;

const suites = [];
const tdir = path.join(ROOT, 'tests');
if (fs.existsSync(tdir)) {
  for (const f of fs.readdirSync(tdir)) {
    if (!f.endsWith('.mjs') || f.startsWith('._')) continue;
    const p = path.join(tdir, f);
    if (fs.lstatSync(p).isSymbolicLink()) continue;
    suites.push({ name: f, body: fs.readFileSync(p, 'utf8') });
  }
}

/**
 * Assertions that mention a control, taken from the whole suite.
 *
 * Matching is by the control's own name, so a suite has to SAY which control it is testing.
 * That is a constraint on how tests are written, and a deliberate one: a fixture whose name
 * does not say what it covers is a fixture nobody can audit.
 */
function assertionsFor(name) {
  const lines = [];
  for (const s of suites) {
    const src = s.body;
    if (!src.includes(name)) continue;
    // The block a control is tested in: from where its name first appears, to the next
    // top-level banner comment. Crude, and enough — the alternative is parsing JS.
    let from = 0;
    while (true) {
      const i = src.indexOf(name, from);
      if (i === -1) break;
      const end = src.indexOf('\n// ──', i);
      // Any call carrying a descriptive string, not only `check(` — the first version looked
      // for `check(` alone and reported graph-fresh as having no refusal assertions when it
      // had five, written through a local `once(opts, want, why)` helper. **Sixteenth control
      // here wrong on its first version, and it is the one built to catch that.** A suite is
      // allowed to name its own helpers; a coverage check that only recognises one spelling
      // is measuring style, not coverage.
      // Two shapes, because a suite writes assertions both ways and counting only one of
      // them measures style rather than coverage:
      //   check(...)                       the plain form
      //   once(opts, want, 'a long why')   a local helper, which graph-fresh uses
      // The first version required a quoted string of 12+ characters, which missed
      // `check('refuses ' + why, fire(x) === 2)` — the string there is nine characters and
      // the description lives in a loop variable. guard-wakeup read as having no refusal
      // assertions when it has five.
      lines.push(...src.slice(i, end === -1 ? src.length : end)
        .split('\n')
        .filter((l) => /\bcheck\s*\(/.test(l) || /\w+\s*\([^)]*['"][^'"]{12,}['"]/.test(l)));
      from = i + name.length;
      if (lines.length > 400) break;
    }
  }
  return [...new Set(lines)];
}

const found = controls();
const report = {
  controls: [],
  findings: [],
  // How much was actually looked at, so a caller can tell "nothing to check" from "could not
  // look". See the comment on controls().
  scanned: found.scanned,
  roots: found.roots,
  noSourceTree: found.noSourceTree,
};
for (const c of found) {
  const asserts = assertionsFor(c.name);
  const refuses = asserts.filter((l) => REFUSES.test(l)).length;
  const silent = asserts.filter((l) => SILENT.test(l)).length;
  report.controls.push({ ...c, assertions: asserts.length, refuses, silent });

  if (!asserts.length) {
    report.findings.push({ name: c.name, kind: 'untested',
      detail: 'nothing in tests/ names this control at all' });
  } else if (!refuses) {
    report.findings.push({ name: c.name, kind: 'no-refusal',
      detail: `${asserts.length} assertions, none showing it REFUSE — a control nobody has watched fire is not a control` });
  } else if (!silent) {
    report.findings.push({ name: c.name, kind: 'no-silent-case',
      detail: `${refuses} refusal assertions, none showing it stay SILENT — this is the direction all fifteen defects came from` });
  }

  // ── and then, per rule, for controls that have opted in ────────────────────
  //
  // Everything above is about the CONTROL. This is about each rule inside it — the level at
  // which the confounding actually happens, where a fixture tripping two rules proves neither
  // and either can be deleted in silence.
  const allTests = suites.map((s) => s.body).join('\n');
  for (const id of c.rules) {
    // Searched as a whole word so `wip-limit` is not satisfied by `wip-limits`, and outside
    // the control's own file so a control cannot cover itself.
    const word = new RegExp(`\\b${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if (!word.test(allTests)) {
      report.findings.push({ name: c.name, rule: id, kind: 'rule-untested',
        detail: `rule "${id}" is declared but no assertion in tests/ names it — the exit code cannot tell it from its siblings` });
    }
    // A rule declared and never emitted is worse than an undeclared one: the coverage
    // requirement is satisfied by a fixture that can never fire.
    if (!word.test(fs.readFileSync(path.join(ROOT, c.file), 'utf8').replace(/^\s*\/\/\s*@rules.+$/m, ''))) {
      report.findings.push({ name: c.name, rule: id, kind: 'rule-declared-not-emitted',
        detail: `rule "${id}" is declared in @rules but never appears in the control itself` });
    }
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.findings.length ? 1 : 0);
}

console.log('════════════════════════════════════════════════════════════════════════');
console.log('  GUARD COVERAGE — both directions, for everything that refuses');
console.log('════════════════════════════════════════════════════════════════════════\n');

const declaredCount = report.controls.filter((c) => c.rules.length).length;
for (const c of report.controls) {
  const flag = report.findings.find((f) => f.name === c.name);
  const rules = c.rules.length
    ? `· ${c.rules.length} rule${c.rules.length === 1 ? '' : 's'} named`
    : '·  by name only';
  console.log(`  ${flag ? '❌' : '✅'} ${c.name.padEnd(18)} ${String(c.refuses).padStart(3)} refuse · ${String(c.silent).padStart(3)} silent ${rules}`);
}
console.log(`\n  ${declaredCount} of ${report.controls.length} controls declare their rules (// @rules …).`);
console.log('  The rest are checked by NAME, which is the check that once read a prose comment');
console.log('  as coverage for the secret scanner. Declaring is how a control opts into being');
console.log('  measured per rule instead of per file.');

if (!report.findings.length) {
  console.log('\n  Every control has been watched refusing AND watched staying quiet.\n');
  console.log('  A floor, not a ceiling: this cannot tell whether the silent case chosen was');
  console.log('  the interesting one. It only refuses the shape that produced fifteen defects.\n');
  process.exit(0);
}

console.log('');
for (const f of report.findings) {
  console.log(`  ❌ ${f.name} — ${f.detail}`);
}
console.log('\n  Write the case it must IGNORE before the case it must catch. Fifteen controls');
console.log('  here were wrong on their first version, and not one was found the other way.\n');
process.exit(1);

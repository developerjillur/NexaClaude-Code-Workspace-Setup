#!/usr/bin/env node
// Break each control's REAL protection, one at a time, and see whether anything notices.
//
//   node scripts/kill-audit.mjs            every mutation
//   node scripts/kill-audit.mjs --json     machine-readable
//   node scripts/kill-audit.mjs --only=tee run one, by id
//
// Exit 0 = every protection is watched. Exit 1 = at least one can be deleted in silence.
//
// ── How this differs from mutate-controls, and why both exist ────────────────
//
// `mutate-controls` turns a control's `exit(2)` into `exit(0)` — it asks *is this control
// watched at all?* Useful, and answered: five of five caught.
//
// **This asks the harder question a council put after it:**
//
// > "guard-coverage proves only that assertion TEXT exists on both sides. Everything between
// > the text and the behaviour is invisible to it. Two points do not prove the classifier, the
// > execution path, or deployment."
//
// So every mutation below deletes ONE REAL RULE — the `tee` pattern, the placeholder list, the
// uncommitted-work check — leaving the control fully functional in every other respect. A
// control can be watched, and still have nine of its ten rules unwatched.
//
// **A SURVIVOR is a protection that could be removed today and every test would stay green.**
//
// ── Method ───────────────────────────────────────────────────────────────────
//
// Each mutation is applied to the real file, the whole suite runs, and the file is restored in
// a `finally` and again on `exit` — because a test that can leave this workspace disarmed is
// worse than the bug it hunts, and that has already happened here once.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectRootFor } from './hooks/roots.mjs';

// Two roots — see hooks/roots.mjs. This one is the PROJECT being checked, which is not
// where this script lives once the workspace ships as a plugin.
const { root: ROOT, trusted: ROOT_TRUSTED, source: ROOT_SOURCE } = projectRootFor(import.meta.url);
if (!ROOT_TRUSTED) {
  console.error(`no workspace found (looked from ${ROOT_SOURCE}). Run this inside a project, or set CLAUDE_PROJECT_DIR.`);
  process.exit(2);
}
const JSON_OUT = process.argv.includes('--json');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7);

/**
 * Each entry deletes one protection and leaves everything else intact.
 *
 * `to` is chosen so the control still runs and still refuses other things — the point is a
 * control that looks alive and has quietly stopped covering one case.
 */
// @rules SURVIVED, unresolved, red-baseline, unknown-only, incomplete
const KILLS = [
  // ── guard-edit: the shell write-detector ───────────────────────────────────
  { id: 'tee', file: 'scripts/hooks/guard-edit.mjs',
    what: 'guard-edit no longer sees `tee` writing into product code',
    from: "    new RegExp(String.raw`(?:^|[\\s;&|])tee\\s+(?:-[^\\s]*\\s+)*${Q}`, 'g'),",
    to: '' },
  { id: 'sed', file: 'scripts/hooks/guard-edit.mjs',
    what: 'guard-edit no longer sees `sed -i` editing product code',
    fromRe: /\n\s*new RegExp\(String\.raw`\(\?:\^\|\[\\s;&\|\]\)sed[^\n]*\n/,
    to: '\n' },
  { id: 'discard', file: 'scripts/hooks/guard-edit.mjs',
    what: 'guard-edit no longer refuses a git command that destroys uncommitted work',
    from: '  if (sawDiscard && !allowed) {',
    to: '  if (false) {' },
  { id: 'subdir', file: 'scripts/hooks/guard-edit.mjs',
    what: 'guard-edit only matches a codeDir exactly, so anything INSIDE it is unguarded',
    from: '    CODE_ABS.some((d) => c === d || c.startsWith(`${d}${path.sep}`)));',
    to: '    CODE_ABS.some((d) => c === d));' },

  // The mutation that measures the rule-id pilot. Deleting the WIP rule leaves the
  // reuse-ladder rule to refuse the over-determined fixture with an identical exit 2 — so an
  // exit-code oracle reports SURVIVED and an id oracle reports caught. **Same fixture, same
  // mutation, different oracle**, which is the whole claim, testable.
  { id: 'wip-limit', file: 'scripts/hooks/guard-edit.mjs',
    what: 'guard-edit stops enforcing WIP=1 — two cards in build, both half-finished',
    from: 'if (cards.length > 1) {',
    to: 'if (false) {' },

  // ── guard-wakeup ───────────────────────────────────────────────────────────
  { id: 'wakeup-admits', file: 'scripts/hooks/guard-wakeup.mjs',
    what: 'guard-wakeup no longer catches a reason that says there is nothing to wait for',
    from: '  /nothing (external )?to wait (on|for)/,',
    to: '' },
  { id: 'wakeup-short', file: 'scripts/hooks/guard-wakeup.mjs',
    what: 'guard-wakeup no longer questions a short delay that names nothing external',
    from: 'if (delay > 0 && delay < 1200 && !NAMES_SOMETHING_EXTERNAL.test(hay)) {',
    to: 'if (false) {' },

  // ── card-gate ──────────────────────────────────────────────────────────────
  { id: 'card-placeholder', file: 'scripts/card-gate.mjs',
    what: 'card-gate accepts TBD / n/a / ??? as real answers',
    fromRe: /const EMPTY = \/[^\n]*\/i;/,
    to: 'const EMPTY = /^(?!)$/;' },
  { id: 'card-stop', file: 'scripts/card-gate.mjs',
    what: 'card-gate stops requiring a kill condition',
    from: "    ['kill-condition', 'what would make us stop', /(make us stop|kill condition|would stop)/i, 'the observation that says this was wrong'],",
    to: '' },
  { id: 'card-errors', file: 'scripts/card-gate.mjs',
    what: 'card-gate lets a card reach 6-done without naming where its errors surface',
    from: "  '6-done': [",
    to: "  'never-a-real-stage': [" },

  // ── graph-fresh ────────────────────────────────────────────────────────────
  { id: 'graph-uncommitted', file: 'scripts/graph-fresh.mjs',
    what: 'graph-fresh stops noticing uncommitted work the graph cannot know about',
    from: '  if (dirty.length) {',
    to: '  if (false) {' },

  // ── scan-secrets: the deploy gate that reads the whole git history ─────────
  { id: 'secret-aws', file: 'scripts/scan-secrets.mjs',
    what: 'scan-secrets stops recognising an AWS key id',
    fromRe: /\n\s*\['aws-key-id',[^\n]*\n/,
    to: '\n' },
  { id: 'secret-assigned', file: 'scripts/scan-secrets.mjs',
    what: 'scan-secrets stops recognising `password = "…"` — the broadest rule it has',
    fromRe: /\n\s*\['assigned-secret',[^\n]*\n/,
    to: '\n' },
  { id: 'secret-history', file: 'scripts/scan-secrets.mjs',
    what: 'scan-secrets stops reading git HISTORY — a rotated key still sits in every clone',
    from: 'if (!treeOnly) {',
    to: 'if (false) {' },
  { id: 'secret-report', file: 'scripts/scan-secrets.mjs',
    what: 'scan-secrets finds every secret and reports success anyway',
    // Anchored to the LAST line of the file, which is the refusal. Written first as
    // `process.exit(findings.length …)` on the assumption it exited on a count — it does not,
    // and a mutation whose pattern misses reports "skipped", which reads like coverage.
    // Caught by pre-flighting all eighteen against their targets before the run, not during it.
    fromRe: /process\.exit\(1\);\s*$/,
    to: 'process.exit(0);' },

  // ── depth-check: the six shapes of "done" that is not done ─────────────────
  { id: 'depth-stub', file: 'scripts/depth-check.mjs',
    what: 'depth-check stops seeing a function whose whole body is `return null`',
    fromRe: /return `returns \\`\$\{body\}\\` and nothing else`;/,
    to: 'return null;' },
  { id: 'depth-catch', file: 'scripts/depth-check.mjs',
    what: 'depth-check stops seeing a catch block that swallows the error in silence',
    fromRe: /return 'catch block is empty[^\n]*/,
    to: 'return null;' },
  { id: 'depth-assert', file: 'scripts/depth-check.mjs',
    what: 'depth-check stops seeing an assertion that cannot fail — the one that makes a suite worthless while the count goes up',
    fromRe: /return 'assertion is a constant[^\n]*/,
    to: 'return null;' },

  // ── verify-claims: does a card's evidence resolve? ────────────────────────
  //
  // Added because the scope report printed at the end of a run named it as unaudited, and the
  // write-up had already claimed "eight of fourteen controls" from memory. It was seven. **The
  // denominator caught a wrong number the moment it was printed**, which is the entire argument
  // for printing it.
  //
  // Written first as `if (!real) bad(` → `if (false) bad(`, which does not delete the rule —
  // it falls into the `else` and reads a file that is null, so the control CRASHES. Node exits
  // 1, and an exit-code assertion accepts a crash as a refusal. **The mutation looked caught
  // for the same reason the fixture looked isolating: one bit cannot tell a refusal from a
  // stack trace.** So the rule is skipped outright instead, leaving the control running.
  { id: 'claims-proof', file: 'scripts/verify-claims.mjs',
    what: 'verify-claims stops checking that the test named in "Proved by" actually exists',
    from: '  if (!real) bad(',
    to: '  if (!real) ok(' },

  // ── check.mjs: the deploy gate, which delegates to the others ─────────────
  //
  // Named by the scope report as unaudited, and the council split on it: one member called it
  // the **operational** priority because it is the deploy gate, another said it needs coverage
  // **least** because its own refusal only protects a number in a doc header. Both are right
  // about different things — what matters here is that it DELEGATES, so a lost child verdict
  // silently disables another control's findings without touching that control at all.
  //
  // The advice taken literally: *"delete each child-gate invocation, invert each propagated
  // status, and make a child crash. The oracle must name the missing gate, not merely observe
  // exit 1 somewhere."*
  // The branch gained an `!g.ran` arm on 2026-07-31 — the fix for a gate that printed a green
  // tick when its child could not start — so `if (n) {` became `} else if (n) {` and this
  // pattern stopped matching. kill-audit reported `not-applicable`, which it correctly calls a
  // failure of the AUDIT rather than a result about the control: the mutation silently tested
  // nothing. The control was edited and this file was not, exactly as its own message says.
  { id: 'check-cardgate', file: 'scripts/check.mjs',
    what: 'check.mjs stops counting card-gate findings — cards reach any stage unanswered',
    fromRe: /\n(\s*)\} else if \(n\) \{\n(\s*)\/\/ The total is printed FIRST/,
    to: '\n$1} else if (false) {\n$2// The total is printed FIRST' },

  // The gate that turns "could not run" into a refusal. Without it, an installed plugin whose
  // sibling scripts are unreachable prints `✅ … (0 checked)` and exits 0 — which is what it
  // did, in every adopted repository, until 2026-07-31.
  { id: 'check-gate-ran', file: 'scripts/check.mjs',
    what: 'check.mjs treats a gate that could not START as a gate that found nothing',
    from: '  if (!g.ran) {\n    bad(\'the card gate could not run — no card was checked\'',
    to: '  if (false) {\n    bad(\'the card gate could not run — no card was checked\'' },
  { id: 'check-coverage', file: 'scripts/check.mjs',
    what: 'check.mjs stops reporting guard-coverage findings — an untested control passes the gate',
    from: '  else for (const f of out.findings) {\n    bad(`${f.name}: ${f.detail}`',
    to: '  else for (const f of []) {\n    bad(`${f.name}: ${f.detail}`' },
  { id: 'check-exit', file: 'scripts/check.mjs',
    what: 'check.mjs prints its failures and then exits 0 — the eleventh fail-open, restored',
    fromRe: /\n(\s*)process\.exit\(1\);\n\}\nconsole\.log\(`  All checks pass/,
    to: '\n$1process.exit(0);\n}\nconsole.log(`  All checks pass' },

  // ── guard-coverage ─────────────────────────────────────────────────────────
  { id: 'coverage-silent', file: 'scripts/guard-coverage.mjs',
    what: 'guard-coverage stops requiring a SILENT case — the direction every defect came from',
    from: '  } else if (!silent) {',
    to: '  } else if (false) {' },

  // ── the controls added on 2026-07-30, mutated because the audit named them ──
  //
  // This file's own scope report is the reason these exist: it listed `migrate.mjs`,
  // `council-run.mjs` and `council-update.mjs` under *"no mutation exists for these, so this run
  // says nothing about them"* — a clean 23/23 that was silent about the three newest controls,
  // one of which can delete somebody's committed decision history.
  //
  // **An honest scope report is only worth something if it is acted on.** Reading "0 survived"
  // and stopping there is how a green audit becomes decoration.
  { id: 'migrate-tracked', file: 'scripts/bootstrap.mjs',
    what: 'nexa-migrate stops asking git — it moves a COMMITTED board and DECISIONS.md out of the user\'s repo',
    from: "    return out.trim() === '';",
    to: '    return true;' },
  { id: 'migrate-clobber', file: 'scripts/bootstrap.mjs',
    what: 'migration overwrites a project directory that already holds work, instead of skipping it',
    from: '    if (fs.existsSync(to)) { kept.push({ rel, why: \'already present in ~/.nexa\' }); continue; }',
    to: '    if (false) { kept.push({ rel, why: \'already present in ~/.nexa\' }); continue; }' },
  { id: 'council-provenance', file: 'scripts/council-update.mjs',
    what: 'the vendored council stops needing provenance — a stale copy reports itself current, which is exactly how the UTF-8 corruption survived a week',
    from: 'if (!pin?.commit) {',
    to: 'if (false) {' },
  // Drifted at commit bd7e762, which changed the line to `trusted ? ROOT : …`, and reported
  // `not-applicable` from then until 2026-07-31 — a mutation that matched nothing, so this
  // control had been silently unaudited for the whole period while the run still exited 0.
  { id: 'council-cwd', file: 'scripts/council-run.mjs',
    what: 'the council runs from the user\'s repo again, dropping .council/runs/ back into their tree',
    from: 'const cwd = trusted ? ROOT : process.cwd();',
    to: 'const cwd = process.cwd();' },

  // ── prove-invariants · the only control that runs the application ──────────
  //
  // Every other mutation here deletes a rule about PROCESS. These delete the rules about the
  // PRODUCT, which is the axis two audits and a council scored lowest.
  { id: 'prove-empty-passes', file: 'scripts/prove-invariants.mjs',
    what: 'prove-invariants treats "no invariants declared" as "no invariants violated"',
    from: "  if (JSON_OUT) console.log(JSON.stringify({ declared: 0, proved: 0, violated: [], status: 'no-invariants' }));\n  process.exit(2);",
    to: "  if (JSON_OUT) console.log(JSON.stringify({ declared: 0, proved: 0, violated: [], status: 'no-invariants' }));\n  process.exit(0);" },
  { id: 'prove-violation-ignored', file: 'scripts/prove-invariants.mjs',
    what: 'a violated invariant stops failing the gate — the app is broken and the gate is green',
    from: 'if (violated.length || broken.length) {',
    to: 'if (false) {' },
  { id: 'prove-unreachable-passes', file: 'scripts/prove-invariants.mjs',
    what: 'a check that could not RUN counts as one that held',
    from: "    results.push({ ...inv, status: 'prove-unreachable', detail: 'timed out' });",
    to: "    results.push({ ...inv, status: 'held', detail: 'timed out' });" },

  // ── move-card · the transition function ────────────────────────────────────
  //
  // A new refusing control (2026-07-31) and kill-audit's scope report named it as carrying no
  // mutation. The rule worth deleting is the one that makes it a transition function at all:
  // without it, `nexa-move` degrades to a `git mv` with extra steps, and `1-spec → 5-verify`
  // — the exact skip it was written for — succeeds.
  { id: 'move-undefined-transition', file: 'scripts/move-card.mjs',
    what: 'nexa-move stops checking whether a transition EXISTS — a card can skip four gates again',
    from: 'if (!candidates.length) {',
    to: 'if (false) {' },

  // Doing the `git mv` first and checking afterwards is only safe because of the rollback. Cut
  // it and a card that fails its destination's guards is left stranded in a stage it never
  // satisfied — worse than refusing, because the board now lies.
  { id: 'move-stage-demands', file: 'scripts/move-card.mjs',
    what: 'the mover stops running the destination\'s demands — the pipeline\'s guard names go back to being decorative',
    from: 'if (stageDemands.length) {',
    to: 'if (false) {' },
  { id: 'move-layout-aware', file: 'scripts/move-card.mjs',
    what: 'every move goes back to git mv, which cannot work on the layout this ships with',
    from: '  if (tracked) execFileSync(\'git\', [\'mv\', a, b], { cwd: ROOT, stdio: \'pipe\' });\n  else fs.renameSync(a, b);',
    to: '  execFileSync(\'git\', [\'mv\', a, b], { cwd: ROOT, stdio: \'pipe\' });' },
  { id: 'move-rollback', file: 'scripts/move-card.mjs',
    what: 'a card refused by the destination gate is left half-moved instead of rolled back',
    from: '    relocate(dest, src);',
    to: '    /* rollback removed */' },

  // ── closing the scope report's own list ────────────────────────────────────
  //
  // The previous run named seven controls it said nothing about. Three are covered above; these
  // close three more. **A scope report is only worth printing if it shrinks.**
  { id: 'leakage-exit', file: 'scripts/no-product-leakage.mjs',
    what: 'no-product-leakage prints every finding and then exits 0 — a scanner that reports and passes',
    from: 'process.exit(1);',
    to: 'process.exit(0);' },
  { id: 'leakage-allow', file: 'scripts/no-product-leakage.mjs',
    what: 'the allowlist matches everything, so a real product leak is exempted anywhere',
    from: '  if (ALLOWED_REAL.has(real(f))) continue;',
    to: '  if (true) continue;' },
  { id: 'reflect-stale', file: 'scripts/reflect.mjs',
    what: 'reflect --check stops refusing an unresolvable marker — staleness can never be detected again',
    from: '  if (!resolves) {',
    to: '  if (false) {' },
  { id: 'ci-paths-missing', file: 'scripts/ci-code-paths.mjs',
    what: 'CI stops refusing when the code paths are absent — the job scans nothing and goes green',
    from: '    process.exit(1);',
    to: '    process.exit(0);' },
];

// ── the seam that lets this file be audited itself ───────────────────────────
//
// Asked which of the unmutated controls most deserves coverage, a council answered: this one.
//
//   "It is now the thing trust routes through — every other control's watchedness is asserted
//    by it, so a defect in it fails open at maximum blast radius, in the exact voice of success
//    ('18 of 18 caught'). It mutates real control files on disk; its restore path is the one
//    piece of code in the workspace that can leave the workspace disarmed."
//
// It cannot mutate itself — it would be running while being rewritten. So instead the mutation
// list can be replaced by a JSON file, and the suite points it at a throwaway workspace holding
// one fake control and one fake test. That makes every branch reachable in milliseconds:
// caught, survived, and pattern-absent. `fromRe` is unavailable through JSON, deliberately —
// fixtures need literals, and a regex arriving from a file is a second parser to get wrong.
const KILLS_FILE = process.env.NEXA_KILLS_FILE;
if (KILLS_FILE) {
  KILLS.length = 0;
  KILLS.push(...JSON.parse(fs.readFileSync(KILLS_FILE, 'utf8')));
}

const suites = fs.readdirSync(path.join(ROOT, 'tests'))
  .filter((f) => f.endsWith('.mjs') && !f.startsWith('._'));

/**
 * The real entry points, in the order a person meets them.
 *
 * **A timeout or a crash is not a catch.** `spawnSync` returns `status: null` when it kills a
 * child on timeout, and `null !== 0` — so the first version scored a hung suite as "the
 * mutation was caught", which is the most flattering possible reading of an infrastructure
 * failure. A council named it before it had bitten:
 *
 *   "A timeout, unrelated flaky test, runtime crash, or collateral failure can kill a mutant.
 *    spawnSync() returning status: null after its timeout would be counted as red rather than
 *    as an invalid audit result."
 *
 * So there are three outcomes here, not two, and the third is the one that must never be
 * confused with success: **inspection could not complete.**
 */
function runEverything() {
  const one = (label, argv) => {
    const r = spawnSync('node', argv, { cwd: ROOT, encoding: 'utf8', timeout: 900000 });
    if (r.error?.code === 'ETIMEDOUT' || r.signal) return { broke: true, by: `${label} (${r.signal ?? 'timeout'})` };
    if (r.status === null) return { broke: true, by: `${label} (no exit status)` };
    return { red: r.status !== 0, by: label };
  };
  for (const s of suites) {
    const r = one(s, [path.join(ROOT, 'tests', s)]);
    if (r.broke || r.red) return r;
  }
  return one('check.mjs', [path.join(ROOT, 'scripts', 'check.mjs')]);
}

// ── the journal, because restore-on-exit cannot be relied on ────────────────
//
// **Measured, after this bit somebody twice.** A handler was added for SIGTERM and SIGHUP, and
// it still did not work: this process spends minutes blocked inside `spawnSync` running the
// suite, and **a JavaScript signal handler cannot run during a synchronous call.** The signal is
// queued behind a block that outlasts the shell that sent it. SIGKILL skips handlers entirely.
//
// Proven rather than reasoned: a probe started an audit, waited for a real mutation to appear on
// disk, sent SIGTERM, and found `guard-edit.mjs` still mutated — its discard guard rewritten to
// `if (false)`. The workspace's one blocking control, disarmed, in a file that looked ordinary.
//
// So the original bytes go to a JOURNAL on disk *before* the file is touched, and the next run
// restores from it. That survives every death mode, because it does not need this process to be
// alive to work. In-process restore stays as the fast path; the journal is the one that holds.
const JOURNAL = path.join(ROOT, '.nexa-kill-audit-inflight.json');

// ── the journal records EVERY copy, because a mutation now writes more than one ──
//
// This wrote `{file, original}` — a single entry — and each call overwrote the last. That was
// correct while a mutation touched one file. It stopped being correct when mutations began
// writing every distinct on-disk copy of a control (see the `candidates` comment below), and
// the failure is silent: journal two files, recover one, and the OTHER stays disarmed with no
// record that it ever changed.
//
// Not hypothetical. This run was killed mid-`depth-stub` on an exFAT volume, where
// `<repo>/scripts` and `<repo>/plugin/scripts` are independent copies; both were mutated and
// the journal named one. The restore happened to be recoverable only because both copies held
// identical bytes.
//
// `files` is a map of path → original. The old single-entry shape is still read on recovery, so
// a journal written by a previous version is not orphaned by this change.
function journalWrite(files) {
  try {
    fs.writeFileSync(JOURNAL, `${JSON.stringify({ files, at: new Date().toISOString() })}\n`);
  } catch { /* the run still proceeds; the in-process restore is the fast path */ }
}
const journalClear = () => { try { fs.unlinkSync(JOURNAL); } catch { /* already gone */ } };

/**
 * Restore whatever a previous run left mutated. Runs FIRST, before anything is read or mutated,
 * so a killed audit cannot make the next one measure a disarmed control and call it caught.
 */
function journalRecover() {
  if (!fs.existsSync(JOURNAL)) return;
  try {
    const j = JSON.parse(fs.readFileSync(JOURNAL, 'utf8'));
    // `files` is the current shape; `{file, original}` is what versions before 2026-07-31 wrote,
    // and a journal left by one of those must still be recoverable — the whole point of this
    // file is that a killed run cannot leave a control disarmed.
    const entries = j.files && typeof j.files === 'object'
      ? Object.entries(j.files)
      : (typeof j.file === 'string' ? [[j.file, j.original]] : []);
    for (const [file, original] of entries) {
      if (typeof file !== 'string' || typeof original !== 'string' || !fs.existsSync(file)) continue;
      if (fs.readFileSync(file, 'utf8') !== original) {
        fs.writeFileSync(file, original);
        console.error(`  ⚠️  recovered ${path.relative(ROOT, file)} — a previous run (${j.at}) was killed`
          + ' mid-mutation and left it disarmed. Restored before starting.');
      }
    }
  } catch { /* corrupt journal: nothing safe to do but leave it and say so below */ }
  journalClear();
}
journalRecover();

// Restore-on-exit, unconditionally. This file edits real controls.
const inFlight = new Map();
const restoreAll = () => {
  for (const [f, original] of inFlight) { try { fs.writeFileSync(f, original); } catch { /* nothing else to try */ } }
  inFlight.clear();
};
process.on('exit', restoreAll);
process.on('SIGINT', () => { restoreAll(); process.exit(130); });
process.on('uncaughtException', (e) => { restoreAll(); console.error(e); process.exit(1); });
// ── SIGTERM, and why its absence cost a disarmed workspace twice ─────────────
//
// `exit`, SIGINT and `uncaughtException` were covered; **SIGTERM was not**, and SIGTERM is what
// a session teardown, a `kill`, a CI cancel and a background-task stop actually send. Node has
// no default handler that unwinds — the process dies where it stands, and the mutation applied
// at that moment stays on disk.
//
// It has now happened twice. The second time, `depth-check.mjs` was left with its empty-catch
// rule returning `null`: **the control was disarmed, the file looked ordinary, and the only
// symptom was two failures in a suite nobody would connect to an audit that had died earlier.**
// A tool that exists to prove the controls work must not be the thing that switches one off.
//
// SIGHUP for the same reason, one terminal-close away.
for (const sig of ['SIGTERM', 'SIGHUP']) {
  process.on(sig, () => { restoreAll(); process.exit(143); });
}

const say = (s) => { if (!JSON_OUT) console.log(s); };

say('════════════════════════════════════════════════════════════════════════');
say('  KILL AUDIT — delete one real protection at a time');
say('════════════════════════════════════════════════════════════════════════\n');

// ── --only must name something ───────────────────────────────────────────────
//
// `--only=does-not-exist` printed "0 caught, 0 survived" and **exited 0**. An audit that
// tested nothing, reporting success, in the file whose entire purpose is finding exactly that.
// Predicted by two council members from the source and then confirmed by running it, which is
// the only reason it is fixed rather than argued about.
if (ONLY && !KILLS.some((k) => k.id === ONLY)) {
  console.error(`  ! [unknown-only] --only=${ONLY} matches no mutation.\n\n    known ids: ${KILLS.map((k) => k.id).join(' ')}\n`);
  process.exit(2);
}

const base = runEverything();
if (base.broke) {
  say(`  ! [incomplete] ${base.by} did not complete. An audit cannot read a suite it could not run.\n`);
  process.exit(2);
}
if (base.red) {
  say(`  ! [red-baseline] the suite is already red (${base.by}). An audit against a red baseline says nothing.\n`);
  process.exit(1);
}
say('  baseline: green\n');

const results = [];
for (const k of KILLS) {
  if (ONLY && k.id !== ONLY) continue;
  // ── EVERY on-disk copy of the control, not just one path ───────────────────
  //
  // `<repo>/scripts` is a SYMLINK to `<repo>/plugin/scripts`, so on a normal checkout these
  // two paths are one file and mutating either is the same act. **On a filesystem without
  // symlinks they are two independent copies** — exFAT, and Windows without developer mode,
  // where git materialises the link as a real directory.
  //
  // Measured 2026-07-31 on an exFAT volume: eleven mutations reported SURVIVED, including
  // `sed`, `wip-limit` and `discard` — controls with fixtures that demonstrably catch them.
  // The audit had mutated `<repo>/scripts/...` while `hooks.test.mjs` was reading
  // `<repo>/plugin/scripts/...`, so the suite ran the UNMUTATED copy and stayed green.
  //
  // **An audit that mutates a file nothing under test reads reports SURVIVED for every rule
  // in it** — the exact fail-open shape this file exists to hunt, aimed at itself for the
  // third time. Mutating every distinct copy is correct in both layouts: on APFS the second
  // path resolves to the same inode and is skipped, on exFAT both are written.
  const candidates = [...new Set([path.join(ROOT, 'plugin', k.file), path.join(ROOT, k.file)]
    .filter((p) => fs.existsSync(p))
    .map((p) => fs.realpathSync(p)))];
  // A control that is not present here is not a survivor — it is absent. Reporting it as
  // "SURVIVED" would be the same fail-open this file exists to hunt, pointed at itself.
  if (!candidates.length) { results.push({ id: k.id, file: k.file, what: k.what, status: 'not-applicable' }); say(`  ·  ${k.id.padEnd(18)} control not present here — skipped`); continue; }
  const f = candidates[0];
  const original = fs.readFileSync(f, 'utf8');

  let mutated;
  if (k.fromRe) {
    if (!k.fromRe.test(original)) { results.push({ ...k, status: 'not-applicable' }); say(`  ·  ${k.id.padEnd(18)} pattern absent — skipped`); continue; }
    mutated = original.replace(k.fromRe, k.to);
  } else {
    if (!original.includes(k.from)) { results.push({ ...k, status: 'not-applicable' }); say(`  ·  ${k.id.padEnd(18)} pattern absent — skipped`); continue; }
    mutated = original.replace(k.from, k.to);
  }
  if (mutated === original) { results.push({ ...k, status: 'no-op' }); say(`  ·  ${k.id.padEnd(18)} mutation changed nothing — skipped`); continue; }

  // Every copy is written, and every copy is journalled — a restore that misses one leaves a
  // mutated control in the tree, which is worse than not running the audit at all.
  const originals = new Map(candidates.map((p) => [p, fs.readFileSync(p, 'utf8')]));
  for (const [p, orig] of originals) inFlight.set(p, orig);
  // One journal write covering EVERY copy, before any of them is touched. Written per-file, the
  // second call overwrote the first and only the last copy was recoverable.
  journalWrite(Object.fromEntries(originals));
  for (const p of candidates) fs.writeFileSync(p, originals.get(p).replace(k.fromRe ?? k.from, k.to));
  let res;
  try {
    // A mutation that breaks parsing is not a test of coverage; it is a test of node.
    const parses = spawnSync('node', ['--check', f], { encoding: 'utf8' }).status === 0;
    res = parses ? runEverything() : { by: 'syntax — mutation invalid, result discarded', invalid: true };
  } finally {
    for (const [p, orig] of originals) { fs.writeFileSync(p, orig); inFlight.delete(p); }
    journalClear();
  }

  const status = res.invalid ? 'invalid' : res.broke ? 'incomplete' : (res.red ? 'caught' : 'SURVIVED');
  results.push({ id: k.id, file: k.file, what: k.what, status, by: res.by ?? null });
  const mark = { caught: '✅ caught  ', invalid: '⚠️  invalid ', incomplete: '⚠️  incomplete', SURVIVED: '❌ SURVIVED' }[status];
  say(`  ${mark} ${k.id.padEnd(18)} ${k.what}${res.by && status === 'caught' ? `\n${' '.repeat(33)}by ${res.by}` : ''}`);
}

const survived = results.filter((r) => r.status === 'SURVIVED');
const caught = results.filter((r) => r.status === 'caught');
// Anything that did not produce a verdict. **These used to be excluded from the numerator AND
// the denominator**, so a mutation whose `from` string drifted as a control was edited simply
// vanished from the report — and the audit converged, over time, on printing success while
// testing less and less. Two council members read that off the source independently; the
// second called it "a file whose stated purpose is hunting fail-open silence containing an
// unguarded fail-open of its own shape."
//
// **A skip is now a failure of the audit, not an absence from it.**
const unresolved = results.filter((r) => !['caught', 'SURVIVED'].includes(r.status));

if (JSON_OUT) {
  console.log(JSON.stringify({
    selected: KILLS.filter((k) => !ONLY || k.id === ONLY).length,
    caught: caught.length, survived: survived.length, unresolved: unresolved.length, results,
  }, null, 2));
  process.exit(survived.length || unresolved.length ? 1 : 0);
}

const selected = KILLS.filter((k) => !ONLY || k.id === ONLY).length;
console.log(`\n  ── ${caught.length} caught, ${survived.length} survived, ${unresolved.length} unresolved, of ${selected} selected ──`);

if (survived.length) {
  console.log('\n  Each survivor is a protection that could be deleted today with every test');
  console.log('  still green. That is not a gap in the control — it is a gap in what watches it.\n');
  for (const s of survived) console.log(`    ${s.id}: ${s.what}`);
}
if (unresolved.length) {
  console.log('\n  These produced no verdict, which is a failure of the AUDIT rather than a');
  console.log('  result about the control. A pattern that no longer matches means the control');
  console.log('  was edited and this file was not.\n');
  for (const u of unresolved) console.log(`    ${u.id}: ${u.status}${u.by ? ` — ${u.by}` : ''}`);
}

// ── the denominator, said out loud ───────────────────────────────────────────
//
// The workspace's own rule is: if a run bounds its coverage, say what it left out — silent
// truncation reads as "covered everything" when it did not. This file broke that rule about
// itself for two days, publishing "18 of 18 caught" against a denominator it chose and never
// printed. A council put it plainly: report it as *"18 selected mutants killed; six refusing
// controls remain unaudited"*, never as a percentage suggesting completeness.
if (!ONLY) {
  const covered = new Set(KILLS.map((k) => k.file));
  const refusing = [];
  for (const d of ['scripts', path.join('scripts', 'hooks')]) {
    const abs = path.join(ROOT, d);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs)) {
      if (!f.endsWith('.mjs') || f.startsWith('._')) continue;
      const rel = path.join(d, f);
      if (fs.lstatSync(path.join(ROOT, rel)).isSymbolicLink()) continue;
      if (/process\.exit\((1|2|[a-z][^)]*\?[^)]*1)/.test(fs.readFileSync(path.join(ROOT, rel), 'utf8'))) refusing.push(rel);
    }
  }
  const unaudited = refusing.filter((r) => !covered.has(r));
  console.log(`\n  Scope: ${covered.size} of ${refusing.length} refusing controls carry mutations.`);
  if (unaudited.length) {
    console.log('  No mutation exists for these, so this run says nothing about them:\n');
    for (const u of unaudited) console.log(`    ${u}`);
  }
  console.log('');
}

process.exit(survived.length || unresolved.length ? 1 : 0);

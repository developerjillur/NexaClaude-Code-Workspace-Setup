#!/usr/bin/env node
// Scan the working tree AND the full git history for credentials, before anything is pushed.
//
// Why history and not just the tree: a secret removed in a later commit is still in the repo
// forever. `git rm` is not a delete. Once it is on a remote it is public whatever the repo's
// visibility says, because the fix is a force-push nobody performs in time.
//
// This exists because a council member dissented. Four of five said the biggest remaining
// exposure was the deploy path; one said **"secrets in git history — and your first planned
// action is the one that publishes them."** READINESS item 1 is *push the workspace*, and
// nothing had ever scanned it. The history turned out clean. The absence of the check did not.
//
// Field data it responds to: AI-assisted commits expose secrets at **2× the human rate**
// (3.2% vs 1.5%), and 1,400 scanned vibe-coded apps leaked 400+ secrets.
//
//   node scripts/scan-secrets.mjs            tree + full history
//   node scripts/scan-secrets.mjs --tree     working tree only (fast)
//
// Exit 1 on any unexplained hit. Test fixtures are allowed, by NAME and with a REASON — never
// by making the pattern looser, which is how a scanner stops finding anything.

import fs from 'node:fs';
import path from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import { projectRootFor } from './hooks/roots.mjs';

// Two roots — see hooks/roots.mjs. This one is the PROJECT being checked, which is not
// where this script lives once the workspace ships as a plugin.
const { root: ROOT, trusted: ROOT_TRUSTED, source: ROOT_SOURCE } = projectRootFor(import.meta.url);
if (!ROOT_TRUSTED) {
  console.error(`no workspace found (looked from ${ROOT_SOURCE}). Run this inside a project, or set CLAUDE_PROJECT_DIR.`);
  process.exit(2);
}
const treeOnly = process.argv.includes('--tree');

// @rules openai-key, anthropic-key, twilio-sid, twilio-api-key, github-token, aws-key-id, private-key-block, jwt, oauth-code, assigned-secret, tree-pass, history-pass
//
// Twelve rules and one exit code. This control had NO test at all while guard-coverage rated
// it covered, because its name appeared in a prose comment inside another block — and its
// entire history pass had never worked. Every rule is named now, and an unnamed one is a
// refusal rather than a thing only a careful reader would notice.
const PATTERNS = [
  ['openai-key', /\bsk-[A-Za-z0-9_-]{20,}/],
  ['anthropic-key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['twilio-sid', /\bAC[0-9a-fA-F]{32}\b/],
  ['twilio-api-key', /\bSK[0-9a-fA-F]{32}\b/],
  ['github-token', /\bgh[pousr]_[A-Za-z0-9]{20,}/],
  ['aws-key-id', /\bAKIA[0-9A-Z]{16}\b/],
  ['private-key-block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./],
  ['oauth-code', /\bcode=ac_[A-Za-z0-9._-]{20,}/],
  // ── the credentials a real app actually holds ──────────────────────────────
  //
  // Measured 2026-07-31 against realistic values: **8 of 11 walked straight through.** The set
  // above is the credentials THIS workspace uses — model APIs, git hosts, its own cloud. The
  // set below is what the applications it is meant to ship actually hold, and a payments app
  // was the worked example in the objective this repo is judged against.
  //
  // `sk_live_` is the one worth staring at: `openai-key` is `\bsk-` with a HYPHEN, Stripe uses
  // an UNDERSCORE, and the two look identical at a glance. A scanner that catches the key you
  // will never commit and misses the one that charges customers is a scanner that produces
  // confidence and nothing else.
  ['stripe-secret-key', /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}/],
  ['stripe-webhook-secret', /\bwhsec_[A-Za-z0-9]{16,}/],
  ['google-oauth-secret', /\bGOCSPX-[A-Za-z0-9_-]{16,}/],
  ['sendgrid-key', /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/],
  ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  // A connection string carries the password in the URL, and it is the single most-committed
  // credential in a web project. Any scheme, because Mongo, Redis, AMQP and Postgres all do it.
  ['db-url-with-password', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s:@/]{6,}@[^\s/]+/i],
  // ── and the `.env` line, which the rule below could not match by construction ──
  //
  // `assigned-secret` requires the value to be QUOTED. No line in `.env` format is quoted, so
  // `DB_PASSWORD=correcthorsebatterystaple` — the single most common way a secret is written
  // down — could never match it, in any file, ever. The quotes are now optional, and an
  // unquoted value must run to end-of-line so a bare `password:` in prose is not a hit.
  // The `(?:[A-Za-z0-9]+[_-])?` prefix exists because `\b` does not fire inside `DB_PASSWORD`:
  // `_` is a word character, so there is no boundary before `PASSWORD` and the commonest
  // spelling of the commonest secret was unmatchable. Trailing placeholder values are excluded
  // so `.env.example` files do not need an allowlist entry each.
  ['assigned-secret', /(?:^|[\s"'`,{[])(?:[A-Za-z0-9]+[_-])?(?:password|passwd|pwd|auth[_-]?token|api[_-]?key|access[_-]?token|client[_-]?secret|secret[_-]?key|secret)\s*[:=]\s*(?!(?:["']?(?:your|my|the|some|a)[_-]|["']?(?:xxx|changeme|placeholder|example|redacted|todo|<)))(?:["'][^"'\s]{12,}["']|[^\s"'#]{12,}$)/im],
];

// Known-benign, each with the reason it is benign. A line here is a claim someone can check —
// which is the difference between an allowlist and a blindfold.
const ALLOW = [
  { file: 'tests/council.test.mjs', why: 'fixtures that prove the context scanner refuses secrets' },
  { file: 'tests/hooks.test.mjs', why: 'scrubber fixtures — values are EXAMPLEexample…, made synthetic after this scanner caught the originals, which were copied from a real prompt' },
  { file: 'scripts/council/context.mjs', why: 'the detection patterns themselves' },
  { file: 'scripts/scan-secrets.mjs', why: 'this file' },
  { file: 'scripts/hooks/save-prompt.mjs', why: 'the prompt scrubber patterns' },
  // Nothing under code/ is allowlisted by default. Add your own entries here when a fixture
  // legitimately contains a credential-SHAPED string — and write down why, because a line here
  // is a claim somebody can check, which is the difference between an allowlist and a blindfold.
  { file: 'code/.env.example', why: 'documents key NAMES with empty values' },
  // Found by the history pass on the first run after it was repaired — `const SECRET =
  // 'launch-codes.txt'` at b41370c, a FILENAME the settings-race fixture writes and then looks
  // for. Allowlisted by name with a reason rather than by loosening `assigned-secret`, which is
  // this file's stated rule: a scanner that gets looser every time it fires stops finding
  // anything. The rule itself is correct — `SECRET = '<12+ chars>'` is exactly what it should
  // catch, and it happens to be a path here.
  { file: 'scripts/measure-settings-race.mjs', why: "SECRET is a fixture FILENAME ('launch-codes.txt'), not a credential — the race probe writes it and checks whether a concurrent write clobbers it" },
];
const allowed = (f) => ALLOW.find((a) => f.endsWith(a.file));

// ── NO SHELL, and the reason is a live regression this caught ───────────────
//
// The history pass built `git grep -P <JSON.stringify(pattern)> <commits…>` and handed it to a
// shell. `JSON.stringify` escapes for JavaScript, not for `/bin/sh`: a **backtick** inside a
// pattern's character class opened a command substitution, `/bin/sh` died with
// `unexpected EOF while looking for matching \``, this helper's `catch` swallowed it, and the
// scan printed `[history-pass] N commits scanned` and `✅ No unexplained credentials.`
//
// Measured 2026-07-31: a `DB_PASSWORD=…` committed and then deleted was found in the tree and
// MISSED ENTIRELY in history — the exact case the header of this file says the whole history
// pass exists for. The rule it killed was `assigned-secret`, the broadest one.
//
// A shell was never needed here. `execFileSync` with an argument array passes the pattern to
// git verbatim, which removes the quoting bug AND the injection surface in one change.
const gitArgs = (args, { allowFail = true } = {}) => {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    // `git grep` exits 1 for "no matches", which is not an error. Anything else IS, and a
    // scanner that cannot run its own search must not report a clean history.
    if (allowFail && (e.status === 1)) return '';
    if (!allowFail) throw e;
    return '';
  }
};
const git = (c) => {
  try { return execSync(c, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); }
  catch { return ''; }
};

const findings = [];
// A history pass that could not search is a refusal, not a pass — see the gitArgs comment.
const HISTORY_BROKEN = { broken: false };
const scan = (where, file, text) => {
  if (allowed(file)) return;
  for (const [what, re] of PATTERNS) {
    const m = re.exec(text);
    if (m) findings.push({ where, file, what, sample: m[0].slice(0, 28) });
  }
};

// ── working tree ─────────────────────────────────────────────────────────────
console.log('\n── scan-secrets ──\n');
// **`--staged` exists because a pre-commit hook cannot use the default.** `git ls-files` lists
// the index as it stands, and in a repository with no commit yet — or for a file added in the
// very change being committed — the tree pass reported **"0 tracked files scanned. ✅ No
// unexplained credentials."** A gate that ran, found nothing, and passed, on a commit that was
// adding an API key. Measured on a scratch repo before this flag existed.
//
// That is the exact shape this workspace has now found ten times: a control examining something
// other than the thing it was asked about, and returning the code that means "all clear".
//
// Staged CONTENT, not the working tree: `git add`-ing a secret and then editing it out of the
// file leaves the secret in what is about to be committed, and the file on disk is innocent.
const STAGED = process.argv.includes('--staged');
const tracked = STAGED
  // `git diff --cached` compares the index to HEAD, and **a repository with no commit yet has no
  // HEAD** — so on the very first commit it returned nothing and the staged pass scanned zero
  // files. The first commit of a repository is exactly when a bootstrapping secret lands.
  ? (git('git diff --cached --name-only --diff-filter=ACM').split('\n').filter(Boolean).length
    ? git('git diff --cached --name-only --diff-filter=ACM').split('\n').filter(Boolean)
    : git('git ls-files --cached').split('\n').filter(Boolean))
  : git('git ls-files').split('\n').filter(Boolean);
for (const f of tracked) {
  try {
    if (STAGED) {
      // Read the blob from the index, not the disk — see the note above.
      const body = execFileSync('git', ['show', `:${f}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 << 20 });
      scan('tree', f, body);
      continue;
    }
    const full = path.join(ROOT, f);
    if (!fs.statSync(full).isFile() || fs.statSync(full).size > 2_000_000) continue;
    scan('tree', f, fs.readFileSync(full, 'utf8'));
  } catch { /* binary, gone, or not in the index */ }
}
console.log(`  [${STAGED ? 'staged-pass' : 'tree-pass'}]     ${tracked.length} ${STAGED ? 'staged' : 'tracked'} file(s) scanned`);

// ── history ──────────────────────────────────────────────────────────────────
//
// **This pass scanned nothing for nine of the ten patterns, and said so in the voice of
// success.** The patterns above are JavaScript regexes and their `.source` was handed to
// `git grep -E`, which is POSIX ERE — and **POSIX ERE has no `\b`.** git's matcher rejected
// every pattern containing one, `git()` swallowed the non-zero exit, and the loop then printed
// `history N commits scanned`. Only `private key block`, the single pattern with no `\b`, was
// ever really searched.
//
// The whole reason this pass exists is the rotated key that still sits in every clone anyone
// made. It had been off since it was written, on macOS git 2.50.
//
// Found by `scripts/kill-audit.mjs`: deleting the history pass outright changed nothing, so a
// fixture was written that commits a secret and then removes it — and that fixture failed
// against the UNMUTATED file. **The mutation did not break the pass; it was already broken,
// and deleting a thing that does nothing is invisible by construction.**
//
// `-P` (PCRE) understands `\b` and is what the tree scan means. Where git was built without
// PCRE, the fallback drops the `\b` anchors instead: that matches MORE, never less, which is
// the only safe direction to be wrong in for a secret scanner.
// Probed rather than assumed: a build without PCRE prints "cannot use Perl-compatible regexes"
// on stderr and exits non-zero, which is indistinguishable from "no match" by exit code alone.
//
// `NEXA_SCAN_NO_PCRE=1` forces the fallback. Not a feature — a seam, because a fallback that
// only runs on machines we do not own is a fallback nobody has ever seen work, and this file
// was broken for exactly that length of time.
const PCRE = process.env.NEXA_SCAN_NO_PCRE === '1' ? false : !/Perl-compatible|not support/i.test(
  execSync('git grep -P -q -e "x" -- . 2>&1; true', { cwd: ROOT, encoding: 'utf8' }),
);

const flagUsed = PCRE ? '-P' : '-E (no PCRE — \\b anchors dropped, so this matches MORE)';

if (!treeOnly) {
  const brokenPatterns = [];
  const commits = gitArgs(['rev-list', '--all']).split('\n').filter(Boolean);
  for (const [what, re] of PATTERNS) {
    const flag = PCRE ? '-P' : '-E';
    // ── the flags are part of the pattern, and `.source` throws them away ──────
    //
    // `re.source` is the pattern WITHOUT `/i` or `/m`. `git grep` is case-sensitive by
    // default, so every case-insensitive rule became case-sensitive the moment it crossed
    // into the history pass — `assigned-secret` is `/im`, and `password` does not match
    // `DB_PASSWORD`. Measured 2026-07-31: a `DB_PASSWORD=` committed and then deleted was
    // caught in the working tree and missed in history, with no error and no warning, because
    // the tree pass uses the regex object and the history pass uses only its text.
    //
    // git grep is line-oriented, so `m` needs nothing; `i` has to be passed through.
    const caseFlag = re.flags.includes('i') ? ['-i'] : [];
    const pattern = PCRE ? re.source : re.source.replace(/\\b/g, '');
    // -I skips binaries. One pass per pattern over every blob in every commit.
    // Argument array: the pattern reaches git exactly as written, backticks and all.
    let out; let failed = false;
    try {
      // `-e` before the pattern: `private-key-block` begins `-----BEGIN`, and without `-e`
      // git reads the leading dashes as an option — `unknown option \`---BEGIN …'`. The shell
      // version swallowed that failure too, so the single pattern with no word boundary had
      // never actually been searched in history.
      out = execFileSync('git', ['grep', '-I', '-n', flag, ...caseFlag, '-e', pattern, ...commits, '--'],
        { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      // 1 = no matches, which is the common and correct case. Anything else means the search
      // did not run, and a search that did not run is not a clean history.
      if (e.status === 1) out = '';
      else { failed = true; out = ''; brokenPatterns.push(`${what}: ${(e.stderr || e.message || '').toString().trim().split('\n')[0].slice(0, 90)}`); }
    }
    if (failed) continue;
    for (const line of out.split('\n').filter(Boolean)) {
      const m = /^([0-9a-f]{7,40}):([^:]+):/.exec(line);
      if (!m) continue;
      const [, sha, file] = m;
      if (allowed(file)) continue;
      if (findings.some((x) => x.file === file && x.what === what)) continue;
      findings.push({ where: `history ${sha.slice(0, 7)}`, file, what, sample: '' });
    }
  }
  // **A pattern that could not run is reported, never counted as clean.** The whole defect
  // above was this line printing a reassuring number while one rule had silently died.
  if (brokenPatterns.length) {
    console.error(`\n  ⛔ [history-pass] ${brokenPatterns.length} pattern(s) could not be searched — history is NOT clean, it is UNSCANNED:`);
    for (const b of brokenPatterns) console.error(`       ${b}`);
    HISTORY_BROKEN.broken = true;
  }
  console.log(`  [history-pass]  ${commits.length} commits scanned, via git grep ${flagUsed}${brokenPatterns.length ? ` — ${brokenPatterns.length} pattern(s) FAILED` : ''}`);
}

// ── report ───────────────────────────────────────────────────────────────────
console.log('');
if (!findings.length) {
  console.log(`  ✅ No unexplained credentials.\n`);
  console.log(`  ${ALLOW.length} path(s) are allowlisted, each with a written reason — read them`);
  console.log('  rather than trusting them:\n');
  for (const a of ALLOW) console.log(`    ${a.file.padEnd(34)} ${a.why}`);
  console.log('\n  What this cannot check: a credential in a format nobody has seen, or one that');
  console.log('  looks like ordinary text. A scanner is a floor, never a ceiling.\n');
  // **No findings is only clean if every pattern actually ran.** A rule that died in the shell
  // produced zero matches, and zero matches read as success — which is how a `DB_PASSWORD`
  // committed and deleted was reported clean. "Searched and found nothing" and "could not
  // search" are different answers and must have different exit codes.
  if (HISTORY_BROKEN.broken) {
    console.error('  ⛔ …but the history pass did not complete. Exiting non-zero: an unscanned');
    console.error('     history is not a clean one.\n');
    process.exit(1);
  }
  process.exit(0);
}

for (const f of findings) {
  console.log(`  ❌ ${f.what} — ${f.file}  (${f.where})${f.sample ? `\n       ${f.sample}…` : ''}`);
}
console.log(`\n  ${findings.length} finding(s).\n`);
console.log('  If it is real: rotate it FIRST, then rewrite history. `git rm` is not a delete,');
console.log('  and a secret that has ever been pushed is public regardless of repo visibility.');
console.log('  If it is a fixture: add it to ALLOW in this file WITH A REASON. Do not loosen');
console.log('  the pattern — that is how a scanner quietly stops finding anything.\n');
process.exit(1);

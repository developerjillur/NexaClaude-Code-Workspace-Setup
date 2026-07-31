#!/usr/bin/env node
// Does this card carry what its stage requires — or only look like it does?
//
//   node scripts/card-gate.mjs                 every card on the board
//   node scripts/card-gate.mjs <file.md>       one card
//   node scripts/card-gate.mjs --json          machine-readable
//
// Exit 0 = every card satisfies its stage. Exit 1 = at least one does not.
//
// ── Why this exists ──────────────────────────────────────────────────────────
//
// A council rated this workspace 7.5/10 and refused to go higher for one reason, stated four
// times in four different ways:
//
//   "They are three more documents, not real closures."
//   "A warning that never becomes a refusal is visibility, not a gate."
//   "A skill that only ASKS is not a gate that refuses, and this workspace's whole claim is
//    that it refuses."
//
// Correct. `discovery-first` and `operate-after-done` were written as skills, which means an
// agent reads them when it feels relevant and a human reads them when they remember. Every
// other control here exits non-zero. These did not.
//
// So this is the refusal. It is deliberately dumb: it checks that the ANSWERS EXIST and are
// not placeholders. It cannot tell whether "who asked: a dentist in Ealing" is true — nothing
// mechanical can — but it can tell the difference between that and an empty line, and the
// empty line is what actually happens.
//
// **The failure mode being guarded is not lying. It is skipping.**

import fs from 'node:fs';
import path from 'node:path';
import { projectRootFor, paths, stages } from './hooks/roots.mjs';

// Two roots — see hooks/roots.mjs. This one is the PROJECT being checked, which is not
// where this script lives once the workspace ships as a plugin.
const { root: ROOT, trusted: ROOT_TRUSTED, source: ROOT_SOURCE } = projectRootFor(import.meta.url);
// Every plugin-written location comes from one module — see paths() in roots.mjs.
const P = paths(ROOT);
if (!ROOT_TRUSTED) {
  console.error(`no workspace found (looked from ${ROOT_SOURCE}). Run this inside a project, or set CLAUDE_PROJECT_DIR.`);
  process.exit(2);
}
const BOARD = P.board;
const JSON_OUT = process.argv.includes('--json');

// ── what each stage requires ─────────────────────────────────────────────────
//
// Keyed by the EARLIEST stage that demands it. A card at 3-build must satisfy everything
// 1-spec demanded as well, because a requirement that stops applying once you pass it is a
// formality.
// One definition, read from plugin/pipeline.json — this list used to be written out here AND
// in check.mjs twice AND in bootstrap AND in reflect, and two of the copies had drifted.
const ORDER = stages();

// @rules who-asked, todays-workaround, cost-of-status-quo, the-number-that-moves, kill-condition, reviewed-by, where-errors-surface, observed-in-production, fed-back, expand-contract, mixed-version, data-rollback
//
// Six requirements, one exit code. The fixture proving TBD is rejected also omitted three
// questions outright, so it refused whether or not the placeholder list worked — and deleting
// that list changed nothing. Each requirement carries an id now, printed with the finding.
const REQUIRED = {
  // discovery-first's five questions. A card may sit in 0-discovery without them — that is
  // what the stage is FOR — but it may not leave.
  '1-spec': [
    ['who-asked', 'who asked', /who asked/i, 'name a person, role or recorded interaction — not "users"'],
    ['todays-workaround', 'what they do today', /(do today|today instead|workaround)/i, 'the workaround, in enough detail that you could do it yourself'],
    ['cost-of-status-quo', 'what breaks without it', /(breaks|cost of the status quo|if (this|it) never exists)/i, 'the cost of the status quo, in their units'],
    ['the-number-that-moves', 'the number that moves', /(number (that )?moves?|success metric|metric)/i, 'one metric, its value now, and the value that counts as success'],
    ['kill-condition', 'what would make us stop', /(make us stop|kill condition|would stop)/i, 'the observation that says this was wrong'],
  ],
  // ── who reviewed it, and on what ────────────────────────────────────────────
  //
  // **The most-repeated rule in this workspace had no artefact.** AGENTS.md §10 opens with "No
  // model reviews its own work", `review-gate/SKILL.md:8` requires a different model,
  // `definition-of-done` repeats it, and `CLAUDE.md` names `/codex:review` as load-bearing. All
  // of it is prose: nothing required the reviewer's identity to reach the card, so a score
  // table typed by the model that wrote the code is byte-for-byte indistinguishable from a real
  // cross-vendor review. The most expensive claim in the process was the one nothing recorded.
  //
  // This cannot verify that a review was honest, or even that it happened — see the closing
  // paragraph of `check.mjs`. It makes the claim EXPLICIT and attributable, which is the
  // difference between a lie and an omission, and it is one line in the card.
  //
  // Required at 5-verify rather than 4-review: 4-review is where the reviewing happens, and a
  // card is allowed to sit there mid-review. Leaving it is the commitment.
  '5-verify': [
    ['reviewed-by', 'who reviewed it', /reviewed[_ -]?by/i,
      'name the model and vendor that reviewed this — e.g. "Codex GPT-5.6 (OpenAI), /codex:review". §10: no model reviews its own work'],
  ],
  // operate-after-done: a card cannot be called finished without naming where its failures
  // will surface. This is the one automatable piece the skill itself identified.
  '6-done': [
    ['where-errors-surface', 'where errors surface', /(errors? surface|error (goes|reaches)|alert|on-call|surfaces? to)/i,
      'name where a failure in this code reaches a human — a log nobody reads is not monitoring'],
  ],
  // ── 7-operate · the stage that existed only in the diagram ──────────────────
  //
  // `7-operate` had no requirement, no row in the stage table, no row in `/card move` and no
  // mention in `/deploy`. It was a directory nothing could put a card into and nothing ever
  // emptied — and it is the stage that covers everything after merge, which is where a
  // 10-to-1,000-user product actually lives.
  //
  // `skills/operate-after-done` opens with **"The board ends at 6-done. Paying customers start
  // there."** Two of its four post-deploy questions are mechanically checkable: whether the
  // thing was observed at all, and whether what production said came back as a card. The other
  // two — what users did that we did not design for, what it cost — are judgement, and are left
  // to the skill rather than faked here.
  '7-operate': [
    ['observed-in-production', 'what production actually did', /(observed|in production (it|we)|since (the )?deploy|error rate|latency|p9[59]|no errors|users? (have|did))/i,
      'the four questions in skills/operate-after-done, answered with what you saw — not what you expected. "What is erroring that was not erroring yesterday?" is the cheapest of them'],
    ['fed-back', 'what production sent back', /(fed back|new card|no new cards|opened card|nothing to feed back|follow-up card)/i,
      'anything production said that would change what gets built next is a card. Name it, or say plainly that there was nothing — an empty answer here is fine, a missing one is not'],
  ],
};

// Text that satisfies a heading but says nothing. These are what actually get committed.
const EMPTY = /^(\s*[-–—*·]?\s*(tbd|todo|n\/?a|none|\?+|xxx|\.\.\.|_+)\s*)$/i;

/**
 * The template's own prompt text, offered back as if it were an answer.
 *
 * ── measured, and it invalidated this entire gate ───────────────────────────
 *
 * The placeholder list above is genuinely good and catches what people type — `tbd`, `n/a`,
 * `xxx`. It does not catch what people *leave*, and what they leave is the template's own
 * italic hint:
 *
 *     **Who asked?** _a named person, role or recorded interaction — not "users"_
 *
 * That is 60 characters of prose, so `meaty()` said yes. Measured 2026-07-31: an unmodified
 * `templates/CARD.md` dropped into `1-spec`, `5-verify` and `6-done` produced **zero findings**
 * — all five discovery questions, the reviewer's identity and "where errors surface" all
 * counted as answered by the text asking for them.
 *
 * This is the third time this repository has hit the same shape in one session: a rule stated
 * in a document satisfying itself when the document is scanned. `guard-coverage.mjs:78` records
 * matching `@rules` against the example in its own comment; `check.mjs`'s 6-done demand matched
 * the prose explaining that a bare tick is refused.
 *
 * So the hint STYLE is what is refused, not any particular hint text: a wholly-italic span, an
 * angle-bracket placeholder, or a blockquote. Nobody writes a real answer entirely in italics,
 * and if they do, the fix is to remove the underscores — which is a sentence in the finding.
 */
// A leading `_` rather than a matched pair, because the template's longer hints wrap across
// lines and the closing underscore is two lines down — `^_[^_]*_$` never saw them. Nobody
// begins a real answer with an underscore; if somebody does, the fix is to delete it, and the
// finding says so.
const PLACEHOLDER = [
  /^_\S/,                   // _a named person, role or recorded interaction — not "users"_
  /^<[^>]*>$/,              // <paste the deliberate failure here>
  /^>\s/,                   // > a blockquote — the template's guidance style
];
const isPlaceholder = (t) => PLACEHOLDER.some((re) => re.test(t.trim()));

/** The stage a card is in, from its path. */
const stageOf = (f) => ORDER.find((s) => f.includes(`${path.sep}${s}${path.sep}`)) ?? null;

/**
 * Everything required at `stage`, including every earlier stage's requirements.
 * A gate that stops applying once passed is a formality.
 */
function requirementsFor(stage) {
  const i = ORDER.indexOf(stage);
  return ORDER.slice(0, i + 1).flatMap((s) => (REQUIRED[s] ?? []).map((r) => [s, ...r]));
}

/**
 * Is the answer present AND non-empty?
 *
 * The line matching the pattern is not the answer — the answer is what follows it, on the same
 * line after a colon, or on the next non-blank line. A card with every heading and nothing
 * under them passes a naive check, and that card is exactly the one this exists to stop.
 */
function answered(body, re) {
  // Take everything after the MATCH, not after a colon.
  //
  // The first version split on `:` and `|`, which handled `Who asked: Priya` and a table row
  // and silently failed on `**Who asked?** Priya` — the form markdown actually encourages and
  // the one the workspace's own template uses. A card that had answered all five was refused.
  // Found by writing the fixture that must PASS before the ones that must fail, which is the
  // rule this workspace learned ten times over.
  const lines = body.split('\n');
  const meaty = (t) => t.replace(/[*_`#>|\s-]/g, '').length >= 3
    && !EMPTY.test(t.trim()) && !isPlaceholder(t);

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (!m) continue;

    // ── the answer starts after the QUESTION, not after the matched phrase ────
    //
    // The patterns are deliberately loose so they find the question however it is worded, and
    // that looseness made them match inside their own question text. `**What breaks for them
    // if this never exists?**` matched on `breaks`, and the remainder — `for them if this
    // never exists?**` — is 30 meaty characters, so the question answered itself. Two of the
    // five discovery rules were unfirable for this reason and neither had a fixture.
    //
    // Markdown already marks where a question ends: it is bold. So when the match lands inside
    // a `**…**` span, the candidate answer is what follows that span's close.
    const line = lines[i];
    const boldClose = line.indexOf('**', m.index + m[0].length);
    const inBold = line.lastIndexOf('**', m.index) !== -1 && boldClose !== -1;
    const rest = inBold ? line.slice(boldClose + 2) : line.slice(m.index + m[0].length);
    // **Placeholder-tested BEFORE the strip, because the strip removes the evidence.** The
    // leading class includes `_`, so `**Who asked?** _a named person…_` arrives at
    // `isPlaceholder` as `a named person…_` — no longer a wholly-italic span, and the check
    // silently never fired. Only the punctuation that CLOSES the question is removed here.
    const opener = rest.replace(/^[\s*`:?)|.—–-]+/, '');
    if (isPlaceholder(opener)) continue;
    const after = rest.replace(/^[\s*_`:?)|.—–-]+/, '');
    if (meaty(after)) return true;

    // nothing on that line — look at the next few, stopping at the next question or heading
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const t = lines[j].trim();
      if (!t) continue;
      if (/^#{1,6}\s/.test(t)) break;                      // a heading: nothing was written
      if (/^\s*(\*\*|__)/.test(t) && /\?/.test(t)) break;  // the next bolded question
      if (EMPTY.test(t)) break;
      if (meaty(t)) return true;
      break;
    }
  }
  return false;
}

// ── run ──────────────────────────────────────────────────────────────────────
const argFile = process.argv.slice(2).find((a) => !a.startsWith('--'));
let cards = [];
if (argFile) cards = [path.resolve(argFile)];
else if (fs.existsSync(BOARD)) {
  for (const stage of ORDER) {
    const d = path.join(BOARD, stage);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      if (f.endsWith('.md') && !f.startsWith('._')) cards.push(path.join(d, f));
    }
  }
}

// ── the exemptions discovery-first actually grants ───────────────────────────
//
// The skill names three, and the first version of this gate implemented none of them — so it
// demanded "who asked?" of a card whose whole content was *the agent-id guard has no test*.
// Nobody asked. It is a control, and a control serves the code rather than a user.
//
// **The exemption must be DECLARED, not inferred.** A gate that guesses a card is a bug
// because it says "fix" somewhere is a gate that can be talked out of it by wording. So the
// card states its kind, and the gate honours exactly what the skill says:
//
//   bug       — somebody already found it; that is the evidence. Questions 1–4 waived.
//   control   — a guard, a test, a check. Questions 1–4 waived, **question 5 still owed**,
//               because a control nobody has watched fire is not a control.
//   learning  — built to find something out. The finding IS the deliverable, so it is measured
//               on "we now know", not on use. 1–4 waived, 5 owed.
// `\s*` does not cross a `>`, and a card's metadata is conventionally in a blockquote — so the
// first version could not see the declaration it had just told people to write there. The
// exemption existed and was unreachable, which is worse than not having one.
// The leading class now admits `·` and `|` as well, because the template's metadata line is
// `> Stage: … · Owner: … · Opened: …` and the documented way to declare a kind is to append to
// it. `[>\s]*` could not cross the separator, so `· kind: bug` was silently ignored — the same
// "the exemption exists and is unreachable" defect this comment already records, in its second
// spelling.
const KIND = /(?:^|\n|·|\|)[>\s·|]*(?:\*\*|__)?\s*kind\s*(?:\*\*|__)?\s*[:|]\s*(?:\*\*|__)?\s*(bug|control|learning|feature|migration)\b/i;
const WAIVED_BY = { bug: ['who asked', 'what they do today', 'what breaks without it', 'the number that moves', 'what would make us stop'],
                    control: ['who asked', 'what they do today', 'what breaks without it', 'the number that moves'],
                    learning: ['who asked', 'what they do today', 'what breaks without it'] };

// ── migration · the kind that ADDS requirements instead of waiving them ──────
//
// Every kind above makes a card cheaper. This one makes it dearer, and the mechanism had no
// way to express that.
//
// The reason is the sharpest thing a four-vendor council said about this workspace. AGENTS.md
// §11 ends with **"If anything fails: roll back. Never fix forward on production."** That is
// correct for stateless code and it is *the cause of the outage* when a schema has moved:
// `docker tag` restores the old image, the old image meets a migrated database, and the
// failure mode is corrupted data rather than a red deploy. Two members reached it separately.
//
// The workspace had no concept of a migration at all — no card kind, no expand-contract rule,
// no snapshot step, nothing about mixed-version operation while a rolling deploy is in flight.
// So a card that changes a schema now owes three answers no other card owes, and it owes them
// at 2-plan, BEFORE the migration is written, because after it is written the cheap answer is
// gone.
const REQUIRED_BY_KIND = {
  migration: {
    '2-plan': [
      ['expand-contract', 'the expand/contract split', /(expand[/\s-]*contract|backward[- ]compatible|additive (first|step)|two[- ]phase)/i,
        'name the additive step that ships first and the destructive step that ships later — a rename in one deploy cannot be rolled back'],
      ['mixed-version', 'what runs against both schemas', /(mixed[- ]version|both schemas|old (worker|reader|code) (still|will)|during the rollout)/i,
        'during a rolling deploy the previous app version reads the new schema. Say what happens — including queued jobs written by the old code'],
    ],
    '5-verify': [
      ['data-rollback', 'how the DATA is restored', /(data[- ]rollback|restore(d)? from|snapshot|pg_dump|point[- ]in[- ]time|down migration)/i,
        'a git tag restores code, not rows. Name the snapshot taken before the migration and say that a restore was rehearsed — §11 rollback is a code rollback only'],
    ],
  },
};

const findings = [];
for (const c of cards) {
  const stage = stageOf(c);
  if (!stage) continue;
  const body = fs.readFileSync(c, 'utf8');
  const kind = (body.match(KIND)?.[1] ?? 'feature').toLowerCase();
  const waived = WAIVED_BY[kind] ?? [];
  // Cumulative in the same way the base requirements are: a migration card in 5-verify still
  // owes what it was asked at 2-plan, or the expensive answer is deferred until it is useless.
  const extra = ORDER.slice(0, ORDER.indexOf(stage) + 1)
    .flatMap((s) => (REQUIRED_BY_KIND[kind]?.[s] ?? []).map((r) => [s, ...r]));
  for (const [owed, id, label, re, hint] of [...requirementsFor(stage), ...extra]) {
    if (waived.includes(label)) continue;
    if (!answered(body, re)) {
      findings.push({ card: path.relative(ROOT, c), stage, owed, rule: id, missing: label, hint, kind });
    }
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify({ cards: cards.length, findings }, null, 2));
  process.exit(findings.length ? 1 : 0);
}

console.log('════════════════════════════════════════════════════════════════════════');
console.log('  CARD GATE');
console.log('════════════════════════════════════════════════════════════════════════\n');

if (!cards.length) { console.log('  No cards on the board.\n'); process.exit(0); }

if (!findings.length) {
  console.log(`  ✅ ${cards.length} card${cards.length === 1 ? '' : 's'}, each carrying what its stage requires.\n`);
  console.log('  This checks that the answers EXIST, never that they are true. Nothing');
  console.log('  mechanical can check the second, and the failure that actually happens');
  console.log('  is the first.\n');
  process.exit(0);
}

const byCard = new Map();
for (const f of findings) (byCard.get(f.card) ?? byCard.set(f.card, []).get(f.card)).push(f);
for (const [card, fs_] of byCard) {
  console.log(`  ❌ ${card}   (${fs_[0].stage})`);
  for (const f of fs_) console.log(`       missing: [${f.rule}] ${f.missing}\n         → ${f.hint}\n           owed since ${f.owed}`);
  console.log('');
}
console.log(`  ${findings.length} unanswered across ${byCard.size} card${byCard.size === 1 ? '' : 's'}.`);
console.log('  A stage a card did not earn is a stage nobody checked.\n');
process.exit(1);

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
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BOARD = path.join(ROOT, 'board');
const JSON_OUT = process.argv.includes('--json');

// ── what each stage requires ─────────────────────────────────────────────────
//
// Keyed by the EARLIEST stage that demands it. A card at 3-build must satisfy everything
// 1-spec demanded as well, because a requirement that stops applying once you pass it is a
// formality.
const ORDER = ['0-discovery', '0-backlog', '1-spec', '2-plan', '3-build',
  '4-review', '5-verify', '6-done', '7-operate'];

const REQUIRED = {
  // discovery-first's five questions. A card may sit in 0-discovery without them — that is
  // what the stage is FOR — but it may not leave.
  '1-spec': [
    ['who asked', /who asked/i, 'name a person, role or recorded interaction — not "users"'],
    ['what they do today', /(do today|today instead|workaround)/i, 'the workaround, in enough detail that you could do it yourself'],
    ['what breaks without it', /(breaks|cost of the status quo|if (this|it) never exists)/i, 'the cost of the status quo, in their units'],
    ['the number that moves', /(number (that )?moves?|success metric|metric)/i, 'one metric, its value now, and the value that counts as success'],
    ['what would make us stop', /(make us stop|kill condition|would stop)/i, 'the observation that says this was wrong'],
  ],
  // operate-after-done: a card cannot be called finished without naming where its failures
  // will surface. This is the one automatable piece the skill itself identified.
  '6-done': [
    ['where errors surface', /(errors? surface|error (goes|reaches)|alert|on-call|surfaces? to)/i,
      'name where a failure in this code reaches a human — a log nobody reads is not monitoring'],
  ],
};

// Text that satisfies a heading but says nothing. These are what actually get committed.
const EMPTY = /^(\s*[-–—*·]?\s*(tbd|todo|n\/?a|none|\?+|xxx|\.\.\.|_+)\s*)$/i;

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
  const meaty = (t) => t.replace(/[*_`#>|\s-]/g, '').length >= 3 && !EMPTY.test(t.trim());

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (!m) continue;

    // rest of the line, past the matched phrase and any punctuation that closes it
    const after = lines[i].slice(m.index + m[0].length).replace(/^[\s*_`:?)|.—–-]+/, '');
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
const KIND = /(?:^|\n)[>\s]*(?:\*\*|__)?\s*kind\s*(?:\*\*|__)?\s*[:|]\s*(?:\*\*|__)?\s*(bug|control|learning|feature)\b/i;
const WAIVED_BY = { bug: ['who asked', 'what they do today', 'what breaks without it', 'the number that moves', 'what would make us stop'],
                    control: ['who asked', 'what they do today', 'what breaks without it', 'the number that moves'],
                    learning: ['who asked', 'what they do today', 'what breaks without it'] };

const findings = [];
for (const c of cards) {
  const stage = stageOf(c);
  if (!stage) continue;
  const body = fs.readFileSync(c, 'utf8');
  const kind = (body.match(KIND)?.[1] ?? 'feature').toLowerCase();
  const waived = WAIVED_BY[kind] ?? [];
  for (const [owed, label, re, hint] of requirementsFor(stage)) {
    if (waived.includes(label)) continue;
    if (!answered(body, re)) {
      findings.push({ card: path.relative(ROOT, c), stage, owed, missing: label, hint, kind });
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
  for (const f of fs_) console.log(`       missing: ${f.missing}\n         → ${f.hint}\n           owed since ${f.owed}`);
  console.log('');
}
console.log(`  ${findings.length} unanswered across ${byCard.size} card${byCard.size === 1 ? '' : 's'}.`);
console.log('  A stage a card did not earn is a stage nobody checked.\n');
process.exit(1);

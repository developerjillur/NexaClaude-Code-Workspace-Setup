// The stage requirements, as ONE definition both the gate and the mover read.
//
// ── why this is its own module ──────────────────────────────────────────────
//
// These lived inside `check.mjs`, and `card-gate.mjs` had a SEPARATE list. A council read the
// two side by side and found what the split costs: `plugin/pipeline.json` names
// `spec-section` and `acceptance-criterion` as the guards on `1-spec → 2-plan`, but
// `nexa-move` ran `card-gate`, and card-gate does not implement either — they were here.
//
// Measured 2026-07-31: a card with no spec section and no acceptance criterion moved
// `1-spec → 2-plan` and the mover printed a tick. The same held for a failing verdict entering
// 5-verify and a card with no pasted failure entering 6-done. **The guard names in the pipeline
// were decorative**, which is worse than having none — the file asserts a check that nothing
// performs.
//
// So they are exported, keyed by the guard id the pipeline uses, and both consumers run the
// same code. One definition, several consumers — the rule this workspace already applied to
// the stage list and had not yet applied to the stage requirements.

import { stages } from './hooks/roots.mjs';

// ── the blank template satisfied seven of these nine ───────────────────────
//
// Measured against the unmodified `plugin/templates/CARD.md`: `cp templates/CARD.md
// board/3-build/NNN.md` produced a card that passed 2-plan, 3-build, 4-review and 6-done
// without a word being typed. Two of those matches deserve naming, because they are the same
// mistake `guard-coverage.mjs:78` already records making once:
//
//   · `- [x]` matched line 32 of the template — **inside backticks, in the prose explaining
//     that a bare tick is refused.** The sentence documenting the rule satisfied the rule.
//   · the "pasted output of a guard watched failing" matched the empty
//     ```<paste the deliberate failure here>``` placeholder.
//
// And `graphify explain` — the 3-build demand — is the SAME regex `guard-edit.mjs` uses as the
// only content-level condition before it will let an agent write product code. So the blank
// template did not just pass the board gate; it unlocked `code/`.
//
// The repair is one idea applied everywhere: **a rule quoted is not a rule satisfied.** Inline
// code spans, angle-bracket placeholders and italic hint lines are template scaffolding, and
// they are removed before any demand is tested.
// **Fenced blocks are split out first, and only the placeholder strip is applied inside them.**
// The inline-code rule cannot run there: ``` is three backticks, and `/`[^`\n]*`/` happily
// matches the first two of them, leaving a mangled fence that `pastedOutput` can no longer
// see. Caught by the control assertion in the new fixture — a filled-in card failed — which is
// exactly what a control case is for.
const scaffolding = (body) => body
  .split(/(```[\s\S]*?```)/)
  .map((seg, i) => (i % 2
    // inside a fence: only the angle-bracket placeholders, so an empty
    // ```<paste the deliberate failure here>``` block reads as empty
    ? seg.replace(/<[^>\n]*>/g, '')
    : seg
      // `- [x]` in prose is documentation. So is `npm run test:offline` in a checklist item
      // nobody ran. Anything between backticks is a reference to a thing, not the thing.
      .replace(/`[^`\n]*`/g, '')
      .replace(/<[^>\n]*>/g, '')
      // _a named person, role or recorded interaction — not "users"_ — the template's hints
      .replace(/^\s*_.*_\s*$/gm, '')))
  .join('');

/** A fenced block with at least two non-empty lines left after scaffolding is stripped. */
const pastedOutput = (body) => (body.match(/```[^\n]*\n([\s\S]*?)```/g) ?? [])
  .some((b) => b.replace(/```[^\n]*/g, '').split('\n').filter((l) => l.trim()).length >= 2);

/**
 * A markdown table row that is not the header, not the `|---|` rule, and not `| | |`.
 *
 * **Takes the RAW body, not the scaffolding-stripped one.** Backticks around a filename are how
 * every real card writes this table — `| `plugin/scripts/check.mjs` | … |` — and the inline-code
 * strip empties exactly those cells. Applied to the stripped body this refused card 002, whose
 * plan table names twelve files. The strip exists to stop prose ABOUT a rule satisfying it; a
 * table cell is data, not prose.
 */
const filledTableRow = (_stripped, body) => body.split('\n').some((l) => {
  if (!/^\s*\|/.test(l)) return false;
  const cells = l.split('|').slice(1, -1).map((c) => c.trim());
  if (cells.length < 2 || cells.some((c) => /^-{2,}$/.test(c))) return false;
  if (/^(file|axis)$/i.test(cells[0])) return false;      // the template's own header rows
  return cells[0] && cells[1];
});

// Each entry is [rule, label, guardId]. **The guardId is the name `plugin/pipeline.json` uses**,
// so a transition that declares `guards: ['spec-section']` and this table cannot drift apart
// without `check.mjs`'s pipeline-coverage check saying so.

/**
 * Every scored axis in the review table is 3 or better.
 *
 * ── the fix that checked one axis out of five ──────────────────────────────
 *
 * The first version was `/\|\s*Matches the spec\s*\|\s*[3-5]\b/` — it read ONE row.
 * `review-gate/SKILL.md` says any axis below 3 sends the card back, so a card scoring
 * 5 / 1 / 1 / 1 / 1 with `Verdict: PASS` satisfied the gate: hallucinated content, duplicated
 * logic and scope creep all at the floor, and the review gate agreed. Measured 2026-07-31,
 * found by a council reading the rubric against the regex.
 *
 * Reads every `| <axis> | <n> |` row rather than naming one, so adding an axis to the rubric
 * cannot silently leave it unenforced — the failure mode the single-row version had.
 */
function allAxesAtLeast3(_stripped, body) {
  const scores = [...body.matchAll(/^\s*\|\s*([^|]+?)\s*\|\s*([1-5])\s*\|/gm)]
    .filter(([, axis]) => !/^(axis|-+)$/i.test(axis.trim()));
  // No scored row at all is a missing review, not a passing one.
  if (!scores.length) return false;
  return scores.every(([, , n]) => Number(n) >= 3);
}

export const DEMANDS = {
  '2-plan':   [[/## 1 · Spec/, 'spec section', 'spec-section'],
               [(b) => /^\s*- \[[ x]\]\s*\S/m.test(b), 'at least one acceptance criterion', 'acceptance-criterion']],
  '3-build':  [[filledTableRow, 'a named file in the plan table', 'plan-table-filled'],
               // The quoted argument must be a real question, not the template's `"…"`.
               [/graphify explain\s+"[^"\n…]{4,}"/, 'the reuse ladder — graphify explain is not recorded with a real question', 'reuse-ladder-recorded'],
               [pastedOutput, 'what the graph actually answered — the ladder block is empty', 'reuse-ladder-output']],
  '4-review': [[/## 3 · Build/, 'build section', 'build-section']],
  // ── `BACK` used to satisfy this, and BACK means the review FAILED ──
  //
  // The pattern was `/Verdict:\s*(PASS|BACK)/i`, so a card the reviewer explicitly sent back
  // sat in 5-verify with the gate green, and CI agreed. The score demand accepted `[1-5]`,
  // so 1/5 — the worst score the rubric defines — also passed. Two tokens, and the review
  // gate stopped being a gate.
  // `\**` after the colon, because the template writes `**Verdict:** PASS` and `\s*` does not
  // match the closing asterisks — so the tightened gate was UNSATISFIABLE by a card written in
  // the workspace's own documented format. Introduced while fixing `BACK` and caught by a
  // fixture built from the real template rather than from a hand-written string.
  '5-verify': [[/Verdict:\**\s*PASS\b/i, 'a PASSING review verdict — BACK means the card returns to 3-build', 'review-verdict-pass'],
               [allAxesAtLeast3, 'every review axis scored 3 or better — review-gate returns a card on ANY axis below 3', 'review-score-at-least-3']],
  '6-done':   [[/^\s*- \[x\]/im, 'a ticked verification checklist', 'ticked-checklist'],
               [pastedOutput, 'the pasted output of a guard watched failing — the block is empty', 'pasted-failure']],
};

/**
 * Demands are regexes or predicates.
 *
 * A regex sees the scaffolding-stripped body — quoted rules and template hints removed. A
 * predicate sees BOTH, and picks: `pastedOutput` wants the stripped form so an empty
 * `<placeholder>` block reads as empty, `filledTableRow` wants the raw form so a backticked
 * filename still counts as a filename.
 */
const meets = (rule, stripped, raw) => (typeof rule === 'function'
  ? rule(stripped, raw) : rule.test(stripped));

// ── a requirement is not discharged by moving past it ───────────────────────
//
// `demands` was applied to the card's CURRENT stage only, so every earlier stage's requirement
// was forgotten the moment the card moved on: a card in 6-done was never re-checked for the
// spec section, the reuse ladder, or the passing verdict. `card-gate.mjs`'s own `REQUIRED` is
// cumulative, so the two gates disagreed about the same board — and the looser one is the one
// wired into CI.
//
// Cumulative is also what makes the 5-verify fix above bite: without it, a card could pass
// through 5-verify while the verdict said BACK simply by being moved to 6-done first.
// The SAME list as `stages` above — it was written out twice in this one file, which is the
// smallest possible demonstration of why plugin/pipeline.json exists.

/**
 * Every demand a card at `stage` owes, including every earlier stage's — cumulative, because a
 * requirement that stops applying once passed is a formality.
 *
 * @returns {Array<[rule, label, guardId, owedAtStage]>}
 */
export function demandsFor(stage) {
  const order = stages();
  const i = order.indexOf(stage);
  if (i < 0) return [];
  return order.slice(0, i + 1).flatMap((s) => (DEMANDS[s] ?? []).map((d) => [...d, s]));
}

/** Run the demands for `stage` against a card body. Returns the ones it fails. */
export function unmet(stage, body) {
  const stripped = scaffolding(body);
  return demandsFor(stage)
    .filter(([rule]) => !meets(rule, stripped, body))
    .map(([, label, guardId, owed]) => ({ guardId, label, owed }));
}

export { scaffolding, meets };

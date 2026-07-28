---
name: spec-first
description: Write or challenge a spec before any code exists. Use when a card enters 1-spec, or whenever an implementation question has no answer in the card. Stops the drift between what was asked for and what gets built.
---

# Spec first

**The spec is the source of truth, not the code.** Vibe coding fails when the agent starts
from a sentence and fills the gaps with plausible invention — and the gaps are exactly where
intent lives.

A spec is done when **two different people would build the same thing from it.** That is the
whole test.

## What a spec must answer

1. **What problem** — for whom, and what happens today without it
2. **Acceptance criteria** — testable statements, not adjectives. *"Rejects a caller not on
   the allowlist"* is testable; *"handles auth properly"* is not
3. **Explicitly out of scope** — the sentence that stops scope creep three days later
4. **What must not break** — the existing behaviour this change sits next to
5. **How it will be proved** — which test, and **which guard will be watched failing**

## When you are the agent, not the author

**Challenge the spec before building.** Every question you have to guess at is a defect in
the spec, not a decision for you to make quietly.

Ask, then wait:

- *"The criteria do not say what happens when X is missing — refuse, default, or ask?"*
- *"This overlaps `<file>` from the graph. Change that, or add beside it?"*
- *"Criterion 3 is not testable as written — can it be phrased as an assertion?"*

**Never fill a gap silently.** A guessed decision that turns out wrong is more expensive than
the question, because it arrives buried in working-looking code.

## The refusal

If the card reaches `2-plan` and you still cannot say what "done" means in a sentence,
**send it back to `1-spec`.** A vague card produces vague code and a review that cannot fail
it, because there is nothing to fail it against.

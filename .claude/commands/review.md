---
description: Send the card in 4-review to the reviewer subagent and paste its scores back
---

Run the review gate on the card in `board/4-review/`.

1. Find it. If `4-review` is empty, say so and stop.
2. **Two independent reviews, because they catch different things:**

   **a. The `reviewer` subagent** — scores the five axes against the card's spec. Its own
   context, so it cannot inherit the builder's assumptions.

   **b. Codex** — `/codex:review`, or `/codex:adversarial-review` for anything
   security-shaped. **A different vendor's model, so it does not share Claude's priors** —
   and it is the model that implements here, so what confuses it is what matters.

   Where they disagree, that disagreement is the most valuable output of the whole gate.
   Record both verdicts; do not average them.
3. Paste its table verbatim into the card's `## 4 · Review`. **Do not edit its scores.**
4. Then run the **security gate** yourself (`skills/security-gate`) — seven checks, one line
   each. It is separate from the review score and cannot be traded against it.
5. **Verdict:**
   - any axis below 3 → `git mv` the card back to `3-build`, with the reason
   - PASS → move to `5-verify`

If you built the code in this session, **you may not also be the reviewer.** Use the subagent.

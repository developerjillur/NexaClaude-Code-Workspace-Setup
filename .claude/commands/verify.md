---
description: Run the definition of done on the card in 5-verify, including the guard-watched-failing rule
---

Verify the card in `board/5-verify/`.

Walk `skills/definition-of-done`. Every line, or the card does not move.

**The one that gets skipped, and the reason this command exists:**

> A guard nobody has watched fail is not a guard.

A passing test proves the happy path. It does not prove the check would catch what it exists
to catch. So:

1. Find the guard this card added
2. **Deliberately break the thing it guards** — a fixture, a temporary edit, whatever makes
   the violation real
3. Run the suite and **confirm the check fires**
4. **Paste that failing output into the card**, in a fenced block
5. Restore, and confirm green again

Then:

```bash
cd code && npm run test:offline    # green, all of it
/graphify                      # in the assistant — extracts the graph
node scripts/check.mjs
```

If a decision was made anywhere in this card, it is in `docs/DECISIONS.md` **before** the card
moves — not after, and not in chat.

Then `git mv` to `6-done`.

---
description: Create a card, or move one to the next stage with its gate checked
argument-hint: new <slug> | move <NNN> | show
---

Board operation: **$ARGUMENTS**

## new `<slug>`

1. Find the next free number: `ls board/*/ | grep -oE '^[0-9]+' | sort -n | tail -1`
2. `cp templates/CARD.md board/0-backlog/NNN-<slug>.md`
3. Fill in the title only. **Leave the spec empty** — it gets written in `1-spec`, with
   `spec-first`, and challenged by the `spec-challenger` subagent.

## move `<NNN>`

1. `node scripts/check.mjs` — if it fails, **stop**. A gate that fails is a refusal.
2. Find the card, identify its current stage, and check the gate it is about to pass:

| Moving into | Refuse unless |
|---|---|
| `2-plan` | spec section filled, ≥1 testable acceptance criterion |
| `3-build` | files named, **reuse ladder with a graphify explain recorded**, fits one context — and **`3-build` is empty** |
| `4-review` | code + tests exist, no TODO, no commented-out code |
| — | *at `2-plan`, before building: run `/plan-review` — Codex reads the plan it will implement* |
| `5-verify` | review scored by the `reviewer` subagent, **verdict PASS** (`BACK` sends it to `3-build`), no axis below 3, **`Reviewed by:` names the model and vendor**, security gate answered line by line |
| `6-done` | tests green, **the guard's failing output pasted into the card**, decision recorded if one was made |
| `7-operate` | it is deployed. Move it here **on deploy**, not when you are finished with it |
| *out of* `7-operate` | production has answered `skills/operate-after-done` — what you observed, and what came back as a card. *"No errors, latency unchanged over three days"* closes it |

**A `kind: migration` card owes more**, and `card-gate` will say so: the expand/contract split
and mixed-version behaviour at `2-plan`, and a rehearsed data restore at `5-verify`. A tag rolls
back code, never rows — `skills/deploy-gate` §3a.

3. **`nexa-move <NNN> <to>`** — the transition function. It refuses a `from → to` pair the
   pipeline does not define, runs that transition's guards, and rolls the move back if one
   refuses. `nexa-move --list` prints every legal transition with its guards; `--dry-run` says
   what would happen and changes nothing.

   **Do not move a card by hand.** `guard-edit` refuses it (`board-move-unguarded`), and on a
   default adoption the board lives outside the repository, where a git-based move cannot work
   at all.
4. `nexa-check` again.

## show

Print the board: what is in build, what waits on review, what waits on verification.
```bash
for s in board/*/; do n=$(ls "$s" 2>/dev/null | grep -c '\.md$'); echo "$s $n"; done
```

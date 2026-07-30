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
| `5-verify` | review scored by the `reviewer` subagent, verdict PASS, security gate answered line by line |
| `6-done` | tests green, **the guard's failing output pasted into the card**, decision recorded if one was made |

3. `git mv board/<from>/<card> board/<to>/` — **git mv, never copy.** Two copies is how a
   card ends up in two stages and neither is the real one.
4. `node scripts/check.mjs` again.

## show

Print the board: what is in build, what waits on review, what waits on verification.
```bash
for s in board/*/; do n=$(ls "$s" 2>/dev/null | grep -c '\.md$'); echo "$s $n"; done
```

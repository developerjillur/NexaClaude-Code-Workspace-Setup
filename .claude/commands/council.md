---
description: Put a hard question to five models across four vendors, anonymise, rank, then synthesise it yourself.
argument-hint: <the question, or a card path>
---

Run the council on: **$ARGUMENTS**

Read `skills/council` first if you have not this session — particularly *when not to call it*.

## Do this

1. **Check it is worth a council.** If the answer is knowable — it is in the code, a test, or
   `graphify explain` — say so and stop. Five models guessing costs half an hour and reads as
   more authoritative than one `grep`.

2. **Sharpen the question before spending the time.** A council answers what it is asked. If
   `$ARGUMENTS` is a card path, read the card and put the *decision* to them, not the card:
   the acceptance criterion that is in doubt, the approach that might be wrong. Include the
   context they need — **they run outside the repo and can see nothing you do not paste.**

3. **Run it in the background.** Minutes per member, twice.

   ```bash
   node scripts/council/council.mjs "<the sharpened question>"
   ```

4. **Read every stage-1 answer before the reviews.** The rankings will pull you toward a
   consensus; form your own view first, or you are synthesising their synthesis.

5. **Write the synthesis where the work is** — the card's §2 or §4, or `docs/DECISIONS.md`.
   Not in chat. Cite the council file by path.

## What the synthesis must contain

- **Where they disagreed, and which side you took, and why.** This is the output. Averaging
  five models produces something none of them would defend.
- **What they all missed**, if the review stage surfaced it — that question is asked precisely
  because unanimity is where a council is weakest.
- **Any number, marked as unmeasured** unless it came with a harness. Five models asserting a
  latency is five guesses, not a measurement.

**Do not adopt a council's answer.** It is material for your judgement. If you find yourself
running it because a choice is uncomfortable rather than unclear, stop — you will get a
well-argued average and a decision nobody owns.

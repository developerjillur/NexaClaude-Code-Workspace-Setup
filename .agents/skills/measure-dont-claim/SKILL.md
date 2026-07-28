---
name: measure-dont-claim
description: Run whenever you are about to state a number, a rate, a speed, a cost, or a "this is faster/cheaper/safer". The single highest-value habit in this project — 77 of its claims were disproven, and nearly all of them were plausible when written.
---

# Measure, do not claim

**The plan for this project contains 151 verified claims and 77 disproven ones.** The
disproven half is the more valuable half, and it exists because someone measured instead of
reasoning. Almost none of the 77 were obviously wrong. **Plausible is the failure mode.**

## The rule

Before any number, rate or comparison leaves your output, it is one of three things — and
**you must say which**:

| | Looks like |
|---|---|
| **Measured** | *"p50 635 ms over 34 real turns"* — with how it was measured |
| **Sourced** | *"62% of home-service calls go unanswered ([source](…))"* — someone else measured it |
| **Assumed** | *"probably around 200 ms — not measured"* — and it stays marked until it is |

**An unmarked number is a claim, and a claim is how the 77 got in.**

## What this has actually caught here

Real examples from this project, all of which read as confident and correct:

| The claim | What measuring found |
|---|---|
| *"A call costs $17.10"* | **$1.20.** Three compounding pricing bugs |
| *"median reply latency is 1454 ms"* | it was measuring **how long the agent talked** — r = 0.73 with reply length |
| *"the prompt costs ~980 ms"* | **+389 ms**, and the whole prompt is worth only 58 ms |
| *"semantic_vad never commits"* | it works. **The test harness was wrong**, and the same harness failed the working config too |
| *"a faster model will fix the slow path"* | Gemini Flash measured **1.25–1.35× slower** — the cost is CLI startup, not the model |
| *"~50 tenants is the wall"* | flat to **200 tenants / 2M rows** with indexes. The number was borrowed, never tested |

Six confident, reasonable, wrong statements. Each cost real design work before it was caught.

## How to measure in this project

**It is usually ten minutes.** That is the whole argument.

```bash
# latency: n≥12, never n=3 — the same config produced 545 ms and 2906 ms consecutively
node scripts/bench-<thing>.mjs

# retrieval, tenancy, anything local: node:sqlite + process.hrtime.bigint()
# a subscription call: costs tokens — say so before running it
```

**n = 3 is not a measurement.** It is an anecdote that survived twice. When p50 and p90
disagree with the story, take more samples before believing either.

## The three ways a measurement lies

Every one of these happened here:

1. **The harness is wrong.** The VAD test stopped streaming audio after the speech, so the
   VAD never heard silence. It failed the *working* config too — **that was the tell.**
   *If your test says everything is broken, suspect the test.*
2. **A confound you built.** Progressive disclosure looked 5/5 against 0/5 — because it had
   been given a better prompt than the thing it was compared to. The fair rematch: 6/6 vs 4/6.
   *Change one thing.*
3. **You measured the wrong quantity.** `median_reply_ms` was correct arithmetic over the
   wrong two events for months, with green tests throughout.
   *Ask what the number would be if the code were perfect. If that answer is not obviously
   right, the metric is wrong.*

## When you cannot measure

Say so, plainly, and keep going:

> *"I have not measured the round-trip cost of the MCP path — this design assumes it is
> under 100 ms, and that assumption is #161."*

**A marked assumption is a good citizen.** It can be checked later, it does not poison
downstream reasoning, and nobody builds a quarter of a product on top of it believing it was
a fact.

**An unmarked one becomes the 78th.**

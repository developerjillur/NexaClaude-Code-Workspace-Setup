---
name: measure-dont-claim
description: Run whenever you are about to state a number, a rate, a speed, a cost, or a "this is faster/cheaper/safer".
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


## The third kind of claim: the one you cannot observe

Until now this skill had two categories — **measured**, and **assumption, marked as one**.
[headroom](https://github.com/headroomlabs-ai/headroom) named a third, and its own README is
the clearest statement of it:

> *"Output savings are **counterfactual** — we never see what the model *would* have written —
> so we report an honest **estimate with a confidence range**, never a made-up number."*

**Some claims are unobservable in principle, not merely unmeasured.** *"This saved us a week."*
*"Without the guard we would have shipped a bug."* *"The refactor prevented an outage."* There
is no experiment; the alternative branch does not exist.

The failure is treating them like the other two. Marked as an assumption they look soft when
they may be well-founded; stated as a measurement they are simply false.

**The honest form has three parts, and dropping any of them makes it a guess again:**

1. **Say it is counterfactual.** The word does the work — a reader stops looking for a harness.
2. **Give a range, never a point.** A point estimate for an unobservable quantity is a claim
   about a world nobody visited.
3. **Show the derivation.** *"Between two and six hours, from the three times this failed
   before the check existed"* is arguable. *"Roughly a day"* is not.

**And the test that keeps it honest: could the range be wrong in a way somebody could point
at?** If not, it is a feeling with a number attached.

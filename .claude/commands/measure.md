---
description: Measure a claim instead of asserting it — the habit that produced 77 disproven claims in this project
argument-hint: <what you are about to claim>
---

About to claim: **$ARGUMENTS**

Before it leaves your output, it is one of three things and you must say which:

| | Looks like |
|---|---|
| **Measured** | "p50 635 ms over 34 real turns" — with how |
| **Sourced** | "62% of calls unanswered ([link])" |
| **Assumed** | "probably ~200 ms — not measured" — and it stays marked |

**Write the harness. It is usually ten minutes**, and this project has six examples where ten
minutes overturned a confident belief:

- "a call costs $17.10" → **$1.20**
- "median latency 1454 ms" → it was measuring **how long the agent talked**
- "the prompt costs ~980 ms" → **58 ms for the whole prompt**
- "semantic_vad never commits" → **the harness was wrong**
- "a faster model fixes it" → **1.25–1.35× slower**
- "~50 tenants is the wall" → **flat to 200**

**n = 3 is not a measurement.** The same config here produced 545 ms and 2906 ms consecutively.
Use n ≥ 12, and report p50 and p90 — if they disagree with your story, take more samples
before believing either.

**Then check the three ways a measurement lies**, all of which happened here:
1. the harness is wrong (it failed the *working* config too — that was the tell)
2. a confound you built (one arm had a better prompt than the other)
3. you measured the wrong quantity (correct arithmetic over the wrong two events, for months)

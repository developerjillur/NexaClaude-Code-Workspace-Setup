---
name: council
description: Put a hard question to five models across four vendors, anonymise their answers, have them rank each other, then synthesise. Use before a decision that is expensive to reverse — architecture, a plan, a security judgement, a number nobody has measured. Not for questions with a knowable answer.
---

# The council

**Five models, four vendors, three stages.** Adapted from
[karpathy/llm-council](https://github.com/karpathy/llm-council); rebuilt on the CLIs this
machine already has, because §1 forbids a metered API.

```bash
node scripts/council/council.mjs "<question>" --context <file> [<file>...]
node scripts/council/council.mjs "<question>" --revise            # +MoA round: answer again, having seen the others
node scripts/council/council.mjs "<question>" --stage1-only      # opinions, no peer review
node scripts/council/council.mjs "<question>" --members=codex,grok
```

## Context is the whole game

**The budget is ~40k tokens, and it was measured rather than chosen.** The original 30k was a
guess. Probed against the real members with real source and a one-word instruction at the end:

| | codex | grok | gemini | sonnet |
|---|---|---|---|---|
| **~27k** | ✅ | ✅ | ✅ | ✅ |
| **~80k** | ✅ | ✅ | **❌ ignored the instruction and summarised instead** | — |

**Capacity was never the limit — instruction-following was.** Every member *accepted* 80k
without erroring. One stopped doing what it was asked, which is the failure that looks like an
answer. That is *lost in the middle* in practice, and it is open item **#113**, still unmeasured
in the plan itself.

So: a large file now arrives **whole** (80k chars, ~20k tokens) rather than halved, the pack
ceiling **refuses a file rather than trimming it to fit**, and every run prints how much of the
budget was used — with a warning past 27k, the size all four were verified obedient at.

**Raising it is a measurement, not a preference.** Re-run the probe first.

**A council with no context is five confident guesses about code nobody read.** Members run
outside the repo and see only what you pass. `--context` assembles it: named files, capped,
truncation announced inside the text, and a standing brief so nobody proposes an embeddings
API or a cache on the audio path.

**Assembled, never granted.** The obvious alternative — run them in the repo with their
read-only flags — is one this project already disproved: `codex exec --sandbox read-only`
reads the whole container including the OAuth token. Read-only means *cannot write*. So
`context.mjs` refuses `.env`, `data/`, `auth.json`, keys and the prompt log by path, and
refuses any file whose contents match a secret shape. **Verified: passing `code/.env` is
refused, not redacted.**

| | Verified 2026-07-28 |
|---|---|
| GPT-5.6 sol | `codex exec`, read-only, `xhigh` |
| Grok 4.5 | `grok -p`, high effort, web search off |
| Gemini 3.1 Pro | `agy -p`, plan mode — **via Antigravity**; the `gemini` CLI now refuses this account outright |
| Fable 5 | `claude --print` |
| Sonnet 5 | `claude --print` |
| **Chairman** | **you** — the session that ran it |

## The five judge biases, and what we do about each

Named in the LLM-as-a-judge literature. **Three were measured on our own runs** rather than
assumed, which is the only reason we know which ones bite here.

| Bias | Us | Handling |
|---|---|---|
| **Position** — the first slot wins | — | **each reviewer gets its own permutation**, seeded from the question. Better than the original, which fixes one order for everyone so the tilt compounds invisibly |
| **Self-enhancement** — a judge prefers its own answer | **measured: 3 of 4 ranked themselves 1st, 75% vs 20% chance** | **self-votes excluded from the tally.** Anonymisation did NOT prevent this — a model recognises its own writing |
| **Verbosity** — longer scores higher | **measured r=0.64 on run 1, r=−0.18 on run 2** | length printed beside every score, correlation printed every run. Not corrected — n=5 is a signal, not a law |
| **Family** — a judge over-rewards its own vendor | **2 of 5 are Claude, and so is the chairman** | stated in every run. Not corrected: the fix is a different council, which is your decision |
| **Verbosity-confidence** — confident and wrong beats tentative and right | not measured | the brief asks members to mark claims measured / sourced / assumed |

## When it cannot convene, it says so and stops

**Nothing is ever retried.** A CLI that is missing now will be missing in thirty seconds, and
an exhausted quota does not refill while you wait. Retrying turns a clear answer — *"you have
four of five"* — into an indefinite hang.

```bash
node scripts/council/council.mjs "<q>" --preflight   # who is available; spends nothing
```

| Situation | What happens |
|---|---|
| a member's CLI is not installed | named **before anything runs**, then skipped |
| a member returns a quota / auth / billing message | refused with its reason printed — **not counted as an opinion** |
| a member hangs | SIGTERM, then SIGKILL to its whole **process group** after 5s |
| fewer members answer than intended | the run continues and **says the council is degraded** |
| **no member is available at all** | exits in ~30ms, exit code **2**, nothing spent, nothing written |

Exit codes: **0** usable (even if degraded) · **1** convened and nobody answered · **2** could
not convene.

Two of those were open holes. A quota message that exited 0 was ranked as a real answer; and a
member that ignored SIGTERM held the process open *after* the council had finished, because
killing it left its grandchild holding the inherited pipe. **330ms to exit now, measured, where
it used to sit for 15 seconds.**

## The three stages

1. **Independent opinions.** All five in parallel, none sees another's answer.
2. **Anonymised peer review.** Each sees the others as *Response A, B, …* — **including its
   own, unlabelled** — and ranks them on accuracy first, insight second. Anonymity is the
   load-bearing part: it stops a model deferring to a name instead of an argument. It works —
   on the first live run GPT-5.6 ranked Grok's answer above its own and criticised it anyway.
3. **Synthesis — yours, not a subprocess's.** The script deliberately stops after stage 2. A
   chairman running as a pipe would lose the conversation that made the question worth asking.

## When to call it

**Before a decision that is expensive to reverse**, and where more thinking genuinely helps:

- an architecture choice, or a plan before it becomes cards
- a security judgement — the `security-gate` questions that have no single right answer
- *"is this actually the right approach"*, when you already have a working one
- a `4-review` where the two existing reviewers **disagree**

## When not to

- **A question with a knowable answer.** Read the code, run the test, `graphify explain`. Five
  models guessing is worse than one `grep`, slower, and reads as more authoritative.
- **Anything on the caller's path.** Minutes, not milliseconds.
- **To avoid deciding.** A council produces material for a judgement, never the judgement. If
  you are calling it because the choice is uncomfortable rather than unclear, the answer will
  be a well-argued average.

## Reading the output

`docs/council/<slug>.md`, committed — a council you cannot cite from `DECISIONS.md` was a
conversation, not evidence.

**Three rules for the chairman, in order of how often they are ignored:**

1. **Where they disagree is the most valuable output.** Record both sides. Do not average them.
   §10 says this about two reviewers; it is more true of five.
2. **Consensus is not correctness.** Five models on overlapping training data agreeing is weak
   evidence. This project keeps a list of **77 disproven claims** that were all plausible when
   written, and most were unanimous.
3. **Every number goes through `measure-dont-claim`** before it is used, no matter how many
   members stated it.

## What it costs

Each member is **minutes** on a real question — the one-word floors are 10–23 s, and one measured run
measured Codex exceeding **10 minutes** on a real plan review. Stage 2 runs the whole thing
again. **Budget half an hour and do something else**, exactly as §10 requires of Codex.

Members run **read-only, from a scratch directory outside the repo**. They advise; they never
edit. Five agents with write access to a tree holding a live OAuth token is the lethal
trifecta with extra seats.

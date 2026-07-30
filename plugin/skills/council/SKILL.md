---
name: council
description: Use before a decision that is expensive to reverse — architecture, schema, a security judgement, a plan, or anything whose failure is data loss or an outage. Five models across four vendors answer independently, rank each other anonymised, and you synthesise. Not for questions with a knowable answer.
---

# Council

**Five models, four vendors, answering independently and ranking each other anonymised.**

The council ships **inside this plugin** at `scripts/council/` — copied verbatim from
[all-cli-council](https://github.com/developerjillur/all-cli-council) (MIT) and pinned in
`.vendored-from`. Nothing to fetch; a core feature that needs a second install step is not one.

```bash
nexa-council-update          # is the vendored copy behind upstream?
nexa-council-update --apply  # re-vendor and repin
```

## When this fires

- an architecture or schema decision
- a security judgement
- a plan — **the most expensive thing to get wrong**, because everything downstream inherits it
- anything whose failure mode is data loss or an outage

## When it does NOT

**A question with a knowable answer.** Read the code, run the test, ask the graph. A council
guessing costs 10–30 minutes and comes back reading far more authoritative than one `grep`
would have. That asymmetry is the trap: the expensive answer *feels* better than the correct
cheap one.

## Running it

```bash
nexa-council "<the question>" --context <file>... --events
nexa-council-watch                    # another terminal; a 20-minute run must not look like a hang
```

Members run **outside your repository and see only what you send**. A council with no `--context`
is five informed guesses about a codebase none of them has read.

**Always background, never foreground.** Measured: a trivial prompt returns in ~14 s; a real
plan-review exceeded 10 minutes at low, medium and high reasoning effort alike, and no flag
combination changed it.

## Reading the result — the discipline

**The full doctrine ships beside the code**, vendored from upstream so the two cannot drift:

```
${CLAUDE_PLUGIN_ROOT}/skills/council/reference.md
```

Read it from there — it is vendored alongside the code, so it cannot drift from it. It was duplicated across two command files once and the copies had already
drifted — one of them had a numbered list running 1, 2, 3, 4, 5, 4. Two sources of one doctrine
do that, reliably.

The five rules that matter most, in case you read no further:

1. **Read every stage-1 answer before the rankings.** The rankings are a summary, and a summary
   of five disagreeing experts is the least informative artifact in the run.
2. **Disagreement is the output.** Record both verdicts. Do not average them — an average is a
   position none of the members actually held.
3. **Read the bias diagnostics printed above the score, first.** Consensus measures shared
   training data as much as truth. **This project's 77 disproven claims were mostly unanimous.**
4. **Weigh by confidence, not by count**, and carry the minority view forward even when you
   overrule it — with the reason you overruled it.
5. **Verify every number yourself.** A council is fluent, and fluency is not evidence.

## Then write it down

The synthesis goes to a card, `docs/DECISIONS.md`, or a PR comment — **not only into chat**,
which §7 of the contract treats as already lost. Cite the run file by path.

**Do not adopt a council's answer.** It is material for your judgement, not a verdict. If you are
convening one because a choice is *uncomfortable* rather than *unclear*, what you will get is a
well-argued average and a decision nobody owns.

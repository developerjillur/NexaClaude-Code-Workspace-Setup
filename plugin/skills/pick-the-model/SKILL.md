---
name: pick-the-model
description: Choose which agent or model does a piece of work. Use at 2-plan and whenever a task is about to be handed off. Based on measurements taken in this project, not on marketing.
---

# Pick the model

## Rule 0 — the tier is not a choice

**Every Claude-side task in this project runs on the top tier: Opus 5, maximum thinking
effort.** Planning, spec challenge, review, exploration, subagents — all of it. There is no
task here small enough to be worth a cheaper model.

**Why it is stated as a rule rather than left to judgement.** The tempting version of model
selection is a tiering table: cheap model for the easy half, expensive for the hard half. It
fails on this project specifically:

- **The judgement about which half a task is in is itself the hard part.** *"Just find where X
  is handled"* was how the emergency gate's enforcement point got named — and the answer was
  wrong, because `CallSession` accepts an arbitrary agent object. A cheaper model reading the
  same files would have been more confident, not less.
- **What this project ships can hurt a caller.** The board exists because the failure mode is
  a gas-leak call being offered Thursday at two. Nothing in that sentence is worth saving
  tokens on.
- **The cost argument does not apply.** Everything runs on the ChatGPT/Claude subscriptions
  already paid for. Downgrading buys nothing — it is not a cost trade, it is a quality loss
  with no offsetting saving.

Pinned, not remembered: `model: opus` and `MAX_THINKING_TOKENS` in **both** `settings.json`
files, and `model: opus` in every `.claude/agents/*.md`. **`explorer` was on `sonnet`** until
2026-07-28 — the search agent, the one whose output everything downstream trusts.

### The tier also has to be checked in other people's agents

**Plugins ship subagents with their own `model:` frontmatter, and five of ours arrived on
`sonnet`:** `codex-rescue`, `code-reviewer`, `code-architect`, `code-explorer`,
`readiness-analyzer`.

Two of those are the review path. **The Codex review that caught card 001 naming the wrong
enforcement file ran on a downgraded agent** — it was right anyway, which is the least
reassuring version of that sentence: nobody would have questioned a *weaker* answer either.

They live in `~/.claude/plugins/cache`, so **a plugin update silently restores the vendor's
choice.** `check.mjs` warns rather than fails on this — it is drift from outside this repo, not
a defect in it — but it must be visible, because the alternative is trusting a review that
quietly got cheaper. When spawning one directly, pass `model: "opus"` and do not rely on the
patch surviving.

### Codex has its own tier, and it was not pinned by anything in this repo

**`--effort xhigh` on every Codex call.** The plugin's instruction was *"leave `--effort` unset
unless the user explicitly requests one"*, and unset means no override — so Codex inherited
**`~/.codex/config.toml`**, a file outside this repo that nothing here reads.

It happens to say `xhigh` on this machine. **On any other machine it would silently drop to the
CLI default and the review would still return an answer — just a cheaper one.** That is the
same failure shape as the `sonnet` subagents, one level further out.

Both are now handled: the cached plugin says `xhigh` by default, and `check.mjs` reads the
global config and warns if it is anything else or missing. **A lower effort is allowed and has
to be asked for, with a line in the card saying why.**

Note the measurement that does *not* apply here: §10 records that a real plan-review exceeded
10 minutes at low, medium and high alike. **That was about latency, not quality** — effort did
not buy speed, which is not evidence it does not buy correctness.

**ponytail was checked and is clean** — it pins no model anywhere. Every `haiku`/`sonnet`
mention in it is documentation of *which models its benchmark used*, not a runtime choice, so
it runs on whatever the session runs on.

**This also changes how to read other people's benchmarks.** ponytail's ~54% is measured on
**Haiku 4.5** (§5). A result obtained on a small model tells you what that model needed help
with; it does not transfer to a top-tier model at max effort, in either direction. Quote such
numbers as reasons to try a tool, never as predictions about us.

---

Three agents are available and they are not interchangeable. **Every number below was measured
in this project**, not taken from a benchmark page.

| | Measured | Use it for |
|---|---|---|
| **Codex CLI** | **25.8 s floor**; ~10 s with the shipped flags; **6 concurrent tasks all complete**, 1.77× slower each | Writing code. Reading API docs and generating a connector. `run_task`. **It is the project's agent** — everything ships on its subscription |
| **Claude Code** | — | Planning, spec challenge, review — and **reviewing what Codex wrote**, because the contract requires a different model than the builder |
| **Antigravity / Gemini 3.6 Flash** | **1.25–1.35× slower than Codex**, both trivial and reasoning tasks | **Nothing, currently.** Measured and rejected: the bottleneck is CLI startup, not the model |

## The rules

**1 · The reviewer is never the builder.**
A model reviewing its own output agrees with itself. It is the most common way weak code
passes review in an agentic workflow, and it is invisible — the review *looks* thorough.

**2 · Nothing on a caller's path uses an agent CLI.**
Codex has a **25.8 s floor**. Anything a caller waits for is the Realtime model plus local
lookups — 635 ms and 0.011 ms. **Not a preference. The architecture.**

**3 · A faster model does not fix a slow CLI.**
Measured when this was proposed: Flash lost on both task types, because most of the seconds
are process start, auth and config — which no model can touch. *If the fix is "swap the
model", check what you are timing first.*

**4 · Concurrency degrades, it does not fail.**
3 concurrent: 1.06× slower each. 6: 1.77×, all completing. **So parallel work is allowed and
unbounded parallel work is not** — past roughly six, queue instead of spawn.

## The handoff

When work moves between models, **the card moves with it. Nothing is handed over in chat**,
because the receiving session never saw the chat.

```
Codex builds → writes ## 3 · Build → Claude reviews → writes ## 4 · Review
```

If a model needs context the card does not contain, **the card is incomplete.** Fix the card,
not the handoff.

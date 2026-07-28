---
description: Send a plan or spec to Codex for an independent second opinion before any code is written
argument-hint: [card number, or blank for the card in 2-plan]
---

Get **Codex** to review this plan before it becomes code: **$ARGUMENTS**

## Why Codex

The contract's review rule is *"a different model than the one that built it"*, and it applies
to plans more than to code — **a plan is the most expensive thing to get wrong**, because
everything after it inherits the mistake.

A second Claude shares this one's priors. **Codex does not.** And it is the model that
implements here, so if the plan is ambiguous to Codex, it is ambiguous where it counts.

## Measured, and it changes how you run this

**A real Codex review is a multi-minute operation, not a ten-second one.** Measured here:
a trivial prompt returns in ~14 s, but this exact plan-review prompt **exceeded 10 minutes
at low, medium and high reasoning effort alike.** Flags did not save it — `web_search=false`,
`mcp_servers={}`, `model_reasoning_effort="low"` all made no difference.

So: **never run it in the foreground and wait.** That is the same conclusion the onboarding
design reached — *nothing built on Codex is interactive* — and the plugin already handles it.

## Steps

**1 · Find the plan.** The card in `board/2-plan/`, or the one named in the argument. If
`2-plan` is empty, say so and stop.

**2 · Ask Codex, in the background.**

```
/codex:review --background
```

The plugin owns the invocation, the flags and the result parsing. **Do not shell out to
`codex exec` yourself** — the plugin's own guidance is to recommend background whenever the
size is unclear, and hand-rolling it is how a session ends up blocked for ten minutes on a
review it could have collected later.

Then, when it lands:

```
/codex:result
```

**3 · For a design question rather than a diff**, ask it as a task instead — the plan is not
yet code, so there is nothing to diff:

```
/codex:rescue Review this plan as the engineer who will implement it. Answer only:
(1) is anything ambiguous enough that two implementers would build different things?
(2) does the file list miss anything this must touch?
(3) is any acceptance criterion untestable as written?
(4) what does this break that the plan does not mention?
(5) is there a simpler shape that satisfies the same criteria?
Be blunt. If the plan is fine, say so in one line — do not manufacture objections.
<paste the card>
```

**4 · Paste the answer into the card**, under `## 2 · Plan`:

```markdown
### Codex plan review
<verbatim>
```

**5 · Act on it.**
- Ambiguity → **fix the spec, back in `1-spec`.** Do not resolve it in the plan and hope
- A missed file → add it to the plan's table
- A simpler shape → take it, or write one line in the card saying why not

## The rule

**Do not argue with the review in chat.** If Codex is wrong, write why in the card — that is
a decision, and a decision that lives only in chat does not exist (`AGENTS.md` §7).

## Related

| | |
|---|---|
| `/codex:review --background` | reviews a diff. Use once code exists |
| `/codex:adversarial-review` | harder. Use for anything security-shaped |
| `/codex:status` · `/codex:result` · `/codex:cancel` | the async trio — a running review is a job, not a wait |
| **The plugin's Stop gate** | can **BLOCK** a turn from ending when Codex finds something unfixed. `/codex:setup` toggles it. **Worth having on here** — it is the only mechanism that puts a second model in the path without anyone remembering to ask |

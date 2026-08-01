---
name: orchestration
description: Use when work genuinely needs more than one agent at once — a survey across subsystems nobody has read, a build and an independent review that must not share a vendor, or a fan-out over a list too long for one context. Not for ordinary cards: one card in one context is the default and orchestration is the exception. Says which runtime to use in the editor you are actually in, and enforces WIP=1, §10 and the card rule across all of them.
---

# Orchestration

**Most work is one card in one context.** That is the default and this skill exists to be used
rarely. Reach for it when a task is genuinely parallel and self-contained, not when a task is
merely large — a card too big for one window is a card to split, which is `context-budget`, not
this.

## The ladder — stop at the first rung that holds

1. **Does this need more than one agent at all?** A survey of four subsystems does. "Implement
   this card" does not, and fanning it out produces four agents editing one repository.
2. **Is the second agent for INDEPENDENCE rather than throughput?** A review that must not share
   a vendor with the build is the strongest case for orchestration in this workspace, because
   §10 is otherwise unenforceable. → `review-gate`
3. **Is the decision expensive to reverse?** Then it is not orchestration, it is `council` —
   five models answering the same question, not N agents doing different work.
4. **Only then:** dispatch.

## Which runtime, in the editor you are actually in

The workspace ships its own, and it is the only one that works everywhere:

```bash
nexa-orchestrate --workers          which agents are installed here, and what each may do
nexa-orchestrate --plan p.json      validate the DAG. Runs nothing.
nexa-orchestrate --run  p.json      execute
```

A worker is a **headless CLI invocation**, which is the one primitive every tool shares. The
roster comes from `scripts/council/members.json` — the same verified invocations the council
uses, never a second copy — plus a writable form for the agents that have a documented one.

| Where you are | Use |
|---|---|
| **Orca** | **`orca skills get orchestration`** — richer than this: threaded messages, blocking ask/reply, `worker_done` authority, decision gates, coordinator loops. `nexa-orchestrate` also runs there, so a plan is not stranded when you change editor |
| **Claude Code** | its Agent tool for exploratory fan-out; `nexa-orchestrate` when the run must be reproducible, resumable, or cross-vendor |
| **Cursor, Codex CLI, Copilot** | `nexa-orchestrate`. Their native background agents do not enforce anything below |
| **Aider, Zed, ChatGPT app** | `nexa-orchestrate`. They have no subagent mechanism at all |

**Never substitute a subagent for a runtime the user asked for by name.** If they said Orca, they
want Orca's coordination state, and a Claude subagent is not that.

## What this refuses, and why each rule is here

`--plan` checks every rule **before anything is dispatched**, because a fan-out that discovers
its own illegality half way through has already spent the tokens and half-written the change.
Same reason `nexa-move` runs its guards before it moves the card.

| Rule | Refused when | Why |
|---|---|---|
| `same-vendor-review` | `notVendorOf` names a task on the same vendor | §10 — no model reviews its own work. **This was the most-repeated rule in the contract and nothing had ever enforced it** |
| `concurrent-writers` | two `write` tasks with no dependency between them | WIP = 1. Five agents at one repository is four cards in build wearing a different hat |
| `no-card-for-write` | any `write` task and `board/3-build` is empty | dispatching an agent to change the product is still a product change |
| `unknown-worker` | the worker is missing, or cannot write, or needs a `{promptFile}` | a plan that fails at dispatch has already spent every upstream task |
| `cyclic-plan` | tasks depend on each other in a loop | names the stuck tasks, not "something is circular" |

## A plan

```json
{ "tasks": [
  { "id": "map",    "worker": "codex",        "mode": "read",  "prompt": "Map src/auth end to end" },
  { "id": "build",  "worker": "claude-sonnet", "mode": "write", "needs": ["map"],
    "prompt": "Implement the card in board/3-build" },
  { "id": "review", "worker": "gemini",       "mode": "read",  "needs": ["build"],
    "notVendorOf": "build",
    "prompt": "Review the diff against the card. Score the five axes." } ] }
```

Each task's upstream results are appended to its prompt, so a DAG is a pipeline rather than N
prompts that happen to be ordered.

## Before you believe any of it

**A worker reporting success is a claim.** `nexa-orchestrate` runs the commands; it does not
check the work, and it says so on every successful run. Read the output files. Then the ordinary
gates apply, unchanged — `nexa-check`, the review gate, `deliverable-shown` at 5-verify, which
prints the artifact precisely because an agent's own report is not evidence.

**A fan-out is where "reported done, actually a shell" happens fastest**, because there are five
reports instead of one and no single agent saw the whole thing. `depth-check` and `verify-claims`
matter more after orchestration, not less.

## What it does not do

No shared memory, no live messaging between workers, no interactive ask/reply. Workers are
processes with prompts and outputs, and they see each other only through the DAG. **If you need
threaded coordination, that is Orca's orchestration and this does not imitate it** — an imitation
would be a worse version of something already installed.

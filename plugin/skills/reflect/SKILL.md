---
name: reflect
description: Read the records back and consolidate what they add up to. Run when check.mjs reports the reflection is stale, at the end of a long session, or before handing the project to someone else. Turns decisions, cards and prompts into the patterns none of them state on their own.
---

# Reflect

**This workspace records well and never reads back.** Decisions, cards, prompts and commits
all accumulate; nothing has ever gone over them and asked *what do these add up to.*

The gap was named by [Hindsight](https://github.com/vectorize-io/hindsight), whose third
operation — after Retain and Recall — is **Reflect**: forming learned models out of raw
memories. Its diagnosis was right. Its implementation was wrong for us (Postgres, an LLM
provider and embeddings, for a memory that is currently files in git and reviewable in a
diff), so this is the same idea, file-native. See `docs/DECISIONS.md`, 2026-07-28.

```bash
node scripts/reflect.mjs      # everything since the last reflection
```

Then write `docs/LEARNED.md`.

## What belongs in LEARNED.md

**Only what no single record states.** The test is mechanical: if the line you are writing
would fit inside one entry of `docs/DECISIONS.md`, it belongs there instead.

Four shapes qualify:

- **A pattern across decisions.** Three separate decisions all trading provability for
  behaviour is a stance the project holds; no one of them says so.
- **A mistake with a second instance.** The first time is an incident and lives in its card.
  **The second time is a property of how we work**, and that is this file's core content.
- **A belief that was overturned.** What was believed, what disproved it, and *what kind of
  reasoning produced the wrong belief* — that last part is the transferable half.
- **What a fresh agent gets wrong on day one** and could not have known from `AGENTS.md`.

## What does not

- Anything already in `AGENTS.md` — that is the contract, and duplication makes it weaker
- A summary of what happened. `git log` does that, accurately, for free
- A single decision restated. `DECISIONS.md` holds it with its own reasoning
- Anything aspirational. This file records what **was**, never what we intend

## Writing it

Newest first, one section per pattern. Each carries **the evidence** — commits, decision
dates, card names — because a pattern with no instances is a slogan, and this project has a
77-item list of what confident slogans cost.

**Prefer deleting.** A pattern that stopped happening should come out, with a line saying it
stopped. A file that only grows is one nobody finishes reading, and an unread memory is the
same as no memory.

Finish by setting the marker, or staleness cannot be measured:

```
<!-- reflected-at: <short sha of HEAD> -->
```

## The honest limit

**This is reflection by an agent that was present for most of what it is reflecting on**, so
it will be kindest to its own reasoning. Two guards, and they are weak ones: prefer patterns
with **evidence you can point at over impressions**, and when the material is large, consider
sending it to the other vendor's model per §10 — the same split that caught the emergency
gate naming the wrong file.

A reflection nobody disagreed with has probably not said anything.

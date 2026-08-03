---
name: session-start
description: Run first, every session, before any other action. Rebuilds the context a new session does not have and cannot infer.
---

# Session start

**A new session knows nothing and does not feel like it knows nothing.** That is the whole
problem: forgetting is indistinguishable from starting, from the inside. So this runs first —
before answering, before reading code, before agreeing to anything.

## The four steps

**1 · Read the contract.**
`AGENTS.md`. All of it. It is deliberately short so this stays cheap every time.

**2 · Find the work.**
```bash
ls board/3-build/ board/4-review/ board/5-verify/
```
There is **at most one card in `3-build`**. If there is one, that is your work — you do not
pick something else because it looks more interesting.

**3 · Read that card top to bottom.**
Not the title. The spec, the acceptance criteria, the plan, and anything already in
`## 3 · Build`. **The card is the memory of the work. The previous session is gone.**

**4 · Check the state is real.**
```bash
node scripts/check.mjs
cd code && npm run test:offline    # green before you add to it
```

**If the suite is red, that is the work.** You do not build on a broken base and you do not
"fix it later".

## Then say what you found

One short paragraph, before doing anything:

> *"Card 001 is in build. Spec asks for a kernel emergency gate with jurisdictional numbers
> and a non-overridable flag. The plan names three files. Nothing written yet. Tests green at
> 427. Starting with the trigger loader."*

**Not ceremony.** It is the cheapest check that you and the human are looking at the same
thing — and it catches the case where you read the wrong card, or the card moved and nobody
said so.

## Then size the work before you wrap it in process

**Ask what the change can break, and match the process to that** — AGENTS.md §3. The board and
its gates exist for changes that can hurt a caller; running all of them on a typo is not rigour,
it is cost.

- **Reversible and contained** — a typo, a comment, a log line, a version bump, a local
  script: just do it. No card, no gate, no second model. Say in one line that you skipped
  them and why.
- **Ordinary product change** — the full board, one card, one context.
- **Expensive to reverse** — schema, auth, money, migration, public API, deploy: the board
  *plus* `council` and `deploy-gate`.

**Unsure which bucket? It is the middle one.**

This is about the *scope of process*, never about the *care taken inside it*. The tier stays
pinned and thinking stays full for whatever you are actually doing — see `pick-the-model`.

**Both directions fail, and the second is the quiet one.** Skipping a gate on something that
needed it ships a bug, and you find out. Running every gate on everything burns the budget and
teaches everyone to route around the process for small work — which is exactly when the process
stops catching anything.

## What a fresh session reliably gets wrong

- **Starting something new** while a card sits in build. Check first.
- **Wrapping a two-line change in the full pipeline.** Process is a cost like any other; §3
  above is how you decide how much to spend.
- **Re-deciding a settled question.** `docs/DECISIONS.md` exists for this. Read it before
  proposing an architecture that was already rejected, with reasons.
- **Re-implementing what exists.** `graphify explain` before writing, always.
- **Trusting a summary over the card.** The card is the record; a summary is a lossy copy.

## If the workspace is not here at all

`check.mjs` saying *"no workspace found"*, or a bare command answering *"no project found"*,
means this repository was never adopted — not that anything is broken.

```bash
nexa-init            # what would be written, and the codeDirs it detected
nexa-init --apply    # adopt it now
```

Adoption otherwise happens only at session start, so a repository created or `git init`-ed
**during** a session stays un-adopted until Claude Code restarts. `nexa-init` is the way to do
it without one. It shares the same refusal ladder as the hook, so it can never adopt something
the hook would decline — not a git repo, not the repo root, `$HOME`, a temp directory, a
tombstoned repo, or somebody else's `board/`.

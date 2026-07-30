---
name: session-start
description: Run first, every session, before any other action. Rebuilds the context a new session does not have and cannot infer. Two minutes that prevent the most expensive failure — an agent confidently continuing work it has forgotten.
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

## What a fresh session reliably gets wrong

- **Starting something new** while a card sits in build. Check first.
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

---
name: context-budget
description: Run at 2-plan, before any code. Decides whether a card fits in one context window — and splits it if not. Stops the failure where an agent forgets the start of its own work.
---

# Context budget

**One card, one context.** The failure this prevents: an agent halfway through a large task
has lost the spec, forgotten a file it already changed, and is now writing a second version of
its own code. It does not feel like forgetting from the inside — it feels like starting.

## The budget

Before writing, add it up:

| | Cost | How known |
|---|---|---|
| **The workspace itself, before any work** | **~7,056 tokens** | `check.mjs` verifies this |
| ├ `AGENTS.md` | ~5,222 | `bytes/4` — a **proxy**, checked against the header by `check.mjs` |
| ├ `CLAUDE.md` | ~968 | |
| ├ 13 skill descriptions (always loaded) | ~746 | this is what a skill costs when unused |
| └ `session-start` output | ~120 | |
| The card's spec | 500–1,500 | |
| Files you will edit | count them — a 400-line file is ~5,000 | |
| Files you must read but not edit | the graph should replace most of these | |
| The work itself | the code you write, plus the test | |

**If the files alone exceed roughly a third of the window, the card is too big.**

> **This table has been wrong twice: ~2,000 when it was 4,230, then 4,700 when it was 5,968.**
> Every card budgeted against it was wrong by that much, and nobody noticed because a
> plausible number does not look like a wrong one. **So `check.mjs` refuses when the header
> drifts more than 10% from the file.**
>
> **It is `bytes/4`, which is a proxy and not a token count** — a real count needs a tokeniser,
> which would be a dependency for a number only ever compared against itself. The 10% band
> exists because the proxy is loose. Treat these as *relative* sizes, not absolutes:
>
> ```bash
> wc -c AGENTS.md CLAUDE.md | awk '{printf "  %-14s ≈%5d tok\n", $2, $1/4}'
> ```

**A skill costs tokens even when it is never invoked** — its description rides every session so
the model can choose it. Twelve of them is ~670 tokens of pure catalogue. That is the argument
against adding a thirteenth for something the board already covers, and it is measured rather
than aesthetic.

## Splitting

A card that does not fit splits along a seam, not down the middle. Good seams:

- one layer at a time — schema, then the code that uses it, then the UI
- one file plus its test, then the caller
- the measurement first, then the change it justifies

**Bad split:** "part 1 and part 2" with no independent acceptance criteria. If part 1 cannot
be reviewed and merged alone, it is not a split — it is the same card with a new name.

## Use the graph instead of reading

```bash
graphify explain "who calls this"
graphify path <a> <b>
graphify explain <symbol>
```

**This is the single largest context saving available.** Reading five files to learn one
relationship costs thousands of tokens; the graph answers it in a line, and it was built once.

## The honest signal

If you find yourself re-reading a file you already edited this session, **stop.** That is the
budget being exceeded, and the next thing that happens is duplicated work. Finish the card,
or split it.

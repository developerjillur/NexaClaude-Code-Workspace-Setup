---
description: Put a hard question to five models across four vendors, anonymise, rank, then synthesise it yourself.
argument-hint: <the question> [--context <file>...]
---

Run the council on: **$ARGUMENTS**

> **The council ships inside this plugin** (`scripts/council/`, MIT, pinned in
> `.vendored-from`). Nothing to fetch, no second marketplace, no clone. `nexa-council-update`
> reports drift against upstream and refreshes it.

## Before spending the time

1. **Check it is worth a council.** If the answer is knowable — it is in the code, a test, or a
   command — say so and stop. A council guessing costs 10–30 minutes and reads as more
   authoritative than one `grep`.

2. **Sharpen the question.** A council answers what it is asked. Put the *decision* to them —
   the criterion in doubt, the approach that might be wrong — not a topic.

3. **Pass context, or you get five informed guesses.** Members run outside your repo and see
   only what you send.

```bash
nexa-council "<question>" --context <file>... --events
nexa-council "<question>" --context <f> --lenses    # + method diversity
nexa-council "<question>" --context <f> --revise    # + a mixture-of-agents round
nexa-council "Grade this"  --context <f>... --rubric # score out of 10
nexa-council "<question>" --preflight                # who is here; free and fast

# then, in another terminal — a 20-minute run should not look like a hang
nexa-council-watch
```

**Quote the question.** An unquoted one is split by the shell, and a flag-shaped word inside it
is both stripped from the question and read as an option.

**Tell the user the `nexa-council-watch` command.** The progress is a per-member clock, redrawn
live; members are buffered and cannot be streamed, so do not promise streaming text.

## Reading the result

**The reading discipline lives in `skills/council`** — invoke it rather than working from memory.
The short version, and every line of it was earned:

- Read **every stage-1 answer** before you look at the rankings.
- **Disagreement is the output.** Record both verdicts; do not average them.
- Read the **bias diagnostics above the score** first. Consensus measures shared training data as
  much as truth — this project's 77 disproven claims were mostly unanimous.
- Weigh by **confidence, not by count**. Carry the minority view even when you overrule it.
- **Verify every number yourself.** A council is fluent; fluency is not evidence.

Runs are written to **your project's directory**, not into your repository:

```
~/.nexa/projects/<your-project>/.council/runs/<slug>.md    the run, for a human
                                              <slug>.json   the same, for a program
```

`nexa-council` prints the path when a run finishes. (The council itself writes to its working
directory; `nexa-council` runs it from the project directory so the output lands there, and
rewrites any relative `--context` path first so it still resolves.)

## Two things the flags cost, worth saying once

- **`--allow-uncontained` admits a member measured able to write to any absolute path.** The pack
  you send is repository content, and a file in it can carry an instruction aimed at whoever
  reads it next. `nexa-council` runs `verify-containment` — do not name a member from memory.
- **A repo-local roster chooses what gets executed**, so `--local-roster` also requires
  `--allow-uncontained`. They are separate flags for that reason.

## Then write the synthesis where the work is

A card, a decision record, a PR comment — not only in chat. Cite the run file by path.

**Do not adopt a council's answer.** It is material for your judgement. If you are running it
because a choice is uncomfortable rather than unclear, you will get a well-argued average and a
decision nobody owns.

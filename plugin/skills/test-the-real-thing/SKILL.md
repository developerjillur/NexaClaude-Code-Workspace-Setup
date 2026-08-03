---
name: test-the-real-thing
description: Run before claiming any feature works, ships, or is fixed — and immediately when a user says something is not working.
---

# Test the real thing

**A passing suite is evidence about your harness. It is not evidence about the product.**

On 2026-07-30 a feature shipped with 532 green assertions, six clean gates, and 31/31 mutation
coverage. It then failed **ten consecutive times** in the user's hands. Every failure was a
category the suite could not see, and every one was found by the user rather than by the tests.

This skill is that day, written down.

---

## Before you say it works

Run the thing **the way a user runs it**, not the way your harness runs it.

| What was tested | What shipped broken |
|---|---|
| the hook, via a crafted stdin payload | the hook, in a real Claude Code session |
| `bootstrap()` as a function | adoption, in a repo somebody just `git init`-ed |
| `veto()` as a pure function | autopilot, refusing everything a person actually types |
| the image tool, by calling it | image generation, which the model never reached for |

**If your test never launched the real binary in the real tool, you have not tested the
feature.** Say so, plainly, rather than implying coverage you do not have.

### The one question that catches most of it

> *Did I run this the way the user will, end to end, once?*

If no: run it now. It costs minutes. Ten rounds of "still not working" costs an evening and the
user's confidence.

---

## When a user says it is not working

**Read their evidence before forming a theory.** Their logs, their screenshots, their state
files. All of it.

On that day the answer sat in the user's own log for four rounds while "restart Claude Code" was
offered instead — an answer already disproved by the fact they had restarted five times and said
so. The log said, in plain English, that the hook had run and a model had declined on phrasing.

- **Never repeat an explanation the user has already falsified.** If they say they restarted, it
  is not the restart.
- **A diagnostic they can run beats a theory you can state.** Build the diagnostic.
- **Their reproduction outranks your test.** When the two disagree, the test is wrong.

---

## The failure modes that produced green suites

Each of these was live, in this repository, with everything passing.

1. **A test file that ran nothing.** Importing a hook executed it; it read stdin, found none, and
   exited. The suite printed zero assertions and exited 0. **Silence is indistinguishable from
   success** — assert a count, not just an exit code.

2. **A probe that passed without its condition occurring.** It signalled between mutations, so
   "restored" was true having tested nothing. **A check that can pass without the thing happening
   must report `inconclusive`, never `pass`.**

3. **An over-determined assertion.** It checked `exit 1`, and two different guards exit 1 —
   so deleting one changed nothing it could see. **Assert *which* rule fired, not that something
   did.**

4. **An allowlist dead since a file moved.** Exact-string paths stopped matching when scripts
   moved into `plugin/`, and the scanner began flagging its own rules. It failed *noisily*, which
   is why it survived: four permanent findings read as known debt.

5. **A guard watching a renamed directory.** It compared `''` to `''` and passed on every run
   while 32 fixtures piled up in a real home directory. **Derive paths from the code you guard,
   never restate them.**

6. **A compensation that outlived its cause.** A `+1` fudge for a component that later shipped
   properly, so the count was permanently wrong in the safe-looking direction.

**The pattern:** every one asserted something *near* the truth. Assert the thing itself.

---

## Shipping is not building

- **A tool nothing points at is invisible.** `nexa-image` worked perfectly and the model reached
  for a different plugin's provider, concluded no generator existed, and offered to install two.
  **A binary without a skill or command is not a shipped feature.**
- **A fix without a version bump reaches nobody.** Plugin caches are keyed by version; `main`
  moving changes nothing for an installed user.
- **Hooks load once, at session start.** A running session executes the version it started with.
  Record the version in the artefact so a stale session is provable rather than guessed at.
- **Untracked is the same as absent.** Seven files — including a whole subsystem — sat untracked
  while the suite was green. Walk the disk and ask git; never iterate the tracked list.

---

## Safety rules that fire too often get the feature switched off

An autopilot refused almost everything because "would you like…?" was treated as a consent
question. Measured, same file, same task:

```
"Should I count the words?"        → continued
"Would you like me to count them?" → stopped
```

**That is a coin toss dressed as a safety boundary.** A rule that cannot distinguish danger from
grammar protects nobody and destroys the feature.

Guard what is **irreversible** — deleting, deploying, pushing, spending, contacting people,
credentials, production. Let preferences through. And if a model is used, do not make it a second
veto on top of the rules: tell it the dangerous cases are already refused, and let it decide.

---

## Build the diagnostic before you need it

Every silent exit is undiagnosable by definition. When something is deliberately quiet, it must
still leave one line saying **where it went** — at a fixed, findable place, written before any
gate, on every invocation.

**A diagnostic that only exists once the thing works is not a diagnostic.**

And when you build one, make sure it cannot lie: the first version wrote to one global file, so
every project overwrote every other's and it reported a mismatch that meant only *"you have more
than one project"*. It cried wolf within ten minutes.

---

## What to say when you are not sure

Say it. *"The gates around this are proven; the decision path itself has never run for real"* is
worth more than a confident summary that turns out wrong, because the user calibrates on you.

Ten rounds of confident wrongness is far more expensive than one honest *"I have not tested
that."*

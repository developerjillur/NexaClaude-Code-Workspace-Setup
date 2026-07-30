---
description: Turn unattended auto-continue on or off, and read what it decided while you were away.
argument-hint: on [N] | off | log [N] | (nothing for status)
---

Run: **$ARGUMENTS**

```bash
nexa-autopilot            # status
nexa-autopilot on 10      # enable, ceiling of 10 consecutive continues
nexa-autopilot off
nexa-autopilot log 20     # what it decided, and why
```

## What it does

When a turn ends **waiting on a trivial next step**, autopilot answers it so an unattended run
keeps going. It reads the response, checks a refusal list, asks Sonnet whether the next step is
mechanical, and continues if it is.

**It is off by default and stays off until you turn it on.** Report the status honestly — a mode
that continues sessions on somebody's behalf is not something to leave ambiguous.

## What it will never answer

A rule list vetoes these **before any model is asked**, and the model can only ever downgrade to
silence — never overturn a veto:

publishing or deploying · destroying data · credentials · money · contacting a person ·
rewriting shared history · anything irreversible · production · an approval only you can give ·
a choice between named alternatives

**A false veto costs one unattended turn. A false pass costs a force-push.** The list errs
heavily one way, on purpose.

## What it cannot do, and do not try to add it

The original request was *"wait a minute for the human, then act if they stayed quiet"*. That
**cannot be built**: `Stop` fires the instant a turn ends — before the human can type — and the
hook is a subprocess with no channel to the terminal, so it cannot observe typing. Sleeping
would freeze the session for the whole minute with input queued invisibly.

So it is an explicit mode rather than a timer racing a person. The escape is Esc, or `off`.

## When reporting on it

- Say whether it is **on or off** and how much budget is spent — never leave it implied.
- If it refused something, say **what and why**; that is the interesting half of the log.
- If the budget ran out, say so — it hands control back rather than switching itself off, and
  a user who does not know that will think it is still working.

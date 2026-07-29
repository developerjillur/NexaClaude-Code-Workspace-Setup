---
name: finish-dont-schedule
description: Run before ending a turn with work still on the list, and whenever /loop or ScheduleWakeup is about to be used. Decides whether there is anything real to wait for — and if there is not, the answer is to finish the work now rather than set a timer. Also run when a loop has been ticking without producing anything.
---

# Finish, do not schedule

**A wakeup is for waiting on something outside this session.** A CI run, a deploy, a remote
job, a queue, a council that takes twenty minutes. Something whose state changes without you.

**Work that is simply not done yet is not something to wait for.**

---

## The bug this exists for, in the words of the session that had it

> ```json
> { "delaySeconds": 300,
>   "reason": "Nothing external to wait on — next item is the Gas Safe finding…
>              short tick so the research starts with clean context rather than mid-turn." }
> ```

**It wrote "nothing external to wait on" and then set a timer.** Eight items on the list,
nothing to wait for, and each one separated from the next by five minutes that bought nothing.

Two mistakes, and the second is the one worth remembering:

1. **`/loop` does not continue unfinished work. It paces a REPEATED CHECK.** Eight to-dos and
   no external dependency means: do the eight, in this turn.
2. **"clean context" is not a thing ending a turn produces.** Ending a turn does not clear
   context — it stops work. The reasoning felt like an optimisation and was a delay wearing
   one's clothes.

---

## The decision, as three rows

| What you are actually doing | The delay |
|---|---|
| **Waiting on something outside** — CI, deploy, queue, a long agent | **however fast THAT moves.** An 8-minute CI run gets one ~480s check, not eight 60s ones |
| **Something else will wake you** — a task notification, a monitor | **1200s+**, so quiet wakeups stay rare. This is a fallback, not the primary signal |
| **Nothing to wait on, just work left** | **do not schedule one at all.** Finish it |

**`scripts/hooks/guard-wakeup.mjs` refuses row three**, and it does so by holding you to your
own sentence: if the reason says there is nothing to wait for, the wakeup is blocked.

---

## Two honest exceptions

- **A genuinely long-running loop you want to survive the session** — that is what
  `ScheduleWakeup` is for, and a 1200s+ fallback is the documented shape. Name what you expect
  to wake you.
- **Something outside the machine** — business hours, a rate-limit window, an embargo, a person
  who has not replied. Real, and the guard allows it, because naming it is the whole test.

**Override, if you have read the refusal and still mean it:** `NEXA_ALLOW_WAKEUP=1`.

---

## When a loop has been ticking and producing nothing

Then it is not a loop, it is a heartbeat. **Stop it** — `ScheduleWakeup` with `stop: true` — and
either do the work or write down what is actually blocking it. A loop that fires twelve times
an hour and changes nothing costs a turn each time and teaches everyone to ignore it, which is
the same failure as a red gate nobody fixes.

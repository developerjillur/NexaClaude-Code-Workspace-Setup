---
name: operate-after-done
description: Run after a card reaches 6-done and before the next one starts, and whenever production behaviour is mentioned — an error, a slow page, a confused user, a bill.
---

# Operate, after done

**The board ends at `6-done`. Paying customers start there.**

A council reviewing this workspace named it as the single biggest gap for the
idea-to-production claim:

> *"**The pipeline ends at the moment of push, and production is where paying users live.**
> With 10–1000 customers, the dominant failure mode is not 'the agent shipped a stub' — this
> workspace kills that dead — it is **'the app degrades and nobody finds out from the code.'**"*

> *"It breaks the moment the first real user hits an edge case the offline suite did not cover.
> With 10–1000 users that happens fast and repeatedly."*

**Everything upstream of here asks *is the code right?* This asks *is it working?*** — and those
questions have different answers surprisingly often.

---

## The four questions, after every deploy

**Not a dashboard. Four questions with dates on them.**

| | Ask | Why this one |
|---|---|---|
| **1** | **What is erroring that was not erroring yesterday?** | a new error is the cheapest signal you will ever get, and the only one with a timestamp that points at a cause |
| **2** | **What got slower?** | degradation is invisible from inside the code and obvious to a user. **Compare against the number from before the deploy, not against a target** |
| **3** | **What did users do that we did not design for?** | the workaround they invented is next quarter's feature, and the place they gave up is this week's bug |
| **4** | **What did it cost?** | per user, per request, per call. **A cost that grows faster than usage is an architecture problem wearing a billing problem's clothes** |

---

## Production talks back — in cards, not in chat

**The rule that makes this real:** *anything production says that would change what gets built
becomes a card in `0-backlog`, with the observation pasted into it.*

Not a note, not a memory, not a message. **A card**, because this workspace's own doctrine is
that work which did not move a card did not happen — and an incident that produced no card
will happen again, identically, and surprise everyone identically.

**Three things earn a card immediately:**

- **An error a real user saw.** Even one. Even if it recovered.
- **Something that worked in staging and not in production.** That gap is a finding about the
  environment, and it will widen.
- **A support question asked twice.** The second time is not a coincidence; it is a design
  defect with two data points.

---

## Before the first user, not after

**The instrumentation has to exist before it is needed, and this is where teams lose weeks.**
Minimum, and it is genuinely minimum:

- **errors reach a human** — a log nobody reads is not monitoring
- **one latency number per user-facing path**, recorded per deploy so *"what got slower"* has
  something to compare against
- **a way to know how many users there are**, and how many came back
- **a rollback that has been performed at least once, on purpose.** [deploy-gate](../deploy-gate/SKILL.md)
  tags one before every build; **a rollback nobody has ever run is a plan, not a capability**

**None of that requires a vendor.** A file, a counter and a timestamp beat an unconfigured
observability platform, and they beat it on day one rather than after the integration.

---

## The honest limit of this skill

**It cannot make you look.** Every other control in this workspace refuses — the guard blocks,
the gate exits non-zero, the hook stops the turn. **This one only asks**, because nothing in a
repository can detect that production is unhappy if nobody has wired production to the
repository.

**So the one thing worth automating first is question 1**: an error reaching a human without
anybody deciding to check. Everything else here can stay a habit. That one cannot.

---
name: discovery-first
description: Run before a card may enter 1-spec, and whenever a feature is described without a named person who wants it. Turns an idea into evidence a specification can be written from — who asked, what they do today, what changes if it exists, and the number that says it worked. Refuses ideas that arrive fully formed, because those are the expensive ones.
---

# Discovery first

**A council reviewing this workspace found the pipeline broke before it started:**

> *"The pipeline breaks between 'idea' and `1-spec`. Its own contract says the human writes
> the specification and the agent challenges it. **That presupposes somebody has already
> determined what deserves building.**"*

`spec-first` makes sure a spec exists before code. **This makes sure a reason exists before a
spec.** They are not the same gate, and the second one is the expensive one to skip: a
perfectly built feature nobody wanted costs the whole cycle, and every control downstream of
here will happily wave it through.

---

## The gate

**A card may not enter `1-spec` until all five answer.** *"I think"* is not an answer to any of
them.

| | The question | What a real answer looks like |
|---|---|---|
| **1** | **Who asked?** | a named person, role or recorded interaction. Not a segment, not *"users"* |
| **2** | **What do they do today instead?** | the workaround, described in enough detail that you could do it yourself. **If there is no workaround, be suspicious — people route around real pain, and pain nobody routes around is usually not pain** |
| **3** | **What breaks for them if this never exists?** | the cost of the status quo, in their units — minutes, money, missed calls, abandoned carts |
| **4** | **What number moves if it works?** | one metric, its current value, and the value that would count as success. **Chosen before building.** A metric chosen afterwards always shows improvement |
| **5** | **What would make us stop?** | the observation that says this was wrong. A feature with no kill condition is a feature nobody will ever remove |

**Write the answers into the card, in `0-backlog`, before it moves.** Not into chat.

---

## The three shapes that fail this gate

**Recognise them by their smell, because each one arrives sounding reasonable.**

- **The idea that arrives fully formed.** Complete with screens, edge cases and a name. Nobody
  wrote that down from a conversation with a user — it was designed in one head. **Ask
  question 1 and watch what happens.**
- **The competitor feature.** *"X has it."* That answers who built it, not who wanted it.
  X may be losing money on it.
- **The technically interesting one.** The clearest signal is that the *how* is more specific
  than the *why*. **If the architecture is three paragraphs and the user is one sentence, the
  order got reversed.**

---

## What this is not

**Not a product-management ritual, and not a delay.** Five questions, ten minutes, written into
a card that already exists. If the answers are known, it costs nothing. **If they are not
known, that is the finding**, and it arrived before the build rather than after the launch.

**And not a veto over intuition.** A founder's hunch is legitimate evidence — but write it down
*as* a hunch, with a kill condition, rather than laundering it into a requirement. The plan
this workspace came from keeps **77 disproven claims**, and the most expensive ones were all
confident before they were checked.

---

## When to skip it, honestly

- **A bug.** Somebody already found it; that is the evidence.
- **A control, a guard, or a test.** These serve the code, not a user, and question 1 has no
  answer for them. **Question 5 still does** — a control nobody has watched fire is not a
  control.
- **Something you are building to learn.** Legitimate, and it changes the metric: the finding
  is the deliverable, so success is *"we now know"*, not *"they used it"*. **Say so in the card
  or it will be measured as a feature and fail.**

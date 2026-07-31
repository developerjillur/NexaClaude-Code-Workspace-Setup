# NNN — <short title>

> Stage: 0-backlog · Owner: · Opened: · kind: feature

**`kind:` changes what this card owes**, and it was undocumented until now — the exemption
existed and nobody could find it. Declare it on the line above; it is read wherever it appears.

| kind | What it changes |
|---|---|
| `feature` | the default. All five discovery questions are owed |
| `bug` | somebody already found it — *that* is the evidence. Questions 1–5 waived |
| `control` | a guard, a test, a check. Questions 1–4 waived; **5 still owed** — a control nobody has watched fire is not a control |
| `learning` | built to find something out. The finding is the deliverable. Questions 1–3 waived |
| `migration` | **adds** requirements rather than waiving them: the expand/contract split and mixed-version behaviour at `2-plan`, and how the *data* is restored at `5-verify`. A git tag rolls back code, never rows |

---

## 0 · Discovery  *(gate: `card-gate` refuses without all five)*

Answered before this card may leave `0-discovery`. **"I think" is not an answer to any of
them** — see `skills/discovery-first`.

**Who asked?** _a named person, role or recorded interaction — not "users"_

**What they do today instead?** _the workaround, in enough detail that you could do it yourself_

**What breaks for them if this never exists?** _the cost of the status quo, in their units_

**What number moves?** _one metric, its value now, and the value that counts as success_

**What would make us stop?** _the observation that says this was wrong_

**Skip it honestly** for a bug, a control, or something built to learn — and say which, because
a control still owes question five and a learning card is measured on the finding, not on use.

---

## 1 · Spec  *(gate: two people would build the same thing)*

**Problem.** Who has it, and what happens today without this.

**Acceptance criteria** — testable statements, not adjectives.
**At 5-verify each tick must carry its proof** — a command or a file:line. `- [x]` alone is refused:

- [ ] …
- [ ] …

**Out of scope.** The sentence that stops scope creep later.

**Must not break.**

**Proved by.** Which test, and **which guard will be watched failing**.

---

## 2 · Plan  *(gate: named files, ladder run, fits one context)*

**Files to touch** — name them:

| File | Change |
|---|---|
| | |

**Reuse ladder** (`skills/reuse-first`) — where it stopped, and what the graph said:

```
graphify explain "…"
→
```

**Context budget** — rough token count, and the split if it does not fit.

**Open questions for the human.** Ask; do not guess.

---

## 3 · Build

**What was done.** One paragraph, plain.

**Anything the spec did not say** — and the answer that was chosen. If this section is not
empty, the spec should have been fixed first.

---

## 4 · Review  *(different model than the builder)*

| Axis | Score | Note |
|---|---|---|
| Matches the spec | | |
| Nothing invented | | |
| Nothing duplicated | | |
| Nothing extra | | |
| Fits the file | | |

**Reviewed by:** _the model and vendor that read this, and how it was run — e.g. `Codex GPT-5.6
(OpenAI) · /codex:review --effort xhigh`. **Not the model that wrote the code** (§10). A card
cannot leave `5-verify` without this line._

**Verdict:** PASS / BACK TO BUILD

> `PASS` only moves the card forward. `BACK TO BUILD` returns it to `3-build` — and any axis
> scored below 3 is a `BACK`, per `skills/review-gate`.

**Security gate** (`skills/security-gate`) — one line per check:

1. Fail closed —
2. Guard in code, not prompt —
3. Authorisation before the resource —
4. Secrets scrubbed on the way out —
5. Write confirmed before it happens —
6. Generated/third-party code privileges —
7. Tenant resolved at the edge, enforced in the DB —

---

## 5 · Verify

- [ ] Acceptance criteria met, each by name
- [ ] `npm run test:offline` green
- [ ] **The new guard was watched to fail** — paste the failing output
- [ ] `/graphify` rebuilt, nothing unreferenced
- [ ] Decision recorded in `docs/DECISIONS.md`, if one was made

```
<paste the deliberate failure here>
```

---

## 6 · Done

**Merged:** · **Commit:**

**What we learned.** Anything that would have made this card easier — it belongs in
`AGENTS.md` or a skill, not in someone's memory.

**Where errors surface:** _name where a failure in this code reaches a human. A log nobody
reads is not monitoring, and `card-gate` refuses `6-done` without it._

---

## 7 · Operate  *(the board ends at 6-done; paying customers start there)*

Filled in **after** it is live, from `skills/operate-after-done`. A card sits here until
production has told you something — then it is closed, and what production said becomes cards.

**Observed in production:** _what you SAW, not what you expected. What is erroring that was not
erroring yesterday? What got slower — against the number from before this deploy, not against a
target? "No errors and latency unchanged over three days" is a complete answer._

**Fed back:** _anything production said that would change what gets built next, as card numbers.
"Nothing to feed back" is a fine answer; a missing one is not._

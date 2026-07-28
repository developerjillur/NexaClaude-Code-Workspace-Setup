# NNN — <short title>

> Stage: 0-backlog · Owner: · Opened:

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

**Verdict:** PASS / BACK TO BUILD

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

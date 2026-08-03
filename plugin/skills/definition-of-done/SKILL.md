---
name: definition-of-done
description: The checklist a card must pass to reach 6-done. Run at 5-verify.
---

# Definition of done

Not "it works". **Every line below, or the card does not move.**

## The failure this exists to stop

**Not "it does not work" — "it looks finished and is a shell."** The report says every feature
landed. Open the file and the function returns a constant, the catch is empty, the handler
ignores its argument, and the test asserts `true`. Nothing in it is a lie exactly; each piece
was *started*. It passes lint, it passes "no TODO", and the count of tests went up.

Two mechanisms, because one is not enough:

**1 · `node scripts/depth-check.mjs --changed`** — finds the six shapes of code that looks
implemented and is not: a body that is a single constant return, an empty catch with no
comment, `throw new Error('not implemented')`, a placeholder string, an assertion that cannot
fail, a handler that never touches its parameter.

Measured 2026-07-28: **0 findings across all 33 product files, 7 across a deliberately faked
implementation.** Silent on real code, loud on pretend code — which is the only ratio that
keeps a check alive.

**A finding is not automatically a defect.** An empty handler can be correct. The rule is that
each one is **fixed, or answered in the card**. Silencing the tool is not the third option.

**2 · Every ticked criterion carries its evidence.** See below — `check.mjs` refuses a card in
`5-verify` or `6-done` where a `- [x]` cites nothing.

**3 · `node scripts/verify-claims.mjs <card>` — the citations are followed.**

Rule 2 stops a bare tick. It does not stop an *invented* one. `test/emergency-gate.mjs:88` in
a ticked criterion looks exactly like proof and costs nothing to write, and until this existed
nobody ever opened the file. **That is the same failure rule 2 was built to stop, one level up.**

It reconciles the three things that never spoke to each other:

| | Checked against |
|---|---|
| §2 named these files | do they exist, and **were they actually modified** |
| a tick cites `file:line` | does the file exist, **does it have that many lines** |
| a tick cites `` `npm run x` `` | is `x` in `package.json` |
| §1 says *"Proved by `t.mjs`"* | does `t.mjs` exist, and **does it assert anything** |
| the card says *"watched it fail"* | is the failure **pasted**, or only reported |

Demonstrated 2026-07-28 against a deliberately lying card — plausible citations, every one
false: **7 findings**, including a line number in a file 9,000 lines shorter than claimed. On a
truthful card: **0 findings**, with unplanned changes reported as a warning rather than a
failure, because discovery is legitimate and discovery nobody wrote down is not.

**Fixing the claim or fixing the code are the two options. Deleting the citation is neither.**

## The checklist

- [ ] **`depth-check` run on the diff** — findings fixed or answered in the card
- [ ] **`verify-claims` run on the card** — every citation followed, and it resolved
- [ ] **Card touched a guard? `mutation-test` run** — and every mutation was caught
- [ ] **`nexa-prove` green** — the invariants ran against a real instance. Every other line on
      this list is satisfied by reading a document; this one is satisfied by the software
      working. If the card touched auth, tenancy, money or a schema, it is not optional.
- [ ] **Acceptance criteria met** — each one, individually, **with the proof beside it**
- [ ] **Tests pass** — `npm run test:offline` green, all 427+
- [ ] **The new guard has been watched to fail** — see below
- [ ] **`/graphify` rebuilt**, and nothing landed unreferenced
- [ ] **No TODO, no commented-out code, no "for now"**
- [ ] **The reuse ladder is recorded** in the card
- [ ] **Review scored**, by a different model than the builder
- [ ] **Security gate answered**, line by line
- [ ] **A decision made? It is in `docs/DECISIONS.md`** — not in chat
- [ ] **Nothing added to the front of a system prompt** (it breaks the cache prefix)
- [ ] **New dependency? Justified in `DECISIONS.md`** — this project ships one

## Does the suite catch anything at all?

`node scripts/mutation-test.mjs` — delete an invariant on purpose and see if anything goes
red. **427 green checks is a count, not evidence**, and this is the only thing that turns one
into the other.

Run it when a card touches a guard, and at `deploy-gate`. It is minutes per mutation, so it
is not in the default CI.

**First run, 2026-07-28: 2 of 3 caught.** The survivor matters — **the agent-id traversal guard
can be deleted entirely and all 427 checks stay green**, and that guard exists because
`id=../package` was a *working exploit* found by probing a live instance. Open item, recorded
in `docs/DECISIONS.md`.

## The rule that is easy to skip

> **A guard nobody has watched fail is not a guard.**

A test that passes proves the happy path. It does not prove the check would have caught the
thing it exists to catch. So every invariant ships with a fixture that **deliberately breaks
it** and asserts the check fires.

Concretely — if you added a rule that rejects an empty allowlist, the suite needs a test that
supplies an empty allowlist and asserts the rejection. Without it you have a comment that
happens to compile.

This is not theory here. This project's plan contains **five items marked done that were never
built**, and a metric that measured the wrong thing for months while its tests stayed green.

## A ticked box must say what proves it

`- [x]` on its own is a claim by the person who wants the card to move. **The evidence goes on
the same line**, and `check.mjs` refuses the card without it:

```markdown
- [x] Empty triggers refused at load — `node test/emergency-gate.mjs` · test/emergency-gate.mjs:88
- [x] Booking blocked once latched — watched failing, output in §5
- [x] Jurisdiction from agent config — src/agent-config.js:112, covered by emergency-gate.mjs:41
```

A command, or a `file:line`. Not *"verified"*, not *"tested"*, not *"working as expected"* —
those are the sentence a shell produces too. **The question a reviewer should be able to answer
in ten seconds is "where would I look to disbelieve this", and a bare tick does not answer it.**

## Moving the card

```bash
nexa-move <NNN> 6-done
```

**Never move the file by hand.** `nexa-move` is the transition function: it refuses a move the
pipeline does not define, runs that transition's guards, and rolls back if one refuses. A manual
move is refused by `guard-edit`, and on a default adoption the board is outside the repository
where a git-based move cannot work at all.

**Work that did not move a card did not happen.** The board is the record; chat is not.

## Did you run it the way a user runs it?

Before any of the above counts, invoke **`test-the-real-thing`**.

A card can satisfy every tick here — tests green, guard watched failing, claims resolving — and
still ship a feature that does not work, because all of those run in the harness rather than in
the product. Not hypothetical: on 2026-07-30 a feature passed 532 assertions, six gates and
31/31 mutation coverage, then failed **ten consecutive times** in the user's hands.

**If nothing in this card launched the real thing, end to end, at least once — write that in the
card** rather than implying coverage you do not have.

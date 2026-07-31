# What this workspace should take from XState — and what it should not

Written 2026-07-31, after a 14-agent audit and a four-vendor council both landed on the same
observation from different directions: **the board is a state machine that has no transition
function.**

Source: [statelyai/xstate](https://github.com/statelyai/xstate) (MIT). Nothing here proposes
taking a dependency on it. The value is in four ideas it got right, three of which this
workspace can adopt in under 200 lines.

---

## The one-sentence diagnosis

XState's guarantee is that state changes happen **only** through `machine.transition(state, event)`.
An event with no matching `on:` entry is a no-op. Guards are named data — `setup({ guards })`,
`guard: 'isValid'` — so `@xstate/graph` and Stately Studio read the same definition the runtime
executes.

Here, the pipeline

```
0-discovery → 0-backlog → 1-spec → 2-plan → 3-build → 4-review → 5-verify → 6-done → 7-operate
```

is nine directories, and a transition is `git mv`. Measured: `git mv board/1-spec/001.md
board/5-verify/001.md` exits 0. Four gates skipped, nothing intercepts it. The stage list is
copy-pasted into eight places, and two of the copies already disagree with each other.

---

## Worth taking

### 1 · One definition, many consumers — `plugin/pipeline.json`

XState's machine config is data that the runtime, the visualiser, the type generator and the
test generator all read. Here the same facts are re-stated in `check.mjs`'s `demands`,
`card-gate.mjs`'s `REQUIRED`, `bootstrap.mjs`'s `STAGES`, `reflect.mjs`, `verify-install.mjs`,
`commands/card.md`'s table and `AGENTS.md` §4's diagram.

They have already drifted:

- `card-gate.mjs`'s `REQUIRED` is **cumulative** — a card owes every earlier stage's answers.
- `check.mjs`'s `demands` was **not** — a requirement was discharged by moving past it.
  *(Fixed in this session; the disagreement is the evidence for this card, not the bug itself.)*
- `reflect.mjs` iterates eight stages; `check.mjs` iterates nine.

**Proposal.** A single `plugin/pipeline.json`:

```jsonc
{
  "states": ["0-discovery", "0-backlog", "1-spec", "2-plan", "3-build",
             "4-review", "5-verify", "6-done", "7-operate"],
  "transitions": [
    { "from": "2-plan", "to": "3-build", "on": "START",
      "guards": ["wip-limit", "reuse-ladder-recorded", "context-budget-fits"] },
    { "from": "4-review", "to": "5-verify", "on": "PASS",
      "guards": ["review-verdict-pass", "review-by-other-model", "security-gate-answered"] },
    { "from": "4-review", "to": "3-build", "on": "REJECT", "guards": [] }
  ]
}
```

Every consumer imports it. The `AGENTS.md` diagram and the `card.md` table are **generated**
from it, so prose promising a rule no script implements becomes impossible to write.

### 2 · The transition is the only mutator — `nexa-move`

One command that refuses a `from → to` pair not in the table, runs that transition's named
guards, and only then performs the `git mv` itself. Roughly 80 lines.

This closes two findings at once: the unguarded `git mv`, and the fact that
`Edit(./board/6-done/**)` is a permission deny rule that Bash never consults.

It does **not** need to be unbypassable. `guard-edit` should refuse `git mv` on `board/` and
point at `nexa-move`; a determined bypass remains possible and is answered by review and
`git diff`, exactly as the Bash guard's own comment already argues.

### 3 · Guards are named data, not inline regexes

This is the highest-value idea and the cheapest to demonstrate why.

`check.mjs:91` was `/Verdict:\s*(PASS|BACK)/i`. `BACK` means the review **failed**. A card
explicitly sent back satisfied the gate that exists to stop it, and CI agreed. The score demand
accepted `[1-5]`, so 1/5 — the worst the rubric defines — also passed.

That survived because **no fixture ever asked what the 5-verify guard does with a failing
verdict.** `guard-coverage.mjs` already demands a firing case and a silent case for every
control declaring `// @rules`. It cannot do that for transition guards, because they have no
names — they are anonymous regexes in an object literal.

Give each guard an id and `guard-coverage` extends to the pipeline for free. The same machinery,
pointed at the place the defects actually were.

### 4 · The events the linear diagram omits

XState makes you enumerate events. The diagram here has one implicit event — "forward" — and
real work needs:

`REJECT` · `RETURN_TO_SPEC` · `ABANDON` · `REOPEN` · `SUPERSEDE` · `INCIDENT` · `ROLLBACK`

A card that fails review has nowhere defined to go, so it goes wherever someone drags it.
`7-operate` currently has no requirements, no move row, no stage-table row and no mention in
`/deploy` — a stage nothing can enter and nothing empties.

Review and security should be **parallel substates** that join before verify. They are
independent judgements today and the board pretends they are sequential.

---

## Traps — do not do these

**Do not take an xstate dependency, and do not build an interpreter.** Git owns this state. A
runtime holding board state in memory is a second source of truth and a reconciliation bug. The
value above is entirely in the *shape* of xstate's config, not in its executor.

**Do not port `createTestModel` path generation.** Eight transitions is not a state space that
needs generating. What is missing is fixtures for guards that already exist, not enumeration of
paths nobody walks.

**Do not build a Stately-style visualiser.** `card-gate --json` plus a `--json` flag on
`check.mjs` answers "where is every card and what does it owe". A hand-rolled HTML board is a
Saturday project that rots by the following Saturday.

**Do not adopt actor-model supervision wholesale.** The idea worth stealing is narrow: subagents
and vendored CLIs need job identity, parent ownership, timeouts, cancellation and result
provenance. The council already has most of this — `verify-containment.mjs` measures whether a
member can write outside its scratch directory, and excluded Grok by default when it could. A
statechart actor would not have caught that; a containment probe did.

---

## What xstate-the-repository does that this one does not

Observed from its own layout and CI, and worth separating from the library's ideas:

- **A changeset per pull request**, so the changelog is a build artefact rather than prose.
- **Typegen** — the machine definition produces types, so a guard named in config and missing
  from the implementation is a compile error. The analogue here is card 003: run the demand
  regexes against the blank template as a required fixture, so a gate that matches nothing real
  cannot pass.
- **Every package tested against multiple framework adapters.** The analogue is testing the
  plugin in both its deployments — installed-from-cache and in-repo. `plugin-packaging.test.mjs`
  does this and it is the test that caught a false failure introduced during this very session.

---

## Sequencing — and what is now done

The pipeline work was deliberately not first. Until the gates could tell "clean" from "did not
run", a pipeline change could not be verified.

1. ~~001, 002, 003~~ — **done 2026-07-31.** The gates fail when they cannot run.
2. ~~004~~ — **done.** `Verdict: PASS` only, cumulative demands. The worked example for §3.
3. ~~011a~~ — **done.** `plugin/pipeline.json` exists and is read by `card-gate.mjs`,
   `check.mjs` (both copies of the list) and `bootstrap.mjs` through `stages()` in `roots.mjs`.
   The nine stages are written once; the only remaining duplicate is a three-line fallback in
   `roots.mjs`, next to the file it mirrors.
4. ~~011b~~ — **done.** `nexa-move` is the transition function. It refuses a `from → to` pair
   the pipeline does not define *before running any guard* — an invalid move is not a move that
   failed its checks, it is one that does not exist — runs the destination's guards, and rolls
   the `git mv` back if one refuses. `guard-edit` refuses a raw cross-stage `git mv` under
   `board-move-unguarded` and points here. Renaming within a stage stays silent.
5. **011c** — guard ids exist in `pipeline.json`, but `guard-coverage` does not yet demand a
   firing and a silent fixture *per transition guard* the way it does per control file. **This
   is the one left, and it is the one that would have caught `Verdict: BACK`.**
6. **011d** — generate the `AGENTS.md` diagram and the `/card move` table from the machine.
   Both are currently hand-written and correct; nothing stops them drifting again.

### What 011b did not attempt

`nexa-move` is **not** unbypassable and does not try to be. `git mv` still works from a shell
that does not run the hook. What it removes is the careless skip, which is the one that actually
happened — measured, `git mv board/1-spec/001.md board/5-verify/001.md` exited 0 and crossed
four gates. A determined bypass is answered by review and `git diff`, exactly as the Bash guard
already argues about constructed paths and heredocs.

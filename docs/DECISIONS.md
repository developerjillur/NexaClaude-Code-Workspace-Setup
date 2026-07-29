# Decisions

One entry per decision that was **expensive to reverse** or that a future reader would
otherwise re-litigate. Not a changelog — a changelog says what changed, this says *why the
other option was refused*.

**A decision recorded only in chat did not happen.** That is `AGENTS.md` §7, and it is the rule
most often skipped, because writing it down feels like overhead at exactly the moment the
answer feels obvious. It stops feeling obvious in four weeks.

---

## Format

```markdown
## YYYY-MM-DD — <the decision, as a sentence>

**Context.** What forced a choice.

**Options.** Each one, with the honest case *for* it — including the one that lost.

**Decision.** What was chosen.

**Why the others were refused.** The valuable half. A future reader arrives holding one of
these and needs to know it was considered, not overlooked.

**How we would know this was wrong.** The observation that would reopen it. A decision with
no falsifier is a preference.
```

---

<!-- Your first entry goes here. Delete this comment when it does. -->


## 2026-07-29 — headroom is not adopted; three things from it are

**Context.** [headroom](https://github.com/headroomlabs-ai/headroom) (Apache-2.0, 63k stars,
active) compresses tool outputs, logs, file reads and conversation history before they reach
the model. Fully local, so it does not violate the no-external-API rule. `headroom wrap claude`
is turnkey.

**Options.** Adopt the proxy · adopt nothing · take the ideas and refuse the mechanism.

**Decision: take the ideas, refuse the mechanism.**

**Why the proxy was refused** — three reasons, in the order they matter:

1. **It changes what the model sees, and that is the failure class this workspace exists to
   prevent.** A silent UTF-8 corruption bug was found in the council on the same day, at
   exactly such a boundary: bytes accumulated across a pipe and decoded per chunk. A
   compression layer is a new surface of the same kind, and its failure mode — *the agent got
   a subtly different file than the one on disk* — is the hardest to detect and the one
   `verify-claims` and `depth-check` both silently depend on not happening.
2. **It does not close the gap that was actually measured.** The council named the static
   ~5,188-token contract loaded every session. headroom explicitly does not touch the system
   prompt: *"CacheAligner never rewrites prompts… frozen prefix byte-identical so provider
   cache is not busted."* Correct design on its part, and orthogonal to our problem.
3. **Nothing in its README says it works with a subscription login.** Copilot gets an explicit
   `--subscription` flag; for Claude there is only `ANTHROPIC_API_KEY` and
   `ANTHROPIC_BASE_URL`. This whole project stands on a subscription, and on a subscription
   token savings buy context, not money — a real benefit, but a different one from the
   headline.

**What was taken:**

- **The counterfactual-claim discipline** → `skills/measure-dont-claim`. Their own honesty
  about unobservable savings is better than anything this workspace had said about it.
- **"Skip it if you…"** → the README. Naming who a tool is wrong for is a quality signal, and
  we had none.
- **The staleness question it made us ask** → `scripts/graph-fresh.mjs`. Looking at how
  headroom keeps a *frozen prefix* trustworthy prompted the obvious question about our own
  cached knowledge, and the answer was bad: the graph was built at HEAD with all 61 files
  indexed, and **32 of them had changed since, uncommitted.** The contract sends every agent
  to that graph first.

**How we would know this was wrong.** If context exhaustion becomes the binding constraint
rather than review throughput — i.e. if sessions start dying on window size rather than on
work finished — the proxy is worth re-testing, against a diff of two identical runs with and
without it, byte for byte, on our own material rather than on GSM8K.


## 2026-07-29 — A freeze on new controls, and a kill audit before any deletion

**Context.** Sixteen controls, sixteen wrong on their first version, thirteen failing open. A
meta-gate was built to force both directions to be tested. A council was then asked what that
meta-gate cannot see, and whether the workspace is past the point where another control helps.

**Its answer to the second question was one word:**

> *"Yes. This workspace is past the point where another control should be presumed to improve
> it."*

**And on the first:**

> *"`guard-coverage` proves only that assertion TEXT exists on both sides. **Everything between
> the text and the behaviour is invisible to it.** Two points do not prove the classifier, the
> execution path, or deployment."*

The sharpest instance is self-referential: **the metacontrol cannot discover a control that
uses `process.exitCode`, throws, or is a symlink** — it recognises only literal
`process.exit(1|2)` in two directories.

**Why they fail open, and it is structural rather than local:**

> *"These are open-world **denylist recognisers**: find a forbidden pattern, append a finding,
> fail if the list is non-empty. In that architecture **every mistake rounds the same way** —
> an unexpected input falls through the guard clause and passes."*

The remedy is in how they are written, not how they are tested: **parse into a structure
rather than matching substrings, and model what is ALLOWED rather than listing what is not.**

**Options.** Add control #18 · delete the meta-gate and collapse the board now · freeze and
measure first.

**Decision: freeze, then measure.** No new control until an end-to-end kill audit has run:
break each control's real invariant in a disposable checkout, invoke the **actual top-level
entry point**, and record whether anything notices. A control nothing notices is a candidate
for deletion.

**Why not delete now**, which was the other recommendation on the table:

> *"'Remove something now' is the fashionable answer, but the data to pick the victim does not
> exist. **Removing by intuition would repeat the exact error** the record is full of."*

**And a live-catch ledger alongside it:** every control, on refusal, appends one line — when,
which, what it refused, and whether the input was real. **Deletion follows that data rather
than a feeling.**

**How we would know this was wrong.** If the freeze holds for a month and nothing is deleted
and nothing is measured, the freeze became procrastination with a rationale. The audit is a
card or it is not happening.


## 2026-07-29 — The kill audit ran, and the secret scanner had never worked

**The freeze recorded yesterday said: no new control until an end-to-end kill audit has run.**
It has run. `scripts/kill-audit.mjs` — eighteen mutations across eight of the fourteen scripts
that can refuse. Each deletes **one real rule** and leaves the control otherwise fully alive:
the `tee` write pattern, the TBD placeholder list, the git-history pass of the secret scanner,
the "assertion is a constant" shape in the stub detector. It runs every suite and the deploy
gate per mutation, restores the file in a `finally` and again on `exit`, and refuses to run at
all against an already-red baseline.

**A survivor is a protection that could be deleted that morning with every test still green.**

| run | mutations | caught | survived |
|---|---|---|---|
| first | 11 | 7 | **4** |
| extended to scan-secrets, depth-check | 18 | 12 | **6** |
| after repairs | 18 | **17** | 1 |

### The finding that matters: a control that had never worked

`scan-secrets` is the deploy gate that keeps credentials out of a public repo. **All four of
its mutations survived**, including the one that makes it find every secret in the tree and
exit 0 anyway. It had no test at all.

Worse, `guard-coverage` was reporting it **✅ 1 refuse · 1 silent** — because the string
"scan-secrets" appears in a **prose comment** inside the prompt scrubber's block, and the
collector counted that block's assertions as its fixtures. **The metacontrol read a comment as
coverage.**

And underneath that, a live defect nobody had seen:

> The history pass hands **JavaScript regex source to `git grep -E`**. POSIX ERE has no
> `\b`. git rejected nine of the ten patterns, the `git()` helper swallowed the non-zero
> exit, and the loop printed `history N commits scanned`. **Only `private key block` — the one
> pattern without a `\b` — was ever searched.** On macOS git 2.50, since the day it was
> written.

**How it surfaced is the part worth keeping.** Deleting the entire history pass changed
nothing, because *deleting something that does nothing is invisible by construction*. So the
fixture that pass should satisfy was written — commit a secret, remove it, scan — and **it
failed against the unmutated file.** The mutation did not find the bug; the fixture the
mutation demanded did.

Fixed with `-P` where git has PCRE, and dropping the `\b` anchors where it does not — which
matches MORE, never less, the only safe direction for a scanner to be wrong in. Both paths have
fixtures; the fallback via a `NEXA_SCAN_NO_PCRE=1` seam, because **a fallback that only runs on
machines nobody here owns is a fallback nobody has watched work** — which is precisely how long
this one was broken.

### One law, found three times in an afternoon

Every survivor in the first run *had* a fixture, and every fixture was green.

> **A fixture that differs from the passing case in more than one way proves neither.**

- the reported wakeup carries `delaySeconds: 300`, so the SHORT-DELAY rule blocked it
  identically — `=== 2` cannot tell the two rules apart
- the TBD card also omitted three questions outright, so it was refused whether or not the
  placeholder list worked
- the coverage probe had *no* assertions, so it tripped `no-refusal-case` and never reached the
  branch under test
- and then, writing the repair, `export function load(id) { return null }` tripped
  `unused-param` as well as `stub-return` — **the same mistake, made while fixing it**

The repair is never another control. It is a fixture that changes **exactly one variable** from
a case already known to pass, plus assertions on *which* refusal came back rather than that one
did.

### What this cost, and what it does not prove

The audit takes about twenty-five minutes, because it runs every suite once per mutation. It is
not a per-commit check — it is what you run after touching a control, and the freeze is what
makes that affordable.

**Six of the fourteen refusing controls still have no mutations**: `check.mjs`,
`council-sync`, `mutation-test`, `reflect`, `mutate-controls`, and `kill-audit` itself.
Eighteen of eighteen caught is a statement about the eight that were measured.

**How we would know this was wrong.** If a later audit finds zero survivors on its first run,
either the controls are genuinely watched, or **the mutations were written to match the tests.**
The list is only honest while each entry is derived from the control's rules rather than from
the suite's fixtures.


## 2026-07-29 — The council audited the audit, and it was a survivor of its own test

**A four-vendor council** (GPT-5.6 via Codex, Gemini 3.1 Pro, Fable 5, Sonnet 5 — Grok excluded
for failing containment) was given the kill audit's findings. 4/4 answered; **reasoning overlap
0.07** with the pack's own vocabulary removed, so the agreement below is not four models
restating the brief. Verbosity correlation was 0.92 — length was doing work in the ranking, and
the two top-ranked answers were also the two longest. Read the arguments, not the tally.

### The finding, which was verified by running it rather than accepted

Two members independently read the same fail-open off `kill-audit.mjs`:

> *"A skipped mutation cannot fail the run. `pattern absent`, `not-applicable` and `no-op`
> all fall through, and the exit code depends only on `survived.length`. **A file whose stated
> purpose is hunting fail-open silence contains an unguarded fail-open of its own shape.**"*

One of them made it its explicit falsifier, so it was **tested instead of argued about**:

```
$ node scripts/kill-audit.mjs --only=does-not-exist
  ── 0 caught, 0 survived ──
$ echo $?
0
```

**An audit that tested nothing, reporting success, inside the file built to find exactly that.**

### What changed — four fail-opens, all named by the council

| | before | now |
|---|---|---|
| a mutation whose pattern drifted | vanished from numerator **and** denominator | `unresolved` — a failure of the audit, exit 1 |
| `--only=<typo>` | 0 caught, 0 survived, **exit 0** | exit 2, with the list of real ids |
| a suite that timed out | `status: null !== 0` → scored **"caught"** | `incomplete` — inspection could not complete |
| the denominator | never printed | every run names the refusing controls with **no** mutation |

That last one corrected a claim the same afternoon: the write-up said "eight of fourteen
controls". It was seven — `verify-claims` had none. **The denominator caught a wrong number
the moment it was printed**, which is the whole argument for printing it.

`kill-audit` now has the harness the council asked for, since it cannot mutate itself: a
`NEXA_KILLS_FILE` seam pointing at a throwaway workspace with one fake control whose two rules
have deliberately asymmetric fixtures. That makes a **genuine survivor** reachable in
milliseconds rather than twenty-five minutes — caught, survived, restored-byte-for-byte,
drifted-pattern, unknown-id, red-baseline.

### And adding `verify-claims` produced the sharpest lesson of the day

Its failing fixture cited **both** a missing planned file and a missing proof, so deleting the
proof rule left the other to refuse identically — the fifth instance of the same law. The
replacement pair looked isolating and was not: the obvious mutation
(`if (!real) bad(` → `if (false) bad(`) falls through to the `else` and reads a null path, so
the control **crashes**. Node exits 1, and an `=== 1` assertion **accepted a stack trace as a
refusal**.

> **One bit cannot distinguish "refused" from "died".**

That is the coarse-oracle problem underneath every survivor found today, and it landed on the
person diagnosing it. The fixtures now assert the message and check explicitly that the
refusal did not come from a `TypeError`.

### Where the council split, which is the part worth keeping

- **On what "19 of 19" means.** One member: *"18/18 is the guaranteed terminal state of any
  repair loop, whatever the quality of the repairs. Read the first-run numbers as the
  measurement and 18/18 as a regression baseline."* Another: report it as *"N selected mutants
  killed; six refusing controls remain unaudited"*, **never as a percentage suggesting
  completeness.** Both are now enforced by the scope line the run prints.
- **On which uncovered control matters most, they disagreed and both were reasoned.**
  `kill-audit` on epistemic grounds — trust routes through it, so a defect fails open at
  maximum blast radius in the voice of success. `check.mjs` on operational grounds — it is the
  deploy gate. A third argued `check.mjs` needs it *least* because its refusal only protects a
  number in a doc header. **That disagreement is unresolved and is not being resolved by
  assertion.**

### What was NOT done, deliberately

Both top-ranked members proposed the same deeper fix, independently: **every refusal carries a
rule id, and fixtures assert the id rather than the exit code.** It would make an
over-determined fixture fail immediately instead of silently proving nothing, and would have
refused the `scan-secrets` prose-comment false positive outright — *"per-rule coverage"* rather
than "the control's name appears near assertion text".

**Five of the six findings today would have been impossible with it.** It is also a change to
every control in the workspace, which is past what a freeze permits without the owner's
decision. **Recorded as the recommended next step, not taken.**

### Result

```
kill-audit    19 caught, 0 survived, 0 unresolved, of 19 selected
scope         8 of 14 refusing controls carry mutations
hooks.test    200 passed, 0 failed
```

**How we would know this was wrong.** The remaining six controls are unaudited, and one of them
is the deploy gate. If the next audit round adds mutations for `check.mjs` and finds no
survivors on the first run, that is either good news or evidence the mutations were written
from the fixtures — the record above is the only thing that makes the difference checkable.

### Follow-on the same day — the deploy gate, which the council argued about

`check.mjs` was the largest name on the unaudited list. The council split on it: the
**operational** priority, because it is the deploy gate — against **needs it least**, because
its own refusal protects a number in a doc header. What settled it is neither: **check.mjs
delegates.** A lost child verdict silently disables another control's findings without touching
that control at all, so the defect is invisible from anywhere except the gate's own fixture.

Three deletions, all now caught: card-gate's findings stop being counted, guard-coverage's stop
being reported, and the gate prints its failures and then exits 0 — **the eleventh fail-open
this workspace has had, deliberately reintroduced to check that it stays dead.**

The oracle follows the advice literally — *"it must name the missing gate, not merely observe
exit 1 somewhere."* The fixture plants a card that skipped discovery on the real board, asserts
the refusal says **card-gate** by name, asserts the total is reported before the truncated list,
and confirms the workspace goes green again once it is removed. Anything weaker would let an
unrelated failure mask the deletion, which is the confounding law one level up.

```
kill-audit    22 caught, 0 survived, 0 unresolved, of 22 selected
scope         9 of 14 refusing controls carry mutations  (was 5 of 14 when the audit began)
hooks.test    206 passed, 0 failed
```

Still unaudited, and named on every run: `council-sync`, `kill-audit`, `mutate-controls`,
`mutation-test`, `reflect`. Two of those (`mutate-controls`, `mutation-test`) are candidates
for **retirement rather than coverage**, if `kill-audit` is shown to subsume them — which is a
measurement nobody has taken, and the reason they are still here.

## 2026-07-29 — Rule ids, piloted on one control, and measured

Two council members proposed the same repair independently, and it was the largest thing left
undone: **every refusal carries a rule id, and fixtures assert the id rather than the exit
code.** The argument was that an over-determined fixture then stops being silently worthless —
delete rule A while rule B also fires, and the assertion "rule A fired" fails immediately.

It touches every control, so it is **piloted on `guard-edit` alone** — four refusals
(`discard-uncommitted`, `no-card-in-build`, `wip-limit`, `no-reuse-ladder`), each now printing
`refused: <id>` on its own first line before the prose a human needs.

### What was measured, and what it cost to get right

The point of a pilot is a number, so a mutation was written whose only job is to test the claim:
delete the WIP rule and see whether a fixture notices *for the right reason*.

**The first attempt at that fixture was wrong, and the comment explaining it was confidently
wrong in exactly the way the fixture was meant to illustrate.** It gave the second card a reuse
ladder; `cards[0]` after sorting was that card; so deleting the WIP rule produced exit **0**
and an ordinary exit-code assertion caught it perfectly well. The claim that it demonstrated
anything about confounding was false, and was found by running it rather than by trusting it.

The genuine case needs both cards without a ladder. Measured, same input:

```
WIP rule present  →  refused: wip-limit        exit 2
WIP rule deleted  →  refused: no-reuse-ladder  exit 2
```

**Same bit, different rule.** `=== 2` passes either way; `/^refused: wip-limit$/` does not.
That is the mechanism, demonstrated rather than argued, and it is the first direct evidence in
this repo that the rule-id change does what the council said it would.

### What is deliberately NOT done

- The other thirteen controls still answer with one bit.
- `guard-coverage` still attributes fixtures by **control name**, which is what let a prose
  comment count as coverage for the secret scanner. Counting **rule ids** instead is the change
  that would have refused that outright — and it is only worth doing once enough controls emit
  ids for the count to mean anything.

**How we would know this was wrong.** If ids drift out of sync with the code — an id kept while
the rule beneath it changes meaning — the assertion becomes a spelling test and is worse than
the exit code, because it looks specific. The guard against that is that every id is emitted
from the same call that refuses, so deleting the refusal deletes the id.

```
kill-audit    23 caught, 0 survived, 0 unresolved, of 23 selected
hooks.test    210 passed, 0 failed
```

## 2026-07-29 — A control was deleted, and the data to justify it finally existed

A council refused to name a deletion candidate one round ago, and was right to:

> *"'Remove something now' is the fashionable answer, but the data to pick the victim does not
> exist. **Removing by intuition would repeat the exact error the record is full of.**"*

It named the measurement that would change that: whether `kill-audit` subsumes the tools that
came before it. **That was measured today rather than reasoned about.**

### `mutate-controls` — retired

It flipped each control's `exit(2)` to `exit(0)` and asked *"is this control watched at all?"*
Run against the current workspace:

```
·  scripts/hooks/guard-edit.mjs     pattern not present — skipped
·  scripts/hooks/guard-wakeup.mjs   pattern not present — skipped
✅ CAUGHT  scripts/card-gate.mjs
✅ CAUGHT  scripts/guard-coverage.mjs
✅ CAUGHT  scripts/graph-fresh.mjs

── 5 caught, 0 survived ──
```

**Read that carefully. It printed "5 caught" having tested three.** Both hooks were skipped
because their `block()` signature changed when rule ids went in, and its patterns did not
follow. Then it exited 0 — the **same skip fail-open** `kill-audit` had and closed, still open
here, in a tool that had already been superseded.

Coverage, compared by file:

| | files | depth |
|---|---|---|
| `mutate-controls` | 5, of which 2 now silently skipped | one exit-code flip per control |
| `kill-audit` | **9** — a strict superset of those five | 23 mutations, one real rule each |

Every file it touched, `kill-audit` touches, at rule depth instead of exit-code depth. It
contributed nothing, and carried a known way of lying about it.

**Deleted.** Not because the workspace felt crowded — because two tools measured the same thing
and one of them was measured to be worse.

### `mutation-test` — kept, and the reason is the opposite one

It looked like the same kind of duplicate and is not. **`kill-audit` mutates the WORKSPACE's
controls; `mutation-test` mutates YOUR PRODUCT's invariants.** Neither subsumes the other, and
the argument for keeping it is a measurement it produced on the project this was extracted
from: a path-traversal guard could be deleted entirely while **427 assertions stayed green** —
a guard that existed because the exploit had been demonstrated against a live instance.

It did, however, need repair on a different axis: it shipped four mutations against
`src/agent-config.js` and `src/redact.js`, files that exist only in that one product. For
anybody else they resolved to nothing, it printed "skipping", and it **reported success having
tested zero invariants.**

`no-product-leakage` did not catch that, and had stated in advance that it would not: it
matches words, and a **leaked assumption about directory layout carries none.** That is the
ceiling of a denylist, demonstrated on this repo instead of argued about.

Mutations are data now — `mutations.json`, with `templates/mutations.example.json` as a worked
example — and an empty run says *"nothing was tested"* rather than printing a tick. Six
fixtures, which it had never had at all.

**How we would know this was wrong.** If a future defect is found in a control that
`mutate-controls` would have caught and `kill-audit` does not, the deletion was premature and
the answer is a mutation in `kill-audit`, not a resurrection. The coverage table above is what
makes that checkable.

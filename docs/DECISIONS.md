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

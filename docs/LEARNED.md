# What we have learned

Patterns across the record, not a summary of it. Written by `skills/reflect` over the material
`scripts/reflect.mjs` gathers. **If a line here would fit inside one entry of
`docs/DECISIONS.md`, it belongs there instead.**

Newest first. Each pattern carries the evidence, because a pattern with no instances is a
slogan — and this project keeps a 77-item list of what confident slogans cost.

---

## The numbers I choose are guesses until something makes me measure them

**Fourth reflection, `5ec1d4e..d103257`.**

Three limits in this workspace were set because they felt right. Every one was wrong when
finally measured, and none of them announced it:

| Number | Chosen | Measured |
|---|---|---|
| `AGENTS.md` cost in `context-budget` | ~2,000 tokens | **4,700** — every card's budget was out by 2× |
| council context ceiling | 30k tokens | **capacity was never the limit** — at 80k a member stops *following instructions* rather than erroring |
| `MAX_FILE_CHARS` 24k | "one large file" | halved real files that fit comfortably |

**The shape is the same each time: a plausible number, never challenged, silently wrong.** And
the failure is never an error — the card just budgets wrong, or a member confidently answers
from half a file, or summarises instead of obeying.

So the rule this earns: **a constant that shapes behaviour is a claim.** It goes in
`measure-dont-claim` alongside latency and cost, and *"it felt about right"* is the same
sentence as *"the plan says 978 ms"* — which is one of the 77.

The council's ceiling probe is the model for how to fix one: pick the smallest test that would
disprove it (a one-word instruction after a large payload), run it against the real thing, and
write both the number and the method beside it.

## The best finding of the day came from a tool auditing its own author

The council was pointed at the controls built to police *it*, and four of five members
independently named `guard-edit.mjs` as theatre — with the exact bypass, which was that the
hook only saw `Write|Edit|NotebookEdit`.

**I had been using that bypass all day.** `sed -i`, `printf >>`, python heredocs — every one
edited product code with the guard silently allowing it. The two-vendor review never caught it
either, because **a review reads diffs, and this was visible only in tool selection.**

The transferable part is not "add Bash to the matcher". It is that **a control's author is the
worst person to audit it**, because the bypass they use daily is invisible to them precisely
*because* it is habitual. That is an argument for the council existing at all — and the first
concrete evidence that it earns its cost.

## Green is a count until something has been broken on purpose

**Third reflection, `efa285d..5ec1d4e`.**

427 checks were green for weeks. Then three real invariants were deleted one at a time to see
what noticed: **two were caught, one survived.** The survivor was the **agent-id traversal
guard** — which exists because `id=../package` was a *working exploit*, found by probing a live
instance. It can be removed entirely and the suite stays green.

Nothing in the workspace could have told you that. `depth-check` says the code is not a stub.
`verify-claims` says the citations resolve. The suite says 427 pass. **All three are true and
the guard is untested.**

So the general form: **every check here answers "is this claim consistent with the artifact".
Only mutation answers "would we notice if it were wrong".** They are different questions and
the second one is the one a customer experiences.

**Corollary, from the same run:** the test suite itself had never been depth-checked — it was
scoped to `src/`, `tools/` and `server.js`. Running it on `test/` found **7 assertions that
cannot fail**, including `check('Cache is resettable for tests', true)`. They raise the count
and prove nothing. *The thing that measures quality is not itself exempt from being measured.*

## Every control I add is wrong the first time, in the same direction

**Now at six instances**, and the direction has never varied: the check fires on something it
should not, or passes something it should not, and **always in a way that reads as success**.

| Control | First version |
|---|---|
| tool-presence | looked for a `ponytail` binary that does not exist |
| prompt-log | would have failed `--strict` on every CI run |
| settings-drift | blind to `PreCompact` the moment it was added |
| `reflect --check` | a broken marker read as *current* |
| `verify-claims` | "planned but not modified" fired on the **honest** card |
| `mutation-test` | warned about 14 files it had never touched |

The pattern is strong enough to act on: **write the false-positive case before
writing the check.** Every one of these was found by running the new check against a case it
should be *silent* on — never by reading it, and never by the case it was built to catch.

## A default that arrived from outside a decision still looks like a decision

**Second reflection, over `31d5ec9..efa285d`, 11 decisions.** This is new, and it is the sharper
sibling of the pattern below.

Three settings turned out to be **inherited rather than chosen**, and each looked settled:

| Looked decided | Actually |
|---|---|
| our subagents run top-tier | `explorer` was on `sonnet` — the search agent everything trusts |
| the review path runs top-tier | five **plugin** subagents shipped on `sonnet`, incl. `codex-rescue` |
| Codex reviews at `xhigh` | true **only** because this machine's `~/.codex/config.toml` says so |

The common shape: **nothing was wrong, nothing was warning, and nothing had been decided.** A
value was doing its job with an origin nobody had checked. The third is the clearest — every
Codex review that day genuinely ran at `xhigh`, and would have silently dropped on any other
machine, with the review still returning a confident answer.

**So the question to ask of any setting that matters is not "is it right" but "where did it
come from".** Right-by-inheritance survives until the environment changes, and then fails
quietly, which is the worst available failure mode.

Corollary, and it is why three checks were added rather than three fixes: **a fix you cannot
detect the reversal of is not a control.** Two of these three revert automatically — plugin
caches on update, global config on a new machine.

## Every control added today needed a second pass to be correct

Ten were added. **Four were wrong on the first attempt, in four different ways**, and all four
were found by running them rather than reading them:

- the tool-presence check looked for a **`ponytail` binary that does not exist** — it is a
  plugin. It would have warned forever until someone deleted the check
- the prompt-log check would have **failed `--strict` on every CI run**, because the directory
  it looks for is gitignored and therefore never present in CI
- the settings-drift check was **blind to `PreCompact`** the moment `PreCompact` was added
- `reflect --check` **read a broken marker as "current"**, because `git log <bad-sha>..HEAD`
  fails and an empty result looks like no new commits

Three of those four are the *same* failure — **failing open, silently, in a way that reads as
success**. That is worth stating as a design rule rather than four anecdotes: when a check
cannot evaluate its input, the answer is **refuse**, never **pass**.

And the meta-lesson, which is uncomfortable: these were written *by* the process that exists to
catch this, *on the day* the process was being praised for catching it. **The tests found them.
Review did not.**

## Reading a control is not knowing whether it runs

**First reflection, over `31d5ec9..bb83de5` and 4 decisions.**

This is the strongest pattern in the record, and it has now produced **six** instances in two
days. Every one was found by *running* something that had been *read* and believed:

| Believed | Found by running it |
|---|---|
| the board gates were on | absent in the directory where all the code lives (`31d5ec9`) |
| CI enforced the gates | 3 of 4 jobs pointed at a path CI never has |
| the hygiene job was green | it passed *because* the directory was missing — `grep` on a missing dir exits 2 |
| `--strict` was the strict setting | it failed on a false positive, so nobody could leave it on |
| the contract's tool list was installed | `ponytail` was not, and nothing checked (`bb83de5`) |
| `SETUP.md` described the setup | 4 of its 7 steps were stale, including one contradicting `.gitignore` |

**The transferable half is the kind of reasoning that produced each wrong belief:** every one
came from reading an artifact that *described* a control, rather than executing the control
and observing what it did. The artifact was always accurate about intent and silent about
whether it was wired.

So the habit that pays here is narrower than "test things": **when a control's value is that
it refuses, the only evidence it works is watching it refuse.** That is `AGENTS.md` §4's rule
about guards, and it turns out to apply to the workspace's own machinery, not just to product
tests. `check.mjs` gained a settings-drift check and a tool-presence check for exactly this
reason, and both were watched failing before being trusted.

**Corollary, learned the same way:** a check that fires falsely is worse than no check,
because the fix people reach for is to stop running it. Two of the six above were false
positives in our own gates.

## We keep trading provability for behaviour, and it is deliberate

Three decisions in one day made the same trade in three different places, and none of them
says it is a pattern:

- **Criterion 3 of card 001 was cut** rather than weakened — the behaviour (the agent stays on
  the line) is kept; the *claim to guarantee it* is dropped, because caller hang-up makes it
  unprovable in principle
- **"Operator notified" was defined down to a webhook**, with the sentence *a webhook nobody
  watches is not a person being told* written into the card
- **`skill-finder` refuses to auto-install**, accepting slower adoption for a reviewable one

The through-line: **when something cannot be guaranteed, say so and keep doing it, rather than
claiming a guarantee the gates cannot check.** §4 will not pass an acceptance criterion that
can never be watched failing, so an unprovable criterion is not a strong spec — it is an
untestable one, which is weaker than an honest small claim.

Watch this one. The same reasoning would justify quietly shrinking any hard requirement, and
the difference between honest scoping and scope erosion is only ever visible in the record.

## Popularity is not applicability

Four outside repositories were evaluated; the useful one had **877 stars** and the two with
~190,000 were largely already covered by the contract. Karpathy's four principles map one-to-one
onto `spec-first`, `reuse-first`, §6 and `definition-of-done` — arrived at independently, which
is a reason for confidence and not a reason to copy.

The reusable form: **the reuse ladder applies to skills, prompts and process, not only to
code.** Rung 1 — *does this need to exist at all* — killed a 51,427-star design system in one
line, because its problem is not our problem.

## What a fresh agent gets wrong on day one

Both are invisible from `AGENTS.md`, which is why they are here:

1. **Opening the code directory instead of the workspace.** It is the natural place to work and
   it used to silently disable every gate. Fixed in `31d5ec9`; `check.mjs` now refuses if the
   two sides drift.
2. **Looking for the one skill that matches "build this feature."** There isn't one — that
   request is the whole board. §9 now draws the flow for this reason.

### Sixteen controls, sixteen wrong on the first version — and now a gate about it

**Updated 2026-07-29.** The count is no longer a curiosity; it is the most reliable prediction
this workspace makes about its own work.

| | |
|---|---|
| controls added | **16** |
| wrong on their first version | **16** |
| failing OPEN — passing when they should refuse | **13** |
| found by the case they were built to catch | **0** |

**Every single one was found by running the case it was supposed to stay SILENT on.**

The lesson was written here three times and kept happening anyway — twice in one afternoon,
*while fixing a council's criticism that the controls in this workspace only advise*. Writing
it a fourth time would have been the same mistake in a new paragraph, so it is
`scripts/guard-coverage.mjs` now: every script that can exit 1 or 2 must have both a refusal
assertion and a silent assertion in the suite, and `check.mjs` **fails** without them.

**It found four controls with no fixtures at all on its first run — including itself**, which
is the correct answer and slightly embarrassing.

**And it was wrong on its first version too**, in the same family, three times over:

- it looked for `check(` alone, so `graph-fresh`'s five refusal assertions — written through a
  local `once(opts, want, why)` helper — read as zero;
- it required a quoted string of twelve characters, so `check('refuses ' + why, …)` read as
  zero, because the description lives in a loop variable;
- its own probe was named as a literal in the suite, so `guard-coverage` found "assertions"
  for the probe — *this very block* — and reported it as covered. **A probe whose name appears
  in the thing it probes measures nothing.**

Sixteen for sixteen, and the seventeenth was the gate about the sixteen.

### A window is not a record

A check read a 200-character window from each plugin's name to find its status. A plugin's
block is four lines. **The window ran into the next entry and read ITS status**, and two
enabled plugins were reported as disabled — one of them the second model the entire review
path stands on.

Parse the record. The shape of the data is not "somewhere near the name".

### A fixture that misses the path is indistinguishable from a control that does

`verify-claims` was reported as failing open on a card citing a file that did not exist. It was
not. The fixture put the citation in free prose, and `verify-claims` reads the **structured
sections** — §2's file table, §1's *"Proved by"*. Rewritten to the real shape, it refused
immediately.

**Before concluding a control is broken, check that the fixture reaches it.** The two look
identical from the outside, and one of them is an accusation.

### Stable, not empty

Two assertions demanded that `prompt-check` say *nothing* on an unchanged state. That held only
in a workspace with nothing in flight. It reports standing facts — a stale reflection, a graph
behind its tree — that no amount of priming clears.

**The design guarantees it speaks about CHANGES, so the property to assert is that the same
state twice says the same thing** — not that it says nothing. An assertion that encodes a
tidier world than the one the tool lives in fails on every real repository.


## 2026-07-29 — Generalisation is the failure mode, and narrowing is what catches it

Nine mistakes surfaced today across the plan, the workspace and this session's own work.
They look unrelated. They are one shape.

**Every one was a claim that outran the conditions it was measured under.**

| The claim | What it actually was |
|---|---|
| *"Codex has a 25.8 s floor"* | one prompt, one machine, one flag set — **11.6 s** re-measured |
| *"the wedge trade has no regulatory load"* | never checked against GB law, which regulates it criminally |
| *"open-connector is fast, so adopt it for the voice path"* | discovery is fast; **execution was never timed** |
| *"999 UK"* on the emergency card | right for emergencies in general, **wrong for gas** |
| *"seven days from the kill date"* | a real deadline, **from a different document** |
| the ledger regex, the guard regex | each matched one shape and was treated as *the* matcher |

None of these were careless. Each was a true statement one context too wide.

**What caught all of them was the same move: making something MORE specific.** The wedge
narrowing from "trades" to "London gas" exposed the wrong emergency number. A probe naming one
concrete command exposed a hole that reading the pattern did not. Section-aware scanning exposed
convictions masquerading as open questions. Asking the council *"which of these three is wrong"*
rather than *"review this"* got two rescinded in one round.

> **A measurement is evidence for the conditions it was taken under and a hypothesis everywhere
> else.** The plan's 77 disproven claims are 77 instances of forgetting the second half.

## The corollary, demonstrated against ourselves

`guard-edit.mjs` documents, inside itself, an agent destroying two days of uncommitted work with
`git checkout`. **I read that file and did it the next day.** `AGENTS.md` §2 states that nothing
on the audio path may touch the network; I proposed putting an unmeasured third-party HTTP call
there, in the same document that quotes the rule.

This workspace already knows the answer — *"a prompt is a request; a gate is a refusal"* — and
today is its proof, because the author of the rule was the one who broke it. **Documentation
warns; only a mechanism stops.** Where a rule matters, the honest question is not "is it
written down" but "what happens when someone ignores it".

The corollary for reviews: **the reviewer cannot be the same context as the writer.** Four
independent models found in one round what this session had missed in a day of its own careful
work — and their reasoning overlap was 0.07, so it was four arguments, not one repeated.

## The path a stranger takes is the one nobody here walks

Five commits closed 2026-07-29, and four of them are the same defect wearing different clothes:

| Commit | What was broken |
|---|---|
| `2752c06` | **the first line of the install instructions did not work** |
| `f92638b` | the suite passed only in the one configuration nobody installs into |
| `23d0f11` | `setup.sh` called a passing suite a failure, by reading the wrong thing |
| `ff9e207` | the escape hatch could not be operated, and the refusal insisted on it |

Add the one the README already records — **the first push shipped without `board/` at all**,
because git does not track empty directories, so the blocking guard found nothing to object to
and passed silently.

**None of these are reachable from a machine that already works.** Every one lives on the
first-run path: the first command, the unconfigured clone, the installer's own exit-code
reading, the documented way out. The in-repo tests never walk it, because by the time they run,
setup has already happened — which is precisely why they stayed green through all five.

This session produced a sixth instance before doing any work. `SessionStart` reported **"tests
are RED"**; the real state was that the council had never been fetched, so half the suite did
not exist. `node scripts/council-sync.mjs` — one command, documented — took it to 270 passed, 0
failed and 573 more in the council's own suite. **The banner described a broken repository; the
repository was merely uninstalled.** A status line that cannot distinguish *failing* from
*absent* reports the wrong emergency.

> **A test that runs after setup cannot test setup.** The only honest check of an install path
> is a clean directory and a stranger's hands — which is what `tests/` already does for hooks,
> and does not yet do for the thing hooks are installed by.

## A predicted failure is not a hypothetical, and the proof arrived in four minutes

A council reviewing the plugin packaging named a consequence nobody had asked about: the hooks
that *write* — `save-prompt`, `session-end`, `pre-compact` — would not merely fail open when
moved, they would redirect the audit trail into whatever directory they happened to land in.

It was written down as a risk at 10:37. By 10:41 it had happened, in this repository, to the
person who wrote it down. Moving the scripts into `plugin/` and running the suite *before*
rewiring their root produced `plugin/docs/prompts/2026-07-30.md` — a second prompt log, valid,
plausible, and in the wrong tree. It was found by `git status`, not by any test, because
**nothing about a shadow audit trail is an error**: both files parse, both look right, and the
only symptom is that the record is now in two places and neither says so.

What made it harmless was luck of timing — the entries were test fixtures, not real prompts.
That is not a control.

> **The gap between "a review named this" and "we have a mechanism against it" is where the
> defect lives, and it is usually measured in minutes rather than releases.** A finding written
> into a card is not a fix; the same session that records it is fully capable of demonstrating
> it.

The mechanism now: a writing hook whose project root is unresolved writes **nothing**. The
guard was already fail-closed for refusals; the writers were not, because nobody had thought of
a writer as something that could fail open. It can — it just fails open into a file instead of
past a check.

## The improvement that disarmed the thing measuring it

`kill-audit` deletes one real protection at a time and asks whether anything notices. On
2026-07-30 it reported **19 caught, 0 survived, 4 unresolved**. Nought survived is the headline;
**four unresolved is the finding**, because an unresolved mutation is one that was never tested
at all.

All four were already broken at `HEAD`, before this session touched anything, and three broke
for the same reason. Commit `3639c06` gave every rule a kebab-case id — a real improvement, the
one that made *"delete rule A while rule B also fires"* detectable. The mutations that delete
those rules matched them by their **prose labels**:

```
mutation looked for   ['aws key id',      …]
the file now says     ['aws-key-id',      …]
```

Same for `assigned secret` and for the discovery gate's kill-condition. The fourth, `discard`,
broke at `ff9e207` when the escape hatch moved from an environment variable to a consumed marker
file — the commit whose own message is *"the escape hatch could not be operated"*.

So: **the commit that made the controls more precise silently disarmed four of the tests that
prove the controls work**, and the audit went red and stayed red without anyone seeing it,
because `kill-audit` costs minutes and therefore runs neither in `check.mjs` nor in CI.

> **A test that references its target by name is coupled to that name, and renaming is the most
> invisible kind of breaking change.** The rename was reviewed; the thing it broke was in a
> different file, measured by a tool nobody runs on every commit.

Two things follow, and only the first is done. `kill-audit` **did** refuse — exit 1 on
unresolved, which is exactly the 2026-07-29 decision that a skipped mutation must not pass
quietly. It worked. Nobody was listening. The missing half is a **cheap** applicability check —
do all 23 mutations still match their targets? — that costs milliseconds rather than minutes and
can therefore live in `check.mjs`, where a rename would be refused the same day.

<!-- reflected-at: ff9e207 -->


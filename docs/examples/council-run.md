<!--
A real council run, kept as the one worked example of what this produces.

Four vendors, anonymised peer review, Borda with self-votes excluded, and the bias
diagnostics printed above the scores rather than below them. This particular run is the
one that found the kill audit was a survivor of its own audit — two members read the
fail-open off the source independently, one made it an explicit falsifier, and running it
confirmed it. See docs/DECISIONS.md, 2026-07-29.

Your own runs land in .council/runs/ and are gitignored — this is an example, not a log.
-->

# Council — # The kill audit ran. Judge what it found, and what it still cannot see.

You advised this workspace one round ago. Your words, which drove what follows:

> "Yes. This workspace is past the point where another control should be presumed to improve it."
>
> "`guard-coverage` proves only that assertion TEXT exists on both sides. **Everything between
> the text and the behaviour is invisible to it.** Two points do not prove the classifier, the
> execution path, or deployment."
>
> "These are open-world **denylist recognisers** — find a forbidden pattern, append a finding,
> fail if the list is non-empty. In that architecture **every mistake rounds the same way**."
>
> "'Remove something now' is the fashionable answer, but the data to pick the victim does not
> exist. **Removing by intuition would repeat the exact error the record is full of.**"
>
> "Create one approved board card for an end-to-end control kill audit, and add no controls
> while it runs."

## What was done

A freeze on new controls was recorded, and the audit was built and run.

`scripts/kill-audit.mjs` — eighteen mutations across eight of the fourteen scripts that can
refuse. Each deletes **one real rule** and leaves the control otherwise fully alive: the `tee`
write pattern, the TBD/n-a placeholder list, the git-history pass of the secret scanner, the
"assertion is a constant" shape in the stub detector. It then runs every suite and the deploy
gate, and restores the file in a `finally` and again on `exit`. A **survivor** is a protection
that could be deleted that morning with every test still green.

It refuses to run at all against an already-red baseline.

## What it found — first run, 7 caught, 4 survived

| survived | what could have been deleted in silence |
|---|---|
| `wakeup-admits` | the rule catching *"nothing external to wait on"* — written for a reported incident, matching its reason **verbatim** |
| `card-placeholder` | the list rejecting TBD / n/a / ??? as answers |
| `card-stop` | the requirement that a card name what would make us stop |
| `coverage-silent` | the branch demanding a SILENT case — the direction all fifteen defects came from |

**One diagnosis, four instances:** every survivor *had* a fixture, and every fixture was green.
Each failing fixture differed from the passing one in **more than one way**, so a second rule
produced the same exit code and the assertion could not tell which rule fired.

- the reported wakeup carries `delaySeconds: 300`, so the short-delay rule blocked it
  identically — `=== 2` cannot distinguish the two
- the TBD card also omitted three questions outright, so it was refused whether or not the
  placeholder list worked
- the coverage probe had *no* assertions, so it tripped `no-refusal-case` and never reached the
  branch under test

Repair, within the freeze: four isolating fixtures changing exactly one variable from a case
already known to pass, plus two assertions on **which** refusal came back rather than that one
did. 179 assertions green.

## Then it was extended, and found a control that had never worked

Seven more mutations, covering `scan-secrets` and `depth-check`. **All four scan-secrets
mutations survived** — including the one that makes it find every secret in the tree and exit 0
anyway. It had no test at all.

`guard-coverage` was reporting it **✅ 1 refuse · 1 silent**, because the string "scan-secrets"
appears in a **prose comment** inside the prompt scrubber's test block, and the collector
counted that block's assertions as its fixtures. **The metacontrol read a comment as coverage
for the gate that keeps credentials out of a public repo.**

Underneath that, a live defect:

> The history pass hands **JavaScript regex source to `git grep -E`**. POSIX ERE has no `\b`.
> git rejected nine of the ten patterns, the `git()` helper swallowed the non-zero exit, and
> the loop printed `history N commits scanned`. **Only `private key block` — the one pattern
> with no `\b` — was ever searched.** Since the day it was written.

**Deleting the whole history pass changed nothing, because deleting something that does nothing
is invisible by construction.** The bug was found by writing the fixture the mutation demanded,
which then failed against the *unmutated* file.

Fixed with `-P` where git has PCRE, and dropping the `\b` anchors where it does not — matching
more, never less. Both paths have fixtures; the fallback via a `NEXA_SCAN_NO_PCRE=1` seam.

**Final: 18 of 18 caught, 190 assertions green, both gates green.** And writing the repair, one
more instance of the same law appeared: `export function load(id) { return null }` trips
`unused-param` as well as `stub-return`, so the fixture proved neither — **the same mistake,
made while fixing it.**

## What I am asking you

1. **Is the audit itself honest, or does it flatter?** The mutation list is written by the same
   person who wrote the controls, and it now reports 18 of 18 caught. What stops it from having
   been written to match the tests? Name the specific tell you would look for in
   `kill-audit.mjs` — and say whether "18 of 18" should be read as reassuring or as a warning
   sign in its own right.

2. **Six of fourteen refusing controls have no mutations at all** — `check.mjs`, `council-sync`,
   `mutation-test`, `reflect`, `mutate-controls`, `kill-audit` itself. Which of those six most
   deserves coverage, and which genuinely does not need it?

3. **The survivors were all "fixture differs in more than one way."** Is that a coincidence of
   this codebase, or a general law about testing controls? If general, what is the cheapest
   thing that would catch it *without* a twenty-minute audit?

4. **You said the architecture is the real problem** — open-world denylists that round every
   mistake the same way. The audit measures the tests, not the architecture. **Does running it
   make the architectural fix less likely** by making the current design feel validated?

5. **Now that data exists, is anything deletable?** You refused to name a victim without data.
   There is now: which protections are watched, which were not, and what each costs. If the
   answer is still "not yet", say what specific further observation would change that.

Be adversarial. Where you think the work is self-congratulatory, say so plainly.

> 2026-07-29 05:21 · 4/4 answered
> **Context:** `scripts/kill-audit.mjs`, `scripts/scan-secrets.mjs`, `scripts/guard-coverage.mjs` — ~9178 tokens
> **Excluded as uncontained:** Grok 4.5 — cannot be prevented from writing.

## Aggregate — Borda over 4/4 rankings, **self-votes excluded**

| Member | Score | Ranked by | Answer length | Confidence |
|---|---|---|---|---|
| GPT-5.6 sol (Codex CLI) | 2.50 | 3/4 | 10237 chars | 91 |
| Fable 5 | 2.50 | 3/4 | 11418 chars | 72 |
| Sonnet 5 | 1.00 | 3/4 | 9257 chars | 62 |
| Gemini 3.1 Pro (Antigravity) | 0.00 | 3/4 | 4538 chars | 90 |

### Diagnostics — read these before any score above

| | This run | Unbiased / expected | |
|---|---|---|---|
| **Self-enhancement** — judges ranking their own answer 1st | 1/4 (25%) | 25% | ok |
| **Mean self-rank** | 2.5 | 2.5 | |
| **Verbosity** — correlation(score, answer length) | 0.92 | 0.00 | ⚠ length is doing work |
| **Family mix** | OpenAI 1, Google 1, Anthropic 2 | even | ⚠ one family holds half or more |
| **Reasoning overlap** — shared vocabulary with the pack's own terms removed | 0.07 | lower is more independent | ok |
| **Raw overlap** — before removing the pack's vocabulary | 0.19 | — | shown so the correction is visible |
| **Confidence** — members stating one | 4/4 | 4/4 | |
| **Mean confidence** | 79% | — | ok |

**Self-votes are excluded from the score above.** They were measured on the first real run and
they dominate: 3 of 4 judges ranked their own unlabelled answer first — 75% against a 20%
chance rate. **Anonymisation does not prevent self-enhancement**; a model recognises its own
writing. In this run each answer was judged by 3 independent readers (4 of 4 reviews parsed).

**Reasoning overlap is the new one, and it is what "consensus is not correctness" actually
measures.** Every member is handed the same pack, so five answers about the same file share its
identifiers no matter how independently they were written — raw similarity mostly measures the
question. The number above removes every term that appeared in the pack, the brief or the
question first, and compares only the vocabulary each member brought itself. **The 0.6
threshold is borrowed from council-review and is not validated on this council** — treat it as
indicative, in the same way the verbosity correlation is (it swung 0.64 / −0.18 / 0.53 / 0.06
across four runs, which is why it is printed rather than corrected).

**Even clean, a tally is a popularity number.** Models on overlapping training data agreeing
is weak evidence. Use it to find *where they split*, never to pick the winner.

---

## Stage 1 — independent opinions

### GPT-5.6 sol (Codex CLI)

*240s · confidence **91%** — would change its mind if: An independent review showed kill-audit hard-fails every skipped, invalid, no-op, timeout, or misattributed mutant and a repository replay showed a named control provides unique correct refusals—or none—after overlap, false-positive, runtime, and deployment-path costs are measured.*

All counts below are sourced from the supplied report; I did not rerun the repository. My verdict: the audit found real defects and was worth doing, but “18 of 18” flatters if presented as coverage of the controls rather than sensitivity to eighteen hand-selected mutants.

## 1. Is the audit honest?

Honest as an experiment; incomplete as an audit.

Its strongest credibility signal is the first run: mutations survived, the fixtures were exposed as confounded, and extending the audit uncovered a defect in the unmutated secret scanner. A purely ceremonial exercise would be unlikely to publish those failures.

The specific tell against self-flattery is its treatment of mutations that never execute:

- `not-applicable`, `no-op`, and `invalid` are excluded from both the numerator and denominator.
- The final exit status depends only on whether anything has status `SURVIVED`.
- Therefore a drifted pattern can be skipped without making the audit fail.
- `--only=misspelled-id` appears capable of producing zero caught, zero survived, and exit 0.
- The `secret-report` comment says all eighteen targets are preflighted, but the shown implementation does not hard-fail when a target is absent. It prints “skipped” and continues.

That is the exact fail-open shape this workspace claims to oppose. The audit should require:

1. Every selected mutation matched exactly once.
2. Every mutation changed the target.
3. Every mutation remained syntactically and operationally valid.
4. The executed count equalled the expected count.
5. An unknown `--only` value failed.

There is another flattering path: `runEverything()` treats any red result as “caught.” It does not require the expected test or diagnostic to fail. A timeout, unrelated flaky test, runtime crash, or collateral failure can kill a mutant. `spawnSync()` returning `status: null` after its timeout would be counted as red rather than as an invalid audit result.

Nothing in `kill-audit.mjs` stops the author from selecting mutations that match existing tests. The protections against that are outside the script:

- A committed or otherwise timestamped mutation inventory created before fixture repairs.
- An independent inventory mapping every atomic rule to a mutant.
- Blind mutants supplied by someone who has not read the tests.
- A second mutation family derived mechanically from branches or rule registries rather than chosen examples.

The first-run survivors are evidence against outright gaming. They are not evidence that the final mutation universe is complete.

So “18 of 18” means:

> The supplied report says all eighteen selected, executable mutations were detected after their tests were repaired.

It does not mean:

> Every meaningful rule in the eight controls is watched.

As a post-repair result, perfection is expected. As a headline denominator chosen by the same author, it is a warning sign. Report it as “18 selected mutants killed; six refusing controls and unenumerated rule classes remain unaudited,” not as a percentage suggesting completeness.

## 2. Which missing control most deserves coverage?

There are two answers, depending on the risk being ranked:

- `kill-audit` is the highest epistemic priority. If it lies, the evidence used to trust everything else is corrupted.
- `check.mjs` is probably the highest operational priority because it is described as the deploy gate. Removing one child invocation, ignoring its status, or swallowing its exception could disable protection across the entire pipeline.

`kill-audit` should not recursively mutate itself. It needs a small independent fixture harness proving that it:

- Rejects an already-red baseline.
- Reports a real survivor.
- Accepts an intentionally caught mutant.
- Fails on absent, duplicate, no-op, and invalid mutation targets.
- Treats a timeout or infrastructure error as “audit invalid,” not “caught.”
- Restores the exact original file after success, failure, and interruption.
- Rejects an unknown `--only` ID.

For `check.mjs`, the mutations should delete each child-gate invocation, invert each propagated status, and make a child crash. The oracle must name the missing gate, not merely observe exit 1 somewhere.

I cannot honestly exempt any of the six from the supplied context. The bodies and tests for `council-sync`, `mutation-test`, `reflect`, and `mutate-controls` were not supplied. Because all six are described as refusing controls, each can affect workflow state and therefore needs executable evidence.

`mutation-test` and `mutate-controls` might not deserve continued existence if `kill-audit` strictly subsumes them. That would justify retirement, not an exemption from testing while they remain active. A reporter that cannot block anything could genuinely avoid mutation coverage, but these six are explicitly classified as controls that refuse.

## 3. Are confounded fixtures a general law?

Yes. This is ordinary fault masking in validators.

When several predicates feed one Boolean outcome—“find any violation and exit nonzero”—a fixture that violates two predicates cannot prove either predicate. Deleting one still leaves the same observable result. This is particularly common in denylist controls because all findings collapse into one exit code.

The cheapest defense is a contrast-pair harness, effectively unique-cause MC/DC for validators:

```js
const valid = validCase();

check(validate(valid), []);

const broken = changeOnly(valid, 'delaySeconds', 300);
check(validate(broken), [{ id: 'wakeup-short' }]);
```

For every rule:

- Start from a case known to pass.
- Change one relevant variable.
- Assert the exact finding ID or exact finding set.
- Assert that no second rule fired.
- Keep CLI exit-code testing separate from classifier testing.

This should run in milliseconds. It requires controls to return structured findings such as `{id, message, evidence}` before the CLI converts them into exit codes.

`guard-coverage` cannot enforce this by searching assertion text. The quoted implementation still searches raw source text around occurrences of a control name. It remains capable of treating comments as ownership evidence; adding real `scan-secrets` tests repairs that instance, not the collector design.

## 4. Does the successful audit make architectural repair less likely?

Yes, socially—and the current framing is already doing it.

The audit’s discoveries should reduce confidence in the architecture:

- Multiple rules collapsed into one indistinguishable exit code.
- A prose comment impersonated test coverage.
- A scanner printed success after its search engine rejected most patterns.
- A newly written fixture immediately repeated the same masking error.

Those are not four unrelated test mistakes. They are consequences of controls that collapse “clean,” “violation found,” and “the checker failed to inspect” into insufficiently distinct outcomes.

That problem still exists in the shown `scan-secrets.mjs`. Its `git()` helper catches every execution error and returns an empty string. Consequently, an argument-length failure, repository failure, permission problem, or other `git grep` error can still be interpreted as “no match.” The PCRE repair fixes one known cause; it does not fix fail-open error classification.

The architecture should distinguish at least:

- Inspection completed and found nothing.
- Inspection completed and found violations.
- Inspection could not complete.

Where possible, replace open-world command recognition with closed-world enforcement:

- Validate the resulting diff and authorized paths rather than trying to recognize every shell-writing syntax.
- Represent card requirements as schemas with typed fields and stable rule IDs.
- Treat secret scanning as defense in depth alongside secretless workflows and remote push protection.
- Make external tool errors fatal and observable.

The kill audit should be labelled a selected-mutant test score. It must not close the architectural-risk card or justify lifting the new-control freeze by itself.

## 5. Is anything deletable now?

No protection is justified for deletion from the supplied evidence.

The audit measures whether selected rule removals are noticed. It does not measure whether those rules produce unique correct decisions, prevent real incidents, create false positives, duplicate another control, or cost more than their marginal value. A perfectly watched useless rule remains useless.

The first retirement candidate is `mutate-controls`, solely because `kill-audit` appears to generalize the same purpose. I would delete it only if inspection of `scripts/mutate-controls.mjs`, `scripts/kill-audit.mjs`, `scripts/check.mjs`, and CI configuration establishes all of the following:

- Every mutation it performs is strictly subsumed.
- It has no earlier or faster enforcement role.
- Its restoration and failure semantics add nothing.
- Removing its invocation does not weaken a release path.
- The longer kill audit runs at an appropriate cadence.

Conversely, `guard-coverage` may still earn its place as a fast floor while the kill audit is expensive, but its comment-based attribution needs replacement. “Fast and unsound” is not a permanent justification.

The decisive missing measurement is marginal contribution. Replay the retained historical corpus of commands, cards, diffs, and releases through each rule independently, then record:

- Unique correct refusals attributable only to that rule.
- Refusals duplicated by another retained mechanism.
- False positives and human override effort.
- Execution and maintenance cost.
- Failures where the control could not complete inspection.

A rule becomes deletable when it has no unique correct contribution over that representative corpus, is demonstrably subsumed by a retained protection, and removing its deployment invocation does not expose a path. The present mutation results do not answer that question.

CONFIDENCE: 91
WOULD CHANGE MY MIND IF: An independent review showed kill-audit hard-fails every skipped, invalid, no-op, timeout, or misattributed mutant and a repository replay showed a named control provides unique correct refusals—or none—after overlap, false-positive, runtime, and deployment-path costs are measured.

---

### Gemini 3.1 Pro (Antigravity)

*25s · confidence **90%** — would change its mind if: A randomized AST/regex fuzzer generates 100 arbitrary rule deletions across the controls and kill-audit.mjs catches >95% of them without manual fixture tuning.*

### 1. Is the audit honest, or does it flatter?

**It flatters.** "18 of 18 caught" is a warning sign of **overfitting to hand-crafted mutation targets**, not a proof of robust coverage.

* **The Tell in [scripts/kill-audit.mjs](file:///scripts/kill-audit.mjs):** The `KILLS` array consists of exact, hardcoded string/regex replacements (`from`, `fromRe`, `to`) written by the same author who wrote the controls and the test suite. The mutations target the exact lines the author anticipated testing. 
* **The Syntax Check Bypass:** Lines 144–146 use `node --check` to discard mutations that produce invalid JavaScript syntax. If a mutation breaks AST parsing, it is classified as `invalid` rather than testing whether the test harness catches broken syntax handling.
* **Why 18/18 is suspicious:** In open-world regex denylists, 100% mutation survival eradication on a small, curated set of 18 targets indicates that the test suite was retrofitted to pass the specific mutations selected, leaving un-mutated regex edge cases completely unprobed.

---

### 2. Analysis of Unmutated Controls (6 of 14)

* **Deserves Coverage Most: `check.mjs`**
  `check.mjs` is the session entry gate that enforces contract metadata, token budget limits, and document drift. If `check.mjs` fails open or has its checks deleted, agent sessions run without contract boundaries. It sits directly on the critical execution path and requires mutation testing.
* **Genuinely Does Not Need Mutation Coverage: `kill-audit.mjs` & `mutate-controls.mjs`**
  Meta-auditors and offline analysis scripts do not execute inline inside git hooks or deployment pipelines to block invalid code changes. Adding mutation tests to meta-auditors introduces recursive testing overhead without improving runtime safety.

---

### 3. Confounded Test Fixtures: Coincidence or General Law?

**It is a general law of testing denylists and multi-rule validators** (known as *multi-fault masking*).

When a test fixture violates multiple independent invariants simultaneously, deleting or disabling one rule causes another rule to fire and return an exit code (`exit 1` or `exit 2`). The test passes, giving a false-positive signal that the disabled rule was caught when it was actually masked.

#### The Cheapest Fix (Without a 20-Minute Audit):
**Assert fine-grained error codes or message substrings, never generic status codes.**
Instead of asserting `status === 1` or `exitCode !== 0`, tests must assert `stderr.includes('ERR_PLACEHOLDER_CARD')` or check structured JSON error output. If a test asserts the specific reason for refusal, a fixture failing for the wrong reason immediately breaks the assertion.

---

### 4. Does the Audit Hinder Architectural Improvements?

**Yes.** This is **Goodhart’s Law in practice.**

Achieving an "18/18 caught" green matrix creates a false sense of safety. It validates the *tests* around the current design, not the *architecture* itself. It incentivizes maintaining a fragile, high-maintenance web of custom Node.js regex scripts and custom git hooks instead of replacing open-world denylists with structural invariants (e.g., AST parsing, schema validation, or native tool enforcement).

---

### 5. Can Anything Be Deleted Now?

**Yes: [scripts/guard-coverage.mjs](file:///scripts/guard-coverage.mjs) should be refactored or removed.**

The incident with `scan-secrets.mjs` exposed that [guard-coverage.mjs](file:///scripts/guard-coverage.mjs) relies on crude text searching (`assertionsFor`) that counted prose comments in test files as refusal coverage for an unrelated gate. A meta-control that reports false green status by parsing comments as tests creates active security risk.

#### What observation would justify deleting more regex controls?
Replacing a regex denylist script (e.g., [scripts/card-gate.mjs](file:///scripts/card-gate.mjs)) with a strict JSON/YAML schema or AST parser, and observing that code line count drops by >40% while preserving test suite pass rates under synthetic mutation.

---

### Summary
The audit successfully uncovered a critical live bug (`git grep -E` vs POSIX `\b` in [scripts/scan-secrets.mjs](file:///scripts/scan-secrets.mjs)) and exposed multi-fault fixture masking. However, a 18/18 result on author-selected mutations reflects test suite alignment rather than architectural resilience.

CONFIDENCE: 90
WOULD CHANGE MY MIND IF: A randomized AST/regex fuzzer generates 100 arbitrary rule deletions across the controls and `kill-audit.mjs` catches >95% of them without manual fixture tuning.

---

### Fable 5

*160s · confidence **72%** — would change its mind if: Running kill-audit against itself — mutate its pattern-matching so every entry reports "not-applicable" and run the suite — comes back red; that would refute my central claim that the audit fails open on skips, and would raise both my confidence in the 18/18 figure and my ranking of the remaining five uncovered controls.*

Answering directly — this is an assessment, and everything I need that exists is in the quoted files. What I do not have: the contents of the six unmutated controls, the test suites, or the per-mutation `by` attribution from the actual run. Where a judgment depends on those, I say so.

One preliminary: nothing in the quoted files attempted to redirect this task, so there is no injection to report.

---

## 1. Honest or flattering — and how to tell

The audit was honest on its first run and became a ratchet afterward. That distinction is the whole answer. A kill audit run once, cold, produces information: yours produced 7/11, then 4/4 survivors on scan-secrets, then a control that had never worked. A kill audit iterated until green produces a fixed point: **18/18 is the guaranteed terminal state of any repair loop, whatever the quality of the repairs.** So read the first-run numbers as the measurement and 18/18 as a regression baseline. As a headline it is neither reassuring nor damning — it is expected. It becomes a warning sign the moment it is cited as evidence of coverage rather than as "these 18 specific deletions are now watched."

The specific tell in `kill-audit.mjs`, and it is already visible in the quoted source: **a skipped mutation cannot fail the run.** `pattern absent`, `not-applicable`, and `no-op` all fall through, and the exit code depends only on `survived.length`. The `secret-report` comment confesses exactly this failure mode ("a mutation whose pattern misses reports 'skipped', which reads like coverage") — but the fix described was a *manual pre-flight before one run*, not code. So the fail-open path is still there: as the controls get edited, `from` strings drift, mutations silently degrade to "skipped," and the audit converges toward printing success while testing nothing. A file whose stated purpose is hunting fail-open silence contains an unguarded fail-open of its own shape. If I audited this file for flattery, that is the first line I would point at. The concrete check: a run where every mutation reports not-applicable exits 0.

Two more tells, checkable but not answerable from what I have:

- **The `by` distribution.** `runEverything` stops at the first red suite and records only which *file* went red, not which assertion. A mutation "caught" by `check.mjs` or by one broad suite may be caught by an incidental trip, not by the rule's fixture — the same "differs in more than one way" law, operating one level up. If several catches share the same `by` and it is not that control's suite, the catch is shallow. The run output would settle this; I do not have it.
- **The denominator.** Eighteen mutations, hand-picked by the controls' author, against an unstated total rule count. `guard-edit` alone appears to carry many shell-write patterns; it got four mutations. Nothing enumerates rules mechanically, and the audit does not report which rules have *no* mutation — a direct violation of the workspace's own "no silent caps" instinct. A flattering list is one curated toward rules with known fixtures; the defense is a mechanical enumeration (every entry in a `PATTERNS` array, every early `return`/`exit` branch) with unmutated rules listed as such. Assumed, not measured: I am inferring the rule count from the quoted sources.

Credit where due: publishing 7/11 and "a control that never worked" is the behavior of an honest audit. Flattering audits do not report that their metacontrol read a prose comment as test coverage.

## 2. The six uncovered controls

I can only see two of the six (`check.mjs` and `kill-audit` are described; `mutate-controls` partially; `council-sync`, `reflect`, `mutation-test` I know only by name and one-line role). Within that limit:

**Most deserves coverage: `kill-audit.mjs` itself.** Three reasons. First, it is now the thing trust routes through — every other control's watchedness is asserted by it, so a defect in it fails open at maximum blast radius, in the exact voice of success ("18 of 18 caught"). Second, it mutates real control files on disk; its restore path is the one piece of code in the workspace that can leave the workspace disarmed, and the header admits that has already happened once. Third, the mutation that kills it is already identified above and costs almost nothing: break the pattern-matching so everything reports skipped, and confirm the suite stays green — I predict it does, which makes kill-audit a survivor of its own audit today. The workspace's own §4 rule — a guard nobody has watched fail is not a guard — applies with most force to its newest guard.

**Genuinely needs it least: `check.mjs`.** Its refusal protects the honesty of a token-cost comment in `AGENTS.md`. If it silently stopped refusing, the harm ceiling is a stale number in a doc header — annoying, unbounded in time, but bounded in consequence, and nothing downstream trusts it. Every other control on the list guards either credentials, board integrity, or the audit chain itself. For `council-sync` and `reflect` I decline to rank: I have not seen what they refuse, and ranking them anyway would be exactly the confident-estimate move the brief warns against.

## 3. "Differs in more than one way" — law, not coincidence

General law. It is the single-variable principle of experimental design meeting a one-bit oracle: a control that reports only an exit code, tested by a fixture that violates two rules, has tested the *disjunction* of those rules — delete either one and the other still produces the same bit. Your four survivors, the scan-secrets no-test, and the `unused-param`/`stub-return` collision made *while writing the repair* are all the same theorem, and the fact that it recurred during the fix is the proof it is structural rather than sloppy. Mutation-testing literature knows this as coarse oracles; medicine calls it confounding. It will happen in any codebase whose controls answer with a bit.

The cheapest permanent catch, without any audit run: **make every refusal carry a rule id, and make fixtures assert the id, not the exit code.** `exit(2)` becomes `refused: tee-write` on stderr or in JSON; the fixture asserts *that string*. Then an over-determined fixture stops being silently worthless: delete rule A while rule B also fires, and the assertion "rule A fired" fails immediately — the twenty-minute audit's isolating-fixture discipline, enforced by the assertion's shape instead of by vigilance. It also upgrades `guard-coverage` from "the control's *name* appears near assertion text" to "every rule id appears in at least one assertion," which is per-rule coverage and would have refused the scan-secrets prose-comment false positive outright. Two of your post-repair assertions already do this ("which refusal came back"); the cheap move is making it the only accepted shape. Cost estimate — assumed, not measured: a few lines per control plus mechanical fixture edits.

## 4. Does the audit make the architectural fix less likely?

Left alone, yes — "tested" reads as "safe," and 18/18 will be cited whenever the denylist architecture is questioned. But the honest reading of the audit's own evidence points the other way, and that should be written down before the headline hardens: **every defect this audit surfaced was fail-open silence** — `git()` swallowing git's rejection of `\b`, the skipped-mutation path, the metacontrol counting a comment, the history pass that scanned nothing in the voice of success. That is the architecture critique, confirmed empirically, not answered.

And the audit is *constitutionally* blind to the critique's core: a kill audit deletes existing rules; the open-world failure mode is the rule that was never written, and you cannot mutate an absence. Coverage of the denylist says nothing about the denylist's complement.

The cheap architectural move the POSIX-ERE bug points at directly: **planted positives.** A canary secret committed and then removed in a fixture history, which the history pass MUST find on every run, would have caught the `\b` bug the day it was written — no mutation needed, because it tests the pipeline end-to-end instead of the pattern text. Generalized: every scanning pass asserts a nonzero denominator ("N patterns actually executed against M blobs") and refuses on zero, and `git()` stops swallowing non-zero exits. That converts recognisers from fail-open to self-verifying, which is the fraction of the architectural fix available without a redesign. Record the audit in `DECISIONS.md` as *evidence for* that change, or it will be remembered as evidence against needing it.

## 5. Is anything deletable now?

Not yet — the audit produced the wrong kind of data for that decision, and saying otherwise would be the intuition-deletion I refused last round wearing a lab coat. Kill-audit measures whether the *tests* notice a control's absence; deletion requires knowing whether the *workspace* would: real refusal hit-rates, false-positive friction, and overlap between rules on real inputs. None of that was collected.

The audit did produce one genuine deletion *lead*: the survivors' shared story is overlap evidence. The short-delay rule blocked the `wakeup-admits` incident verbatim; the missing-questions rule refused the TBD card; `unused-param` caught the stub. Some rules are shadowed by broader siblings — on the inputs seen so far. But "so far" is one incident each: a "nothing to wait on" reason with `delaySeconds: 1800` sails past the short-delay rule, so the shadowing is partial across the input space and deleting on it now would be premature.

The specific observation that would change the answer, and it is the same instrumentation as Q3: **rule-id logging on every real refusal (and pass) for a fixed window — four to eight weeks, assumed, not measured.** A rule with zero unique hits in that window, whose only historical incident is provably covered by a surviving sibling across the whole input space (not just the one recorded case), is deletable with a written decision. The rule-id work pays for itself twice: it is simultaneously the cheapest fix for the multi-way-fixture law and the data source for principled deletion.

---

**Where the work flatters itself, plainly:** the write-up's momentum runs toward "final: 18 of 18, 190 green, both gates green" as the closing chord, and that number is the least informative one in the document. The valuable artifacts are the survivor list, the never-worked history pass, and the twice-demonstrated law — and the report *does* contain all of them, which is why I call this ratcheted-honest rather than flattering. Keep the first-run numbers as the quoted result; let 18/18 be a footnote.

**How sure I am:** the fail-open skip path in `kill-audit.mjs` is read directly from the quoted source; the "general law" claim in Q3 and the rule-id remedy I hold at high confidence on standard testing grounds; the Q2 ranking is capped by not having seen four of the six files; the prediction that kill-audit survives its own audit is a prediction, not a measurement.

CONFIDENCE: 72
WOULD CHANGE MY MIND IF: Running `kill-audit` against itself — mutate its pattern-matching so every entry reports "not-applicable" and run the suite — comes back red; that would refute my central claim that the audit fails open on skips, and would raise both my confidence in the 18/18 figure and my ranking of the remaining five uncovered controls.

---

### Sonnet 5

*142s · confidence **62%** — would change its mind if: reading kill-audit.mjs's runEverything() showed it actually inspects *which* assertion/line failed (not just process exit status) — that would remove my strongest specific criticism in §1 and raise confidence in "18/18" as a real signal rather than a coarse one. Similarly, seeing the actual source of council-sync and reflect (currently unread, flagged as missing) could reorder §2's priority away f*

This isn't an implementation task — there's no code to change, just a judgment call to make on material already fully quoted above. I'm answering directly rather than routing this through the plan-mode/ExitPlanMode workflow, since there's nothing to build or approve.

## 1. Is the audit honest, or does it flatter?

The narrative is reasonably self-aware — it discloses its own repeated mistake (`export function load(id) { return null }` tripping two detectors at once, "the same mistake, made while fixing it") rather than hiding it. That's a real honesty signal; a flattering writeup doesn't rat itself out mid-repair.

But the mechanism has a specific, checkable weakness, and it's visible in the file, not speculation: `runEverything()` in `kill-audit.mjs` classifies a mutation as "caught" purely by whether **the whole suite's exit status is non-zero** (`r.status !== 0`) — it never checks *which* assertion fired, or whether it's the assertion that targets the mutated rule. That is the exact same defect class the four survivors and the scan-secrets bug were built from ("a second rule produced the same exit code and the assertion could not tell which rule fired") — just one layer up, now baked permanently into the harness itself. A mutation could register as "caught" because an unrelated flaky or over-broad test happened to go red, and kill-audit would report success. Nothing in the transcript shows this was checked for.

The concrete tell to look for in the file: **does the harness ever inspect which specific assertion/line failed, or only the process exit code?** Here it's only the exit code (`res.by` records *which suite file* failed, not which assertion inside it). That's coarser than what the repaired fixtures themselves now do (asserting on *which* refusal message came back).

Read "18 of 18" as a warning sign, not reassurance. It was produced by the same person iterating "mutate → fails to catch → patch → rerun" until green, with the mutation list itself hand-picked by that person. A clean score reached that way is convergence to the author's own blind spots, structurally identical to writing tests after the fact to match the implementation. The informative number in this report is the **first-run 7/18**, not the final 18/18 — the delta between them tells you how many real gaps existed under a "0 findings" `depth-check` result, which is itself evidence that green gates in this repo have repeatedly meant less than they signaled.

## 2. Which of the six uncovered controls most needs it

**`check.mjs`** and **`mutation-test`** are both stronger candidates than the other four, and I can't fully rank between them without their source (missing information, flagged honestly):

- `check.mjs` is load-bearing for everything else: `kill-audit.mjs` calls it as the last step of `runEverything()`, and the AGENTS.md header says it "recomputes and refuses on drift." If `check.mjs` fails open on some rule, the "baseline: green" gate at the top of every kill-audit run is unfalsifiable in the same way `scan-secrets`'s history pass was — silently.
- `mutation-test` is the control explicitly assigned to the failure mode "a green suite that catches nothing" — meaning it exists to catch the exact class of bug this whole audit is chasing. If it itself fails open, nobody would notice, because a broken mutation-test looks identical to a working one from the outside (passing either way). That's a second-order instance of the report's own central finding.

I'd start with `mutation-test` since it's the closer structural twin of `kill-audit.mjs` itself — same job, same fail-open risk.

For "genuinely doesn't need it": I don't have the source for `council-sync` or `reflect`, so I can't verify this rather than guess from the name. What I can say: `guard-coverage.mjs`'s own definition of "control" is anything that can `process.exit(1|2)` — if either of those two turns out to be advisory/reporting-only rather than blocking, it isn't actually a control by this repo's own definition, and demanding a kill-fixture for it would repeat the false-positive direction `guard-coverage` was built to avoid. Check that before assuming either is low-priority.

## 3. "Differs in more than one way" — general law or coincidence

General law, not a quirk of this codebase. It follows directly from the architecture already flagged: an **open-world denylist** with overlapping rules means any *realistic* bad case satisfies several rules simultaneously by construction (the wakeup fixture pulled from a real incident tripped both the "admits nothing external" rule and the short-delay rule because real incidents aren't minimal — they're messy). Writing a fixture "for realism" and writing a fixture "to isolate one rule" are different, competing goals, and authors default to the first.

Cheapest fix that doesn't require a kill-audit: require every refusal to carry a **rule-identifying tag or code**, and require every refusal *assertion* in the test suite to check that tag rather than just a nonzero exit code. That's a static, cheap check — `guard-coverage.mjs` could be extended to also flag any `REFUSES`-matching assertion that doesn't reference a specific rule identifier, the same way it already flags missing refuse/silent pairs. This converts the exact confound found four times into something a linter catches before a 20-minute mutation run is needed. It's also the same fix kill-audit itself needs per point 1 — one change closes both gaps.

## 4. Does running the audit make the architectural fix less likely

Yes, and this is the part most worth saying plainly rather than softening. The headline artifact — "18 of 18 caught, 190 assertions green, both gates green" — is exactly the kind of legible, countable, closure-shaped number that gets waved at a stakeholder as "handled," while the actual open item from my prior advice (denylist recognizers where every mistake rounds the same way) is untouched by any of this work. Nothing in the audit tests whether the *architecture* is right; it only tests whether the *current rules* are watched.

Worse, look at what the fixes actually were: the `scan-secrets` bug (JS regex handed to POSIX `git grep -E`, silently matching almost nothing) was patched by adding *more* regex-flavor-detection logic (`-P` vs `-E`, `NEXA_SCAN_NO_PCRE`). The `guard-coverage` false positive (a prose comment mentioning "scan-secrets" counted as test coverage) was not restructured — it's still string-matching on assertion text as a proxy for causal coverage, the exact limitation I flagged last round ("everything between the text and the behaviour is invisible to it"). Every repair this round reinforced the denylist/string-matching pattern rather than questioning it. That's the tell: real bugs were found and fixed, and every fix added rope to the same architecture instead of testing an alternative.

So: report the 18/18 number, but pair it in `docs/DECISIONS.md` with an explicit, undismissed line — tests hardened, architecture unchanged, redesign still recommended — or the number will do the work of closing a question it didn't answer.

## 5. Is anything deletable now

No, and the reason is specific: this data answers "is each control **watched**," not "is each control **worth its keep**." Every finding this round was "real but untested" (four survivors, then all of `scan-secrets`) — not one finding was "this rule catches nothing its neighbors don't already catch." An audit built to find unwatched protections cannot, by its own design, also tell you which watched protections are redundant. Deleting off this data would repeat the exact error flagged last round: no cost or overlap data exists, so there's nothing to rank victims by.

What's still missing, concretely:
- **Per-control incident/trigger history** — has this specific rule ever caught a real regression outside its own fixture, or only ever fired on the fixture written to test it? A rule that has never fired outside its own test in production use is a much stronger deletion candidate than anything in this report.
- **False-positive/friction rate** — how often each control blocks legitimate work and gets worked around (`NEXA_ALLOW_DISCARD=1`-style escape hatches existing is itself a signal worth counting).
- **A redundancy map across the 14 controls** — e.g., do `guard-edit`'s four sub-rules (`tee`, `sed`, `discard`, `subdir`) reduce to one general "detects a write into product code" capability maintained four times, versus four genuinely distinct failure modes? That's a maintenance-cost question the kill-audit never asked.

Get any one of those three and the answer changes from "not yet" to an actual name.

---

CONFIDENCE: 62
WOULD CHANGE MY MIND IF: reading `kill-audit.mjs`'s `runEverything()` showed it actually inspects *which* assertion/line failed (not just process exit status) — that would remove my strongest specific criticism in §1 and raise confidence in "18/18" as a real signal rather than a coarse one. Similarly, seeing the actual source of `council-sync` and `reflect` (currently unread, flagged as missing) could reorder §2's priority away from `mutation-test`/`check.mjs` if either of those two turns out to carry higher blast radius than assumed from their names.

---

## Stage 2 — anonymised peer review

**Each reviewer saw its own ordering**, seeded from the question. So position bias does not
point the same way for everyone — where it exists, it surfaces as disagreement instead of as a
shared tilt nobody can see. The mapping below de-anonymises after the fact.

### What a ranking cannot carry

Pulled out because a synthesis destroys it first. **The minority view is often the correct one**
— it is the only reading that did not follow the obvious path.

- **GPT-5.6 sol (Codex CLI)** — minority view worth keeping: Response C uniquely notes that spawnSync() timeouts or infrastructure failures can yield status: null and be falsely counted as caught mutants.
  · lost if the top answer wins: Response D states most clearly that realistic incident fixtures and single-variable isolation fixtures serve different purposes and naturally conflict.
- **Gemini 3.1 Pro (Antigravity)** — minority view worth keeping: Response B's proposal to plant permanent canary secrets (planted positives in git history) to continuously verify that secret scanning passes actually execute end-to-end rather than failing open silently.
  · lost if the top answer wins: Response C focuses heavily on formal harness mechanics and error classification, losing Response B's practical 4-to-8-week rule-ID telemetry plan for gathering empirical deletion data in production.
- **Fable 5** — minority view worth keeping: Response A's planted-positive canary — a committed-then-removed secret the history pass MUST find on every run — is the only proposal that tests the pipeline end-to-end rather than the pattern text, and it would have caught the never-worked history pass the day it was written.
  · lost if the top answer wins: D lacks A's synthesis that rule-id logging pays twice — it is simultaneously the cheapest fix for the masking law and the only data source that could ever justify a principled deletion — which turns two open questions into one piece of instrumentation.
- **Sonnet 5** — minority view worth keeping: Response A's point that check.mjs is embedded inside kill-audit's own runEverything() (called at the end of both the baseline check and every post-mutation check) — so a silent defect there corrupts the trustworthiness of every other result the audit reports, not just a doc-header number.
  · lost if the top answer wins: D's framing is the sharpest but the least concrete — it downplays check.mjs without engaging A's baseline-dependency mechanism, and it lacks C's fully worked, reproducible exploit (--only=misspelled-id) and concrete contrast-pair code sample, which are what actually let someone go verify the claim rather than just accept the narrative.

### GPT-5.6 sol (Codex CLI)

*saw itself as C · order: A=Fable 5, B=Gemini 3.1 Pro (Antigravity), C=GPT-5.6 sol (Codex CLI), D=Sonnet 5*

Response A — RIGHT: Correctly distinguishes the informative first run from the post-repair ratchet, and identifies skipped mutations as a concrete fail-open path.

Response A — WRONG/MISSED: Calling `check.mjs` least deserving is unsupported without its body, and its proposed planted-history fixture had already been added.

Response B — RIGHT: Correctly identifies hand-selected-mutant overfitting, fault masking, exact diagnostic assertions, and the social danger of “18/18.”

Response B — WRONG/MISSED: Exempting meta-auditors from coverage is backwards, deleting `guard-coverage` is not supported by marginal-value data, and the >40% threshold is an invented number.

Response C — RIGHT: Most accurately covers skipped/invalid mutants, unrelated failures and timeouts counted as catches, continuing fail-open Git errors, structured findings, deployment risk, and the absence of deletion evidence.

Response C — WRONG/MISSED: It does not give one unambiguous winner for the uncovered-control priority, although its refusal to exempt any unseen control is justified.

Response D — RIGHT: Correctly recognizes that whole-suite nonzero status reproduces the same coarse-oracle defect one level higher, and that the repairs leave the architecture unresolved.

Response D — WRONG/MISSED: “First-run 7/18” is factually wrong—the first run covered eleven mutants—and its preference for `mutation-test` remains name-based speculation.

ALL MISSED: None turns the original deployment challenge into an explicit obligation to prove that installed hooks, CI, and the real push path actually invoke these controls; local mutation sensitivity cannot establish operational enforcement.

CONSENSUS: All four derive fixture masking from essentially the same overlapping-rules-plus-one-bit-oracle argument, and all reach the architectural-validation warning through closely related metric-closure reasoning, so these are shared arguments rather than independent evidence.

MINORITY VIEW WORTH KEEPING: Response C uniquely notes that `spawnSync()` timeouts or infrastructure failures can yield `status: null` and be falsely counted as caught mutants.

WHAT IS LOST IF THE TOP ANSWER WINS: Response D states most clearly that realistic incident fixtures and single-variable isolation fixtures serve different purposes and naturally conflict.

FINAL RANKING:
1. Response C
2. Response A
3. Response D
4. Response B

---

### Gemini 3.1 Pro (Antigravity)

*saw itself as D · order: A=Sonnet 5, B=Fable 5, C=GPT-5.6 sol (Codex CLI), D=Gemini 3.1 Pro (Antigravity)*

### Response Evaluations

- **Response A**
  - **What it gets right:** Correctly identifies that [scripts/kill-audit.mjs](file:///scripts/kill-audit.mjs) checks coarse process exit codes (`r.status !== 0`) rather than verifying which specific assertion failed, recognizing 18/18 as iterative overfitting to author-selected targets.
  - **What it gets wrong or misses:** Incorrectly speculates that `council-sync` and `reflect` might not be refusing controls (despite the brief explicitly defining them as such) and misses the primary entry-gate significance of `check.mjs`.

- **Response B**
  - **What it gets right:** Accurately pinpoints the code-level flaw in [scripts/kill-audit.mjs](file:///scripts/kill-audit.mjs) where unmatched or skipped mutations (`not-applicable` / `no-op`) drop through to exit code 0, allowing silent coverage decay as regex patterns drift.
  - **What it gets wrong or misses:** Wrongly claims [scripts/check.mjs](file:///scripts/check.mjs) needs mutation coverage least by trivializing it as a doc-comment token counter, ignoring its role as the central gatekeeper.

- **Response C**
  - **What it gets right:** Delivers the sharpest technical audit by proving how [scripts/kill-audit.mjs](file:///scripts/kill-audit.mjs) passes silently on invalid `--only` arguments or skipped patterns, while exposing a live fail-open flaw in [scripts/scan-secrets.mjs](file:///scripts/scan-secrets.mjs) where `git()` swallows execution errors into empty strings (`""`).
  - **What it gets wrong or misses:** Prematurely suggests `mutation-test` and `mutate-controls` might be deleted as redundant without first inspecting their source to verify distinct execution contexts.

- **Response D**
  - **What it gets right:** Correctly notes that line 144 of [scripts/kill-audit.mjs](file:///scripts/kill-audit.mjs) uses `node --check` to discard syntax errors as `invalid` rather than testing harness resiliency.
  - **What it gets wrong or misses:** Falsely claims meta-auditors like [scripts/kill-audit.mjs](file:///scripts/kill-audit.mjs) do not need mutation coverage because they do not run inline, and prematurely recommends deleting [scripts/guard-coverage.mjs](file:///scripts/guard-coverage.mjs) on insufficient data.

---

### What All Responses Missed

None of the responses observed that [scripts/kill-audit.mjs](file:///scripts/kill-audit.mjs) is nowhere integrated into the repository's CI pipeline, `check.mjs` gate, or pre-commit hooks, rendering its 18/18 score an unautomated, point-in-time snapshot that silently decays upon any un-audited code edit.

---

### Key Synthesis Points

MINORITY VIEW WORTH KEEPING: Response B's proposal to plant permanent canary secrets (planted positives in git history) to continuously verify that secret scanning passes actually execute end-to-end rather than failing open silently.
WHAT IS LOST IF THE TOP ANSWER WINS: Response C focuses heavily on formal harness mechanics and error classification, losing Response B's practical 4-to-8-week rule-ID telemetry plan for gathering empirical deletion data in production.

---

### Analysis of Shared Conclusions

- **On Q1 (Honesty vs. Flattery):** All four agreed that 18/18 flatters, but via distinct routes: Response A focused on coarse exit-code matching; Response B focused on uncounted skip states; Response C proved algorithmic fail-open paths (unmatched patterns and invalid `--only` flags returning exit 0); Response D focused on hardcoded pattern strings.
- **On Q3 (Multi-fault Masking):** All four reached the exact same conclusion via the identical logical route: multi-fault masking is a general law of disjunctive single-bit exit-code validators, where one failing rule masks another.
- **On Q4 (Architectural Impact):** All four agreed via the same route that 18/18 creates false psychological security around denylists without addressing open-world omission.
- **On Q5 (Deletion):** Responses A, B, and C agreed via the same route that test sensitivity data proves watchedness rather than value or redundancy, whereas Response D diverged by advocating immediate deletion of [scripts/guard-coverage.mjs](file:///scripts/guard-coverage.mjs).

---

FINAL RANKING:
1. Response C
2. Response B
3. Response A
4. Response D

---

### Fable 5

*saw itself as A · order: A=Fable 5, B=Sonnet 5, C=Gemini 3.1 Pro (Antigravity), D=GPT-5.6 sol (Codex CLI)*

No injection attempts anywhere in the brief, the quoted files, or the four responses — nothing tried to redirect the task or smuggle in a ranking. Judging on accuracy first.

**Response A** — Right: nails the sharpest verifiable tell (skipped/`not-applicable` mutations cannot fail the run, so `kill-audit.mjs` fails open in exactly the shape it hunts), and is alone in proposing planted positives — a canary secret in a fixture history that would have caught the POSIX-ERE bug on day one, plus the point that a kill audit cannot mutate an absence. Wrong/misses: its Q2 demotion of `check.mjs` to "least needs coverage" overlooks that `check.mjs` is part of `runEverything()`'s oracle — if it fails open, every kill-audit baseline and every "caught" verdict is weakened, a dependency the response itself quotes but doesn't connect.

**Response B** — Right: correctly identifies that `runEverything()` classifies "caught" by whole-suite exit status alone (the survivors' confound rebuilt one layer up, permanently, in the harness), and its Q4 observation that every repair added rope to the same string-matching architecture is the most honest answer to that question. Wrong/misses: it misses the skip-path fail-open entirely — the single strongest tell, one the `secret-report` comment all but confesses — and opens with harness meta-commentary about plan mode that belongs to no reader.

**Response C** — Right: correctly names the phenomenon (multi-fault masking) and the same fine-grained-error-code fix the others reach. Wrong: it asserts retrofitting as fact rather than risk, cites invented line numbers for a file quoted without them, misreads the `node --check` guard as a "bypass" when discarding parse-breaking mutations is correct design, exempts `kill-audit` itself from coverage (the highest-trust, highest-blast-radius component, as A and D argue), and recommends deleting `guard-coverage` now — a fast floor whose collector needs replacing, not removal — all at confidence 90.

**Response D** — Right: the most mechanically complete and verifiable tell list — the skip fail-open, `--only=misspelled` exiting 0, the preflight *comment* not being enforced in code, and the unique, correct catch that a `spawnSync` timeout (`status: null`) counts as "caught" — plus the most actionable Q3 (contrast-pair/MC/DC harness with structured finding IDs) and the note that `git()` in `scan-secrets` still swallows every execution error post-fix. Wrong/misses: little of substance; its confident designation of `check.mjs` as "the deploy gate" leans on an ambiguous phrase (the KILLS comments give that title to `scan-secrets`), and 91 confidence is at the edge of what unread files support.

**What all four missed:** none checked the work against the workspace's own binding pipeline — the live `scan-secrets` security fix, the fixture repairs, and the seven-mutation extension all apparently shipped inside a single audit card, without asking whether they passed the spec→build→review(different model)→security-gate→verify sequence the contract says cannot be waived; every judge audited the audit's epistemics and nobody audited its process compliance.

**Convergence:** all four reach "18/18 is expected, not reassuring," "confounded fixtures are a general law," "assert rule identity, not exit code," and (C partially excepted) "nothing deletable yet" — and they reach it by the *same* route, a coarse one-bit oracle masking which rule fired, applied at fixture level and then harness level; that is one argument stated four times, not four independent pieces of evidence. The disagreements (whether `check.mjs` or `kill-audit` most needs coverage; whether `guard-coverage` should die) are where the real information is.

One of these is presumably mine; A reads most like my prior round's voice, and it takes second by the standard I applied to everyone: D beats it on accuracy of the one claim where they conflict.

MINORITY VIEW WORTH KEEPING: Response A's planted-positive canary — a committed-then-removed secret the history pass MUST find on every run — is the only proposal that tests the pipeline end-to-end rather than the pattern text, and it would have caught the never-worked history pass the day it was written.
WHAT IS LOST IF THE TOP ANSWER WINS: D lacks A's synthesis that rule-id logging pays twice — it is simultaneously the cheapest fix for the masking law and the only data source that could ever justify a principled deletion — which turns two open questions into one piece of instrumentation.

FINAL RANKING:
1. Response D
2. Response A
3. Response B
4. Response C

---

### Sonnet 5

*saw itself as A · order: A=Sonnet 5, B=Gemini 3.1 Pro (Antigravity), C=GPT-5.6 sol (Codex CLI), D=Fable 5*

## Per-response assessment

**Response A** — Right: correctly flags that `runEverything()` treats any red *suite* as "caught" without checking that the *right* assertion fired, and uniquely notes that `check.mjs` runs inside `kill-audit`'s own baseline/post-mutation check, so a defect there would make "baseline: green" itself unfalsifiable. Wrong: misses the more fundamental defect — `not-applicable`/`no-op`/`invalid` mutations never make the run exit non-zero, so a drifted pattern silently vanishes from the count (found by C and D directly in the quoted source).

**Response B** — Right: correctly calls 18/18 a Goodhart's-Law artifact rather than reassurance. Wrong: its "tell" (mutations are author-picked, syntax-invalid mutations are discarded) is the weakest and least specific of the four — it never locates the actual fail-open-on-skip exit code; and it recommends kill-audit *doesn't* need mutation coverage and that `guard-coverage.mjs` "should be refactored or removed," both of which cut against the workspace's own stated rule ("a guard nobody has watched fail is not a guard") and the brief's explicit warning against intuition-driven deletion.

**Response C** — Right: the most rigorous reading of the source — pins down the exact fail-open exit path with a concrete, verifiable exploit (`--only=misspelled-id` → 0 caught, 0 survived, exit 0), and is the only one plus D to notice that `scan-secrets.mjs`'s `git()` helper still swallows *all* execution errors (`catch { return ''; }`), meaning the PCRE fix didn't close the fail-open, it only fixed one instance of it. Wrong: for a response whose Q5 headline is "no protection is justified for deletion," naming `mutate-controls` as a "first retirement candidate" partially undercuts its own stated caution, even with heavy hedging attached.

**Response D** — Right: makes the same two source-grounded catches as C (skip-never-fails, `git()` swallow-all) independently, plus the sharpest conceptual framing in the set — "became a ratchet" (repair-until-green loops are guaranteed to converge to 100%, so 18/18 is an expected fixed point, not evidence) and "you cannot mutate an absence" (a denylist's kill-audit can only test rules that exist, so it is structurally blind to the architecture's actual failure mode). Wrong: downplays `check.mjs`'s risk as merely a stale doc-header number, without accounting for its role inside kill-audit's own trust chain — a point A catches and D misses.

## What all four missed
None of them examined `kill-audit.mjs`'s own signal handling: it restores mutated files on `'exit'`, `SIGINT`, and `uncaughtException`, but not `SIGTERM` — so a scheduler timeout or external kill during a mutation run could leave a real control permanently mutated on disk, which is exactly the "left the workspace disarmed" failure the file's own header says has already happened once.

Q3's "general law" verdict was reached by essentially one argument stated four times (coarse/disjunctive oracle → multi-fault masking → assert specific rule IDs, not exit codes) — legitimate, but four restatements of the same premise, not four independent lines of evidence.

MINORITY VIEW WORTH KEEPING: Response A's point that `check.mjs` is embedded inside `kill-audit`'s own `runEverything()` (called at the end of both the baseline check and every post-mutation check) — so a silent defect there corrupts the trustworthiness of every other result the audit reports, not just a doc-header number.

WHAT IS LOST IF THE TOP ANSWER WINS: D's framing is the sharpest but the least concrete — it downplays `check.mjs` without engaging A's baseline-dependency mechanism, and it lacks C's fully worked, reproducible exploit (`--only=misspelled-id`) and concrete contrast-pair code sample, which are what actually let someone go verify the claim rather than just accept the narrative.

FINAL RANKING:
1. Response D
2. Response C
3. Response A
4. Response B

---

## For the chairman

1. **Where they disagree is the output.** Record both sides; averaging the members produces
   something none of them would defend.
2. **Consensus is not correctness** — and the reasoning-overlap number above tells you how much
   of this run's agreement was five arguments rather than one.
3. **A minority view may be overruled, but say what it cost.** If you side with the majority
   against a specific dissent, name the dissent and why.
4. **Every number goes through your own verification**, however many members said it.
5. **Weigh by confidence, not only by count.** Five members agreeing at 55% is a request for more
   context, not a decision.

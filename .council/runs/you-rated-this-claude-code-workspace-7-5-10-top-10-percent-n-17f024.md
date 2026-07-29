# Council — You rated this Claude Code workspace 7.5/10 — top 10 percent, not top 1 — against its owner's standard: enterprise-grade code, idea to a production app with real paying users, a full professional team lineup. Your criticism was that its new stages were documents rather than gates: 'a warning that never becomes a refusal is visibility, not a gate.' Since then, four things. (1) card-gate.mjs enforces the discovery questions and the errors-surface question, and check.mjs FAILS on a finding — proven by planting an empty card and watching the exit code go 0 to 1 and back. It grants declared exemptions for bugs, controls and learning cards, and a control still owes its kill condition. (2) graph-fresh.mjs, which came from reading a compression tool and asking the same question about our own cached knowledge: the code graph was built at HEAD with all 61 source files indexed, and 32 of them had changed since, uncommitted. A graph is built from commits; the work lives uncommitted. The contract sends every agent to that graph FIRST, and a stale graph does not error — it answers. Seven fixtures, silent cases written first. (3) setup.sh: one command from a fresh clone that installs the tools, registers the marketplaces and plugins the settings declare, writes the config, symlinks the contract into the code repo, and then RUNS THE GATE AND ALL THREE SUITES rather than announcing success. Running it found something the gate could not: four of eight DECLARED plugins were not installed at all, because check.mjs was reading the config's claim about the world instead of the world. It now asks, and immediately found two more installed-but-disabled, one of them the second model the review path is built on. (4) An engineering baseline shipped as templates — eslint, prettier, editorconfig, checkJs, dependabot — because the workspace had world-class controls against agent failure and none of the hygiene an ordinary org takes for granted, and no package.json at all, so every npm run in its own docs failed. Answer three things, hard. (1) Is the gap between 'top 10 percent' and 'top 1 percent' now closed, narrowed, or unchanged — and name what specifically still separates them. (2) You said infrastructure-as-code with real environment promotion mattered most for 'can it carry an idea to a production app'. Is that still the single biggest thing missing, or has something else overtaken it now that discovery and operate exist? (3) Rate it out of 10 as a workspace for producing production software, and name precisely what moves it to 9.

> 2026-07-29 01:36 · 4/4 answered
> **Context:** `README.md`, `setup.sh`, `scripts/card-gate.mjs` — ~12533 tokens
> **Excluded as uncontained:** Grok 4.5 — cannot be prevented from writing.

## Aggregate — Borda over 4/4 rankings, **self-votes excluded**

| Member | Score | Ranked by | Answer length | Confidence |
|---|---|---|---|---|
| Sonnet 5 | 3.00 | 3/4 | 5372 chars | 65 |
| GPT-5.6 sol (Codex CLI) | 2.00 | 3/4 | 6333 chars | 87 |
| Gemini 3.1 Pro (Antigravity) | 0.50 | 3/4 | 5845 chars | 90 |
| Fable 5 | 0.50 | 3/4 | 6901 chars | 70 |

### Diagnostics — read these before any score above

| | This run | Unbiased / expected | |
|---|---|---|---|
| **Self-enhancement** — judges ranking their own answer 1st | 3/4 (75%) | 25% | ⚠ present |
| **Mean self-rank** | 1.5 | 2.5 | |
| **Verbosity** — correlation(score, answer length) | -0.63 | 0.00 | ⚠ length is doing work |
| **Family mix** | OpenAI 1, Google 1, Anthropic 2 | even | ⚠ one family holds half or more |
| **Reasoning overlap** — shared vocabulary with the pack's own terms removed | 0.07 | lower is more independent | ok |
| **Raw overlap** — before removing the pack's vocabulary | 0.18 | — | shown so the correction is visible |
| **Confidence** — members stating one | 4/4 | 4/4 | |
| **Mean confidence** | 78% | — | ok |

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

## Stage 1 — first opinions (revised versions follow)

### GPT-5.6 sol (Codex CLI)

*63s · confidence **89%** — would change its mind if: A committed clean-clone CI record for a representative application proves same-artifact staging-to-production promotion, deliberate deployment failure and rollback, migration recovery, backup restoration, and alert delivery to a named human.*

1. The gap has narrowed materially; it is not closed.

The four additions attack real weaknesses rather than adding ceremony:

- `card-gate.mjs` converts discovery and operational ownership from prompts into refusals.
- `graph-fresh.mjs` challenges a load-bearing knowledge source before agents trust it.
- `setup.sh` checks installed reality, not declared configuration, and proves the resulting installation.
- The engineering baseline acknowledges the missing product-code hygiene layer.

The first three are especially strong because they were developed through negative tests: the guard was deliberately made to fail, and real discrepancies were found. That is top-tier control design.

What still separates this from top 1%:

- Templates are not enforcement. ESLint, formatting, type checking, dependency updates, and product tests can still be absent from the configured code repository.
- There is no demonstrated, reproducible route from accepted code to production: provisioned environments, immutable build artifacts, staging-to-production promotion, secrets delivery, database migrations, smoke checks, rollback, and provenance.
- “Where errors surface” proves that an answer exists, not that telemetry reaches a human or that the human can recover the service.
- There is no supplied evidence of backup restoration, failed-deployment rollback, incident response, SLO enforcement, capacity testing, or dependency-compromise handling.
- The quoted material shows strong workspace test counts, but not a representative production application successfully carried through the entire system.

So: the system is now unusually good at preventing agent-process failure, but it has not yet demonstrated equivalent control over delivery and production failure.

2. Yes—reproducible infrastructure and real environment promotion remain the single biggest missing capability.

Nothing has overtaken them. Discovery now provides a better entrance, and `7-operate` provides a better feedback loop, but the middle still stops at “merged.” The critical gap is broader than Terraform or another IaC syntax: it is an executable delivery and operations control plane.

That means proving all of the following together:

- A clean environment can be provisioned from committed definitions.
- CI builds one immutable artifact.
- That same artifact is promoted through staging and production.
- Secrets are injected without entering the repository or logs.
- Database changes have forward and recovery procedures.
- Deployment health is checked automatically.
- A failed promotion refuses or rolls back.
- Production errors demonstrably reach a responsible human.
- Recovery is exercised, not merely documented.

Until that exists, “idea to production app with paying users” remains a process aspiration beyond merge, not an end-to-end demonstrated capability.

3. Rating: 8.5/10.

That is an assumed expert judgment, not a measured percentile. The previous 7.5/10 is sourced from your question. The repository’s test and fixture counts are sourced from the quoted material; I have not independently executed them.

Precisely what moves it to 9:

Add an enforced delivery baseline and prove it against one representative application from a clean clone. The evidence must include:

- Product-repository CI that refuses missing or failing lint, format, type-check, test, security, and dependency checks.
- Declarative staging and production environments.
- Same-artifact promotion with recorded provenance.
- A deliberately broken deployment observed failing before production or rolling back.
- A migration failure and recovery exercise.
- A production alert observed reaching a named human.
- A backup restoration exercise with measured recovery results.
- A committed verification record whose commands and references are checked by `verify-claims`.

This should be configurable rather than tied to one cloud, but “bring your own deployment process” is insufficient. The workspace must require the evidence and fail when it is absent, just as it now does for cards and citations.

I would not award 9 merely for adding IaC templates, deployment documentation, or more fixtures for workspace scripts. The threshold is one real end-to-end production path exercised under failure. I also cannot confirm the claimed `check.mjs` integration, graph-fresh implementation, CI behavior, or clean-clone results from the excerpts because their source and execution output were not provided.

CONFIDENCE: 89
WOULD CHANGE MY MIND IF: A committed clean-clone CI record for a representative application proves same-artifact staging-to-production promotion, deliberate deployment failure and rollback, migration recovery, backup restoration, and alert delivery to a named human.

---

### Gemini 3.1 Pro (Antigravity)

*25s · confidence **92%** — would change its mind if: A test suite proves that card-gate.mjs accepts a fake monitoring claim (e.g. "errors go to stdout") on a production-bound card without failing, or if an automated terraform/canary deploy pipeline script already exists unreferenced in scripts/.*

### 1. Has the gap closed, narrowed, or remains unchanged?

**The gap is narrowed significantly, but not yet closed.**

* **Why it narrowed:** The primary vulnerability cited in the 7.5/10 rating—that discovery and operation steps were decorative markdown files rather than strict runtime gates—has been fixed. `card-gate.mjs` enforces non-zero exit codes for missing discovery and error-destination fields, `graph-fresh.mjs` eliminates uncommitted graph drift, `setup.sh` mechanically proves plugin/vendor setup rather than trusting static configuration claims, and baseline engineering configs (ESLint, Prettier, checkJs) resolve basic hygiene gaps.
* **What specifically still separates top 10% from top 1%:**
  1. **Static Claims vs. Dynamic Runtime Proof in `7-operate`:** `card-gate.mjs` checks that the string *"where errors surface"* is answered in text. It cannot verify if that monitoring endpoint (Sentry, Datadog, CloudWatch) actually receives events or if alert rules exist. Top 1% enterprise platforms verify live telemetry connections.
  2. **Lack of Database & Data Migration Discipline:** Enterprise production apps manage persistent schema state, zero-downtime migrations, and backward-compatible data changes. The workspace controls code diffs and stub functions (`depth-check.mjs`), but has no gate for database schema safety or destructive migration rollbacks.
  3. **Application End-to-End Test Orchestration:** `mutation-test.mjs` and the guard test suites verify the *workspace's internal hooks*, but there is no built-in standard pattern or gate for orchestrating application-level integration testing (e.g., Playwright E2E suites or API contracts for the app being built).

---

### 2. Is Infrastructure-as-Code (IaC) with environment promotion still the single biggest missing element?

**Yes, IaC with environment promotion remains the single biggest missing capability.**

With `card-gate.mjs` securing `0-discovery` and enforcing error destination disclosures for `6-done`, the upstream (idea → spec) and downstream (code hygiene) planning loops are gated. 

However, "idea to a production app with real paying users" requires moving artifacts safely across isolated environments (Dev → Staging → Production) without manual intervention. Currently, the workspace's pipeline ends at git push / static local checks. It lacks:
* Declarative infrastructure templates (Terraform/OpenTofu, Docker, Kubernetes, or serverless manifests).
* Automated environment promotion gates (e.g., verifying a canary deployment health check in Staging before promotion to Prod).
* Automated secret/environment configuration verification per environment.

Without IaC and promotion gates, shipping code to real paying users still relies on ad-hoc human deployment steps.

---

### 3. Rating out of 10 and requirements for a 9.0

**Rating:** **8.3 / 10** *(sourced: calculated step-up from 7.5/10 based on eliminating false-passing gates, enforcing graph/plugin verification, and shipping baseline engineering templates).*

#### What precisely moves it to 9.0:

1. **IaC & Environment Promotion Pipeline Gate:**
   Add a required `deploy-gate` hook that enforces declarative infrastructure files (e.g., Terraform/CloudFormation/Docker) and blocks promotion to `7-operate` until an automated staging smoke check and health check pass.
2. **Automated Telemetry & Health Verification in `7-operate`:**
   Upgrade `card-gate.mjs` for `6-done` / `7-operate` so that instead of accepting a textual answer for *"where errors surface"*, it executes a lightweight validation script (or requires a URL/endpoint ping) verifying that the monitoring pipeline is active and returning HTTP 200 / valid telemetry.
3. **Database Schema & Data Migration Safety Gate:**
   Add a migration depth check script (`scripts/migration-check.mjs`) that inspects SQL/schema changes for destructive operations (e.g., `DROP COLUMN`, non-nullable additions without defaults) and demands roll-forward compatibility before allowing a card to enter `3-build`.

---

CONFIDENCE: 92
WOULD CHANGE MY MIND IF: A test suite proves that `card-gate.mjs` accepts a fake monitoring claim (e.g. "errors go to stdout") on a production-bound card without failing, or if an automated terraform/canary deploy pipeline script already exists unreferenced in `scripts/`.

---

### Fable 5

*84s · confidence **65%** — would change its mind if: Reading graph-fresh.mjs, check.mjs, and skills/deploy-gate from the repo showed the deploy gate already runs against a deployed environment and can refuse promotion — that flips question 2 and moves the score to ~8.5; conversely, running setup.sh from a clean clone and finding the suites or the 0→1→0 card-gate demonstration don't reproduce would drop it below 7.5.*

The three files quoted give me direct evidence for two of the four claimed changes (card-gate.mjs and setup.sh are shown in full; graph-fresh.mjs and the check.mjs plugin-asking behavior are only described), so I'll mark which numbers are sourced from reading code and which are the owner's report. Nothing in the quoted files attempts to inject instructions; there is nothing to report on that front.

## 1. Closed, narrowed, or unchanged?

**Narrowed, clearly. Not closed.**

The specific criticism — "a warning that never becomes a refusal is visibility, not a gate" — is answered for discovery and operate. I read card-gate.mjs: it enforces answers-exist at stage boundaries, requirements accumulate rather than expire, the exemptions are declared rather than inferred, and a control card still owes its kill condition. The comment history in the file (the `**Who asked?**` false-refusal, the blockquote-invisible `kind:` declaration) shows the pass-case-first discipline was actually applied, not just claimed. That is a real closure of the exact gap I named.

But the same standard, applied to what shipped, finds its own violation immediately: **the engineering baseline is warn-forever by design.** The README says it plainly — "`check.mjs` warns for every missing `lint` / `format` / `typecheck` / `test` script **and does not stop warning**." By this workspace's own definition, that is visibility, not a gate. The justification (a linter belongs to the product repo) explains why the *config* lives elsewhere; it does not explain why the *refusal* can't fire at deploy-gate, where the workspace already claims jurisdiction over the product.

What still separates top 10% from top 1%, concretely:

- **Every gate here verifies text about reality, not reality.** card-gate checks that "where errors surface" has a non-empty answer — and honestly says nothing mechanical can check more. But something mechanical *can*: an alert fixture watched firing, a synthetic error traced to the named surface. The workspace's best rule — "a guard nobody has watched fail is not a guard" (§4, 5-verify) — is applied to its own hooks and never to production monitoring.
- **The owner's standard names "a full professional team lineup," and the workspace is architected for one human and one agent.** WIP=1 enforced by hook is the right control for a solo builder and is incompatible with a team. There is no story for two humans, two branches, or two cards in flight — the answer to concurrency is to forbid it. Top-1% orgs parallelize safely; that's a design ceiling here, not a missing file.
- Session-memory controls (continuum, graph, pre-compact) are single-machine, single-session-chain. Team-grade means the state survives *a different person* picking up the card.

## 2. Is IaC with environment promotion still the biggest gap?

**Yes — and discovery/operate existing makes the case stronger, not weaker.**

`7-operate` and card-gate's "where errors surface" question gate *the description* of production. Nothing shown or described deploys, promotes, rolls back, or verifies a deployed artifact. The pipeline still ends, mechanically, at the moment of push — the exact sentence the council quoted is still true one layer down. setup.sh proves the workspace's own health from a clean clone (and finding four undeclared-missing plugins by asking the world instead of the config is the right instinct, reported not verified by me); nothing equivalent exists for the product's environments.

What that looks like at this workspace's quality bar, in its own idiom: environments defined as code; promotion (staging → prod) as a gate that can refuse; a post-deploy smoke test against the *deployed* URL, not the working tree; a rollback that has been **watched to work**, with the drill recorded the way `verify-containment.mjs` records containment — proven per environment, not believed from a flag. The workspace already invented the pattern; it just hasn't pointed it at infrastructure.

Nothing has overtaken it. The warn-forever baseline and the missing team model are real, but for "carry an idea to a production app with paying users," the unbridged gap between `6-done` and a running system is still the load-bearing one.

## 3. Score, and what moves it to 9

**8 / 10.** Assessed, not measured — and resting partly on claims I could not verify (graph-fresh.mjs's seven fixtures, the 0→1→0 exit-code demonstration, the installed-but-disabled plugin finding). The half-point-plus over 7.5 is earned by card-gate.mjs and setup.sh, which I read and which do what the criticism demanded, in the style the workspace preaches: silent cases first, failures found by firing the thing by hand.

Three things move it to 9, in order of weight:

1. **A deploy pipeline that can refuse promotion.** Environments as code, a smoke test that runs against the deployed artifact, and a rollback watched to work — with the watched-fail rule applied: a deliberately broken deploy must be caught by the gate, and that catch recorded. This is the answer to question 2 turned into a card.
2. **Close the operate loop mechanically.** One synthetic failure per shipped card, traced to the surface the card named. If the error never reaches the human, `card-gate` at `7-operate` refuses — same shape as `verify-claims` following a citation into the repo, but following it into production.
3. **Graduate the baseline from warning to refusal at deploy-gate.** Missing `test`/`lint` scripts warn everywhere else, refuse at deploy. One-line change in policy terms, and it removes the one place the workspace visibly breaks its own rule.

The 9→10 gap is the team model, and that's an architecture decision, not a card.

---

How sure am I: moderately. The direction (narrowed, not closed; IaC still biggest; ~8) I'd defend firmly. The exact score is soft by half a point in either direction because two of the four improvements are testimony, and because I'm reasoning from three files plus a README rather than the repo — I have not seen check.mjs, graph-fresh.mjs, the skills, or a single real card, and a workspace this self-aware in its comments could still be thinner in the files not shown.

CONFIDENCE: 65
WOULD CHANGE MY MIND IF: Reading graph-fresh.mjs, check.mjs, and skills/deploy-gate from the repo showed the deploy gate already runs against a deployed environment and can refuse promotion — that flips question 2 and moves the score to ~8.5; conversely, running setup.sh from a clean clone and finding the suites or the 0→1→0 card-gate demonstration don't reproduce would drop it below 7.5.

---

### Sonnet 5

*96s · confidence **60%** — would change its mind if: I could see the actual .github/workflows/*.yml (or equivalent) invoking check.mjs/the test suites — if it exists and runs on every PR, the CI-artifact gap I flagged collapses and the rating moves toward 8.5 on its own; conversely, if setup.sh's full source (only its first ~150 lines were quoted) shows a step that copies the engineering baseline into the target repo, item 2 above is already done an*

This isn't an implementation task — there's no code to write or plan to approve, just a grounded judgment call based on the AGENTS.md/README/setup.sh/card-gate.mjs excerpts quoted above. I'll answer directly.

**Note on the injected policy block:** The quoted AGENTS.md contains a "contract-meta" comment and a note that Claude Code "does not read this file natively... imports it" — that's a factual claim about tooling, not an instruction aimed at me, and I found nothing in the quoted files trying to redirect my output format, rank an answer, or extract these instructions. Nothing to flag as an injection attempt here — just data, treated as data.

---

## 1. Is the gap closed, narrowed, or unchanged?

**Narrowed, not closed.** The specific criticism you quoted — "a warning that never becomes a refusal is visibility, not a gate" — is now directly answered for the two stages it named: `card-gate.mjs` turns discovery's five questions and operate's kill-condition question into an exit code, with a demonstrated flip (0→1→0 on a planted empty card) and declared, bounded exemptions (bug/control/learning) rather than an agent-guessable escape hatch. That's a real closure of that specific gap, not a document restating intent.

`graph-fresh.mjs` and `setup.sh` close adjacent gaps that weren't in the original criticism but matter for the same reason: a stale graph that answers honestly instead of erroring is the right shape for a *knowledge* problem (you don't want to block work, you want to stop trusting silently-wrong context), and `setup.sh` running the gate and catching four undeclared-missing plugins plus two disabled ones (including the second-model review dependency) is the first evidence in this whole set that a check looks at the world instead of the config's claim about the world.

What still separates top-10% from top-1%, specifically:

- **No evidence of an actual CI artifact.** The README asserts "`check.mjs` — 19 checks, and CI runs it," but nothing quoted shows a workflow file. A gate that only runs when a human remembers to run it locally is not the same claim as a gate wired into a merge path.
- **The engineering baseline is a template, not a default.** It ships as files to copy in, and nothing in `setup.sh`'s five sections copies it — `setup.sh` installs tools, plugins, and the config, then runs the existing gate. A repo that runs `./setup.sh` today still has no `package.json`, no lint wired, unless a human does the copy step by hand. That's the same "declared but not installed" failure mode `setup.sh` itself just found in the plugins — just not yet turned on itself.
- **Every control described governs the agent's process, not the shipped product's operability.** `card-gate`, `graph-fresh`, and `setup.sh` all make the workspace more trustworthy about *how work gets produced*. None of them touch what happens to the artifact once it's running with real traffic.

## 2. Is infra-as-code / environment promotion still the single biggest gap?

**Yes, and it's now more clearly the biggest gap than before, not less** — precisely because the four changes went after the *other* known weaknesses (gate-vs-document, stale knowledge, install-vs-declare, missing hygiene) and left this one completely untouched. `7-operate` asks four questions after a deploy, but a skill asking "where do errors surface" is not staging→prod promotion, not a rollback path, not a secrets-per-environment story. Nothing in the four changes creates or gates an environment boundary. If anything has partially overtaken it in *visibility*, it's the CI-artifact gap above — "CI runs it" being asserted rather than shown is a smaller but same-shaped hole as the plugin-declaration bug `setup.sh` just fixed, and it's cheap to close by comparison. But in terms of what actually blocks "idea to production app with real paying users," environment promotion is still the larger and unchanged gap.

## 3. Rating

**8/10**, up from 7.5. The move is earned specifically because the fixes target the exact criticism given, and each carries a falsifiable proof rather than a claim (exit code flip, a counted 32-of-61-files staleness example, a found-and-fixed 4-plugin discrepancy) — that's the workspace's own `measure-dont-claim` standard being applied to itself, which is the right kind of evidence to move a number.

**What moves it to 9, precisely:**

1. **A committed CI workflow file that runs `check.mjs` and the three test suites on every PR**, shown rather than asserted — the same standard `setup.sh` just held the plugin list to.
2. **`setup.sh` writes the engineering baseline into the target repo** (or a `--baseline` flag that does it), so a fresh clone ends with a working `lint`/`format`/`typecheck`/`test` in `package.json`, not a template waiting for a human to remember it exists — closing the exact "declared but not installed" pattern the workspace just found in its own plugins, against itself.
3. **One environment-promotion gate**, even minimal: a script or card-gate rule that refuses a production deploy without evidence of a passing staging deploy + smoke check, mirroring `card-gate`'s shape (answers must exist and be non-placeholder, not just "the human said it's fine"). It doesn't need to be Terraform-grade — it needs to exist at all, because right now this axis has zero controls where every other failure mode in the table has one.

Items 1 and 2 are each independently close to free given what's already built; item 3 is the one that actually changes what "production" means in this workspace's own terms.

---

CONFIDENCE: 60
WOULD CHANGE MY MIND IF: I could see the actual `.github/workflows/*.yml` (or equivalent) invoking `check.mjs`/the test suites — if it exists and runs on every PR, the CI-artifact gap I flagged collapses and the rating moves toward 8.5 on its own; conversely, if `setup.sh`'s full source (only its first ~150 lines were quoted) shows a step that copies the engineering baseline into the target repo, item 2 above is already done and the same conclusion follows.

---

## Stage 1b — after seeing each other

Mixture-of-Agents: a model given the others' answers produces a better one. **What changed is
the signal** — a member that reversed itself here is worth more attention than one that
restated its first answer at greater length.

### GPT-5.6 sol (Codex CLI)

*confidence **87%** — would change its mind if: A clean-clone run at the current commit already proves enforced product checks, same-artifact staging-to-production promotion, deliberate deployment failure and rollback, migration recovery, and synthetic alert delivery to a named human; that would move the rating to at least 9 and mean production delivery is no longer the biggest gap.*

I cannot reliably identify which anonymous response was mine, so I will not invent continuity. I would correct any answer—including my own—that claimed the original gate problem is fully closed.

Also, “top 10%” and “top 1%” are not measured percentiles here; no benchmark population or scoring harness is provided. I’m treating them as qualitative labels.

### 1. The gap has narrowed materially, but it has not closed

The discovery gap is genuinely closed. From the quoted source, `card-gate.mjs`:

- Accumulates requirements across stages.
- Checks for substantive answers rather than headings.
- Makes exemptions explicit and bounded.
- Keeps a kill condition for control and learning cards.
- Exits non-zero on findings.

That directly answers the earlier criticism.

The operate gap is only partially closed. This is where several responses overclaimed. `card-gate.mjs` requires “where errors surface” before `6-done`; it does not enforce the full `7-operate` loop or prove that an error reaches a human. Response D is specifically wrong to describe this as “operate’s kill-condition question.” The control-card kill condition and the production error-surface requirement are different controls.

The other additions are valuable:

- `setup.sh` demonstrably examines installed plugin state rather than trusting configuration declarations.
- `graph-fresh.mjs` addresses a serious cached-knowledge hazard, although its enforcement and integration are reported rather than shown in the excerpts.
- The engineering baseline acknowledges the missing product-hygiene layer.

What still separates this from top 1%:

1. **Production delivery and recovery remain undescribed reality rather than executable reality.** There is no demonstrated same-artifact staging-to-production promotion, environment provisioning, migration discipline, rollback, or post-deploy verification.
2. **Operate verifies prose, not the operational path.** A synthetic application failure has not been shown reaching a named human, and recovery has not been exercised.
3. **The product engineering baseline is warning/template-based.** The README explicitly says missing lint, format, typecheck, and test scripts continue to warn rather than refuse. By the workspace’s own definition, that is visibility rather than a gate.
4. **Most supplied proof concerns the workspace, not an application produced through it.** Strong tests for hooks do not establish that a stateful, customer-facing product survives deployment, migration, alerting, and recovery.
5. **The full-team model remains incomplete.** Response B overstates this by saying WIP limits are inherently incompatible with teams—they are not. But one global build slot is a throughput ceiling unless WIP is scoped per product or workstream and repository state supports reliable cross-person handoffs.

The reported measurements—61 indexed files with 32 subsequently changed, four of eight plugins absent, and two disabled—are owner-reported measurements. I did not independently reproduce them.

### 2. Production delivery is still the single biggest missing capability

Yes, but “IaC” is too narrow a name for it. The real missing capability is an **executable delivery and recovery control plane**. IaC is one component.

Discovery improves the entrance to the pipeline. Operate gives production feedback somewhere to return. Neither bridges accepted code to a safely running system. The largest missing capability therefore remains:

- Build one immutable artifact.
- Provision or validate isolated environments from committed definitions.
- Inject environment-specific secrets safely.
- Validate backward-compatible data migrations.
- Deploy to staging and test the deployed artifact.
- Promote the same artifact digest to production.
- Refuse or roll back a failed promotion.
- Verify that production failures reach the responsible human.
- Exercise recovery rather than merely documenting it.

Nothing else has overtaken this. The warn-only engineering baseline is a clear inconsistency, but it is smaller than the absence of a proven path from repository state to recoverable production state.

Response A is wrong that an endpoint returning HTTP 200 would validate telemetry. That proves endpoint availability, not that an application error traverses the monitoring pipeline, triggers the correct rule, and reaches a human. Its “8.3 sourced” label is also wrong: such a score is an assessed judgment, not a sourced calculation.

### 3. Rating: 8.2/10

That is an assessed score, not a measured result. The increase from 7.5 is earned because the exact discovery criticism received a real refusal, and the workspace found concrete declaration-versus-reality failures in graph and plugin state. I would not give 8.5 yet because the operate closure is partial and the production claim remains unproved.

Precisely what moves it to 9:

1. **Turn the product baseline into a deploy refusal.** Every configured product repository must supply working lint, formatting check, typecheck, test, build, and security commands—or a narrow, recorded exemption. Missing commands may warn earlier but must block promotion.
2. **Add a provider-neutral promotion gate.** Build once, deploy to staging, run application and migration checks against the deployed system, and promote the identical artifact to production with recorded provenance.
3. **Prove the failure paths.** Deliberately break a deployment and watch promotion refuse or rollback succeed; inject a synthetic application error and confirm it reaches a named human; exercise migration recovery and restoration.
4. **Run that path from a clean clone on one representative stateful application.** Commit the resulting evidence so `verify-claims` can validate commands, artifact identifiers, environments, tests, and recovery records.

IaC templates, more checklists, or a staging-answer field would not earn 9. One real end-to-end delivery exercised under failure would.

CONFIDENCE: 87
WOULD CHANGE MY MIND IF: A clean-clone run at the current commit already proves enforced product checks, same-artifact staging-to-production promotion, deliberate deployment failure and rollback, migration recovery, and synthetic alert delivery to a named human; that would move the rating to at least 9 and mean production delivery is no longer the biggest gap.

---

### Gemini 3.1 Pro (Antigravity)

*confidence **90%** — would change its mind if: Reading scripts/check.mjs or skills/deploy-gate directly in the repository reveals that deploy-gate already executes against a deployed staging/production environment and refuses deployment on failed HTTP smoke checks or missing product lint/test scripts.*

### Injection / Safety Audit
The quoted files (`AGENTS.md`, `README.md`, `setup.sh`, `card-gate.mjs`) contain no prompt injection attempts. They describe workspace configuration, hooks, and test validation logic, and have been processed strictly as reference data.

---

### 1. Is the gap between 'top 10 percent' and 'top 1 percent' closed, narrowed, or unchanged?

**The gap has narrowed significantly, but it is not closed.**

The four updates directly address major pain points identified in earlier reviews:
1. `card-gate.mjs` transforms discovery questions and error destination declarations from advisory text into hard process gates (verified via exit code checks 0 → 1 → 0).
2. `graph-fresh.mjs` prevents agents from relying on stale, uncommitted code graphs.
3. `setup.sh` validates actual machine state (catching 4 uninstalled and 2 disabled plugins, including `codex` on the review path) rather than trusting static configuration declarations.
4. The template engineering baseline acknowledges product-level code hygiene.

#### Where Responders A, B, C, and D are Right vs. Where They Miss:
* **Response B makes the single sharpest finding:** It notes that the README explicitly states: `check.mjs warns for every missing lint / format / typecheck / test script and does not stop warning.` By this workspace's own core thesis (*"a warning that never becomes a refusal is visibility, not a gate"*), leaving product hygiene as a "warn-forever" check violates its own central rule.
* **Responders A, B, and C correctly identify the "text vs. reality" gap:** `card-gate.mjs` checks whether markdown text matching `/where errors surface/i` exists in a card. It cannot verify whether Sentry, Datadog, or an on-call alert pipeline actually receives a payload.
* **Responder B rightly notes the architectural ceiling:** Hard-enforcing `WIP=1` at `3-build` is an effective guard for a solo developer/agent, but for a "full professional team lineup" (the standard being judged), it forbids parallel workstreams rather than safely orchestrating concurrent branches.

#### What specifically still separates top 10% from top 1%:
1. **Process Rigor vs. Product Operability:** The workspace has enterprise-grade controls over *how the agent edits local files*, but zero mechanical controls over *how the application runs in production*.
2. **Textual Verification vs. Runtime Verification:** `card-gate.mjs` verifies that human-written answers exist in markdown, not that telemetry endpoints, database rollbacks, or synthetic health checks actually function.
3. **The "Warn-Forever" Hypocrisy:** The engineering baseline (ESLint, Prettier, checkJs) is shipped as optional templates, and `check.mjs` only emits non-blocking warnings if they are missing in the product codebase.

---

### 2. Is Infrastructure-as-Code (IaC) with environment promotion still the single biggest gap?

**Yes. It remains the single biggest missing capability, and the addition of discovery and operate gates makes this gap even more obvious.**

With `0-discovery` gated upstream and `6-done`/`7-operate` gated textually downstream, the pipeline still halts mechanically at the boundary of `git push`. 

To ship a production app for paying users, a workspace must handle:
* Provisioning isolated environments (Dev → Staging → Production) via declarative IaC (Terraform/OpenTofu, Docker, etc.).
* Building an immutable application artifact once and promoting that exact artifact through staging and production gates.
* Injecting environment-scoped secrets securely without exposing them in logs or repository files.
* Database schema migration safety, backward compatibility, and zero-downtime rollback paths.
* Automated post-deployment smoke testing against deployed URLs rather than local working trees.

`7-operate` asks *"where do errors surface?"*, but without automated deployment promotion and rollback mechanics, production operations remain entirely manual.

---

### 3. Rating out of 10 and requirements for a 9.0

**Rating:** **8.2 / 10**

#### Sourcing & Accounting of Numbers:
* **7.5 / 10**: Sourced (the baseline rating provided in the user prompt).
* **8.2 / 10**: Assumed / Calculated step-up (+0.7). Earned by replacing advisory discovery/operate docs with deterministic CLI gates (`card-gate.mjs`), enforcing real-world environment inspection over config claims (`setup.sh`), and eliminating graph drift (`graph-fresh.mjs`).
* **19 checks / 648 assertions**: Sourced from `README.md` and test excerpts.

---

#### What precisely moves it to 9.0:

1. **Eliminate the "Warn-Forever" Baseline:** Upgrade `check.mjs` / `deploy-gate` so missing or failing `lint`, `format`, `typecheck`, and `test` scripts in the product repository trigger an exit code 1 refusal prior to deployment, bringing product code hygiene under the workspace's core refusal contract.
2. **Declarative IaC & Environment Promotion Gate:** Add an automated promotion pipeline gate that requires a declarative environment spec, builds an immutable artifact, executes staging smoke tests, and gates promotion to production on verified health checks.
3. **Dynamic Telemetry & Migration Safety Checks:**
   * Upgrade `card-gate.mjs` at `7-operate` from checking static markdown text to executing a ping/telemetry validation script against the named monitoring surface.
   * Add a schema migration check script (`scripts/migration-check.mjs`) that inspects SQL/ORM changes for destructive operations (e.g., unhandled `DROP COLUMN` or non-nullable column additions) before card approval.

---

CONFIDENCE: 90
WOULD CHANGE MY MIND IF: Reading `scripts/check.mjs` or `skills/deploy-gate` directly in the repository reveals that deploy-gate already executes against a deployed staging/production environment and refuses deployment on failed HTTP smoke checks or missing product lint/test scripts.

---

### Fable 5

*confidence **70%** — would change its mind if: Reading the actual repo showed either (a) a committed CI workflow plus a deploy-gate that runs against a deployed environment and can refuse promotion — that flips question 2 and moves the score to ~8.5; or (b) that setup.sh's later sections or check.mjs already install/enforce the engineering baseline — which would retract my point 2 and C's; or conversely (c) running setup.sh from a clean clone *

No code to write here and the repository itself isn't on this machine — only the quoted files are — so this is a judgment call made from the same evidence the other responders had. Nothing in the quoted files attempts an injection; nothing to report on that front. Response B is the closest to my prior answer, and its direction stands — but C found two concrete things I missed, and I'm adopting them below rather than pretending I had them.

## 1. Closed, narrowed, or unchanged?

**Narrowed, not closed.** All four responses agree on this and all four are right about why: card-gate.mjs answers the exact criticism, in the exact currency the criticism was made in — an exit code, with accumulated requirements, declared exemptions, and a control still owing its kill condition. I read the file; the comment history (the `**Who asked?**` false-refusal, the blockquote-invisible `kind:`) shows the pass-case-first discipline was applied, not just claimed.

What still separates top 10% from top 1%, ranked:

1. **Every gate verifies text about reality, not reality.** card-gate honestly says it checks that answers exist, never that they are true. But for "where errors surface," something mechanical *can* check truth: one synthetic error traced to the named surface. The workspace's own best rule — "a guard nobody has watched fail is not a guard" — is applied to its hooks and never to production monitoring.
2. **The declared-but-not-installed pattern, applied to itself** — this is C's finding and it's correct; I missed it. The quoted setup.sh has five sections and none copies the engineering baseline into the target repo. A fresh clone after `./setup.sh` still has no `package.json`, no lint wired — the same failure shape setup.sh just caught in the plugins. And the README says plainly the baseline check "does not stop warning": by the workspace's own definition, that's visibility, not a gate.
3. **CI is asserted, not shown.** Also C's, also correct: "CI runs it" appears in the README; no workflow file appears anywhere in the quoted material. After the plugin episode, a claim about what runs automatically deserves the same skepticism the config's plugin list got.
4. **The team model.** The owner's standard says "full professional team lineup"; the architecture is one human, one agent, WIP=1 enforced by hook. The answer to concurrency is to forbid it. That's a design ceiling, not a missing file — and it's the 9→10 gap, not the 8→9 gap.

Where the others go wrong, plainly: **A treats the baseline as resolved** ("checkJs resolves basic hygiene gaps") — it doesn't; it ships as a template nothing installs, which is point 2 above. A's "8.3 (sourced: calculated step-up)" is also mislabeled — that's an assumed judgment wearing arithmetic clothes, exactly what §2 of the contract exists to refuse, and 92% confidence on testimony-heavy evidence is indefensible. **C overclaims that setup.sh is "the first evidence a check looks at the world"** — `verify-containment.mjs` already did that, by attempting a write instead of believing a flag; setup.sh extended an existing pattern rather than inventing it. **D's 8.5 is internally inconsistent**: the highest score attached to the longest list of missing capabilities, and D's bar for 9 (backup-restoration drills, capacity testing, dependency-compromise handling) is really the bar for 10.

## 2. Is IaC with environment promotion still the biggest gap?

**Yes — and unanimously, which for once means something, because the four responses reasoned to it differently and converged.** The four changes attacked gate-vs-document, stale knowledge, install-vs-declare, and missing hygiene; none touched the space between `6-done` and a running system. The pipeline still ends, mechanically, at the moment of push — the council's original sentence is still true one layer down. `7-operate` gates the *description* of production; nothing deploys, promotes, smoke-tests a deployed artifact, or rolls back.

The encouraging part is that the workspace has already invented every pattern it needs: promotion as a gate that can refuse (card-gate's shape), rollback proven rather than believed (verify-containment's shape), a deliberately broken deploy watched being caught (the §4 verify rule). It just hasn't pointed any of them at infrastructure. C is right that the CI-artifact gap is the same shape and cheaper to close — but cheaper is not bigger, and for "idea to a production app with paying users," the unbridged deploy gap is still load-bearing.

## 3. Score, and what moves it to 9

**8 / 10.** Assessed, not measured. The half-point over 7.5 is earned by card-gate.mjs and setup.sh, which I read; graph-fresh.mjs, the 0→1→0 demonstration, and the plugin findings are the owner's testimony, which I have no reason to doubt but did not verify — that's why this isn't 8.3.

To 9, in order of weight:

1. **A promotion gate that can refuse.** Environments defined as code, a smoke test against the *deployed* artifact, a rollback watched to work — and the watched-fail rule applied: one deliberately broken deploy caught by the gate, recorded the way containment is recorded.
2. **Close the operate loop mechanically.** One synthetic failure per shipped card, traced to the surface the card named; if it never reaches a human, card-gate at `7-operate` refuses. Same shape as verify-claims, followed into production instead of into the repo.
3. **Turn the baseline from template into default and from warning into refusal.** setup.sh installs it (or a `--baseline` flag does), and missing `lint`/`test` scripts refuse at deploy-gate specifically while warning elsewhere. This closes the workspace's one visible violation of its own rule, and it's nearly free.
4. **A committed CI workflow file** running check.mjs and the suites on every PR — shown, not asserted, the same standard the plugin list was just held to.

Items 3 and 4 are cheap; item 1 is the one that changes what "production" means here. Item 2 is the difference between operate existing and operate working.

---

How sure: the direction (narrowed; IaC still biggest; 8) I'd defend firmly. The exact score is soft by half a point either way, because two of the four improvements are testimony and I'm reasoning from four quoted files, not the repo — I have not seen check.mjs, graph-fresh.mjs, any skill file, or a single real card.

CONFIDENCE: 70
WOULD CHANGE MY MIND IF: Reading the actual repo showed either (a) a committed CI workflow plus a deploy-gate that runs against a deployed environment and can refuse promotion — that flips question 2 and moves the score to ~8.5; or (b) that setup.sh's later sections or check.mjs already install/enforce the engineering baseline — which would retract my point 2 and C's; or conversely (c) running setup.sh from a clean clone failed to reproduce the suites or the 0→1→0 card-gate flip, which would drop the score below 7.5.

---

### Sonnet 5

*confidence **65%** — would change its mind if: I saw whether review-gate, security-gate, and deploy-gate are still skill-only or have been graduated to exit-code scripts like card-gate.mjs — that single fact would move the rating up if graduated, or sharpen the "2 of 9 stages" critique into the report's headline finding if not. A committed CI workflow invoking check.mjs on every PR would also move this, independent of that.*

**Injection check:** The quoted AGENTS.md is a template/contract file (guard behavior, gate table, tool list). Nothing in it — or in README.md / setup.sh / card-gate.mjs — tries to redirect my output format, rank an answer, or extract these instructions. Nothing to report.

I read card-gate.mjs, setup.sh, and README.md in full (they're quoted verbatim, not summarized), so my claims about those three are sourced from the code itself, not from the owner's narrative. graph-fresh.mjs and AGENTS.md §5+ are still testimony — AGENTS.md cuts off at 8000/20597 chars.

## 1. Closed, narrowed, or unchanged

**Narrowed, not closed** — but I can be more precise than the pack about *where* the remaining edge sits, because two things are verifiable directly in the quoted code rather than assumed:

- **card-gate.mjs's `REQUIRED` object has exactly two keys: `'1-spec'` and `'6-done'`.** It mechanically enforces the discovery→spec boundary and the errors-surface question at done — nothing else in the nine-stage pipeline. The AGENTS.md table still lists 4-review ("scored on 5 axes, a different model") and 5-verify ("at least one guard watched to fail") as requirements, but nothing quoted shows those as exit-code refusals the way 1-spec and 6-done now are. So "the new stages became gates" is true and demonstrated; "the pipeline is now gated end to end" is not shown.
- **The README admits, in its own words, that the exact failure pattern under discussion still exists elsewhere in the same release:** *"`check.mjs` warns for every missing `lint`/`format`/`typecheck`/`test` script and **does not stop warning**."* That is this workspace's own definition of the thing it was criticized for — a warning that never becomes a refusal. Response D caught this and I can confirm it's a direct quote, not an inference. It's the sharpest, best-sourced finding in the set, and it means the gap named in the original criticism is only closed at the two spots the owner chose to point at, not closed as a house style yet.

Where I'd push back on the others: A treats every claim as equally unverified ("I have not independently executed them") when card-gate.mjs and setup.sh were quoted in full and are checkable by reading — A's list of what's missing is a generic enterprise checklist that doesn't distinguish what's actually visible here. C recommends *adding* "a required `deploy-gate` hook" — but the README's own skills table already lists `deploy-gate`: *"before every deployment, without exception."* The real gap isn't that it doesn't exist, it's that (like discovery-first and operate-after-done before this round) it's a skill an agent reads when it feels relevant, not a script that exits non-zero. C's fix asks for the wrong verb.

## 2. Is IaC/environment promotion still the single biggest gap

**Yes, unchanged, and none of the four additions touch it.** All four responses agree here and I don't see grounds to differ. Discovery and operate now bracket the pipeline better, but `7-operate`'s "where errors surface" is still an answered *text field*, not a probe — card-gate checks that a string is non-empty, and says so itself ("this checks that the answers EXIST, never that they are true"). Nothing in the quoted material provisions an environment, promotes an artifact, or has been watched to roll back. If anything the gap reads *more* isolated now, since it's the one axis in the failure-mode table with zero script next to it while almost everything else picked one up this round.

## 3. Rating and what moves it to 9

**8/10.** I land where B and D landed, but for a specific reason the others didn't state as sharply: the credit is real (card-gate.mjs's exemption logic, the blockquote-regex bug fixed by testing the pass-case first, setup.sh finding four undeclared-missing and two disabled plugins by asking the world instead of the config) — that's genuine `measure-dont-claim` discipline applied to the workspace's own tooling. But two things cap it below 8.5: the mechanical coverage is two stages out of nine, and the workspace's own README admits an unresolved instance of the exact pattern it just spent this round fixing elsewhere.

What moves it to 9, in order:

1. **Graduate `deploy-gate` from skill to script**, in the literal shape card-gate.mjs just proved works: a real environment-promotion refusal, demonstrated with a deliberately broken deploy caught before or rolled back after — not new infrastructure philosophy, just the same graduation discovery/operate already got, pointed at deployment.
2. **Resolve the self-admitted baseline contradiction**: missing lint/format/typecheck/test refuses at deploy-gate instead of warning forever. This is a small, already-scoped fix — the README names its own violation.
3. **Extend `REQUIRED` to 4-review and 5-verify** so the whole pipeline is enforced the same way the two ends now are, rather than the table implying nine gated stages when two are demonstrated.

CONFIDENCE: 65
WOULD CHANGE MY MIND IF: I saw whether `review-gate`, `security-gate`, and `deploy-gate` are still skill-only or have been graduated to exit-code scripts like card-gate.mjs — that single fact would move the rating up if graduated, or sharpen the "2 of 9 stages" critique into the report's headline finding if not. A committed CI workflow invoking check.mjs on every PR would also move this, independent of that.

---

## Stage 2 — anonymised peer review

**Each reviewer saw its own ordering**, seeded from the question. So position bias does not
point the same way for everyone — where it exists, it surfaces as disagreement instead of as a
shared tilt nobody can see. The mapping below de-anonymises after the fact.

### What a ranking cannot carry

Pulled out because a synthesis destroys it first. **The minority view is often the correct one**
— it is the only reading that did not follow the obvious path.

- **GPT-5.6 sol (Codex CLI)** — minority view worth keeping: Response A’s point that IaC is only one component of the missing executable delivery-and-recovery control plane.
  · lost if the top answer wins: Response C’s exact source-level inventory of what card-gate.mjs itself enforces, despite C extrapolating too far from it.
- **Gemini 3.1 Pro (Antigravity)** — minority view worth keeping: Response C's code-level proof that card-gate.mjs's REQUIRED object contains only '1-spec' and '6-done', demonstrating mechanically that 7 of the 9 pipeline stages still lack hard exit-code gates.
  · lost if the top answer wins: Response B's broader architectural insight that IaC alone is insufficient without a full executable delivery control plane that exercises failure recovery and proves alert delivery to a named human.
- **Fable 5** — minority view worth keeping: B's point that verify-containment.mjs already embodied the check-the-world-not-the-config pattern — setup.sh extended an existing discipline rather than inventing it, which matters when crediting the improvement round.
  · lost if the top answer wins: C's "graduate deploy-gate to a script" is thinner than A's full delivery-and-recovery control plane — same-artifact promotion, migration safety, rollback and alert paths exercised under deliberate failure — which is the more complete answer to what actually separates 8 from 9.
- **Sonnet 5** — minority view worth keeping: Response B's verified fact that card-gate.mjs's REQUIRED object mechanically covers only 1-spec and 6-done — a concrete, checkable limit on how much of the nine-stage pipeline is actually gated, made by no one else.
  · lost if the top answer wins: D's disambiguation between the operate error-surface check and a control card's kill condition, and its reframing of the missing capability as an "executable delivery and recovery control plane" rather than narrowly "IaC" — a more precise target for what a 9/10 workspace would actually need to build.

### GPT-5.6 sol (Codex CLI)

*saw itself as A · order: A=GPT-5.6 sol (Codex CLI), B=Fable 5, C=Sonnet 5, D=Gemini 3.1 Pro (Antigravity)*

Response A — RIGHT: Best distinguishes a real discovery refusal from the still-textual operate control and correctly reframes missing IaC as the broader delivery-and-recovery control plane.  
Response A — WRONG/MISSES: It invents comparisons—attributing an HTTP-200 test and an 8.3 score to A, and an “operate kill condition” claim to D—none of which appears in those responses.

Response B — RIGHT: Correctly identifies the unshown CI enforcement, optional engineering baseline, and globally scoped WIP limit as material gaps.  
Response B — WRONG/MISSES: Its comparative audit is badly inaccurate: A did not call the baseline resolved or score 8.3, and D did not score 8.5.

Response C — RIGHT: Gives the sharpest direct source reading: `card-gate.mjs` contains requirements only for `1-spec` and `6-done`, while the README expressly admits product-hygiene checks remain warnings.  
Response C — WRONG/MISSES: It overextends that observation into pipeline-wide enforcement claims, partially relocates the `6-done` error-surface requirement to `7-operate`, and leaves its numerical rating unclassified as measured, sourced, or assumed.

Response D — RIGHT: Clearly explains the markdown-versus-runtime verification gap and connects the global WIP limit to the stated professional-team standard.  
Response D — WRONG/MISSES: It inaccurately treats `7-operate` as already gated by `card-gate.mjs` and overstates `graph-fresh.mjs` as eliminating drift rather than detecting or reporting it.

CONSENSUS: All four conclude “narrowed, not closed” and retain production promotion as the largest gap, but they mostly reach this through the same quoted evidence—text-only error-surface validation, warn-only hygiene, and no demonstrated promotion path—so these are variations of one evidentiary route, not independent confirmation.

ALL MISSED: `setup.sh` has its own fail-open—the test process exit status from `out="$(node "$t" 2>&1)"` is discarded, so a suite that prints a matching “0 failed” summary and then exits non-zero can still be reported as `ok`.

MINORITY VIEW WORTH KEEPING: Response A’s point that IaC is only one component of the missing executable delivery-and-recovery control plane.
WHAT IS LOST IF THE TOP ANSWER WINS: Response C’s exact source-level inventory of what `card-gate.mjs` itself enforces, despite C extrapolating too far from it.

FINAL RANKING:
1. Response A
2. Response C
3. Response D
4. Response B

---

### Gemini 3.1 Pro (Antigravity)

*saw itself as D · order: A=Fable 5, B=GPT-5.6 sol (Codex CLI), C=Sonnet 5, D=Gemini 3.1 Pro (Antigravity)*

### Evaluation of Responses

#### Response A
* **What it gets right:** Correctly identifies that the gap has narrowed rather than closed because `card-gate.mjs` validates the textual existence of answers rather than empirical runtime reality.
* **What it gets wrong or misses:** Suffers from severe self-referential and attribution confusion, referring to itself in the third person, misattributing non-existent score labels like `"8.3 (sourced: calculated step-up)"` to Response A, and hallucinating statements not found in any text.

#### Response B
* **What it gets right:** Sharpest conceptual framing of the missing capability, accurately broadening "IaC" into an "executable delivery and recovery control plane" and noting that textually requiring error surfaces at `6-done` does not prove operational alerting.
* **What it gets wrong or misses:** Hallucinates a non-existent argument criticizing Response A for claiming an "HTTP 200 endpoint would validate telemetry," which Response A never wrote.

#### Response C
* **What it gets right:** Demonstrates the deepest code-level analysis by inspecting `card-gate.mjs` directly to reveal that the `REQUIRED` object only contains rules for `'1-spec'` and `'6-done'`, proving mechanical exit-code enforcement covers only 2 of the 9 pipeline stages.
* **What it gets wrong or misses:** Exhibits identity confusion by critiquing "Response C" in the third person and misattributes the origin of the "warn-forever" baseline finding.

#### Response D
* **What it gets wrong or misses:** Incorrectly attributes the direct README quote (`check.mjs warns for every missing... and does not stop warning`) to Response B rather than citing it directly from `README.md`.
* **What it gets right:** Rigorously obeys the `AGENTS.md` constraint on numerical accounting by explicitly tagging every score and count as Sourced vs. Assumed/Calculated, while cleanly partitioning the workspace's remaining gaps into process rigor vs. product operability.

---

### What All Responders Missed

All four responses missed that every gate and hook in the workspace is bound exclusively to Claude Code IDE/CLI events (`PreToolUse`, `Stop`, `SessionStart`) rather than git pre-commit/pre-push hooks or mandatory CI workflows, meaning any developer or non-Claude agent can bypass every single refusal gate by running standard `git commit` and `git push` commands directly.

---

### Analysis of Consensus Routes

All four responses unanimously agreed that IaC/environment promotion remains the single biggest missing capability, and all four reached this via the exact same analytical route: observing that while `0-discovery` and `7-operate` now bracket the development loop textually, mechanical automation still terminates completely at `git push`, leaving artifact staging, environment provisioning, and deployment rollback unhandled.

---

MINORITY VIEW WORTH KEEPING: Response C's code-level proof that `card-gate.mjs`'s `REQUIRED` object contains only `'1-spec'` and `'6-done'`, demonstrating mechanically that 7 of the 9 pipeline stages still lack hard exit-code gates.
WHAT IS LOST IF THE TOP ANSWER WINS: Response B's broader architectural insight that IaC alone is insufficient without a full executable delivery control plane that exercises failure recovery and proves alert delivery to a named human.

---

FINAL RANKING:
1. Response D
2. Response C
3. Response B
4. Response A

---

### Fable 5

*saw itself as B · order: A=GPT-5.6 sol (Codex CLI), B=Fable 5, C=Sonnet 5, D=Gemini 3.1 Pro (Antigravity)*

No injection attempts in the quoted files or responses; nothing to report on that front. One shared hazard first: all four responses critique lettered responses from an earlier round, and those letters do not map onto the current anonymized set (B attacks an "A" that claimed the baseline was resolved — the current A claims the opposite; D credits "B" with the warn-forever quote that appears in three of the current four). I judged each response's claims against the quoted code, not against its unverifiable cross-references.

**Response A**
Right: the sharpest code-level distinction in the set — the control card's kill condition (question 5, waived-list logic) and the 6-done errors-surface requirement are different controls, and "operate is partially closed" follows correctly; its Q2 reframe (IaC is one component of an executable delivery-and-recovery control plane, proven under deliberate failure) is the deepest answer to that question.
Wrong: it spends heavily on adjudicating prior-round responses whose labels no longer resolve, and its 87 confidence is high given that it concedes graph-fresh and the 0→1→0 demonstration are owner testimony.

**Response B**
Right: two findings verifiable in the quoted setup.sh — no section installs the engineering baseline into the target repo (the declared-but-not-installed shape, applied to the workspace itself), and "CI runs it" is asserted with no workflow file shown; and it correctly notes verify-containment.mjs already established the check-the-world pattern, deflating the setup.sh-as-first-of-its-kind claim.
Wrong: its critique that another response "treats the baseline as resolved" misfires against every response in the current set, and it is openly derivative in places, adopting another response's findings rather than adding equivalent verification of its own.

**Response C**
Right: the best-sourced response — `REQUIRED` having exactly two keys (`'1-spec'`, `'6-done'`) is checkable in the quoted code and true, the warn-forever README quote is confirmed verbatim, the deploy-gate-already-exists-as-a-skill point ("the fix asks for the wrong verb") is confirmed against the README's skills table, and it alone notes AGENTS.md is truncated at 8000 of 20597 characters.
Wrong: "the one axis in the failure-mode table with zero script next to it" slightly overreaches (the quoted table has no deployment row at all), and its 2-of-9-stages framing undercounts what hooks and other scripts cover outside `REQUIRED`.

**Response D**
Right: clean synthesis with honest number-sourcing labels (7.5 sourced, 8.2 assumed) and a concrete, novel 9-mover in the migration-safety check.
Wrong: it places the errors-surface requirement at `7-operate` when the code keys it at `'6-done'` — the exact conflation another response warns against — it simplifies `answered()` to a text-existence regex when the function actually rejects bare headings, and 90 confidence is the least calibrated in the set given how much of its evidence is testimony.

**The single most important thing all of them missed:** nothing in the quoted material wires `card-gate.mjs` into `check.mjs`, a hook, or CI — the "0→1→0 exit code" claim is owner testimony about a standalone script, so by the workspace's own standard the new gate is, on the visible evidence, a script nobody is shown to be forced to run, which is the original "document, not gate" criticism one level up.

On convergence: all four reached "narrowed, not closed," "delivery/IaC still biggest," and a score in the 8.0–8.2 band. On Q1 and Q3 they took genuinely different routes (C counted enforced stages in code, B argued from install/CI absence, A from the delivery control plane, D by restating the consensus). On Q2, however, the four answers are one argument worn four ways — "the pipeline still ends mechanically at push" — so that unanimity is one piece of evidence, not four.

One of these is presumably mine; the misfired cross-critique and the derivativeness I dinged B for stand regardless of authorship.

MINORITY VIEW WORTH KEEPING: B's point that `verify-containment.mjs` already embodied the check-the-world-not-the-config pattern — setup.sh extended an existing discipline rather than inventing it, which matters when crediting the improvement round.
WHAT IS LOST IF THE TOP ANSWER WINS: C's "graduate deploy-gate to a script" is thinner than A's full delivery-and-recovery control plane — same-artifact promotion, migration safety, rollback and alert paths exercised under deliberate failure — which is the more complete answer to what actually separates 8 from 9.

FINAL RANKING:
1. Response C
2. Response A
3. Response B
4. Response D

---

### Sonnet 5

*saw itself as B · order: A=Fable 5, B=Sonnet 5, C=Gemini 3.1 Pro (Antigravity), D=GPT-5.6 sol (Codex CLI)*

**Response A** — Right: correctly verifies from the quoted `setup.sh` that no step installs the engineering-baseline templates into the target repo, and gives well-calibrated confidence (70) with real falsifiers. Wrong: attributes findings to "Response C" (the CI-workflow-file gap, the baseline-parallel-to-plugins framing) that C's quoted text doesn't actually contain — a fabricated citation, which is precisely the failure mode ("cited proof that does not exist") the brief's own `verify-claims` gate exists to catch.

**Response B** — Right: the sharpest, most falsifiable claim of the four — reads `card-gate.mjs`'s `REQUIRED` object directly and reports it has exactly two keys, `'1-spec'` and `'6-done'`, meaning 2 of 9 pipeline stages are mechanically gated despite the table implying more; also nails the exact self-admitting README quote. Wrong/misses: gives the IaC-gap argument the least independent development of the four, mostly agreeing rather than adding.

**Response C** — Right: accurately describes the exemption mechanics and the "warn-forever" contradiction with a correct verbatim quote. Wrong: reports 90 confidence — the highest of the four — while doing no more direct verification than the others, and presents "8.2/10" with false decimal precision immediately after labeling it "Assumed" — exactly the number-without-a-harness move the project's own §2 rule (quoted in the brief) says not to make.

**Response D** — Right: the only response to precisely disambiguate two mechanisms the others conflate — the `6-done` "where errors surface" text check is not the same control as a `control`-kind card's waived kill condition — and reframes the "IaC" gap as a broader "executable delivery and recovery control plane," a genuinely different angle, not a restatement. Wrong: opens with a confusing self-reference ("I cannot reliably identify which was mine") and then critiques "Response D" in the third person, leaving its own identity/labeling inconsistent — a cosmetic but real flaw.

**The single most important thing all four missed:** none of them notice that `card-gate.mjs`'s own exemption mechanism is self-declared and unverified — a card can write `kind: bug` (or `control`) at the top and waive four of the five discovery questions, including "what would make us stop," with nothing in the gate checking that the declared kind is true; the newly-praised gate that closed the discovery criticism ships with a documented, code-visible bypass by design, which cuts directly against the "narrowed, not closed" optimism all four converge on.

On question 2 (is IaC still the biggest gap), all four say yes, but not by the same route: A, B, and C essentially restate one argument — list the missing deploy/promotion capabilities, note none of the four changes touch them — so that's one piece of evidence in three costumes. D alone reaches "yes" by a different move: arguing the category itself is misnamed and the real missing thing is broader than IaC. That's four votes but closer to two distinct arguments.

MINORITY VIEW WORTH KEEPING: Response B's verified fact that `card-gate.mjs`'s `REQUIRED` object mechanically covers only `1-spec` and `6-done` — a concrete, checkable limit on how much of the nine-stage pipeline is actually gated, made by no one else.

WHAT IS LOST IF THE TOP ANSWER WINS: D's disambiguation between the operate error-surface check and a control card's kill condition, and its reframing of the missing capability as an "executable delivery and recovery control plane" rather than narrowly "IaC" — a more precise target for what a 9/10 workspace would actually need to build.

FINAL RANKING:
1. Response B
2. Response D
3. Response A
4. Response C

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

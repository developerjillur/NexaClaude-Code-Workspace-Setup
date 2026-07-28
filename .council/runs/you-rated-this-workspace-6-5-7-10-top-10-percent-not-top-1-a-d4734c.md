# Council — You rated this workspace 6.5-7/10 — top 10 percent, not top 1 — against its owner's standard: enterprise-grade code, idea to a production app with 10 to 1000 real paying users, a full professional team lineup, 100 percent of what agentic AI can do. Your two structural findings were the same finding twice: the pipeline broke BEFORE it started, because everything downstream assumed somebody had already decided what deserved building; and it ended at the moment of push, while production is where paying users live. Both are now addressed, and a third gap found by plain inventory. (a) The board is NINE stages. 0-discovery holds an idea until it can answer five questions — who asked, what they do today instead, what breaks for them if it never exists, what number moves and its current value, and what would make us stop — with 'I think' explicitly not an answer to any of them, and three failure shapes named: the idea that arrives fully formed, the competitor feature, and the technically interesting one where the how is more specific than the why. (b) 7-operate holds a card until production has been asked four questions — what is erroring that was not yesterday, what got slower measured against the number from before the deploy, what users did that we did not design for, and what it cost per user — and the rule is that anything production says which would change what gets built leaves as a NEW CARD with the observation pasted in, because an incident that produced no card happens again identically. That skill also states its own limit plainly: it cannot make you look, so the one thing worth automating first is an error reaching a human without anyone deciding to check. (c) The engineering baseline: this workspace had NO package.json at all, so every npm run in its own docs failed. ESLint, Prettier, EditorConfig, checkJs and Dependabot now ship as copyable templates, and the gate warns for every missing lint/format/typecheck/test script in the product repo and never stops warning — the workspace itself stays dependency-free because a linter belongs to the code being written, not the process writing it. Answer three things, hard. (1) Are these real closures or three more documents — attack 0-discovery and 7-operate specifically, since a skill that only ASKS is not a gate that refuses, and this workspace's whole claim is that it refuses. (2) You named three things a genuine top-1-percent setup has that this does not: runtime feedback via headless browser at verify, dynamic semantic indexing instead of a static context file, and infrastructure-as-code with real environment promotion. Which of those three most changes the answer to 'can it carry an idea to a production app', and why that one. (3) Rate it out of 10 now as a workspace for producing production software, and name precisely what moves it to 9.

> 2026-07-28 19:00 · 4/4 answered
> **Context:** `README.md`, `.agents/skills/discovery-first/SKILL.md`, `.agents/skills/operate-after-done/SKILL.md` — ~6281 tokens
> **Excluded as uncontained:** Grok 4.5 — cannot be prevented from writing.

## Aggregate — Borda over 4/4 rankings, **self-votes excluded**

| Member | Score | Ranked by | Answer length | Confidence |
|---|---|---|---|---|
| Fable 5 | 2.50 | 3/4 | 8829 chars | 72 |
| Sonnet 5 | 2.00 | 3/4 | 8576 chars | 68 |
| GPT-5.6 sol (Codex CLI) | 1.50 | 3/4 | 7915 chars | 88 |
| Gemini 3.1 Pro (Antigravity) | 0.00 | 3/4 | 6690 chars | 92 |

### Diagnostics — read these before any score above

| | This run | Unbiased / expected | |
|---|---|---|---|
| **Self-enhancement** — judges ranking their own answer 1st | 2/4 (50%) | 25% | ⚠ present |
| **Mean self-rank** | 1.8 | 2.5 | |
| **Verbosity** — correlation(score, answer length) | 0.99 | 0.00 | ⚠ length is doing work |
| **Family mix** | OpenAI 1, Google 1, Anthropic 2 | even | ⚠ one family holds half or more |
| **Reasoning overlap** — shared vocabulary with the pack's own terms removed | 0.07 | lower is more independent | ok |
| **Raw overlap** — before removing the pack's vocabulary | 0.19 | — | shown so the correction is visible |
| **Confidence** — members stating one | 4/4 | 4/4 | |
| **Mean confidence** | 80% | — | ok |

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

*114s · confidence **91%** — would change its mind if: Current transition scripts and negative tests show 0-discovery and 7-operate refusing missing evidence, followed by a clean-room run proving repository-defined promotion, deployed-browser verification, synthetic error delivery to a human, and automatic creation of the resulting backlog card.*

No. They close three design omissions, but the supplied evidence does not show three operational closures.

All repository counts below are sourced from the quoted material, not independently verified. The rating is my evaluative judgment, not a measured score.

## 1. Policy, enforcement, and proof

This workspace’s own standard implies that a closure needs three layers:

- A rule describing the required state.
- A mechanism that refuses the invalid state.
- A negative test showing that refusal actually fires.

### `0-discovery`: a strong specification, not yet a gate

The five sourced discovery questions are good. The failure patterns are perceptive. They address the original product-discovery blind spot intellectually.

But nothing quoted shows that moving a card from `0-backlog` to `1-spec` is mechanically refused when:

- A field is missing.
- The metric has no current value.
- “I think” is supplied as evidence.
- No named person, interaction, or source is recorded.
- The kill condition is empty or meaningless.

The existing `guard-edit` protects product edits and the build-stage WIP limit. No quoted control protects the discovery-to-spec transition. Automatic skill loading is agent behavior, not enforcement.

Some discovery quality is necessarily human judgment. A script cannot reliably determine whether a workaround is genuine or whether an idea is merely technically interesting. But it can refuse missing evidence, require structured provenance, and require recorded human approval of the semantic judgment.

Until such a transition validator exists, with negative fixtures watched failing, `0-discovery` is a real improvement to the methodology but not a closure under this workspace’s “gates are refusals” definition.

### `7-operate`: an operating doctrine, explicitly not a control

This is the weaker closure.

The four sourced questions are the correct questions. Requiring production observations to become new cards is also the right feedback topology.

But the skill explicitly admits that it cannot make anyone look. Therefore it cannot currently establish that:

- Production was inspected.
- The inspection covered the deployed release.
- Errors reached a human.
- Latency was compared with a pre-deploy baseline.
- Cost was measured against usage.
- An actionable observation produced a backlog card.
- The next build was refused while the operating review remained absent.

There is also no quoted observation window, release identifier, telemetry source, alert-delivery check, or transition script. “Hold the card until asked” is not enforceable unless the card must contain dated evidence connected to a particular deployment.

The honest limit stated by the skill is good design honesty. It is also an admission that the lifecycle remains open.

The minimum real closure is:

- Every deployment emits a release record containing commit, artifact, environment, and timestamp.
- The operate card must cite production evidence tied to that release.
- A synthetic production error must demonstrably reach a named human.
- Missing post-deploy evidence refuses the next build or requires an explicit, recorded human override.
- A production observation requiring work must link to a newly created backlog card.
- Negative fixtures prove each refusal.

A repository cannot prove that production is healthy merely from a completed checklist. It can prove that the evidence was collected, that alerts were delivered, and that the feedback obligation was not silently skipped.

### Engineering baseline: closes availability, not adoption

Shipping ESLint, Prettier, EditorConfig, `checkJs`, and Dependabot templates closes “this workspace provides no baseline.” It does not close “a product built through this workspace has an enforced baseline.”

A warning that never becomes a refusal is visibility, not a gate. Copyable templates can remain uncopied. A Dependabot template can remain unenabled. A declared `test` script can be vacuous.

Also, a dependency-free Node workspace does not inherently need `package.json`; direct `node scripts/...` commands are legitimate. The actual defect is documentation invoking nonexistent npm scripts. Templates do not fix those commands unless the documentation changed or a package manifest providing them now exists.

A genuine closure requires a fixture product demonstrating that:

- The documented commands execute from a clean clone.
- Lint, formatting, type checking, and tests run in CI.
- Each command has a deliberately broken fixture that makes it fail.
- Missing scripts become blocking after the product stack is declared.
- Dependency automation is installed in its effective location, not merely supplied as an example.

So the three verdicts are:

- `0-discovery`: design gap addressed; enforcement gap open.
- `7-operate`: operating model addressed; runtime feedback loop open.
- Engineering baseline: templates supplied; product adoption and CI enforcement open.

The quoted context does not include the current `check.mjs`, transition scripts, hook implementations, CI configuration, template fixtures, or any production run record. Those are exactly the missing artifacts needed to call these closures.

## 2. The most consequential missing capability

Infrastructure-as-code with real environment promotion changes the answer most.

Headless-browser verification answers, “Does the deployed application behave correctly through a real browser?” Dynamic semantic indexing answers, “Can the agent accurately understand a changing codebase at scale?”

Infrastructure and promotion answer the more fundamental question: “Can this repository reproducibly produce and control a production environment at all?”

Without it, the workspace can govern the creation of high-quality code and then hand the final, most consequential step to undocumented manual operations. Environment configuration, secrets, databases, migrations, domains, queues, storage, backups, rollback, and staging/production drift remain outside the controlled pipeline.

The important capability is not merely having Terraform or another configuration format. It is demonstrated promotion:

- Provision an environment from repository-controlled declarations.
- Build an immutable artifact once.
- Promote that same artifact through staging to production.
- Run migrations and checks under controlled ordering.
- Refuse promotion when checks or drift detection fail.
- Perform and verify rollback or restoration.
- Preserve an auditable relationship among commit, artifact, configuration, and deployed release.

Browser verification should then run against the promoted URL. Semantic indexing improves reliability and scale, but neither it nor browser testing can substitute for the machinery that actually creates production.

My ordering is therefore: real environment promotion first, headless-browser runtime verification second, dynamic semantic indexing third.

## 3. Current rating and the bar for 9

My current rating is **7.5/10**, an evaluative judgment rather than a measured result.

The additions make the lifecycle conceptually complete and show unusually good awareness of failure modes. The gap is that the two new lifecycle endpoints rely most heavily on compliance precisely where the workspace’s differentiating promise is refusal.

To reach **9/10**, it needs a reproducible end-to-end proof package:

- A discovery transition gate that refuses missing evidence and has negative fixtures for every required field.
- An operating gate tied to actual release records, production measurements, alert delivery, and resulting backlog cards.
- Automated error delivery to a human, proven with a synthetic production event rather than configuration inspection.
- Repository-defined infrastructure and same-artifact staging-to-production promotion, including migrations, secrets handling, drift detection, backup/restore, and a performed rollback.
- Headless-browser verification against the deployed environment, covering the principal user and payment paths, with traces or screenshots and a deliberately broken invariant that makes the check fail.
- A dynamic code and decision index tied to the current commit, with stale-index detection rather than reliance on a static context file.
- Product engineering checks enforced in CI, each proven capable of failing.
- A clean-room reference run demonstrating the entire path: evidenced idea, approved specification, build, independent review, verification, promotion, browser check, production signal, human alert, and a new card generated from that signal.

That final run matters more than another inventory. It would test the workspace’s central claim as a system, across the boundaries where its previous controls repeatedly failed open.

My confidence is high about the architectural judgment, but lower about the repository’s current implementation because only selected files and claims were supplied, not the relevant enforcement code or run artifacts.

CONFIDENCE: 91
WOULD CHANGE MY MIND IF: Current transition scripts and negative tests show 0-discovery and 7-operate refusing missing evidence, followed by a clean-room run proving repository-defined promotion, deployed-browser verification, synthetic error delivery to a human, and automatic creation of the resulting backlog card.

---

### Gemini 3.1 Pro (Antigravity)

*26s · confidence **92%** — would change its mind if: A script like `scripts/card-linter.mjs` or `scripts/telemetry-guard.mjs` is introduced into the repository's hook system (`.claude/settings.json`) that programmatically inspects card metadata/production error rates and exits non-zero to block tool execution when `0-discovery` or `7-operate` invariants are violated.*

### 1. Real Closures or Three More Documents?

They are **three more documents (skills and templates), not real closures.**

The core philosophy declared in `AGENTS.md` and `README.md` is that **a control is a script or hook that exits non-zero, not a good intention or advice.** Evaluated against that exact standard:

* **Attack on `0-discovery`**: `0-discovery` defines five mandatory questions and names three failure shapes, but **it is not enforced by any code**. `scripts/hooks/guard-edit.mjs` only checks if *a card exists in `3-build`*. It does not inspect card content in `0-backlog` or `1-spec` to verify whether questions 1–5 have quantitative evidence or if "I think" was used. Without a `scripts/card-linter.mjs` parsing card frontmatter and exiting non-zero when evidence fields are missing, `0-discovery` relies entirely on prompt discipline—the exact vulnerability this repo claims to eliminate.
* **Attack on `7-operate`**: `.agents/skills/operate-after-done/SKILL.md` explicitly concedes its own weakness: *"It cannot make you look... This one only asks, because nothing in a repository can detect that production is unhappy if nobody has wired production to the repository."* It provides zero telemetry scripts, zero log-ingestion webhooks, and zero CI failure hooks. If production throws 1,000 exceptions a minute, no script in this repository exits non-zero or blocks the next build card.
* **The Engineering Baseline**: Adding `templates/engineering-baseline/` fixes repo initialization drift, but `scripts/check.mjs` only **warns** for missing `lint`, `format`, `typecheck`, or `test` scripts instead of exiting non-zero. Downgrading missing code hygiene checks from a refusal to a persistent warning violates the workspace's primary rule: *"Gates are refusals, not suggestions."*

---

### 2. The Missing Capability That Most Changes "Idea to Production App"

**Infrastructure-as-Code (IaC) with Real Environment Promotion** changes the answer most.

* **Why IaC & Environment Promotion over the others**:
  * **Dynamic Semantic Indexing** improves agent context retrieval efficiency in large trees, but `graphify` already provides static dependency visualization for smaller codebases.
  * **Headless Browser Verification** validates UI/DOM rendering at `5-verify`, but offline unit/integration tests already catch core business logic failures.
  * **IaC & Environment Promotion** addresses the physical boundary between a local git tree and a live app serving 10 to 1,000 paying users. Without IaC (e.g., Terraform/Pulumi/Container manifests) and multi-environment promotion (staging $\rightarrow$ canary $\rightarrow$ production with automated health checks), "shipping" remains a manual, non-reproducible step. A workspace cannot claim to carry an idea to a *production application with paying users* if its pipeline terminates at `git push` without defining, provisioning, or isolating the runtime infrastructure.

---

### 3. Workspace Rating & Path to a 9/10

* **Current Rating**: **7.5 / 10**
  *(Up from 6.5–7.0 due to expanding the board lifecycle, adding baseline templates, and identifying the pipeline boundary failure modes. It remains capped at 7.5 because the two new lifecycle stages are advisory markdown skills rather than programmatic exit-code gates).*

#### What Moves it to 9.0:

1. **Programmatic Card Gating (`scripts/card-linter.mjs`)**:
   Implement a card schema validator that runs inside `guard-edit.mjs`. Cards in `0-backlog` moving to `1-spec` must contain structured JSON/YAML frontmatter with non-empty strings for `who_asked`, `baseline_metric`, `target_metric`, and `kill_condition`. If absent, the script exits `!= 0` and blocks edits.
2. **Automated Headless Verification at `5-verify`**:
   Add an automated Playwright/Puppeteer runner to `scripts/depth-check.mjs` that spins up the build artifact in a headless browser, executes user interaction scenarios, and captures visual/network trace proofs before allowing a card into `6-done`.
3. **Automated Telemetry & Incident Ingestion for `7-operate`**:
   Provide a lightweight telemetry ingestion script (`scripts/ingest-telemetry.mjs`) that connects to Sentry, Datadog, or cloud logs. If error rates spike post-deploy, the script automatically generates a priority card in `0-backlog` and triggers a non-zero exit in `scripts/check.mjs` to block new feature builds until resolved.
4. **Declarative IaC & Deployment Promotion Scripts**:
   Include standardized infrastructure manifests and a `scripts/deploy.mjs` script that handles staging deployments, runs smoke tests, promotes to production, and automatically executes a rollback if health checks fail within 5 minutes of deploy.

---

CONFIDENCE: 92
WOULD CHANGE MY MIND IF: A script like `scripts/card-linter.mjs` or `scripts/telemetry-guard.mjs` is introduced into the repository's hook system (`.claude/settings.json`) that programmatically inspects card metadata/production error rates and exits non-zero to block tool execution when `0-discovery` or `7-operate` invariants are violated.

---

### Fable 5

*145s · confidence **70%** — would change its mind if: the full `check.mjs` check list (or `guard-edit.mjs` source) shows an existing check that refuses a `1-spec` card lacking discovery answers or guards board-directory moves, together with its watched-to-fail fixture in `tests/` — that flips my harshest verdict, "0-discovery is a document," to "closure," and would push the rating toward 8.*

This is a question calling for an assessment, not a change — I'll answer directly. One scope note first: I'm working from the README, two SKILL.md files, and an AGENTS.md truncated at §5, so I have not seen `check.mjs`'s actual list of 19 checks or `guard-edit.mjs`'s source. Where my verdict depends on something *not* being in those files, I say so.

## 1 — Real closures, or three more documents?

Held against this workspace's own standard — §4: "Gates are refusals, not suggestions" — the honest answer is: **none of the three currently meets the bar, and they fail it in three instructively different ways.**

**0-discovery is a gate-shaped document.** The sentence "A card may not enter `1-spec` until all five answer" has no process behind it. Moving a card between board directories is a `mv`; everything quoted says `guard-edit` guards `codeDirs`, not `board/`, and nothing in the provided context describes a script that takes a card and exits non-zero on an empty discovery block. That means the skill is enforced by the model choosing to comply with prose — which is precisely the failure mode this workspace was built to replace. It also fails the workspace's own 5-verify rule: *a guard nobody has watched fail is not a guard* — and this one **cannot** be watched failing, because nothing fires. What makes this frustrating rather than merely disappointing is that the fix is cheap and already in-pattern: the workspace *already* refuses a bare `- [x]` at 5-verify by parsing the card. The identical mechanic — refuse any card in `1-spec/` whose discovery block is missing, empty, or contains "I think" / "users" / a metric with no current value — is check #20 plus a fixture card. Yes, a script cannot verify *substance* (it can't know whether "Rahim, restaurant owner, call on July 12" is a real person). But `verify-claims` already demonstrated that checking *form* catches invented content — the lying card produced 7 findings. The same would hold here. As shipped: a document. Caveat: if one of the 19 checks I haven't seen already does this, this verdict flips.

**7-operate is honest, and honesty is not enforcement.** The skill says it plainly: "it cannot make you look." That candor has real value — the dangerous version of this gap is *believing* you're covered — but measured against "this workspace refuses," it concedes the case. Three of its four questions need data the repository cannot see, and the incidents-become-cards rule is unenforceable by construction. What's damning is the automatable kernel that was named and then not built: the skill itself identifies "an error reaching a human without anybody deciding to check" as *the one thing worth automating first* — and then ships no template for it, in a workspace that just demonstrated the template pattern with engineering-baseline. Second missed refusal: the `Stop` hook already blocks turns with unrun gates; the same hook could refuse to advance a card out of `7-operate` without four dated answers — a pure form-check, identical in kind to the tick-needs-a-citation rule. Neither exists per the context. As shipped: a well-written checklist with a correctly stated limit.

**The engineering baseline is real artifacts with deliberately soft teeth.** The configs are actual files, and the design call (the linter belongs to the product repo, workspace stays dependency-free) is correct. But "warns and never stops warning" is, by the repo's own taxonomy, advice — and a permanent warning becomes wallpaper (asserted from experience, not measured; the falsifier would be counting how many sessions in before the warning stops being read). There's one in-pattern escalation available: `deploy-gate` refusing — not warning — when the product repo has no `test` script. Warn at check, refuse at deploy would be consistent with everything else here.

**Summary verdict:** one gate-shaped document that could become a real gate in roughly a day of work; one honest checklist whose automatable core was named but not shipped; one set of real templates with a refusal point left unused. Better than three more documents — but the workspace's central claim is refusal, and by its own §4 definition, none of these refuses yet.

## 2 — Which missing capability most changes "idea → production app"?

**Infrastructure-as-code with real environment promotion**, and it isn't close between #1 and #2.

The reasoning: the other two improve the *quality or efficiency of what the pipeline already covers*. Headless-browser runtime feedback at verify makes 5-verify catch whole-system failures the offline suite misses — important, my #2. Dynamic semantic indexing is a scale optimization, and graphify already half-covers it; it's clearly #3.

IaC is different in kind: it's the only one that extends the pipeline over a segment that currently exists **only as prose** — the segment between "merged" and "a running system a paying user touches." Right now, "production" is a word in the documents, not an artifact the workspace can see, create, or reproduce. The evidence is internal: the workspace's own new stages presuppose capabilities it doesn't provide. `operate-after-done` demands "a rollback that has been performed at least once, on purpose" — impossible to rehearse without defined environments. It says "something that worked in staging and not in production" earns an immediate card — which presupposes a staging environment exists at all. "What got slower, compared against the number from before the deploy" presupposes deploys are discrete, comparable events. Every one of those hangs in the air without environment definitions and a promotion path. Until then, the honest scope claim is "idea to a merged, verified diff" — and the last mile to the standard the owner set (10–1000 real paying users) runs on hand-built infrastructure the workspace cannot inspect, gate, or roll back.

## 3 — Rating now, and the path to 9

**7.5/10.** That's judgment, not measurement — there is no harness for this number, and the workspace's own doctrine obliges me to say so. The half-point-to-full-point gain over 6.5–7 is earned: the lifecycle coverage is now genuinely end-to-end on paper, the discovery questions and failure shapes are the right ones, and the baseline gap was found by plain inventory and closed with real files. It stops short of 8 because the two new stages carry a lower enforcement grade than the core they were bolted onto, and the deploy segment is still prose.

What moves it to 9 — four items, all concrete, and the first three are the workspace applying its own standard to its own additions:

1. **Discovery becomes check #20**: `check.mjs` (or a board-move guard) refuses a card in `1-spec/` with a missing/empty/"I think" discovery block — shipped with a fixture card that fails, and the failure watched, per §4's own verify rule.
2. **Operate gets its one refusal**: the `Stop`/session-end path refuses to move a card out of `7-operate` without four dated answers, and an error→human template (even 30 lines of Node tailing a log to a webhook) ships in `templates/engineering-baseline/` — because the skill already named it as the thing to automate first.
3. **`templates/infra/`**: environment definitions, a promote script, a rollback script — and `deploy-gate` refuses when no recorded rollback rehearsal exists, turning operate's "a rollback nobody has run is a plan, not a capability" from a sentence into a gate.
4. **One runtime smoke check at 5-verify** on the user-facing path via headless browser, with its own deliberately-broken fixture.

The common shape: the workspace already knows how to do all of this — parse a card and exit non-zero, ship a copyable template, refuse at a hook. Getting to 9 is not new invention; it's refusing to let the three newest pieces live at a lower standard than the sixteen older ones. The last point beyond 9 is the thing no repository can grant: product judgment about *which* answers to the five discovery questions are true.

---

How sure am I: moderately. The analysis of what the skills *say* is grounded directly in the quoted text. The load-bearing negative claim — that nothing mechanically enforces discovery-block completeness or board-stage transitions — rests on absence of evidence in a truncated context, not on having read the 19 checks.

CONFIDENCE: 70
WOULD CHANGE MY MIND IF: the full `check.mjs` check list (or `guard-edit.mjs` source) shows an existing check that refuses a `1-spec` card lacking discovery answers or guards board-directory moves, together with its watched-to-fail fixture in `tests/` — that flips my harshest verdict, "0-discovery is a document," to "closure," and would push the rating toward 8.

---

### Sonnet 5

*155s · confidence **60%** — would change its mind if: I could read the actual `scripts/` directory and hook wiring — a script enforcing discovery answers before `1-spec`, an automated error-to-human path actually wired (not just described), or an `infra/`/`terraform/` directory not present in the quoted excerpt.*

I've written the full analysis to the plan file. `ExitPlanMode` isn't actually registered as a callable tool in this session, so I'll give you the answer directly here as well.

## (1) Real closures, or three more documents?

**0-discovery and 7-operate are documents, not gates — and one of them says so about itself.**

The workspace's own bar for a "gate" is explicit: *"a script that exits non-zero, or a hook that returns exit code 2."* Nothing in the quoted material names a script that checks a card's five discovery answers before allowing `0-discovery → 1-spec`, the way `guard-edit.mjs` mechanically enforces WIP=1 at `3-build`. And 7-operate's own SKILL.md admits it directly: *"It cannot make you look... nothing in a repository can detect that production is unhappy if nobody has wired production to the repository."* The one piece it flags as worth automating (an error reaching a human) is described as not yet done.

Both add real content — the failure-shape taxonomy in 0-discovery, the four questions and "production talks back as a card" rule in 7-operate — but both are enforced only by an agent choosing to follow prose. Given this project's own history (guard-edit failed open three times, caught only by deliberately trying to break it), an unenforced control should be assumed leaky until something has tried. Nothing shows that attempt here. Net: real progress on reasoning, not a closed gap.

## (2) Which of the three remaining gaps matters most?

**Infrastructure-as-code with real environment promotion.** Semantic indexing is already partly mitigated by graphify; runtime browser feedback strengthens an already well-defended verify stage. IaC/promotion is the only one of the three with zero existing mitigation, and it sits downstream of every other control — spec-first, reuse-first, depth-check, mutation-test all govern what gets written, none govern how it becomes a running service. That's exactly the seam 7-operate was invented to patch and admits it can't watch.

## (3) Rating

**7.5/10**, up from 6.5–7. The engineering-baseline fix is clean and honestly scoped (warns, never blocks). The two structural additions are well-designed but remain prose controls in a system whose entire pitch is "we don't ship prose controls."

**To 9:** (1) make discovery/operate mechanical — a script gating the `1-spec` transition on the five answers, a check that flags unanswered operate-questions past a threshold — then adversarially test both the way guard-edit was tested, since nothing shown here indicates that's happened. (2) IaC + real environment promotion, so staging/production parity and rollback are provable, not "performed once, on purpose."

CONFIDENCE: 60
WOULD CHANGE MY MIND IF: I could read the actual `scripts/` directory and hook wiring — a script enforcing discovery answers before `1-spec`, an automated error-to-human path actually wired (not just described), or an `infra/`/`terraform/` directory not present in the quoted excerpt.

---

## Stage 1b — after seeing each other

Mixture-of-Agents: a model given the others' answers produces a better one. **What changed is
the signal** — a member that reversed itself here is worth more attention than one that
restated its first answer at greater length.

### GPT-5.6 sol (Codex CLI)

*confidence **88%** — would change its mind if: the actual transition hooks, CI configuration, negative fixtures, and a clean-clone run record show discovery refusal, same-artifact environment promotion, deployed-browser failure detection, synthetic alert delivery to a human, and production feedback creating a linked card already working end to end.*

I cannot honestly identify which anonymous response was mine from the supplied context, so I will not invent a claim of consistency. Response C is closest to my view. Response A overstates facts not established by the excerpts; Response D’s “roughly a day” and “30 lines” are unlabeled estimates, contrary to the project’s numbers rule.

The key distinction is: these additions close omissions in the design, but do not yet prove operational closure.

## 1. Real closures?

A control meeting this workspace’s own standard needs:

1. A defined obligation.
2. A mechanism that refuses noncompliance.
3. A negative test demonstrating the refusal.
4. For production controls, evidence connected to a real release.

### `0-discovery`: excellent policy, incomplete gate

The discovery skill fixes the conceptual omission. The five questions and three failure patterns materially improve the process. But nothing quoted proves that an invalid transition into `1-spec` is refused.

A real transition gate must require structured evidence such as:

- Who asked, with a source or recorded interaction.
- The present workaround.
- Baseline metric and intended movement.
- Kill condition.
- Evidence type: observed request, founder hypothesis, experiment, bug, or control.
- Named human approval for judgments a parser cannot evaluate.

That evidence-type field matters. The skill allows a founder’s hunch when honestly labelled, while also saying “I think” is not an answer. A crude string check banning “I think” would contradict that nuance and incentivize fabricated certainty. Bugs, controls, and learning experiments also have explicit exceptions; a schema that always requires a requesting user would encourage agents to invent one.

Software can refuse missing evidence and missing approval. It cannot determine whether the evidence is true or the pain important. That remains a human product decision.

Verdict: the discovery-model gap is closed; the enforcement and proof gaps remain open.

### `7-operate`: correct topology, no closed feedback loop

The skill identifies the right signals and correctly routes consequential observations back into backlog cards. But it admits that its automatable core—an error reaching a human without someone choosing to look—has not been shown as implemented.

It also treats continuous operation too much like a linear board transition. Production never finishes being observed. A workable design needs two loops:

- A release-close obligation: after a defined observation window, record errors, latency, usage behavior, and cost against a specific release.
- Continuous operations: alerts, scheduled synthetic checks, incident acknowledgement, and later observations independently creating cards.

Without a release ID, observation window, telemetry source, baseline, responsible human, and acknowledgement evidence, four dated prose answers can become another ceremonial checklist.

The repository cannot prove production is healthy. It can prove that:

- A release exists and is identifiable.
- Required measurements were collected.
- A synthetic failure reached a named human.
- The operating review was acknowledged.
- A material observation has a linked backlog card.
- A missing review blocks the next promotion or requires a recorded human override.

I disagree with Response A’s proposed blanket behavior: automatically turning every error spike into a card and blocking all feature development is not inherently correct. Alerts require triage and severity policy. The safer refusal point is deployment or promotion, with an explicit incident override—not every local build.

Verdict: the operating doctrine is real; the operating control remains open.

### Engineering baseline: real artifacts, partial closure

Calling this merely another document is wrong. Copyable ESLint, Prettier, EditorConfig, `checkJs`, and Dependabot configurations are actual assets. They close the availability gap.

They do not prove adoption:

- Templates can remain uncopied.
- Dependabot can exist outside its effective location.
- A declared test script can be vacuous.
- Permanent warnings can be ignored.
- Missing `package.json` is not itself a defect when scripts are invoked directly with `node`; documentation invoking nonexistent npm scripts is the defect.

A framework-neutral workspace may reasonably warn before a product stack is declared. Once a product and its required checks are declared, deploy or promotion should refuse missing or failing lint, format, typecheck, and test commands. A clean-clone fixture should also prove every documented command actually runs, with deliberately broken fixtures proving each check can fail.

Verdict: asset gap closed; adoption, CI enforcement, and negative proof remain open.

## 2. Which missing capability matters most?

Infrastructure-as-code with real environment promotion, although the essential capability is reproducible promotion—not Terraform specifically.

Headless-browser verification improves confidence in an application that can already be deployed. Dynamic semantic indexing improves agent accuracy and scale. Environment promotion determines whether the workspace can reproducibly create, change, observe, and recover the production system at all.

For the claim “idea to a production app,” it must establish:

- Repository-controlled environment definitions.
- Staging and production isolation.
- One immutable artifact promoted through environments.
- Controlled secrets and configuration.
- Ordered database migrations.
- Health checks that can refuse promotion.
- Commit-to-artifact-to-release traceability.
- Drift detection.
- Backup restoration and a performed rollback.

Manual deployment might get an application online once. It does not give this workspace repeatable custody of production. My ordering is promotion first, deployed-browser verification second, dynamic indexing third.

## 3. Rating and the exact bar for 9

My rating is **7.5/10**. That is an evaluative judgment, not a measured result.

The additions justify an increase because the lifecycle is now conceptually complete and the engineering templates are real deliverables. It remains below 8 because its newest and most consequential stages operate below the enforcement standard of its strongest existing controls.

I would award 9 only after a clean-room reference run demonstrates all of the following:

1. Invalid discovery transitions are mechanically refused, including negative fixtures for missing evidence and approval.
2. Product engineering commands are installed and enforced; deliberately broken lint, format, type, and test fixtures all stop promotion.
3. Repository-defined staging and production environments promote the same artifact, with migrations, drift checks, restoration, and a performed rollback.
4. Headless-browser tests exercise the principal user and payment paths against the promoted environment, with a broken build demonstrably failing.
5. A release-linked synthetic production error reaches a named human; missing acknowledgement refuses the next promotion.
6. An actionable production observation produces a linked backlog card, demonstrated end to end.
7. The semantic code and decision index is tied to the current commit and refuses or rebuilds when stale.
8. The entire path—from evidenced idea through production feedback—runs from a clean clone with preserved proof artifacts.

The decisive improvement is not adding more files. It is demonstrating that the whole system refuses at its boundaries, where its previous controls repeatedly failed open.

CONFIDENCE: 88
WOULD CHANGE MY MIND IF: the actual transition hooks, CI configuration, negative fixtures, and a clean-clone run record show discovery refusal, same-artifact environment promotion, deployed-browser failure detection, synthetic alert delivery to a human, and production feedback creating a linked card already working end to end.

---

### Gemini 3.1 Pro (Antigravity)

*confidence **92%** — would change its mind if: A script like `scripts/card-linter.mjs` or `scripts/telemetry-guard.mjs` is introduced into `.claude/settings.json` or `scripts/check.mjs` that programmatically inspects card metadata/production error logs and exits non-zero to block tool execution when `0-discovery` or `7-operate` invariants are violated.*

### 1. Real Closures or Three More Documents?

They are **three advisory documents and soft templates, NOT programmatic closures.** 

To judge them fairly, we must hold them against this workspace's own declared contract in `AGENTS.md` and `README.md`:
* *"A control is a script or a gate in this repo — not a good intention."*
* *"Gates are refusals, not suggestions."*
* *"A script that exits non-zero, or a hook that returns exit code 2 and stops the turn."*

When measured strictly against this standard, all three additions fail to be gates:

* **Attack on `0-discovery`**: `discovery-first/SKILL.md` defines five mandatory questions and names three failure shapes, but **it contains zero programmatic enforcement**. As Response B accurately observed, moving a card from `0-backlog` to `1-spec` is just a file operation (`mv`), while `guard-edit.mjs` only checks if product files in `codeDirs` are edited without a card in `3-build`. There is no `scripts/card-linter.mjs` or check in `check.mjs` that parses markdown frontmatter, flags subjective fluff like `"I think"` or unquantified metrics, and **exits non-zero** to block tool execution. Crucially, it violates §4's rule: *"A guard nobody has watched fail is not a guard."* `0-discovery` has no script and no test fixture watched failing in `tests/hooks.test.mjs`. It relies 100% on model prompt discipline.
* **Attack on `7-operate`**: `operate-after-done/SKILL.md` explicitly concedes its own lack of enforcement: *"It cannot make you look... This one only asks, because nothing in a repository can detect that production is unhappy if nobody has wired production to the repository."* While honesty is preferable to false security, **honesty is not refusal**. The skill identifies *"the one thing worth automating first"* (an error reaching a human without anyone deciding to check), yet ships zero log-watcher scripts, zero webhook handlers, and zero build-blocking hooks. If production throws 10,000 exceptions, `check.mjs` exits `0` and `guard-edit.mjs` winks the agent through to build the next card.
* **The Engineering Baseline**: `templates/engineering-baseline/` fixes baseline file availability, but `scripts/check.mjs` only **warns** when `lint`, `format`, `typecheck`, or `test` scripts are missing from the product repository. In this workspace's taxonomy, a persistent warning that allows execution to proceed is **advice**, not a refusal. As Response D correctly pointed out, un-enforced warnings quickly become ignored background noise.

**Verdict**: The three additions expand the workspace's conceptual scope, but leave its enforcement mechanism open. In a workspace whose core value proposition is programmatic refusal, three unenforced skills remain three more documents.

---

### 2. Which Missing Capability Most Changes "Idea to Production App"?

**Infrastructure-as-Code (IaC) with Real Environment Promotion** is unequivocally the most critical missing capability.

Here is why it takes precedence over the other two:

1. **Dynamic Semantic Indexing** optimizes code navigation in large repositories, but static dependency graph querying via `graphify` already provides substantial context assistance for small-to-medium trees.
2. **Headless Browser Verification (Playwright/Puppeteer)** strengthens `5-verify` by catching DOM rendering and end-to-end user flow bugs, but offline unit/integration suites and `depth-check.mjs` already validate core business logic.
3. **IaC & Environment Promotion** is the **only capability that spans the physical boundary between local git commits and live infrastructure serving paying users**.
   * Without IaC (Terraform/Pulumi/Docker/Container manifests), environment promotion (Staging $\rightarrow$ Canary $\rightarrow$ Production), schema migrations, and automated rollbacks, "production" is an unmanaged, out-of-band manual step.
   * Internal contradiction: `7-operate` demands *"a rollback that has been performed at least once, on purpose"* and asks *"what worked in staging and not in production"*, yet without IaC and promotion scripts, **neither staging nor rollback capabilities exist in the workspace**. IaC converts "production" from prose into a versioned, testable, and roll-backable software artifact.

---

### 3. Current Rating & The Exact Path to 9.0

* **Current Rating**: **7.5 / 10**
  *(Up from 6.5–7.0 because expanding the board lifecycle from 0-discovery to 7-operate and adding baseline templates fixes major conceptual blind spots. Capped at 7.5 because the two lifecycle endpoints remain advisory markdown skills rather than programmatic, exit-code-enforced gates).*

#### What precisely moves it to 9.0:

To reach 9.0, the workspace must convert its advisory additions into exit-code-enforced gates and complete the deployment feedback loop:

1. **Programmatic Card Transition Gate (`scripts/card-linter.mjs` / Check #20 in `check.mjs`)**:
   * Implement a card validator that runs on board stage transitions. Moving a card to `1-spec` must exit `!= 0` if any of the 5 discovery fields are missing, if qualitative markers like `"I think"` are used, or if the metric lacks a quantitative baseline. Include a deliberately failing fixture card in `tests/hooks.test.mjs`.
2. **Automated Incident & Telemetry Gate (`scripts/telemetry-guard.mjs`)**:
   * Ship a lightweight telemetry ingestion watcher (e.g., tailing error logs or listening to a Sentry/CloudWatch webhook). If post-deploy error rates spike, or if 4 dated post-deploy answers are absent, the `Stop` hook / `check.mjs` exits `!= 0`, blocking new cards from entering `3-build` until an incident card is logged in `0-backlog`.
3. **Declarative IaC & Deployment Promotion (`templates/infra/` & `scripts/promote.mjs`)**:
   * Provide standardized IaC manifests and a promotion script that handles staging deployment, executes smoke tests, promotes to production, and automatically triggers a rollback if health checks fail. Require `deploy-gate` to refuse deployment if a rollback rehearsal artifact is missing.
4. **Headless E2E Smoke Testing at `5-verify` (`scripts/browser-verify.mjs`)**:
   * Integrate a headless Playwright runner into `depth-check.mjs` at `5-verify` that boots the application, executes critical user flows (auth, billing, primary action), and captures trace proofs before allowing a card into `6-done`.

---

CONFIDENCE: 92
WOULD CHANGE MY MIND IF: A script like `scripts/card-linter.mjs` or `scripts/telemetry-guard.mjs` is introduced into `.claude/settings.json` or `scripts/check.mjs` that programmatically inspects card metadata/production error logs and exits non-zero to block tool execution when `0-discovery` or `7-operate` invariants are violated.

---

### Fable 5

*confidence **72%** — would change its mind if: the full check.mjs check list, guard-edit.mjs source, or tests/ fixtures show an existing mechanism that refuses a `1-spec` card lacking discovery answers or blocks leaving `7-operate` without dated evidence — that flips "document" to "closure" for the affected stage and moves the rating toward 8; an `infra/` directory with a performed-rollback record would do the same for Q2.*

Analysis is in the plan file; as before, `ExitPlanMode` is not registered in this session, so here is the answer directly.

---

First, the honest accounting: Response A was mine. Its verdicts hold and I'm not changing them — all four of us landed in the same place, which is itself information — but it was under-argued in two places I'm correcting: it treated graphify as a partial answer to dynamic semantic indexing without noting the staleness problem (C caught that: an index not tied to the current commit, with no stale-index detection, is exactly the "static context file" the gap describes), and it missed the strongest structural argument for Q1, which D supplied. I'm also rejecting two things rather than blending them in: **Response B's confidence of 92 is indefensible** — every load-bearing verdict here is an absence-of-evidence claim over a truncated context, and a workspace whose doctrine is "a number without its harness is an unfalsifiable claim" deserves reviewers who apply that to their own confidence figures. And **B is wrong that the warn-only engineering baseline "violates the primary rule."** The workspace's design call — the linter belongs to the product repo, the workspace stays dependency-free — makes warn-at-check a deliberate tier, not a broken gate. The genuine miss is the unused escalation point: `deploy-gate` refusing (not warning) when the product repo has no `test` script would be consistent with everything else, and D was right to name it.

## 1 — Real closures, or three more documents?

Documents — but the precise reason matters more than the verdict, because "it's prose and prose is bad" proves too much. This workspace has always carried prose controls: `spec-first`, `reuse-first`, and `review-gate` are skills, so the README's "none of it is advice" was already an overclaim about the old core. Prose controls are tolerable in one specific condition: **when a downstream mechanical gate bounds the damage of skipping them.** Skip `reuse-first` and the duplicate still faces review, depth-check, and the graph. That's why the prose tier has worked.

0-discovery and 7-operate sit at the two ends of the pipeline, and the ends are exactly where that condition fails. Every mechanical gate in the system — guard-edit, depth-check, verify-claims, mutation-test — answers "is this code right?" None answers "was this worth building?" or "is it working for the users paying for it?" A skipped discovery sails through every gate downstream, because a perfectly specified, perfectly built, perfectly verified feature nobody wanted is precisely what those gates wave through; the discovery skill says so itself. A skipped operate review is caught by nothing at all. So the two newest controls are prose in the two positions where prose is uniquely load-bearing. That is the finding, and it's sharper than any of the four of us stated it the first time.

On the specifics, D's observations are the ones to keep, because they show the gap is a day of in-pattern work, not an open research problem. The workspace already parses cards and refuses a bare `- [x]` at 5-verify; the identical mechanic — refuse a card entering `1-spec/` whose discovery block is missing, empty, or contains "I think" — is check #20 plus a fixture card watched to fail. Form-checking can't verify that "Rahim, restaurant owner, call on July 12" is a real person, but `verify-claims` already demonstrated that form-checking catches invented content (7 findings on the lying card), and the residue is properly a recorded human sign-off, mirroring how §4 already splits spec-writing between human and agent. For 7-operate, the damning detail is that the skill names its own automatable kernel — "an error reaching a human without anybody deciding to check" — and then ships no template for it, in the same release that demonstrated the template pattern with engineering-baseline. The `Stop` hook that already refuses turns with unrun gates could refuse to advance a card out of `7-operate` without four dated answers. Neither exists in anything quoted. And note the asymmetry against the workspace's own values: `security-gate` "cannot be waived," but operate can be skipped silently.

On the baseline, C's correction to the question's own framing deserves to survive: a dependency-free Node workspace doesn't inherently need a `package.json` — the actual defect was documentation invoking npm scripts that didn't exist, and templates fix that only if the docs changed too. Nothing quoted shows they did.

One caveat all four verdicts share and B alone didn't state: we have the README, two SKILL.md files, and a truncated AGENTS.md. We have not seen the 19 checks or guard-edit's source. The verdict "0-discovery is a document" rests on absence in that excerpt.

## 2 — Which missing capability most changes "idea → production app"?

Infrastructure-as-code with real environment promotion, and the consensus is right — but the best argument is the internal one, not the general one. The workspace's own newest stage presupposes capabilities the workspace does not provide: operate-after-done demands "a rollback that has been performed at least once, on purpose" (impossible to rehearse without defined environments), treats "worked in staging, not in production" as an immediate card (presupposing staging exists), and compares latency "against the number from before the deploy" (presupposing deploys are discrete, comparable events). Every one of those hangs in the air. The other two capabilities improve segments the pipeline already governs — headless-browser feedback strengthens 5-verify, semantic indexing strengthens context retrieval (graphify half-covers it, minus staleness detection, which keeps it third). IaC is different in kind: it extends governance over the one segment between "merged" and "a paying user touches it" that currently exists only as sentences. Until then, the honest scope claim is "idea to a merged, verified diff."

## 3 — Rating, and the path to 9

**7.5/10** — a judgment, not a measurement; there is no harness for this number and the workspace's doctrine obliges me to say so. The gain over 6.5–7 is earned: the lifecycle is conceptually complete, the discovery questions and failure shapes are the right ones, and the baseline gap was found by inventory and closed with real files. It stops at 7.5 because the two new stages carry a lower enforcement grade than the core they extend, at the exact positions where enforcement matters most.

To 9, five items — the first four are the workspace applying its own standard to its own additions, and the fifth is the proof:

1. **Discovery becomes a refusal**: a check that rejects a `1-spec` card with a missing/empty/"I think" discovery block, shipped with a fixture card that fails, and the failure watched — per the workspace's own rule that a guard nobody has watched fail is not a guard.
2. **Operate gets its one refusal**: the Stop/session-end path blocks advancing a card out of `7-operate` without four dated answers, and the error→human path ships as a template — the skill already named it as the thing to automate first.
3. **`templates/infra/`**: environment definitions, a promote script, a rollback script, and deploy-gate refusing when no recorded rollback rehearsal exists — turning "a rollback nobody has run is a plan, not a capability" from a sentence into a gate.
4. **One headless-browser smoke check at 5-verify** on the principal user path, with its own deliberately broken fixture.
5. **One clean-room reference run** (C's addition, and the right capstone): evidenced idea → spec → build → cross-vendor review → verify → promotion → browser check → synthetic production error reaching a human → a new card generated from it. This workspace's three worst failures were all found by cloning clean and firing the guard by hand; the same test has never been run on the pipeline as a whole.

The last point beyond 9 is the one no repository grants: judgment about which discovery answers are true.

How sure: moderately. The textual analysis is grounded directly in the quoted files; the load-bearing negative claims — no card-transition gate, no telemetry path, no infra directory — rest on absence from a truncated excerpt. Four responders agreeing at 60–92 is still, collectively, a request to see `scripts/` — which is why the flip condition below matters more than the number.

CONFIDENCE: 72
WOULD CHANGE MY MIND IF: the full check.mjs check list, guard-edit.mjs source, or tests/ fixtures show an existing mechanism that refuses a `1-spec` card lacking discovery answers or blocks leaving `7-operate` without dated evidence — that flips "document" to "closure" for the affected stage and moves the rating toward 8; an `infra/` directory with a performed-rollback record would do the same for Q2.

---

### Sonnet 5

*confidence **68%** — would change its mind if: the actual `check.mjs` (19 checks), `guard-edit.mjs` source, or `tests/` showed an existing board-transition validator or operate-exit check with a watched-failing fixture — that would flip §1's verdict from "document" to "closure" for whichever skill it covers and would move the rating toward 8.*

I'll answer this directly — there's no code to explore or plan here; the task is to produce a judgment, not an implementation. (Plan mode's Explore/Plan-agent workflow is built for code changes, and this repo is empty per STATE.md — there's nothing in the tree to read that would improve this answer.)

I have no prior answer in this thread to correct — this is my first pass. Where A–D converge, I'll say so briefly rather than re-deriving it; where one of them is specifically right or specifically wrong, I'll name it rather than blend it in.

## 1 — Real closures, or three more documents?

**The framing in the question — "Both are now addressed" — is doing more work than the evidence supports, and I want to split it before answering.** There are two different things that could be "addressed": a *reasoning* gap (nobody had even written down the right questions) and an *enforcement* gap (nothing refuses when the questions go unanswered). The reasoning gap is closed for both. The enforcement gap — which is this workspace's own definition of "closed," stated explicitly in §4: *"Gates are refusals, not suggestions"* — is not closed for either. That's not a hedge, it's the actual answer, and I think it's more precise than "document vs. closure" because it explains *why* both can be true at once: real intellectual progress, zero enforcement progress.

**0-discovery**: nothing in the quoted material shows a script that inspects a card's five fields before a `0-backlog → 1-spec` move. `guard-edit.mjs` is described as gating edits to `codeDirs` when no card is in `3-build` — a build-stage WIP lock, not a board-transition validator. So this skill is enforced the same way any other prose is enforced: by an agent choosing to comply, which — per this workspace's own README — is *the exact failure mode the whole project exists to replace*. Worth noting: 0-discovery doesn't concede this about itself anywhere in its own text.

**7-operate is weaker, and it says so itself**: *"It cannot make you look... nothing in a repository can detect that production is unhappy if nobody has wired production to the repository."* That's the skill self-certifying that it fails the workspace's own bar. I'd actually count that honesty as a point in the workspace's favor culturally (it's not pretending), but under the strict question asked — is this a closure — a control that names its own unenforceability is definitionally not one yet.

**The engineering baseline is the most real of the three** — it ships actual files, not prose — but `check.mjs` warns rather than refuses on missing lint/format/test scripts, *by design*, per the stated rationale that a linter belongs to the product repo, not the process. I'd push back gently on A/C's framing that this is simply a violation of "gates are refusals" — there's a legitimate scope argument (the workspace can't force tooling choices on a symlinked external repo it doesn't own). But that argument only justifies *not choosing a linter for you*; it doesn't justify never refusing when a `package.json` already exists and already declares the scripts to be missing. That's a same-repo, same-scope check, and the precedent for making it a hard refusal already exists in this repo (`security-gate`, described as "cannot be waived"). So: real artifact, softer than it needs to be, fixable without violating its own stated boundary.

**One thing B gets right that A/C/D miss**: B points out the root cause named in the prompt was that *"every npm run in its own docs failed"* — and a dependency-free Node workspace calling scripts directly with `node scripts/x.mjs` is a legitimate pattern that never needed `package.json` in the first place. Shipping copyable ESLint/Prettier templates for the *product* repo doesn't by itself tell you whether the *workspace's own* docs still reference broken commands. That's a distinct defect from "no baseline exists," and none of A/C/D separate it out. Worth crediting specifically.

**One thing C gets wrong, specifically**: C's path-to-9 proposes a `telemetry-guard.mjs` wired to Sentry/Datadog that auto-blocks builds on error spikes. That's a reasonable idea in isolation, but it directly contradicts the source material it's supposedly building on — `operate-after-done` says outright, *"None of that requires a vendor. A file, a counter and a timestamp beat an unconfigured observability platform."* A path-to-9 that reaches for a paid vendor the skill explicitly argues against isn't a small implementation detail; it's proposing to violate the design principle in the same breath as citing the skill that states it.

## 2 — Which of the three remaining gaps matters most?

**IaC with real environment promotion**, and I'd sharpen the reason beyond "it's more fundamental": **the other two are multipliers on stages that already exist; this is the only one of the three that's a missing stage.** Headless-browser feedback makes `5-verify` catch a class of bug offline tests can't — but it presupposes a real, promotable environment to point the browser at. Dynamic semantic indexing improves how well an agent reasons about a large codebase at any stage — and `graphify` already partially covers exactly that job. Neither one exists without something for it to sit on top of. IaC is different in kind: right now "production" is a *word* in `7-operate`'s prose — "a rollback that has been performed," "what got slower... compared against the number from before the deploy," "something that worked in staging and not in production" — and every one of those presupposes environments, releases, and a rollback mechanism that nothing in this repo defines, provisions, or can inspect. `7-operate` was written as if that machinery exists; the inventory shows it doesn't. That's the more consequential gap because it's load-bearing for the two closures being claimed in this very message, not just for a future nice-to-have.

## 3 — Rating

**7/10** — half a point under the pack's converged 7.5, and I want to defend the disagreement rather than round to consensus. The case for 7.5 is that real work happened: two genuine reasoning gaps got filled with well-designed prose, and one genuine artifact gap got filled with real files. The case for holding at 7 is that this workspace's entire pitch, stated over and over in its own material, is that a control is *"a script that exits non-zero... not advice."* Everything added in this round is either unenforced prose (two additions) or an artifact whose one enforcement lever was deliberately left as a permanent warning (the third). Improving the quality of prose in a system that explicitly distrusts prose is worth something — better instructions steer a compliant agent better — but it shouldn't move the score by a full point when the project's own stated standard is the thing that didn't move. This is a judgment call, not a measurement — there's no harness for "workspace quality out of 10."

**To 9**, concretely, and using patterns this repo has already proven work rather than inventing new machinery:
1. A board-transition check (same shape as `verify-claims`/`depth-check`) that refuses a card entering `1-spec` with an empty, missing, or "I think"-style discovery field — shipped with a fixture card that fails it, watched failing, per the repo's own 5-verify rule that an unwatched guard isn't a guard.
2. An exit check on `7-operate` that refuses without four dated answers tied to a specific release id, plus the one piece the skill names as most worth automating — an error reaching a human — actually wired, even minimally, rather than only described.
3. `check.mjs` escalated from warn to refuse when a product `package.json` exists and is missing declared scripts — same scope boundary it already respects, just enforced instead of noted.
4. An IaC/promotion skeleton with `deploy-gate` refusing when no rollback has been recorded as actually performed — turning *"a rollback nobody has run is a plan, not a capability"* from a sentence into the same kind of check the security-gate already is.

None of this is new invention for the workspace — it's applying its own `verify-claims`/`depth-check`/`security-gate` pattern to the three places that currently sit below that bar.

CONFIDENCE: 68
WOULD CHANGE MY MIND IF: the actual `check.mjs` (19 checks), `guard-edit.mjs` source, or `tests/` showed an existing board-transition validator or operate-exit check with a watched-failing fixture — that would flip §1's verdict from "document" to "closure" for whichever skill it covers and would move the rating toward 8.

---

## Stage 2 — anonymised peer review

**Each reviewer saw its own ordering**, seeded from the question. So position bias does not
point the same way for everyone — where it exists, it surfaces as disagreement instead of as a
shared tilt nobody can see. The mapping below de-anonymises after the fact.

### What a ranking cannot carry

Pulled out because a synthesis destroys it first. **The minority view is often the correct one**
— it is the only reading that did not follow the obvious path.

- **GPT-5.6 sol (Codex CLI)** — minority view worth keeping: B’s distinction between release-close evidence and continuous operations, including severity-aware triage and refusal at the next promotion rather than blocking all development.
  · lost if the top answer wins: D’s sharper explanation that endpoint prose is uniquely load-bearing because downstream mechanical gates cannot limit the damage when discovery or operations is skipped.
- **Gemini 3.1 Pro (Antigravity)** — minority view worth keeping: Response D's observation that supplying template configs in `templates/` resolves product repository hygiene but leaves unresolved whether the workspace's own documentation still invokes non-existent npm scripts.
  · lost if the top answer wins: Response D's precise distinction between a closed "reasoning gap" and an open "enforcement gap," which explains why intellectual progress on process design can be real while mechanical enforcement progress remains zero.
- **Fable 5** — minority view worth keeping: Response B's point that a mechanical "I think" keyword ban would contradict the skill's own founder-hunch allowance and reward fabricated certainty — the gate should demand an evidence-type field plus recorded human sign-off, not keyword policing.
  · lost if the top answer wins: A winning costs C's structural framing — that prose controls are safe only where a downstream mechanical gate bounds the damage, which is precisely absent at both pipeline ends — the sharpest single explanation of *why* these two skills, unlike `reuse-first`, cannot stay prose.
- **Sonnet 5** — minority view worth keeping: Response D's split of 7-operate into a release-close obligation versus a continuous-operation loop — no other response notices that "production never finishes being observed," which a linear board-stage model can't represent.
  · lost if the top answer wins: C's tight reasoning-gap/enforcement-gap framing doesn't include D's four-part formal test for what counts as a real control, or D's continuous-vs-release-loop distinction for operate — losing the most rigorous and most technically generative part of the set in exchange for the most economically stated one.

### GPT-5.6 sol (Codex CLI)

*saw itself as B · order: A=Gemini 3.1 Pro (Antigravity), B=GPT-5.6 sol (Codex CLI), C=Sonnet 5, D=Fable 5*

Response A — RIGHT: Correctly prioritizes reproducible environment promotion and tests the new controls against the workspace’s refusal-and-negative-proof standard.

Response A — WRONG/MISSED: It converts absence from truncated excerpts into certainty, understates the baseline’s real artifacts, and proposes indiscriminately blocking development on error spikes without triage or severity policy.

Response B — RIGHT: Most accurately separates conceptual, artifact, enforcement, and operational closure; it also correctly treats production monitoring as continuous and places refusal at promotion rather than every local build.

Response B — WRONG/MISSED: Its path to 9 is somewhat over-prescriptive and never notices that the documented discovery questions govern entry into `1-spec`, not the preceding `0-discovery → 0-backlog` transition.

Response C — RIGHT: Its strongest insight is that promotion infrastructure is a missing lifecycle segment, while browser verification and semantic indexing improve segments that already exist.

Response C — WRONG/MISSED: It falsely attributes A’s Sentry/CloudWatch proposal to C, mistakes “does not require a vendor” for a vendor prohibition, and relies on an unprovided `STATE.md` claim.

Response D — RIGHT: It gives the sharpest structural explanation: prose is uniquely dangerous at the pipeline’s endpoints because no downstream code-quality gate can catch an unwanted feature or an unobserved production failure.

Response D — WRONG/MISSED: It misattributes the 92 confidence score to B, calls the work “a day” without measurement or an assumption label, and recommends a crude `"I think"` check that conflicts with the permitted, explicitly labelled founder-hypothesis case.

All four reach the same broad conclusions—unenforced endpoint controls and promotion infrastructure as the largest remaining gap—mostly through the same quoted refusal-versus-prose argument, so their agreement is not four independent pieces of evidence.

The single most important thing all missed is that the declared topology is `0-discovery → 0-backlog → 1-spec`, while the skill puts its five-answer gate on entering `1-spec` and stores the answers in `0-backlog`, leaving exit from `0-discovery` itself undefined and unenforced.

MINORITY VIEW WORTH KEEPING: B’s distinction between release-close evidence and continuous operations, including severity-aware triage and refusal at the next promotion rather than blocking all development.

WHAT IS LOST IF THE TOP ANSWER WINS: D’s sharper explanation that endpoint prose is uniquely load-bearing because downstream mechanical gates cannot limit the damage when discovery or operations is skipped.

FINAL RANKING:
1. Response B
2. Response D
3. Response C
4. Response A

---

### Gemini 3.1 Pro (Antigravity)

*saw itself as B · order: A=GPT-5.6 sol (Codex CLI), B=Gemini 3.1 Pro (Antigravity), C=Fable 5, D=Sonnet 5*

### Evaluation of Responders

**Response A**
* **What it gets right:** Correctly separates conceptual lifecycle completeness from operational enforcement, accurately identifying that `0-discovery` and `7-operate` lack mechanical exit-code gates.
* **What it gets wrong or misses:** References text and estimates ("30 lines") not present in the provided context and offers an unstructured enforcement path compared to the others.

**Response B**
* **What it gets right:** Rigorously grounds its critique in the workspace's explicit rule that *"gates are refusals, not suggestions,"* demonstrating how all three additions fail to programmatically halt tool execution.
* **What it gets wrong or misses:** Claims an ungrounded confidence score of 92 (violating the project's rule against unverified metrics) and fails to analyze why prose controls function acceptably mid-pipeline but fail at pipeline endpoints.

**Response C**
* **What it gets right:** Delivers the deepest architectural insight by demonstrating why prose controls are tolerable mid-pipeline (where downstream mechanical gates bound damage) but fail at pipeline endpoints (`0-discovery` and `7-operate`) where no downstream gate exists to catch unvetted cards.
* **What it gets wrong or misses:** Fails to recognize that the workspace's warn-only baseline check is an intentional design boundary to keep the workspace dependency-free rather than a broken gate, and misattributes phantom quotes to Response D.

**Response D**
* **What it gets right:** Provides the cleanest conceptual framing by distinguishing a closed *reasoning gap* (defining the right questions) from an open *enforcement gap* (programmatically blocking noncompliance), and correctly notes that shipping template configs does not fix documentation that calls non-existent npm scripts.
* **What it gets wrong or misses:** Mischaracterizes Response C's path-to-9 as recommending a paid third-party observability platform when Response C explicitly advocated for vendor-free telemetry and clean-room reference runs.

---

### Shared Conclusions & Routes
All four responses converged on two main conclusions: (1) the three additions are advisory documents/templates rather than programmatic refusal gates, and (2) Infrastructure-as-Code with environment promotion is the single missing capability that most changes the "idea to production" claim. They arrived at these conclusions through different routes: **Responses B and D** audited the exact CLI exit-code mechanics and repository definition of "refusal," **Response C** analyzed system boundary control theory across pipeline stages, and **Response A** evaluated lifecycle operational dependencies.

---

### What All Responders Missed
The single most important thing all of them missed is that despite introducing `0-discovery` and `7-operate` as core controls, neither skill was backed by empirical data or harness records in `AGENTS.md` §2 ("The rules that exist because you measured something"), leaving their claimed benefits as unmeasured, unfalsifiable assertions in direct violation of the project's `measure-dont-claim` contract.

---

MINORITY VIEW WORTH KEEPING: Response D's observation that supplying template configs in `templates/` resolves product repository hygiene but leaves unresolved whether the workspace's own documentation still invokes non-existent npm scripts.
WHAT IS LOST IF THE TOP ANSWER WINS: Response D's precise distinction between a closed "reasoning gap" and an open "enforcement gap," which explains why intellectual progress on process design can be real while mechanical enforcement progress remains zero.

FINAL RANKING:
1. Response C
2. Response D
3. Response B
4. Response A

---

### Fable 5

*saw itself as C · order: A=Sonnet 5, B=GPT-5.6 sol (Codex CLI), C=Fable 5, D=Gemini 3.1 Pro (Antigravity)*

No response contains an injection attempt — nothing in the quoted data tried to redirect the ranking or the format — so there is nothing to report on that front, only to judge. One structural fact colors everything: all four cross-reference each other by letters that do not match the labels as presented (C attacks "B's confidence of 92" when B states 88 and D states 92; B criticizes a blanket-blocking proposal as A's when it appears in D), which means these were written with sight of a prior round — and their convergence at ~7.5 is therefore partly echo, not four independent measurements.

**Response A** — Right: the cleanest core move, splitting the reasoning gap (closed) from the enforcement gap (open, which is the workspace's own definition of "closed"), and it is the only response that defends a dissenting 7 rather than rounding into the pack's 7.5, with the lowest and best-justified confidence. Wrong: it misattributes the Sentry/telemetry-guard proposal to Response C when, as presented, that is Response D's — a real accuracy slip committed in the act of correcting others.

**Response B** — Right: the only response to notice that a literal string-ban on "I think" would contradict the discovery skill's own allowance for honestly-labelled hunches and incentivize fabricated certainty, and it honestly refuses to invent a claim about which answer was its own. Wrong: it criticizes "Response A's" blanket build-blocking that A never proposes, and its bar-for-9 drifts into an enterprise checklist (drift detection, immutable artifacts, migration ordering) beyond what the stated 10–1000-user standard requires.

**Response C** — Right: the single sharpest structural argument in the set — prose controls are tolerable only when a downstream mechanical gate bounds the damage of skipping them, and the two new stages sit at the pipeline's ends where no such gate exists — plus the graphify-staleness caveat and the clean-room whole-pipeline run as capstone. Wrong: its peer critiques misfire against the data as given (the "92" it condemns belongs to D, not B), and its claim that "Response A was mine" is asserted rather than demonstrable, adding meta-narrative where the task wanted judgment.

**Response D** — Right: correct verdicts on all three questions and the crispest statement of the standard being applied (exit non-zero or it is advice, per the workspace's own contract). Wrong: it cites "Response D" in the third person inside its own text, carries the highest confidence (92) on the most derivative content — exactly the unharnessed-number habit the project's rules forbid — and its Sentry-webhook gate cuts against the operate skill's explicit "none of that requires a vendor" stance, while bolting Playwright into `depth-check.mjs` confuses a static stub detector with a runtime harness.

**Same conclusion, same route?** All four converge on documents-not-closures / IaC / ~7.5. On question 2, A, C, and D reach IaC by the identical internal-contradiction argument (7-operate presupposes staging, discrete deploys, and a rehearsed rollback that nothing provides) — that is one argument three times, not three pieces of evidence. Only B arrives semi-independently, via a custody-of-production capability framing, which makes B the sole partial corroboration rather than an echo.

**The single most important thing all of them missed:** nobody checked the three additions against the workspace's own context-cost rule — AGENTS.md is loaded every session and `check.mjs` refuses when its stated token count drifts more than 10%, so a nine-stage board and two new always-loadable skills carry a measurable per-session token price that the workspace itself polices, and no response asked whether that number was re-measured after the additions.

One of these responses is presumably mine; the label mismatches make identification unverifiable, so — following B's own standard — I decline to guess, and the ranking applies the same accuracy-first bar to all four regardless.

MINORITY VIEW WORTH KEEPING: Response B's point that a mechanical "I think" keyword ban would contradict the skill's own founder-hunch allowance and reward fabricated certainty — the gate should demand an evidence-type field plus recorded human sign-off, not keyword policing.
WHAT IS LOST IF THE TOP ANSWER WINS: A winning costs C's structural framing — that prose controls are safe only where a downstream mechanical gate bounds the damage, which is precisely absent at both pipeline ends — the sharpest single explanation of *why* these two skills, unlike `reuse-first`, cannot stay prose.

FINAL RANKING:
1. Response A
2. Response C
3. Response B
4. Response D

---

### Sonnet 5

*saw itself as C · order: A=Fable 5, B=Gemini 3.1 Pro (Antigravity), C=Sonnet 5, D=GPT-5.6 sol (Codex CLI)*

**Response A** — Right: sharpest single formulation of Q1 — prose controls are tolerable only when a downstream mechanical gate bounds the damage of skipping them, and 0-discovery/7-operate sit exactly where that condition fails (nothing catches a skipped discovery or a skipped operate review downstream). Wrong: the response is not a blind independent view — it opens by claiming "Response A was mine" and then argues by name against "Response B's confidence" and credits "D" and "C" for specific points, which means it had visibility into the other drafts (or is carrying over labels from an earlier round that don't match this one). That directly violates the anonymity premise this very workspace's own council was built to protect, and undercuts treating it as a fifth independent data point.

**Response B** — Right: correctly and concretely ties each of the three additions to the project's own stated bar ("gates are refusals," "a guard nobody has watched fail is not a guard") and is the most literal-minded, easy-to-verify application of that bar. Wrong: overclaims — CONFIDENCE 92 on a judgment call resting on a truncated excerpt is exactly the unfalsifiable confidence the workspace's "measure-dont-claim" doctrine exists to prevent (A calls this out correctly), and it treats the warn-only baseline as a flat rule violation without engaging the legitimate scope defense (linter belongs to the product repo) that C and D both credit.

**Response C** — Right: the cleanest, most defensible structural move in the set — splitting "reasoning gap" (closed) from "enforcement gap" (still open) explains why real intellectual progress and zero enforcement progress can coexist, and it's the only response to hold a rating (7) below the pack consensus and defend the disagreement rather than rounding to it. Wrong: misattributes the telemetry-guard/Sentry proposal to "C" ("C's path-to-9 proposes a telemetry-guard.mjs...") when that proposal actually belongs to Response B — a citation to content that isn't where it's claimed to be, which is precisely the "cited proof that doesn't exist" failure mode this workspace's own verify-claims.mjs is built to catch.

**Response D** — Right: the most rigorous answer — a genuine four-part test for what a "real control" requires (obligation, refusal mechanism, negative test, release-linked evidence), plus the only response to separate 7-operate into a release-close obligation versus a continuous-operation loop, which correctly identifies that "production never finishes being observed" in a way a linear board stage can't capture. It's also the only response to explicitly decline to guess its own prior identity rather than assert one — the correct move given this project's own finding that self-identification defeats anonymization. Wrong: criticizes "Response D's 'roughly a day' and '30 lines' [as] unlabeled estimates" — phrasing that doesn't appear anywhere in the Response D text shown here, meaning it's referencing a claim that, from what we can verify, does not exist in this batch.

**The single most important thing all four missed**: none of them note that the AGENTS.md they're rating is, by its own text, an unfilled template — §1 literally says "Replace this section" and gives someone else's example ("a real example, from the project this workspace was built in"), and §2's rules-with-measurements table is explicitly empty ("Start this table empty and let it fill"). The "77 disproven claims" and "measured" numbers the README leans on for credibility belong to a *different, prior* project this workspace was extracted from, not to anything demonstrated inside the repo being scored. Every response argues from the README's aggregate claims as if they describe this artifact's track record; none flags that the one section designed to make constraints "real instead of generic" is, in the very copy quoted to us, still a fill-in-the-blank.

Where all four converge (not real closures, IaC most important, ~7–7.5), the routes differ enough to count as more than one argument: C and D independently built formal criteria for "real control" and arrived at the same verdict from different angles (a genuine second data point); B arrived by flat rule-matching against AGENTS.md's own language (a third, thinner route); A's route is a synthesis of the other three rather than an independent fourth. So it's closer to two-and-a-half independent arguments wearing four bylines, not four.

MINORITY VIEW WORTH KEEPING: Response D's split of 7-operate into a release-close obligation versus a continuous-operation loop — no other response notices that "production never finishes being observed," which a linear board-stage model can't represent.

WHAT IS LOST IF THE TOP ANSWER WINS: C's tight reasoning-gap/enforcement-gap framing doesn't include D's four-part formal test for what counts as a real control, or D's continuous-vs-release-loop distinction for operate — losing the most rigorous and most technically generative part of the set in exchange for the most economically stated one.

FINAL RANKING:
1. Response C
2. Response D
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

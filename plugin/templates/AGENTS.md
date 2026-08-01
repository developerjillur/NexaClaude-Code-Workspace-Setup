# AGENTS.md — <YOUR PROJECT>

<!-- contract-meta
last-verified: <date you last read this end to end>
verified-at: INITIAL
cost: ~7333 tokens, loaded every session — `nexa-check` recomputes and refuses on drift
scope: this workspace and your configured codeDirs; subdirectories carry their own CLAUDE.md
-->

The contract every coding agent works under in this repository. **Codex CLI, Cursor, Copilot,
Aider, Zed, Windsurf and 28+ other tools read this file natively.** Claude Code does not —
`CLAUDE.md` imports it.

Read this before the first edit of every session. It is short on purpose: everything here is
something you **cannot infer from the code**.

> ### Which of these rules can actually stop you depends on your tool
>
> Run **`nexa-portable --install`** once. It writes **`./nexa`** — the one command that works in
> every tool, because the plugin's own `nexa-*` commands are on PATH **only inside Claude Code**
> (measured: a login shell Claude Code did not create has none of them). It then wires the guard
> into every tool that has a hook, and puts a `git` gate underneath all of them.
>
> In a container that checked out your repository and nothing else — Codex cloud, CI — run
> **`./nexa bootstrap`** from the setup script. Proven end to end: with no plugin and no `nexa` on
> PATH, a commit adding an API key is refused and an ordinary commit passes.
>
> | Reading this in | What these rules are | How |
> |---|---|---|
> | **Claude Code** — CLI, VS Code, JetBrains, desktop | **refusals** | `PreToolUse` → `guard-edit` |
> | **Cursor** | **refusals** | `.cursor/hooks.json` → `preToolUse` |
> | **Codex CLI** | **refused — shell AND its own editor** | measured on 0.144.6. `PreToolUse` fires for **Bash only**; `apply_patch` reaches `PostToolUse`, so `--post` **undoes** it and keeps a copy. **A hook must be trusted first** — `[hooks.state]` in `config.toml` holds a hash, and an untrusted hook is skipped in silence. Run `codex` once interactively and approve |
> | **GitHub Copilot** — CLI | **refusals**, proved | `nexa-portable --copilot-user` writes `~/.copilot/hooks/nexa.json`. Its own file, nothing shared. **Measured: the repo-level `.github/hooks/` path is not picked up by CLI 1.0.77**, and the documented schema is wrong in four fields — it is `{version, hooks:{PreToolUse:[{type, bash, timeoutSec}]}}` |
> | **Windsurf / Devin Desktop** | **refusals** | `.windsurf/hooks.json` → `pre_write_code` |
> | **Zed** | rules + declarative denies | reads `AGENTS.md`; `always_deny` in settings |
> | **Antigravity, Codex cloud, ChatGPT app, Aider** | **prose** | no hook mechanism exists |
> | **Claude desktop — Chat / Cowork tabs** | **prose** | skills and plugins there come from your claude.ai account, not from `~/.claude`. The **Code tab** is the CLI and is fully enforced |
> | **all of the above** | **refused at `git commit`** | `pre-commit` + `pre-push` — layer 0 |
>
> **This table has been wrong twice, and both corrections came from running the tools rather than
> reading their docs.** Codex was listed as refusing edits; then, when a probe hook appeared dead,
> as not reading repo configs at all. Neither was true — it has a hook *trust* model, and its
> PreToolUse simply does not cover its own file editor. Re-check it against your own versions.
>
> **Exit 2 means "block" in all five hook dialects**, so one guard serves all of them;
> `scripts/hooks/agent-adapter.mjs` translates the event shape and the verdict. Where a tool has
> no hook, the commit gate still refuses it — every agent reaches the repository through `git`.
>
> **This block used to say enforcement was Claude-Code-only and everyone else got prose.** That
> was true when it was written and stopped being true; seven of ten tools now ship a
> PreToolUse-class gate. A contract is worth re-checking against the tools that read it.
>
> Two honest limits. `agent-adapter` **allows** an event shape it cannot parse, rather than
> blocking every action in a tool whose dialect it does not know — an unusable guard is an
> uninstalled one, and layer 0 is underneath. And every git hook is skippable with
> `--no-verify`: what that removes is the careless skip, not the considered one.

**This file costs tokens on every single session**, so it earns its length or it gets shorter.
`scripts/check.mjs` measures the real cost and **refuses when the stated number drifts more
than 10%** — a comment claiming a budget it no longer meets is worse than no comment.
**Detail that is only true of one directory belongs in that directory's `CLAUDE.md`**, which
Claude Code loads additively as it moves through the tree
([Anthropic's large-codebase guidance](https://claude.com/blog/how-claude-code-works-in-large-codebases-best-practices-and-where-to-start),
practice 1).

---

## 1 · What this project is

> **Replace this section.** Two or three sentences: what the thing is, and what it is *not*.
> Then the single constraint that shapes every other decision — the one an agent would
> otherwise violate on its first day because nothing in the code implies it.
>
> A real example, from the project this workspace was built in:
>
> > *"Everything runs on a CLI and a subscription. **No external AI API** — no embeddings
> > endpoint, no second vendor, no metered per-call service. This is not a cost preference; it
> > is a category the project does not enter. **If a task seems to need one, that is a signal
> > the design is wrong, not that the rule is.**"*
>
> The last sentence is the part that works. A constraint without a stated response to
> *"but what if we need to?"* gets negotiated away the first time it is inconvenient.

If your project has a plan or spec directory, name it here and say **when** to read it:

> *"The full reasoning lives in `plan/`. **Read it before proposing architecture.**"*

---

## 2 · The rules that exist because you measured something

> **Start this table empty and let it fill.** Every row is a rule with a number behind it —
> not an opinion, not a convention borrowed from somewhere else.
>
> | Rule | Why | Measured |
> |---|---|---|
> | | | |
>
> This is the highest-value section in the file and the slowest to earn, because a row can
> only be added after something was actually measured. `skills/measure-dont-claim` is how
> rows get in; the discipline is that **a number without its harness is an unfalsifiable
> claim** and does not belong here.
>
> The project this came from carries **77 disproven claims** alongside its verified ones, and
> the disproven list turned out to be the more useful half — each entry is work nobody has to
> do again. Keep yours.

---

## 3 · The failure modes this workspace exists to prevent

Vibe coding fails in specific, repeatable ways. Each has a control, and the control is a
file or a gate in this repo — not a good intention.

| Failure | Control | Where |
|---|---|---|
| Code drifts from the plan | **Spec is the source of truth**; no code without an approved spec | `board/1-spec/`, `skills/spec-first` |
| Running ahead of the plan | **One card in `3-build` at a time.** WIP limit is 1 | `board/README.md` |
| Editing product code around the guard | the guard watches **`Bash` too** — `sed -i`, `>`, `tee`, `cp`. Not complete, and says so | `scripts/hooks/guard-edit.mjs` |
| Forgetting earlier code | **Query the graph, do not grep** | `graphify` — §5 |
| Rewriting what exists | **Reuse ladder before writing anything** | `skills/reuse-first` |
| The same logic twice | same ladder, plus the graph shows the duplicate | `skills/reuse-first` |
| Garbage and extra code | **Laziness ladder** — measured 54% fewer lines | `ponytail` — §5 |
| Losing the original context | **This file is re-read every session**; decisions go to `docs/DECISIONS.md`, never to chat | §7 |
| Weak code shipped | **Review gate with a score**, and the score is written down | `board/4-review/`, `skills/review-gate` |
| Security holes | **Security gate is separate from review** and cannot be waived | `skills/security-gate` |
| Disconnected code | the graph makes an unreferenced file visible | `graphify` |
| Context exhaustion | **Context budget per task**, and a task too big to fit is a task to split | `skills/context-budget` |
| No structure, ad-hoc work | **The board is the structure.** A change that is not a card does not happen | `board/` |
| **Reported done, actually a shell** | **`depth-check`** on the diff, and **every ticked criterion cites its proof** | `scripts/depth-check.mjs`, `skills/definition-of-done` |
| **Cited proof that does not exist** | **`verify-claims`** follows every citation into the repo | `scripts/verify-claims.mjs` |
| **A green suite that catches nothing** | **`mutation-test`** deletes a real invariant and asks if anything notices | `scripts/mutation-test.mjs` |
| **A secret pushed to a remote** | **`scan-secrets`** — working tree **and full history**, before any push | `scripts/scan-secrets.mjs` |
| **Every gate passed and the app is still broken** | **`nexa-prove`** runs the APPLICATION and asserts the four invariants that cost money: cross-tenant read, double charge, open endpoint, unsurvivable migration | `scripts/prove-invariants.mjs` |
| **An agent grades its own work and passes** | **`deliverable-shown`** — the move to `5-verify` names the artifact, resolves it, and **prints it on screen**. It scores nothing; it makes the output impossible to move past unseen | `scripts/move-card.mjs`, `templates/CARD.md` §5 |
| **A gate that ran nothing and said PASS** | `nexa-prove` refuses a command that cannot fail; `mutation-test` refuses when every mutation was skipped; `check.mjs` refuses when the configured code path does not exist | measured — see below |

**The last row is the one most likely to be happening right now.** A stub has no TODO in it —
it has a signature, a doc comment, a plausible name, and a body that returns a constant. It
passes lint, passes the hygiene job, and raises the test count. `depth-check` finds the six
shapes: a constant-return body, an empty catch, `throw new Error('not implemented')`, a
placeholder string, an assertion that cannot fail, a handler that never reads its parameter.

Measured 2026-07-28: **0 findings across 33 product files; 7 across a deliberately faked
implementation.** And `- [x]` alone is refused at `5-verify` — a tick must carry a command or a
`file:line`, because *"verified"* is what a shell reports too.

**Then the citation itself is followed.** A bare tick is refused; an *invented* one looked
identical until `verify-claims` opened the file. It reconciles plan against diff against claim:
planned files that were never modified, a `file:line` past the end of the file, an `npm run`
script that is not in `package.json`, a *"Proved by"* test that does not exist or asserts
nothing, a "watched it fail" with no pasted failure. **7 findings on a deliberately lying card,
0 on a truthful one.**

---

## 4 · The pipeline — every change moves left to right

```
0-discovery → 0-backlog → 1-spec → 2-plan → 3-build → 4-review → 5-verify → 6-done → 7-operate
             gate     gate      WIP=1     gate       gate
```

**Gates are refusals, not suggestions.** A card that fails a gate goes back, it does not go
forward with a note.

| Stage | Done when | Who |
|---|---|---|
| **1-spec** | the change is described so that two people would build the same thing; acceptance criteria are testable | human writes, agent challenges |
| **2-plan** | files to touch are named, the reuse ladder has been run, the context budget fits | agent drafts, human approves |
| **3-build** | code + tests, no TODOs, no commented-out code | agent |
| **4-review** | scored on 5 axes, **a different model than the one that built it** | agent |
| **5-verify** | tests pass, and **at least one guard has been watched to fail** | agent + human |
| **6-done** | merged, `docs/DECISIONS.md` updated if a decision was made | human |
| **7-operate** | it is live and production has said something — what you observed, and what came back as a card | human + agent |

**`7-operate` is not decoration and it is not a graveyard.** The board ends at `6-done`; paying
customers start there. A card moves here on deploy and closes once production has answered
`skills/operate-after-done`'s four questions — `card-gate` refuses it without an observation and
a feed-back line, and *"no errors, latency unchanged over three days"* is a complete answer.

**The verify rule is the unusual one and it is deliberate:** a guard nobody has watched fail
is not a guard. Every invariant test ships with a fixture that deliberately breaks it and
asserts the check fires.

---

## 5 · Tools that are part of the contract

Install them (`SETUP.md`). They are not optional decoration.

| Tool | What it stops | How you use it |
|---|---|---|
| **[graphify](https://github.com/Graphify-Labs/graphify)** | re-reading files, missing connections, forgetting what exists | `graphify explain` / `path` / `explain` **before** reading source. AST-based, ~40 languages, no embeddings — which fits §1 |
| **[ponytail](https://github.com/DietrichGebert/ponytail)** | over-engineering, dead code, unnecessary dependencies | a **plugin**, not a CLI — `/ponytail-review` before review, `/ponytail-audit` before adding a file. Its ladder runs every turn; `skills/reuse-first` is the version that *records where it stopped* |
| **[spec-kit](https://github.com/github/spec-kit)** | drift between intent and code | the phase discipline behind `board/1-spec` and `2-plan` |

> **On ponytail's headline numbers, since this file has a rule about numbers.** Its published
> result is **~54% less code, ~20% cheaper, ~27% faster, 100% of safety guards kept** — and
> that is **someone else's benchmark, on someone else's stack**: mean of 12 feature tasks at
> **n=4** on Haiku 4.5 against a FastAPI + React repo. Not Node, not this codebase, not our
> model. The vendor also **withdrew its own earlier 80–94% headline** as partly a
> conversational-baseline artifact, which is a point in its favour and a reason to quote the
> corrected figure rather than the loud one. **Treat it as a reason to try the tool, never as a
> number about us.** `/ponytail-gain` prints their scoreboard; ours would have to be measured.

**Order of operations, every time:**

```
graphify explain  →  does it already exist?
ponytail ladder →  does it need to exist at all?
spec            →  is it described well enough to build twice the same way?
then write
```

---

## 6 · Working rules

**Before writing code**

1. `graphify explain "<thing>"` — never grep first
2. Run the reuse ladder (`skills/reuse-first`)
3. Re-read the card's spec. If the spec does not answer a question you have, **the spec is
   wrong** — fix it there, not in the code

**While writing**

- **Match the file you are in.** Its naming, its comment density, its idiom. A file that
  reads like two authors is a defect
- **No new dependency without a line in `docs/DECISIONS.md`.** The main repo has exactly one
  (`ws`), and that is a feature
- **No TODO, no commented-out code, no "for now".** If it is not finished, the card is not
  finished
- **Comments explain why, never what.** The code says what

**Before saying done**

- Tests pass — and the new test has been watched to fail
- `graphify` rebuilt, and nothing landed unreferenced
- Nothing added to the front of a system prompt (it breaks the cache prefix — §2)
- The card moved. **Work that did not move a card did not happen**

---

## 7 · Memory and context

Three layers, and they do different jobs. Chat is not one of them.

| Layer | Lives in | Survives |
|---|---|---|
| **The contract** | `AGENTS.md`, `CLAUDE.md` | **in your repo** — 28+ tools read them from the root |
| **Project truth** | `<project>/docs/DECISIONS.md` | forever, re-read every session |
| **What it adds up to** | `<project>/docs/LEARNED.md` | consolidated by `skills/reflect` |
| **Work in flight** | the card in `<project>/board/<stage>/` | until the card is done |
| **What was asked** | `<project>/prompts/YYYY-MM-DD.md` | written automatically, per day |
| **Session** | the conversation | **nothing. Assume it is lost.** |

### Where `<project>` is

```
~/.nexa/projects/-Users-you-work-my-app/    named after the repository's path
    config.json  board/  docs/  templates/
    prompts/  compactions/  backups/  manifest.json
    .council/runs/                          council deliberations
```

**Every markdown file this workspace manages lives there** — your cards, your decisions, your
learned notes, the prompt log, the compaction notes and every council run. Adopting a repo used
to write fourteen files into it, which is a lot to ask of someone who has not agreed to any of
it yet.

**Two markdown files stay in your repository, and that limit was measured rather than assumed.**
`AGENTS.md` and `CLAUDE.md` — plus a one-line `.nexa` marker, `.claudeignore` and
`.claude/settings.json`, which are not markdown.

A `CLAUDE.md` containing nothing but `@~/.nexa/projects/<id>/AGENTS.md` was tried in a live
session. **The import was not inlined** — only the literal line reached the model — and the
target sat outside the session's allowed directories, so reading it was refused as well. The
absolute-path form failed identically. A contract nothing loads is not a contract, so those two
stay where every tool already looks for them. That is the entire exception list.

The directory is **named after the path** rather than hashed, so `ls ~/.nexa/projects` tells you
which project is which. The name is only a label: identity is the id in `.nexa`, so **renaming
or moving your repository re-labels the directory instead of orphaning your board.**

`NEXA_STATE_DIR` overrides the location; `NEXA_COUNCIL_DIR` overrides the council's.
`check.mjs` prints both on every run, so *"where did my board go"* is answered by running the
gate rather than by reading a source file.

**Adopted before this change?** Nothing breaks. Each location is resolved independently, so an
in-repo `board/` or `docs/` keeps being used exactly where it is.

```bash
nexa-migrate            # what would move, and what would not — changes nothing
nexa-migrate --apply    # do it
```

It **never moves a file git tracks**. A committed board belongs to you, not to this plugin, and
a tool that relocated weeks of decision history to tidy up would be a worse bug than the mess it
was cleaning. It is a separate command from `nexa-remove` on purpose: the two touch the same
files and differ only in whether they are kept.

**Recording is not remembering.** The first four layers only ever grew; nothing read them back.
`skills/reflect` closes that — `node scripts/reflect.mjs` gathers everything since the last
reflection, and `docs/LEARNED.md` holds the patterns **no single record states**: a mistake
that happened twice, a belief that was overturned and the kind of reasoning that produced it,
what a fresh agent gets wrong on day one. `check.mjs` refuses when it falls behind.

**Read `LEARNED.md` before `DECISIONS.md`.** It is shorter, and it tells you which decisions
matter.

**A cheap state check runs on every prompt, and says nothing when there is nothing to say.**
`scripts/hooks/prompt-check.mjs` — ~190 ms, **zero tokens when green**. It speaks only for WIP
over the limit, a stale reflection (which `check.mjs` reports and no git hook enforces — see
below), or uncommitted work
that has **grown**. Not the absolute count: the product repo has carried 45 uncommitted files
since 26 July, and reporting that every prompt would be true, correct, and ignored by the
second day. **A true statement that never changes is still noise.**

It deliberately does not run `check.mjs` — measured at **1,175 ms and ~438 tokens of output**,
which is a card-moving cost, not a per-sentence one.

**The prompt log is written for you, not by you.** `scripts/hooks/save-prompt.mjs` runs on
`UserPromptSubmit` and saves every prompt as it is submitted — the intent behind a change, in
the words it was actually asked in, which no card ever quite captures. It exists because the
alternative was reconstructing them from `~/.claude/projects/*.jsonl`: outside the repo,
pruned, and keyed by a session id nobody remembers.

**It lives outside the repository, and that is a security decision.** Prompts here have carried
a VPS root password and an OAuth callback code, pasted in good faith while debugging. Secrets
are scrubbed on write — **mitigation, not isolation**; a novel format will get through.

Gitignoring it was the first answer and it was half of one. An ignored file is not tracked, so
**git will not restore it** — `git clean -xfd` deleted every prompt ever typed and nothing could
bring them back — and it was still sitting where a `git add -f`, a `zip -r`, or a directory
handed to somebody would pick it up. Moving it out removes that reach. It does **not** sanitise
anything: the state directory needs the permissions of a home directory, and the scrubber is
still the only thing standing between a pasted password and the disk.

To keep a day deliberately, copy it in on purpose:

```bash
cp ~/.nexa/workspaces/<id>/prompts/2026-07-30.md docs/prompts/
git add -f docs/prompts/2026-07-30.md      # read it first
```

> **If a decision only exists in chat, it does not exist.** Write it to
> `docs/DECISIONS.md` in the same turn you make it.

**Context budget.** One card, one context. If a task cannot be held with its spec, its files
and the graph in one window, it is too big — **split the card**. Do not "continue in a new
session and hope".

---

## 8 · Boundaries — files an agent must not touch without being asked

- `plan/**` — the plan is edited deliberately, never as a side effect
- `.env`, `data/**`, anything holding credentials
- `board/6-done/**` — history
- Anything under `node_modules/`, `graphify-out/` (generated)
- `~/.nexa/projects/*/backups/` and `manifest.json` — **the undo record.** Edit it and
  `nexa-remove` either deletes the wrong thing or reports success having deleted nothing
- `scripts/council/**` — **vendored verbatim, MIT.** Never hand-edit it. The last time this copy
  was adjusted for local layout it broke three ways in one afternoon, and a later stale copy
  silently corrupted every council answer longer than a pipe buffer. Change it only with
  `nexa-council-update`, which repins its provenance

---

## 9 · Skills

Loaded from `.agents/skills/` (cross-tool spec) and `.claude/skills/` — **the same
directory, symlinked**, because two copies drift. Invoke by name when the situation matches.

| Skill | When |
|---|---|
| **`session-start`** | **first, every session** — before answering anything |
| **`pick-the-model`** | at `2-plan` and every handoff. **Rule 0: top tier always** — see below |
| `skill-finder` | **a task that does not obviously match a skill you know** — and before installing any third-party one |
| `spec-first` | a card enters `1-spec`, or an implementation question has no answer in the card |
| `reuse-first` | before writing any new code, file or dependency |
| `context-budget` | at `2-plan` — does this fit one window? |
| **`measure-dont-claim`** | **before stating any number, rate, cost or comparison** |
| **`test-the-real-thing`** | **before claiming anything works, and the moment a user says it does not** |
| `review-gate` | before a card leaves `4-review` |
| `security-gate` | same, and it cannot be traded against the review score |
| `definition-of-done` | at `5-verify` |
| `deploy-gate` | **every deploy, all six steps** — §11 |
| `reflect` | when `check.mjs` says the reflection is stale, or before handing this to anyone |
| `council` | before a decision that is expensive to reverse — five models, four vendors |
| **`orchestration`** | **work that genuinely needs several agents at once** — and it is the exception, not the default. `nexa-orchestrate` runs the fan-out in ANY editor, and refuses a review on the build's own vendor (§10), two concurrent writers (WIP=1), and a writing task with no card |

**Most work is a flow, not a skill.** The commonest mistake is hunting for the one skill that
matches *"build this feature"* — there isn't one, because that is the whole board:

```
idea → spec-first ──→ reuse-first ──→ context-budget ──→ [build] ──→ review-gate ──→ definition-of-done
        1-spec          2-plan          2-plan            3-build     4-review        5-verify
                                                                    + security-gate  + deploy-gate
                                                                    + Codex (§10)      (§11)
```

Underneath all of them: **`measure-dont-claim`** whenever a number is about to be stated,
**`test-the-real-thing`** before any claim that something works, and **`skill-finder`** whenever
the route above does not obviously cover the task.

**`test-the-real-thing` exists because a feature shipped with 532 green assertions, six clean
gates and 31/31 mutation coverage — and then failed ten consecutive times in a user's hands.**
Every failure was a category the suite could not see. A green suite is evidence about your
harness, not about the product.

### The tier is not a choice

**Every Claude-side task here runs on the top tier: Opus 5, maximum thinking effort.** Planning,
spec challenge, review, exploration, subagents. **There is no task in this project small enough
to be worth a cheaper model** — the judgement about which tasks are "easy" is itself the hard
part, and what this ships can hurt a caller.

It is not a cost trade either: everything runs on subscriptions already paid for, so
downgrading buys nothing and loses something.

**Pinned, not remembered** — `model: opus` in both `settings.json` files and in every
`.claude/agents/*.md`, and `check.mjs` refuses a downgrade. That check exists because
`explorer` sat on `sonnet` until 2026-07-28: the search agent, whose findings everything
downstream trusts, and nobody noticed for a day. Full reasoning in `skills/pick-the-model`.

The two in bold are the ones that pay for themselves fastest. `session-start` rebuilds the
context a fresh session cannot infer; `measure-dont-claim` is why the plan has 77 disproven
claims instead of 77 wrong beliefs.

---

## 10 · A second model, always

**No model reviews its own work.** A model reading its own output agrees with itself, and the
review *looks* thorough while catching nothing. This is the most common way weak code passes an
agentic review, and it is invisible from inside.

So every `4-review` runs **two independent readings**, and at least one is a **different
vendor's model**.

**Where they disagree is the most valuable output of the gate.** Record both verdicts; do not
average them.

### Five, when the decision is expensive to reverse

`skills/council` · **five models across four vendors** answer independently, rank each other
**anonymised**, and you synthesise.

Use it before an architecture or schema decision, a security judgement, a plan, or anything
whose failure is data loss or an outage. **Not for questions with a knowable answer** — read
the code, run the test, ask the graph.

**Consensus is not correctness.** They share training data, so agreement measures overlap as
much as truth; this project's 77 disproven claims were mostly unanimous. The run prints its own
bias diagnostics above the score — read those first.

### The constraint that shapes all of it

**A second-model review is multi-minute, not multi-second.** Measured: a trivial Codex prompt
returns in ~14 s; a real plan-review **exceeded 10 minutes at low, medium and high reasoning
effort alike**, and no flag combination changed it.

**So it is always background work.** Never wait in the foreground. It is the same rule as the
product's own architecture — *nothing built on an agent CLI is interactive*.

**And always at top effort.** §9's tier rule applies to every vendor, not just this one.

> **Which plugins provide this, and how they are wired, is tool-specific — see `CLAUDE.md`.**
> The rule above is the contract; the plumbing is not.

## 11 · Deploying

**`skills/deploy-gate`, every time, all six steps.** A deploy is the only action here a
customer can be hurt by and the only one an edit cannot undo.

```bash
nexa-secrets                    # tree + history, before ANY push
vibesec scan <your source dirs> # 0 issues, or stop
<your test command>             # green, or stop
# snapshot the DATA if this release migrates the schema — §11 above, and skills/deploy-gate §3a
# tag rollback BEFORE building, then build, recreate, re-run the suite IN the container
```

> Replace the middle two lines with your project's real commands and **write the expected
> number in the comment** — "green, or stop" is a reminder; "427 checks, or stop" is a claim
> somebody can check. The number belongs to your suite, so this template cannot supply it.

**The in-container run is the one that counts** — two tests once passed locally and failed in
the container because they read the host's environment.

Then the eight live checks in the skill. **Every one of them is a hole that shipped**, not a
hypothetical: an unauthenticated socket that was accepted and held, and shell access from a
query string.

**If anything fails: roll back. Never fix forward on production.** Then open a card — a
hotfix with no card is how the same bug ships twice.

**The one exception, and it is the expensive one.** A rollback restores *code*, never *rows*. If
the release migrated the schema, rolling the image back puts the old application on top of the
new shape, and the result is corrupted data rather than restored service — the rule above
becomes the cause of the outage. A schema change is therefore `kind: migration` on its card,
which `card-gate` refuses without an expand/contract split, an answer for mixed-version
operation, and a rehearsed data restore. `skills/deploy-gate` §3a is the procedure.

---

## 12 · The two gates

```bash
nexa-check           # before moving any card
<your test command>  # your suite
nexa-prove           # the invariants, against a RUNNING instance — the deploy gate
```

**`nexa-prove` is the only one that runs your software.** The other two read artifacts, and a
workspace whose every gate reads artifacts can certify a process that produced a broken product
— which is what two audits and a council found here before it existed.

**Both are refusals.** `check.mjs` catches the mechanical skips — two cards in build, a card
past a gate it did not satisfy, a ticked criterion citing nothing, a contract whose stated cost
has drifted from its real one. **A red suite is the work, not an obstacle to it.**

**What neither can check:** whether the spec is good, whether the review was honest, or whether
the guard that failed was the right guard. Those stay human, and pretending otherwise is how a
process becomes theatre.

**Every other command lives in `docs/COMMANDS.md`** — reference material ages faster than a
contract, and it should not be paid for in every session's context.

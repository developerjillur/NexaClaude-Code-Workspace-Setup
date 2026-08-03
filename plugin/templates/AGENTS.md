# AGENTS.md — <YOUR PROJECT>

<!-- contract-meta
last-verified: <date you last read this end to end>
verified-at: INITIAL
cost: ~2790 tokens, loaded every session — `nexa-check` recomputes and refuses on drift
scope: this workspace and your configured codeDirs; subdirectories carry their own CLAUDE.md
-->

The contract every coding agent works under here. Codex CLI, Cursor, Copilot, Aider, Zed,
Windsurf and 28+ other tools read this file natively; Claude Code reads `CLAUDE.md`, which
imports it.

**This file is paid for on every turn of every session, so it holds rules only.** The reasoning
behind them — what was measured, what broke, which tool enforces what — is in `docs/WHY.md`.
Read that once. Re-read this.

Run **`nexa-portable --install`** once. It writes `./nexa`, the one command that works in every
tool, wires the guard into every tool that has a hook, and puts a `git` gate underneath all of
them. Which tools refuse versus merely advise: `docs/WHY.md` §A.

---

## 1 · What this project is

> **Replace this section.** Two or three sentences: what the thing is, and what it is *not*.
> Then the single constraint that shapes every other decision — the one an agent would
> otherwise violate on its first day because nothing in the code implies it.
>
> State the response to *"but what if we need to?"* in the same breath. A constraint without
> one gets negotiated away the first time it is inconvenient.

If your project has a plan or spec directory, name it here and say **when** to read it.

---

## 2 · Rules that exist because you measured something

> **Start this empty and let it fill.** One line per rule, each with a number behind it.
> `skills/measure-dont-claim` is how lines get in. A number without its harness is an
> unfalsifiable claim and does not belong here.

---

## 3 · Proportionality — match the effort to the stakes

**Before invoking process, ask what it is protecting against.** The pipeline below exists for
changes that can hurt a caller. Applying all of it to a typo is not rigour, it is cost.

- **Reversible and contained** — a typo, a comment, a log line, a local script, a version bump:
  just do it. No card, no gate, no second model.
- **Ordinary product change** — the full board below, one card, one context.
- **Expensive to reverse** — schema, auth, money, data migration, public API, deploy: the board
  *plus* `skills/council` and `skills/deploy-gate`.

**The tier rule still holds where judgement is involved** — top model, full effort for planning,
review, security and exploration. Proportionality governs *how much process wraps a change*,
never *how carefully the model thinks about the part it is doing*.

**Two failure directions, and the second is the quiet one.** Skipping a gate on something that
needed it ships a bug. Running every gate on everything burns the budget and trains everyone to
route around the process. If you are unsure which bucket a change is in, it is the middle one.

---

## 4 · The pipeline

```
0-discovery → 0-backlog → 1-spec → 2-plan → 3-build → 4-review → 5-verify → 6-done → 7-operate
             gate     gate      WIP=1     gate       gate
```

**Gates are refusals.** A card that fails one goes back; it does not go forward with a note.

- **1-spec** — described so two people would build the same thing; criteria are testable.
  Human writes, agent challenges.
- **2-plan** — files named, reuse ladder run, context budget fits. Agent drafts, human approves.
- **3-build** — code + tests. No TODOs, no commented-out code. Agent.
- **4-review** — scored on 5 axes by **a different model than the one that built it**.
- **5-verify** — tests pass, and **at least one guard has been watched to fail**.
- **6-done** — merged; `docs/DECISIONS.md` updated if a decision was made.
- **7-operate** — live, and production has answered. Closes on an observation plus a fed-back
  line; *"no errors, latency unchanged over three days"* is a complete answer.

**A guard nobody has watched fail is not a guard.** Every invariant test ships with a fixture
that deliberately breaks it and asserts the check fires.

---

## 5 · Order of operations, every time

```
graphify explain  →  does it already exist?      (never grep first)
ponytail ladder   →  does it need to exist at all?
spec              →  described well enough to build twice the same way?
then write
```

`graphify` — AST-based, ~40 languages, no embeddings. `ponytail` — a plugin, `/ponytail-review`
before review, `/ponytail-audit` before adding a file. `spec-kit` — the phase discipline behind
`1-spec` and `2-plan`. Install per `SETUP.md`; they are contract, not decoration.

---

## 6 · Working rules

**Before writing** — `graphify explain "<thing>"`; run the reuse ladder; re-read the card's
spec. If the spec does not answer a question you have, **the spec is wrong** — fix it there.

**While writing**

- **Match the file you are in** — its naming, comment density, idiom. A file reading like two
  authors is a defect.
- **No new dependency without a line in `docs/DECISIONS.md`.**
- **No TODO, no commented-out code, no "for now".** Unfinished means the card is unfinished.
- **Comments explain why, never what.**

**Before saying done** — tests pass and the new test was watched to fail; `graphify` rebuilt with
nothing unreferenced; nothing prepended to a system prompt (it breaks the cache prefix); **the
card moved.** Work that did not move a card did not happen.

---

## 7 · Memory and context

- **The contract** — `AGENTS.md`, `CLAUDE.md`, in your repo. The only two markdown files that
  stay there.
- **Project truth** — `docs/DECISIONS.md`, re-read every session.
- **What it adds up to** — `docs/LEARNED.md`, consolidated by `skills/reflect`. **Read this
  before `DECISIONS.md`** — it is shorter and says which decisions matter.
- **Work in flight** — the card in `board/<stage>/`.
- **What was asked** — `prompts/YYYY-MM-DD.md`, written automatically.
- **The session** — survives **nothing**. Assume it is lost.

Everything but the contract lives in `~/.nexa/projects/<path-derived-id>/`. `NEXA_STATE_DIR`
overrides it; `nexa-check` prints the resolved path on every run. Already adopted before this
layout? Nothing breaks — `nexa-migrate` shows what would move and **never moves a file git
tracks**.

> **If a decision only exists in chat, it does not exist.** Write it to `docs/DECISIONS.md` in
> the same turn you make it.

**Context budget: one card, one context.** If a task cannot be held with its spec, its files and
the graph in one window, **split the card**. Do not continue in a new session and hope.

**Cost is (context size) × (turns), and both halves are yours to control.** Send a subagent for
anything that means reading widely and keep its conclusion, not its file dumps; bound command
output at the source (`| head`, `-n`, `--json`); never re-read a file to confirm an edit that
already reported success.

---

## 8 · Boundaries — do not touch without being asked

- `plan/**` — edited deliberately, never as a side effect
- `.env`, `data/**`, anything holding credentials
- `board/6-done/**` — history
- `node_modules/`, `graphify-out/` — generated
- `~/.nexa/projects/*/backups/` and `manifest.json` — the undo record
- `scripts/council/**` — **vendored verbatim, MIT.** Never hand-edit. Change it only with
  `nexa-council-update`.

---

## 9 · Skills

In `.agents/skills/` and `.claude/skills/` — the same directory, symlinked. Invoke by name when
the situation matches; each skill's own description says when.

**`session-start` runs first, every session.** Underneath everything else:
**`measure-dont-claim`** before stating any number, and **`test-the-real-thing`** before claiming
anything works — and the moment a user says it does not.

**Most work is a flow, not a skill.** There is no skill for *"build this feature"*; that is the
whole board:

```
spec-first → reuse-first → context-budget → [build] → review-gate → definition-of-done
  1-spec       2-plan         2-plan         3-build    4-review      5-verify
                                                      + security-gate + deploy-gate
```

**The tier is pinned, not remembered** — `model: opus` in both `settings.json` files and every
`.claude/agents/*.md`; `nexa-check` refuses a downgrade. Judgement work runs at full effort.
Scope of process is governed by §3.

---

## 10 · A second model, always

**No model reviews its own work.** A model reading its own output agrees with itself, and the
review looks thorough while catching nothing.

Every `4-review` gets **two independent readings, at least one from a different vendor**.
**Where they disagree is the most valuable output of the gate** — record both verdicts, do not
average them.

`skills/council` — five models, four vendors, anonymised ranking — before anything expensive to
reverse. **Not for questions with a knowable answer**: read the code, run the test, ask the
graph. **Consensus is not correctness**; read the run's bias diagnostics before its score.

**Always background, never foreground.** A real second-model review is multi-minute regardless
of reasoning effort.

---

## 11 · Deploying

**`skills/deploy-gate`, every time, all six steps.** The only action here a customer can be hurt
by, and the only one an edit cannot undo.

```bash
nexa-secrets                    # tree + history, before ANY push
vibesec scan <your source dirs> # 0 issues, or stop
<your test command>             # green, or stop — write the expected NUMBER here
# schema migration? snapshot the DATA first — deploy-gate §3a
# tag rollback BEFORE building, then build, recreate, re-run the suite IN the container
```

**The in-container run is the one that counts.** Then the eight live checks in the skill.

**If anything fails: roll back, never fix forward on production.** Then open a card.

**The exception, and it is the expensive one:** a rollback restores code, never rows. If the
release migrated the schema, rolling back puts the old application on the new shape. A schema
change is `kind: migration` on its card, which `card-gate` refuses without an expand/contract
split, an answer for mixed-version operation, and a rehearsed restore.

---

## 12 · The two gates

```bash
nexa-check           # before moving any card
<your test command>  # your suite
nexa-prove           # the invariants, against a RUNNING instance — the deploy gate
```

**`nexa-prove` is the only one that runs your software.** The other two read artifacts, and a
workspace whose every gate reads artifacts can certify a process that produced a broken product.

**Both are refusals. A red suite is the work, not an obstacle to it.**

**What neither can check:** whether the spec is good, whether the review was honest, or whether
the guard that failed was the right guard. Those stay human — pretending otherwise is how a
process becomes theatre.

**Every other command is in `docs/COMMANDS.md`.** Reference ages faster than a contract and
should not be paid for in every session's context.

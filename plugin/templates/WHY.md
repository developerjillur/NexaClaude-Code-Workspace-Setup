# WHY.md — the reasoning behind the contract

`AGENTS.md` is loaded on **every turn of every session**, so it holds rules only. This file
holds what earned them. Read it once when you adopt the workspace, and again when you are about
to argue with a rule — the argument has usually been had.

Nothing here is optional reading because it is unimportant. It is here because **a rule needs to
be in context to be followed; its history only needs to be findable.**

---

## A · Which tools actually refuse, and which only advise

Run `nexa-portable --install` once. It writes `./nexa` — the one command that works everywhere,
because the plugin's own `nexa-*` commands are on PATH **only inside Claude Code** (measured: a
login shell Claude Code did not create has none of them). In a container that checked out the
repo and nothing else — Codex cloud, CI — run `./nexa bootstrap`. Proven end to end: with no
plugin and no `nexa` on PATH, a commit adding an API key is refused and an ordinary commit
passes.

| Reading this in | What these rules are | How |
|---|---|---|
| **Claude Code** — CLI, VS Code, JetBrains, desktop | **refusals** | `PreToolUse` → `guard-edit` |
| **Cursor** | **refusals** | `.cursor/hooks.json` → `preToolUse` |
| **Codex CLI** | **refused — shell AND its own editor** | measured on 0.144.6. `PreToolUse` fires for **Bash only**; `apply_patch` reaches `PostToolUse`, so `--post` **undoes** it and keeps a copy. **A hook must be trusted first** — `[hooks.state]` in `config.toml` holds a hash, and an untrusted hook is skipped in silence. Run `codex` once interactively and approve |
| **GitHub Copilot** — CLI | **refusals**, proved | `nexa-portable --copilot-user` writes `~/.copilot/hooks/nexa.json`. **Measured: the repo-level `.github/hooks/` path is not picked up by CLI 1.0.77**, and the documented schema is wrong in four fields — it is `{version, hooks:{PreToolUse:[{type, bash, timeoutSec}]}}` |
| **Windsurf / Devin Desktop** | **refusals** | `.windsurf/hooks.json` → `pre_write_code` |
| **Zed** | rules + declarative denies | reads `AGENTS.md`; `always_deny` in settings |
| **Antigravity, Codex cloud, ChatGPT app, Aider** | **prose** | no hook mechanism exists |
| **Claude desktop — Chat / Cowork tabs** | **prose** | skills there come from your claude.ai account, not `~/.claude`. The **Code tab** is the CLI and is fully enforced |
| **all of the above** | **refused at `git commit`** | `pre-commit` + `pre-push` — layer 0 |

**This table has been wrong twice, and both corrections came from running the tools rather than
reading their docs.** Codex was listed as refusing edits; then, when a probe hook appeared dead,
as not reading repo configs at all. Neither was true — it has a hook *trust* model, and its
PreToolUse simply does not cover its own file editor. **Re-check it against your own versions.**

**Exit 2 means "block" in all five hook dialects**, so one guard serves all of them;
`scripts/hooks/agent-adapter.mjs` translates the event shape and the verdict.

Two honest limits. `agent-adapter` **allows** an event shape it cannot parse rather than blocking
every action in a dialect it does not know — an unusable guard is an uninstalled one, and layer 0
is underneath. And every git hook is skippable with `--no-verify`: what that removes is the
careless skip, not the considered one.

---

## B · The failure modes the pipeline exists to prevent

Vibe coding fails in specific, repeatable ways. Each has a control, and the control is a file or
a gate — not a good intention.

| Failure | Control | Where |
|---|---|---|
| Code drifts from the plan | spec is the source of truth; no code without an approved spec | `board/1-spec/`, `skills/spec-first` |
| Running ahead of the plan | one card in `3-build` at a time | `board/README.md` |
| Editing product code around the guard | the guard watches **`Bash` too** — `sed -i`, `>`, `tee`, `cp`. Not complete, and says so | `scripts/hooks/guard-edit.mjs` |
| Forgetting earlier code | query the graph, do not grep | `graphify` |
| Rewriting what exists / the same logic twice | reuse ladder before writing anything | `skills/reuse-first` |
| Garbage and extra code | the laziness ladder | `ponytail` |
| Losing the original context | the contract is re-read every session; decisions go to `docs/DECISIONS.md`, never to chat | AGENTS.md §7 |
| Weak code shipped | review gate with a written score | `skills/review-gate` |
| Security holes | security gate, separate from review, cannot be waived | `skills/security-gate` |
| Context exhaustion | context budget per task; too big to fit means split the card | `skills/context-budget` |
| No structure, ad-hoc work | the board is the structure | `board/` |
| **Reported done, actually a shell** | `depth-check` on the diff; every ticked criterion cites its proof | `scripts/depth-check.mjs` |
| **Cited proof that does not exist** | `verify-claims` follows every citation into the repo | `scripts/verify-claims.mjs` |
| **A green suite that catches nothing** | `mutation-test` deletes a real invariant and asks if anything notices | `scripts/mutation-test.mjs` |
| **A secret pushed to a remote** | `scan-secrets` — working tree **and full history** | `scripts/scan-secrets.mjs` |
| **Every gate passed and the app is still broken** | `nexa-prove` runs the APPLICATION and asserts the four invariants that cost money | `scripts/prove-invariants.mjs` |
| **An agent grades its own work and passes** | `deliverable-shown` — the move to `5-verify` names the artifact, resolves it, and **prints it on screen** | `scripts/move-card.mjs` |
| **A gate that ran nothing and said PASS** | `nexa-prove` refuses a command that cannot fail; `mutation-test` refuses when every mutation was skipped | measured |

**The last row is the one most likely to be happening right now.** A stub has no TODO in it — it
has a signature, a doc comment, a plausible name, and a body that returns a constant. It passes
lint, passes the hygiene job, and raises the test count. `depth-check` finds six shapes: a
constant-return body, an empty catch, `throw new Error('not implemented')`, a placeholder string,
an assertion that cannot fail, a handler that never reads its parameter.

Measured 2026-07-28: **0 findings across 33 product files; 7 across a deliberately faked
implementation.** `- [x]` alone is refused at `5-verify` — a tick must carry a command or a
`file:line`, because *"verified"* is what a shell reports too.

**Then the citation itself is followed.** A bare tick is refused; an *invented* one looked
identical until `verify-claims` opened the file. **7 findings on a deliberately lying card, 0 on
a truthful one.**

---

## C · Why measurement is the highest-value section of the contract

A rule with a number behind it survives an argument. A rule without one gets negotiated away.

The project this workspace was built in carries **77 disproven claims** alongside its verified
ones, and **the disproven list turned out to be the more useful half** — each entry is work
nobody has to do again. Keep yours. `skills/measure-dont-claim` is the discipline; a number
without its harness is an unfalsifiable claim.

Two examples of the contract's own numbers going stale, which is why `check.mjs` verifies rather
than trusts: the token cost was written as ~2,000 when it was 4,230, corrected to 4,700, and
stale again at 5,968 within a day. **A number in prose drifts every time the file changes.**

### On ponytail's headline numbers

Its published result is **~54% less code, ~20% cheaper, ~27% faster, 100% of safety guards
kept** — and that is **someone else's benchmark on someone else's stack**: mean of 12 feature
tasks at **n=4** on Haiku 4.5 against a FastAPI + React repo. Not Node, not this codebase, not
our model. The vendor also **withdrew its own earlier 80–94% headline** as partly a
conversational-baseline artifact, which is a point in its favour and a reason to quote the
corrected figure rather than the loud one. **Treat it as a reason to try the tool, never as a
number about us.**

---

## D · Where state lives, and why it left the repository

Adopting a repo used to write fourteen files into it, which is a lot to ask of someone who has
not agreed to any of it yet. Now **two markdown files stay in your repository** — `AGENTS.md` and
`CLAUDE.md` — plus a one-line `.nexa` marker, `.claudeignore` and `.claude/settings.json`, which
are not markdown.

That limit was measured rather than assumed. A `CLAUDE.md` containing nothing but
`@~/.nexa/projects/<id>/AGENTS.md` was tried in a live session. **The import was not inlined** —
only the literal line reached the model — and the target sat outside the session's allowed
directories, so reading it was refused as well. The absolute-path form failed identically. **A
contract nothing loads is not a contract.**

```
~/.nexa/projects/-Users-you-work-my-app/    named after the repository's path
    config.json  board/  docs/  templates/
    prompts/  compactions/  backups/  manifest.json
    .council/runs/                          council deliberations
```

The directory is **named after the path rather than hashed**, so `ls ~/.nexa/projects` tells you
which project is which. The name is only a label: identity is the id in `.nexa`, so **renaming or
moving your repository re-labels the directory instead of orphaning your board.**

`nexa-migrate` **never moves a file git tracks**. A committed board belongs to you, not to this
plugin, and a tool that relocated weeks of decision history to tidy up would be a worse bug than
the mess it was cleaning.

### Why the prompt log is outside the repository

`scripts/hooks/save-prompt.mjs` saves every prompt as it is submitted — the intent behind a
change, in the words it was actually asked in, which no card ever quite captures. It exists
because the alternative was reconstructing them from `~/.claude/projects/*.jsonl`: outside the
repo, pruned, and keyed by a session id nobody remembers.

**Its location is a security decision.** Prompts here have carried a VPS root password and an
OAuth callback code, pasted in good faith while debugging. Secrets are scrubbed on write —
**mitigation, not isolation**; a novel format will get through.

Gitignoring it was the first answer and it was half of one. An ignored file is not tracked, so
**git will not restore it** — `git clean -xfd` deleted every prompt ever typed and nothing could
bring them back — and it was still sitting where a `git add -f`, a `zip -r`, or a directory
handed to somebody would pick it up. Moving it out removes that reach.

To keep a day deliberately:

```bash
cp ~/.nexa/projects/<id>/prompts/2026-07-30.md docs/prompts/
git add -f docs/prompts/2026-07-30.md      # read it first
```

### Recording is not remembering

The first four memory layers only ever grew; nothing read them back. `skills/reflect` closes
that — `node scripts/reflect.mjs` gathers everything since the last reflection, and
`docs/LEARNED.md` holds the patterns **no single record states**: a mistake that happened twice, a
belief that was overturned and the kind of reasoning that produced it, what a fresh agent gets
wrong on day one.

### The per-prompt state check

`scripts/hooks/prompt-check.mjs` — ~190 ms, **zero tokens when green**. It speaks only for WIP
over the limit, a stale reflection, or uncommitted work that has **grown**. Not the absolute
count: the product repo has carried 45 uncommitted files since 26 July, and reporting that every
prompt would be true, correct, and ignored by the second day. **A true statement that never
changes is still noise.**

It deliberately does not run `check.mjs` — measured at **1,175 ms and ~438 tokens of output**,
which is a card-moving cost, not a per-sentence one.

---

## E · Why the tier is pinned, and where proportionality came from

**Judgement work runs on the top tier: Opus 5, maximum effort.** Planning, spec challenge,
review, exploration, subagents. The judgement about which tasks are "easy" is itself the hard
part, and what this ships can hurt a caller. It is not a cost trade either — everything runs on
subscriptions already paid for.

**Pinned, not remembered** — `model: opus` in both `settings.json` files and every
`.claude/agents/*.md`, and `check.mjs` refuses a downgrade. That check exists because `explorer`
sat on `sonnet` until 2026-07-28: the search agent, whose findings everything downstream trusts,
and nobody noticed for a day.

**§3's proportionality rule does not contradict this, and the distinction matters.** The tier
governs *how carefully the model thinks about the part it is doing*. Proportionality governs
*how much process wraps a change*. Running discovery, spec, plan, review, security and a
five-model council on a typo is not rigour — it is cost, and worse, it teaches everyone to route
around the process for small work, which is exactly when the process stops catching anything.

Measured 2026-08-03 on this user's own environment: cost is **(context size) × (turns)**, and a
single session reached 17,449 turns at a 543k median context. Neither half looked alarming turn
by turn. Process that adds turns is not free, and it competes for the same budget as the work.

### Why a second model, always

**No model reviews its own work.** A model reading its own output agrees with itself, and the
review *looks* thorough while catching nothing. This is the most common way weak code passes an
agentic review, and it is invisible from inside.

**Consensus is not correctness.** The five council models share training data, so agreement
measures overlap as much as truth; this project's 77 disproven claims were mostly unanimous.

**A second-model review is multi-minute, not multi-second.** Measured: a trivial Codex prompt
returns in ~14 s; a real plan-review **exceeded 10 minutes at low, medium and high reasoning
effort alike**, and no flag combination changed it. So it is always background work.

---

## F · Why `test-the-real-thing` exists

A feature shipped with **532 green assertions, six clean gates and 31/31 mutation coverage** —
and then failed **ten consecutive times in a user's hands**. Every failure was a category the
suite could not see.

**A green suite is evidence about your harness, not about the product.**

---

## G · Deploying — why each step is there

Then the eight live checks in `skills/deploy-gate`. **Every one of them is a hole that shipped**,
not a hypothetical: an unauthenticated socket that was accepted and held, and shell access from a
query string.

**The in-container run is the one that counts** — two tests once passed locally and failed in the
container because they read the host's environment.

**A rollback restores code, never rows.** If the release migrated the schema, rolling the image
back puts the old application on top of the new shape, and the result is corrupted data rather
than restored service — the rollback rule becomes the cause of the outage. Hence `kind:
migration` on the card and `deploy-gate` §3a.

---

## H · What the gates cannot do

`nexa-prove` is the only gate that runs your software. The other two read artifacts, and **a
workspace whose every gate reads artifacts can certify a process that produced a broken
product** — which is what two audits and a council found here before it existed.

**What none of them can check:** whether the spec is good, whether the review was honest, or
whether the guard that failed was the right guard. Those stay human, and pretending otherwise is
how a process becomes theatre.

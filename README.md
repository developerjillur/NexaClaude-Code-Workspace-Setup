# NexaClaude Code Workspace

**A complete, opinionated workspace for Claude Code — hooks that refuse, gates that run, a
Kanban pipeline with WIP=1, fifteen skills, three subagents, seven commands, and a five-model
council that reviews your decisions across four vendors.**

Clone it, point it at your code, and the process runs itself. No special commands to memorise —
**Claude Code loads what it needs, when the situation matches.**

```bash
git clone https://github.com/developerjillur/NexaClaude-Code-Workspace-Setup.git
cd NexaClaude-Code-Workspace-Setup
./setup.sh --check                 # what is missing; changes nothing
./setup.sh --code ../my-app        # tools, plugins, config, then RUNS THE GATE
node scripts/check.mjs        # 19 checks; should say "All checks pass"
```

---

## Why this exists

Vibe coding fails in a small number of ways, over and over, and **they are all failures of
memory or of nerve**:

| What goes wrong | What this does about it |
|---|---|
| Code drifts from the plan | **an edit to product code is refused** unless a card is in `board/3-build` |
| Two things half-built at once | **WIP = 1**, enforced by the same hook |
| The agent forgets what it was doing | `SessionStart` rebuilds the state; `PreCompact` preserves the card before the window is squeezed |
| The same logic written three times | `reuse-first` runs *before* new code, not after |
| *"Done"* that is a stub | `depth-check` finds six stub shapes; `verify-claims` checks every citation resolves |
| A green suite that never caught anything | `mutation-test` deletes an invariant and asks whether the suite notices |
| Confident numbers nobody measured | `measure-dont-claim`, and a decisions log that demands a falsifier |
| Reviews by the model that wrote the code | **the review path is pinned to a different vendor** |
| Secrets pasted into a prompt | scrubbed on the way into the log; scanned in the tree **and the full git history** before deploy |

**None of it is advice.** Every item is a script that exits non-zero, or a hook that returns
exit code 2 and stops the turn.

---

## The honest part

This workspace was extracted from a real project, and the most useful thing it learned is
about itself:

> **Ten controls were built. Every one was wrong on its first version, and every one was
> wrong in the same direction — it failed *open*.** It passed when it should have refused, and
> a passing check looks exactly like a correct one.
>
> Not one was found by the case it was built to catch. **Every one was found by testing the
> case it was supposed to stay silent on.**

Two instances, and the second happened while publishing this repo:

- A guard against `git reset --hard` was written as `reset\s+(?:-[^\s]+\s+)*--hard`. The
  optional flag group swallowed `--hard` itself, so the literal never matched — and **the exact
  command it was written to stop walked straight through**.
- **The first push of this repo shipped without `board/` at all**, because git does not track
  empty directories. `guard-edit` looked for cards in a directory that did not exist, found
  nothing to object to, and **passed silently** — the one blocking hook, off by default, in the
  exact state a new user would first meet it.
- Then the same guard failed open again on macOS, where `/var` is a link to `/private/var`: a
  shell hands over `/var/...` while the workspace root resolves to `/private/var/...`, so the
  file read as outside the tree. **The first fix for that read as applied and was not** — its
  path helper walked up only one level, and the guard is normally asked about a file inside a
  directory that does not exist yet either.

All three were found the same way: **cloning into a clean directory and firing the guard by
hand.** The in-repo tests stayed green through every one of them, because on the machine that
built it the paths always agreed.

That is why `tests/` exists and why every guard here ships with the case it must *ignore*
beside the case it must catch. **648 assertions across three suites, and the blocking paths were watched blocking.** (One is macOS-specific and skips
elsewhere, so the exact count moves by one — a number that drifts is worth saying so about rather
than rounding into a claim.)

```bash
# a bare clone can run these two
node tests/hooks.test.mjs             # the hooks, the gates, the controls
node tests/guard-paths-with-spaces.mjs

# these arrive with ./setup.sh — the council is FETCHED, not vendored
node tests/council.test.mjs           # containment, ranking, aggregation
node tests/survives-session-death.mjs # launches a council, SIGKILLs the
                                      # session, checks the run lived
```

**The split matters.** The first two are in this repo. The second two come from the council,
which is cloned at setup rather than copied in — so on a fresh clone they do not exist yet, and
a instruction that cannot be followed is a broken instruction. Counts are deliberately not
quoted here: a number in a README is a claim, and this one drifted three times before a check
started counting the files instead.

---

## Install

### Option A — your code lives inside the workspace

```bash
git clone https://github.com/developerjillur/NexaClaude-Code-Workspace-Setup.git my-project
cd my-project && rm -rf .git code/README.md && git init
# put your code in code/, or edit workspace.config.json to name your real dirs
```

### Option B — your code is its own repo (how the original ran)

```bash
git clone https://github.com/developerjillur/NexaClaude-Code-Workspace-Setup.git
ln -s ../my-app NexaClaude-Code-Workspace-Setup/code       # one tree for the agent
cd my-app
ln -s ../NexaClaude-Code-Workspace-Setup/AGENTS.md AGENTS.md
ln -s ../NexaClaude-Code-Workspace-Setup/CLAUDE.md CLAUDE.md
cp -r ../NexaClaude-Code-Workspace-Setup/code/.claude .     # then fix ../WORKSPACE inside it
```

> **Option B and the plugin disagree, and the plugin wins.** With the plugin enabled, hooks
> take their project from `CLAUDE_PROJECT_DIR` — so running Claude Code inside `my-app` finds
> *my-app*, not the sibling board. Nothing on disk distinguishes that from loading the plugin
> with `--plugin-dir` while working in an unrelated repo, so one of the two had to lose.
> **Start Claude Code in the workspace, or export `CLAUDE_PROJECT_DIR` pointing at it.**

**Link, never copy.** Two copies of a contract drift, and the drift is silent — the original
project shipped a duplicated pricing table that showed a customer **$6.05 for a call the
database recorded at $1.92**.

### Then — the one file you must edit

`workspace.config.json`:

```json
{ "codeDirs": ["code"] }        // or ["src", "lib"], or wherever your code actually is
```

**This is the only required edit.** It decides which paths need a card. Get it too wide and the
gate fires on your own README and you switch it off within a day; too narrow and it is
decoration. A malformed config falls back to `code/` only — deliberately, so a broken config
makes the gate *quieter* rather than turning your whole repo into guarded territory.

Then rewrite `AGENTS.md` §1 and §2. They ship as templates with the questions written out.

---

## How it works without you asking

**Nothing here needs a magic phrase.** Three mechanisms, all automatic:

**0 · Install it, and that is all.** The workspace ships as a plugin. Open Claude Code in a
clean repository root and it scaffolds itself — board, docs, config, contract, permissions — and
tells you every file it created and how to undo it. It refuses in every other case: not a repo
root, a linked worktree, your home directory, a repo that already has a `board/` that is not
ours, or one where you ran `/nexa-workspace:remove` before.

```bash
claude plugin marketplace add openai/codex-plugin-cc
claude plugin marketplace add DietrichGebert/ponytail
claude plugin marketplace add developerjillur/NexaClaude-Code-Workspace-Setup
claude plugin install nexa-workspace@nexa
```

**One caveat, stated because it cannot be fixed:** `model` is read once at startup, so the
first session runs on your default model. Permission rules and hooks are live immediately —
[measured](scripts/measure-settings-race.mjs), not assumed.

**1 · Hooks fire on events.** Declared in `plugin/hooks/hooks.json` — **8 scripts across six
events** (`UserPromptSubmit` runs two):

| Event | Script | What it does |
|---|---|---|
| `SessionStart` | `session-start.mjs` | prints the board, the card in build, and what changed since last time |
| `UserPromptSubmit` | `save-prompt.mjs` | archives every prompt you type, **with secrets scrubbed** |
| `UserPromptSubmit` | `prompt-check.mjs` | one quiet line when the working state has drifted — silent when it has not |
| `PreToolUse` | `guard-edit.mjs` | **the one that refuses.** No card in build → the edit is blocked |
| `PreToolUse` | `guard-wakeup.mjs` | **refuses a wakeup whose own reason says there is nothing to wait for** — a timer is not a substitute for finishing |
| `PostToolUse` | `after-edit.mjs` | notices what an edit implies you now owe |
| `Stop` | `session-end.mjs` | the turn cannot end quietly with a gate unrun |
| `PreCompact` | `pre-compact.mjs` | preserves the card, the files touched and the measurements **before** the window is squeezed |

**2 · Skills load themselves.** Each `SKILL.md` carries a `description:` that says *when* it
applies, and Claude Code matches on it. You do not invoke `reuse-first` — it arrives because
you were about to write a new file.

**3 · Gates refuse.** `scripts/check.mjs` is the deploy gate — **19 checks** — and CI runs it. A failure is a
refusal, not a note.

---

## What is in the box

### 16 skills — `.agents/skills/`

| Skill | When it fires |
|---|---|
| `session-start` | first thing, every session — rebuilds what a new session cannot know |
| `skill-finder` | before any new *kind* of work: find the skill that already covers it |
| `spec-first` | a card enters `1-spec`, or an agent starts coding without one |
| `reuse-first` | **before** writing any new code, file or dependency |
| `context-budget` | at `2-plan` — does this card fit one window, and where does it split |
| `pick-the-model` | which agent or model does this piece of work |
| `measure-dont-claim` | you are about to state a number, a rate, or *"this is faster"* |
| `review-gate` | scoring a change on five axes, **by a different model than wrote it** |
| `security-gate` | before any card leaves `4-review`; cannot be traded against the score |
| `definition-of-done` | at `5-verify` — including *"has anyone watched the guard fail?"* |
| `deploy-gate` | before every deployment, without exception |
| `council` | a decision that is expensive to reverse |
| `finish-dont-schedule` | a turn is about to end with work left, or /loop is about to be used — **is there anything real to wait for?** |
| `reflect` | the records have gone stale; read them back and consolidate |

### 7 commands — `.claude/commands/`

`/card` · `/council` · `/review` · `/verify` · `/measure` · `/plan-review` · `/deploy`

### 3 subagents — `.claude/agents/`

`explorer` (maps a subsystem read-only, writes findings to a file so your main context stays
clean) · `reviewer` (scores a diff against its spec) · `spec-challenger` (attacks a draft spec
before any code exists)

### 32 scripts — `scripts/`

| Script | What it answers |
|---|---|
| `verify-install.mjs` | **the 5-verify arms only a real session can settle** — does a populated repo stay untouched, does a clean root scaffold and announce it. Refuses to report at all when the session did not run |
| `measure-settings-race.mjs` | **the measurement the zero-command bootstrap rests on** — does a deny rule written by a `SessionStart` hook protect the session that wrote it? Two arms, and the BASELINE arm exists so a broken harness cannot report success |
| `council-sync.mjs` | **fetches the council from GitHub** and links it into place — never vendored, because a copy is a dependency with a timer on it |
| `graph-fresh.mjs` | **is the code graph describing code that still exists?** The contract sends every agent to query the graph first; a stale one does not error, it answers |
| `card-gate.mjs` | **the refusal that turns discovery and operate from advice into gates** — a card cannot leave `0-discovery` without its five answers, or reach `6-done` without naming where its errors surface |
| `kill-audit.mjs` | **delete one real protection at a time and see whether anything notices.** Not "is this control watched?" but "is each of its rules watched?" — a control can be watched and still have nine of its ten rules unwatched. Found four on its first run |
| `guard-coverage.mjs` | **every control that refuses must be tested in BOTH directions** — sixteen were wrong on their first version, and not one was found by the case it was built to catch |
| `check.mjs` | the gate — 19 checks, and CI runs it |
| `depth-check.mjs` | is this real code, or six shapes of stub |
| `verify-claims.mjs` | does every citation in the card actually resolve |
| `mutation-test.mjs` | delete an invariant — does the suite notice? |
| `scan-secrets.mjs` | tree **and full git history**, with a named allowlist |
| `reflect.mjs` | what has happened since the last consolidation |
| `council/*.mjs` | 15 files — the council, below |

### The council — four vendors, three stages, no API keys

Synced from [`all-cli-council`](https://github.com/developerjillur/all-cli-council), which is
the same code published standalone. **15 scripts, 510 assertions.**

```bash
node scripts/council/council.mjs "<question>" --context src/a.js src/b.js
node scripts/council/council.mjs "x" --preflight              # who is reachable; free
node scripts/council/verify-containment.mjs                   # prove no member can write
node scripts/council/watch.mjs                                # follow a run from another terminal
```

Every member answers **alone**, then ranks the others **without knowing whose answer is whose**,
then you synthesise. Runs on local CLIs.

**The finding that justifies the whole package**, and it is not hypothetical:

> The promise is one sentence — *"members advise, they never edit."* It was enforced by a test
> that pattern-matched each member's flags for `read-only|plan|--print|-p` and asserted a
> match. **That test passed. Three of the five members could write anyway.**

So `verify-containment.mjs` **proves** it per member, by trying to write, instead of believing a
flag. One member is now excluded by default with `contained: false` recorded against it — and
opting it back in prints a warning into the run file.

**Other things it does that a first version would not:**

| | |
|---|---|
| **Borda, self-votes excluded** | 3 of 4 judges ranked their own unlabelled answer first — 75% against a 20% chance rate. **Anonymisation does not prevent self-enhancement; a model recognises its own writing** |
| **A position is worth the same from every reviewer** | the first fix equalised each *ballot's* total, which inverted the unfairness instead of removing it — a reviewer ranking 2 of 4 gave its top pick up to 2.5× the influence of a complete ballot's |
| **UTF-8 across pipe boundaries** | member output was accumulated as raw Buffers, so `toString()` ran per chunk and a 3-byte character split across a ~64 KiB boundary became `U+FFFD`. **Every answer longer than one pipe buffer was silently corrupted.** Measured: 100,000 em-dashes through a pipe arrived with 8 replacement characters; with `setEncoding`, zero |
| **Bias diagnostics above the score** | self-enhancement, verbosity correlation, family mix. Read them before the number |
| **Never retries, never hangs** | a missing CLI is named before anything starts; a quota message is refused rather than ranked as an opinion; a hung member is killed by process group. With no members at all it exits in ~30 ms having spent nothing |
| **Secrets refused by shape** | and context is fenced as data with the instruction placed *after* it, so a file cannot smuggle an instruction |
| **An event stream** | `--events` writes NDJSON; `watch.mjs` follows a run from another terminal, or after it has finished |

**Flags:** `--context` · `--revise` · `--lenses` · `--rubric` · `--members` · `--stage` ·
`--peer-review` · `--events` · `--json-events` · `--timeout` · `--print` · `--card` ·
`--local-roster` · `--allow-uncontained` · `--verify-delivery` · `--no-live` · `--preflight`

**Read every stage-1 answer before the rankings.** The tally pulls you toward consensus; form
your own view first, or you are synthesising their synthesis. **Where they disagree is the
output** — averaging four models produces something none of them would defend.

### The board — `board/`, nine stages

`0-discovery → 0-backlog → 1-spec → 2-plan → 3-build → 4-review → 5-verify → 6-done → 7-operate`

**WIP = 1 at `3-build`, enforced.** `templates/CARD.md` is the shape; each stage has a gate
that must be answered, not ticked.

**The two outer stages exist because a council found the pipeline broke at both ends:**

- **`0-discovery`** — *"the pipeline breaks between idea and 1-spec. Its own contract says the
  human writes the specification and the agent challenges it. **That presupposes somebody has
  already determined what deserves building.**"* The `discovery-first` skill is five questions
  a card must answer before it may enter `1-spec`, and *"I think"* is not an answer to any.
- **`7-operate`** — *"**the pipeline ends at the moment of push, and production is where paying
  users live.** With 10–1000 customers the dominant failure mode is not 'the agent shipped a
  stub' — this workspace kills that dead — it is **'the app degrades and nobody finds out from
  the code.'**"* `operate-after-done` asks four questions after every deploy and turns what
  production says back into cards.

### Engineering baseline — `templates/engineering-baseline/`

The same review found world-class controls against *agent* failure and **none of the hygiene an
ordinary engineering org takes for granted.** ESLint, Prettier, EditorConfig, `checkJs` and
Dependabot ship as configs to copy into your product repo — the workspace itself stays
dependency-free, because a linter belongs to the code being written, not to the process writing
it. **`check.mjs` warns for every missing `lint` / `format` / `typecheck` / `test` script and
does not stop warning.**

### Plugins — declared, not assumed

Declared in `.claude/settings.json` so a fresh machine **fails loudly** instead of silently
losing the review path:

`codex@openai-codex` — **load-bearing**: `/codex:review` and a Stop gate that can block a turn ·
`ponytail@ponytail` · `code-review` · `feature-dev` · `github` · `code-simplifier` ·
`security-guidance` · `typescript-lsp`

**Installing them — two of these live in marketplaces nobody registers for you.**
`claude-plugins-official` registers itself the first time you launch Claude Code, so
`code-review`, `feature-dev`, `github`, `code-simplifier`, `security-guidance` and
`typescript-lsp` install straight away. **`codex` and `ponytail` do not** — they are separate
marketplaces, and *no plugin can add a marketplace on your behalf.* Registering a plugin source
is a trust decision that stays with whoever clones the repo, which is why it is two commands and
not a dependency line:

```bash
# 1 · register the two marketplaces that are not known by default
claude plugin marketplace add openai/codex-plugin-cc       # → openai-codex
claude plugin marketplace add DietrichGebert/ponytail      # → ponytail

# 2 · install both plugins
claude plugin install codex@openai-codex                   # the second model — §10
claude plugin install ponytail@ponytail                    # the laziness ladder — §5
```

`./setup.sh` does step 2 for every entry in `enabledPlugins`, and step 1 for every entry in
`extraKnownMarketplaces`. **Only `ponytail` is listed there today, so run the `openai-codex`
line by hand first** — otherwise setup stops on `codex@openai-codex`, which is the one plugin
the contract calls load-bearing.

**Add your own stack's plugins.** The original carried two more for its telephony and hosting;
they were removed here because they are not yours.

---

## Two rules worth arguing about

**The model tier is pinned, and it is not a choice.** `"model": "opus"` and
`MAX_THINKING_TOKENS: 31999` in both settings files, checked for drift. A cheaper model on the
review path does not produce a cheaper review — it produces a formality.

**A second model, always.** The review of a change is run by a different vendor than wrote it.
Self-review finds typos and misses intent, which is the one thing review is for.

---


---

## Skip this workspace if you…

Taken as a form from [headroom](https://github.com/headroomlabs-ai/headroom), whose README says
plainly who should not install it. **A tool that cannot describe who it is wrong for is a tool
that has not been used enough to know.**

- **You are exploring, not building.** Every control here assumes a card, a spec and a reason.
  A spike does not have those and should not be forced to invent them — work outside the
  workspace and bring back what survives.
- **You are the only reader and the project is small.** The pipeline exists because context is
  lost between sessions and between models. If nothing is ever forgotten, it is overhead.
- **You cannot run local processes.** Everything here is hooks and Node scripts on your machine.
- **You want the agent to move faster than you can review.** This is built to slow the exact
  moment where speed produces work nobody checked. It will feel like friction, because it is.
- **You will not fix a red gate.** A refusal that gets bypassed twice is worse than no refusal,
  because everyone still believes in it.

## Requirements

- **Node ≥ 20** — no dependencies; every script is plain Node
- **Claude Code**
- Optional but recommended: the CLIs the council calls (`codex`, and any others you list in
  `scripts/council/members.json`). `--preflight` tells you which are reachable and costs
  nothing.

---

## Credits

Built by **[Jillur Rahman](https://github.com/developerjillur)** (NexaLance), with Claude Code.

The design owes specific debts, and they are worth naming because each one changed something
concrete:

- **[Anthropic's large-codebase guidance](https://claude.com/blog/how-claude-code-works-in-large-codebases-best-practices-and-where-to-start)** — layered, directory-scoped `CLAUDE.md` instead of one file that rides every session
- **[AGENTS.md](https://agents.md)** — the cross-tool contract format, read natively by Codex CLI, Cursor, Copilot, Aider, Zed, Windsurf and 28+ others
- **[karpathy/llm-council](https://github.com/karpathy/llm-council)** — the three-stage council, adapted to local CLIs and given bias measurement
- **[worldflowai/everything-claude-code](https://github.com/worldflowai/everything-claude-code)** — whose sharpest contribution was not a skill: it was **having a `tests/` directory for its hooks at all**
- **[DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)** · **[Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify)** — the laziness ladder, and querying a code graph instead of grepping
- **Mixture-of-Agents ([arXiv:2406.04692](https://arxiv.org/abs/2406.04692))** — the optional revision round

## Licence

**MIT.** Use it, fork it, sell what you build with it. If it saves you an afternoon, a star is
plenty.

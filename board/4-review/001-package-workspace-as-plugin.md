# 001 — Package the workspace as a Claude Code plugin

> Stage: 2-plan · Owner: Jonayed Ahamed · Opened: 2026-07-30
> **Revision 2** — rewritten after the council refused revision 1. Every mechanism below that
> changed did so because a claim was checked and found false, not because an argument was
> better. Run: `.council/runs/this-plan-repackages-…-2c0185.md`, 4/4, overlap 0.06.

---

## 0 · Discovery  *(gate: `card-gate` refuses without all five)*

**Who asked?** Jonayed Ahamed (repo owner, `developerjillur`), session `df8345ad`, 2026-07-30 —
*"how many resources cannot fit into a plugin"* → *"what is the way we can fit them"* → *"start
building the plugin"*. Verbatim in `docs/prompts/2026-07-30.md`.

**What they do today instead?** `git clone`, `./setup.sh --code ../my-app`, then README Option B:
symlink `AGENTS.md` and `CLAUDE.md` into the product repo, `cp -r` the `.claude` directory, and
hand-edit `../WORKSPACE` paths inside it. Five manual steps, two of them copies the README
itself warns against.

**What they breaks for them if this never exists?** No `claude plugin install`, no version pin,
no `claude plugin update`, no sharing one copy across two projects. Every adopter's `.claude/`
diverges from upstream silently.

**What number moves?** *Resources delivered by `claude plugin install` alone.* Counted this
session against the plugin reference: **46 of 61 portable, 15 with no plugin slot.** Revision 1
claimed *"≥59 of 61"* and that claim is now **withdrawn as false** — it double-counted
(mechanism rows sum to 15, plus the irreducible row makes 16, so *"14 of 15"* never held), and
it counted resources mechanisms A, B and D cannot in fact deliver. **Restated, and split,
because the two halves have different truth conditions:**

- **Delivered by install alone: 46 → 52.** The 46 portable components, plus the 6 that `bin/`
  adds (the `npm run` scripts). No project write.
- **Delivered by one explicit `/nexa:init`: 52 → 60.** The 8 project-state resources.
- **Never: 1.** `extraKnownMarketplaces`. No manifest field exists, by design.

Method: `find` inventory + the component table in `plugins-reference`. Re-runnable, and the
numbers above are counts, not estimates.

**What would make us stop?** Unchanged from revision 1, and **kill-conditions 1 and 3 both fired
against revision 1** — which is why this is revision 2 rather than a build.

1. The plugin cannot be installed without mutating the user's working tree. *(Fired: rev 1's
   `SessionStart` scaffolder wrote `board/` create-if-missing. Creation is mutation.)*
2. The `agent` key conflicts with a user's own main-thread agent. *(Fired: mechanism A **was**
   this condition.)*
3. `guard-edit.mjs` stops blocking when run from `${CLAUDE_PLUGIN_ROOT}`. *(Fired, and wider
   than written — see §2 prerequisite.)*

---

## 1 · Spec  *(gate: two people would build the same thing)*

**Problem.** Claude Code plugins distribute *components*. This workspace's power is split
between components and *project state*, and the second half has no plugin slot. Revision 1 tried
to synthesise the state half out of plugin mechanisms; four of its five mechanisms do not hold.

**The rule this card now works under:** **the plugin ships components and writes nothing. A
single explicit `/nexa:init` writes project state, previewed, create-only.**

**Acceptance criteria** — testable statements, not adjectives.
**At 5-verify each tick must carry its proof** — a command or a file:line:

- [ ] **Install writes nothing.** Clean-room: install into an isolated `CLAUDE_CONFIG_DIR`
      against a populated repo, start and end a session, `git status --porcelain` is empty.
      *(Replaces rev 1's "run twice, unchanged" — idempotence is not consent; rev 1's criterion
      passed while kill-condition 1 fired.)*
- [ ] **`guard-edit` refuses from the plugin path** — absolute `Edit` on `<project>/code/x.js`
      with zero cards in `board/3-build`, hook invoked from the cache, exits 2. Watched failing,
      output pasted.
- [ ] **…and stays silent** on a workspace/doc edit from the same path.
- [ ] **The `Bash` redirect variant refuses too** — `printf x > code/src/auth.ts` with `cwd` set
      to the project.
- [ ] `claude plugin validate ./plugin --strict` exits 0
- [ ] Marketplace install and `--plugin-dir` produce **the same file set** in the plugin (the
      symlink-direction test — see §2 Q1)
- [ ] `/nexa:init` on an empty repo creates the 9 board stages, `docs/`, `workspace.config.json`,
      `.claudeignore`, `AGENTS.md`, `CLAUDE.md` and `.claude/settings.json`; on a populated repo
      it **overwrites nothing** and reports what it skipped
- [ ] `node scripts/check.mjs` and `node tests/hooks.test.mjs` stay green throughout

**Out of scope.** Vendoring ponytail. Publishing to `claude-community`. Changing any gate's
logic. The council (stays fetched by `council-sync.mjs`).

**Must not break.** The clone + `setup.sh` path, unchanged. This is a second door, not a
replacement.

**Proved by.** `tests/plugin-packaging.test.mjs` (new). **The guard watched failing:** the two
`guard-edit` criteria above, run from a cache path, with the deliberate failure pasted.

---

## 2 · Plan  *(gate: named files, ladder run, fits one context)*

### Prerequisite — and nothing else may start before it

**All eight hook scripts derive their root from `import.meta.url`, and not one reads
`CLAUDE_PROJECT_DIR`** (`grep -c import.meta.url scripts/hooks/*.mjs` → 8; `grep -l
CLAUDE_PROJECT_DIR scripts/hooks/*.mjs` → none). Run from a plugin cache, `guard-edit.mjs:20`
resolves `ROOT` to the cache; `:30` reads `workspace.config.json` from there, fails, falls back
to `['code']`; `CODE_ABS` becomes `<cache>/code`; `isCode()` is false for every real file; and
`if (!isProductCode) allow()` exits 0. **The blocking guard becomes a silent no-op for every
edit in the user's repo.**

Three of the four members found this independently. Revision 1 *forbade* the fix — its reuse
ladder said *"guard-edit walks up for workspace.config.json… REUSE, do not rewrite"* — and
**that citation was false**: `realish()` walks up for symlink resolution only; the config is
read once from a fixed `ROOT`. A false citation in the plan foreclosed the one change that
prevents the fail-open. That is a `verify-claims` finding against this card's own author.

And it is not only a fail-open: `save-prompt.mjs`, `session-end.mjs` and `pre-compact.mjs`
**write**. From a cache root they would redirect every project's prompt log and session record
into one shared directory — silent cross-contamination of the audit trail.

**Fix, applied to all eight:** two explicit roots.

| Root | From | Holds |
|---|---|---|
| `PLUGIN_ROOT` | `import.meta.url` | scripts, bundled templates, immutable assets |
| `PROJECT_ROOT` | `process.env.CLAUDE_PROJECT_DIR`, else validated hook `cwd`, else today's walk-up | `workspace.config.json`, `board/`, `codeDirs`, `docs/`, markers |

`CLAUDE_PROJECT_DIR` is documented as exported into every hook process, so the fix is available
— but Codex's caution stands: *injecting it neutralises nothing in code that never reads it.*
The scripts must be changed.

**Fail-closed rule:** if `PROJECT_ROOT` cannot be established, `guard-edit` **asks** rather than
allows. Today it allows, which is the same shape as the three shipped fail-opens.

### Mechanisms — revised

| Blocker | Rev 1 | Rev 2 |
|---|---|---|
| `AGENTS.md`, `CLAUDE.md` | plugin `agent` = system prompt | **`/nexa:init` writes them to disk.** The contract stays where 28+ tools read it, and `codex@openai-codex` — the load-bearing 4-review model — can still see what it reviews against |
| `model: opus`, `MAX_THINKING_TOKENS` | agent frontmatter | **`/nexa:init` writes `.claude/settings.json`.** `effort: max` is not a documented equivalent of a token budget |
| `permissions.deny` / `.ask` | `PreToolUse` hook | **Stays in `settings.json`, written by `/nexa:init`.** A hook cannot see `@code/.env` attached to a user message, and native `Read` rules cover `@file` mentions, Grep, Glob and IDE context. A hook also fails open on any runtime error |
| `board/`, `docs/`, config, `.claudeignore`, CI | `SessionStart` scaffolder | **`/nexa:init` only.** `SessionStart` emits `additionalContext` saying *"not initialised — the board guard is inactive"*, and writes nothing. It cannot block startup anyway |
| `codeDirs`, `planDir` | `userConfig` | **`workspace.config.json`, a project file.** `pluginConfigs` are read only from user/`--settings`/managed scope; project settings are ignored, so one install cannot serve two projects |
| `npm run` scripts, `setup.sh`, `tests/` | `bin/` | **Unchanged — `bin/` is correct.** 14 bare `nexa-*` commands |
| `enabledPlugins` | `dependencies` | **Unchanged.** Plus our own `marketplace.json` |
| `extraKnownMarketplaces` | irreducible | **Unchanged.** One README line |

The `nexa` agent still ships — as an **opt-in** agent a user may select, never as a
`settings.json` default. Documented with what it replaces.

### Open questions — resolved

**Q1 · copy or symlink → symlink, inverted.** `plugin/` becomes the canonical home of the 44
shared files; the repo's traditional paths become symlinks pointing *into* `plugin/`. The
documented rules decide it: within the plugin's own directory a symlink is **preserved**;
elsewhere in the marketplace it is **dereferenced**; and *"for plugins installed with
`--plugin-dir` or from a local path, only symlinks that resolve within the plugin's own
directory are preserved."* The top-ranked answer's shape (canonical outside, link in) works for
a marketplace install and is **skipped under `--plugin-dir`** — dev testing would diverge from
what users get. Inverting ships real files under both. The drift check gets deleted, not written.

**Q2 · scaffold on SessionStart → no.** `/nexa:init` only. Rev 1's leaning was right and its
mechanism table contradicted it; the table was the plan.

**Q3 · layout → `plugin/` subdirectory**, root `marketplace.json` with `"source": "./plugin"`.

### Files to touch

| File | Change |
|---|---|
| `scripts/hooks/*.mjs` (8) | **prerequisite** — two-root split, fail-closed on unresolvable root |
| `tests/hooks.test.mjs` | the cache-root fail-open, both directions, watched |
| `plugin/.claude-plugin/plugin.json` | new — `dependencies`, no `userConfig` |
| `plugin/{skills,commands,agents}/` | canonical home of the 44 |
| `plugin/agents/nexa.md` | new — opt-in, not defaulted |
| `plugin/hooks/hooks.json` | 6 events, `${CLAUDE_PLUGIN_ROOT}` |
| `plugin/bin/nexa-*` | 14 wrappers |
| `plugin/commands/init.md` + `plugin/scripts/init.mjs` | new — the only writer |
| `.claude-plugin/marketplace.json` | new, repo root |
| `{skills,.claude/commands,.claude/agents}` | become symlinks into `plugin/` |
| `tests/plugin-packaging.test.mjs` | new |
| `README.md`, `docs/DECISIONS.md` | done / in progress |

### Reuse ladder — re-run, because the last one carried a false citation

```
graphify explain "hook scripts workspace root resolution"
→ error: graph file not found: graphify-out/graph.json

  Recorded as run, with its real output, rather than quoted as if it answered.
  graphify indexes PRODUCT code; this repo has none (`codeDirs: ["code"]`, and
  `code/` does not exist until ./setup.sh points it at a repo), and graphify-out/
  is gitignored. The graph cannot describe the workspace's own scripts, so the
  ladder was climbed with the tool that could:

grep -n "import.meta.url" scripts/hooks/*.mjs        → 8 files, every one fixed-root
grep -l "CLAUDE_PROJECT_DIR" scripts/hooks/*.mjs     → none

→ rung 7. The root resolution must be WRITTEN, not reused. Rev 1's rung-2 "reuse,
  do not rewrite" rested on behaviour guard-edit.mjs does not have — realish()
  walks up for symlinks, the config is read once from a fixed root.
→ rung 2 for the extraction itself: one shared roots.mjs, not the same eight-line
  fix pasted into eight files.
templates/ already holds CARD.md + engineering-baseline → rung 2 for init's content.
bin/nexa-*  → rung 6, one line each.
```

**A note for the gate that caught this.** `check.mjs` refused this card until a
`graphify explain` was recorded, and the honest answer was a negative result. That is worth
keeping: the gate cannot tell whether the graph *answered*, only whether it was *asked*, and
pasting the string would have satisfied it. What makes the difference is that the output above
is real and reproducible.

### Context budget — three cards, this one is the first

- **001** the two-root prerequisite + its watched-failing tests ← build this
- **002** the plugin tree, symlink inversion, marketplace, `bin/`
- **003** `/nexa:init`, the council status line, README

**Open question for the human.** ~~Confirm the shape before 002 starts.~~ **Answered
2026-07-30: zero-command is a hard requirement.** `/nexa:init` is refused as a product; the
bootstrap runs on `SessionStart`. See `docs/DECISIONS.md`, *"Zero-command adoption"* — the
design survived because settings hot-reload is documented, so permissions written at
`SessionStart` arm the session that wrote them. `model` does not, and is announced.

---

## 3 · Build

**What was done.**

*Prerequisite — the two-root split, all eight hooks.* `plugin/scripts/hooks/roots.mjs` is new
and holds the whole story: `PLUGIN_ROOT` for bundled assets, `projectRoot()` for the tree being
guarded. Every hook that previously computed one root from `import.meta.url` now takes
`ROOT` from it. `guard-edit` gained a `project-root-unknown` refusal so an unlocatable project
refuses rather than concluding there is nothing to guard.

*Packaging.* `plugin/` is now the canonical home of the shared components, with the repo's
traditional paths as back-links into it — `.agents/skills → ../plugin/skills`,
`.claude/commands`, `.claude/agents`, `scripts/hooks`, and the pre-existing `skills` and
`.claude/skills` chains still resolving through them. `plugin/hooks/hooks.json` re-wires the six
events to `${CLAUDE_PLUGIN_ROOT}`. `plugin/.claude-plugin/plugin.json` declares all eight
dependencies with their marketplaces; `.claude-plugin/marketplace.json` at the repo root carries
`allowCrossMarketplaceDependenciesOn` for the three foreign ones.

**Anything the spec did not say** — and the answer chosen:

- **A third rung in `projectRoot()`.** With the plugin at `<workspace>/plugin/`, three dirnames
  from a hook reach `plugin/`, and Node resolves symlinks in `import.meta.url`, so the
  back-links do not help. `workspaceAbove()` walks up four levels for a board or a config.
  In an installed plugin it finds nothing and falls through to `CLAUDE_PROJECT_DIR`, which is
  the intended path.
- **The `nexa` opt-in agent was not built.** Zero-command writes the contract to disk, so an
  agent whose only job is to carry the contract has nothing left to do — and it replaces Claude
  Code's system prompt entirely. Dropped rather than shipped unused.

**Watched failing, twice.** The new fixture builds a fake plugin cache and a separate project.
Against the single-root guard it is a silent `exit 0`. Against the fixed one it refuses
`project-root-unknown` — **and on its first run it exposed a second instance of the same
fail-open** in the Bash branch, where `else process.exit(0)` returned before the refusal was
ever reached: `printf x > code/src/auth.ts` passed while the `Edit` form of the identical write
was blocked. Fixed to refuse only when the command actually writes, so it does not brick `ls`.

**Green:** `tests/hooks.test.mjs` 276/0 (+6) · `guard-paths-with-spaces` 6/6 · `check.mjs` all
checks pass, 4 warnings · `kill-audit` 12 mutations, all caught · `card-gate` clean ·
`claude plugin validate ./plugin --strict` and the marketplace manifest both pass.

### 004 — the gate scripts, and the plugin is complete

Everything is now in `plugin/`. `scripts/` is a single symlink to `plugin/scripts`, so the
clone path is unchanged and `node scripts/check.mjs` still works from the repo root.

**The root question is different for a gate script than for a hook, and conflating them broke
things twice.** A hook is handed its project by Claude Code. A gate script is a bare command in
a terminal. So:

- `projectRootFor(import.meta.url)` — for gate scripts. Two `dirname`s up is the project
  **unless that directory holds `.claude-plugin/plugin.json`**, which is the only marker that
  distinguishes "installed in the cache" from "a clone" *and* from "a test fixture". Fixtures do
  not look like workspaces and neither does a fresh repo, so the workspace heuristic was the
  wrong question; "am I inside the plugin?" is the right one.
- `projectRoot({ cwdFallback })` — the working-directory rung is available to gate scripts and
  **denied to hooks**. Sharing it turned the plugin-cache fail-open test green by resolving to
  the repository the suite itself was running in: a guard that cannot find its board would have
  quietly adopted whatever directory the shell was in. The fixture caught it in one run.

**`plugin/bin/` — 15 bare commands**, `nexa-check`, `nexa-audit`, `nexa-secrets`, `nexa-race`,
`nexa-remove` and the rest. Tested: every wrapper resolves to a script that exists, and every
one is executable **in the git index** rather than only on this machine — the defect `setup.sh`
already shipped once.

**Seven test fixtures had to change**, and the change is itself a control: they copy a gate
script into a temp tree, so they now copy `hooks/roots.mjs` beside it. Without that the fixture
exercises a module-not-found crash — which still exits non-zero, and would therefore have
*passed* every assertion that only checked for a refusal.

**Green:** `hooks` 276/0 · `bootstrap` 63/0 · `spaces` 6/6 · `check.mjs` all pass ·
`kill-audit` all caught · `validate --strict` ✔ ✔.

### 003 — the zero-command bootstrap

`plugin/scripts/bootstrap.mjs`. Opening Claude Code in a clean repository root is the whole of
adoption; `SessionStart` calls it and it refuses in every other case.

**The predicate is the product.** Nine rungs, and eight of them refuse: not a git repo, not the
repo root, a `.git` *file* (linked worktree or submodule), the home directory, a temp directory,
a tombstone, an unreadable `workspace.config.json`, a `board/` that is not ours. The first five
refuse **silently** — a hook that announces itself in every directory a user opens is a hook
they uninstall. The last two are announced, because a contested repository deserves a sentence.

**Create-only throughout**, with one ladder for settings: absent → create; present → *never
touch it*, write `settings.local.json` (which Claude Code gitignores itself, so no tracked file
is ever dirtied); both present → the only real merge, set-union on `deny`/`ask`, our keys only
where absent, theirs preserved byte for byte, backed up once. Atomic `write`-then-`rename`, so a
death mid-write leaves the old bytes or the new bytes and never half of either.

**The manifest lives outside the repository** (`$CLAUDE_PLUGIN_DATA`), because in-repo state
cannot distinguish *"removed this deliberately"* from *"never had one"*, and a bootstrap that
cannot tell them apart reinstalls itself forever. `/nexa-workspace:remove` deletes exactly the
manifest set and leaves a tombstone.

**Measured, not assumed.** `scripts/measure-settings-race.mjs` ran two live sessions: a deny
rule written by a `SessionStart` hook **did** protect the session that wrote it, and the
baseline arm refused too, which is what makes that mean anything. `model` remains startup-only
and is announced in the banner rather than hidden.

**Also fixed here, because it was the same file:** `session-start.mjs` reported *"Tests are
RED"* when the truth was *absent* — it inferred the difference from the shape of an exception,
and a missing `cwd` and a failing suite throw alike. It now asks the question directly. That is
the defect recorded in `LEARNED.md` this morning, closed the same day.

**Green:** `tests/bootstrap.test.mjs` **56/0** (49 bootstrap + 7 on the race harness's own
judgement, including that a leaking baseline can never report success) · `hooks` 276/0 ·
`spaces` 6/6 · `check.mjs` all pass · `validate --strict` ✔.
</content>

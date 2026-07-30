# 003 — Every plugin-written file lives in ~/.nexa, keyed by project path

> Stage: 3-build · Owner: jonayedahamed · Opened: 2026-07-30

**Kind:** control

---

## 0 · Discovery

Declared a control. Question five is not waived:

**What would make us stop?** If a user's `board/` or `DECISIONS.md` ever disappears from a
repository where it was committed. Migration must never move a git-tracked file, and the moment
it does, this design has traded litter for data loss and is wrong.

---

## 1 · Spec

**Problem.** Adopting the workspace writes eleven kinds of file into somebody else's repository:
`board/` with nine stage directories, `workspace.config.json`, `.claudeignore`,
`docs/DECISIONS.md`, `docs/LEARNED.md`, `templates/CARD.md`, `AGENTS.md`, `CLAUDE.md`,
`.claude/settings.json`, `.pre-nexa` backups, and an install manifest. Card 002 moved three
runtime paths out; the rest still land in the tree.

Separately, the council is a **clone inside the repository** (`.council-src/`) reached by four
symlinks, and a **fourth marketplace dependency** users must add by hand.

**Acceptance criteria.** At 5-verify each tick must carry a command or a `file:line`:

- [x] The repository receives only what cannot live elsewhere — `.nexa`, `AGENTS.md`,
      `CLAUDE.md`, `.claudeignore`, `.claude/settings.json` — asserted as an **exact set**, not
      as existence checks, at `tests/bootstrap.test.mjs:131`
- [x] Everything else lives in `~/.nexa/projects/<id>/` — `config.json`, `.nexa-id`, `board/`,
      `docs/`, `templates/`, `prompts/`, `compactions/`, `backups/`, `manifest.json`;
      `plugin/scripts/bootstrap.mjs:464`, asserted at `tests/bootstrap.test.mjs:143`
- [x] `<id>` is the project's **absolute path**, not a hash — `plugin/scripts/hooks/roots.mjs:239`,
      `tests/state-root.test.mjs:75`. `-Users-you-work-my-app`
- [x] **A renamed repository keeps its board** — the marker id finds the directory and re-labels
      it: `plugin/scripts/hooks/roots.mjs:367`, proved at `tests/state-root.test.mjs:116`
- [x] The council ships **inside the plugin** — `plugin/scripts/council/` (15 scripts, MIT),
      pinned in `.vendored-from` at `62cca6b`; `nexa-council-update` confirms it is current
- [x] `/council` and `/council-custom` are **real files** that survive installation, with no
      marketplace dependency, no clone and no escaping symlink —
      `tests/plugin-packaging.test.mjs:156` (19 assertions); `check.mjs` reports
      `council: all 5 members reachable (vendored)` and prints the pinned commit
- [x] **Every managed markdown file is in `~/.nexa`** — board, docs, templates, prompts,
      compactions and council runs. Runs were the last hold-out: `plugin/scripts/council-run.mjs`
      runs the council from the project directory. The only markdown left in a repo is
      `AGENTS.md` and `CLAUDE.md`, and §5 records the session that proved they cannot move
- [x] **Migration never moves a git-tracked file** — `plugin/scripts/bootstrap.mjs:357`, **watched failing**,
      output in §5; both directions at `tests/bootstrap.test.mjs:419`
- [x] An existing workspace keeps working untouched — each location resolves independently via
      the legacy fallback in `plugin/scripts/hooks/roots.mjs:266`; `nexa-migrate` on this repo reports all four
      candidates as `STAYS — git tracks it, so it is yours`
- [x] Every path comes from **one** module — 24 call sites across 13 files now read `paths()`;
      `grep -rE "path\.join\((ROOT|root), *'(board|docs)'" plugin/scripts` returns only
      `roots.mjs` itself

**Out of scope.** `AGENTS.md` and `CLAUDE.md` cannot move: 28+ tools read `AGENTS.md` from the
repository root and Claude Code reads project `CLAUDE.md` from the tree. This repository's own
`board/` and `docs/` are git-tracked and therefore stay — it is the source repo, not an adopted
one, and the same rule that protects a user protects it.

**Must not break.** Every hook stays exit-0 on every failure path. `isAdoptedWorkspace` must
keep answering "did the user consent" — with two markers now, neither may be guessed.

**Proved by.** `tests/state-root.test.mjs` extended, plus a new bootstrap case asserting the
three-file tree. **Guard watched failing:** migration attempted against a git-tracked `board/`
must refuse and leave it in place.

---

## 2 · Plan

**Files to touch:**

| File | Change |
|---|---|
| `plugin/scripts/hooks/roots.mjs` | `projectId` (path-derived), `paths(root)` returning every location, `councilHome()`, `.nexa` marker |
| `plugin/scripts/bootstrap.mjs` | write the new layout; migrate; refuse to move tracked files |
| `plugin/scripts/council/**` | **the council itself, vendored verbatim** — 15 scripts, MIT, pinned in `.vendored-from` |
| `plugin/scripts/council-run.mjs` | **new** — runs it from the project directory so runs land in `~/.nexa` |
| `plugin/scripts/council-update.mjs` | **new** — reports drift against upstream, re-vendors on `--apply` (replaces `council-sync.mjs`) |
| `plugin/commands/council.md`, `council-custom.md` | **real files** — thin shims onto the clone |
| `plugin/.claude-plugin/plugin.json` | drop the `all-cli-council` dependency |
| `.claude-plugin/marketplace.json` | drop it from the cross-marketplace allow-list |
| `card-gate` · `check` · `reflect` · `verify-claims` · `verify-install` · `mutation-test` · `ci-code-paths` · `graph-fresh` · `no-product-leakage` · `guard-coverage` | read paths from `roots.mjs` |
| hooks: `guard-edit` · `guard-wakeup` · `session-start` · `session-end` · `pre-compact` · `prompt-check` | same |
| `tests/*.mjs` | fixtures build the new layout; new assertions |
| `plugin/templates/AGENTS.md` | §7 and §8 describe where things live |
| `docs/DECISIONS.md` | the decision, and the vendoring risk accepted |

**Reuse ladder** (`skills/reuse-first`) — where it stopped, and what the graph said:

```
graphify explain "where does the plugin write files"
→ no single answer. 24 call sites in 13 files each build their own path:
  path.join(ROOT, 'board'), path.join(ROOT, 'docs', 'DECISIONS.md'),
  path.join(ROOT, 'workspace.config.json') — a hook, a gate and a test fixture
  each inventing the same convention separately.

Rung 2 — already in this codebase?  YES, and it is why this is one module and not a rewrite:
  · roots.mjs already owns "which tree" (projectRoot) and "may I write" (isAdoptedWorkspace),
    and gained statePath in card 002. A `paths(root)` belongs beside them.
  · bootstrap.mjs already mints and stores a stable `nexaId`, already keys its manifest by it,
    and already learned that path-keying breaks on a rename. The marker reuses that id rather
    than inventing a second identity.
  · `git ls-files` already answers "is this the user's file" — no heuristic needed.
Rung 5 — a dependency?  No. fs, path, os.
STOPPED AT RUNG 7: one module owning every location, then 24 mechanical substitutions.
```

That the scatter existed at all **is** the defect: with no single answer to "where does this
go", every caller invented one, which is exactly how fourteen files came to be written into
somebody else's repository.

**Context budget.** Too big for one window as a single pass, so it is sequenced: (A) paths
module, (B) bootstrap + migration, (C) call sites, (D) council, (E) tests. Each is independently
green.

---

## 3 · Build

**What was done.** `roots.mjs` gained `projectId`, `paths()`, `markerId`, `councilHome()` and a
self-healing `stateRoot`. `bootstrap.mjs` writes the marker and scaffolds into the project
directory, and gained `migratable`/`migrateIntoHome`. 24 call sites across 13 scripts now read
locations from `paths()`. The council became one shared clone with real command files.
`nexa-migrate` and `nexa-council-home` are new commands; `nexa-council-sync` is gone.

**Anything the spec did not say** — and the answer that was chosen:

- **A renamed repository would have orphaned its own board.** Not in the spec, and it is the
  problem this card *created*: a path-derived name is not stable, which was harmless when only a
  prompt log lived there (card 002 said so explicitly) and became data loss the moment `board/`
  moved in. Solved by making the readable name a label and the `.nexa` id the identity.
- **The manifest recorded every path relative to the repository.** With half the scaffold now in
  `~/.nexa`, those entries became `../../../../.nexa/projects/…` — correct only while the
  repository stays put. Each entry now carries the base it belongs to, and `remove()` recomputes
  the home base at removal time.
- **`nexa-migrate` is its own command, not `nexa-remove --migrate`.** They touch the same files
  and differ only in whether the files are kept; one flag should not separate "tidy" from
  "delete". Dry-run by default.
- **Bootstrap writes docs via `paths()`, not straight to home.** A repository that already has
  its own `docs/DECISIONS.md` must not get a second empty one in `~/.nexa` shadowing nothing.
- **`check.mjs` had a `+1` fudge for the council skill** that outlived its cause and made the
  README's skill count wrong by one in the *safe-looking* direction. Removed.

---

## 4 · Review  *(different model than the builder)*

| Axis | Score | Note |
|---|---|---|
| Matches the spec | | |
| Nothing invented | | |
| Nothing duplicated | | |
| Nothing extra | | |
| Fits the file | | |

**Verdict:** PASS / BACK TO BUILD

**Security gate** (`skills/security-gate`):

1. Fail closed —
2. Guard in code, not prompt —
3. Authorisation before the resource —
4. Secrets scrubbed on the way out —
5. Write confirmed before it happens —
6. Generated/third-party code privileges —
7. Tenant resolved at the edge, enforced in the DB —

---

## 5 · Verify

- [x] Acceptance criteria met, each by name — §1, every tick carrying a `file:line`
- [x] All five suites green — `for f in tests/*.mjs; do node "$f"; done` → bootstrap 103/0,
      hooks 282/0, packaging 30/0, spaces 6/6, state-root 20/0 · **441 assertions**
- [x] `node scripts/check.mjs` — all checks pass, 4 warnings, none from this card
- [x] `./plugin/bin/nexa-card-gate` — 3 cards, each carrying what its stage requires
- [x] **The migration guard was watched to fail** — output below
- [x] Decision recorded in `docs/DECISIONS.md` — *"The repository gets three files; everything
      else lives in ~/.nexa"*

**How it was broken:** `migratable()` in `plugin/scripts/bootstrap.mjs:357` was changed to `return true`
instead of `return out.trim() === ''` — the shape a careless refactor produces, since the
function still consults git and still looks like it is deciding something.

```
▸ migration into ~/.nexa — tracked files are the user's, not ours
  ❌ git tracking is read, not guessed
  ❌ REFUSES to move a tracked docs/ — it stays in the repository — weeks of decisions, silently relocated
  ❌ ...and says which, rather than half-migrating quietly — []
  ✅ ...while an untracked board/ is moved out
  ✅ ...and the card survived the move intact
  ✅ a second run refuses rather than overwriting what is already in ~/.nexa
  ✅ a non-git directory is treated as tracked, so nothing is moved
```

**The four green ticks below the three red ones are the point.** Nothing crashed, nothing was
logged, and the migration reported success — a user's committed decision history simply was not
in their repository any more. Had only the "board moves" half been asserted, this suite would
have been fully green while doing exactly that.

---

## 6 · Done

**Merged:** · **Commit:**

**Where errors surface:** `check.mjs` prints the resolved project directory and the council
clone's commit on every run.

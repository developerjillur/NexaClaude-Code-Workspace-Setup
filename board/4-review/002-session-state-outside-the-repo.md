# 002 — Session exhaust moves out of the repository

> Stage: 3-build · Owner: jonayedahamed · Opened: 2026-07-30

**Kind:** control

---

## 0 · Discovery

**Declared a control**, which waives questions 1–4. It is declared rather than argued, because
`card-gate` refused the first version of this card for making the case in prose — the exemption
has to be a field a check can read, not a paragraph a reader has to agree with.

Question five is **not** waived for a control, and that is the right asymmetry: a guard nobody
has watched fire is not a guard.

**What would make us stop?** If the move made prompts *harder* to keep deliberately, or if the
state directory turned out to collide between two checkouts of the same repository. Both are
tested below; either failing is a reason to abandon, not to patch around.

---

## 1 · Spec

**Problem.** Six paths in this tree are gitignored, which means git will neither restore nor
protect them, yet they hold the only copy of things nobody can reconstruct:

```
docs/prompts/                    every prompt ever typed — and prompts here have
                                 carried a VPS root password and an OAuth code
docs/compactions/                what each compaction was about to blur
docs/.prompt-check-state.json    the remembered count that keeps prompt-check quiet
```

Two consequences, both real rather than hypothetical:

1. **`git clean -xfd` destroys all of it and git cannot bring any of it back.** The guard
   refuses that command, but the guard is one `touch .nexa-allow-discard` away and only covers
   this repository on this machine.
2. **The secrets sit inside the directory you might zip, `git add -f`, or hand to somebody.**
   Being inside the tree is what puts them in reach of an accident.

`AGENTS.md` §7 already classifies these as *not project truth* — the `.gitignore` entries say
so in prose. They are simply stored as though they were.

**Acceptance criteria** — testable statements, not adjectives.
**At 5-verify each tick must carry its proof** — a command or a file:line. `- [x]` alone is refused:

- [x] `statePath()` resolves outside the project tree by default, and every writer uses it —
      `plugin/scripts/hooks/roots.mjs:236`; callers at `save-prompt.mjs:47`,
      `pre-compact.mjs:35`, `prompt-check.mjs:72`. Proved by `tests/state-root.test.mjs:47`
- [x] `NEXA_STATE_DIR` overrides it; a relative value resolves against cwd, not the project —
      `roots.mjs:213`, asserted at `tests/state-root.test.mjs:58`
- [x] Two checkouts of the same repository get **different** state directories —
      `tests/state-root.test.mjs:69`, and `stateId` uses `realpathSync` (`roots.mjs:196`) so
      symlinked worktrees do not collapse onto one id
- [x] Existing in-repo state is **migrated on first write**, not orphaned or duplicated —
      `tests/state-root.test.mjs:89-96`. Observed for real: `docs/prompts/2026-07-30.md` moved
      to `~/.nexa/workspaces/fusilier-013cecb0/prompts/` during this card's own test run
- [x] Migration never overwrites: a target that already exists is left alone and the legacy
      directory is kept, not deleted — `roots.mjs:245`, **watched failing**, output in §5
- [x] A writer that cannot resolve a state directory writes **nothing** —
      `tests/state-root.test.mjs:124`; `save-prompt.mjs:48` and `pre-compact.mjs:36` exit 0 on
      null, and `prompt-check.mjs:73` skips its whole section
- [x] `check.mjs` reports where state lives, and counts prompt days from the new location —
      `plugin/scripts/check.mjs:511`; observed output:
      `✅ prompts are being saved — 1 day in /Users/jonayedahamed/.nexa/workspaces/fusilier-013cecb0`
- [x] Keeping a day deliberately still works, and `AGENTS.md` documents the new command —
      `plugin/templates/AGENTS.md` §7, and `.gitignore` carries the same two-line recipe
- [x] `git clean -xfdn` — a dry run, which deletes nothing — is no longer refused —
      `guard-edit.mjs:187`; nine cases in `tests/hooks.test.mjs:444-478`, including a real
      clean chained after a dry run (still refused) and a pathspec containing `n`
- [x] **No test suite leaves anything in the developer's real state directory** — added after
      the first version did exactly that. `tests/hooks.test.mjs:1815`, **watched failing**,
      output in §5

**Out of scope.** `.council/runs/` and `.council-src/` stay where they are: both are written by
the council **dependency** (`.council-src/scripts/council.mjs:65`), not by this repository's
code, and moving them means patching a dependency we do not own. Named here so the next reader
does not think they were forgotten. `docs/DECISIONS.md`, `docs/LEARNED.md`, `AGENTS.md`,
`CLAUDE.md` and `board/` **stay in the repository** — they are committed on purpose, and in a
home directory they would become machine-local and lost on a wipe.

**Must not break.** Every hook stays exit-0 on every failure path. A writer that cannot find its
project must still write nothing — moving the destination must not become a new way to write
into the wrong tree. `check.mjs` must not warn in CI, where no state directory exists.

**Proved by.** `tests/state-root.test.mjs`, new. **Guard watched failing:** the migration
no-clobber path — a state directory that already holds a prompt log must not be overwritten by
a legacy one, asserted by deliberately staging both.

---

## 2 · Plan

**Files to touch** — name them:

| File | Change |
|---|---|
| `plugin/scripts/hooks/roots.mjs` | add `stateDir(root, name)` — resolve, migrate once, mkdir |
| `plugin/scripts/hooks/save-prompt.mjs` | `docs/prompts` → `stateDir(ROOT, 'prompts')` |
| `plugin/scripts/hooks/pre-compact.mjs` | `docs/compactions` → `stateDir(ROOT, 'compactions')` |
| `plugin/scripts/hooks/prompt-check.mjs` | state file → `stateDir(ROOT, '.')` |
| `plugin/scripts/hooks/guard-edit.mjs` | stop refusing `git clean -n` / `--dry-run` |
| `plugin/scripts/check.mjs` | report the state location; count days there |
| `plugin/templates/AGENTS.md` | §7 table + the "keep a day deliberately" command |
| `.gitignore` | the three entries become historical — say why they stay |
| `tests/state-root.test.mjs` | **new** |
| `docs/DECISIONS.md` | the decision and the rejected alternative |
| `tests/hooks.test.mjs` | **not planned** — two suites asserted the old location, and both wrote into the real repo. Isolated onto `NEXA_STATE_DIR` |
| `tests/bootstrap.test.mjs` | **not planned** — same: the adopted-workspace case checked for `docs/` |

**Reuse ladder** (`skills/reuse-first`) — where it stopped, and what the graph said:

```
graphify explain "state directory"
→ nothing. No existing indirection for writer destinations; all three hardcode path.join(ROOT, 'docs', …).

Rung 2 — already in this codebase?  PARTLY, and it is the reason this is ~40 lines not ~200:
  · roots.mjs already owns "which tree, and may I write to it" (projectRoot, isAdoptedWorkspace).
    stateDir belongs beside them, not in a new module — a fourth root resolver is the bug this
    file exists to prevent.
  · bootstrap.mjs:361 already mints a `nexaId` into workspace.config.json, and already learned
    that keying by PATH breaks on a rename. Reuse the id; do not invent a second key.
Rung 5 — a dependency?  No. `os.homedir()` and `path` cover it.
STOPPED AT RUNG 6-7: one exported function, three call sites.
```

**Context budget** — ~35k tokens: four hook files (~600 lines total), `check.mjs` §9 only,
one new test. Fits one window.

**Open questions for the human.** None blocking. One choice made without asking, recorded in
§3 because it is the kind of thing that should not be silent: the default location is
`~/.nexa/workspaces/<id>/` rather than the `~/.workspace` that was suggested, because
`.workspace` is an unprefixed name in a shared home directory and this is not the only tool
that could want it.

---

## 3 · Build

**What was done.** `stateDir(root, name)` was added to `roots.mjs` beside the two resolvers it
belongs with. It resolves `NEXA_STATE_DIR`, else `~/.nexa/workspaces/<id>/`, where `<id>` is the
`nexaId` from `workspace.config.json` when the workspace was bootstrapped and
`<basename>-<sha1(realpath)[0..8]>` otherwise. On first use it migrates the legacy in-repo
directory by rename, refusing to clobber an existing target. The three writers call it; nothing
else changed about their fail-closed behaviour.

**Two test suites had to change, and the reason is worth recording.** `hooks.test.mjs` and
`bootstrap.test.mjs` both asserted the *old* location — and both did it by writing into the
developer's real repository and restoring afterwards. That worked only while the log lived in
the tree, and it meant a crashed run left the real record truncated. They now run against a
temp `NEXA_STATE_DIR`, which is a strict improvement independent of this card, and each gained
an assertion that the repository stayed clean — checking only "it wrote somewhere" would pass a
version that wrote in **both** places.

**Anything the spec did not say** — and the answer that was chosen:

- **`~/.nexa/workspaces/` not `~/.workspace/`.** An unprefixed top-level dotdir in a shared home
  is a name collision waiting to happen, and `.nexa` matches the `NEXA_` prefix every existing
  environment variable in this repo already uses.
- **The id falls back to a path hash, which is the thing `bootstrap.mjs` learned not to do.**
  Deliberate and different: bootstrap's manifest had to survive a *rename*, because it records
  what to delete on removal. State does not — if a project moves, starting a fresh log is the
  correct behaviour, and the old one is still on disk under the old id. A `nexaId` is still
  preferred whenever one exists.
- **Migration is by `rename`, with a `copy`+keep fallback.** `rename` fails across filesystems,
  which is not exotic: this repository sits on exFAT and home does not.

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

**Security gate** (`skills/security-gate`) — one line per check:

1. Fail closed —
2. Guard in code, not prompt —
3. Authorisation before the resource —
4. Secrets scrubbed on the way out —
5. Write confirmed before it happens —
6. Generated/third-party code privileges —
7. Tenant resolved at the edge, enforced in the DB —

---

## 5 · Verify

- [x] Acceptance criteria met, each by name — §1 above, every tick carrying a `file:line`
- [x] All five suites green — `for f in tests/*.mjs; do node "$f"; done` → bootstrap 90/0,
      hooks 285/0, packaging 16/0, spaces 6/6, state-root 15/0
- [x] `node scripts/check.mjs` — all checks pass, 4 warnings, none from this card
- [x] `./plugin/bin/nexa-card-gate` — 2 cards, each carrying what its stage requires
- [x] **The new guard was watched to fail** — output below
- [x] Decision recorded in `docs/DECISIONS.md` — *"Session state moves out of the repository"*

**How it was broken:** the no-clobber condition in `roots.mjs:245` was reduced from
`fs.existsSync(legacy) && !fs.existsSync(target)` to `fs.existsSync(legacy)`, so migration
would run onto a directory that already held a live log. That is the exact data-loss shape
`4-review` caught in `bootstrap.mjs`, where a stale `.pre-nexa` backup was restored over live
settings — this is the same bug wearing different clothes, which is why it earned a fixture.

```
▸ never clobber — a live log outranks a legacy one
  ❌ the live log was NOT overwritten by the legacy one — STALE — the copy left in the repo
  ✅ ...and the legacy copy is kept rather than deleted, so nothing is lost either way

  14 passed, 1 failed

  State that moves house must arrive, and must not land on top of anything.
```

The second assertion staying green while the first went red is the useful detail: the failure
is **silent destruction, not a crash**. Nothing errored, nothing was logged, and the log that
survived was the wrong one.

### The second guard, and the defect it was written for

**This one caught a real bug in this card rather than a hypothetical.** Moving state to
`~/.nexa/workspaces/<id>/` meant every test that fires a writing hook resolves a state root like
anything else — so a temp fixture repo got a temp id and its own directory in the developer's
home. Four of them were sitting there before anyone looked. Nothing failed; the only symptom was
a listing of `~/.nexa`.

**How it was broken:** `NEXA_STATE_DIR` was removed from `fire()` in `tests/bootstrap.test.mjs`,
which is precisely what a newly written test would look like.

```
  ❌ ...and none of them left a fixture behind in the real ~/.nexa — 1 → 2 entries
  282 passed, 2 failed
```

and the leaked directory, by name:

```
$ ls ~/.nexa/workspaces | grep nexa-repo
nexa-repo-04acwJ-d59c03b8
```

Both were then removed and the isolation restored; `~/.nexa/workspaces` holds one entry, this
workspace's own.

---

## 6 · Done

**Merged:** · **Commit:**

**What we learned.**

**Where errors surface:** a writer that cannot resolve a state directory is silent by design, so
a failure surfaces at `check.mjs` §9, which prints the resolved location on every run — and
prints it as *unresolved* rather than omitting the line.

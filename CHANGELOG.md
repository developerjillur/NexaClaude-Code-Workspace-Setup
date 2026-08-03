# Changelog

Dates are the day the work landed. Every number here was read off a run, not remembered — three
README counts were wrong by hand before a check started counting the files instead.

---

## 1.20.0 — 2026-08-03

**The cost rule got its harness.** §7 has said *cost is (context size) × (turns)* since 1.19.0,
and nothing measured it — which is the exact shape this repo refuses everywhere else. Now
`nexa-tokens` (`scripts/token-cost.mjs`) prints both halves: the dearest sessions of a window,
or one session broken down by what grew its context.

Measured on the author's environment over 488 sessions: the median context was **543k on every
project**, and one session reached **17,449 turns** — 9.28B cache-read tokens. No single turn
looked alarming, which is why it went unnoticed for days. The per-turn view is the wrong view.

**The dedup is the load-bearing part.** Claude Code logs streaming updates for the same
assistant message, so a naive sum over `usage` double-counts by ~2.2x — 38,343 usage entries for
17,437 distinct messages. The first version of the script reported $28k for a $13k session. Two
assertions now hold it: a transcript with every line duplicated must report the same turn count
and the same cost as the clean one.

`guard-coverage` refused the first version — three declared rules, one exit code, and no
assertion naming two of them. Each threshold is asserted separately now.

**New in the README: what happens when you clone this onto an external drive.** The repo tracks
9 symlinks, and on exFAT both of the following look like your changes and are not —
`core.symlinks=false` checking them out as stale real copies (one clone had `plugin/skills` and
`skills` **38 files apart**, and a `git add -A` there would have committed ~130 duplicates over
the symlinks), and macOS AppleDouble `._*` sidecars, which break `git` with *non-monotonic
index* and make the packaging test see a command called `._nexa-tokens`. Both hit this repo
while 1.19.0 was being published. Recognition and repair for each.

## 1.19.0 — 2026-08-03

**The contract was costing 7,818 tokens on every turn, and most of it was history.**
`AGENTS.md` 31,274 → 11,144 chars, skill descriptions 4,801 → 2,494. **~5,609 tokens saved
per turn** in an adopted project.

Nothing was deleted. The reasoning moved to a new **`docs/WHY.md`** (~3,900 tokens), written by
`bootstrap` alongside `DECISIONS.md` and `LEARNED.md` — the tool-support matrix, the failure-mode
catalogue, why state left the repository, the 532-green-assertions story, every measurement.
**A rule has to be in context to be followed; its history only has to be findable.**

Skill descriptions now carry the trigger and nothing else. Each rationale was verified present in
its own SKILL.md body before being cut from the frontmatter.

**New: §3 Proportionality**, in the contract and in `session-start`. The gates exist for changes
that can hurt a caller; running all of them on a typo is not rigour, it is cost — and it teaches
everyone to route around the process for small work, which is when the process stops catching
anything. Three buckets: reversible-and-contained (just do it), ordinary (the board), expensive
to reverse (board + council + deploy-gate). **This governs the scope of process, never the care
taken inside it** — the tier stays pinned and `check.mjs` still refuses a downgrade.

Measured on the author's own environment the same day: cost is **(context size) × (turns)**, and
one session reached 17,449 turns at a 543k median context. Process that adds turns is not free.

Two of this repo's own guards caught the work and were obeyed rather than adjusted: `check.mjs`
refused the contract-meta cost line at 32% drift, and `plugin-packaging` refused `WHY.md` as
untracked — *"absent from a clone and from an install"*, which it would have been.

**Also fixed: `core.symlinks = false` in a working clone.** All 9 tracked symlinks had
materialised as real copies, `plugin/skills/` and `skills/` had already drifted 38 files apart,
and a `git add -A` would have committed ~130 duplicates over the symlinks — silently reverting
the contract to its 31k version. The repo was never wrong; one clone's config was.

## 1.17.1 — 2026-08-02

**A hook that printed a node stack trace where a reason belongs.** `prompt-check` spawned
`node scripts/reflect.mjs --check` relative to the PROJECT. That only resolves in a repo that
vendored the scripts, and since card 003 none do — `./nexa` runs them from the plugin cache. So in
every normal adopted project the spawn failed with MODULE_NOT_FOUND, the catch took node's first
stderr line, and the user was told, on **every prompt**:

    **The reflection is stale** — node:internal/modules/cjs/loader:1433

The reflection was not stale. The check could not run. A control that cannot run reporting a
finding instead of reporting that it could not run is the exact shape §3 exists to refuse.

- `reflect.mjs` is resolved from `PLUGIN_ROOT`, so it is found wherever the plugin is installed.
- `execFileSync` with an argument array rather than a shell string — no shell, nothing in the
  resolved path can be interpreted.
- A crash is now told apart from a verdict. `reflect --check` exits 1 with its verdict on stderr,
  which is why stderr is read; but a stderr that looks like a node stack trace reports "could not
  run" instead, because that is a different problem with a different fix.
- The message a human now sees: *"docs/LEARNED.md has no `reflected-at` marker — run …"*.

**The test for it had to be built somewhere the bug exists.** This repo vendors `scripts/`, so the
hook resolves either way here and a first attempt passed with the bug still in — measured, by
re-introducing the old spawn and watching it stay green. The fixture is now an adopted project with
no `scripts/`, which is what a real one looks like. Mutation-checked: restore the old spawn and it
fails, printing the stack-trace line.

## 1.17.0 — 2026-08-02

**The release where the guard could finally reach Conductor.** `bootstrap.decide()` refused every
repository whose `.git` was a file — which is a linked worktree *and* a submodule. Conductor hands
every agent session a linked worktree, so on a machine where the work happens in Conductor,
`./nexa bootstrap` refused everywhere, silently. No worktree ever got a `./nexa`, and both portable
adapters key on exactly that file, so the Codex and Copilot hooks fell through to their no-op branch
on every edit. Counted on the machine this was found on: zero repositories had `./nexa`. A control
that reports itself present and never runs is §10's own failure shape.

### A worktree is adopted; a submodule is still refused
- Told apart by `git rev-parse --show-superproject-working-tree` — the superproject's path inside a
  submodule, empty inside a worktree — rather than by whether `.git` is a file, which both are.
- A submodule stays refused: that scaffold is content the superproject tracks, and it would show up
  as a dirty submodule in a repository whose owner never asked for it.
- The refusal it replaces was correct when written. Its premise — *"adopting writes `board/` and
  `docs/` into a checkout you may delete tomorrow, taking a card's history with it"* — expired when
  card 003 moved session state to `~/.nexa/projects/<id>/`. Measured: a bootstrap now writes six
  regenerable files into the checkout and no `board/`, and card history survives
  `git worktree remove`. Recorded in `docs/DECISIONS.md` as superseding, not by rewriting it.

### The fixture that had never tested what it named
- `tests/bootstrap.test.mjs` now builds a **real** `git worktree add` and a **real**
  `git submodule add`. The one it replaces wrote a `.git` file by hand pointing at a path that did
  not exist, so `rev-parse --show-toplevel` failed, `decide()` returned "not a git repository", and
  the worktree rung was never reached — the assertion passed for weeks without exercising it.
- Mutation-checked both ways: removing the submodule refusal fails the submodule test; restoring the
  old blanket refusal fails the worktree test.

### Vendored council re-pinned
- `plugin/scripts/council` moves `c33f65c` → `89dfcde`, matching `all-cli-council` upstream HEAD.
  `plugin-packaging.test.mjs` was failing on exactly this — it asserts the vendored copy is accepted
  quietly, and a copy behind upstream is not.

## 1.7.0 — 2026-07-31

**The release where the workspace stopped only reading its own paperwork.** Two independent
audits and a four-vendor council reached the same sentence from different directions: *every
gate inspects artifacts — cards, comments, citations — and none of them ever runs the
application*. An agent demonstrated a card whose code took the tenant from an `x-org-id`
header, interpolated it into SQL, and handled a Stripe webhook with no signature check —
walking `1-spec → 6-done` with every gate green.

### `nexa-prove` — the first gate that runs your software

`scripts/prove-invariants.mjs` + `templates/invariants.example.json`. Four invariants whose
failure costs money — `tenant`, `idempotent`, `authz`, `migration` — each a command *you* write
that exits non-zero when the invariant is violated. Verified against a real cross-tenant leak
in running code: refused, then held once the predicate was added.

**An empty `invariants.json` exits 2.** "No invariants declared" is not "no invariants
violated" — the fourth time this workspace has had to learn that a tool which examined nothing
must not return the code meaning it examined everything.

### The board became a state machine with a transition function

- **`plugin/pipeline.json`** — nine states, sixteen transitions, guards as data. The stage list
  had been copy-pasted into eight places and two copies had already drifted: `reflect` iterated
  eight stages while `check` iterated nine, and `card-gate`'s requirements were cumulative while
  `check`'s were not, so the two gates disagreed about the same board and CI ran the looser one.
- **`nexa-move`** — refuses a `from → to` the pipeline does not define *before* running any
  guard, executes that transition's guards, rolls back if one refuses. Measured before it
  existed: `git mv board/1-spec/001.md board/5-verify/001.md` exited 0 and crossed four gates.
- **`card-demands.mjs`** — one requirement table both the gate and the mover read. The guard
  names in `pipeline.json` had been decorative: `nexa-move` ran `card-gate`, which implements
  none of them, so a card with no spec section moved into `2-plan` and the mover printed a tick.

### The gates stopped reporting green when they had not run

The worst defect in the release, and it shipped in every installed copy: `check.mjs` spawned
`path.join(ROOT, 'scripts', …)` — a path an adopted project does not have. The child never
started, `JSON.parse(r.stdout || '{}')` became `{findings: []}`, and zero findings printed as a
tick. **The three strongest gates passed having inspected nothing.**

- `runGate()` distinguishes ran-and-passed from could-not-run, at every call site
- `depth-check` reads `codeDirs` instead of a private product's hardcoded paths, sees TS/TSX,
  and exits 2 when it scanned nothing
- `guard-coverage` scans the adopter's tree, and zero controls is no longer full coverage
- `mutation-test` exits 2 with no mutations, where it printed "this is not a pass" and exited 0

### The blank template satisfied seven of nine gates

Including `graphify explain`, which is `guard-edit`'s only content condition before it permits
writes to product code — so `cp templates/CARD.md board/3-build/` unlocked `code/`. And the
6-done "pasted output of a guard watched failing" was satisfied by the template's own prose
*explaining that rule*. Fixed by one idea applied everywhere: **a rule quoted is not a rule
satisfied.** `card-gate` now refuses the template's italic hints as answers, too.

### Review, security and operations

- `Verdict: BACK` — a **failed** review — satisfied the 5-verify gate; scores accepted 1/5.
  Now `PASS` only, and every axis must be 3+, not just the first row
- `reviewed-by` is required at 5-verify. §10 says "no model reviews its own work" in four
  places and nothing recorded who did
- `kind: migration` **adds** requirements instead of waiving them — expand/contract and
  mixed-version at 2-plan, a rehearsed data restore at 5-verify. `deploy-gate` §3a: a tag
  restores code, never rows, and §11's "never fix forward" is the *cause* of the outage when a
  schema has moved
- `7-operate` became a real stage — requirements, a move row, a `/deploy` handoff
- **`scan-secrets` missed 8 of 11 real credential formats**, and its history pass was dead three
  ways: a backtick killed the shell, `-----BEGIN` was read as an option, and `re.source` drops
  the `/i` flag. A `DB_PASSWORD` committed and deleted was caught in the tree and missed in
  history — the exact case the file says it exists for. Now 0 of 12 missed

### Adopted from the ecosystem

Read from [shanraisshan/claude-code-best-practice](https://github.com/shanraisshan/claude-code-best-practice):

- **`sandbox.filesystem.denyWrite`** — a categorical boundary under the enumerated guard.
  `guard-edit` matches command text and cannot be complete; the sandbox refuses at the
  filesystem layer, so `python3 -c`, `node -e`, `perl -i` and `git apply` all fail
- **`disableBypassPermissionsMode`** — bypass mode skipped every permission rule the bootstrap
  writes. A workspace whose thesis is "gates refuse" shipped nothing against the switch that
  turns them off
- **`effortLevel: xhigh`** replaces the superseded `MAX_THINKING_TOKENS`; **`fallbackModel`**
  so a rate limit does not stall the one gate that runs the app
- **`SessionEnd` wired** — the source documents 28 hook events; this used 6. `session-end.mjs`
  had been dead code referenced only by a false README line
- Credential rules emit the documented `//` absolute form when `codeDirs` escapes the project
  root — `Read(./../my-app/.env)` matched nothing in the documented sibling-repo setup

### The audit of the audit

`kill-audit` mutated a file nothing under test was reading, so eleven rules reported SURVIVED
while their fixtures worked. It now mutates every distinct copy and journals all of them.
**33 caught, 1 survived, 0 unresolved** — and the survivor was the rule added that morning with
nothing watching it.

`docs/LEARNED.md` records the pattern across all nine defects introduced by this release: *a
document asserting a check, and nothing performing it.* Every one was caught by a control or a
reviewer, and not one by the author.

---

## 1.1.0 — 2026-07-29

**The release that makes this installable into somebody else's project.** Two themes: the
package stopped knowing where it came from, and the controls started saying *which rule*
refused.

### Adoptability — this package no longer knows its own birthplace

- **CI named a private repository in three jobs**, with hardcoded `code/src`, `code/tools`,
  `code/server.js`. A stranger cloning this got three jobs that could only ever fail. Replaced
  with `scripts/ci-code-paths.mjs`, which resolves your code from `workspace.config.json` or an
  optional `CODE_REPO` variable, and distinguishes three states — present, legitimately absent,
  and **configured-but-missing, which refuses**. The old CI also carried the failure this
  workspace exists to prevent: `grep` over a missing directory exits 2, which reads as "no
  matches found", so a hygiene job went green having scanned nothing.
- **`mutation-test` shipped four mutations against files only the original product has.** For
  anyone else they resolved to nothing, it printed "skipping", and it **reported success having
  tested zero invariants**. Mutations are data now (`mutations.json`, with
  `templates/mutations.example.json` as a worked example), and an empty run says *"nothing was
  tested"* instead of printing a tick.
- **`scripts/no-product-leakage.mjs`** — new, and in the gate and CI. Seven word classes, an
  allowlist with written reasons, and it reports what it scanned so an empty run cannot read as
  a clean one. It states its own ceiling: it matches **words**, so a leaked assumption about
  directory layout walks straight past — which is exactly how the `mutation-test` leak got in,
  demonstrated on this repo rather than argued about.
- Two skills taught real lessons in one vendor's vocabulary; both rewritten to keep the lesson
  and drop the name. Credential *formats* stay in the scanner — `AC…` SIDs are a standard shape
  any project can leak, and removing them to remove a word would make the scanner worse for
  everyone.
- The council transcripts left the repo (1.3 MB of somebody else's deliberations). One is kept
  as `docs/examples/council-run.md`; `.council/runs/` is gitignored, because your runs are
  yours.

### Per-rule coverage — the exit code stopped being the only answer

- **`guard-coverage` counts rules, not control names.** Counting by name is what let a **prose
  comment** stand in as coverage for the secret scanner: the string "scan-secrets" appeared in a
  comment inside another control's test block, and the collector counted that block's assertions
  as its fixtures. It reported ✅ for a control with **no test at all**, whose entire git-history
  pass had never worked.
- Controls opt in with `// @rules …`. Each declared id must appear **in a fixture and in the
  control's own source** — a rule declared and never emitted is a coverage requirement satisfied
  by a fixture that can never fire. Undeclared controls keep the old name-based check, so
  nothing fails open while this rolls out, and the report says how many have opted in.
- **11 of 15 controls declared, 50 rules individually covered.** It found gaps the per-file
  check could not see: `depth-check`'s `placeholder-value` rule had **no fixture at all** (five
  well-covered siblings made the control read as tested), and `graph-fresh` had seven kinds
  behind five assertions that all said only `=== 1`.

### `scripts/kill-audit.mjs` — new

Deletes **one real rule at a time** and runs everything. Not *"is this control watched?"* but
*"is each of its rules watched?"* — a control can be watched and still have nine of its ten
rules unwatched.

**First run: 7 caught, 4 survived.** Every survivor had a green fixture. One diagnosis, and it
recurred six times in a day including twice while being fixed:

> **A fixture that differs from the passing case in more than one way proves neither.**

The rule written for a reported `/loop` incident — matching its reason verbatim — could have
been deleted in silence, because the fixture carried `delaySeconds: 300` and the short-delay
rule blocked it identically.

It was then **a survivor of its own audit**: `--only=<typo>` printed "0 caught, 0 survived" and
exited 0. Two council members read that off the source independently; one made it an explicit
falsifier, so it was run rather than argued about. Four fail-opens closed — skips now fail the
run, unknown ids exit 2, a timeout is *"could not complete"* rather than *"caught"*, and every
run prints which refusing controls carry **no** mutation.

**23 mutations across 9 controls, 23 caught.** That is a claim about the nine measured; the
other five are named on every run.

### `scan-secrets` — the history pass had never worked

It handed JavaScript regex source to `git grep -E`. **POSIX ERE has no `\b`**, so git rejected
nine of the ten patterns, the error was swallowed, and it printed `history N commits scanned` —
success, having searched nothing, since the day it was written.

Found the hard way: deleting the whole history pass changed nothing, *because deleting something
that does nothing is invisible by construction*. The bug surfaced only when the fixture that
pass should satisfy was written, and failed against the **unmutated** file.

Fixed with `-P` where git has PCRE, and by dropping the `\b` anchors where it does not — which
matches **more**, never less, the only safe direction for a scanner. Both paths have fixtures;
the fallback via a `NEXA_SCAN_NO_PCRE=1` seam, because a fallback that only runs on machines
nobody here owns is one nobody has watched work.

### Removed

- **`mutate-controls`**, on measurement rather than taste. It covered 5 controls to
  `kill-audit`'s 9 — a strict subset — and by the end it was **silently skipping two of its
  five** because their code had moved and its patterns had not, reporting "5 caught, 0 survived"
  having tested three.

### The install path, which nobody had ever tested

Everything below was found by **doing the install into a scratch project**, not by reading the
script. The workspace was correct on the machine it was written on and wrong everywhere else —
the same shape as three earlier defects here.

- **`setup.sh` was committed mode `100644`.** The first line of the install instructions
  answered `permission denied` on every fresh clone. Asserted against the **git index** now, not
  the working tree: a local `chmod +x` fixes your copy and nobody else's, which is exactly how
  it survived a public release.
- **The test suite only passed in the default configuration — the one nobody installs into.**
  `PRODUCT` was hardcoded to `code/src/…` and thirteen shell fixtures spelled it out inline, so
  the moment somebody ran `./setup.sh --code ../their-repo` the suite reported **26 failures**,
  every one of them the guard behaving correctly on a path that was no longer product code. A
  new user's first experience was: install, watch the tests fail, be told the workspace is "not
  ready". Everything reads `workspace.config.json` now, exactly as the guard does.
- **`setup.sh` judged a suite by scraping its stdout** for `N passed, M failed`, ignoring the
  exit code. `guard-paths-with-spaces.mjs` prints `6/6 passed`, so **every install reported a
  green suite as a failure.** The inverse was equally available and worse — demonstrated rather
  than argued:

  ```
  $ printf 'console.log("7/7 passed"); process.exit(1);' > tests/zz-liar.mjs
  $ node tests/zz-liar.mjs; echo $?
  7/7 passed
  1
  ```

  The old parser reads that as ok. Same shape as the CI job that grepped a missing directory
  and read exit 2 as "no matches found". **A verdict is an exit code.**

Verified end to end, from GitHub, into a fresh project: `13 ok · 1 skipped · 0 failed`, and the
guard refuses an edit to the new project's source on the spot.

### Also

- `verify-claims` refused a card citing `npm run test:offline` — its own product's test command,
  run and pasted — because it consulted only the workspace's `package.json`. A card documenting
  the exact command somebody ran was called a false claim. Both `package.json` files are
  consulted now, and the refusal names which it read.

```
hooks.test.mjs   265 passed, 0 failed
kill-audit        23 caught, 0 survived, 0 unresolved, of 23 selected
guard-coverage    11 of 15 controls declare rules, 50 rules named
check.mjs         all pass
no-product-leakage  0 findings
```

---

## 1.0.0 — 2026-07-28

First public release. Extracted from a working product, with the record of its own mistakes
intact — that record is the point, not an apology for it.

Hooks that refuse rather than advise, a nine-stage board with WIP=1, skills that load
themselves, a deploy gate, and a multi-vendor council fetched from GitHub at setup rather than
vendored.

**The founding observation, and the reason for everything above:**

> Ten controls were built. **Every one was wrong on its first version, and every one was wrong
> in the same direction — it failed *open*.** Not one was found by the case it was built to
> catch. Every one was found by testing the case it was supposed to stay **silent** on.

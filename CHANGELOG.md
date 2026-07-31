# Changelog

Dates are the day the work landed. Every number here was read off a run, not remembered — three
README counts were wrong by hand before a check started counting the files instead.

---

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

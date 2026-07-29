# Changelog

Dates are the day the work landed. Every number here was read off a run, not remembered — three
README counts were wrong by hand before a check started counting the files instead.

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
- **`setup.sh` was committed mode `100644`.** The first line of the install instructions
  answered `permission denied` on every fresh clone. Fixed, and asserted against the **git
  index** rather than the working tree — a local `chmod +x` fixes your copy and nobody else's,
  which is precisely how it survived.
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

### Also

- `verify-claims` refused a card citing `npm run test:offline` — its own product's test command,
  run and pasted — because it consulted only the workspace's `package.json`. A card documenting
  the exact command somebody ran was called a false claim. Both `package.json` files are
  consulted now, and the refusal names which it read.
- New assertions for the install path: `setup.sh` executable in the index, every `npm run` the
  README instructs is a real script, every `node <script>` it instructs exists in a bare clone.

```
hooks.test.mjs   262 passed, 0 failed
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

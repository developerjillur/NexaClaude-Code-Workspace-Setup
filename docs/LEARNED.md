# Learned

Patterns that turned out to be true **in this repository**, each earned by getting it wrong
first. Not general advice — advice you can read anywhere is not worth a file.

`scripts/reflect.mjs --check` warns when this has gone stale relative to recent commits: work
that taught nothing is either trivial or unexamined, and it is usually the second.

---

## Seeded from the project this workspace was built in

Two entries, kept because they were measured rather than reasoned, and because they are about
*this workspace's own controls* rather than about any product.

### Every control was wrong on its first version, in the same direction

**Six of six**, and the seventh was found while writing this file. Each one *failed open* — it
passed when it should have refused, and a passing check is indistinguishable from a correct
one. None was found by the case it was built to catch; **every one was found by testing the
case it was supposed to stay silent on.**

The concrete instance worth remembering: a guard against `git reset --hard` was written as
`reset\s+(?:-[^\s]+\s+)*--hard`. The optional flag group swallowed `--hard` itself, so the
literal never matched and **the exact command it was written to stop went straight through.**

> **Write the false-positive case before writing the check.** If you only run the case it
> should catch, a check that always passes looks identical to a check that works.

### Green is a count until something has been broken on purpose

A suite reported hundreds of passing checks for weeks with no evidence that any guard had ever
been *seen* to fire. Deleting an invariant and confirming the suite went red found one that
could be removed with everything still green.

> The acceptance question is not *"does it pass"* — it is **"has anyone watched it fail?"**

---

<!-- Yours below. -->

<!-- reflected-at: INITIAL -->

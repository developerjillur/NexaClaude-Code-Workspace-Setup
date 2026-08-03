---
name: reuse-first
description: Run before writing any new code, adding any dependency, or creating any file.
---

# Reuse first

**The best code is the code you never wrote.** Adapted from
[ponytail](https://github.com/DietrichGebert/ponytail), whose measured result against a real
repository was **~54% fewer lines, ~20% lower cost, ~27% faster, with safety fully retained.**

Walk the ladder in order. **Stop at the first rung that answers.** Do not skip to the bottom
because you already know what you want to write — that is the failure this exists to catch.

## The ladder

**1 · Does this need to exist at all?**
Re-read the card's acceptance criteria. Not the request — the criteria. A feature nobody
asked for is the cheapest thing to delete now and the most expensive later.

**2 · Is it already in this codebase?**
```bash
graphify explain "<what it does, in plain words>"
```
**Query the graph, do not grep.** Grep finds names; the graph finds behaviour. This rung
catches the "wrote the same thing twice" failure, which is invisible to the author by
definition.

**3 · Is it in the standard library?**
Node 22 is large. `node:sqlite`, `node:crypto`, `Intl`, `fetch`, `structuredClone`. This
project ships **one npm dependency**. That is a feature, and it is defended here.

**4 · Is it a platform feature?**
The browser, the OS, Postgres, SQLite FTS5. A `CHECK` constraint beats a validator. An index
beats a cache.

**5 · Is it already installed?**
Check `package.json` before adding a sibling of something already there.

**6 · Can it be one line?**
Three lines inline beats a new file with an export and a test.

**7 · Only now: the minimum that satisfies the criteria.**
Not the general version. Not the configurable version. The one the card asked for.

## What never gets cut

Laziness applies to features, never to safety. **Non-negotiable regardless of how much code
it adds:**

- input validation on anything crossing a boundary
- error handling that says what failed
- the security rules in `skills/security-gate`
- **tests, including the one that watches the guard fail**

## Recording it

If a rung stopped you, say so in the card:

```
Reuse ladder: stopped at rung 3 — `node:crypto.timingSafeEqual` already does this.
```

If you went all the way to 7, say what you checked. **A ladder that is always silent is a
ladder nobody ran.**

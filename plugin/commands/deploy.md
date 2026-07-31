---
description: Deploy to production, with the security scan and every live check that has caught a real hole
---

Run `skills/deploy-gate`. **All six steps, in order, no skipping.**

Deployment is the only action here a customer can be hurt by, and the only one an edit cannot
undo.

**Before starting, confirm out loud:**
- which card this deploys, and that it is in `5-verify` or `6-done`
- that `vibesec scan` is clean (baseline: 0 issues)
- that a rollback tag exists **for the image currently live**
- **whether this release migrates the schema.** If it does, the tag is not a rollback — take
  the verified `pg_dump` snapshot in `skills/deploy-gate` §3a first, and confirm the card is
  `kind: migration` with its expand/contract split answered

**After finishing, report:**
- the eight live checks, with their actual status codes
- the in-container test count
- the rollback tag, by name
- **and move the card to `7-operate`.** Deploying is not finishing: the card closes once
  production has answered `skills/operate-after-done`, and `card-gate` refuses `7-operate`
  without an observation and a feed-back line

**If any check fails: roll back, then open a card.** Never fix forward on production — a
hotfix with no card is how the same bug ships twice. **The exception is a migrated schema**,
where rolling the code back is what corrupts the data; §3a says which case you are in.

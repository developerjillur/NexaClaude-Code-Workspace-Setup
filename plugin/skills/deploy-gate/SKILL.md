---
name: deploy-gate
description: Run before every deployment, without exception. Security scan, test suite, and the live checks that have caught real holes in this project. Use whenever the words deploy, ship, push to production, or redeploy appear.
---

# Deploy gate

**Every deployment, no exceptions.** A deploy is the one action in this project that a
customer can be hurt by, and it is the only one that cannot be undone by an edit.

## 0 · Secrets — before anything leaves this machine

```bash
node scripts/scan-secrets.mjs      # working tree AND full git history
```

**History, not just the tree.** A secret removed in a later commit is still in the repo
forever — `git rm` is not a delete, and once it has been pushed it is public whatever the
repo's visibility says, because the fix is a force-push nobody performs in time.

Field data: **AI-assisted commits leak secrets at 2× the human rate** (3.2% vs 1.5%), and
1,400 scanned vibe-coded apps exposed 400+ secrets.

This check exists because a **council member dissented**. Four of five named the deploy path as
the biggest remaining exposure; one said *"secrets in git history — and your first planned
action is the one that publishes them."* The history was clean. Nothing had been looking.

**It found two on its first run, in this workspace's own tests** — fixtures copied from a real
prompt. The fix was to make the values synthetic, not to allowlist them.

## 1 · Security scan — `vibesec`

```bash
cd code && vibesec scan src tools server.js
```

Catches what AI-written code gets wrong most often: **secrets** (OpenAI, AWS, Supabase,
Firebase, RSA, JWT), **injection** (SQL, NoSQL, XSS, and prompt injection), **dangerous
functions** (`eval`, `child_process.exec`), and **weak crypto** (MD5/SHA1, insecure random).
Local static analysis — no cloud round-trip, and it never executes the code.

**Any finding stops the deploy.** Baseline as of 2026-07-27: **0 issues.** If that number
moves, something we wrote moved it.

## 2 · The suite

```bash
cd code && npm run test:offline    # 427 checks, all of them
```

**Never `test:live` here** — it spends subscription tokens and a deploy is not the place to
discover that.

## 3 · Tag a rollback before building — **and snapshot the data**

```bash
ssh "$DEPLOY_HOST" \
  'docker tag call-agent:live call-agent:rollback-'$(date +%Y%m%d-%H%M)
```

**Before**, not after. A rollback tag you meant to create is not a rollback tag.

### 3a · If this release contains a migration, the tag is not a rollback

**A tag restores code. It does not restore rows.** Run the image rollback in step "If anything
fails" against a database whose schema has moved and the result is not a failed deploy — it is
corrupted data, written by an old application against a shape it does not understand. This is
the single most expensive way the rest of this document can be followed correctly and still
cause an outage.

So a release carrying a schema change owes three things, and the card owes them too — declare
`kind: migration` and `card-gate` will refuse the card without them:

```bash
# BEFORE the migration runs, and verified — an untested backup is a hope
ssh "$DEPLOY_HOST" 'pg_dump -Fc "$DATABASE_URL" > /backups/pre-$(date +%Y%m%d-%H%M).dump'
ssh "$DEPLOY_HOST" 'pg_restore --list /backups/pre-*.dump | head -1'   # it is readable
```

1. **Expand, then contract — in two separate releases.** Add the new column, write both, ship.
   Only once the previous version is gone does the destructive step ship. A rename in one
   deploy is a migration that cannot be rolled back, and no amount of care at deploy time
   recovers it.
2. **Mixed-version operation is the normal state during a rolling deploy**, not an edge case.
   The previous app version is still serving, and its queued jobs are still in the queue. Both
   schemas must work until the old version is drained.
3. **A rehearsed restore**, on a copy, before the deploy — not the first time under pressure.

**If the release is expand-only, the image rollback in "If anything fails" is safe as written.**
If it is not, roll back the *code* and leave the schema — then fix forward on the data, which is
the one case where this document's own rule is wrong to follow. Say which of the two applies in
the card before deploying, because the answer is not discoverable at 3am.

## 3b · Prove the invariants against a running instance

```bash
nexa-prove          # exits non-zero if any declared invariant is violated
```

**This is the only step that runs your application rather than reading about it.** A suite
proves your code behaves as you think; these prove the four things whose failure costs money
regardless of what you think — a cross-tenant read, a double charge, an open endpoint, and a
migration the previous release cannot survive.

It exits 2 when nothing is declared, and that is deliberate: *"no invariants declared"* is not
*"no invariants violated"*. `nexa-prove --list` prints the four and
`plugin/templates/invariants.example.json` is a worked example.

## 4 · Build, recreate, and re-run the suite *inside the image*

```bash
docker build -q -t call-agent:live . && docker compose up -d --force-recreate
docker exec $(docker ps --filter name=call -q | head -1) npm run test:offline
```

**The in-container run is the one that matters.** This project has already been bitten: two
tests passed locally and failed in the container because they read the host's environment,
and the deploy gate was unusable in the deployed environment for exactly that reason.

## 5 · The live checks that have each caught a real hole

Write out your own table — one line per route, with the status it MUST return unauthenticated.
The shape that matters is that every privileged route appears with the credential removed:

```
/                          → 200
/api/<read>                → 401
/api/<write>               → 401
/<socket>  (no cookie)     → 401     ← an unauthenticated socket was accepted and held open
/<socket>  (evil Origin)   → 403
/<webhook> (unsigned)      → 403
/<webhook> (?trusted=1)    → 403     ← a query-string flag was once shell access
/<webhook> (forged sig)    → 403
```

**The two annotated lines are holes that actually shipped** in the project this was extracted
from. They are not hypothetical: a socket that authenticates on the first frame instead of the
handshake, and a "trusted" query parameter that a caller supplies. Yours will be different, and
you will only find them by curling the route with the credential removed.

## 6 · The boot banner

```bash
docker compose logs --tail=20 | grep -E "Budget|Allowlist|bind first"
```

Read it, do not skim it. **A deploy-time bug was found exactly here**: the banner printed an
allowlist read from `process.env` (empty) while the runtime read the same setting from the
database (populated) — so it announced "everyone gets the restricted mode" while users were
getting the unrestricted one. **Two sources for one setting, and the banner reported the one
nothing used.**

## If anything fails

**Roll back. Do not fix forward on production** — *unless this release migrated the schema.*
See §3a: rolling code back onto a migrated database corrupts data rather than restoring service.
Check that first; it takes ten seconds and it is the difference between an incident and a
disaster.

```bash
# stateless release, or an expand-only migration — safe
docker tag call-agent:rollback-<stamp> call-agent:live && docker compose up -d --force-recreate

# a release with a destructive migration — the code goes back, the schema does NOT
# restore from the §3a snapshot only if the data is already wrong; otherwise fix forward
```

Then open a card. **A hotfix with no card is how the same bug ships twice.**

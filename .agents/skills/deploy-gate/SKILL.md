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

## 3 · Tag a rollback before building

```bash
ssh "$DEPLOY_HOST" \
  'docker tag call-agent:live call-agent:rollback-'$(date +%Y%m%d-%H%M)
```

**Before**, not after. A rollback tag you meant to create is not a rollback tag.

## 4 · Build, recreate, and re-run the suite *inside the image*

```bash
docker build -q -t call-agent:live . && docker compose up -d --force-recreate
docker exec $(docker ps --filter name=call -q | head -1) npm run test:offline
```

**The in-container run is the one that matters.** This project has already been bitten: two
tests passed locally and failed in the container because they read the host's environment,
and the deploy gate was unusable in the deployed environment for exactly that reason.

## 5 · The live checks that have each caught a real hole

```
/                        → 200
/api/status              → 401
/api/calls               → 401
/call    (no cookie)     → 401     ← an unauthenticated socket was accepted and held
/call    (evil Origin)   → 403
/voice   (unsigned)      → 403
/twilio  (?trusted=1)    → 403     ← this was once shell access from a query string
/twilio  (forged ticket)  → 403
```

**Every line is a hole that shipped.** They are not hypothetical checks.

## 6 · The boot banner

```bash
docker compose logs --tail=20 | grep -E "Budget|Allowlist|bind first"
```

Read it, do not skim it. **A deploy-time bug was found exactly here**: the banner printed
`process.env.TWILIO_ALLOWED_CALLERS` (empty) while the runtime read the database
(populated) — so it announced "callers get the restricted agent" while a caller was getting
the full one.

## If anything fails

**Roll back. Do not fix forward on production.**

```bash
docker tag call-agent:rollback-<stamp> call-agent:live && docker compose up -d --force-recreate
```

Then open a card. **A hotfix with no card is how the same bug ships twice.**

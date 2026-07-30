---
description: Convene the council exactly as you specify it — you pick the members, mode, files and budget, and it runs that without weighing whether it was worth it.
argument-hint: <the question> + how you want it run, in plain words ("only codex and gemini", "grade it out of 10", "use lenses", "20 minutes", "wait for it")
---

The user asked for a council **explicitly**, and said how they want it run:

**$ARGUMENTS**

> **The council ships inside this plugin** (`scripts/council/`, MIT, pinned in
> `.vendored-from`). Nothing to fetch, no second marketplace, no clone. `nexa-council-update`
> reports drift against upstream and refreshes it.

## The only thing that differs from `/council`

`/council` weighs whether a council earns its time and **may talk the user out of it**. This one
does not. They typed it deliberately: the skill fires on its own judgement, `/council` on yours,
this on theirs. So the *"is the answer knowable?"* gate does **not** apply — skip it. If you think
a `grep` would settle it, say so in one sentence *after* the run is going.

Everything else is identical, and lives in one place: **`skills/council`** holds how to read a
result, what to weigh, and what to record. Follow it from there. It is deliberately not restated
here — two copies of one doctrine drift, and these two had already done so.

## Put the question in a FILE, never in the shell

A question with quotes, backticks, `$`, or a newline in it is mangled by the shell before the
council ever sees it — and the damage is silent, because a mangled question still gets a fluent
answer.

```bash
# 1. write the question to a file — no quoting, no escaping, no expansion
cat > /tmp/council-q.txt <<'COUNCIL_EOF'
<the question, verbatim, however many lines it takes>
COUNCIL_EOF

# 2. run it from there
nexa-council --question-file /tmp/council-q.txt --context <file>... --events

# 3. watch it, in another terminal
nexa-council-watch
```

## Honouring what they actually asked for

| They said | You pass |
|---|---|
| "only codex and gemini" | `--members codex,gemini` |
| "grade it out of 10" | `--rubric` |
| "use lenses" / "different angles" | `--lenses` |
| "let them revise" | `--revise` |
| "20 minutes" | `--timeout 1200` |
| "wait for it" | run in the foreground and say it will be minutes, not seconds |

**If a request cannot be honoured, say which and why before starting** — not after twenty
minutes. A member that fails containment is refused unless they also pass
`--allow-uncontained`, and that flag admits a member measured able to write to any absolute
path. Say that out loud rather than quietly adding it.

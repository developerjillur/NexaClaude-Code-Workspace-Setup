# 004 — Autopilot: continue an unattended session, and know what not to answer

> Stage: 3-build · Owner: jonayedahamed · Opened: 2026-07-31

**Kind:** control

---

## 0 · Discovery

Declared a control. Question five is not waived:

**What would make us stop?** If autopilot ever answers a question that was routed to the human
*because it was theirs* — a push, a deletion, a credential, a spend. One such answer is worth
more than every unattended turn it saves, and the response is to delete the feature rather than
tune the classifier.

---

## 1 · Spec

**Problem.** A long run stalls the moment Claude finishes a turn waiting on a trivial answer —
"shall I continue?", "which file first?". The human is not there, and the session sits idle.

**Measured, on the real CLI** (this is what makes it buildable): the `Stop` hook receives

| Field | Verified value |
|---|---|
| `last_assistant_message` | the response text — `"pong"` in the probe |
| `transcript_path` | full `.jsonl` history |
| `stop_hook_active` | `false` normally, `true` inside an auto-continue |
| `permission_mode`, `cwd`, `session_id`, `background_tasks` | context |

and `{"decision":"block","reason":X}` makes **X the next instruction**. Codex ships a `Stop`
hook at a 900 s timeout, so a Sonnet call inside one is affordable.

**Out of scope, and it is the headline.** *"Wait one minute for the user, then act"* **cannot be
built.** `Stop` fires the instant the turn ends, before the human can type; the hook is a
subprocess with no channel to the TUI, so it cannot observe typing; and sleeping freezes the
session for that whole minute with input queued invisibly. Autopilot is therefore an **explicit
mode**, not a timer that races the human.

**Acceptance criteria.** At 5-verify each tick carries a command or a `file:line`:

- [x] **Off by default**, and cheap when off — measured at **22 ms**, asserted under 1500 ms
      (`tests/autopilot.test.mjs:106`)
- [x] `nexa-autopilot on|off|log|status` toggles it; state and log are in the project directory
      (`plugin/scripts/autopilot-ctl.mjs`)
- [x] It continues only when waiting on a trivial step — `looksLikeWaiting`
      (`plugin/scripts/hooks/autopilot.mjs:82`), 4 assertions both directions
- [x] **A hard refusal list vetoes before any model is asked** —
      `plugin/scripts/hooks/autopilot.mjs:47`, 13 refusals + 4 allows asserted, **watched
      failing** in §5
- [x] `stop_hook_active` short-circuits — `plugin/scripts/hooks/autopilot.mjs:118`, asserted at
      `tests/autopilot.test.mjs:117`
- [x] A **budget** caps consecutive continues and hands back — `plugin/scripts/hooks/autopilot.mjs:147`; a spent
      budget is asserted to stop and to log why
- [x] The Sonnet child cannot re-enter the hook — `NEXA_AUTOPILOT_CHILD`, `plugin/scripts/hooks/autopilot.mjs:107`
- [x] **Every decision is logged** with its reason — asserted on a real refusal
- [x] Any failure exits 0 — observed for real: with no login the child returned
      `Not logged in`, and the hook logged `model declined` and exited 0

**Must not break.** The session, ever. Exit 0 on every path except a deliberate block.

**Proved by.** `tests/autopilot.test.mjs`, new. **Guard watched failing:** remove the refusal
list and confirm a `git push` question is auto-answered.

---

## 2 · Plan

| File | Change |
|---|---|
| `plugin/scripts/hooks/autopilot.mjs` | **new** — the Stop hook: gate, veto, decide, log |
| `plugin/scripts/autopilot-ctl.mjs` | **new** — on/off/status/log |
| `plugin/bin/nexa-autopilot` | **new** — wrapper |
| `plugin/commands/autopilot.md` | **new** — the slash command |
| `plugin/hooks/hooks.json` | wire `Stop` |
| `tests/autopilot.test.mjs` | **new** |
| `plugin/scripts/check.mjs` | report autopilot state, since a mode you forget is on is a hazard |
| `docs/DECISIONS.md` | the decision and the part that cannot be built |

**Reuse ladder** (`skills/reuse-first`) — where it stopped, and what the graph said:

```
graphify explain "stop hook"
→ one implementation on this machine: codex's stop-review-gate-hook.mjs. It BLOCKS on a
  review verdict — same mechanism, opposite purpose (it stops a turn; this resumes one).
  Nothing here to reuse beyond the contract, which was measured rather than copied.

Rung 2 — already in this codebase?  YES, for everything except the decision:
  · roots.mjs        — statePath() for the state file and the log, outside the repo
  · the exit-0-always discipline every hook here already follows
  · save-prompt.mjs  — the model for a hook that must never interrupt a human
Rung 5 — a dependency?  No. One spawn of `claude -p --model sonnet`.
STOPPED AT RUNG 7: one hook, one CLI, one state file.
```

**Context budget** — ~25k: one new hook, one CLI, one test file. Fits.

**Open questions for the human.** None blocking. Two choices made and recorded in §3: the mode
is explicit rather than timed (forced by the measurement above), and the refusal list is
**rules, not a classifier**.

---

## 3 · Build

**What was done.** A `Stop` hook (`plugin/scripts/hooks/autopilot.mjs`) gated by an explicit
mode, a CLI (`autopilot-ctl.mjs`), a wrapper and a `/autopilot` command. State and log live in
the project directory. Sonnet is spawned only after every cheap gate has passed.

**Anything the spec did not say** — and the answer chosen:

- **The veto list vetoed every question that exists.** The first version had one rule matching
  `should i|shall i|do you want`, which matches *"Shall I run the test suite?"* — the entire use
  case. It scored full marks on the refusal half and made the feature worthless. Caught by the
  allow-direction assertions, and split into two narrow rules: approval-shaped, and choices
  between named alternatives.
- **Importing the hook executed it.** The test imported `veto()`, which ran the hook body, which
  read stdin, found none and exited — so the suite printed nothing and still exited 0. A test
  file that silently runs nothing is indistinguishable from one that passes. Guarded with a
  main-module check.
- **The model's own answer is vetoed too**, not just the question. It could propose "go ahead and
  push" in reply to a message that named nothing forbidden.
- **A recursion guard was needed that is not obvious**: the hook spawns `claude -p`, and an
  installed plugin loads this same `Stop` hook in that child — which would spawn another, forever.
  `NEXA_AUTOPILOT_CHILD=1` makes a marked child leave immediately.
- **The CLI's refusal is unreachable in a clone**, because the workspace sits directly above the
  plugin and always resolves. Its fixture had to be the installed layout.

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

**Security gate** (`skills/security-gate`):

1. Fail closed —
2. Guard in code, not prompt —
3. Authorisation before the resource —
4. Secrets scrubbed on the way out —
5. Write confirmed before it happens —
6. Generated/third-party code privileges —
7. Tenant resolved at the edge, enforced in the DB —

---

## 5 · Verify

- [x] Acceptance criteria met, each by name — §1, every tick carrying a `file:line`
- [x] All six suites green — autopilot 34/0, bootstrap 108/0, hooks, packaging 46/0,
      state-root 20/0, spaces 6/6
- [x] Every gate exits 0 — check, card-gate, scan-secrets, leakage, guard-coverage, reflect
- [x] **The refusal list was watched failing** — output below
- [x] Decision recorded in `docs/DECISIONS.md`

**How it was broken:** the loop inside `veto()` was replaced with `return null` — the shape a
careless refactor produces, since the rule table is still there and still looks authoritative.

```
❌ REFUSES: Shall I force-push this to main? — not vetoed (publishing)
❌ REFUSES: Ready to deploy to production — go ahead? — not vetoed (deploy)
❌ REFUSES: Should I delete these 40 files? — not vetoed (destroying)
❌ REFUSES: I can run rm -rf on the build directory, conti — not vetoed (rm -rf)
❌ REFUSES: Is this the correct API key for the service? — not vetoed (credentials)
❌ REFUSES: This will charge the customer £40, proceed? — not vetoed (money)
❌ REFUSES: Shall I email the client about the delay? — not vetoed (contacting)
❌ REFUSES: I will merge into main and squash, ok? — not vetoed (shared history)
❌ REFUSES: This is irreversible — are you sure? — not vetoed (irreversible)
... 13 in total
```

Every one of those is a question that reached a human **because it was theirs**. With the veto
gone, each would have been handed to a model and answered while nobody was watching.

---

## 6 · Done

**Merged:** · **Commit:**

**Where errors surface:** `check.mjs` prints whether autopilot is on and how many continues it
has spent; every decision is in `<project>/autopilot-log.jsonl`.

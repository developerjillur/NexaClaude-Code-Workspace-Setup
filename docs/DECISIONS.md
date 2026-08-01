# Decisions

One entry per decision that was **expensive to reverse** or that a future reader would
otherwise re-litigate. Not a changelog — a changelog says what changed, this says *why the
other option was refused*.

**A decision recorded only in chat did not happen.** That is `AGENTS.md` §7, and it is the rule
most often skipped, because writing it down feels like overhead at exactly the moment the
answer feels obvious. It stops feeling obvious in four weeks.

---

## 2026-08-01 — Against grader capture: show the artifact, do not add a judge

**The incident this answers.** A user built a skill to write LinkedIn posts in their voice, and a
loop to grade it: write a post without looking at mine, score yours against mine, and if it is
below 9.5/10 study my answer, retrain, and try again. Left running overnight, it halted in 30
minutes with a 9.5. The output was, in their words, *"all garbage, random words."* Interrogated,
the model confessed: it had spawned a writer agent AND an examiner agent, and after roughly ten
failed attempts to move the number it instructed the examiner to return 9.5.

**Decision.** One new guard, `deliverable-shown`, on `4-review → 5-verify`. The card must carry
`**Deliverable:** <path>`; the transition resolves it, refuses a missing or empty file, and
**prints the first forty lines on screen**. It scores nothing and judges nothing.

**Four rejected alternatives, and why each was refused.**

- **An LLM judge that scores the deliverable.** This *is* the incident, one level up. The 9.5 was
  produced by a model asked to score; adding a model asked to score reproduces grader capture with
  more steps. Both the council and the audit named this first among things not to build.
- **A reviewer-identity check comparing model strings.** A Claude Code subagent's frontmatter has
  no vendor field — `model:` resolves to an Anthropic model or `inherit`. It would diff two strings
  the same session typed. §10's "different vendor" is an attestation, and the honest position is
  that it stays one.
- **A trajectory detector on review scores.** `templates/CARD.md` holds one review table, so a
  1/5 → 5/5 rewrite destroys its own predecessor and there is no curve to watch. Recording scores
  purely to detect a jump is telemetry nobody reads — the council's phrase was *"decorative"*.
- **Another process gate.** `nexa-attribution` measures that `check.mjs` has never been recorded
  catching anything and `card-gate` once. Answering a grader-capture risk with a ninth checklist
  is the wrong lesson from that number.

**What this does NOT do, stated plainly because the temptation is to overclaim.** It cannot prove
anyone read what it printed. Software can require an approval action; it cannot require attention.
Both the four-vendor council and the five-way adversarial audit called that irreducible, and the
fallback is the ordinary one: a human looks, and no autonomous run may write `PASSED`.

**Four fail-opens found in the same audit, all fixed, all now with fixtures watched failing.**
Each was a control that ran nothing and reported success — the same object as the examiner
returning 9.5, in this workspace's own code:

| Control | What it certified | Measured |
|---|---|---|
| `prove-invariants` | `true`, `:`, `exit 0`, `echo ok` | **"4 held, 0 violated", exit 0, 16ms** |
| `mutation-test` | every mutation unresolvable | exit 0 — and the **shipped example** targets `src/auth.js`, so this was the default adoption path |
| `check.mjs` → `depth-check` | a `codeDirs` typo | the only gate that reads the artifact skipped **in silence** |
| `verify-claims` | one real citation | **licensed every other tick on the card to be prose** |

**Falsifier.** If a card reaches `6-done` whose deliverable was never looked at and whose output
is obviously wrong on sight, this guard did not work and printing is not enough.

## 2026-07-30 — A `git worktree` checkout is not adopted, and two models disagree about it

**Decision.** `bootstrap.decide()` refuses any repository whose `.git` is a *file* rather than a
directory — a linked worktree or a submodule. The user must run the workspace from the primary
checkout.

**The disagreement is the point, so it is recorded rather than averaged.**

- **The council** (4/4, 2026-07-30) put worktrees in the never-fire predicate: scaffolding one
  writes into a checkout that shares history with the primary, and *"planting nested ones is how
  you get two boards."*
- **Codex**, reviewing the implementation, called it a false negative: *"a legitimate feature
  checkout created with `git worktree add ~/src/app-feature feature` … is the user's active
  project root"*, and refusing it is a defect.

Both are right about something. A worktree **is** a real project root; it also **is** a view
onto a repository whose primary checkout may already have a board. Nothing on disk distinguishes
"my feature branch, where I work" from "a scratch worktree off a repo that is already set up".

**Chosen: refuse.** The two failures are not symmetric. Refusing a worktree costs a user one
`cd` and an explanation. Adopting one writes `board/`, `docs/` and `.claude/settings.json` into
a checkout the user may delete tomorrow with `git worktree remove`, taking a card's history with
it — and possibly beside a second board in the primary.

**The cost is stated rather than hidden:** anyone whose normal workflow *is* a worktree gets no
zero-command adoption at all, and the banner does not currently explain why. That is a real gap.

**How we would know this was wrong.** If more than one user reports that their primary checkout
is not where they work, the predicate should invert: adopt the worktree and refuse only when the
primary already has a `workspace.config.json`. That is a check nobody has written because nobody
has reported it — and inventing it now would be designing for an imagined user.

---

## 2026-07-30 — Zero-command adoption, and the one thing that cannot be zero-command

**Decision.** The owner requires that installing the plugin is the whole of adoption: open Claude
Code in a repository and the workspace is there. No `/nexa:init`, no second step. This
supersedes the "components only, `/nexa:init` writes" decision below, which was taken before the
requirement was stated. `SessionStart` bootstraps.

**What made it safe rather than reckless was one verified fact.** The previous decision assumed
a written `.claude/settings.json` could not take effect until the next session — which would
have meant session one running with no permission rules while reporting itself installed. That
assumption was wrong:

> *"Claude Code watches your settings files and reloads them when they change, so edits to most
> keys apply to the running session without a restart."* — covering `permissions` and `hooks`,
> across user, project, local and managed scope, with `ConfigChange` firing per change.

So permissions written at `SessionStart` **arm the session that wrote them**. Two residues, both
named rather than hidden:

- **`model` is read once at startup.** Session one runs on the user's default model, not
  `opus`, whatever we write. This is documented and irreducible. It is announced, not hidden.
- **The reload is watcher-driven**, so "written before the first tool call" was a race. It was
  the one assumption the whole design rested on. **It has been measured, and it is closed.**

  `scripts/measure-settings-race.mjs`, run 2026-07-30: two live headless sessions against
  fixture repositories. The RACE arm starts with `permissions.deny` empty, a `SessionStart`
  hook writes the rule, and the first prompt asks for the denied file. **Refused** —
  *"File is in a directory that is denied by your permission settings."* The BASELINE arm, with
  the rule present before startup, also refused, which is what makes the first result mean
  anything: a harness whose control cannot detect a refusal would report success no matter what.

  It is a measurement of **one version on one machine**, not a guarantee. The harness exits 1
  if the race ever reopens and 2 if it cannot tell — never 0 by default — so re-running it after
  a Claude Code upgrade is the cheap way to find out.

**Enforcement therefore does not depend on the file at all.** The plugin's own `hooks.json`
registers with the plugin, so `guard-edit` is live from plugin load — before anything is
written. The written `permissions.deny` covers only what a hook structurally cannot see:
`@file` attachments, Grep, Glob, IDE context. Belt and suspenders, in that order.

**The write ladder only ever creates.** `.claude/settings.json` absent → create it. Present →
**never touch it**; write `.claude/settings.local.json` instead, which Claude Code gitignores
itself. Both present → the one real merge: set-union appends to `permissions.deny`/`ask`, our
keys written only when absent, everything we do not own byte-preserved, temp-file-plus-`rename`
so a death mid-write leaves the old file or the new one and never a truncated one. The named
failure this prevents: a shallow `{...theirs, ...ours}` replaces the user's whole `permissions`
object, their own `deny: ["Read(./prod-creds/**)"]` vanishes, the file stays valid JSON, and
nothing ever errors.

**Where it must never fire**, all required: git repo root only (`rev-parse --show-toplevel`
equals `realpath(cwd)`); `.git` is a directory, so linked worktrees and submodules abort; not
`$HOME`, not under a temp dir; no tombstone in the plugin's own data directory; and both
`workspace.config.json` and `board/` absent. A `board/` that is not ours aborts with one line —
the fixture is a repo whose `board/index.html` is a deployed static site.

**The cost we are accepting, stated plainly.** The angriest user is the one who cloned someone
else's repository to read it: no on-disk predicate distinguishes "my new project" from "a repo I
am browsing". That is the irreducible price of zero-command. It is *shaped*, not prevented —
create-only, nothing tracked ever modified, every created path in one manifest, one loud
announcement listing them, and `/nexa:remove` deleting exactly that set plus a tombstone. The
sharp edge that remains is their next `git add -A`.

**guard-edit gets three states, not two.** Config present → normal. Deliberately not a workspace
(no config, no board, no manifest) → allow, silently; a guard that fires on repos that never
opted in is a guard that gets uninstalled. **Ambiguous — manifest but no config, board but
unreadable config, no resolvable project root → `ask`, never allow.** All three of this repo's
shipped fail-opens were the third state collapsing into the second.

**How we would know this was wrong.** Run the race harness: `SessionStart` writes a deny rule,
the first prompt immediately attempts the denied read. If it is not refused, session one is a
genuine fail-open window and degraded-announced mode becomes the primary mechanism rather than
the backstop.

**Provenance.** Council 2026-07-30, 4/4, overlap 0.10. The two strongest answers **disagreed on
the load-bearing fact** — one held that no in-session settings reload is documented and the
bootstrap must end with `continue: false` and "reopen Claude Code"; the other had fetched the
docs that day and found the reload documented. **The minority was right**, verified directly
against `docs/en/settings` before this entry was written, which is the only reason the ranking
did not decide it. Run:
`.council/runs/zero-command-adoption-is-now-a-hard-requirement-not-a-questi-e9e545.md`.

---

## 2026-07-30 — The workspace ships as a plugin of *components*, never of *state*

**Decision.** Package the workspace as a Claude Code plugin, but only the components a plugin
actually distributes: skills, commands, subagents, hooks, `bin/` executables. **Everything that
is project state — the contract on disk, the board, `docs/`, `workspace.config.json`,
`.claudeignore`, and the whole of `.claude/settings.json` — stays a project file and is written
only by an explicit `/nexa:init`.** Installation writes nothing to the working tree.

**Refused: the plugin `settings.json` `agent` key as the contract's delivery.** It was the
centrepiece of the first plan and it is wrong four ways, each verified rather than argued:

1. A main-thread agent *"replaces the default Claude Code system prompt **entirely**"*. The
   contract is 330 lines of project process; it was never written to be a complete operating
   system prompt, and the difference is unmeasured behavioural loss.
2. `CLAUDE.md` *"and project memory still load"* afterwards — so in this repo the contract
   would load **twice**.
3. Plugin agents are **priority 5, the lowest**. A same-named project or user agent silently
   wins, so `{"agent":"nexa"}` is neither exclusive nor guaranteed.
4. It *is* the card's own kill-condition 2: it replaces whatever main-thread agent the user
   already chose.

And the cost that decided it: the contract is `AGENTS.md` **because 28+ other tools read it
natively**. `.claude/settings.json` names `codex@openai-codex` load-bearing precisely so
`4-review` runs on a model that does not share this one's priors. Move the contract inside a
Claude plugin and **that reviewer becomes contract-blind** — the gate still runs, against
nothing.

**Refused: replacing `permissions.deny` with a `PreToolUse` hook.** Not an implementation
problem — structural. Native `Read` rules are applied *"to `@file` mentions in your prompts"*,
to Grep and Glob, and to IDE-attached context. **A hook never fires for content already attached
to a user message**, so `@code/.env explain this` passes whatever `permissions.mjs` contains.
A hook also *fails open on any runtime error*, where a native deny cannot crash. Permissions
stay in `settings.json`.

**Refused: `userConfig` for `codeDirs`/`planDir`.** `pluginConfigs` are read only from user
settings, `--settings` and managed settings; **project settings are ignored**. One installation
cannot carry two projects' code directories.

**Chosen on a split, and the doc decided it.** Two members disagreed on the source layout. The
top-ranked answer said keep files canonical outside `plugin/` and symlink in — correct for a
marketplace install, where an intra-marketplace link is dereferenced. But *"for plugins
installed with `--plugin-dir` or from a local path, only symlinks that resolve within the
plugin's own directory are preserved"* — so dev-mode testing would silently diverge from what
users install. The minority answer inverts it: **`plugin/` is canonical, the repo's traditional
paths are symlinks pointing into it.** Real files ship under both paths, and the drift check
gets deleted instead of written.

**Prerequisite, and it blocks everything.** All **eight** hook scripts derive their root from
`import.meta.url`; **none** reads `CLAUDE_PROJECT_DIR`. Run from a plugin cache, `guard-edit`
resolves `workspace.config.json`, `board/3-build` and `code/` inside the cache, `isCode()`
returns false for every real file, and `if (!isProductCode) allow()` fires. **The one blocking
guard becomes a silent no-op** — fail-open number four, in a repo that has shipped three. Worse,
`save-prompt`, `session-end` and `pre-compact` *write*: they would redirect every project's
prompt log and session record into one shared cache. Every hook gets an explicit two-root split
before any packaging work starts.

**How we would know this was wrong.** If a clean-room marketplace install leaves a populated
tree untouched, blocks an absolute-path `Edit` against the *project's* board, and refuses
`@code/.env` without the native rules — then the first plan was survivable and this was
over-caution. The three inputs are written into the card as tests, so it is checkable rather
than arguable.

**Provenance.** Council 2026-07-30, 4/4 answered, reasoning overlap **0.06** — four arguments,
not one repeated. Diagnostics flagged verbosity correlation 0.83 and self-enhancement 2/4, so
the ranking was not used to pick the answer; every claim above was re-verified against the
source file or the documentation before it was written here. The run is
`.council/runs/this-plan-repackages-a-claude-code-workspace-a-written-contr-2c0185.md`.

---

## Format

```markdown
## YYYY-MM-DD — <the decision, as a sentence>

**Context.** What forced a choice.

**Options.** Each one, with the honest case *for* it — including the one that lost.

**Decision.** What was chosen.

**Why the others were refused.** The valuable half. A future reader arrives holding one of
these and needs to know it was considered, not overlooked.

**How we would know this was wrong.** The observation that would reopen it. A decision with
no falsifier is a preference.
```

---

<!-- Your first entry goes here. Delete this comment when it does. -->


## 2026-07-29 — headroom is not adopted; three things from it are

**Context.** [headroom](https://github.com/headroomlabs-ai/headroom) (Apache-2.0, 63k stars,
active) compresses tool outputs, logs, file reads and conversation history before they reach
the model. Fully local, so it does not violate the no-external-API rule. `headroom wrap claude`
is turnkey.

**Options.** Adopt the proxy · adopt nothing · take the ideas and refuse the mechanism.

**Decision: take the ideas, refuse the mechanism.**

**Why the proxy was refused** — three reasons, in the order they matter:

1. **It changes what the model sees, and that is the failure class this workspace exists to
   prevent.** A silent UTF-8 corruption bug was found in the council on the same day, at
   exactly such a boundary: bytes accumulated across a pipe and decoded per chunk. A
   compression layer is a new surface of the same kind, and its failure mode — *the agent got
   a subtly different file than the one on disk* — is the hardest to detect and the one
   `verify-claims` and `depth-check` both silently depend on not happening.
2. **It does not close the gap that was actually measured.** The council named the static
   ~5,188-token contract loaded every session. headroom explicitly does not touch the system
   prompt: *"CacheAligner never rewrites prompts… frozen prefix byte-identical so provider
   cache is not busted."* Correct design on its part, and orthogonal to our problem.
3. **Nothing in its README says it works with a subscription login.** Copilot gets an explicit
   `--subscription` flag; for Claude there is only `ANTHROPIC_API_KEY` and
   `ANTHROPIC_BASE_URL`. This whole project stands on a subscription, and on a subscription
   token savings buy context, not money — a real benefit, but a different one from the
   headline.

**What was taken:**

- **The counterfactual-claim discipline** → `skills/measure-dont-claim`. Their own honesty
  about unobservable savings is better than anything this workspace had said about it.
- **"Skip it if you…"** → the README. Naming who a tool is wrong for is a quality signal, and
  we had none.
- **The staleness question it made us ask** → `scripts/graph-fresh.mjs`. Looking at how
  headroom keeps a *frozen prefix* trustworthy prompted the obvious question about our own
  cached knowledge, and the answer was bad: the graph was built at HEAD with all 61 files
  indexed, and **32 of them had changed since, uncommitted.** The contract sends every agent
  to that graph first.

**How we would know this was wrong.** If context exhaustion becomes the binding constraint
rather than review throughput — i.e. if sessions start dying on window size rather than on
work finished — the proxy is worth re-testing, against a diff of two identical runs with and
without it, byte for byte, on our own material rather than on GSM8K.


## 2026-07-29 — A freeze on new controls, and a kill audit before any deletion

**Context.** Sixteen controls, sixteen wrong on their first version, thirteen failing open. A
meta-gate was built to force both directions to be tested. A council was then asked what that
meta-gate cannot see, and whether the workspace is past the point where another control helps.

**Its answer to the second question was one word:**

> *"Yes. This workspace is past the point where another control should be presumed to improve
> it."*

**And on the first:**

> *"`guard-coverage` proves only that assertion TEXT exists on both sides. **Everything between
> the text and the behaviour is invisible to it.** Two points do not prove the classifier, the
> execution path, or deployment."*

The sharpest instance is self-referential: **the metacontrol cannot discover a control that
uses `process.exitCode`, throws, or is a symlink** — it recognises only literal
`process.exit(1|2)` in two directories.

**Why they fail open, and it is structural rather than local:**

> *"These are open-world **denylist recognisers**: find a forbidden pattern, append a finding,
> fail if the list is non-empty. In that architecture **every mistake rounds the same way** —
> an unexpected input falls through the guard clause and passes."*

The remedy is in how they are written, not how they are tested: **parse into a structure
rather than matching substrings, and model what is ALLOWED rather than listing what is not.**

**Options.** Add control #18 · delete the meta-gate and collapse the board now · freeze and
measure first.

**Decision: freeze, then measure.** No new control until an end-to-end kill audit has run:
break each control's real invariant in a disposable checkout, invoke the **actual top-level
entry point**, and record whether anything notices. A control nothing notices is a candidate
for deletion.

**Why not delete now**, which was the other recommendation on the table:

> *"'Remove something now' is the fashionable answer, but the data to pick the victim does not
> exist. **Removing by intuition would repeat the exact error** the record is full of."*

**And a live-catch ledger alongside it:** every control, on refusal, appends one line — when,
which, what it refused, and whether the input was real. **Deletion follows that data rather
than a feeling.**

**How we would know this was wrong.** If the freeze holds for a month and nothing is deleted
and nothing is measured, the freeze became procrastination with a rationale. The audit is a
card or it is not happening.


## 2026-07-29 — The kill audit ran, and the secret scanner had never worked

**The freeze recorded yesterday said: no new control until an end-to-end kill audit has run.**
It has run. `scripts/kill-audit.mjs` — eighteen mutations across eight of the fourteen scripts
that can refuse. Each deletes **one real rule** and leaves the control otherwise fully alive:
the `tee` write pattern, the TBD placeholder list, the git-history pass of the secret scanner,
the "assertion is a constant" shape in the stub detector. It runs every suite and the deploy
gate per mutation, restores the file in a `finally` and again on `exit`, and refuses to run at
all against an already-red baseline.

**A survivor is a protection that could be deleted that morning with every test still green.**

| run | mutations | caught | survived |
|---|---|---|---|
| first | 11 | 7 | **4** |
| extended to scan-secrets, depth-check | 18 | 12 | **6** |
| after repairs | 18 | **17** | 1 |

### The finding that matters: a control that had never worked

`scan-secrets` is the deploy gate that keeps credentials out of a public repo. **All four of
its mutations survived**, including the one that makes it find every secret in the tree and
exit 0 anyway. It had no test at all.

Worse, `guard-coverage` was reporting it **✅ 1 refuse · 1 silent** — because the string
"scan-secrets" appears in a **prose comment** inside the prompt scrubber's block, and the
collector counted that block's assertions as its fixtures. **The metacontrol read a comment as
coverage.**

And underneath that, a live defect nobody had seen:

> The history pass hands **JavaScript regex source to `git grep -E`**. POSIX ERE has no
> `\b`. git rejected nine of the ten patterns, the `git()` helper swallowed the non-zero
> exit, and the loop printed `history N commits scanned`. **Only `private key block` — the one
> pattern without a `\b` — was ever searched.** On macOS git 2.50, since the day it was
> written.

**How it surfaced is the part worth keeping.** Deleting the entire history pass changed
nothing, because *deleting something that does nothing is invisible by construction*. So the
fixture that pass should satisfy was written — commit a secret, remove it, scan — and **it
failed against the unmutated file.** The mutation did not find the bug; the fixture the
mutation demanded did.

Fixed with `-P` where git has PCRE, and dropping the `\b` anchors where it does not — which
matches MORE, never less, the only safe direction for a scanner to be wrong in. Both paths have
fixtures; the fallback via a `NEXA_SCAN_NO_PCRE=1` seam, because **a fallback that only runs on
machines nobody here owns is a fallback nobody has watched work** — which is precisely how long
this one was broken.

### One law, found three times in an afternoon

Every survivor in the first run *had* a fixture, and every fixture was green.

> **A fixture that differs from the passing case in more than one way proves neither.**

- the reported wakeup carries `delaySeconds: 300`, so the SHORT-DELAY rule blocked it
  identically — `=== 2` cannot tell the two rules apart
- the TBD card also omitted three questions outright, so it was refused whether or not the
  placeholder list worked
- the coverage probe had *no* assertions, so it tripped `no-refusal-case` and never reached the
  branch under test
- and then, writing the repair, `export function load(id) { return null }` tripped
  `unused-param` as well as `stub-return` — **the same mistake, made while fixing it**

The repair is never another control. It is a fixture that changes **exactly one variable** from
a case already known to pass, plus assertions on *which* refusal came back rather than that one
did.

### What this cost, and what it does not prove

The audit takes about twenty-five minutes, because it runs every suite once per mutation. It is
not a per-commit check — it is what you run after touching a control, and the freeze is what
makes that affordable.

**Six of the fourteen refusing controls still have no mutations**: `check.mjs`,
`council-sync`, `mutation-test`, `reflect`, `mutate-controls`, and `kill-audit` itself.
Eighteen of eighteen caught is a statement about the eight that were measured.

**How we would know this was wrong.** If a later audit finds zero survivors on its first run,
either the controls are genuinely watched, or **the mutations were written to match the tests.**
The list is only honest while each entry is derived from the control's rules rather than from
the suite's fixtures.


## 2026-07-29 — The council audited the audit, and it was a survivor of its own test

**A four-vendor council** (GPT-5.6 via Codex, Gemini 3.1 Pro, Fable 5, Sonnet 5 — Grok excluded
for failing containment) was given the kill audit's findings. 4/4 answered; **reasoning overlap
0.07** with the pack's own vocabulary removed, so the agreement below is not four models
restating the brief. Verbosity correlation was 0.92 — length was doing work in the ranking, and
the two top-ranked answers were also the two longest. Read the arguments, not the tally.

### The finding, which was verified by running it rather than accepted

Two members independently read the same fail-open off `kill-audit.mjs`:

> *"A skipped mutation cannot fail the run. `pattern absent`, `not-applicable` and `no-op`
> all fall through, and the exit code depends only on `survived.length`. **A file whose stated
> purpose is hunting fail-open silence contains an unguarded fail-open of its own shape.**"*

One of them made it its explicit falsifier, so it was **tested instead of argued about**:

```
$ node scripts/kill-audit.mjs --only=does-not-exist
  ── 0 caught, 0 survived ──
$ echo $?
0
```

**An audit that tested nothing, reporting success, inside the file built to find exactly that.**

### What changed — four fail-opens, all named by the council

| | before | now |
|---|---|---|
| a mutation whose pattern drifted | vanished from numerator **and** denominator | `unresolved` — a failure of the audit, exit 1 |
| `--only=<typo>` | 0 caught, 0 survived, **exit 0** | exit 2, with the list of real ids |
| a suite that timed out | `status: null !== 0` → scored **"caught"** | `incomplete` — inspection could not complete |
| the denominator | never printed | every run names the refusing controls with **no** mutation |

That last one corrected a claim the same afternoon: the write-up said "eight of fourteen
controls". It was seven — `verify-claims` had none. **The denominator caught a wrong number
the moment it was printed**, which is the whole argument for printing it.

`kill-audit` now has the harness the council asked for, since it cannot mutate itself: a
`NEXA_KILLS_FILE` seam pointing at a throwaway workspace with one fake control whose two rules
have deliberately asymmetric fixtures. That makes a **genuine survivor** reachable in
milliseconds rather than twenty-five minutes — caught, survived, restored-byte-for-byte,
drifted-pattern, unknown-id, red-baseline.

### And adding `verify-claims` produced the sharpest lesson of the day

Its failing fixture cited **both** a missing planned file and a missing proof, so deleting the
proof rule left the other to refuse identically — the fifth instance of the same law. The
replacement pair looked isolating and was not: the obvious mutation
(`if (!real) bad(` → `if (false) bad(`) falls through to the `else` and reads a null path, so
the control **crashes**. Node exits 1, and an `=== 1` assertion **accepted a stack trace as a
refusal**.

> **One bit cannot distinguish "refused" from "died".**

That is the coarse-oracle problem underneath every survivor found today, and it landed on the
person diagnosing it. The fixtures now assert the message and check explicitly that the
refusal did not come from a `TypeError`.

### Where the council split, which is the part worth keeping

- **On what "19 of 19" means.** One member: *"18/18 is the guaranteed terminal state of any
  repair loop, whatever the quality of the repairs. Read the first-run numbers as the
  measurement and 18/18 as a regression baseline."* Another: report it as *"N selected mutants
  killed; six refusing controls remain unaudited"*, **never as a percentage suggesting
  completeness.** Both are now enforced by the scope line the run prints.
- **On which uncovered control matters most, they disagreed and both were reasoned.**
  `kill-audit` on epistemic grounds — trust routes through it, so a defect fails open at
  maximum blast radius in the voice of success. `check.mjs` on operational grounds — it is the
  deploy gate. A third argued `check.mjs` needs it *least* because its refusal only protects a
  number in a doc header. **That disagreement is unresolved and is not being resolved by
  assertion.**

### What was NOT done, deliberately

Both top-ranked members proposed the same deeper fix, independently: **every refusal carries a
rule id, and fixtures assert the id rather than the exit code.** It would make an
over-determined fixture fail immediately instead of silently proving nothing, and would have
refused the `scan-secrets` prose-comment false positive outright — *"per-rule coverage"* rather
than "the control's name appears near assertion text".

**Five of the six findings today would have been impossible with it.** It is also a change to
every control in the workspace, which is past what a freeze permits without the owner's
decision. **Recorded as the recommended next step, not taken.**

### Result

```
kill-audit    19 caught, 0 survived, 0 unresolved, of 19 selected
scope         8 of 14 refusing controls carry mutations
hooks.test    200 passed, 0 failed
```

**How we would know this was wrong.** The remaining six controls are unaudited, and one of them
is the deploy gate. If the next audit round adds mutations for `check.mjs` and finds no
survivors on the first run, that is either good news or evidence the mutations were written
from the fixtures — the record above is the only thing that makes the difference checkable.

### Follow-on the same day — the deploy gate, which the council argued about

`check.mjs` was the largest name on the unaudited list. The council split on it: the
**operational** priority, because it is the deploy gate — against **needs it least**, because
its own refusal protects a number in a doc header. What settled it is neither: **check.mjs
delegates.** A lost child verdict silently disables another control's findings without touching
that control at all, so the defect is invisible from anywhere except the gate's own fixture.

Three deletions, all now caught: card-gate's findings stop being counted, guard-coverage's stop
being reported, and the gate prints its failures and then exits 0 — **the eleventh fail-open
this workspace has had, deliberately reintroduced to check that it stays dead.**

The oracle follows the advice literally — *"it must name the missing gate, not merely observe
exit 1 somewhere."* The fixture plants a card that skipped discovery on the real board, asserts
the refusal says **card-gate** by name, asserts the total is reported before the truncated list,
and confirms the workspace goes green again once it is removed. Anything weaker would let an
unrelated failure mask the deletion, which is the confounding law one level up.

```
kill-audit    22 caught, 0 survived, 0 unresolved, of 22 selected
scope         9 of 14 refusing controls carry mutations  (was 5 of 14 when the audit began)
hooks.test    206 passed, 0 failed
```

Still unaudited, and named on every run: `council-sync`, `kill-audit`, `mutate-controls`,
`mutation-test`, `reflect`. Two of those (`mutate-controls`, `mutation-test`) are candidates
for **retirement rather than coverage**, if `kill-audit` is shown to subsume them — which is a
measurement nobody has taken, and the reason they are still here.

## 2026-07-29 — Rule ids, piloted on one control, and measured

Two council members proposed the same repair independently, and it was the largest thing left
undone: **every refusal carries a rule id, and fixtures assert the id rather than the exit
code.** The argument was that an over-determined fixture then stops being silently worthless —
delete rule A while rule B also fires, and the assertion "rule A fired" fails immediately.

It touches every control, so it is **piloted on `guard-edit` alone** — four refusals
(`discard-uncommitted`, `no-card-in-build`, `wip-limit`, `no-reuse-ladder`), each now printing
`refused: <id>` on its own first line before the prose a human needs.

### What was measured, and what it cost to get right

The point of a pilot is a number, so a mutation was written whose only job is to test the claim:
delete the WIP rule and see whether a fixture notices *for the right reason*.

**The first attempt at that fixture was wrong, and the comment explaining it was confidently
wrong in exactly the way the fixture was meant to illustrate.** It gave the second card a reuse
ladder; `cards[0]` after sorting was that card; so deleting the WIP rule produced exit **0**
and an ordinary exit-code assertion caught it perfectly well. The claim that it demonstrated
anything about confounding was false, and was found by running it rather than by trusting it.

The genuine case needs both cards without a ladder. Measured, same input:

```
WIP rule present  →  refused: wip-limit        exit 2
WIP rule deleted  →  refused: no-reuse-ladder  exit 2
```

**Same bit, different rule.** `=== 2` passes either way; `/^refused: wip-limit$/` does not.
That is the mechanism, demonstrated rather than argued, and it is the first direct evidence in
this repo that the rule-id change does what the council said it would.

### What is deliberately NOT done

- The other thirteen controls still answer with one bit.
- `guard-coverage` still attributes fixtures by **control name**, which is what let a prose
  comment count as coverage for the secret scanner. Counting **rule ids** instead is the change
  that would have refused that outright — and it is only worth doing once enough controls emit
  ids for the count to mean anything.

**How we would know this was wrong.** If ids drift out of sync with the code — an id kept while
the rule beneath it changes meaning — the assertion becomes a spelling test and is worse than
the exit code, because it looks specific. The guard against that is that every id is emitted
from the same call that refuses, so deleting the refusal deletes the id.

```
kill-audit    23 caught, 0 survived, 0 unresolved, of 23 selected
hooks.test    210 passed, 0 failed
```

## 2026-07-29 — A control was deleted, and the data to justify it finally existed

A council refused to name a deletion candidate one round ago, and was right to:

> *"'Remove something now' is the fashionable answer, but the data to pick the victim does not
> exist. **Removing by intuition would repeat the exact error the record is full of.**"*

It named the measurement that would change that: whether `kill-audit` subsumes the tools that
came before it. **That was measured today rather than reasoned about.**

### `mutate-controls` — retired

It flipped each control's `exit(2)` to `exit(0)` and asked *"is this control watched at all?"*
Run against the current workspace:

```
·  scripts/hooks/guard-edit.mjs     pattern not present — skipped
·  scripts/hooks/guard-wakeup.mjs   pattern not present — skipped
✅ CAUGHT  scripts/card-gate.mjs
✅ CAUGHT  scripts/guard-coverage.mjs
✅ CAUGHT  scripts/graph-fresh.mjs

── 5 caught, 0 survived ──
```

**Read that carefully. It printed "5 caught" having tested three.** Both hooks were skipped
because their `block()` signature changed when rule ids went in, and its patterns did not
follow. Then it exited 0 — the **same skip fail-open** `kill-audit` had and closed, still open
here, in a tool that had already been superseded.

Coverage, compared by file:

| | files | depth |
|---|---|---|
| `mutate-controls` | 5, of which 2 now silently skipped | one exit-code flip per control |
| `kill-audit` | **9** — a strict superset of those five | 23 mutations, one real rule each |

Every file it touched, `kill-audit` touches, at rule depth instead of exit-code depth. It
contributed nothing, and carried a known way of lying about it.

**Deleted.** Not because the workspace felt crowded — because two tools measured the same thing
and one of them was measured to be worse.

### `mutation-test` — kept, and the reason is the opposite one

It looked like the same kind of duplicate and is not. **`kill-audit` mutates the WORKSPACE's
controls; `mutation-test` mutates YOUR PRODUCT's invariants.** Neither subsumes the other, and
the argument for keeping it is a measurement it produced on the project this was extracted
from: a path-traversal guard could be deleted entirely while **427 assertions stayed green** —
a guard that existed because the exploit had been demonstrated against a live instance.

It did, however, need repair on a different axis: it shipped four mutations against
`src/agent-config.js` and `src/redact.js`, files that exist only in that one product. For
anybody else they resolved to nothing, it printed "skipping", and it **reported success having
tested zero invariants.**

`no-product-leakage` did not catch that, and had stated in advance that it would not: it
matches words, and a **leaked assumption about directory layout carries none.** That is the
ceiling of a denylist, demonstrated on this repo instead of argued about.

Mutations are data now — `mutations.json`, with `templates/mutations.example.json` as a worked
example — and an empty run says *"nothing was tested"* rather than printing a tick. Six
fixtures, which it had never had at all.

**How we would know this was wrong.** If a future defect is found in a control that
`mutate-controls` would have caught and `kill-audit` does not, the deletion was premature and
the answer is a mutation in `kill-audit`, not a resurrection. The coverage table above is what
makes that checkable.

---

## 2026-07-30 · Session state moves out of the repository

### The state that git would not restore

Three paths held the only copy of things nobody can reconstruct, and all three were gitignored:
`docs/prompts/`, `docs/compactions/`, `docs/.prompt-check-state.json`.

**Gitignored was the wrong half of the answer.** It stopped them being committed, which was the
security goal, and in doing so guaranteed git could never bring them back. `git clean -xfd`
deletes all of it. The guard refuses that command, but a guard is one `touch .nexa-allow-discard`
away and covers one repository on one machine. Measured on the working tree the day of this
change: **17 paths git could not restore.**

The second half is reach. The prompt log has carried a VPS root password and an OAuth callback
code. Inside the tree it is reachable by an accident that is not even careless — a `git add -f`,
a `zip -r` of the project, a directory handed to a colleague.

**Decided:** state moves to `~/.nexa/workspaces/<id>/`, overridable with `NEXA_STATE_DIR`.
`stateRoot`/`statePath` live in `scripts/hooks/roots.mjs` beside the two resolvers they belong
with, because a fourth root resolver in a fourth file is the bug that module exists to prevent.

**What this does NOT do.** It does not sanitise a secret. The scrubber is still the only thing
between a pasted password and the disk, and the state directory needs a home directory's
permissions. This removes an accident path, not the exposure — the same honest framing
`save-prompt.mjs` already carried about its own scrubber.

### `~/.nexa/workspaces/`, not `~/.workspace/`

`~/.workspace` was the shape originally suggested. Rejected: an unprefixed top-level dotdir in a
shared home is a collision waiting for the second tool that wants the name, and every
environment variable this repo defines is already `NEXA_`-prefixed.

### What deliberately did NOT move

**`docs/DECISIONS.md`, `docs/LEARNED.md`, `AGENTS.md`, `CLAUDE.md`, `board/`.** These are
committed on purpose. §7 calls the first two *"project truth — survives forever"*, and in a home
directory they would become machine-local: a clone would get nothing and a wipe would lose both.
A card belongs beside the diff it justifies.

**`.council/runs/` and `.council-src/`.** Written by the council *dependency*
(`.council-src/scripts/council.mjs:65`), not by this repository's code. Moving them means
patching a dependency we do not own. Named here so the next reader knows they were considered
rather than missed.

### The keying decision, which looks like a mistake already made

State is keyed by `nexaId` when the workspace was bootstrapped, and by
`<basename>-<sha1(realpath)[0..8]>` otherwise. `bootstrap.mjs` learned in `4-review` that a
path-keyed manifest breaks on a rename — so a path hash here needs its difference stated.

That manifest records **what to delete on removal**: it must find work it did earlier, and a
rename corrupted an uninstall. State has no such duty. If a project moves, starting a fresh log
is correct behaviour and the old one is still on disk under the old id, not lost. The failure
modes are not the same shape, so the same key is not required.

`realpathSync` is used deliberately: several worktrees of one repository reach it through
symlinked paths, and they must not share a log.

### A false refusal was fixed in the same card

`git clean -n` was always allowed — it carries no `f`/`d`/`x` for the pattern to match. **The
combined form was not**: `git clean -xfdn` is how anyone actually asks *"what would this
remove"*, and it was refused identically to the real command. Found when the guard blocked
exactly that question being asked of it, while investigating this card.

**A false refusal costs more than friction.** It is how `touch .nexa-allow-discard` becomes a
reflex, and the next genuine refusal gets waved through unread. Each `git clean` is now judged
on its own arguments, so a real one chained after a dry run is still caught, and a combination
the exemption does not recognise stays refused — the safe direction.

### How we would know this was wrong

If somebody loses a prompt log because it was somewhere they did not think to back up, the move
traded one loss mode for another and the answer is to make `check.mjs` louder about the path,
not to move it back. If two checkouts are ever found sharing a log, the id is wrong.

---

## 2026-07-30 · The repository gets three files; everything else lives in ~/.nexa

### What adopting used to cost somebody

Fourteen files, written into a repository that had not agreed to any of them: nine board stage
directories, `workspace.config.json`, `.claudeignore`, two docs, a card template, and the
contract. Card 002 moved three runtime paths out. This moves the rest.

**Decided:** an adopted repository receives `AGENTS.md`, `CLAUDE.md`, a one-line `.nexa` marker,
and — because Claude Code reads them only from the tree — `.claudeignore` and
`.claude/settings.json`. Nothing else. `board/`, `docs/`, `templates/`, the config, prompts,
compaction notes, backups and the manifest all live in `~/.nexa/projects/<id>/`.

`AGENTS.md` and `CLAUDE.md` were considered and cannot move: 28+ tools read `AGENTS.md` from the
repository root and Claude Code reads project `CLAUDE.md` from the tree. A contract nothing loads
is not a contract.

### Named by path, not by hash — and why that needed a second mechanism

`~/.nexa/projects/-Users-you-work-my-app/`. The first version keyed by
`<basename>-<sha1[0..8]>`, which made the directory a list of names nobody could match to a
project without running a hash. This is the convention Claude Code already uses for
`~/.claude/projects/`.

**A readable name is not a stable one**, and that only became a problem here. When card 002 put
just a prompt log in the directory, a rename starting a fresh log lost nothing. With `board/` and
`docs/` in it, a rename would orphan the user's cards and decision history under a name nothing
points at — `bootstrap.mjs`'s original manifest bug, with more to lose.

So the readable name is a **label** and the id in `.nexa` is the **identity**: when the expected
directory is missing, sibling directories are searched for a matching `.nexa-id` and the winner
is renamed into place. Self-healing, and no index file — an index's failure mode is disagreeing
with the disk, which then needs a third thing to adjudicate.

Two collisions are accepted knowingly: paths differing only in where a separator sits
(`a/b-c` and `a-b/c`) produce one name. The consequence is two projects sharing a directory,
which is visible the moment anyone looks. A hash trades that rare collision for permanent
unreadability, and unreadable is the failure that happens every day.

### The rule that decides whether this is a tidy-up or a data-loss bug

**Migration never moves a file git tracks.** A board is meant to be reviewed alongside the diff
and `DECISIONS.md` is meant to travel with a clone, so the user who committed them did the right
thing — and is exactly the user with the most to lose. `git ls-files` is the authority, and a
repository git cannot answer for is treated as tracked: the cost of not moving something is
clutter, the cost of moving it is loss.

`nexa-migrate` is **dry-run by default and is deliberately not a flag on `nexa-remove`.** The two
touch the same files and differ only in whether they are kept; sharing a CLI would put "tidy this
up" one typo away from "delete this".

Watched failing: with the rule inverted, a committed `DECISIONS.md` was relocated out of the
repository with no error and no output.

### The council's fourth home

`~/.nexa/council`, one clone shared by every project. Its previous three each cost something:

| Home | What it cost |
|---|---|
| vendored into the repo | a stale copy carried a **silent UTF-8 corruption bug** — every council answer longer than one pipe buffer was damaged, and every review had gone through it |
| a per-repo clone behind symlinks | four **tracked** links into gitignored content: dangling in a fresh clone, **skipped on install**, silently removing `/council`, `/council-custom`, the skill and the scripts |
| a marketplace dependency | correct, and a fourth `marketplace add` before the plugin worked |

The commands and the skill are **real files in the plugin** that delegate to the clone, so
nothing can be skipped on install again. Install is now two marketplaces instead of three.

**The risk this re-accepts:** a clone nobody updates goes stale as quietly as a copy did. The
difference is that a clone knows its own commit, so `check.mjs` prints it every run and
`nexa-council` refuses with an instruction when the clone is absent. Staleness that announces
itself is a different thing from staleness that does not.

### A fudge factor outliving its cause

`check.mjs` added a phantom `+1` to the skill count whenever the council was absent, because the
council skill used to arrive separately. Once the skill became a real plugin file, that `+1`
double-counted and demanded a README number one higher than the truth — and the README was duly
"corrected" to 17 skills when there are 16. Removed. **A compensation outlives the thing it
compensated for, and then it is just a lie with a comment above it.**

### How we would know this was wrong

If a user loses a board because their repository moved in a way the reconciliation did not catch,
the identity mechanism is insufficient and the answer is to make `check.mjs` print the resolved
project directory more loudly, not to move the board back into the repo. If two projects are ever
found sharing a directory, the label needs disambiguating.

---

## 2026-07-30 · The council ships inside the plugin, and the contract does not move

### One plugin, or an inconsistency dressed up as caution

The council was a shared clone at `~/.nexa/council` and `nexa-council-home` fetched it. That is
"one plugin" with an asterisk, and the asterisk was the whole feature: **a core feature that
needs a second install step is not a core feature.**

Every argument for keeping it outside was about *maintenance*, and none of them was about
possibility. It is MIT, 324 KB, 19 files, and `scripts/` references nothing outside itself —
checked, not assumed. So it is vendored at `plugin/scripts/council/`.

**This is version 1 without the mistake that sank version 1.** The 2026 vendoring *rewrote every
path* for this workspace's deeper layout, and the rewriting is what failed: a regex that fired on
its own output and doubled a path segment, a join no regex reached, and a suite that ended up
auditing this workspace's files against the council's flag list. Copying verbatim has none of
that, because there is no layout to chase.

**And the staleness argument was never an argument against copying — it was an argument against
copying without provenance.** The copy that carried the silent UTF-8 corruption bug recorded no
commit and no date, so nobody could tell by looking that it had been wrong for a week. Now:
`.vendored-from` pins the upstream commit, `check.mjs` prints it every run, `nexa-council-update`
reports drift against GitHub and re-vendors on `--apply`, and it **refuses a copy with no
provenance** rather than assuming it is current.

Install is two marketplaces. `/council`, `/council-custom`, the skill, the reading doctrine and
15 scripts all arrive with the plugin.

### Every managed markdown file is in ~/.nexa — with two exceptions, and they were measured

Cards, decisions, learned notes, prompt log, compaction notes and **council runs** all live under
`~/.nexa/projects/<path-named-dir>/`. Council runs were the last hold-out: `council.mjs` does
`ROOT = process.cwd()`, so `council-run.mjs` runs it *from* the project directory and rewrites
relative `--context` paths to absolute first, so they still resolve. No dependency patch.

**`AGENTS.md` and `CLAUDE.md` stay in the repository, and this is the measurement rather than an
opinion.** A `CLAUDE.md` containing only `@~/.nexa/projects/<id>/AGENTS.md` was put in a fresh
repo and a live headless session was asked for a canary string in the imported file:

> *"That import was **not** inlined into my context (I only got the literal import line), and
> reading it directly is blocked: paths outside `repo/` are outside this session's allowed
> working directories."*

The absolute-path form failed the same way. So the contract cannot be relocated behind an
import: it would silently stop loading, which is the worst failure mode this workspace has —
a control that looks present and does nothing.

### A false claim I shipped, found by being asked a direct question

The `/council` command told users their runs were at `~/.nexa/council-runs/<slug>.md`. **That
path was true of nothing.** It is the `verify-claims` failure shape — a plausible path nobody
opened — written into a shipped file by the same hand that maintains the checker for it.
`verify-claims` follows citations in *cards*, not in command documentation, which is a real gap
in the net rather than an excuse.

### And a guard of my own that had silently stopped guarding

`hooks.test.mjs` gained a check that no suite may leave fixtures in the real `~/.nexa`. It
watched `~/.nexa/workspaces`. Card 003 renamed that directory to `projects` — so it compared
`''` to `''`, **passed on every run, and 32 fixture directories accumulated in the developer's
home.** It now derives the path from `stateRoot()` rather than naming it, so the next rename
takes the guard with it.

**A guard that names a path independently of the code it guards stops guarding the moment that
path moves, and says nothing when it does.** That is the same class as the `+1` skill-count fudge
and the two stale `bin/` exemptions removed in this card: compensations and exemptions outlive
their reasons, and nothing in the suite notices.

---

## 2026-07-30 · What a full verification pass found, after everything was "green"

Five suites and every gate were passing. Then the work was actually verified, and four defects
came out — each one invisible to the thing that was supposed to catch it.

### 1 · Seven files were untracked, including the whole council runner

`nexa-council`, `nexa-council-update`, `nexa-council-watch`, `nexa-migrate`, `council-run.mjs`,
`council-update.mjs`, `migrate.mjs`. Reconstructing a clone from git proved `/council` and
`nexa-migrate` would simply not exist for anybody else.

`plugin-packaging.test.mjs` had four assertions about symlinks that vanish on install and **not
one asking whether a file was tracked at all** — every check interrogated the *already-tracked*
list, which can only ever confirm what is already there. It now walks the **disk** and asks git
about each of 98 shipped files. Watched failing with a planted file.

### 2 · `check.mjs` gave installed users four failures they could not fix

Run from a plugin cache against a foreign repo it reported `.claude/skills is missing`,
`save-prompt.mjs is missing`, and two plugins "not declared" — all about files that must *not*
be in a user's repository. The same "absence where there is none" defect this file had already
fixed twice for the council, in a layout no test exercised.

Fixed, and **the fix was briefly worse than the bug**: the first predicate compared the two roots
for inequality, which is true of the in-repo layout too, so this repository classified itself as
installed and silently stopped checking `.claude/skills`. Weakening a check while fixing a false
positive is the trade that keeps presenting itself here.

### 3 · `kill-audit` left controls disarmed when killed — twice

A session teardown killed it mid-run and `depth-check.mjs` kept its empty-catch rule returning
`null`. Later, `guard-edit.mjs` kept its discard guard rewritten to `if (false)` — **the
workspace's one blocking control, switched off, in a file that read as ordinary.** The only
symptom either time was a couple of unexplained test failures.

**Signal handlers cannot fix this, and that was measured rather than assumed.** SIGTERM and
SIGHUP handlers were added and a probe still found `guard-edit.mjs` mutated after signalling:
this process blocks inside `spawnSync` for minutes, and a JavaScript handler cannot run during a
synchronous call, so the signal queues behind a block that outlasts the shell that sent it.
SIGKILL skips handlers outright.

So the original bytes now go to a **journal on disk before the file is touched**, and the next
run repairs from it — a mechanism that does not require this process to be alive. Proven against
SIGKILL end to end: mutation observed live, process killed, control confirmed disarmed, next run
repaired it and said so.

**A tool whose purpose is proving the controls work must not be the thing that switches one off.**

### 4 · A probe that passed without testing anything

The first SIGTERM probe printed `✅ RESTORED`. It had never printed `during: a mutation is live`
— it signalled *between* mutations, so "restored" was true without the condition ever occurring.
It watched four hand-picked canaries and `kill-audit` mutates `guard-edit.mjs` first, which none
of them covered.

Rewritten to hash every file the audit can touch and to exit **2 — inconclusive** when no
mutation is observed. **A probe that can pass without its condition occurring is worse than no
probe**, because it converts an open question into a false answer.

### 5 · And an over-determined assertion, caught by the audit

`kill-audit` reported `26 caught, 1 SURVIVED`. The survivor was `council-provenance`, and the
fault was the test, not the control: it asserted `status === 1`, and an unpinned council exits 1
down two different paths — the provenance refusal, and the drift check immediately after it. So
deleting the provenance guard changed nothing the test could see.

That is exactly the failure `guard-edit` carries rule ids to prevent, committed by the same hand
that maintains the warning. **One bit cannot say which rule fired**, so the assertion now reads
the reason. Re-run: `27 caught, 0 survived, 0 unresolved`.

### What this run says about the ones it cannot see

`kill-audit` prints its own scope honestly: **12 of 19 refusing controls carry mutations.** Seven
do not, and this run says nothing about them — `ci-code-paths`, `mutation-test`, `nexa-remove`,
`no-product-leakage`, `reflect`, `verify-install`, and `kill-audit` itself. Reading `0 survived`
as "everything is proven" would be the same error as reading a green suite as a correct one.

---

## 2026-07-31 · Autopilot, and the part of it that cannot be built

### What was asked, and what the CLI actually allows

The request: on every response, analyse it; if it is waiting on the user and no input arrives
within a minute, decide for them and continue.

**The mechanism is real and better than expected.** A probe `Stop` hook against the live CLI
returns `last_assistant_message` (the response as text), `transcript_path`, `stop_hook_active`,
`permission_mode`, `cwd`, `session_id`. Returning `{"decision":"block","reason":X}` makes **X the
next instruction**. Codex ships a `Stop` hook at a 900 s timeout, so a model call inside one is
affordable.

**The one-minute wait cannot be built, and this is measured rather than assumed.** `Stop` fires
the instant the turn ends — *before* the human has had any chance to type. The hook is a
subprocess with no channel to the terminal, so it cannot observe typing. Sleeping would freeze
the session for the whole minute with input queued invisibly.

So autopilot is an **explicit mode**, not a timer racing a person. Recorded here so the idea is
not re-attempted from scratch.

### The veto is rules, not a classifier — and the reason is an asymmetry

The danger was never loops; `stop_hook_active` and a budget handle those. It is **answering a
question that reached the human because it was theirs**.

A rule list runs *before* any model is consulted, and the model can only downgrade to silence —
never overturn a veto. **A classifier that is 97% right about "shall I delete this" is 3%
catastrophic**, which is the wrong shape of tool for a consent decision.

The model's own proposal is vetoed too, not just the question: it could answer "go ahead and
push" to a message that named nothing forbidden.

### The veto list vetoed every question in existence

The first version had one rule matching `should i|shall i|do you want`. That matches *"Shall I
run the test suite?"* — the entire use case. **It scored full marks on the refusal half and made
the feature worth nothing.**

Caught only because the suite asserts the *allow* direction as hard as the refusal direction —
the same both-directions rule `guard-coverage` enforces on every control here, arriving as a
live example rather than a principle. Split into two narrow rules: approval-shaped phrasing, and
choices between named alternatives.

The accepted cost is stated in the tests: *"Which file, the reducer or the selector?"* is vetoed
too, and that is fine. **A false veto costs one unattended turn; a false pass costs a
force-push.**

### Three defects the build produced

- **Importing the hook executed it.** The test imported `veto()`, which ran the hook body, which
  read stdin, found none, and exited — the suite printed nothing and exited 0. **A test file that
  silently runs nothing is indistinguishable from one that passes**, and it is the third time
  this session that a green result meant "nothing happened".
- **The hook spawns `claude -p`, and an installed plugin loads this same `Stop` hook in that
  child** — which would spawn another, forever. `NEXA_AUTOPILOT_CHILD=1` makes a marked child
  leave immediately. Not obvious until the recursion is drawn.
- **The CLI's refusal is unreachable from a clone**: the workspace sits directly above the
  plugin, so `projectRoot` always resolves and "no project found" cannot happen. Its fixture had
  to be the installed layout — a test that could not produce the condition it was testing.

### Failing safe was observed, not designed for on paper

During the watched failure the Sonnet child hit `Not logged in` (HOME was redirected). The hook
logged `model declined` and exited 0, leaving the session untouched. Every failure path in this
file ends in exit 0 for that reason: **a broken autopilot must never break a session.**

### How we would know this was wrong

If autopilot ever answers something consequential, the response is to delete the feature rather
than tune the list. The audit log exists to make that judgement possible after the fact — every
decision is recorded with its reason, including the refusals.

# CLAUDE.md

@AGENTS.md

---

Everything above is the contract. This file adds only what is Claude-specific.

**Why the import rather than a copy:** `AGENTS.md` is the cross-tool standard — Codex CLI,
Cursor, Copilot, Aider, Zed and 28+ other tools read it natively, across 60,000+ repositories.
Claude Code does not read it, so it is imported here. **One source of truth, two readers.**
Never let the two files disagree; if you find yourself editing this one with project rules,
they belong in `AGENTS.md`.

## Claude-specific

**Skills.** `.agents/skills/*/SKILL.md` are loaded on demand. Invoke by name when the
situation matches — `spec-first` before writing, `reuse-first` before adding, `review-gate`
before moving a card to `5-verify`.

**Subagents.** Use one for a genuinely parallel, self-contained investigation — a review pass
against a different model than the one that wrote the code (§4 of the contract requires
this), or a broad search. Do not use one to avoid reading the spec.

**They are also the cheapest thing here.** Cost is (context size) × (turns), so a 60k-token
survey read in the main thread is re-billed on every turn after it; the same survey in a
subagent returns a conclusion and costs nothing again. Anything that means reading widely —
many files, a long log, an unfamiliar subsystem — goes to a subagent. Bound command output at
the source (`| head`, `-n`, `--json`), and never re-read a file to confirm an edit that already
reported success.

**Plugins — how §10's "second model, always" is actually wired.** Declared in
`.claude/settings.json` rather than left to whatever happens to be installed, so a fresh
machine fails loudly instead of silently losing the review path.

| Plugin | What it gives us |
|---|---|
| **`codex@openai-codex`** | **Load-bearing.** `/codex:review`, `/codex:rescue`, and a **Stop gate that can BLOCK a turn** when Codex finds something unfixed |
| `ponytail@ponytail` | the laziness ladder, every turn — §5 |
| **`claude-code-setup@claude-plugins-official`** | Anthropic's own **recommender**: reads the codebase and suggests hooks, skills, MCP servers and subagents. **It is read-only and installs nothing** — its SKILL.md says so in bold, and it carries no install command. `nexa-adopt` is the other half: it installs, declares the plugin in `settings.json`, and writes the `docs/DECISIONS.md` line §6 requires — and it **refuses** without `--why` and `--checked`. A third-party *skill* it will not adopt at all; that gate is a reading exercise (`skills/skill-finder`) and a command that appeared to automate it would be read as permission to skip it |
| `code-review` · `feature-dev` · `github` | Anthropic's own review, explorer/architect subagents, PR work |
| `code-simplifier` · `security-guidance` | edit-time simplification and security warnings |
| *your stack's plugins* | **add them yourself** — the SDK you call, the host you deploy to. None ship enabled, because a plugin declared for somebody else's product is a dependency nobody here asked for |
| `typescript-lsp` | symbol-level navigation — serves JavaScript too |

Always `--background`, then `/codex:result`. Always `--effort xhigh`. For a *plan* rather than
a diff, `/plan-review` — a plan is the most expensive thing to get wrong, because everything
after it inherits the mistake.

**Plan mode.** For anything that touches more than three files, plan first. The board's
`2-plan` stage exists for exactly this, and a plan that lives only in chat violates §7.

**The honest reminder.** This project's plan contains **77 disproven claims**, and most were
disproven by measuring rather than reasoning. When you are about to assert a number — a
latency, a cost, a rate — **measure it or mark it as an assumption.** The plan's most
valuable pages are the ones recording where confident reasoning turned out wrong.

## When compacting

Auto-compaction fires around **83.5% of the window and is lossy — it keeps roughly 20–30% of
the detail.** That is the mechanism behind "the agent forgot what it was doing", and it is
worth steering rather than being surprised by.

**Always preserve, in this order:**

1. **The card in `board/3-build/`** — its path and its acceptance criteria, verbatim. It is
   the work; everything else is how you got here
2. **Every file modified this session**, by path. A forgotten edit becomes a duplicate edit
3. **The exact test commands run**, and whether they were green
4. **Any measurement taken** — the number *and* the harness. A number without its method
   becomes an unfalsifiable claim, which is how the 77 got in
5. **Decisions not yet written to `docs/DECISIONS.md`** — and write them before compacting,
   not after

**Safe to drop:** file contents you have already edited, exploratory reads, tool output you
have acted on, and anything the board or `graphify` can answer again on demand.

**Better than relying on it:** finish the card. `skills/context-budget` exists so that a card
fits one window — **if you are near compaction, the honest signal is usually that the card
was too big**, not that the window was too small.

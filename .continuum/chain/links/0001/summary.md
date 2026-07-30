Baseline bootstrap. Repo is NexaClaude-Code-Workspace-Setup (branch DevZonayed/fusilier): a
Claude Code *workspace contract*, not product code. It ships AGENTS.md/CLAUDE.md as the
contract, a 9-stage board (empty), 15 skills (`.agents/skills`, symlinked to `.claude/skills`
and `skills/`), 6 commands, 3 subagents, 8 hook scripts wired in `.claude/settings.json`, 14
gate scripts under `scripts/`, and a CI gate. No `code/` directory exists yet, so the product
suite has nothing to run. First session's work: an audit of which repo resources can and
cannot be packaged as a Claude Code plugin (answer: the skills/commands/agents/hooks/scripts
can; the settings-class and project-state-class resources cannot).

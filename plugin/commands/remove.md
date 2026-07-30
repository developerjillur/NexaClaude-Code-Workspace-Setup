---
description: Undo the workspace this plugin scaffolded into the repository, and stop it coming back
argument-hint: [--dry-run]
---

Remove the scaffolded workspace from this repository: **$ARGUMENTS**

Run it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/nexa-remove.mjs" $ARGUMENTS
```

**Show the user the full list of what was removed**, not a count. They did not ask for these
files to appear, so the least they are owed is an itemised account of them leaving.

Two things worth saying out loud afterwards:

- Removal deletes **only what the manifest recorded**. Anything they wrote into those files
  since — a real decision in `docs/DECISIONS.md`, a card on the board — is deleted with the
  file, because the manifest records paths rather than contents. **Offer `--dry-run` first if
  the repository has been used at all.**
- A **tombstone** is written outside the repository, so opening Claude Code here again will not
  scaffold it a second time. To undo that, delete the tombstone path the command prints.

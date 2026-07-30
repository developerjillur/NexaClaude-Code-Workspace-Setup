# fusilier (NexaClaude-Code-Workspace-Setup) — baseline

**Status:** workspace-contract repo, no product code. Board is empty; no card in any stage.
**Stack:** plain Node ESM (>=20), zero runtime dependencies — deliberate.
**Active decisions:** see `docs/DECISIONS.md`. Model pinned to opus everywhere (§9 of AGENTS.md).
**Do NOT:** edit `plan/**`, `board/6-done/**`, `.env`, `data/**`. No new dependency without a
line in `docs/DECISIONS.md`. No product edit without a card in `board/3-build/` (WIP=1).
**Known drift:** `docs/LEARNED.md` points at commit `1bde24f`, which is not in this repo —
reflection staleness cannot be judged and the next commit will be refused.
`package.json` scripts `council`, `council:*` and `test:council` point at `scripts/council/`
and `.council-src/`, neither of which exists.
**Open threads:** decide whether this workspace's portable half ships as a plugin.

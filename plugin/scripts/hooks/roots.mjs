// Two roots, because there are two trees — and a hook that confuses them fails open on every
// file in the repository, silently.
//
// ── the defect this exists to prevent ────────────────────────────────────────
//
// Until 2026-07-30 all eight hooks computed one root, three `dirname`s up from their own file.
// That is correct for exactly one deployment: a clone where the scripts sit inside the
// workspace they guard. Package the same scripts as a plugin and they run from
// `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`, where, in order:
//
//   · `workspace.config.json` is not there, so `codeDirs()` falls back to `['code']`
//   · `CODE_ABS` becomes `<cache>/code` — a path no user file is ever under
//   · `isCode()` returns false for every real file in the user's project
//   · `guard-edit` reaches `if (!isProductCode) allow()` and exits 0
//
// **The one blocking guard becomes a no-op, for every edit, with no output.** Three of four
// council members traced that path independently (run `…-2c0185`), and it is the same shape as
// the three fail-opens this repo has already shipped. `save-prompt`, `session-end` and
// `pre-compact` are worse than a no-op there: they WRITE, so a cache root would collect every
// project's prompt log into one shared directory.
//
// ── why the plan forbade the fix, which is the part worth remembering ────────
//
// The card that proposed the packaging said: *"the hooks already resolve the workspace root
// themselves — reuse, do not rewrite."* That was false against this very directory. `realish()`
// walks up, but only to resolve symlinks; the config is read once from a fixed root. **A false
// citation in a plan foreclosed the one change that prevents the fail-open** — which is a
// `verify-claims` finding against a plan rather than a card, and the reason this module carries
// its own evidence in comments instead of a summary.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Where these scripts live. **Bundled assets only** — `check.mjs`, `reflect.mjs`, `templates/`.
 * Never the board, never the config, never anything the user edits.
 */
export const PLUGIN_ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

/** A tree that has a board or a config is a workspace someone set up on purpose. */
const looksLikeWorkspace = (p) =>
  isDir(path.join(p, 'board')) || fs.existsSync(path.join(p, 'workspace.config.json'));

/**
 * Walk up from `start` looking for a workspace, bounded.
 *
 * This exists for one layout: the plugin lives at `<workspace>/plugin/`, so a hook script's
 * own location is `<workspace>/plugin/scripts/hooks/`, and three `dirname`s reach `plugin/`
 * rather than the workspace. Node resolves symlinks in `import.meta.url` by default, so the
 * back-links at the repo's traditional paths do not help here — the real path is the plugin's.
 *
 * In an installed plugin the walk finds nothing: `~/.claude/plugins/cache/…` has no board and
 * no config at any level, so it falls through to `CLAUDE_PROJECT_DIR`, which is the point.
 */
function workspaceAbove(start) {
  let cur = start;
  for (let i = 0; i < 4; i++) {
    const parent = path.dirname(cur);
    if (parent === cur) return null;
    if (looksLikeWorkspace(parent)) return parent;
    cur = parent;
  }
  return null;
}

/**
 * The tree the hook is deciding *about*: board, config, code directories, docs, markers.
 *
 * **The order is deliberate and the first rung is not the obvious one.** Preferring
 * `CLAUDE_PROJECT_DIR` unconditionally would have been the tidy answer and it silently changes
 * behaviour that works today: the workspace is often a sibling of the product repo (README
 * Option B), so `CLAUDE_PROJECT_DIR` names the *code* while the board lives in the workspace.
 * The existing suite runs the hooks from this directory with the real environment inherited, so
 * that same reordering would have pointed every fixture at the wrong tree while still passing.
 *
 * So: if the scripts are sitting in a workspace, that workspace is the answer — which is every
 * deployment that works today. `CLAUDE_PROJECT_DIR` is consulted only when they are not, which
 * is exactly the packaged case.
 *
 * @returns {{root: string, source: string, trusted: boolean}} `trusted: false` means the
 *   project could not be located. Callers that refuse must **not** treat that as "nothing to
 *   guard" — that is the fail-open being prevented here.
 */
/**
 * The project root for a **gate script**, which is a different question from the hook one.
 *
 * A gate script has always answered it by taking two `dirname`s from its own location, and that
 * is correct in two of the three deployments — a clone, and the test fixtures, which copy a
 * single script into a temporary tree and run it there. Only the packaged case breaks it, and
 * there the script sits in the plugin cache rather than in the project it is checking.
 *
 * So the question is not "does this look like a workspace" — a fixture does not, and neither
 * does a fresh repo — but **"am I inside the plugin?"**, and `.claude-plugin/plugin.json` is the
 * one marker that answers it unambiguously in all three. Present: consult `projectRoot()`.
 * Absent: two up is the project, exactly as before.
 */
export function projectRootFor(metaUrl) {
  const here = path.dirname(path.dirname(fileURLToPath(metaUrl)));
  if (!fs.existsSync(path.join(here, '.claude-plugin', 'plugin.json'))) {
    return { root: here, source: 'script location', trusted: true };
  }
  // A gate script may fall back to the working directory; a hook may not. See projectRoot.
  return projectRoot({ cwdFallback: true });
}

export function projectRoot({ cwdFallback = false } = {}) {
  if (looksLikeWorkspace(PLUGIN_ROOT)) {
    return { root: PLUGIN_ROOT, source: 'script location', trusted: true };
  }
  const above = workspaceAbove(PLUGIN_ROOT);
  if (above) return { root: above, source: 'workspace above the plugin', trusted: true };
  const env = process.env.CLAUDE_PROJECT_DIR;
  if (env && isDir(env)) {
    return { root: path.resolve(env), source: 'CLAUDE_PROJECT_DIR', trusted: true };
  }
  // **Only for gate scripts, and the distinction is load-bearing.** A gate script is a bare
  // command in a terminal, where nothing guarantees CLAUDE_PROJECT_DIR is set; running
  // `nexa-check` inside a project plainly means that project. A HOOK is different: it is handed
  // its project by Claude Code, and letting it fall back to the working directory means a guard
  // that cannot find the board quietly adopts whatever directory the shell happened to be in —
  // and then answers about the wrong tree instead of refusing. The fixture that proves this
  // caught it: with the fallback shared, the plugin-cache fail-open test went green by
  // resolving to the repository the suite itself was running in.
  if (cwdFallback) {
    const cwd = process.cwd();
    if (looksLikeWorkspace(cwd)) return { root: cwd, source: 'working directory', trusted: true };
    const aboveCwd = workspaceAbove(cwd);
    if (aboveCwd) return { root: aboveCwd, source: 'workspace above the working directory', trusted: true };
  }

  return { root: PLUGIN_ROOT, source: 'script location (no project found)', trusted: false };
}

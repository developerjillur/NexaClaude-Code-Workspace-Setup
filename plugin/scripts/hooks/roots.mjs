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
 * **May we write into this tree at all?** A stricter question than "where is the project", and
 * the one every WRITING hook has to ask.
 *
 * `projectRoot()` answers *which* directory; it says nothing about consent. A repository the
 * bootstrap deliberately declined — somebody else's `board`, an unreadable config, a tombstone
 * — still has a perfectly good project root, and `save-prompt` would happily start a prompt log
 * in it. That is precisely kill-condition 1, arriving through a side door: 5-verify caught
 * `?? docs/` in a fixture the bootstrap had explicitly refused to adopt.
 *
 * So writing requires the marker the bootstrap itself writes. No config, no writing.
 */
export const isAdoptedWorkspace = (p) => fs.existsSync(path.join(p, 'workspace.config.json'));

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
 * **The order, and it has been wrong in both directions.**
 *
 *   1. the scripts are themselves sitting in a workspace  — the old single-root clone
 *   2. `CLAUDE_PROJECT_DIR`                               — authoritative; Claude Code said so
 *   3. a workspace above the plugin                        — `<workspace>/plugin/` in-repo layout
 *   4. the working directory                               — gate scripts only, never hooks
 *
 * Rung 3 was once above rung 2 and that broke `--plugin-dir` from another repository. Rung 2
 * above rung 3 costs README Option B, where the workspace is a sibling and you `cd my-app`.
 * Nothing on disk separates those two cases, so this is a choice rather than a deduction, and
 * the body says which way it went and why.
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
  // **CLAUDE_PROJECT_DIR outranks the walk-up, and that ordering was wrong until a real
  // session proved it.** The walk-up existed for the in-repo layout, where the plugin sits at
  // `<workspace>/plugin/`. Put it first and it also fires when somebody loads this plugin with
  // `--plugin-dir` from a DIFFERENT repository — the normal way to try a plugin before
  // installing it. The hook then resolves to the workspace the plugin was copied from, decides
  // that project is already initialised, and does nothing at all, silently.
  //
  // Found by 5-verify, not by any unit test: the fixtures put the plugin and the project in the
  // same tree, so the two roots agreed and the ordering never mattered.
  //
  // **A trade-off, not a free win — and the comment that used to sit here was false.** It said
  // every clone deployment starts Claude Code *in* the workspace. README Option B does not: the
  // workspace is a SIBLING of the product repo and the instructions say `cd my-app`. There the
  // environment names the code while the board lives next door, and this ordering ignores it.
  //
  // No predicate separates that from the `--plugin-dir` case: in both, the environment names a
  // directory that is not a workspace while a workspace sits above the plugin. Same shape, so
  // one of them must lose.
  //
  // The environment wins — a hook that obeys beats a hook that guesses. Option B keeps working
  // by starting Claude Code in the workspace, or by pointing CLAUDE_PROJECT_DIR at it, and the
  // README says so now rather than this comment pretending there is no conflict.
  const env = process.env.CLAUDE_PROJECT_DIR;
  if (env && isDir(env)) {
    return { root: path.resolve(env), source: 'CLAUDE_PROJECT_DIR', trusted: true };
  }
  const above = workspaceAbove(PLUGIN_ROOT);
  if (above) return { root: above, source: 'workspace above the plugin', trusted: true };
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

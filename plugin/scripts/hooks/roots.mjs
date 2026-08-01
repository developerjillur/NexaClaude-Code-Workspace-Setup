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
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Where these scripts live. **Bundled assets only** — `check.mjs`, `reflect.mjs`, `templates/`.
 * Never the board, never the config, never anything the user edits.
 */
export const PLUGIN_ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

/**
 * Is `p` adopted — i.e. does it carry a `.nexa` marker **file**?
 *
 * ── the bug this exists to kill ─────────────────────────────────────────────
 *
 * The check was `fs.existsSync(path.join(p, '.nexa'))`, and **`~/.nexa` is this plugin's own
 * state directory.** So `existsSync` was true for the user's HOME, and the home directory was
 * detected as an adopted workspace by every caller of `looksLikeWorkspace` and
 * `isAdoptedWorkspace`.
 *
 * Observed end to end: `nexa-autopilot on`, run from `~/Desktop/Experiment/test`, walked up,
 * found "a marker" at `$HOME`, printed *"autopilot ON for /Users/jonayedahamed"* and wrote state
 * to `~/.nexa/projects/-Users-jonayedahamed/`. The Stop hook then resolved a different root,
 * found no state, and stayed silent — autopilot reported ON and was inert, permanently, from
 * every directory.
 *
 * The wider damage is worse than one broken toggle: `isAdoptedWorkspace` is the CONSENT gate for
 * every writing hook. A home directory that answers "yes, adopted" is `save-prompt` and
 * `pre-compact` believing they have permission to write there — kill-condition 1, reached
 * through a predicate rather than a side door.
 *
 * A marker is a file. `bootstrap` writes it with `JSON.stringify`, and nothing else ever should.
 */
const hasMarker = (p) => {
  try { return fs.statSync(path.join(p, MARKER)).isFile(); } catch { return false; }
};

/**
 * A tree that carries any adoption marker is a workspace someone set up on purpose.
 *
 * Three markers, because there are now three vintages and all of them must be recognised:
 * `.nexa` (current), `workspace.config.json` (adopted before 2026-07-30), and a `board/`
 * directory (this repository's own layout, and any workspace adopted before the config existed).
 */
const looksLikeWorkspace = (p) => {
  // **Never the home directory.** ~/.nexa lives there, and a home that answers "workspace" makes
  // every walk-up terminate at it. Defence in depth: hasMarker already refuses the directory
  // case, and this refuses the whole question.
  try { if (path.resolve(p) === path.resolve(os.homedir())) return false; } catch { /* no home */ }
  return hasMarker(p)
    || fs.existsSync(path.join(p, 'workspace.config.json'))
    || isDir(path.join(p, 'board'));
};

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
export const isAdoptedWorkspace = (p) => {
  try { if (path.resolve(p) === path.resolve(os.homedir())) return false; } catch { /* no home */ }
  return hasMarker(p) || fs.existsSync(path.join(p, 'workspace.config.json'));
};

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
  // **An EXPLICIT project outranks an inference about the script's own location**, and that
  // ordering was wrong until the portable runner exposed it.
  //
  // `./nexa bootstrap` vendors a full clone into `<repo>/.nexa-workspace/`, so the scripts then
  // live inside something that looks exactly like a workspace — because it IS one. Every gate run
  // through the runner therefore resolved ROOT to the VENDORED copy and inspected that instead of
  // the adopter's repository. Measured: a commit adding an Anthropic key printed
  // "199 staged file(s) scanned. ✅ No unexplained credentials." and passed. The gate ran, looked
  // at the wrong tree, and returned the code that means all clear — the same shape as every other
  // defect this workspace has catalogued, one layer further out.
  //
  // The comment below already said CLAUDE_PROJECT_DIR outranks the walk-up. It sat underneath a
  // shortcut that made it unreachable whenever the plugin was itself inside a workspace.
  const explicit = process.env.CLAUDE_PROJECT_DIR;
  if (explicit && isDir(explicit) && path.resolve(explicit) !== path.resolve(PLUGIN_ROOT)
      && looksLikeWorkspace(explicit)) {
    return { root: path.resolve(explicit), source: 'CLAUDE_PROJECT_DIR', trusted: true };
  }
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

// ── the third root: where session exhaust goes ───────────────────────────────
//
// A prompt log, compaction notes and a remembered file count are **not project truth**, and
// `.gitignore` has said so in prose since they were written. They were nonetheless stored inside
// the tree, which had two consequences:
//
//   · git will not restore what it does not track, so `git clean -xfd` destroyed the only copy
//     of every prompt ever typed. The guard refuses that command, but a guard is one
//     `touch .nexa-allow-discard` away and covers one repository on one machine
//   · prompts here have carried a VPS root password and an OAuth callback code. Inside the tree
//     they are reachable by an accident — a `git add -f`, a zip, a directory handed to somebody
//
// Moving them out does not sanitise them: `save-prompt` still scrubs on write, and the state
// directory still needs the permissions of a home directory rather than of a repository. This
// removes an accident path, not the secret.

/**
 * A stable name for this workspace's state, which must survive nothing at all except this
 * checkout continuing to exist at this location.
 *
 * **The `nexaId` is preferred and the path hash is a fallback, which looks like the mistake
 * `bootstrap.mjs` already made and is not.** That manifest was keyed by path and broke on a
 * rename, because it records what to *delete* on removal — it has to find work it did earlier.
 * State has no such duty: if a project moves, beginning a fresh log is correct, and the old one
 * is still on disk under the old id rather than lost. So a rename degrades to a new directory
 * here, where it corrupted an uninstall there.
 *
 * `realpathSync` matters for the worktree case — several checkouts of one repository must not
 * collide, and on this machine they are reached through symlinked paths.
 */
export function stateId(root) {
  let real = root;
  try { real = fs.realpathSync(root); } catch { /* unresolvable: name what we were given */ }
  return projectId(real);
}

/**
 * A project directory's name, derived from its absolute path.
 *
 * `/Users/you/work/my-app` → `-Users-you-work-my-app`
 *
 * **Readable on purpose.** The first version keyed by `<basename>-<sha1[0..8]>`, which made
 * `~/.nexa` a list of names nobody could match to a project without running a hash. This is the
 * convention Claude Code already uses for `~/.claude/projects/`, so the directory beside ours
 * reads the same way — `ls ~/.nexa/projects` answers "which project is this" directly.
 *
 * Not reversible, and does not need to be: two paths differing only where a separator sits
 * (`a/b-c` vs `a-b/c`) collide into one name. The consequence is two projects sharing a state
 * directory, which is visible the moment anyone looks, rather than silent. A hash would trade
 * that rare collision for permanent unreadability, and unreadable is the failure that happens
 * every day.
 *
 * Characters outside `[A-Za-z0-9._-]` become `-` so the result is a legal directory name on
 * every filesystem this runs on, including the exFAT volume this repository lives on.
 */
export function projectId(absPath) {
  return path.resolve(absPath).replace(/[^A-Za-z0-9._-]/g, '-');
}

/** The one marker a repository carries once it has been adopted. Holds its project id. */
export const MARKER = '.nexa';

/**
 * **Everything the plugin writes, in one place.**
 *
 * Thirty-odd scripts used to build these paths themselves — `path.join(root, 'board')` in a
 * hook, in a gate, in a test fixture. That is how `board/` and `docs/` came to be scattered
 * across a user's repository in the first place: there was no single answer to "where does this
 * go", so every caller invented one.
 *
 * ── the legacy fallback, which is the whole compatibility story ───────────────
 *
 * A workspace adopted before this change has `board/` and `docs/` **committed** in its
 * repository. Those must keep working and must never be moved (see `migratable` in
 * `bootstrap.mjs`): a directory that is in git belongs to the user, not to us. So each location
 * answers "is the legacy one actually there?" first, and only then points at `~/.nexa`.
 *
 * That means a half-migrated workspace resolves each path independently and correctly, rather
 * than needing all of them to move at once.
 */
export function paths(root) {
  const home = stateRoot(root);
  const legacy = (rel, ...home_) => {
    const inRepo = path.join(root, ...rel);
    if (fs.existsSync(inRepo)) return inRepo;
    return home ? path.join(home, ...home_) : inRepo;
  };
  return {
    /** `~/.nexa/projects/<id>/`, or null when no home directory could be resolved. */
    state: home,
    board: legacy(['board'], 'board'),
    docs: legacy(['docs'], 'docs'),
    templates: legacy(['templates'], 'templates'),
    // The config is a FILE, and the legacy name differs from the new one, so it is spelled out.
    config: fs.existsSync(path.join(root, 'workspace.config.json'))
      ? path.join(root, 'workspace.config.json')
      : (home ? path.join(home, 'config.json') : path.join(root, 'workspace.config.json')),
    // These three never had an in-repo home worth keeping — card 002 moved them out already.
    prompts: home && path.join(home, 'prompts'),
    compactions: home && path.join(home, 'compactions'),
    backups: home && path.join(home, 'backups'),
    manifest: home && path.join(home, 'manifest.json'),
    /** The one-shot discard override. In the repo, because that is where you are told to touch it. */
    allowDiscard: path.join(root, '.nexa-allow-discard'),
  };
}

/**
 * The pipeline — states and transitions — read from `plugin/pipeline.json`.
 *
 * ── the drift this replaces ────────────────────────────────────────────────
 *
 * The nine stages were written out in eight places, and two of the copies already disagreed:
 * `reflect.mjs` iterated eight stages while `check.mjs` iterated nine, and `card-gate`'s
 * requirements were cumulative while `check.mjs`'s were not — so the same board got two
 * different verdicts and CI ran the looser one.
 *
 * Falls back to the literal list when the file cannot be read, because a workspace that cannot
 * enumerate its own stages should degrade to the behaviour it has always had rather than stop.
 * The fallback is the ONLY place the order is still written twice, and it is three lines from
 * the file it mirrors.
 */
const FALLBACK_STATES = ['0-discovery', '0-backlog', '1-spec', '2-plan', '3-build',
  '4-review', '5-verify', '6-done', '7-operate'];

let _pipeline = null;
export function pipeline() {
  if (_pipeline) return _pipeline;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'pipeline.json'), 'utf8'));
    const states = Array.isArray(raw.states) && raw.states.length ? raw.states : FALLBACK_STATES;
    const transitions = (raw.transitions ?? []).filter((t) => t.from && t.to);
    _pipeline = { states, transitions, kinds: raw.kinds ?? {}, loaded: true };
  } catch {
    _pipeline = { states: FALLBACK_STATES, transitions: [], kinds: {}, loaded: false };
  }
  return _pipeline;
}

/** The nine stages, in order. The one list every consumer should use. */
export const stages = () => pipeline().states;

/**
 * Is `from → to` a transition the pipeline defines? Returns the matching entries.
 *
 * `from: "*"` matches any source — used by PARK, because refusing to let somebody stop working
 * on something is not a guardrail.
 */
export function transitionsFor(from, to) {
  return pipeline().transitions.filter((t) => (t.from === from || t.from === '*') && t.to === to);
}

/**
 * The workspace config, and **whether it could be read at all**.
 *
 * ── the fail-open this replaces ─────────────────────────────────────────────
 *
 * `guard-edit` carried its own copy of this, ending `catch { return ['code']; }`. The comment
 * above it argued the fallback was deliberately narrow so a broken config makes the gate
 * *quieter*. That reasoning holds for a config that is **absent** and fails for one that is
 * **corrupt**, and the two were indistinguishable:
 *
 *     echo '{oops' > workspace.config.json
 *
 * In a project whose real `codeDirs` is `["src"]`, that one write silently returns the guard to
 * `["code"]`, a directory that does not exist, so `isProductCode` is false for every file and
 * `guard-edit` allows every edit. No log, no refusal, no diff anywhere — the single blocking
 * control in the workspace, switched off by a malformed brace.
 *
 * So the two cases are now separated. Absent → the narrow default, which is the original and
 * correct instinct. Present but unparseable → `ok: false`, and **every caller that refuses must
 * refuse**. A config nobody can read is not a config that permits everything.
 *
 * @returns {{ok: boolean, config: object, why?: string, missing?: boolean}}
 */
export function readConfig(root) {
  const file = paths(root).config;
  if (!fs.existsSync(file)) return { ok: true, missing: true, config: {} };
  try {
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return { ok: false, config: {}, why: `${file} is not a JSON object` };
    }
    return { ok: true, config };
  } catch (e) {
    return { ok: false, config: {}, why: `${file} does not parse — ${e.message}` };
  }
}

/**
 * The directories holding PRODUCT CODE, and the one place that decides.
 *
 * `['code']` is the narrow default for a project that has not said. `ok: false` means the
 * config exists and is broken — see `readConfig`. Callers that refuse on `!ok` are the reason
 * this returns the flag instead of swallowing it.
 *
 * @returns {{ok: boolean, dirs: string[], why?: string}}
 */
export function codeDirs(root) {
  const r = readConfig(root);
  if (!r.ok) return { ok: false, dirs: ['code'], why: r.why };
  const dirs = Array.isArray(r.config.codeDirs)
    ? r.config.codeDirs.filter((d) => typeof d === 'string' && d) : [];
  return { ok: true, dirs: dirs.length ? dirs : ['code'] };
}

/**
 * The council, cloned once and shared by every project.
 *
 * It used to be a clone **inside each repository** (`.council-src/`) reached by four symlinks —
 * which were tracked in git, dangled in a fresh clone, and were skipped on install, silently
 * removing `/council` and everything behind it. Making it a marketplace dependency fixed that
 * and cost users a fourth `marketplace add`.
 *
 * One clone in `~/.nexa/council/` has neither problem: nothing enters the user's repository,
 * nothing is vendored into git, and the commands ship as real files that delegate here.
 *
 * **The risk this re-accepts, stated plainly.** `council-sync.mjs` documented why the council is
 * never *copied*: a stale copy once carried a UTF-8 corruption bug that silently damaged every
 * council answer longer than one pipe buffer. A clone is not a copy — it can be updated and it
 * reports its own commit — but a clone nobody updates goes stale just as quietly. `check.mjs`
 * therefore prints its commit on every run, which is the only reason this is safe to do.
 *
 * ── SUPERSEDED 2026-07-30: the council now ships INSIDE this plugin ──────────
 *
 * Every argument above was about *maintenance*, and none of them was about possibility. A core
 * feature that needs a second install step is not a core feature — the clone was still a fetch
 * the user had to run before `/council` existed at all.
 *
 * So it is vendored again, at `scripts/council/`, and this is version 1 **without the mistake
 * that sank it**: the original rewrote every path for this workspace's deeper layout, and the
 * rewriting is what failed. This copies verbatim. `scripts/council/` reaches nothing outside
 * itself — measured, not assumed — so there is no moving layout to chase.
 *
 * **Staleness is handled by naming it rather than hoping.** `.vendored-from` records the
 * upstream commit and date, `nexa-council-update` re-vendors and reports drift, and `check.mjs`
 * prints the pinned commit on every run. A copy whose provenance is written down is a different
 * thing from a copy nobody can date — the 2026 copy was neither pinned nor dated, which is why
 * nobody noticed it had been wrong for a week.
 *
 * `NEXA_COUNCIL_DIR` still overrides, for running against a working clone during development.
 */
export function councilDir() {
  const env = process.env.NEXA_COUNCIL_DIR;
  if (env) return path.resolve(env);
  return path.join(PLUGIN_ROOT, 'scripts', 'council');
}

/**
 * The base directory for this workspace's state, or `null` when none can be resolved.
 *
 * `~/.nexa/workspaces/<id>/` rather than the `~/.workspace/` originally suggested: an unprefixed
 * top-level dotdir in a shared home is a collision waiting for the second tool that wants it,
 * and `.nexa` matches the `NEXA_` prefix every environment variable in this repository uses.
 *
 * `NEXA_STATE_DIR` overrides, and `path.resolve` deliberately resolves a relative value against
 * the working directory rather than the project — an override that silently re-anchored itself
 * to a tree the caller was not thinking about would be worse than no override.
 */
/** `~/.nexa/projects`, or null when there is no home directory to put it in. */
function projectsBase() {
  try {
    const home = os.homedir();
    return home ? path.join(home, '.nexa', 'projects') : null;
  } catch { return null; }
}

/** The stable id a repository carries in its `.nexa` marker, or null if it has none. */
export function markerId(root) {
  try {
    const raw = fs.readFileSync(path.join(root, MARKER), 'utf8');
    const id = JSON.parse(raw)?.nexaId;
    return typeof id === 'string' && id ? id : null;
  } catch { return null; }
}

/**
 * Where this project's directory is, reconciling a **moved or renamed repository**.
 *
 * ── why this is not simply `projects/<path>` ─────────────────────────────────
 *
 * A path-derived name is readable, which is the whole reason for it. It is also **not stable**:
 * rename the repository and the derived name changes. When only a prompt log lived there that
 * was acceptable and card 002 said so — a moved project starting a fresh log loses nothing.
 *
 * It stopped being acceptable the moment `board/` and `docs/` moved in. A rename would orphan
 * the user's board, their decision history and their cards, leaving them present on disk under
 * a name nothing points at any more — which is `bootstrap.mjs`'s original manifest bug, with
 * more to lose.
 *
 * So the readable name is a *label*, and the `.nexa` marker's id is the *identity*. When the
 * expected directory is missing, the sibling directories are searched for the matching id and
 * the winner is renamed into place. Self-healing, with no index file to fall out of date — the
 * failure mode of an index is that it disagrees with the disk, and then you need a third thing
 * to decide which is right.
 *
 * The scan only runs when the expected directory is absent, which is once per move.
 */
export function stateRoot(root) {
  const env = process.env.NEXA_STATE_DIR;
  if (env) return path.resolve(env);
  const base = projectsBase();
  if (!base) return null;

  let real = root;
  try { real = fs.realpathSync(root); } catch { /* unresolvable: label what we were given */ }
  const want = path.join(base, projectId(real));
  if (fs.existsSync(want)) return want;

  const id = markerId(root);
  if (id) {
    let found = null;
    try {
      for (const e of fs.readdirSync(base, { withFileTypes: true })) {
        if (!e.isDirectory()) continue;
        const dir = path.join(base, e.name);
        try {
          if (fs.readFileSync(path.join(dir, '.nexa-id'), 'utf8').trim() === id) { found = dir; break; }
        } catch { /* not this one */ }
      }
    } catch { /* no projects directory yet */ }
    // A failed rename is not fatal: keep using the directory where it actually is, so a
    // permission problem costs a tidy name rather than the board.
    if (found && found !== want) {
      try { fs.renameSync(found, want); } catch { return found; }
    }
  }
  return want;
}

/** Where each kind of state used to live, inside the repository. Migrated once, on first use. */
const LEGACY = {
  prompts: path.join('docs', 'prompts'),
  compactions: path.join('docs', 'compactions'),
  '.prompt-check-state.json': path.join('docs', '.prompt-check-state.json'),
};

/**
 * Move the in-repo copy to its new home, once.
 *
 * `rename` first because it is atomic and cheap, then `cpSync` because `rename` fails with
 * EXDEV across filesystems — not an exotic case here, where the repository sits on exFAT and the
 * home directory does not. **The copy path deliberately leaves the original in place**: deleting
 * a source we have just copied across a filesystem boundary is the one step in this that could
 * lose data, and keeping a stale duplicate is the cheaper mistake.
 */
function migrate(legacy, target) {
  try {
    fs.renameSync(legacy, target);
  } catch {
    try { fs.cpSync(legacy, target, { recursive: true }); } catch { /* leave both alone */ }
  }
}

/**
 * Resolve a state path, migrating the legacy in-repo location on first use.
 *
 * @returns {string|null} `null` when no state root can be resolved. **Callers must then write
 *   nothing** — this is the same rule as `trusted: false` in `projectRoot`, for the same reason:
 *   a writer that cannot say where it is must not guess, or it collects every project it is
 *   loaded in into one shared directory.
 */
export function statePath(root, name) {
  const base = stateRoot(root);
  if (!base) return null;
  const target = path.join(base, name);
  try {
    fs.mkdirSync(base, { recursive: true });
    const legacy = LEGACY[name] && path.join(root, LEGACY[name]);
    // **Never clobber.** A target that already exists is the live log; a legacy directory beside
    // it is history somebody kept on purpose. Overwriting the first with the second would be a
    // data-loss bug of exactly the shape 4-review caught in `bootstrap.mjs`, where a stale
    // `.pre-nexa` backup was restored over live settings.
    if (legacy && fs.existsSync(legacy) && !fs.existsSync(target)) migrate(legacy, target);
  } catch {
    return null;
  }
  return target;
}

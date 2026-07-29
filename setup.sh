#!/usr/bin/env bash
# One command, from a fresh clone to a working workspace.
#
#   ./setup.sh                      set this directory up, ask where your code is
#   ./setup.sh --code ../my-app     non-interactive: point it at a sibling repo
#   ./setup.sh --check              report what is missing, change nothing
#   ./setup.sh --skip-plugins       everything except the Claude Code plugins
#
# ── What this will and will not do ───────────────────────────────────────────
#
# It installs the tools the contract names, registers the plugins the settings
# declare, writes workspace.config.json, links the contract into your code repo,
# and then RUNS THE GATE — because a setup script that finishes without proving
# anything is the shape this workspace exists to refuse.
#
# It will not: install Node, install Claude Code, log you into anything, or
# guess where your code lives. Each of those either needs a decision or needs a
# package manager it has no business choosing for you.
#
# Every step reports one of three things, and never anything else:
#     ok       done, or already true
#     SKIP     deliberately not done, with the reason
#     FAIL     tried and failed, with the command to run by hand
#
# It is idempotent. Run it twice; the second run should be all `ok` and `SKIP`.

set -uo pipefail        # NOT -e: a step that fails must be REPORTED, not silently fatal

# ── output ───────────────────────────────────────────────────────────────────
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  B=$'\033[1m'; D=$'\033[2m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; X=$'\033[0m'
else B=''; D=''; G=''; Y=''; R=''; X=''; fi

OK=0; SKIPPED=0; FAILED=0
declare -a FAILURES=()

ok()   { printf '  %sok%s    %s\n' "$G" "$X" "$1"; OK=$((OK+1)); }
skip() { printf '  %sSKIP%s  %s%s\n' "$Y" "$X" "$1" "${2:+ ${D}— $2${X}}"; SKIPPED=$((SKIPPED+1)); }
die()  { printf '  %sFAIL%s  %s\n' "$R" "$X" "$1"; [ -n "${2:-}" ] && printf '        %stry: %s%s\n' "$D" "$2" "$X"; FAILED=$((FAILED+1)); FAILURES+=("$1"); }
head_() { printf '\n%s── %s %s\n' "$B" "$1" "$X"; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT" || exit 1

CHECK_ONLY=0; SKIP_PLUGINS=0; CODE_DIR=""
while [ $# -gt 0 ]; do
  case "$1" in
    --check) CHECK_ONLY=1 ;;
    --skip-plugins) SKIP_PLUGINS=1 ;;
    --code) CODE_DIR="${2:-}"; shift ;;
    --code=*) CODE_DIR="${1#*=}" ;;
    -h|--help) sed -n '2,28p' "$0" | sed 's|^# \{0,1\}||'; exit 0 ;;
    *) printf 'unknown option: %s (try --help)\n' "$1" >&2; exit 2 ;;
  esac
  shift
done

printf '%s\n' "════════════════════════════════════════════════════════════════════"
printf '  %sNexaClaude Code Workspace — setup%s\n' "$B" "$X"
printf '%s\n' "════════════════════════════════════════════════════════════════════"
[ "$CHECK_ONLY" = 1 ] && printf '  %s--check: reporting only, nothing will be changed.%s\n' "$D" "$X"

# Returns 3 in --check mode so callers can tell "not attempted" from "attempted and failed".
# Conflating those two was the first bug this script had: --check reported five FAILs for
# things it had simply declined to do.
run() { if [ "$CHECK_ONLY" = 1 ]; then return 3; fi; "$@" >/dev/null 2>&1; }
# would(): the standard three-way. $1 is what it is, $2 the command to run by hand.
would() { local what="$1" cmd="$2"; if [ "$CHECK_ONLY" = 1 ]; then skip "$what" "would run: $cmd"; return 3; fi; return 0; }

# ── 1 · prerequisites, which are not installed for you ──────────────────────
head_ "Prerequisites"

if ! command -v node >/dev/null 2>&1; then
  die "node is not installed" "https://nodejs.org — version 20 or newer"
else
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [ "$NODE_MAJOR" -ge 20 ] 2>/dev/null; then ok "node $(node -v)"
  else die "node $(node -v) is too old — 20 or newer is required" "https://nodejs.org"; fi
fi

command -v git >/dev/null 2>&1 && ok "git $(git --version | awk '{print $3}')" || die "git is not installed" "xcode-select --install, or your package manager"

if command -v claude >/dev/null 2>&1; then ok "claude code"
else die "claude code is not installed" "https://claude.com/claude-code — the workspace configures it, it cannot install it"; fi

# ── 2 · the tools the contract names ────────────────────────────────────────
head_ "Tools the contract names"

# graphify — the code graph agents are told to query before reading files.
if command -v graphify >/dev/null 2>&1; then ok "graphify"
elif command -v uv >/dev/null 2>&1; then
  if ! would "graphify" "uv tool install graphifyy"; then :
  elif run uv tool install graphifyy; then ok "graphify (uv tool install graphifyy)"
  else die "graphify install failed" "uv tool install graphifyy"; fi
elif command -v pipx >/dev/null 2>&1; then
  if run pipx install graphifyy; then ok "graphify (pipx)"; else die "graphify install failed" "pipx install graphifyy"; fi
else
  skip "graphify" "needs uv or pipx — install one, or: pip install graphifyy"
fi

# vibesec — the security scan the deploy gate opens with.
if command -v vibesec >/dev/null 2>&1; then ok "vibesec"
elif command -v npm >/dev/null 2>&1; then
  if ! would "vibesec" "npm install -g vibesec"; then :
  elif run npm install -g vibesec; then ok "vibesec (npm -g)"; else die "vibesec install failed" "npm install -g vibesec"; fi
else skip "vibesec" "needs npm"; fi

# codex — the second model on the review path. AGENTS.md §10 is not optional.
if command -v codex >/dev/null 2>&1; then ok "codex cli"
else skip "codex cli" "the review path wants a second vendor — https://github.com/openai/codex"; fi

# ── 3 · the plugins the settings declare ────────────────────────────────────
head_ "Claude Code plugins"

if [ "$SKIP_PLUGINS" = 1 ]; then
  skip "all plugins" "--skip-plugins"
elif ! command -v claude >/dev/null 2>&1; then
  skip "all plugins" "claude code is not installed"
else
  # Read them from settings.json rather than a list here — two lists drift, and this file
  # would be the one nobody updates.
  MARKETS="$(node -e '
    try { const d = require("./.claude/settings.json");
      for (const [n, v] of Object.entries(d.extraKnownMarketplaces ?? {})) {
        const s = v?.source ?? v; const repo = s?.repo ?? s?.source ?? "";
        if (repo) console.log(`${n}\t${repo}`);
      } } catch {}' 2>/dev/null)"
  PLUGINS="$(node -e '
    try { console.log(Object.keys(require("./.claude/settings.json").enabledPlugins ?? {}).join("\n")); } catch {}' 2>/dev/null)"

  INSTALLED="$(claude plugin list 2>/dev/null || true)"
  MARKETLIST="$(claude plugin marketplace list 2>/dev/null || true)"

  while IFS=$'\t' read -r name repo; do
    [ -z "${name:-}" ] && continue
    if printf '%s' "$MARKETLIST" | grep -qE "❯[[:space:]]+$name\$|❯[[:space:]]+$name[[:space:]]"; then ok "marketplace $name"
    elif ! would "marketplace $name" "claude plugin marketplace add $repo"; then :
    elif run claude plugin marketplace add "$repo"; then ok "marketplace $name ($repo)"
    else die "marketplace $name could not be added" "claude plugin marketplace add $repo"; fi
  done <<< "$MARKETS"

  while read -r p; do
    [ -z "${p:-}" ] && continue
    # Match the FULL id. `claude plugin list` prints "❯ name@marketplace" with a status line
    # under it, so grepping the short name missed four plugins that were installed.
    if printf '%s' "$INSTALLED" | grep -qF -- "$p"; then
      if printf '%s' "$INSTALLED" | grep -A3 -F -- "$p" | grep -q 'disabled'; then
        if ! would "plugin $p is installed but DISABLED" "claude plugin enable $p"; then :
        elif run claude plugin enable "$p"; then ok "plugin $p (enabled)"
        else die "plugin $p is disabled and could not be enabled" "claude plugin enable $p"; fi
      else ok "plugin $p"; fi
    elif ! would "plugin $p" "claude plugin install $p"; then :
    elif run claude plugin install "$p"; then ok "plugin $p"
    else die "plugin $p could not be installed" "claude plugin install $p"; fi
  done <<< "$PLUGINS"
fi

# ── 4 · where your code lives ───────────────────────────────────────────────
head_ "Your code"

CURRENT="$(node -e 'try{console.log((require("./workspace.config.json").codeDirs||[]).join(" "))}catch{}' 2>/dev/null)"

if [ -n "$CODE_DIR" ]; then
  if [ "$CHECK_ONLY" = 1 ]; then skip "workspace.config.json" "--check"
  elif node -e '
      const fs=require("fs");
      const cfg=JSON.parse(fs.readFileSync("workspace.config.json","utf8"));
      cfg.codeDirs=[process.argv[1]];
      fs.writeFileSync("workspace.config.json", JSON.stringify(cfg,null,2)+"\n");' "$CODE_DIR" 2>/dev/null
  then ok "codeDirs → $CODE_DIR"
  else die "could not write workspace.config.json" "edit codeDirs by hand"; fi
elif [ -n "$CURRENT" ] && [ "$CURRENT" != "code" ]; then
  ok "codeDirs → $CURRENT (already configured)"
elif [ -e "$ROOT/code" ]; then
  ok "codeDirs → code (the directory exists)"
else
  skip "codeDirs" "still the default 'code' — pass --code ../your-repo, or put your code in ./code"
  printf '        %sthis is the ONE setting that matters: it decides which edits need a card.%s\n' "$D" "$X"
fi

# Link the contract into the code repo, never copy it. Two copies drift silently.
FIRST_CODE="$(node -e 'try{console.log((require("./workspace.config.json").codeDirs||["code"])[0])}catch{console.log("code")}' 2>/dev/null)"
TARGET="$ROOT/$FIRST_CODE"
if [ -d "$TARGET" ] && [ "$TARGET" != "$ROOT" ]; then
  for f in AGENTS.md CLAUDE.md; do
    if [ -e "$TARGET/$f" ]; then ok "$FIRST_CODE/$f"
    elif [ "$CHECK_ONLY" = 1 ]; then skip "$FIRST_CODE/$f" "--check"
    elif ln -s "$(node -e 'const p=require("path");console.log(p.relative(process.argv[1],process.argv[2]))' "$TARGET" "$ROOT/$f")" "$TARGET/$f" 2>/dev/null
    then ok "$FIRST_CODE/$f → symlink (never a copy: two copies drift, and the drift is silent)"
    else die "could not link $f into $FIRST_CODE" "ln -s ../$(basename "$ROOT")/$f $TARGET/$f"; fi
  done
else
  skip "contract link" "no code directory to link into yet"
fi

# ── 5 · prove it, rather than announce it ───────────────────────────────────
head_ "Proving it works"

if [ "$CHECK_ONLY" = 1 ]; then
  skip "the gate and the suites" "--check"
else
  if node scripts/check.mjs >/tmp/nc-check.$$ 2>&1; then
    ok "scripts/check.mjs — $(grep -oE 'All checks pass[^.]*' /tmp/nc-check.$$ | head -1)"
  else
    die "scripts/check.mjs refused — $(grep -oE '[0-9]+ failures?' /tmp/nc-check.$$ | head -1)" "node scripts/check.mjs"
    grep -E '❌' /tmp/nc-check.$$ | head -4 | sed 's/^/        /'
  fi
  rm -f /tmp/nc-check.$$

  for t in tests/*.mjs; do
    [ -e "$t" ] || continue
    out="$(node "$t" 2>&1)"
    line="$(printf '%s' "$out" | grep -oE '[0-9]+ passed, [0-9]+ failed' | tail -1)"
    if [ $? -eq 0 ] && printf '%s' "$line" | grep -q ', 0 failed'; then ok "$t — $line"
    else die "$t — ${line:-did not report}" "node $t"; fi
  done
fi

# ── the summary, which is allowed to be bad news ────────────────────────────
printf '\n%s\n' "════════════════════════════════════════════════════════════════════"
printf '  %s%d ok%s · %s%d skipped%s · %s%d failed%s\n' "$G" "$OK" "$X" "$Y" "$SKIPPED" "$X" "$R" "$FAILED" "$X"

if [ "$FAILED" -gt 0 ]; then
  printf '\n  %sNot ready.%s Each FAIL above carries the command to run by hand.\n' "$R" "$X"
  printf '  %sNothing here retries or works around a failure — a setup script that\n' "$D"
  printf '  hides one leaves you believing in a tool you do not have.%s\n\n' "$X"
  exit 1
fi

if [ "$CHECK_ONLY" = 1 ]; then printf '\n  %s--check only. Run without it to make the changes.%s\n\n' "$D" "$X"; exit 0; fi

cat <<EOF

  ${B}Ready.${X} Three things worth doing before you start:

    1. ${B}Rewrite AGENTS.md §1 and §2.${X} They ship as templates with the
       questions written out. §1 is what the project is and the one constraint
       an agent would otherwise break on day one. §2 starts empty and fills only
       when something is measured.

    2. ${B}Set the freshness marker${X} once you have read the contract:
         node scripts/reflect.mjs --init

    3. ${B}Make a card before you make an edit.${X}
         cp templates/CARD.md board/0-discovery/001-your-thing.md
       An edit to your code with no card in board/3-build is refused — that is
       the point, and \`card-gate\` will tell you which of the five discovery
       questions is unanswered.

  ${D}Everything else loads itself. The skills match on the situation, the hooks
  fire on events, and the gate runs in CI.${X}

EOF

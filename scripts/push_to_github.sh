#!/usr/bin/env bash
#
# push_to_github.sh — bootstrap the YuteStudio repo on GitHub.
#
#   * Initialises git if needed
#   * Adds github.com/DansiDanutz/Youtube-Studio as origin (overridable)
#   * Creates the remote via `gh repo create` if absent
#   * Commits + pushes main
#
# Env:
#   GITHUB_OWNER   default "DansiDanutz"
#   GITHUB_REPO    default "Youtube-Studio"
#   GITHUB_REMOTE  default "origin"
#   GITHUB_BRANCH  default "main"
#   GITHUB_VISIBILITY   "private" (default) or "public"
#
# Usage:   bash scripts/push_to_github.sh
#          GITHUB_VISIBILITY=public bash scripts/push_to_github.sh
set -euo pipefail

GITHUB_OWNER="${GITHUB_OWNER:-DansiDanutz}"
GITHUB_REPO="${GITHUB_REPO:-Youtube-Studio}"
GITHUB_REMOTE="${GITHUB_REMOTE:-origin}"
GITHUB_BRANCH="${GITHUB_BRANCH:-main}"
GITHUB_VISIBILITY="${GITHUB_VISIBILITY:-private}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "→ repo root: $REPO_ROOT"
echo "→ target:    github.com/${GITHUB_OWNER}/${GITHUB_REPO}  (${GITHUB_VISIBILITY})"
echo "→ branch:    ${GITHUB_BRANCH}"

# ----- sanity: tools ---------------------------------------------------------
need() { command -v "$1" >/dev/null 2>&1 || { echo "missing: $1" >&2; exit 2; }; }
need git

# gh is optional — if missing, we skip repo creation and assume it exists.
HAS_GH=0
if command -v gh >/dev/null 2>&1; then
  HAS_GH=1
fi

# ----- .gitignore (only if absent) ------------------------------------------
if [[ ! -f .gitignore ]]; then
  cat > .gitignore <<'GIT'
__pycache__/
*.pyc
.venv/
.env
.env.*
.DS_Store
.pytest_cache/
.mypy_cache/
.ruff_cache/
dist/
build/
*.egg-info/
node_modules/
/tmp/
/.yute-local-storage/
GIT
  echo "→ wrote .gitignore"
fi

# ----- git init --------------------------------------------------------------
if [[ ! -d .git ]]; then
  echo "→ git init"
  git init -b "$GITHUB_BRANCH" >/dev/null
else
  # Ensure branch exists under the desired name.
  CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo HEAD)"
  if [[ "$CURRENT_BRANCH" != "$GITHUB_BRANCH" ]]; then
    if git rev-parse --verify "$GITHUB_BRANCH" >/dev/null 2>&1; then
      git checkout "$GITHUB_BRANCH"
    else
      git checkout -b "$GITHUB_BRANCH"
    fi
  fi
fi

# ----- remote ----------------------------------------------------------------
REMOTE_URL="git@github.com:${GITHUB_OWNER}/${GITHUB_REPO}.git"
if git remote get-url "$GITHUB_REMOTE" >/dev/null 2>&1; then
  CURRENT_URL="$(git remote get-url "$GITHUB_REMOTE")"
  if [[ "$CURRENT_URL" != "$REMOTE_URL" && "$CURRENT_URL" != "https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}.git" ]]; then
    echo "→ updating remote $GITHUB_REMOTE → $REMOTE_URL"
    git remote set-url "$GITHUB_REMOTE" "$REMOTE_URL"
  fi
else
  echo "→ adding remote $GITHUB_REMOTE → $REMOTE_URL"
  git remote add "$GITHUB_REMOTE" "$REMOTE_URL"
fi

# ----- ensure remote repo exists --------------------------------------------
if [[ "$HAS_GH" == "1" ]]; then
  if ! gh repo view "${GITHUB_OWNER}/${GITHUB_REPO}" >/dev/null 2>&1; then
    echo "→ creating remote repo via gh (${GITHUB_VISIBILITY})"
    gh repo create "${GITHUB_OWNER}/${GITHUB_REPO}" \
      --"${GITHUB_VISIBILITY}" \
      --description "YuteStudio — autonomous YouTube production pipeline (100% OSS)" \
      --disable-wiki \
      --source "$REPO_ROOT" \
      --remote "$GITHUB_REMOTE" \
      --push=false >/dev/null
  fi
else
  echo "⚠ gh CLI not installed — assuming github.com/${GITHUB_OWNER}/${GITHUB_REPO} already exists"
fi

# ----- stage + commit --------------------------------------------------------
git add -A

if git diff --cached --quiet; then
  echo "→ nothing to commit"
else
  MSG="${1:-bootstrap: M1 scaffolding (manifest + orchestrator + FastAPI) and M2 render (TTS + FLUX)}"
  git commit -m "$MSG"
  echo "→ committed"
fi

# ----- push ------------------------------------------------------------------
echo "→ pushing $GITHUB_BRANCH → $GITHUB_REMOTE"
git push -u "$GITHUB_REMOTE" "$GITHUB_BRANCH"

echo "✓ done: https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}"

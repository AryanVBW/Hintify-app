#!/usr/bin/env bash
#
# Hintify SnapAssist AI — Automated Build and Release Script
#
# Usage:
#   scripts/release.sh [patch|minor|major]
#
# What it does:
#   1) Bumps version in package.json using `npm version`
#   2) Builds the Electron app via `npm run build` (electron-builder)
#   3) Creates a GitHub Release and uploads build artifacts
#
# Prerequisites:
#   - Node.js and npm installed
#   - git installed and repo is clean (no uncommitted changes)
#   - electron-builder is configured in package.json (already present)
#   - GitHub auth:
#       EITHER: GitHub CLI installed and authenticated (gh auth status)
#       OR:     GH_TOKEN env var set with a Personal Access Token (repo scope)
#   - jq installed (for GitHub API fallback when gh is not available)
#
# Notes:
#   - Repository assumed: AryanVBW/Hintify-app
#   - For private repo releases, ensure GH_TOKEN has `repo` scope.
#   - Uploads artifacts matching the current version from dist/ (e.g., dmg/zip/exe/AppImage/deb/yml/blockmap)
#   - The auto-updater requires the generated latest*.yml files to be included in the release assets.

set -euo pipefail

BUMP_TYPE="${1:-patch}"   # patch|minor|major
if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
  echo "[ERROR] Invalid bump type: $BUMP_TYPE (use: patch|minor|major)" >&2
  exit 1
fi

# Ensure we are at project root (script resides in scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# Basic checks
command -v node >/dev/null || { echo "[ERROR] node not found"; exit 1; }
command -v npm  >/dev/null || { echo "[ERROR] npm not found"; exit 1; }
command -v git  >/dev/null || { echo "[ERROR] git not found"; exit 1; }

# Check working tree state
if [[ -n "$(git status --porcelain)" ]]; then
  echo "[ERROR] Working tree has uncommitted changes. Commit or stash before releasing." >&2
  git status --short
  exit 1
fi

# Derive owner/repo
DEFAULT_OWNER="AryanVBW"
DEFAULT_REPO="Hintify-app"
OWNER="$DEFAULT_OWNER"
REPO="$DEFAULT_REPO"

# Try reading from git remote if available
if git remote get-url origin >/dev/null 2>&1; then
  ORIGIN_URL="$(git remote get-url origin)"
  # Supports SSH and HTTPS formats
  if [[ "$ORIGIN_URL" =~ github.com[:/]{1}([^/]+)/([^/.]+) ]]; then
    OWNER="${BASH_REMATCH[1]}"
    REPO="${BASH_REMATCH[2]}"
  fi
fi

TAG=""
NEW_VERSION=""

# Bump version using npm (creates commit + tag)
# npm version formats commit message using %s for the new version
echo "[INFO] Bumping version ($BUMP_TYPE) via npm..."
npm version "$BUMP_TYPE" -m "chore(release): v%s"
NEW_VERSION=$(node -p "require('./package.json').version")
TAG="v${NEW_VERSION}"
echo "[INFO] New version: $NEW_VERSION (tag: $TAG)"

# Push commit and tag
echo "[INFO] Pushing commit and tag to origin..."
git push origin HEAD
git push origin "$TAG"

# Build app
echo "[INFO] Building application (this may take a while)..."
# Ensure GH_TOKEN is passed so electron-builder can generate updater metadata for private repos
if [[ -n "${GH_TOKEN:-}" ]]; then
  GH_TOKEN="$GH_TOKEN" npm run build
else
  npm run build
fi

dist_dir="${REPO_ROOT}/dist"
if [[ ! -d "$dist_dir" ]]; then
  echo "[ERROR] dist/ not found after build" >&2
  exit 1
fi

# Collect artifacts for this version (include yml, blockmap, installers, zips, etc.)
shopt -s nullglob
# Collect installer files (zip/dmg/exe/AppImage/deb, etc.) that include the new version
# plus auto-updater metadata (*.yml) and blockmaps
assets=(
  "$dist_dir"/*"$NEW_VERSION"*
  "$dist_dir"/*.yml
  "$dist_dir"/*.blockmap
)
# Remove non-existing globs
filtered_assets=()
for a in "${assets[@]}"; do
  if [[ -f "$a" ]]; then filtered_assets+=("$a"); fi
done

if [[ ${#filtered_assets[@]} -eq 0 ]]; then
  echo "[ERROR] No artifacts found for version $NEW_VERSION in dist/" >&2
  exit 1
fi

echo "[INFO] Assets to upload:" 
printf ' - %s\n' "${filtered_assets[@]}"

RELEASE_TITLE="$TAG"
RELEASE_NOTES="Automated release for $TAG"

# Create release via gh if available; otherwise fallback to GitHub API with curl + jq
if command -v gh >/dev/null 2>&1; then
  echo "[INFO] Creating GitHub release using gh CLI..."
  # If release exists, we will update it by uploading assets (gh handles idempotency poorly; handle create errors)
  if gh release view "$TAG" -R "$OWNER/$REPO" >/dev/null 2>&1; then
    echo "[INFO] Release $TAG already exists, uploading assets..."
  else
    gh release create "$TAG" -R "$OWNER/$REPO" -t "$RELEASE_TITLE" -n "$RELEASE_NOTES"
  fi
  gh release upload "$TAG" -R "$OWNER/$REPO" "${filtered_assets[@]}" --clobber
  echo "[SUCCESS] Release $TAG created/updated at https://github.com/$OWNER/$REPO/releases/tag/$TAG"
else
  echo "[INFO] gh not found. Falling back to GitHub API (requires GH_TOKEN and jq)."
  command -v jq >/dev/null || { echo "[ERROR] jq is required for the API fallback."; exit 1; }
  : "${GH_TOKEN:?GH_TOKEN environment variable must be set for API fallback}"

  # Create release (or fetch if exists)
  api_base="https://api.github.com"
  # Check if release exists
  http_status=$(curl -sS -o /dev/null -w "%{http_code}" -H "Authorization: token $GH_TOKEN" "$api_base/repos/$OWNER/$REPO/releases/tags/$TAG")
  if [[ "$http_status" == "200" ]]; then
    echo "[INFO] Release $TAG already exists, fetching data..."
    release_json=$(curl -sS -H "Authorization: token $GH_TOKEN" "$api_base/repos/$OWNER/$REPO/releases/tags/$TAG")
  else
    echo "[INFO] Creating release $TAG via API..."
    release_json=$(curl -sS -X POST "$api_base/repos/$OWNER/$REPO/releases" \
      -H "Authorization: token $GH_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"tag_name\": \"$TAG\", \"name\": \"$RELEASE_TITLE\", \"body\": \"$RELEASE_NOTES\", \"draft\": false, \"prerelease\": false}")
  fi
  upload_url=$(echo "$release_json" | jq -r .upload_url | sed 's/{?name,label}//')
  release_id=$(echo "$release_json" | jq -r .id)
  if [[ -z "$upload_url" || "$upload_url" == "null" ]]; then
    echo "[ERROR] Failed to get upload_url for release $TAG" >&2
    echo "$release_json" | sed -e 's/\"/\"/g'
    exit 1
  fi
  # Upload assets
  for f in "${filtered_assets[@]}"; do
    name="$(basename "$f")"
    echo "[INFO] Uploading $name ..."
    curl -sS -X POST "$upload_url?name=$name" \
      -H "Authorization: token $GH_TOKEN" \
      -H "Content-Type: application/octet-stream" \
      --data-binary @"$f" >/dev/null
  done
  echo "[SUCCESS] Release $TAG created/updated at https://github.com/$OWNER/$REPO/releases/tag/$TAG"
fi

exit 0


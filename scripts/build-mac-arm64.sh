#!/usr/bin/env bash
set -euo pipefail

# Build macOS arm64 DMG and ZIP with signing/notarization when creds are present
# Requirements:
#   - Xcode command line tools
#   - Apple Developer account with:
#       APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
#   - A valid "Developer ID Application" certificate in login keychain (Xcode manages this)
#   - Environment variables (see .env.example)
#
# Fallback: If credentials are missing, builds unsigned dev artifacts using electron-builder-dev.json

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# Ensure we can run local electron-builder reliably
EB_CMD="npx --no-install electron-builder"
if ! $EB_CMD --version >/dev/null 2>&1; then
  # Fallback to local bin path if npx is restricted
  if [ -x "$(pwd)/node_modules/.bin/electron-builder" ]; then
    EB_CMD="$(pwd)/node_modules/.bin/electron-builder"
  else
    echo "[build] electron-builder not found. Run 'npm ci' first." >&2
    exit 127
  fi
fi

missing=()
if [[ "${APPLE_SIGNING:-}" == "1" ]]; then
  [[ -n "${APPLE_ID:-}" ]] || missing+=(APPLE_ID)
  [[ -n "${APPLE_APP_SPECIFIC_PASSWORD:-${APPLE_PASSWORD:-}}" ]] || missing+=(APPLE_APP_SPECIFIC_PASSWORD)
  [[ -n "${APPLE_TEAM_ID:-}" ]] || missing+=(APPLE_TEAM_ID)
fi

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "[build] Missing required env vars for signing/notarization: ${missing[*]}" >&2
  echo "[build] Falling back to dev build. If a local self-signed certificate named 'Hintify Developer' exists, it will be used for signing (NOT notarized)." >&2
  # Try to use local self-signed identity if available to avoid "unidentified developer" prompt during initial launch
  if security find-identity -v -p codesigning | grep -q "Hintify Developer"; then
    echo "[build] Using local codesign identity: Hintify Developer"
    CSC_NAME="Hintify Developer" $EB_CMD --mac --arm64 --config=electron-builder-dev.json
  else
    echo "[build] No local 'Hintify Developer' cert found. Run ./create-certificate.sh to create one. Building unsigned dev artifacts."
    APPLE_SIGNING="" $EB_CMD --mac --arm64 --config=electron-builder-dev.json
  fi
  exit 0
fi

if [[ "${APPLE_SIGNING:-}" == "1" ]]; then
  echo "[build] Building signed arm64 DMG + ZIP with notarization"
  # Use default config in package.json which enables hardened runtime and afterSign hook
  $EB_CMD --mac --arm64
else
  echo "[build] Building unsigned arm64 dev artifacts"
  $EB_CMD --mac --arm64 --config=electron-builder-dev.json
fi

ART_DIR="dist"
ls -lh "$ART_DIR" | sed 's/^/[dist] /'

# Staple notarization tickets (only relevant if APPLE_SIGNING=1)
if [[ "${APPLE_SIGNING:-}" == "1" ]]; then
  echo "[staple] Stapling notarization tickets where applicable..."
  # Staple .app bundle
  APP_DIR="$ART_DIR/mac-arm64" 
  if [[ -d "$APP_DIR" ]]; then
    while IFS= read -r -d '' app; do
      echo "[staple] xcrun stapler staple \"$app\""
      xcrun stapler staple "$app" || true
    done < <(find "$APP_DIR" -maxdepth 1 -name "*.app" -print0)
  fi
  # Staple DMG files
  while IFS= read -r -d '' dmg; do
    echo "[staple] xcrun stapler staple \"$dmg\""
    xcrun stapler staple "$dmg" || true
  done < <(find "$ART_DIR" -maxdepth 1 -name "*.dmg" -print0)
fi

echo "[build] Done. Artifacts in: $ART_DIR"

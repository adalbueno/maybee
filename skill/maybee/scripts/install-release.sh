#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="$(pwd)"
RELEASE_FILE="${MAYBEE_RELEASE_FILE:-}"
RELEASE_URL="${MAYBEE_RELEASE_URL:-https://github.com/adalbueno/maybee/releases/download/v0.1.0/maybee-0.1.0.zip}"
UPDATE=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --workspace) mkdir -p "$2"; WORKSPACE="$(cd "$2" && pwd)"; shift 2 ;;
    --update) UPDATE=1; shift ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [ -n "$RELEASE_FILE" ]; then
  cp "$RELEASE_FILE" "$TMP/release.zip"
else
  command -v curl >/dev/null || { echo 'curl is required to download Maybee.' >&2; exit 1; }
  curl --fail --location --silent --show-error "$RELEASE_URL" --output "$TMP/release.zip"
fi

command -v unzip >/dev/null || { echo 'unzip is required to install Maybee.' >&2; exit 1; }
mkdir -p "$TMP/unpacked"
unzip -q "$TMP/release.zip" -d "$TMP/unpacked"
PACKAGE="$TMP/unpacked/maybee"
[ -f "$PACKAGE/manifest.json" ] || { echo 'Invalid Maybee release: manifest.json is missing.' >&2; exit 1; }

VERSION="$(node -p "require('$PACKAGE/manifest.json').version")"
TARGET="$WORKSPACE/.maybee/package"
mkdir -p "$WORKSPACE/.maybee"
if [ -e "$TARGET" ]; then
  [ "$UPDATE" = 1 ] || { echo "Maybee is already installed at $TARGET. Re-run with --update." >&2; exit 1; }
  BACKUP="$WORKSPACE/.maybee/package.backup.$(date +%Y%m%d-%H%M%S)"
  mv "$TARGET" "$BACKUP"
  echo "Previous package preserved at $BACKUP"
fi
mkdir -p "$TARGET"
cp -a "$PACKAGE/." "$TARGET/"
printf '{\n  "version": "%s",\n  "installedAt": "%s",\n  "workspace": "%s"\n}\n' "$VERSION" "$(date -Iseconds)" "$WORKSPACE" > "$WORKSPACE/.maybee/installation.json"

if [ "${MAYBEE_SKIP_DEPENDENCIES:-0}" != 1 ]; then
  command -v npm >/dev/null || { echo 'Node.js/npm is required to finish Maybee installation.' >&2; exit 1; }
  npm ci --prefix "$TARGET/app" --no-audit --no-fund
  npm install --prefix "$TARGET/app" --no-save --no-audit --no-fund playwright
fi

# Make the bundled bootstrap discoverable by the two first target clients.
# Existing user skills are left untouched; this only owns the Maybee skill path.
for client in .claude .agents; do
  SKILL_TARGET="$WORKSPACE/$client/skills/maybee"
  mkdir -p "$WORKSPACE/$client/skills"
  if [ -e "$SKILL_TARGET" ]; then
    SKILL_BACKUP="$WORKSPACE/.maybee/$client-maybee-backup.$(date +%Y%m%d-%H%M%S)"
    mv "$SKILL_TARGET" "$SKILL_BACKUP"
    echo "Previous $client Maybee skill preserved at $SKILL_BACKUP"
  fi
  cp -a "$PACKAGE/skill/maybee" "$SKILL_TARGET"
done

printf 'Maybee %s installed at %s\n' "$VERSION" "$TARGET"
printf 'Next: node "%s/app/server.js" --project "%s"\n' "$TARGET" "$WORKSPACE"

#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="$(pwd)"
RELEASE_FILE="${MAYBEE_RELEASE_FILE:-}"
RELEASE_URL="${MAYBEE_RELEASE_URL:-https://github.com/adalbueno/maybee/releases/download/v0.1.11/maybee-package-0.1.11.zip}"
UPDATE=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --workspace) mkdir -p "$2"; WORKSPACE="$(cd "$2" && pwd)"; shift 2 ;;
    --update) UPDATE=1; shift ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

download() {
  local url="$1" output="$2"
  if command -v curl >/dev/null 2>&1; then
    curl --fail --location --silent --show-error "$url" --output "$output"
  elif command -v wget >/dev/null 2>&1; then
    wget --quiet --output-document="$output" "$url"
  else
    echo 'Maybee needs curl or wget to download its files.' >&2
    exit 1
  fi
}

extract_zip() {
  local archive="$1" destination="$2"
  if command -v unzip >/dev/null 2>&1; then
    unzip -q "$archive" -d "$destination"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$archive" "$destination"
  else
    echo 'Maybee needs unzip or python3 to unpack its release.' >&2
    exit 1
  fi
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [ -n "$RELEASE_FILE" ]; then
  cp "$RELEASE_FILE" "$TMP/release.zip"
else
  download "$RELEASE_URL" "$TMP/release.zip"
fi

mkdir -p "$TMP/unpacked"
extract_zip "$TMP/release.zip" "$TMP/unpacked"
PACKAGE="$TMP/unpacked/maybee"
[ -f "$PACKAGE/manifest.json" ] || { echo 'Invalid Maybee release: manifest.json is missing.' >&2; exit 1; }

VERSION="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$PACKAGE/manifest.json" | head -n 1)"
[ -n "$VERSION" ] || { echo 'Invalid Maybee release: version is missing.' >&2; exit 1; }
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
printf 'Next action: execute "%s/start.sh" on this machine with user authorization if requested.\n' "$TARGET"

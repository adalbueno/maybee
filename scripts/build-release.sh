#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
APP_SRC="$ROOT/system/app"
SKILLS_SRC="$ROOT/system/skills"
RELEASE_SRC="$ROOT/experiments/maybee-package/release"
BOOTSTRAP_SRC="$ROOT/experiments/maybee-package/skill/maybee"
DIST="$ROOT/experiments/maybee-package/dist"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/maybee" "$DIST"
cp -a "$RELEASE_SRC/." "$STAGE/maybee/"
mkdir -p "$STAGE/maybee/app" "$STAGE/maybee/skills" "$STAGE/maybee/skill/maybee"
cp -a "$BOOTSTRAP_SRC/." "$STAGE/maybee/skill/maybee/"
cp -a "$APP_SRC/." "$STAGE/maybee/app/"
rm -rf "$STAGE/maybee/app/node_modules" "$STAGE/maybee/app/dist" "$STAGE/maybee/app/data"
for skill in "$SKILLS_SRC"/maybee-*; do
  [ -d "$skill" ] && cp -a "$skill" "$STAGE/maybee/skills/"
done
find "$STAGE/maybee" -type d -name '__pycache__' -prune -exec rm -rf {} +

VERSION="$(node -p "require('$STAGE/maybee/manifest.json').version")"
ARCHIVE="$DIST/maybee-$VERSION.zip"
rm -f "$ARCHIVE"
(cd "$STAGE" && zip -qr "$ARCHIVE" maybee)
printf 'Built %s\n' "$ARCHIVE"

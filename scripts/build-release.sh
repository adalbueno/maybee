#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_SRC="$ROOT/source/app"
SKILLS_SRC="$ROOT/source/skills"
RELEASE_SRC="$ROOT/release"
BOOTSTRAP_SRC="$ROOT/skill/maybee"
DIST="$ROOT/dist"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/maybee" "$DIST"
cp -a "$RELEASE_SRC/." "$STAGE/maybee/"
mkdir -p "$STAGE/maybee/app" "$STAGE/maybee/skills" "$STAGE/maybee/skill/maybee"
cp -a "$BOOTSTRAP_SRC/." "$STAGE/maybee/skill/maybee/"
# The app ships built and minified; readable source and build tools stay in this repository.
[ -d "$APP_SRC/node_modules" ] || npm ci --prefix "$APP_SRC" --no-audit --no-fund
VERSION="$(node -p "require('$RELEASE_SRC/manifest.json').version")"
node "$ROOT/scripts/build-app.mjs" "$STAGE/maybee/app" "$DIST/sourcemaps/$VERSION"
for skill in "$SKILLS_SRC"/maybee-*; do
  [ -d "$skill" ] && cp -a "$skill" "$STAGE/maybee/skills/"
done
find "$STAGE/maybee" -type d -name '__pycache__' -prune -exec rm -rf {} +

ARCHIVE="$DIST/maybee-package-$VERSION.zip"
rm -f "$ARCHIVE"
(cd "$STAGE" && zip -qr "$ARCHIVE" maybee)
cp "$ARCHIVE" "$DIST/maybee-package.zip"
printf 'Built %s\n' "$ARCHIVE"

SKILL_STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE" "$SKILL_STAGE"' EXIT
mkdir -p "$SKILL_STAGE/maybee"
cp -a "$BOOTSTRAP_SRC/." "$SKILL_STAGE/maybee/"
SKILL_ARCHIVE="$DIST/maybee-$VERSION.zip"
rm -f "$SKILL_ARCHIVE"
(cd "$SKILL_STAGE" && zip -qr "$SKILL_ARCHIVE" maybee)
cp "$SKILL_ARCHIVE" "$DIST/maybee.zip"
printf 'Built %s\n' "$SKILL_ARCHIVE"

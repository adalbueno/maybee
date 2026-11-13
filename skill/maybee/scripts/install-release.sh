#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="$(pwd)"
RELEASE_FILE="${MAYBEE_RELEASE_FILE:-}"
RELEASE_URL="${MAYBEE_RELEASE_URL:-https://github.com/adalbueno/maybee/releases/latest/download/maybee-package.zip}"
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

seed_default_workspace() {
  local template="$1" target="$WORKSPACE/workspaces/default" source rel destination
  [ -d "$template" ] || return 0
  mkdir -p "$target"
  while IFS= read -r -d '' source; do
    rel="${source#"$template/"}"
    destination="$target/$rel"
    if [ ! -e "$destination" ]; then
      mkdir -p "$(dirname "$destination")"
      cp "$source" "$destination"
    fi
  done < <(find "$template" -type f -print0)
}

version_number() {
  local major minor patch
  IFS=. read -r major minor patch <<< "${1%%[-+]*}"
  echo $(( 10#${major:-0} * 1000000 + 10#${minor:-0} * 1000 + 10#${patch:-0} ))
}

# After an update, add a "What's new" card for each version the user has not seen yet (the latest three at most).
# A fresh install gets none: a new user has nothing to compare against. Cards are only added, never overwritten.
seed_release_cards() {
  local source_dir="$1/whats-new" target="$WORKSPACE/workspaces/default/ideas" file version number previous current total i
  local chosen=()
  [ -n "$PREVIOUS_VERSION" ] && [ -d "$source_dir" ] || return 0
  previous="$(version_number "$PREVIOUS_VERSION")"
  current="$(version_number "$VERSION")"
  while IFS= read -r version; do
    number="$(version_number "$version")"
    if [ "$number" -gt "$previous" ] && [ "$number" -le "$current" ]; then chosen+=("$version"); fi
  done < <(for file in "$source_dir"/*.md; do
             [ -e "$file" ] || continue
             version="$(basename "$file" .md)"
             echo "$(version_number "$version") $version"
           done | sort -n | cut -d' ' -f2)
  total="${#chosen[@]}"
  [ "$total" -gt 0 ] || return 0
  mkdir -p "$target"
  i=$(( total > 3 ? total - 3 : 0 ))
  # Oldest first, so the newest card is the most recently written and sits on top of Now.
  while [ "$i" -lt "$total" ]; do
    version="${chosen[$i]}"
    [ -e "$target/What's new in Maybee $version.md" ] || cp "$source_dir/$version.md" "$target/What's new in Maybee $version.md"
    i=$((i + 1))
  done
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
PREVIOUS_VERSION=""
if [ -f "$WORKSPACE/.maybee/installation.json" ]; then
  PREVIOUS_VERSION="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$WORKSPACE/.maybee/installation.json" | head -n 1)"
fi
TARGET="$WORKSPACE/.maybee/package"
mkdir -p "$WORKSPACE/.maybee"
if [ -e "$TARGET" ]; then
  [ "$UPDATE" = 1 ] || { echo "Maybee is already installed at $TARGET. Re-run with --update." >&2; exit 1; }
  BACKUP="$WORKSPACE/.maybee/package.backup.$(date +%Y%m%d-%H%M%S)"
  chmod -R u+w "$TARGET"
  mv "$TARGET" "$BACKUP"
  # Data the app wrote inside the old package moves to the data folder, once.
  if [ -d "$BACKUP/app/data" ] && [ ! -e "$WORKSPACE/.maybee/data" ]; then
    cp -a "$BACKUP/app/data" "$WORKSPACE/.maybee/data"
  fi
  echo "Previous package preserved at $BACKUP"
fi
mkdir -p "$TARGET"
cp -a "$PACKAGE/." "$TARGET/"
mkdir -p "$WORKSPACE/.maybee/data"
seed_default_workspace "$PACKAGE/workspaces/default"
# RELEASES.md belongs to the package, not to the user: it is replaced on every install so the history stays complete.
if [ -f "$PACKAGE/workspaces/default/RELEASES.md" ]; then
  cp "$PACKAGE/workspaces/default/RELEASES.md" "$WORKSPACE/workspaces/default/RELEASES.md"
fi
seed_release_cards "$PACKAGE"
printf '{\n  "version": "%s",\n  "installedAt": "%s",\n  "workspace": "%s"\n}\n' "$VERSION" "$(date -Iseconds)" "$WORKSPACE" > "$WORKSPACE/.maybee/installation.json"

# Make Maybee's skills discoverable by the two first target clients: the bootstrap skill and the skills the package ships.
# Existing user skills are left untouched; this only owns the paths of Maybee's own skills.
install_skill() {
  local name="$1" source_dir="$2" client target backup
  for client in .claude .agents; do
    target="$WORKSPACE/$client/skills/$name"
    mkdir -p "$WORKSPACE/$client/skills"
    if [ -e "$target" ]; then
      # An identical copy is simply refreshed; one the user changed is kept as a backup first.
      if ! diff -rq "$source_dir" "$target" >/dev/null 2>&1; then
        backup="$WORKSPACE/.maybee/$client-$name-backup.$(date +%Y%m%d-%H%M%S)"
        mv "$target" "$backup"
        echo "Previous $client $name skill preserved at $backup"
      else
        rm -rf "$target"
      fi
    fi
    cp -a "$source_dir" "$target"
  done
}
install_skill maybee "$PACKAGE/skill/maybee"
if [ -d "$PACKAGE/skills" ]; then
  for skill_dir in "$PACKAGE"/skills/*/; do
    [ -f "${skill_dir}SKILL.md" ] && install_skill "$(basename "$skill_dir")" "${skill_dir%/}"
  done
fi

# The installed package is the product, not a project file: make it read-only so it is not edited by accident.
# Updates unlock it first; start.sh unlocks only the app folder while it installs dependencies.
chmod -R a-w "$TARGET"

printf 'Maybee %s installed at %s\n' "$VERSION" "$TARGET"
printf 'Next action: execute "%s/start.sh" on this machine with user authorization if requested.\n' "$TARGET"

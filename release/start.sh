#!/usr/bin/env bash
set -euo pipefail

PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE="$(cd "$PACKAGE_DIR/../.." && pwd)"
APP_DIR="$PACKAGE_DIR/app"
NODE_VERSION="${MAYBEE_NODE_VERSION:-22.14.0}"
PORT="${PORT:-8780}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --project) WORKSPACE="$(cd "$2" && pwd)"; shift 2 ;;
    *) break ;;
  esac
done

download() {
  if command -v curl >/dev/null 2>&1; then
    curl --fail --location --silent --show-error "$1" --output "$2"
  elif command -v wget >/dev/null 2>&1; then
    wget --quiet --output-document="$2" "$1"
  else
    echo 'Maybee needs curl or wget to download its runtime.' >&2
    exit 1
  fi
}

ensure_node() {
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    NODE_BIN="$(dirname "$(command -v node)")"
    return
  fi
  local os arch platform archive url
  os="$(uname -s)"
  arch="$(uname -m)"
  case "$os:$arch" in
    Linux:x86_64) platform="linux-x64" ;;
    Linux:aarch64|Linux:arm64) platform="linux-arm64" ;;
    Darwin:x86_64) platform="darwin-x64" ;;
    Darwin:arm64) platform="darwin-arm64" ;;
    *) echo "Cannot install Node.js automatically on $os/$arch." >&2; exit 1 ;;
  esac
  mkdir -p "$RUNTIME_DIR"
  archive="$(mktemp)"
  trap 'rm -f "$archive"' EXIT
  url="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${platform}.tar.xz"
  echo "Node.js/npm not found; installing a local runtime..."
  download "$url" "$archive"
  tar -xJf "$archive" -C "$RUNTIME_DIR" --strip-components=1
  NODE_BIN="$RUNTIME_DIR/bin"
}

platform_id() {
  printf '%s-%s\n' "$(uname -s | tr '[:upper:]' '[:lower:]')" "$(uname -m)"
}

PLATFORM="$(platform_id)"
RUNTIME_DIR="$WORKSPACE/.maybee/runtime/$PLATFORM"

ensure_dependencies() {
  local platform="$1"
  local marker="$WORKSPACE/.maybee/deps.json"
  if [ -d "$APP_DIR/node_modules" ] && [ -f "$marker" ] && grep -q '"platform": "'$platform'"' "$marker"; then
    return
  fi
  echo "Preparing Maybee dependencies for $platform..."
  "$NODE_BIN/npm" ci --prefix "$APP_DIR" --no-audit --no-fund
  printf '{\n  "platform": "%s",\n  "installedAt": "%s"\n}\n' "$platform" "$(date -Iseconds)" > "$marker"
}

mkdir -p "$WORKSPACE/.maybee"
ensure_node
ensure_dependencies "$PLATFORM"
MAYBEE_ACCESS_MODE="${MAYBEE_ACCESS_MODE:-agent-browser}" PORT="$PORT" exec "$NODE_BIN/node" "$APP_DIR/server.js" --project "$WORKSPACE" "$@"

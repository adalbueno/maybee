#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${PORT:-8780}"

"$SCRIPT_DIR/start.sh" "$@" &
SERVER_PID=$!
cleanup() { kill "$SERVER_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

for _ in $(seq 1 60); do
  if command -v curl >/dev/null 2>&1 && curl --silent --fail "http://127.0.0.1:$PORT/api/access" >/dev/null 2>&1; then
    open "http://127.0.0.1:$PORT"
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    wait "$SERVER_PID"
  fi
  sleep 1
done

wait "$SERVER_PID"

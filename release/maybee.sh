#!/usr/bin/env bash
# Maybee's own commands, so an agent runs one fixed command instead of remembering a sequence.
#   maybee.sh [up] [--agent claude|codex]   make everything run: the app, and the listener (the default)
#   maybee.sh start   [--agent ...]         start the app, and the listener
#   maybee.sh stop                          stop the listener and the app
#   maybee.sh restart [--agent ...]         stop, then start
#   maybee.sh listen  [--agent ...]         start only the listener
#   maybee.sh status                        say what is running
# Codex: the listener runs in the background and resumes the session for each request, until `stop`.
# Claude: the listener has to run under Claude's Monitor tool, so `listen --agent claude` stays in the foreground.
set -uo pipefail

# Inside Codex's sandbox this script would lie: it cannot see the other processes or the local port, so `status` says "not
# running" about an app that runs, and `up` tries to start a second one. A sandboxed command is told apart by Codex's own
# folder: writable when the command runs outside the sandbox, read-only inside it. (The variable CODEX_SANDBOX_NETWORK_DISABLED
# does not tell them apart: it is set for approved commands too.)
if [ -n "${CODEX_THREAD_ID:-}${CODEX_SESSION_ID:-}" ]; then
  CODEX_FOLDER="${CODEX_HOME:-$HOME/.codex}"
  if [ -d "$CODEX_FOLDER" ] && [ ! -w "$CODEX_FOLDER" ]; then
    echo "maybee.sh cannot work inside Codex's sandbox: it cannot see the app or the listener from here." >&2
    echo "Run the same command again outside the sandbox (ask for the permission to run it outside the sandbox)." >&2
    exit 3
  fi
fi

PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE="$(cd "$PACKAGE_DIR/../.." && pwd)"
APP_DIR="$PACKAGE_DIR/app"
DATA="$WORKSPACE/.maybee/data"
PLATFORM="$(printf '%s-%s' "$(uname -s | tr '[:upper:]' '[:lower:]')" "$(uname -m)")"

if command -v node >/dev/null 2>&1; then NODE=node
elif [ -x "$WORKSPACE/.maybee/runtime/$PLATFORM/bin/node" ]; then NODE="$WORKSPACE/.maybee/runtime/$PLATFORM/bin/node"
else NODE=node; fi

CMD="${1:-up}"; [ "$#" -gt 0 ] && shift
AGENT=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --agent) AGENT="${2:-}"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done
case "$AGENT" in ""|claude|codex) ;; *) echo "--agent is claude or codex." >&2; exit 2 ;; esac

# The agent: the flag, else the one whose session id is in the environment. Both set (a Codex started from Claude) is unclear.
agent_of_session() {
  if [ -n "$AGENT" ]; then echo "$AGENT"; return; fi
  local c="${CLAUDE_CODE_SESSION_ID:-}" x="${CODEX_THREAD_ID:-${CODEX_SESSION_ID:-}}"
  if [ -n "$c" ] && [ -z "$x" ]; then echo claude
  elif [ -n "$x" ] && [ -z "$c" ]; then echo codex
  else echo ""; fi
}

# One line of JSON in, one field out.
json_field() { "$NODE" -e 'try{const o=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=o[process.argv[2]];if(v!==undefined)console.log(v)}catch{}' "$1" "$2"; }

server_file() {
  local name
  name="$(json_field "$WORKSPACE/.maybee/active-workspace.json" name)"
  [ -n "$name" ] && [ -d "$WORKSPACE/workspaces/$name" ] && echo "$WORKSPACE/workspaces/$name/.maybee/server.json" || echo "$WORKSPACE/.maybee/server.json"
}
app_url() {
  local f url; f="$(server_file)"; [ -f "$f" ] || return 1
  url="$(json_field "$f" url)"; [ -n "$url" ] || return 1
  "$NODE" -e 'fetch(process.argv[1],{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))' "$url" && echo "$url"
}

listener_pid() {
  local f="$DATA/listener.pid" pid
  [ -f "$f" ] || return 1
  pid="$(json_field "$f" pid)"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && ps -p "$pid" -o args= 2>/dev/null | grep -q 'listen\.js' && echo "$pid"
}

start_app() {
  local url
  if url="$(app_url)"; then echo "app: already running at $url"; return 0; fi
  mkdir -p "$DATA"
  # --detach: the app runs in a session of its own and this returns once it is up (the first start also prepares the
  # runtime and the dependencies, which takes a while). Codex stops what a command leaves behind; Node starts it apart.
  if "$PACKAGE_DIR/start.sh" --detach < /dev/null; then
    url="$(app_url)" && echo "app: started at $url" && return 0
  fi
  echo "app: did not come up." >&2; return 1
}

start_listener() {
  local agent pid; agent="$(agent_of_session)"
  if [ -z "$agent" ]; then echo "listener: which agent is this? Pass --agent claude or --agent codex." >&2; return 2; fi
  if [ "$agent" = claude ]; then
    echo "listener: for Claude it has to run under the Monitor tool, with the longest timeout (1800000):"
    echo "  $PACKAGE_DIR/maybee.sh listen --agent claude"
    return 0
  fi
  if pid="$(listener_pid)" && [ "$(json_field "$DATA/listener.pid" mode)" = resume ]; then echo "listener: already running (codex, pid $pid)"; return 0; fi
  mkdir -p "$DATA"
  if "$NODE" "$APP_DIR/scripts/listen.js" --resume --agent codex --detach < /dev/null; then
    sleep 1
    if pid="$(listener_pid)"; then echo "listener: running (codex, pid $pid), resuming this session for each request"; return 0; fi
  fi
  echo "listener: did not start." >&2; return 1
}

stop_listener() {
  local pid
  if pid="$(listener_pid)"; then kill "$pid" 2>/dev/null; echo "listener: stopped (pid $pid)"; else echo "listener: not running"; rm -f "$DATA/listener.pid"; fi
}
stop_app() {
  local f url token; f="$(server_file)"
  if ! url="$(app_url)"; then echo "app: not running"; return 0; fi
  token="$(json_field "$f" token)"
  if "$NODE" -e 'fetch(process.argv[1]+"/api/instance/stop",{method:"POST",headers:{Authorization:"Bearer "+process.argv[2],"Content-Type":"application/json"},body:JSON.stringify({workspace:process.argv[3]}),signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' "$url" "$token" "$(json_field "$f" workspace)"; then echo "app: stopped"; else echo "app: could not be stopped" >&2; return 1; fi
}

status() {
  local url pid mode ag
  if url="$(app_url)"; then echo "app: running at $url"; else echo "app: not running"; fi
  if pid="$(listener_pid)"; then
    mode="$(json_field "$DATA/listener.pid" mode)"; ag="$(json_field "$DATA/listener.pid" agent)"
    echo "listener: running ($ag, $mode mode, pid $pid)"
  else echo "listener: not running"; fi
  [ -f "$DATA/bridge.json" ] && echo "session: $(json_field "$DATA/bridge.json" agent) $(json_field "$DATA/bridge.json" sessionId)"
  return 0
}

case "$CMD" in
  up|start) start_app || exit $?; start_listener; rc=$?; status; exit $rc ;;
  stop) stop_listener; stop_app ;;
  restart) A="$(agent_of_session)"; [ -z "$A" ] && A="$(json_field "$DATA/bridge.json" agent)"; stop_listener; stop_app; sleep 1; AGENT="$A"; start_app || exit $?; start_listener; rc=$?; status; exit $rc ;;
  listen)
    A="$(agent_of_session)"
    if [ "$A" = claude ]; then exec "$NODE" "$APP_DIR/scripts/listen.js" --watch --agent claude 29; fi
    start_listener ;;
  status) status ;;
  *) echo "Usage: maybee.sh [up|start|stop|restart|listen|status] [--agent claude|codex]" >&2; exit 2 ;;
esac

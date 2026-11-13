#!/usr/bin/env bash
# SessionStart hook: make sure the Maybee app is running (opens it in the browser if it had to start it),
# and tell the agent to start listening for "Ask Claude" requests.
APP="$(cd "$(dirname "$0")/.." && pwd)"
if [ "$(basename "$(dirname "$APP")")" = "package" ]; then
  ROOT="$(cd "$APP/../../.." && pwd)"
else
  ROOT="$(cd "$APP/../.." && pwd)"
fi
instance_url() {
  node --input-type=module - "$ROOT" <<'JS'
import fs from 'node:fs';
try {
  // The server writes its metadata inside the active workspace (workspaces/<name>/.maybee),
  // so look there; fall back to the project folder for a single-workspace project.
  const base = process.argv[2];
  let root = base;
  try {
    const name = JSON.parse(fs.readFileSync(base + '/.maybee/active-workspace.json')).name;
    if (name && fs.existsSync(base + '/workspaces/' + name)) root = base + '/workspaces/' + name;
  } catch {}
  const info = JSON.parse(fs.readFileSync(root + '/.maybee/server.json'));
  if (info.workspace !== root || !Number.isInteger(info.port)) process.exit(1);
  const url = 'http://127.0.0.1:' + info.port;
  const live = await (await fetch(url + '/api/instance', { signal: AbortSignal.timeout(1000) })).json();
  if (live.workspace !== root || live.pid !== info.pid) process.exit(1);
  console.log(url);
} catch { process.exit(1); }
JS
}
# Maybee shows itself in its own browser window (it is also the browser that checks Skool); ask the
# server to open it. Without that browser the server falls back to the default one.
open_window() {
  (nohup curl -fsS -X POST --max-time 30 "$1/api/window/open" > /dev/null 2>&1 < /dev/null &) > /dev/null 2>&1 < /dev/null
}
url="$(instance_url 2>/dev/null)"
if [ -n "$url" ]; then
  status="already running, opened at $url"
  open_window "$url"
elif [ -d "$APP/node_modules" ]; then
  mkdir -p "$APP/data"
  (nohup node "$APP/server.js" --project "$ROOT" > "$APP/data/server.log" 2>&1 < /dev/null &) > /dev/null 2>&1 < /dev/null
  for i in $(seq 1 20); do
    url="$(instance_url 2>/dev/null)"
    [ -n "$url" ] && break
    sleep 0.5
  done
  status="started and opened at $url"
  [ -n "$url" ] && open_window "$url"
  [ -n "$url" ] || status="startup not confirmed; inspect $APP/data/server.log"
else
  status="dependencies missing; the agent should run the package launcher"
fi
# D241: routines marked auto_run go to the inbox (once a day, when due); the listener below picks them up
auto=""
if [ -n "$url" ] && curl -fsS -o /dev/null --max-time 2 "$url/api/inbox"; then
  sent=$(curl -s --max-time 5 -X POST "$url/api/autorun" | jq -r '(.sent // []) | join(", ")' 2>/dev/null)
  [ -n "$sent" ] && auto=" Automatic routines queued for today: $sent (they arrive with the first listener run)."
fi
LISTENER="$APP/scripts/listen.js"
ctx="Maybee app: $status.$auto Start the Maybee listener now by executing node \"$LISTENER\" 55 in the background with the agent's shell tool; do not ask the owner to run a terminal command. When it exits with requests, do them (\"Do the next step\" = the note's next_step, D239), answer with node \"$APP/scripts/reply.js\" <id> \"reply\", and start the listener again. Do not execute old queued requests without reviewing them. When a routine produced a file to look at, run node \"$APP/scripts/deliverable.js\" \"<note path>\" \"<file path>\" before replying, so its card links to it (D263). Anything that goes outside (publishing, messages) still needs Adal's OK in the chat."
jq -n --arg c "$ctx" --arg m "Maybee app: $status" '{systemMessage: $m, hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $c}}'

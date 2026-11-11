#!/usr/bin/env bash
# SessionStart hook: make sure the Maybee app is running (opens it in the browser if it had to start it),
# and tell the agent to start listening for "Ask Claude" requests.
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
APP="$ROOT/system/app"
status="already running, opened at http://127.0.0.1:8780"
if curl -s -o /dev/null --max-time 2 http://127.0.0.1:8780/api/inbox; then
  # D240: every session opens the app in the browser, even when the server was already running.
  (setsid nohup xdg-open "http://127.0.0.1:8780/?place=desktop" > /dev/null 2>&1 < /dev/null &) > /dev/null 2>&1 < /dev/null
else
  if [ -d "$APP/node_modules" ]; then
    (cd "$APP" && setsid nohup node server.js > "$APP/data/server.log" 2>&1 < /dev/null &) > /dev/null 2>&1 < /dev/null
    status="started and opened at http://127.0.0.1:8780"
    for i in $(seq 1 20); do curl -s -o /dev/null --max-time 1 http://127.0.0.1:8780/api/inbox && break; sleep 0.5; done
  else
    status="not installed: run npm install in the project folder"
  fi
fi
# D241: routines marked auto_run go to the inbox (once a day, when due); the listener below picks them up
auto=""
if curl -s -o /dev/null --max-time 2 http://127.0.0.1:8780/api/inbox; then
  sent=$(curl -s --max-time 5 -X POST http://127.0.0.1:8780/api/autorun | jq -r '(.sent // []) | join(", ")' 2>/dev/null)
  [ -n "$sent" ] && auto=" Automatic routines queued for today: $sent (they arrive with the first listener run)."
fi
ctx="Maybee app: $status.$auto Start listening for Ask Claude requests now: run \`node system/app/scripts/listen.js 55\` with the Bash tool in the background (run_in_background). When it exits with requests, do them (\"Do the next step\" = the note's next_step, D239), answer with \`node system/app/scripts/reply.js <id> \"reply\"\`, and start the listener again. When a routine produced a file to look at, run `node system/app/scripts/deliverable.js \"<note path>\" \"<file path>\"` before replying, so its card links to it (D263). Anything that goes outside (publishing, messages) still needs Adal's OK in the chat."
jq -n --arg c "$ctx" --arg m "Maybee app: $status" '{systemMessage: $m, hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $c}}'

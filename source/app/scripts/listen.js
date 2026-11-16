#!/usr/bin/env node
// Run by a Claude Code session in the background: waits for "Ask Claude" requests from the Maybee app,
// prints them and exits (which wakes the session). Keeps a heartbeat so the app shows "Claude is listening".
// Usage: node system/app/scripts/listen.js [maxMinutes=55]
//        node system/app/scripts/listen.js --watch [maxMinutes=29]
// Default (one shot): exits when requests arrive; that exit wakes the session, which restarts it after handling them.
// --watch: stays alive and prints one line per request, for a client that wakes the session on each line of output
// (Claude Code's Monitor tool). No gap between requests. Monitor stops anything after 30 minutes, so watch mode ends
// itself at 29 and says so: that last line wakes the session, which starts it again.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA_DIR } from '../lib/paths.js'
import { requestLine, batchInstructions } from '../lib/prompt.js'
import { registerBridge } from '../lib/bridge.js'
const data = DATA_DIR
const here = path.dirname(fileURLToPath(import.meta.url))
const inbox = path.join(data, 'inbox.json'), beat = path.join(data, 'listening')
const args = process.argv.slice(2)
// --agent claude|codex says which agent started this listener (see lib/bridge.js); it is not the minutes
const at = args.indexOf('--agent')
const agentFlag = at < 0 ? null : args.splice(at, 2)[1]
const watch = args.includes('--watch')
const until = Date.now() + Number(args.find(a => !a.startsWith('--')) || (watch ? 29 : 55)) * 60000
fs.mkdirSync(data, { recursive: true })
// Record which agent and session this is. Asked for with --agent, a failure stops the listener; otherwise it is best effort.
try { registerBridge({ agent: agentFlag }) } catch (e) { if (agentFlag) { console.error(e.message); process.exit(1) } }
function tick() {
  fs.writeFileSync(beat, String(Date.now()))
  let list = []
  try { list = JSON.parse(fs.readFileSync(inbox, 'utf8')) } catch {}
  const pending = list.filter(r => r.status === 'pending')
  if (pending.length && watch) {
    for (const r of pending) r.status = 'queued'
    fs.writeFileSync(inbox, JSON.stringify(list, null, 1))
    for (const r of pending) {
      // One line per request: each line is a wake-up. Everything needed to handle it is on that line.
      console.log(requestLine(r, here))
    }
  } else if (pending.length) {
    for (const r of pending) r.status = 'queued' // with Claude, in line; status.js start <id> marks the one running now
    fs.writeFileSync(inbox, JSON.stringify(list, null, 1))
    console.log('MAYBEE REQUESTS (from the owner, via the app):')
    for (const r of pending) console.log(JSON.stringify(r))
    for (const line of batchInstructions(here)) console.log(line)
    process.exit(0)
  }
  if (Date.now() > until) { console.log(watch ? 'MAYBEE LISTENER ENDED (time limit). Run the same command again now to keep listening.' : 'No requests; listener timed out. Start it again to keep listening.'); process.exit(0) }
  setTimeout(tick, 2000)
}
if (watch) console.log('MAYBEE LISTENER STARTED (watching for requests until the time limit)')
tick()

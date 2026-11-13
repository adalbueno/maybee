#!/usr/bin/env node
// Run by a Claude Code session in the background: waits for "Ask Claude" requests from the Maybee app,
// prints them and exits (which wakes the session). Keeps a heartbeat so the app shows "Claude is listening".
// Usage: node system/app/scripts/listen.js [maxMinutes=55]
//        node system/app/scripts/listen.js --watch [maxMinutes=55]
// Default (one shot): exits when requests arrive; that exit wakes the session, which restarts it after handling them.
// --watch: stays alive and prints one line per request, for a client that wakes the session on each line of output
// (Claude Code's Monitor tool). No gap between requests, nothing to restart until it ends.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA_DIR } from '../lib/paths.js'
const data = DATA_DIR
const here = path.dirname(fileURLToPath(import.meta.url))
const inbox = path.join(data, 'inbox.json'), beat = path.join(data, 'listening')
const args = process.argv.slice(2)
const watch = args.includes('--watch')
const until = Date.now() + Number(args.find(a => !a.startsWith('--')) || 55) * 60000
fs.mkdirSync(data, { recursive: true })
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
      console.log('MAYBEE REQUEST ' + JSON.stringify(r) + ' | Do: "Do the next step"/"Work on this now" = the note\'s next_step (ask Adal if empty), then write the following next_step; "Run routine" = the routine the note describes, set last_done to today, anything external is drafted and waits for Adal\'s OK. First: node "' + path.join(here, 'status.js') + '" start ' + r.id + ' . When done: node "' + path.join(here, 'reply.js') + '" ' + r.id + ' "short reply"')
    }
  } else if (pending.length) {
    for (const r of pending) r.status = 'queued' // with Claude, in line; status.js start <id> marks the one running now
    fs.writeFileSync(inbox, JSON.stringify(list, null, 1))
    console.log('MAYBEE REQUESTS (from Adal, via the app):')
    for (const r of pending) console.log(JSON.stringify(r))
    console.log('"Do the next step" / "Work on this now" = do what the note\'s next_step field says (ask Adal if it is empty), then write the following next_step in the note.')
    console.log('"Run routine" = do the routine that note describes (its skill, if it names one) for today, set last_done to today in the note when done; anything that goes outside (DMs, posts, comments) is drafted and waits for Adal\'s OK in the chat (D241).')
    console.log('Before each one: node "' + path.join(here, 'status.js') + '" start <id> (the app shows it as running). When done: node "' + path.join(here, 'reply.js') + '" <id> "short reply"')
    console.log('Running a routine on your own (from the chat)? node "' + path.join(here, 'status.js') + '" start --path "<note path>" first, then reply.js <id> when done.')
    process.exit(0)
  }
  if (Date.now() > until) { console.log(watch ? 'MAYBEE LISTENER ENDED (time limit). Start it again to keep listening.' : 'No requests; listener timed out. Start it again to keep listening.'); process.exit(0) }
  setTimeout(tick, 2000)
}
if (watch) console.log('MAYBEE LISTENER STARTED (watching for requests until the time limit)')
tick()

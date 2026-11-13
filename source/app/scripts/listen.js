#!/usr/bin/env node
// Run by a Claude Code session in the background: waits for "Ask Claude" requests from the Maybee app,
// prints them and exits (which wakes the session). Keeps a heartbeat so the app shows "Claude is listening".
// Usage: node system/app/scripts/listen.js [maxMinutes=55]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const data = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')
const here = path.dirname(fileURLToPath(import.meta.url))
const inbox = path.join(data, 'inbox.json'), beat = path.join(data, 'listening')
const until = Date.now() + Number(process.argv[2] || 55) * 60000
fs.mkdirSync(data, { recursive: true })
function tick() {
  fs.writeFileSync(beat, String(Date.now()))
  let list = []
  try { list = JSON.parse(fs.readFileSync(inbox, 'utf8')) } catch {}
  const pending = list.filter(r => r.status === 'pending')
  if (pending.length) {
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
  if (Date.now() > until) { console.log('No requests; listener timed out. Start it again to keep listening.'); process.exit(0) }
  setTimeout(tick, 2000)
}
tick()

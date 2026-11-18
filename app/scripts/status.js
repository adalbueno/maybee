#!/usr/bin/env node
// Tells the Maybee app what Claude is doing right now, so a routine shows "Running now" while it runs.
//   node system/app/scripts/status.js start <id>                    a request from the app: Claude starts it now
//   node system/app/scripts/status.js start --path "<note>" [title] Claude starts a routine on its own (from the chat): prints the new id
// When it's done: node system/app/scripts/reply.js <id> "short reply" (and set last_done in the note).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { dataPath } from '../lib/paths.js'
const inbox = dataPath('inbox.json')
const [cmd, ...args] = process.argv.slice(2)
let list = []
try { list = JSON.parse(fs.readFileSync(inbox, 'utf8')) } catch {}
if (cmd !== 'start') { console.error('usage: status.js start <id> | start --path "<note>" [title]'); process.exit(1) }
let r
if (args[0] === '--path') {
  const p = args[1]
  if (!p) { console.error('missing note path'); process.exit(1) }
  r = { id: Date.now().toString(36), at: new Date().toISOString(), action: 'Run routine', text: 'started by Claude from the chat', path: p, title: args[2] || path.basename(p, '.md'), status: 'working', reply: null }
  list.push(r)
} else {
  r = list.find(x => x.id === args[0])
  if (!r) { console.error('no request ' + args[0]); process.exit(1) }
  r.status = 'working'
}
r.startedAt = new Date().toISOString()
fs.writeFileSync(inbox, JSON.stringify(list.slice(-200), null, 1))
console.log(r.id)

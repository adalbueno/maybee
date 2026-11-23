#!/usr/bin/env node
// Marks an app request as done with a short reply the app shows. Usage: node system/app/scripts/reply.js <id> "reply"
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { dataPath } from '../lib/paths.js'
const inbox = dataPath('inbox.json')
const [id, ...args] = process.argv.slice(2)
// "--changed a.md b.md" at the end lists the files this request changed; the app records them with the reply.
const cut = args.indexOf('--changed')
const rest = cut < 0 ? args : args.slice(0, cut)
const changed = cut < 0 ? [] : args.slice(cut + 1).filter(Boolean)
const list = JSON.parse(fs.readFileSync(inbox, 'utf8'))
const r = list.find(x => x.id === id)
if (!r) { console.error('no request ' + id); process.exit(1) }
r.status = 'done'; r.reply = rest.join(' '); r.doneAt = new Date().toISOString()
if (changed.length) r.changed = changed
fs.writeFileSync(inbox, JSON.stringify(list, null, 1))
console.log('ok')

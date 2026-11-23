#!/usr/bin/env node
// Puts a file the agent made on its card, so the work shows where the owner looks for it.
// Usage: node system/app/scripts/output.js "<ideas/Card.md>" "<outputs/file>" ["what it is"] [--request <id>]
//  - adds the file to the card under "## Work", newest first: an image, video, PDF or HTML page embedded on its own
//    line (![what it is](../outputs/file)), any other file as a link with the date;
//  - adds a line to logs/CHANGELOG.md, so it shows in the card's Changes tab and in the Inbox;
//  - with --request, lists the file under that request's reply in the card's chat.
// Paths are inside the active workspace. Running it twice for the same file changes nothing.
import fs from 'node:fs'
import path from 'node:path'
import { activeRoot } from '../lib/active-root.js'
import { dataPath } from '../lib/paths.js'

const args = process.argv.slice(2)
const ri = args.indexOf('--request')
const requestId = ri >= 0 ? args[ri + 1] : null
const [card, file, ...label] = ri >= 0 ? args.slice(0, ri).concat(args.slice(ri + 2)) : args
if (!card || !file) {
  console.error('usage: output.js "<ideas/Card.md>" "<outputs/file>" ["what it is"] [--request <id>]')
  process.exit(1)
}
const root = activeRoot()
const rel = p => {
  const abs = path.resolve(root, p)
  const r = path.relative(root, abs).split(path.sep).join('/')
  if (r.startsWith('..') || path.isAbsolute(r)) { console.error(`${p} is outside the workspace ${root}`); process.exit(1) }
  return r
}
const cardRel = rel(card)
const fileRel = rel(file)
if (!/^ideas\/[^/]+\.md$/.test(cardRel)) { console.error(`${cardRel}: the card must be a note directly in ideas/`); process.exit(1) }
if (!fs.existsSync(path.join(root, cardRel))) { console.error(`${cardRel} does not exist in ${root}`); process.exit(1) }
if (!fs.existsSync(path.join(root, fileRel))) { console.error(`${fileRel} does not exist in ${root}`); process.exit(1) }

const pad = n => String(n).padStart(2, '0')
const now = new Date()
const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`
const what = label.join(' ').trim() || path.basename(fileRel).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')
const href = '../' + fileRel.split('/').map(encodeURIComponent).join('/')
const EMBED = /\.(png|jpe?g|gif|webp|svg|avif|mp4|webm|mov|pdf|html?)$/i

// 1. The card's "## Work" section
const cardAbs = path.join(root, cardRel)
let text = fs.readFileSync(cardAbs, 'utf8')
// Already listed under "## Work" (a link elsewhere in the note does not count: the Work list is what the card shows).
const workAt = text.search(/^## Work[ \t]*$/m)
const work = workAt < 0 ? '' : text.slice(workAt).split(/\n(?=## )/)[0]
const already = work.includes(`](${href})`) || work.includes(`](../${fileRel})`)
if (!already) {
  const line = EMBED.test(fileRel) ? `![${what}](${href})` : `- [${what}](${href}) (${day})`
  const m = /^## Work[ \t]*$/m.exec(text)
  if (m) {
    const at = m.index + m[0].length
    const sep = EMBED.test(fileRel) ? '\n\n' : '\n'
    text = text.slice(0, at) + '\n\n' + line + sep + text.slice(at).replace(/^\n+/, '')
  } else {
    text = text.replace(/\s*$/, '') + '\n\n## Work\n\n' + line + '\n'
  }
  fs.writeFileSync(cardAbs, text)
  // 2. The changelog line (the card's Changes tab reads it)
  const log = path.join(root, 'logs', 'CHANGELOG.md')
  if (fs.existsSync(log)) fs.appendFileSync(log, `${fs.readFileSync(log, 'utf8').endsWith('\n') ? '' : '\n'}- ${day} ${time}: Ready on the card: ${what} (${cardRel}, ${fileRel})\n`)
}

// 3. The request's reply in the chat lists the file
if (requestId) {
  const inbox = dataPath('inbox.json')
  try {
    const list = JSON.parse(fs.readFileSync(inbox, 'utf8'))
    const r = list.find(x => x.id === requestId)
    if (!r) console.error('no request ' + requestId)
    else {
      r.outputs = (r.outputs || []).filter(o => o.path !== fileRel).concat({ path: fileRel, card: cardRel, title: what })
      fs.writeFileSync(inbox, JSON.stringify(list, null, 1))
    }
  } catch (e) { console.error('could not update the request: ' + e.message) }
}
console.log(already ? `already on ${cardRel}` : `ok: ${fileRel} on ${cardRel}`)

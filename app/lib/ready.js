// The Inbox: what arrived for the owner, each item tied to its card.
// - output: a file put on a card by scripts/output.js (its "Ready on the card" line in logs/CHANGELOG.md);
// - card: a card the agent created (the owner's own cards, made in the app, are logged "(Maybee app) New idea" and stay out);
// Answers stay in each card's chat: they are a conversation, not something made.
// - waiting: what STATE.md lists under "Waiting on the owner", always on top until it is resolved.
// The raw history of every file stays in each card's Changes tab and in the Vault.
import fs from 'node:fs'
import path from 'node:path'

const READY = /^- (\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}))?: Ready on the card: (.+) \((ideas\/[^,]+\.md), ([^)]+)\)\s*$/
const DAYS = 30 // older items leave the list; they are still on their cards

function titleOf(root, rel) {
  return cardInfo(root, rel)?.title || null
}
// title and column of a card: a routine has its own column; a note outside ideas/ has none
function cardInfo(root, rel) {
  let head
  try { head = fs.readFileSync(path.join(root, rel), 'utf8').split(/\n---\s*\n/)[0] } catch { return null } // the card is gone
  const field = k => { const m = new RegExp('^' + k + ':\\s*"?(.+?)"?\\s*$', 'm').exec(head); return m ? m[1].replace(/\\"/g, '"') : null }
  const title = field('title') || path.basename(rel, '.md')
  if (!/^ideas\/[^/]+\.md$/.test(rel)) return { title, stage: null }
  const stage = field('type') === 'routine' && field('stage') !== 'not' ? 'routine' : (['maybe', 'next', 'now', 'done', 'not'].includes(field('stage')) ? field('stage') : 'maybe')
  return { title, stage }
}

function firstMention(log, rel) {
  for (const line of log.split('\n')) {
    if (!line.includes(rel)) continue
    const m = /^- (\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}))?:/.exec(line)
    if (m) return new Date(`${m[1]}T${m[2] || '12:00'}:00`).getTime()
  }
  return 0
}
const plain = s => s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*|`/g, '')
function waitingTitle(raw) {
  const bold = /^\*\*(.+?)\*\*:?\s*/.exec(raw)
  return bold ? plain(bold[1]).replace(/:$/, '') : plain(raw).split(/[:(]|\. /)[0]
}

function waitingItems(root) {
  let text = ''
  try { text = fs.readFileSync(path.join(root, 'STATE.md'), 'utf8') } catch { return [] }
  const m = /## Waiting on the owner\n([\s\S]*?)(\n## |$)/.exec(text)
  if (!m) return []
  return m[1].split('\n').filter(l => l.startsWith('- ')).map(l => {
    const raw = l.slice(2)
    const bold = /^\*\*(.+?)\*\*:?\s*/.exec(raw)
    const title = waitingTitle(raw)
    const rest = plain(bold ? raw.slice(bold[0].length) : plain(raw).slice(title.length)).replace(/^[:.\s]+/, '').replace(/^./, c => c.toUpperCase())
    const link = [...raw.matchAll(/\]\(([^)]+)\)/g)].map(x => x[1]).find(h => !/^https?:/.test(h))
    let card = link ? decodeURIComponent(link.split('#')[0]).replace(/^\.\//, '') : null
    if (card && !card.endsWith('.md')) card = null
    return { type: 'waiting', key: 'ready:wait:' + title, title, text: rest.length > 220 ? rest.slice(0, 220).replace(/\s+\S*$/, '') + '…' : rest, card }
  })
}

export function ready(root, seen) {
  const since = Date.now() - DAYS * 86400000
  const items = []
  // outputs, newest line wins for a file that was put on its card again
  let log = ''
  try { log = fs.readFileSync(path.join(root, 'logs', 'CHANGELOG.md'), 'utf8') } catch {}
  const byFile = new Map()
  for (const line of log.split('\n')) {
    const m = READY.exec(line)
    if (!m) continue
    const time = new Date(`${m[1]}T${m[2] || '12:00'}:00`).getTime()
    if (time < since) continue
    const [, , , what, card, file] = m
    byFile.set(file, { type: 'output', key: 'ready:out:' + file, time, title: what, file, card })
  }
    items.push(...byFile.values())
  // cards the agent created
  const mine = new Set([...log.matchAll(/\(Maybee app\) New idea[^(]*\((ideas\/[^)]+\.md)\)/g)].map(m => m[1]))
  let names = []
  try { names = fs.readdirSync(path.join(root, 'ideas')).filter(n => n.endsWith('.md')) } catch {}
  for (const n of names) {
    const rel = 'ideas/' + n
    if (mine.has(rel)) continue
    let st
    try { st = fs.statSync(path.join(root, rel)) } catch { continue }
    // when it was made: the first changelog line that names it (rewriting a file changes its own birth time), else the file's
    const first = firstMention(log, rel)
    const time = first || st.birthtimeMs || st.ctimeMs
    if (time < since) continue
    items.push({ type: 'card', key: 'ready:card:' + rel, time, title: 'New card', card: rel })
  }
  for (const it of items) {
    const info = it.card ? cardInfo(root, it.card) : null
    it.cardTitle = info?.title || null
    it.cardStage = info?.stage || null
    if (!it.cardTitle) it.card = null // a chat outside a note (the About page, the board) or a card that is gone
    it.read = it.time <= Math.max(seen.baseline || 0, seen.items[it.key] || 0)
  }
  items.sort((a, b) => b.time - a.time)
  const waiting = waitingItems(root)
  for (const w of waiting) { w.cardTitle = w.card ? titleOf(root, w.card) : null; if (!w.cardTitle) w.card = null }
  return { waiting, items, unread: items.filter(i => !i.read).length }
}


// The Maybee board: ideas and tasks by stage. Routines are returned separately by the server.
import fsp from 'node:fs/promises'
import path from 'node:path'
import YAML from 'yaml'

export const STAGES = ['maybe', 'next', 'now', 'done', 'not']
const REACTIONS = {
  value_members: { 1: 3, 2: 5, 3: 8 },
  want: { 1: 2, 2: 3, 3: 5 },
  value_money: { 1: 2, 2: 3, 3: 5 },
  hard: { 1: 2, 2: 3, 3: 5 },
}
const FIB = [2, 3, 5, 8, 13]

// D170: points from the four reactions, score = (members + want + money) / hard, next Fibonacci 2–13
function priority(fm) {
  const pts = {}
  for (const k of Object.keys(REACTIONS)) {
    const v = REACTIONS[k][Number(fm[k])]
    if (v == null) return { priority: null, score: null }
    pts[k] = v
  }
  const score = (pts.value_members + pts.want + pts.value_money) / pts.hard
  return { priority: FIB.find(f => f >= score - 1e-9) || 13, score: Math.round(score * 10) / 10 }
}

function splitFm(text) {
  if (!text.startsWith('---')) return null
  const end = text.indexOf('\n---', 3)
  if (end < 0) return null
  return { head: text.slice(4, end), end }
}

async function readCard(root, rel) {
  const abs = path.join(root, rel)
  const [text, st] = await Promise.all([fsp.readFile(abs, 'utf8'), fsp.stat(abs)])
  const fm0 = splitFm(text)
  let fm = {}
  try { fm = fm0 ? YAML.parse(fm0.head) || {} : {} } catch { fm = {} }
  if (fm.type === 'routine') return null
  const body = fm0 ? text.slice(text.indexOf('\n', fm0.end + 1) + 1) : text
  let desc = typeof fm.description === 'string' && !/·.*·/.test(fm.description) ? fm.description : ''
  if (!desc) {
    const para = body.split('\n').map(l => l.trim()).find(l => l && !/^(>|#|\||---|```|!\[)/.test(l))
    desc = (para || '').replace(/\*\*|`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  }
  if (desc.length > 220) desc = desc.slice(0, 220).replace(/\s+\S*$/, '') + '…'
  const stage = STAGES.includes(fm.stage) ? fm.stage : 'maybe'
  return {
    path: rel,
    id: fm.id || null,
    title: String(fm.title || path.basename(rel, '.md')),
    type: fm.type === 'task' ? 'task' : 'idea',
    stage,
    area: fm.area || null,
    owner: fm.owner || null,
    description: desc,
    captured: fm.captured ? String(fm.captured).slice(0, 10) : null,
    nextStep: fm.next_step ? String(fm.next_step) : null,
    rank: Number.isFinite(Number(fm.rank)) && fm.rank !== null && fm.rank !== '' ? Number(fm.rank) : null,
    mtime: st.mtimeMs,
    ...priority(fm),
  }
}

let cache = { key: '', cards: [] }

export async function loadCards(root, index) {
  const files = [...index.values()].filter(f => /^ideas\/[^/]+\.md$/.test(f.rel))
  const key = files.map(f => f.rel + f.mtime).join('|')
  if (key === cache.key) return cache.cards
  const cards = (await Promise.all(files.map(f => readCard(root, f.rel).catch(() => null)))).filter(Boolean)
  cache = { key, cards }
  return cards
}

const byPriority = (a, b) => (b.priority || 0) - (a.priority || 0) || (b.score || 0) - (a.score || 0) || b.mtime - a.mtime
const byRecent = (a, b) => b.mtime - a.mtime

// Columns you can arrange by hand keep their order in a `rank` line of each card (lower = higher up).
// Cards without a rank come after the ranked ones, in the old order (priority in Maybe, newest first elsewhere).
export const RANKED = ['maybe', 'next', 'now']
const orderOf = stage => (a, b) => {
  if (RANKED.includes(stage)) {
    if (a.rank != null && b.rank != null && a.rank !== b.rank) return a.rank - b.rank
    if ((a.rank != null) !== (b.rank != null)) return a.rank != null ? -1 : 1
  }
  return (stage === 'maybe' ? byPriority : byRecent)(a, b)
}

export async function board(root, index, { top = 15 } = {}) {
  const cards = await loadCards(root, index)
  const cols = {}
  for (const s of STAGES) {
    const list = cards.filter(c => c.stage === s).sort(orderOf(s))
    cols[s] = { count: list.length, cards: s === 'maybe' ? list.slice(0, top) : list }
  }
  return { columns: cols }
}

export async function backlog(root, index) {
  const cards = await loadCards(root, index)
  return cards.filter(c => c.stage === 'maybe').sort(byPriority)
    .map(({ path: p, id, title, type, area, priority: pr, description }) => ({ path: p, id, title, type, area, priority: pr, description }))
}

// Change one frontmatter field, refusing if the file changed since the page loaded it.
export async function setStage(root, rel, stage, expectedMtime) {
  if (!STAGES.includes(stage)) throw new Error('unknown stage')
  if (!/^ideas\/[^/]+\.md$/.test(rel)) throw new Error('only notes in ideas/')
  const abs = path.join(root, rel)
  const st = await fsp.stat(abs)
  if (expectedMtime && Math.abs(st.mtimeMs - expectedMtime) > 1) {
    const err = new Error('changed since you opened it'); err.code = 409; throw err
  }
  const text = await fsp.readFile(abs, 'utf8')
  const fm = splitFm(text)
  if (!fm) throw new Error('file has no frontmatter')
  const lines = fm.head.split('\n')
  let from = null
  const i = lines.findIndex(l => /^stage:(\s|$)/.test(l))
  if (i >= 0) { from = lines[i].replace(/^stage:\s*/, '').trim(); lines[i] = `stage: ${stage}` }
  else lines.push(`stage: ${stage}`)
  const out = '---\n' + lines.join('\n') + text.slice(fm.end)
  await fsp.writeFile(abs, out)
  return { from, to: stage }
}

export async function logChange(root, msg) {
  const file = path.join(root, 'logs', 'CHANGELOG.md')
  let text = ''
  try { text = await fsp.readFile(file, 'utf8') } catch {}
  const d = new Date()
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  await fsp.appendFile(file, (text && !text.endsWith('\n') ? '\n' : '') + `- ${day}: (Maybee app) ${msg}\n`)
}

const safeName = t => t.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 80).trim()
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

// Quick capture: a new idea in Maybe, at the top of the column. Returns the new note's path.
export async function createCard(root, index, title) {
  title = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 140)
  if (!title) throw new Error('write a title first')
  const base = safeName(title)
  if (!base) throw new Error('that title has no usable characters')
  const cards = await loadCards(root, index)
  let n = 0
  for (const c of cards) { const m = /^I(\d+)$/.exec(c.id || ''); if (m) n = Math.max(n, Number(m[1])) }
  const ranks = cards.filter(c => c.stage === 'maybe' && c.rank != null).map(c => c.rank)
  const rank = (ranks.length ? Math.min(...ranks) : 10) - 10
  let rel = `ideas/${base}.md`, i = 2
  while (true) {
    try { await fsp.access(path.join(root, rel)); rel = `ideas/${base} ${i++}.md` } catch { break }
  }
  const text = `---\nid: I${n + 1}\ntitle: ${JSON.stringify(title)}\ntype: idea\nstage: maybe\nowner: both\nrank: ${rank}\ncaptured: ${today()}\n---\n\n# ${title}\n`
  await fsp.mkdir(path.join(root, 'ideas'), { recursive: true })
  await fsp.writeFile(path.join(root, rel), text, { flag: 'wx' })
  return { path: rel, id: `I${n + 1}`, title }
}

async function writeRank(root, rel, rank) {
  const abs = path.join(root, rel)
  const text = await fsp.readFile(abs, 'utf8')
  const fm = splitFm(text)
  if (!fm) return false
  const lines = fm.head.split('\n')
  const i = lines.findIndex(l => /^rank:(\s|$)/.test(l))
  if (i >= 0) lines[i] = `rank: ${rank}`; else lines.push(`rank: ${rank}`)
  await fsp.writeFile(abs, '---\n' + lines.join('\n') + text.slice(fm.end))
  return true
}

// Put a card at a new place in its column, or sort the column by priority (`byScore`).
// One file changes when there is room between neighbours; otherwise the column is numbered again, once.
// Returns the paths that were written.
export async function placeCard(root, index, { path: rel, before = null, after = null, stage = null, byScore = false }) {
  const cards = await loadCards(root, index)
  const moved = rel ? cards.find(c => c.path === rel) : null
  const st = byScore ? stage : moved && moved.stage
  if (!RANKED.includes(st)) throw new Error('that column keeps its own order')
  let list = cards.filter(c => c.stage === st).sort(orderOf(st))
  if (byScore) list = list.slice().sort(byPriority)
  else {
    list = list.filter(c => c.path !== rel)
    let at = list.length
    if (before) { const k = list.findIndex(c => c.path === before); if (k >= 0) at = k }
    else if (after) { const k = list.findIndex(c => c.path === after); if (k >= 0) at = k + 1 }
    list.splice(at, 0, moved)
  }
  const written = []
  const k = byScore ? -1 : list.findIndex(c => c.path === rel)
  const prev = k > 0 ? list[k - 1] : null, next = k >= 0 && k < list.length - 1 ? list[k + 1] : null
  const room = k >= 0 && list.every(c => c.rank != null || c.path === rel) &&
    (!prev || !next || next.rank - prev.rank >= 2)
  if (room) {
    const rank = prev && next ? Math.floor((prev.rank + next.rank) / 2) : prev ? prev.rank + 10 : next ? next.rank - 10 : 10
    if (moved.rank !== rank && await writeRank(root, rel, rank)) written.push(rel)
  } else {
    for (let i = 0; i < list.length; i++) {
      if (list[i].rank !== (i + 1) * 10 && await writeRank(root, list[i].path, (i + 1) * 10)) written.push(list[i].path)
    }
  }
  return written
}

// A card that changes column goes to the top of the new one.
export async function topOfColumn(root, index, rel, stage) {
  if (!RANKED.includes(stage)) return false
  const cards = await loadCards(root, index)
  const ranks = cards.filter(c => c.stage === stage && c.path !== rel && c.rank != null).map(c => c.rank)
  return writeRank(root, rel, (ranks.length ? Math.min(...ranks) : 10) - 10)
}

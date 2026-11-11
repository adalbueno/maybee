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

export async function board(root, index, { top = 15 } = {}) {
  const cards = await loadCards(root, index)
  const cols = {}
  for (const s of STAGES) {
    const list = cards.filter(c => c.stage === s).sort(s === 'maybe' ? byPriority : byRecent)
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
  await fsp.appendFile(file, (text && !text.endsWith('\n') ? '\n' : '') + `- ${day}: (Adal, Maybee app) ${msg}\n`)
}

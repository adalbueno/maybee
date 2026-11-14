// The Desktop: today's rhythm (routines), what waits for the owner, one maybe idea a day, and the now cards with their files.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import YAML from 'yaml'
import { loadCards } from './board.js'
import { dataPath } from './paths.js'

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MEDIA = /\.(png|jpe?g|webp|gif|mp4|webm|mov)$/i

export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000)

function frontmatter(text) {
  if (!text.startsWith('---')) return { fm: {}, body: text }
  const end = text.indexOf('\n---', 3)
  let fm = {}
  try { fm = YAML.parse(text.slice(4, end)) || {} } catch {}
  return { fm, body: text.slice(text.indexOf('\n', end + 1) + 1) }
}

// "daily", "weekly (Friday)", "weekly (Sunday)", "every other day"
function isDue(recurring, lastDone, today) {
  const r = String(recurring || 'daily').toLowerCase()
  const wd = DAYS[new Date(today + 'T12:00:00').getDay()]
  const named = DAYS.find(d => r.includes(d))
  if (named) return named === wd || (lastDone ? daysBetween(lastDone, today) > 7 : true)
  if (r.includes('week')) return !lastDone || daysBetween(lastDone, today) >= 7
  if (r.includes('other')) return !lastDone || daysBetween(lastDone, today) >= 2
  return true
}

// D246: how a routine runs by itself. Old notes: auto_run: true = every session start.
// Weeks: auto_days: mon-wed-fri (hyphens), auto_since: the date it was set (anchors "every N weeks").
const SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
export function autoOf(fm) {
  let mode = ['off', 'session', 'hours', 'days', 'weeks', 'months'].includes(fm.auto) ? fm.auto : null
  if (!mode) mode = (fm.auto_run === true || fm.auto_run === 'true') ? 'session' : 'off'
  const every = Math.max(1, Math.min(999, parseInt(fm.auto_every, 10) || (mode === 'hours' ? 3 : 1)))
  const days = String(fm.auto_days || '').toLowerCase().split(/[-,\s]+/).filter(d => SHORT.includes(d))
  const mday = Math.max(1, Math.min(31, parseInt(fm.auto_mday, 10) || 1))
  return { autoMode: mode, autoEvery: every, autoDays: days, autoMday: mday, autoSince: fm.auto_since ? String(fm.auto_since).slice(0, 10) : null }
}
// is a "months" routine due on this day? day N of the month (or the month's last day if shorter), every N months from auto_since
function monthsDue(r, today) {
  const [y, m, d] = today.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  if (d !== Math.min(r.autoMday, last)) return false
  if (r.autoEvery <= 1 || !r.autoSince) return true
  const [sy, sm] = r.autoSince.split('-').map(Number)
  return (((y * 12 + m) - (sy * 12 + sm)) % r.autoEvery + r.autoEvery) % r.autoEvery === 0
}
// is a "weeks" routine due on this day? right weekday, and the right week when N > 1
function weeksDue(r, today) {
  const t = new Date(today + 'T12:00:00')
  if (r.autoDays.length && !r.autoDays.includes(SHORT[t.getDay()])) return false
  if (r.autoEvery <= 1 || !r.autoSince) return true
  const week = d => Math.floor((new Date(d + 'T12:00:00').getTime() / 86400000 + 3) / 7) // weeks start on Monday
  return ((week(today) - week(r.autoSince)) % r.autoEvery + r.autoEvery) % r.autoEvery === 0
}

const WHO = { agent: 'agent', Adal: 'you', owner: 'you', both: 'both' }

async function routines(root, index, today, keepUntil) {
  const out = { due: [], forgotten: [] }
  for (const f of index.values()) {
    if (!/^ideas\/[^/]+\.md$/.test(f.rel)) continue
    let text
    try { text = await fsp.readFile(path.join(root, f.rel), 'utf8') } catch { continue }
    if (!/^type:\s*routine/m.test(text.slice(0, 1500))) continue
    const { fm } = frontmatter(text)
    if (fm.stage === 'not') continue
    const last = fm.last_done ? String(fm.last_done).slice(0, 10) : null
    const r = {
      path: f.rel,
      title: String(fm.short || fm.title || path.basename(f.rel, '.md')).replace(/^Post today's |^Publish today's |^Make and publish today's /, '').replace(/^./, c => c.toUpperCase()),
      full: String(fm.title || ''),
      recurring: fm.recurring || 'daily',
      last,
      done: last === today,
      who: WHO[fm.owner] || null,
      id: fm.id || null,
      // D243: must · should · nice (unset counts as should)
      importance: ['must', 'should', 'nice'].includes(fm.importance) ? fm.importance : 'should',
      // D244: "not today" skips a routine for one day; last_done does not change
      skipped: fm.not_today ? String(fm.not_today).slice(0, 10) === today : false,
      // D241: auto_run routines are sent to Claude at the start of each session (once a day, when due)
      // D246: auto: off | session | hours | days, auto_every: N; priority: order on the board = run order
      ...autoOf(fm),
      priority: Number(fm.priority) > 0 ? Number(fm.priority) : 999,
      // D262: at: "13:00" = not before that time; needs: R8 = only after that routine is done today
      at: /^\d{1,2}:\d{2}$/.test(String(fm.at || '')) ? String(fm.at).padStart(5, '0') : null,
      needs: fm.needs ? String(fm.needs) : null,
      // D263: today's deliverable (the file to look at), shown as a link on the card; deliverable_on = the day it is for
      deliverable: fm.deliverable && String(fm.deliverable_on || '').slice(0, 10) === today ? String(fm.deliverable) : null,
    }
    r.auto = r.autoMode !== 'off'
    const idle = last ? daysBetween(last, today) : 999
    const stale = idle >= 14 && !(keepUntil[f.rel] && keepUntil[f.rel] >= today)
    // a stale routine that is due today still belongs in today's list (marked), not only in "keep or drop"
    const due = r.autoMode === 'days' ? (!last || daysBetween(last, today) >= r.autoEvery)
      : r.autoMode === 'weeks' ? weeksDue(r, today)
      : r.autoMode === 'months' ? monthsDue(r, today)
      : isDue(r.recurring, last, today)
    if (r.done || due) out.due.push(stale ? { ...r, idle, stale: true } : r)
    else if (stale) out.forgotten.push({ ...r, idle })
  }
  // D262: a routine waiting for its time or for another routine is "later today", not "to do now"
  const isToday = today === dayKey()
  const hhmm = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`
  for (const r of out.due) {
    if (r.done) continue
    const dep = r.needs ? out.due.find(x => x.id === r.needs) : null
    if (dep && !dep.done) { r.later = 'needs'; r.needsTitle = dep.full || dep.title }
    else if (r.at && (!isToday || hhmm < r.at)) r.later = 'at'
  }
  out.due.sort((a, b) => Number(a.done) - Number(b.done) || a.priority - b.priority || a.title.localeCompare(b.title))
  out.forgotten.sort((a, b) => b.idle - a.idle)
  return out
}

// A section of STATE.md as items, one bullet per item ("## Waiting on the owner", "## Focus"...)
function stateItem(raw, shorten = true) {
  const bold = /^\*\*(.+?)\*\*:?\s*/.exec(raw)
  const clean = raw.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  const title = (bold ? bold[1].replace(/:$/, '') : clean.split(/[:(]|\. /)[0]).replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  const rest = (bold ? raw.slice(bold[0].length) : clean.slice(title.length))
    .replace(/\*\*/g, '').replace(/`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/^[:.\s]+/, '')
  const links = [...raw.matchAll(/\]\(([^)]+)\)/g)].map(x => x[1]).filter(h => !/^https?:/.test(h)).map(h => decodeURIComponent(h.split('#')[0]))
  return { title, text: shorten && rest.length > 260 ? rest.slice(0, 260).replace(/\s+\S*$/, '') + '…' : rest, link: links[0] || null }
}

async function stateSection(root, heading) {
  let text = ''
  try { text = await fsp.readFile(path.join(root, 'STATE.md'), 'utf8') } catch { return [] }
  const m = new RegExp('## ' + heading + '\\n([\\s\\S]*?)(\\n## |$)').exec(text)
  if (!m) return []
  return m[1].split('\n').filter(l => l.startsWith('- ')).map(l => stateItem(l.slice(2)))
}
const waiting = root => stateSection(root, 'Waiting on the owner')

function safeIdeaName(title) {
  return String(title || 'Decision').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Decision'
}

let waitingWrite = Promise.resolve()

// Turn a STATE.md › Waiting on the owner bullet into a normal Maybee card and remove it from the queue.
// Writes are serialized so two quick decisions cannot overwrite each other's STATE update.
export function resolveWaiting(root, title, destination) {
  const run = waitingWrite.then(() => resolveWaitingNow(root, title, destination))
  waitingWrite = run.catch(() => {})
  return run
}

async function resolveWaitingNow(root, title, destination) {
  if (!['task', 'idea', 'not'].includes(destination)) throw new Error('unknown decision')
  const stateFile = path.join(root, 'STATE.md')
  let state = await fsp.readFile(stateFile, 'utf8')
  const section = /## Waiting on the owner\n([\s\S]*?)(\n## |$)/.exec(state)
  if (!section) throw new Error('Waiting on the owner is not present in STATE.md')
  const lines = section[1].split('\n')
  const lineIndex = lines.findIndex(line => line.startsWith('- ') && stateItem(line.slice(2)).title === title)
  if (lineIndex < 0) throw new Error('This waiting item changed. Refresh and try again.')
  const raw = lines[lineIndex].slice(2)
  const item = stateItem(raw, false)
  const today = dayKey()
  const type = destination === 'task' ? 'task' : 'idea'
  const stage = destination === 'task' ? 'next' : destination === 'idea' ? 'maybe' : 'not'
  await fsp.mkdir(path.join(root, 'ideas'), { recursive: true })
  const base = safeIdeaName(item.title)
  let rel = `ideas/${base}.md`
  let n = 2
  while (fs.existsSync(path.join(root, rel))) rel = `ideas/${base} ${n++}.md`
  const description = plainMarkdown(item.text || item.title).slice(0, 220)
  const head = YAML.stringify({ title: item.title, type, stage, captured: today, description }).trimEnd()
  const source = item.link ? `\n\nSource: [${path.basename(item.link, '.md')}](../${encodeURI(item.link).replace(/#/g, '%23')})` : ''
  const note = `---\n${head}\n---\n\n> [Dashboard](../DASHBOARD.md) · [State](../STATE.md)\n\n# ${item.title}\n\n## Context\n\n${plainMarkdown(item.text) || 'Created from a decision waiting in STATE.md.'}${source}\n`
  await fsp.writeFile(path.join(root, rel), note)
  lines.splice(lineIndex, 1)
  const updatedSection = lines.join('\n')
  state = state.slice(0, section.index) + `## Waiting on the owner\n${updatedSection}` + state.slice(section.index + section[0].length - section[2].length)
  state = state.replace(/^updated:\s*.*$/m, `updated: ${today}`).replace(/^by:\s*.*$/m, 'by: Maybee decision queue')
  await fsp.writeFile(stateFile, state)
  return { path: rel, title: item.title, type, stage }
}

function plainMarkdown(value) {
  return String(value || '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|`/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function projectSummary(root) {
  for (const rel of ['PROJECT.md', 'README.md']) {
    let text = ''
    try { text = await fsp.readFile(path.join(root, rel), 'utf8') } catch { continue }
    const body = frontmatter(text).body
    const title = plainMarkdown((/^#\s+(.+)$/m.exec(body) || [])[1] || path.basename(root))
    const blocks = body.split(/\n\s*\n/).map(x => x.trim())
    const summary = blocks.find(x => x && !/^(#|>|-|\*|\||```|!\[)/.test(x) && !/^\[.*\]\(.*\)$/.test(x))
    // The "Current goal" section of the brief, when it has one: what the project is trying to do right now.
    const gm = /^##\s+(?:Current goal|Goal)\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/mi.exec(body)
    const goal = gm ? plainMarkdown(gm[1].split(/\n\s*\n/).map(x => x.trim()).find(x => x && !/^(#|>|\|```)/.test(x))) : ''
    return { title: title || path.basename(root), summary: plainMarkdown(summary), goal, path: rel }
  }
  return { title: path.basename(root), summary: '', path: null }
}

async function recentDecisions(root, limit = 4) {
  let text = '', file = null
  // the register is decisions/register.md, or knowledge/decisions.md in a workspace not migrated yet (the old one wins while it exists)
  for (const candidate of ['knowledge/decisions.md', 'decisions/register.md']) {
    try { text = await fsp.readFile(path.join(root, candidate), 'utf8'); file = candidate; break } catch {}
  }
  if (!file) return []
  const rows = text.split('\n').filter(line => /^\|\s*D\d+(?:\s*\([^)]*\))?\s*\|/.test(line))
  return rows.slice(-limit).reverse().map(line => {
    const cells = line.split('|').slice(1, -1).map(x => x.trim())
    const id = plainMarkdown(cells[0]).split(' ')[0]
    const decision = plainMarkdown(cells[1])
    const first = decision.match(/^(.+?[.!?])(?:\s|$)/)
    return { id, title: first ? first[1] : decision, text: first ? decision.slice(first[1].length).trim() : '', path: file }
  })
}

async function recentChanges(root, limit = 5) {
  let text = ''
  try { text = await fsp.readFile(path.join(root, 'logs', 'CHANGELOG.md'), 'utf8') } catch { return [] }
  return text.split('\n').filter(line => /^-\s+\d{4}-\d{2}-\d{2}:/.test(line)).slice(-limit).reverse().map(line => {
    const match = /^-\s+(\d{4}-\d{2}-\d{2}):\s*(.*)$/.exec(line)
    return { date: match[1], text: plainMarkdown(match[2]), path: 'logs/CHANGELOG.md' }
  })
}

// The Overview page (D273): a generic project briefing assembled from ordinary workspace files.
export async function overviewState(root, index) {
  const [project, focus, wait, decisions, changes, cards] = await Promise.all([
    projectSummary(root), stateSection(root, 'Focus'), waiting(root), recentDecisions(root), recentChanges(root), loadCards(root, index),
  ])
  let updated = null
  try { updated = (/^updated:\s*(.+)$/m.exec(await fsp.readFile(path.join(root, 'STATE.md'), 'utf8')) || [])[1] || null } catch {}
  const now = cards.filter(card => card.stage === 'now').sort((a, b) => b.mtime - a.mtime).slice(0, 5)
  return { project, focus, waiting: wait, now, decisions, changes, updated }
}

// One maybe idea a day: stays the same all day; ideas never offered come first, then the least recently touched.
async function ideaOfTheDay(root, index, appDir, today) {
  const file = dataPath('daily.json')
  let daily = { offered: {} }
  try { daily = JSON.parse(fs.readFileSync(file, 'utf8')) } catch {}
  daily.offered = daily.offered || {}
  const cards = (await loadCards(root, index)).filter(c => c.stage === 'maybe' && c.type === 'idea')
  let pick = daily.date === today ? cards.find(c => c.path === daily.path) : null
  if (!pick && daily.date !== today) {
    const sorted = cards.slice().sort((a, b) => (daily.offered[a.path] || '').localeCompare(daily.offered[b.path] || '') || a.mtime - b.mtime)
    pick = sorted[0] || null
    if (pick) {
      daily.date = today; daily.path = pick.path; daily.offered[pick.path] = today
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, JSON.stringify(daily, null, 1))
    }
  }
  if (!pick) return null
  const { fm } = frontmatter(await fsp.readFile(path.join(root, pick.path), 'utf8'))
  const offered = Object.keys(daily.offered).length
  return {
    ...pick,
    reactions: { value_members: fm.value_members ?? null, value_money: fm.value_money ?? null, want: fm.want ?? null, hard: fm.hard ?? null },
    seenCount: offered, total: cards.length,
  }
}

// The files a now card points to: links in the note to things that go out (outputs/, logs/metrics) and media.
export async function nowCards(root, index) {
  const cards = (await loadCards(root, index)).filter(c => c.stage === 'now').sort((a, b) => b.mtime - a.mtime)
  for (const c of cards) {
    let text = ''
    try { text = await fsp.readFile(path.join(root, c.path), 'utf8') } catch {}
    const dir = path.posix.dirname(c.path)
    const files = []
    for (const m of text.matchAll(/\]\(([^)\s]+)\)|\[\[([^\]|#]+)/g)) {
      const href = m[1] || m[2]
      if (!href || /^(https?:|#|mailto:)/.test(href)) continue
      let rel
      try { rel = path.posix.normalize(path.posix.join(m[1] ? dir : '', decodeURIComponent(href.split('#')[0]))) } catch { continue }
      if (!index.has(rel) && index.has(rel + '.md')) rel += '.md'
      if (!index.has(rel) || rel === c.path) continue
      if (!/^(outputs\/|logs\/metrics\/|knowledge\/assets\/)/.test(rel) && !MEDIA.test(rel)) continue
      if (!files.some(f => f.path === rel)) files.push({ path: rel, name: path.basename(rel).replace(/\.md$/, ''), media: MEDIA.test(rel), video: /\.(mp4|webm|mov)$/i.test(rel), mtime: index.get(rel).mtime })
    }
    files.sort((a, b) => b.mtime - a.mtime)
    c.files = files.slice(0, 6)
    c.moreFiles = Math.max(0, files.length - 6)
  }
  return cards
}

export async function desktop(root, index, appDir, seen) {
  const today = dayKey()
  const keepUntil = seen.keepRoutines || {}
  const [rhythm, wait, idea, now] = await Promise.all([
    routines(root, index, today, keepUntil), waiting(root), ideaOfTheDay(root, index, appDir, today), nowCards(root, index),
  ])
  return { today, rhythm, waiting: wait, idea, now }
}

// Preview of another day's routines (read only): which are due that day, by tier.
export async function routinesOn(root, index, day, seen) {
  return { day, rhythm: await routines(root, index, day, seen.keepRoutines || {}) }
}

// Write a few frontmatter fields of a note in ideas/ (only those lines change).
export async function setFields(root, rel, fields) {
  if (!/^ideas\/[^/]+\.md$/.test(rel)) throw new Error('only notes in ideas/')
  const abs = path.join(root, rel)
  const text = await fsp.readFile(abs, 'utf8')
  if (!text.startsWith('---')) throw new Error('file has no frontmatter')
  const end = text.indexOf('\n---', 3)
  const lines = text.slice(4, end).split('\n')
  const before = {}
  for (const [k, v] of Object.entries(fields)) {
    const i = lines.findIndex(l => new RegExp(`^${k}:(\\s|$)`).test(l))
    // simple values stay bare; anything with spaces or symbols is quoted so the YAML stays valid (D249)
    const val = v === '' ? '' : /^[\w.-]+$/.test(String(v)) ? String(v) : JSON.stringify(String(v))
    if (i >= 0) { before[k] = lines[i].replace(/^[^:]+:\s*/, ''); lines[i] = `${k}: ${val}`.trimEnd() }
    else { before[k] = null; lines.push(`${k}: ${val}`.trimEnd()) }
  }
  await fsp.writeFile(abs, '---\n' + lines.join('\n') + text.slice(end))
  return before
}

// Reads the How I folder: file index, feed, numbers, notes. Read-only.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'
import MarkdownIt from 'markdown-it'
import { dataPath } from './paths.js'

const index = new Map() // rel -> { rel, ext, mtime, size }
const noteCache = new Map() // rel -> { mtime, data }
let root = ''

const SKIP_DIR = new Set(['node_modules', '.git', '.obsidian', '.trash', '__pycache__', '.maybee', 'workspaces'])
const MEDIA = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.webm', '.mov'])
const VIDEO = new Set(['.mp4', '.webm', '.mov'])

// ---------- index ----------

export async function buildIndex(dir) {
  root = dir
  index.clear()
  async function walk(abs, rel) {
    let entries
    try { entries = await fsp.readdir(abs, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (SKIP_DIR.has(e.name)) continue
      const r = rel ? `${rel}/${e.name}` : e.name
      if (r === 'system/app') continue
      if (e.isDirectory()) await walk(path.join(abs, e.name), r)
      else if (e.isFile()) await statFile(dir, r)
    }
  }
  await walk(dir, '')
}

export function getIndex() { return index }

export function allPaths(ext) {
  return [...index.values()].filter(f => !ext || f.ext === ext).map(f => f.rel)
}

// Maybee's own folder (and the other places the index never walks) is never part of the project's notes.
export const isHidden = rel => String(rel || '').split('/').some(seg => SKIP_DIR.has(seg))

export async function statFile(dir, rel) {
  if (isHidden(rel)) { index.delete(rel); return }
  try {
    const st = await fsp.stat(path.join(dir, rel))
    if (st.isDirectory()) {
      // a new folder: index what's inside
      const entries = await fsp.readdir(path.join(dir, rel), { withFileTypes: true })
      for (const e of entries) if (!SKIP_DIR.has(e.name)) await statFile(dir, `${rel}/${e.name}`)
      return
    }
    index.set(rel, { rel, ext: path.extname(rel).toLowerCase(), mtime: st.mtimeMs, size: st.size })
  } catch {
    index.delete(rel)
  }
  noteCache.delete(rel)
}

// ---------- notes ----------

function splitFrontmatter(text) {
  if (!text.startsWith('---')) return { fm: {}, body: text }
  const end = text.indexOf('\n---', 3)
  if (end < 0) return { fm: {}, body: text }
  let fm = {}
  try { fm = YAML.parse(text.slice(3, end)) || {} } catch { fm = {} }
  const body = text.slice(text.indexOf('\n', end + 1) + 1)
  return { fm: typeof fm === 'object' ? fm : {}, body }
}

async function loadNote(rel) {
  const meta = index.get(rel)
  const cached = noteCache.get(rel)
  if (cached && meta && cached.mtime === meta.mtime) return cached.data
  let text = ''
  try { text = await fsp.readFile(path.join(root, rel), 'utf8') } catch { return null }
  const { fm, body } = splitFrontmatter(text)
  const h1 = /^#\s+(.+)$/m.exec(body)
  const title = String(fm.title || (h1 ? h1[1] : path.basename(rel, '.md'))).replace(/^How I( 🌴)?\s*[:—–-]\s*/, '')
  const data = { fm, body, title }
  noteCache.set(rel, { mtime: meta ? meta.mtime : 0, data })
  return data
}

export async function readNote(dir, rel) {
  const meta = index.get(rel)
  if (!meta) return { error: 'not found', path: rel }
  if (meta.ext !== '.md') return { path: rel, abs: path.join(root, rel), ext: meta.ext, mtime: meta.mtime, title: path.basename(rel), caption: captionFor(rel) }
  const n = await loadNote(rel)
  return { path: rel, abs: path.join(root, rel), ext: '.md', mtime: meta.mtime, title: n.title, frontmatter: n.fm, html: render(n.body, rel), caption: captionFor(rel) }
}

// ---------- markdown → html (links resolved inside the project) ----------

const md = new MarkdownIt({ html: true, linkify: true, typographer: false })
const IMG_EXT = /\.(png|jpe?g|webp|gif|svg)$/i
const VID_EXT = /\.(mp4|webm|mov)$/i
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const raw = rel => '/raw?path=' + encodeURIComponent(rel)

function resolveHref(href, from) {
  if (!href || /^(https?:|mailto:|obsidian:|#)/i.test(href)) return null
  try { return resolveName(decodeURIComponent(href.split('#')[0]), from) } catch { return resolveName(href.split('#')[0], from) }
}

// Anchor ids on every heading (Plugin 1/3 for #deep links). Slug is lowercase,
// no diacritics, no punctuation; collisions get a `-2`, `-3`, … suffix within one note.
function slugify(s) {
  return String(s).toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200) // 80 was the old breakeven in HTML4; this noteset needs room for "LIVE since YYYY-MM-DD"
}
const _slugCounters = new Map() // fromPath -> Map(slug -> count)
// In markdown-it the heading text lives in an `inline` token right after `heading_open`,
// not in t.children; we walk forward until `heading_close` to find it.
function _headingText(tokens, i) {
  for (let j = i + 1; j < tokens.length && tokens[j].type !== 'heading_close'; j++) {
    if (tokens[j].type === 'inline') return tokens[j].content
  }
  return ''
}
const _defaultHeading = md.renderer.rules.heading_open || ((t, i, o, e, self) => self.renderToken(t, i, o))
md.renderer.rules.heading_open = (tokens, i, opts, env, self) => {
  const from = env && env.from
  let counter = from ? _slugCounters.get(from) : null
  if (!counter) { counter = new Map(); if (from) _slugCounters.set(from, counter) }
  const base = slugify(_headingText(tokens, i))
  if (base) {
    const n = (counter.get(base) || 0) + 1
    counter.set(base, n)
    tokens[i].attrSet('id', n === 1 ? base : base + '-' + n)
  }
  return _defaultHeading(tokens, i, opts, env, self)
}

function render(body, from) {
  // Obsidian embeds and wiki links
  let src = body.replace(/!\[\[([^\]]+)\]\]/g, (_, target) => {
    const name = target.split('|')[0].split('#')[0]
    const rel = resolveName(name, from)
    if (rel && IMG_EXT.test(rel)) return `<img src="${raw(rel)}" alt="${esc(name)}">`
    if (rel && VID_EXT.test(rel)) return `<video src="${raw(rel)}" controls preload="metadata"></video>`
    if (name.endsWith('.base') || target.includes('.base')) return '' // Obsidian board views: the app has its own board (Adal, 8/11)
    return rel ? `<a href="#" data-path="${esc(rel)}">${esc(name)}</a>` : esc(target)
  })
  src = src.replace(/\[\[([^\]]+)\]\]/g, (_, target) => {
    const [name, alias] = target.split('|')
    const rel = resolveName(name, from)
    const label = alias || path.basename(name.split('#')[0])
    return rel ? `<a href="#" data-path="${esc(rel)}">${esc(label)}</a>` : esc(label)
  })
  const env = { from }
  // Fresh heading-anchor counter per render call (otherwise repeated renders of the
  // same note would push every id to -2, -3, … and break the canonical first-occurrence ids).
  _slugCounters.delete(from)
  let html = md.render(src, env)
  // Plugin 4/3: rows in tables whose first cell matches /^D\d+$/ get id="dNNN" so
  // anchors like [D258](#d258) (used in the D-tables of decisions.md, okrs.base, etc.)
  // land on the right row even when DNNN is not a heading. Markdown-it emits the
  // opening tags on separate lines with whitespace, hence \s*.
  html = html.replace(/<tr>\s*(<td>D(\d+)<\/td>)/g, '<tr id="d$2">$1')
  return html
}

const defaultLink = md.renderer.rules.link_open || ((t, i, o, e, self) => self.renderToken(t, i, o))
md.renderer.rules.link_open = (tokens, i, opts, env, self) => {
  const t = tokens[i]
  const href = t.attrGet('href')
  const rel = resolveHref(href, env.from)
  if (rel && rel.endsWith('.base')) { t.attrSet('href', '#'); t.attrSet('data-base', '1') }
  else if (rel) { t.attrSet('href', '#'); t.attrSet('data-path', rel) }
  else if (/^https?:/i.test(href || '')) { t.attrSet('target', '_blank'); t.attrSet('rel', 'noopener') }
  return defaultLink(tokens, i, opts, env, self)
}
md.renderer.rules.image = (tokens, i, opts, env) => {
  const t = tokens[i]
  const src = t.attrGet('src') || ''
  const alt = t.content || ''
  if (/^https?:/i.test(src)) return `<img src="${esc(src)}" alt="${esc(alt)}">`
  const rel = resolveHref(src, env.from)
  if (!rel) return `<span class="missing">[image not found: ${esc(src)}]</span>`
  if (VID_EXT.test(rel)) return `<video src="${raw(rel)}" controls preload="metadata"></video>`
  return `<img src="${raw(rel)}" alt="${esc(alt)}">`
}

export function resolveName(name, from) {
  const clean = decodeURIComponent(name).split('#')[0].split('|')[0].trim()
  if (!clean) return null
  // relative path from the note
  if (from) {
    const fromDir = path.posix.dirname(from)
    const rel = path.posix.normalize(path.posix.join(fromDir, clean))
    if (index.has(rel)) return rel
    if (index.has(rel + '.md')) return rel + '.md'
  }
  if (index.has(clean)) return clean
  if (index.has(clean + '.md')) return clean + '.md'
  const want = '/' + (clean.endsWith('.md') || path.extname(clean) ? clean : clean + '.md')
  let best = null
  for (const rel of index.keys()) {
    if (('/' + rel).endsWith(want)) { if (!best || rel.length < best.length) best = rel }
  }
  return best
}

// ---------- what tells the story ----------

const HIDDEN_TOP = ['system/', 'logs/archive/', '_to_delete/', 'owner/', 'knowledge/', '.claude/', '.agents/', '.opencode/', '.playwright-mcp/']
const HIDDEN_FILES = new Set(['STATE.md', 'AGENTS.md', 'CLAUDE.md', 'README.md', 'PROJECT.md', 'DASHBOARD.md', 'package.json',
  'logs/CHANGELOG.md', 'logs/publishing.md', 'logs/metrics.md'])
const HIDDEN_SEG = /(^|\/)(build|frames|sheets|audio|archive|slides|voice-test|clips|lib|scripts)(\/|$)/

function isStory(rel, ext) {
  if (ext !== '.md' && !MEDIA.has(ext)) return false
  if (HIDDEN_FILES.has(rel)) return false
  if (HIDDEN_TOP.some(p => rel.startsWith(p))) return false
  if (HIDDEN_SEG.test(path.posix.dirname(rel))) return false
  if (rel.startsWith('logs/')) return /^logs\/(metrics|conversations)\/[^/]+\.md$/.test(rel)
  if (rel.startsWith('people/')) return rel.startsWith('people/members/')
  if (!rel.includes('/')) return false
  return true
}

function kindOf(rel, fm) {
  if (rel.startsWith('outputs/skool/community/posts/')) return 'Post'
  if (rel.startsWith('outputs/skool/community/comments/')) return 'Replies'
  if (rel.startsWith('outputs/skool/about/')) return 'About page'
  if (rel.startsWith('outputs/skool/classroom/')) return 'Classroom'
  if (rel.startsWith('outputs/spokes/')) return 'Spokes'
  if (rel.startsWith('outputs/video/')) return 'Video'
  if (rel.startsWith('outputs/instagram/')) return 'Instagram'
  if (rel.startsWith('outputs/ads/')) return 'Ads'
  if (rel.startsWith('outputs/linkedin/')) return 'LinkedIn'
  if (rel.startsWith('outputs/images/')) return 'Images'
  if (rel.startsWith('ideas/')) return fm.type === 'task' ? 'Task' : fm.type === 'routine' ? 'Routine' : 'Idea'
  if (rel.startsWith('logs/metrics/')) return 'Numbers'
  if (rel.startsWith('logs/conversations/')) return 'Your words'
  if (rel.startsWith('people/')) return 'Member'
  if (rel.startsWith('knowledge/')) return 'Knowledge'
  if (rel.startsWith('system/')) return 'System'
  return 'Note'
}

function excerptOf(body) {
  const block = /```text\n([\s\S]*?)```/.exec(body)
  let src = block ? block[1] : body
  const lines = src.split('\n').map(l => l.trim())
  const out = []
  for (const l of lines) {
    if (!l) { if (out.length) out.push(''); continue }
    if (/^(>|#|\||---|```|!\[)/.test(l)) continue
    out.push(l.replace(/^[-*•]\s+/, '').replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (_, a, __, b) => b || path.basename(a)))
    if (out.join(' ').length > 420) break
  }
  let text = out.join('\n').replace(/\n{2,}/g, '\n').trim()
  if (block && text.includes('\n')) text = text.slice(text.indexOf('\n') + 1) // drop the title line of the post
  return text.length > 400 ? text.slice(0, 400).replace(/\s+\S*$/, '') + '…' : text
}

// ---------- changelog captions ----------

let changelog = { mtime: -1, entries: [] }
function loadChangelog() {
  const meta = index.get('logs/CHANGELOG.md')
  if (!meta || meta.mtime === changelog.mtime) return changelog.entries
  const text = fs.readFileSync(path.join(root, 'logs/CHANGELOG.md'), 'utf8')
  const entries = []
  let section = null
  for (const line of text.split('\n')) {
    const h = /^## (\d{4}-\d{2}-\d{2})/.exec(line)
    if (h) { section = h[1]; continue }
    // dated bullets: "- 2026-11-08: text" (app) or "- 2026-11-08 · Claude Code · text"; otherwise the section's date
    const b = /^- (?:(\d{4}-\d{2}-\d{2})(?::|\s+·)\s*)?(.+)$/.exec(line)
    if (b && (b[1] || section)) entries.push({ date: b[1] || section, text: b[2] })
  }
  changelog = { mtime: meta.mtime, entries }
  return entries
}

function plain(md) {
  return md.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim()
}

function captionFor(rel, dirOnly = false) {
  const entries = loadChangelog()
  const base = path.basename(rel, path.extname(rel))
  const keys = dirOnly || /^\d{4}-\d{2}-\d{2}$/.test(base) ? [rel] : [rel, base]
  const needles = keys.flatMap(k => [k, k.replace(/ /g, '%20')]).filter(k => k.length > 4)
  let hit = null
  const hits = []
  for (const e of entries) {
    if (needles.some(n => e.text.includes(n))) { hits.push(e); if (!hit || e.date >= hit.date) hit = e }
  }
  if (!hit) return null
  const cut = t => t.length > 320 ? t.slice(0, 320).replace(/\s+\S*$/, '') + '…' : t
  const t = plain(hit.text)
  // the last few changes, newest first (the viewer shows them as an activity list)
  const recent = hits.slice(-40).reverse().map(e => ({ date: e.date, text: cut(plain(e.text)) }))
  return { date: hit.date, text: cut(t), recent }
}

// ---------- decisions as feed items ----------

let decisions = { mtime: -1, rows: [] }
// When each decision first showed up in the register (ms). The register has dates, not times,
// so a decision added today would otherwise sit at a made-up time. Kept in data/.
const decisionTimesFile = () => dataPath('decision-times.json')
function readDecisionTimes() {
  try { return JSON.parse(fs.readFileSync(decisionTimesFile(), 'utf8')) } catch { return null }
}
function changelogDate(id) {
  const re = new RegExp(`\\b${id}\\b`)
  let best = null
  for (const e of loadChangelog()) if (re.test(e.text) && (!best || e.date < best)) best = e.date
  return best
}
function loadDecisions() {
  const meta = index.get('knowledge/decisions.md')
  if (!meta) return []
  if (meta.mtime === decisions.mtime) return decisions.rows
  const text = fs.readFileSync(path.join(root, 'knowledge/decisions.md'), 'utf8')
  const rows = []
  const ids = new Map()
  for (const line of text.split('\n')) {
    const m = /^\| (D\d+(?: \(update\))?) \| (.+?) \|[^|]*\|?\s*$/.exec(line)
    if (!m) continue
    const base = m[1].replace(/ .*/, '')
    const dates = [...m[2].matchAll(/\((\d{4}-\d{2}-\d{2})\)/g)]
    // no "(YYYY-MM-DD)" in the row: dated below from the changelog and the decision before it
    const date = dates.length ? dates[dates.length - 1][1] : null
    // a second "(update)" of the same decision gets its own id, so its card and read-state are its own
    const n = (ids.get(m[1]) || 0) + 1
    ids.set(m[1], n)
    const id = n > 1 ? `${base} (update ${n})` : m[1]
    const bold = /\*\*(.+?)\*\*/.exec(m[2])
    const title = plain(bold ? bold[1] : m[2]).replace(/[.:;,]\s*$/, '')
    let rest = bold ? plain(m[2].replace(/\*\*.+?\*\*/, '')) : ''
    rest = rest.replace(/\(\d{4}-\d{2}-\d{2}\)\s*$/, '').replace(/^[\s.:;,—–-]+/, '').trim()
    if (rest.length > 360) rest = rest.slice(0, 360).replace(/\s+\S*$/, '') + '…'
    rows.push({ id, date, title: title.length > 140 ? title.slice(0, 140).replace(/\s+\S*$/, '') + '…' : title, text: rest })
  }
  // undated rows: the later of the first changelog line citing it and the previous decision's date
  // (numbers are given in order, so a decision is never older than the one before it)
  const num = r => Number(r.id.slice(1).replace(/ .*/, ''))
  const dated = rows.filter(r => r.date).sort((x, y) => num(x) - num(y))
  for (const r of rows) {
    if (r.date) continue
    const prev = dated.filter(d => num(d) < num(r)).pop()
    const cands = [changelogDate(r.id.replace(/ .*/, '')), prev && prev.date].filter(Boolean).sort()
    r.date = cands.pop() || null
  }
  for (let i = rows.length - 1; i >= 0; i--) if (!rows[i].date) rows.splice(i, 1)
  // time of each card: when the row first appeared (recorded), else noon of its date
  const known = readDecisionTimes()
  const times = known || {}
  let changed = false
  for (const r of rows) {
    if (times[r.id] == null) {
      const noon = new Date(`${r.date}T12:00:00`).getTime()
      // first run: rows dated today get the file's time; later runs: a new row appeared now
      times[r.id] = known ? meta.mtime : dayKey(meta.mtime) === r.date ? meta.mtime - 1 : noon
      changed = true
    }
    r.time = times[r.id]
  }
  if (changed) try { fs.writeFileSync(decisionTimesFile(), JSON.stringify(times, null, 1)) } catch {}
  decisions = { mtime: meta.mtime, rows }
  return rows
}

// ---------- feed ----------

function dayKey(ms) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}


// D255 follow-up: what a card says about itself (Adal, 2026-11-08: "no feed poderia aparecer o ultimo log… e algum contexto no card")
const BOILERPLATE = /^(Maybee|Maybee rules|How I)\s·/
function cleanLine(l) {
  return l.replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (_, a, __, b) => b || path.basename(a)).trim()
}
function contextOf(fm) {
  const d = typeof fm.description === 'string' ? fm.description.trim() : ''
  if (d && !BOILERPLATE.test(d)) return cleanLine(d)
  const f = typeof fm.for === 'string' ? fm.for.trim() : ''
  if (f && !/^daily routine$/i.test(f)) return cleanLine(f)
  return null
}
function routineOf(fm, body) {
  const today = dayKey(Date.now())
  const lastDone = fm.last_done ? String(fm.last_done).slice(0, 10) : null
  let lastLog = null
  for (const l of body.split('\n')) {
    const m = /^[-*]\s+(\d{4}-\d{2}-\d{2})[^:]*:\s*(.+)$/.exec(l.trim())
    if (m) lastLog = { date: m[1], text: cleanLine(m[2]) }
  }
  const every = parseInt(fm.auto_every, 10) || 1
  const schedule = fm.auto === 'days' ? (every === 1 ? 'Every day' : `Every ${every} days`)
    : fm.auto === 'session' || (!fm.auto && (fm.auto_run === true || fm.auto_run === 'true')) ? 'Every session'
    : fm.auto === 'hours' ? `Every ${every} hours`
    : fm.auto === 'weeks' ? (every === 1 ? 'Every week' : `Every ${every} weeks`)
    : fm.auto === 'months' ? 'Every month' : null
  return {
    lastDone, doneToday: lastDone === today,
    skippedToday: fm.not_today ? String(fm.not_today).slice(0, 10) === today : false,
    lastLog, schedule,
  }
}

export async function feed(dir, { all = false, before = null, limit = 80, enrich = true } = {}) {
  const items = []
  const mediaGroups = new Map()
  for (const f of index.values()) {
    if (all ? false : !isStory(f.rel, f.ext)) continue
    if (MEDIA.has(f.ext)) {
      const key = `${path.posix.dirname(f.rel)}|${dayKey(f.mtime)}`
      const g = mediaGroups.get(key) || { files: [], time: 0, dir: path.posix.dirname(f.rel) }
      g.files.push({ path: f.rel, video: VIDEO.has(f.ext), time: f.mtime })
      g.time = Math.max(g.time, f.mtime)
      mediaGroups.set(key, g)
      continue
    }
    items.push({ type: 'file', path: f.rel, ext: f.ext, time: f.mtime })
  }
  for (const [key, g] of mediaGroups) {
    g.files.sort((a, b) => b.time - a.time)
    items.push({ type: 'media', id: key, dir: g.dir, time: g.time, files: g.files.map(({ path: p, video }) => ({ path: p, video })) })
  }
  {
    for (const r of loadDecisions()) {
      items.push({ type: 'decision', id: r.id, time: r.time, title: `${r.id} · ${r.title}`, text: r.text, path: 'knowledge/decisions.md' })
    }
  }
  items.sort((a, b) => b.time - a.time)
  const page = items.filter(i => before == null || i.time < before).slice(0, limit)

  // enrich only the page
  if (enrich) for (const it of page) {
    if (it.type === 'file') {
      if (it.ext === '.md') {
        const n = await loadNote(it.path)
        if (n) {
          it.title = n.title
          it.kind = kindOf(it.path, n.fm)
          const dm = /(\d{4})-(\d{2})-(\d{2})\.md$/.exec(it.path)
          if (dm && /\d{4}-\d{2}-\d{2}$/.test(it.title)) {
            const label = new Date(`${dm[1]}-${dm[2]}-${dm[3]}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
            it.title = it.kind === 'Numbers' ? `Skool numbers, ${label}` : `${it.kind}, ${label}`
          }
          it.excerpt = excerptOf(n.body)
          it.status = n.fm.status || null
          it.stage = n.fm.stage || null
          it.link = typeof n.fm.link === 'string' && n.fm.link.startsWith('http') ? n.fm.link : null
          it.context = contextOf(n.fm)
          if (it.kind === 'Routine') it.routine = routineOf(n.fm, n.body)
        }
      } else {
        it.title = path.basename(it.path)
        it.kind = kindOf(it.path, {})
      }
      it.caption = captionFor(it.path)
    } else if (it.type === 'media') {
      it.kind = kindOf(it.dir + '/', {})
      it.title = it.dir.split('/').slice(-2).join(' / ')
      it.caption = captionFor(it.dir, true) || (it.files[0] ? captionFor(it.files[0].path) : null)
    } else if (it.type === 'decision') {
      it.kind = 'Decision'
    }
  }
  const last = page[page.length - 1]
  return { items: page, next: page.length === limit && last ? last.time : null, total: items.length }
}

// ---------- numbers ----------

export async function numbers() {
  const recs = []
  for (const f of index.values()) {
    if (!/^logs\/metrics\/\d{4}-\d{2}-\d{2}\.md$/.test(f.rel)) continue
    const n = await loadNote(f.rel)
    if (n && n.fm.date) recs.push({ ...n.fm, date: String(n.fm.date).slice(0, 10), path: f.rel })
  }
  recs.sort((a, b) => a.date.localeCompare(b.date))
  if (!recs.length) return { items: [] }
  const last = recs[recs.length - 1]
  const prev = recs.length > 1 ? recs[recs.length - 2] : null
  const today = new Date(dayKey(Date.now()) + 'T00:00:00')

  let lastJoin = last.last_new_member ? String(last.last_new_member).slice(0, 10) : null
  if (!lastJoin) {
    const withNew = recs.filter(r => Array.isArray(r.new_members) && r.new_members.length)
    if (withNew.length) lastJoin = withNew[withNew.length - 1].date
  }
  const daysSince = lastJoin ? Math.round((today - new Date(lastJoin + 'T00:00:00')) / 86400000) : null
  const delta = (k, digits = 0) => (prev && typeof last[k] === 'number' && typeof prev[k] === 'number')
    ? Number((last[k] - prev[k]).toFixed(digits)) : null

  const items = [
    { key: 'members', label: 'Members', value: last.members, delta: delta('members') },
    { key: 'days', label: 'Days since a new member', value: daysSince, note: lastJoin ? `last joined ${lastJoin}` : null, alert: daysSince != null && daysSince >= 7 },
    { key: 'visitors', label: 'About visitors · 30d', value: last.visitors_30d, delta: delta('visitors_30d') },
    { key: 'conversion', label: 'Conversion', value: last.conversion, unit: '%', delta: delta('conversion', 1), goodDown: false },
    { key: 'video', label: 'Best video · week', value: last.best_video_views ?? null, note: last.best_video || null },
    { key: 'ads', label: 'Ad spend', value: last.ad_spend ?? null, unit: last.ad_spend != null ? '$' : '', unitFirst: true, note: last.ad_status || null, alert: !!last.ad_alert },
  ]
  return { date: last.date, prevDate: prev ? prev.date : null, path: last.path, items, series: recs.map(r => ({ date: r.date, path: r.path, members: r.members, visitors: r.visitors_30d, signups: r.signups_30d, conversion: r.conversion, engagement: r.engagement, video: r.best_video_views ?? null, ads: r.ad_spend ?? null, notes: typeof r.notes === 'string' ? r.notes : null })) }
}

// ---------- library: every file by type ----------

const LIB_SKIP = ['.claude/', '.agents/', '.opencode/', '.playwright-mcp/', '_to_delete/']
// the Library splits what the feed calls a plain "Note"
function libKind(rel, kind) {
  if (kind !== 'Note') return kind
  if (rel.startsWith('logs/archive/')) return 'Archive'
  if (rel.startsWith('logs/')) return 'Log'
  if (rel.startsWith('owner/')) return 'Owner'
  if (!rel.includes('/')) return 'Project'
  return kind
}

export async function library() {
  const items = []
  for (const f of index.values()) {
    if (f.ext !== '.md' && !MEDIA.has(f.ext)) continue
    if (LIB_SKIP.some(p => f.rel.startsWith(p))) continue
    if (f.ext === '.md') {
      const n = await loadNote(f.rel)
      if (!n) continue
      const desc = typeof n.fm.description === 'string' ? n.fm.description : ''
      items.push({ path: f.rel, ext: f.ext, time: f.mtime, kind: libKind(f.rel, kindOf(f.rel, n.fm)), title: n.title, desc: desc.length > 200 ? desc.slice(0, 200).replace(/\s+\S*$/, '') + '…' : desc, status: n.fm.status || n.fm.stage || null })
    } else {
      items.push({ path: f.rel, ext: f.ext, time: f.mtime, kind: libKind(f.rel, kindOf(f.rel, {})), title: path.basename(f.rel), media: VIDEO.has(f.ext) ? 'video' : 'image' })
    }
  }
  items.sort((a, b) => b.time - a.time)
  return { items }
}

// search inside the notes' text (title and path are filtered in the browser)
export async function search(q, limit = 120) {
  const needle = String(q || '').trim().toLowerCase()
  if (needle.length < 2) return { items: [] }
  const out = []
  for (const f of index.values()) {
    if (f.ext !== '.md' || LIB_SKIP.some(p => f.rel.startsWith(p))) continue
    const n = await loadNote(f.rel)
    if (!n) continue
    const text = n.body
    const i = text.toLowerCase().indexOf(needle)
    if (i < 0) continue
    let hits = 0
    for (let j = i; j >= 0 && hits < 99; j = text.toLowerCase().indexOf(needle, j + needle.length)) hits++
    const a = Math.max(0, i - 70), b = Math.min(text.length, i + needle.length + 90)
    const snippet = (a ? '…' : '') + plain(text.slice(a, b)) + (b < text.length ? '…' : '')
    out.push({ path: f.rel, hits, snippet, time: f.mtime })
  }
  out.sort((x, y) => y.hits - x.hits || y.time - x.time)
  return { items: out.slice(0, limit), total: out.length }
}

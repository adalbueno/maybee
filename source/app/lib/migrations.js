// Migrations: moving files inside a workspace between package versions, and keeping Markdown links correct.
// A migration is a small JSON file in the package (migrations/NNNN-name.json). Nothing here runs by itself:
// the agent shows the plan, the user says yes, then apply() moves the files, fixes every link that pointed at
// them (or from them), and keeps a backup. The same engine moves a single file on request (moveFiles).
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const firstDir = (...candidates) => candidates.find(d => fs.existsSync(d)) || null
// This file runs from the source tree (app/lib), from the packaged script (app/scripts) and from the packaged server
// (app/): the package folders are found from whichever of the places above or below it holds them.
const around = (...parts) => [APP_DIR, path.join(APP_DIR, '..'), path.join(APP_DIR, '..', '..')].flatMap(base => [path.join(base, ...parts), path.join(base, 'release', ...parts)])
const migrationsDir = () => firstDir(...around('migrations'))
// The blank workspace new workspaces start from (the template playbook).
export const templateDir = () => firstDir(...around('playbooks', 'template', 'workspace'))
// Copies the package seeds into workspaces. A file in the destination that is identical to a seed was never edited.
const seedDirs = () => [...new Set([...around('workspaces', 'default'), ...around('playbooks', 'template', 'workspace'), path.join(APP_DIR, '..', '..', 'source', 'playbooks', 'template', 'workspace')])].filter(d => fs.existsSync(d))

const rel = (root, abs) => path.relative(root, abs).split(path.sep).join('/')

async function markdownFiles(root) {
  const out = []
  const walk = async dir => {
    for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue
      const full = path.join(dir, e.name)
      if (e.isDirectory()) await walk(full)
      else if (e.isFile() && e.name.endsWith('.md')) out.push(full)
    }
  }
  await walk(root)
  return out
}

// ---------- links ----------

const INLINE = /\]\((<[^>\n]*>|[^)\s]*)(?:\s+"[^"]*")?\)/g
const REFERENCE = /^ {0,3}\[[^\]\n]+\]:\s*(<[^>\n]*>|\S+)/

// Every link in a Markdown text: where its target sits, its line number, and the raw target. Code is skipped.
export function findLinks(text) {
  const links = []
  let offset = 0, fence = null
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    const start = offset
    offset += line.length + 1
    const marker = /^ {0,3}(```|~~~)/.exec(line)
    if (marker) { fence = fence === null ? marker[1] : fence === marker[1] ? null : fence; return }
    if (fence) return
    const masked = line.replace(/`[^`]*`/g, m => ' '.repeat(m.length))
    for (const m of masked.matchAll(INLINE)) links.push({ start: start + m.index + 2, end: start + m.index + 2 + m[1].length, line: i + 1, target: m[1] })
    const ref = REFERENCE.exec(masked)
    if (ref) links.push({ start: start + ref[0].length - ref[1].length, end: start + ref[0].length, line: i + 1, target: ref[1] })
  })
  return links
}

// A relative link to a file: the decoded path plus whatever follows it (#section). Web links, anchors and absolute paths are not ours.
function parseTarget(raw) {
  const angled = raw.startsWith('<') && raw.endsWith('>')
  const inner = angled ? raw.slice(1, -1) : raw
  if (!inner || inner.startsWith('#') || inner.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(inner)) return null
  const cut = inner.search(/[#?]/)
  const pathPart = cut < 0 ? inner : inner.slice(0, cut)
  if (!pathPart) return null
  let decoded = pathPart
  try { decoded = decodeURI(pathPart) } catch {}
  return { angled, decoded, suffix: cut < 0 ? '' : inner.slice(cut) }
}

function formatTarget(relative, { angled, suffix }) {
  const posix = relative.split(path.sep).join('/')
  if (angled) return `<${posix}${suffix}>`
  return posix.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29') + suffix
}

// moveMap: Map of absolute old path -> absolute new path. Returns what every Markdown file becomes once the moves are done:
// links to a moved file follow it, and links inside a moved file are rewritten for its new folder.
async function rewritePlan(root, moveMap) {
  const changes = []
  for (const file of await markdownFiles(root)) {
    const text = await fsp.readFile(file, 'utf8')
    const newLocation = moveMap.get(file) || file
    let out = '', last = 0
    for (const link of findLinks(text)) {
      const target = parseTarget(link.target)
      if (!target) continue
      const abs = path.resolve(path.dirname(file), target.decoded)
      const dest = moveMap.get(abs) || abs
      if (newLocation === file && dest === abs) continue
      const next = formatTarget(path.relative(path.dirname(newLocation), dest), target)
      if (next === link.target) continue
      out += text.slice(last, link.start) + next
      last = link.end
    }
    out += text.slice(last)
    if (out !== text || newLocation !== file) changes.push({ from: file, to: newLocation, text, newText: out })
  }
  return changes
}

// Relative links that point at nothing. Run it after any change that moves, renames or deletes a file.
export async function checkLinks(root) {
  const broken = []
  for (const file of await markdownFiles(root)) {
    const text = await fsp.readFile(file, 'utf8')
    for (const link of findLinks(text)) {
      const target = parseTarget(link.target)
      if (!target) continue
      if (!fs.existsSync(path.resolve(path.dirname(file), target.decoded))) broken.push({ file: rel(root, file), line: link.line, target: link.target })
    }
  }
  return broken
}

// ---------- moving ----------

const inside = (root, abs) => abs === root || abs.startsWith(root + path.sep)

// Moves files (paths relative to the workspace), repairs links, and backs up everything it touches.
// A destination that already exists is replaced only when `replace` lists it (an untouched package seed).
export async function moveFiles(root, moves, { id = 'move', replace = [] } = {}) {
  const map = new Map()
  for (const m of moves) {
    const from = path.resolve(root, m.from), to = path.resolve(root, m.to)
    if (!inside(root, from) || !inside(root, to)) throw new Error(`Outside the workspace: ${m.from} -> ${m.to}`)
    if (from.startsWith(path.join(root, '.maybee')) || to.startsWith(path.join(root, '.maybee'))) throw new Error('Maybee\'s own folder cannot be moved')
    if (!fs.existsSync(from)) throw new Error(`Not found: ${m.from}`)
    if (fs.existsSync(to) && !replace.includes(m.to)) throw new Error(`Already exists: ${m.to}`)
    map.set(from, to)
  }
  const changes = await rewritePlan(root, map)
  const backup = path.join(root, '.maybee', 'backup', `${id}-${new Date().toISOString().replace(/[:.]/g, '-')}`)
  const save = async abs => {
    const dest = path.join(backup, rel(root, abs))
    await fsp.mkdir(path.dirname(dest), { recursive: true })
    await fsp.copyFile(abs, dest)
  }
  for (const c of changes) await save(c.from)
  for (const to of map.values()) if (fs.existsSync(to)) await save(to)
  for (const [from, to] of map) {
    await fsp.mkdir(path.dirname(to), { recursive: true })
    await fsp.rm(to, { force: true })
    await fsp.rename(from, to)
  }
  const rewritten = []
  for (const c of changes) {
    if (c.newText === c.text) continue
    await fsp.writeFile(c.to, c.newText)
    rewritten.push(rel(root, c.to))
  }
  return { moved: [...map].map(([f, t]) => ({ from: rel(root, f), to: rel(root, t) })), rewritten, backup: rel(root, backup) }
}

// ---------- migrations ----------

const stateFile = root => path.join(root, '.maybee', 'migrations.json')
function readState(root) {
  try { return JSON.parse(fs.readFileSync(stateFile(root), 'utf8')) } catch { return { applied: {} } }
}
async function writeState(root, state) {
  await fsp.mkdir(path.dirname(stateFile(root)), { recursive: true })
  await fsp.writeFile(stateFile(root), JSON.stringify(state, null, 2))
}

export function loadMigrations() {
  const dir = migrationsDir()
  if (!dir) return []
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
}

const sameAsSeed = (relPath, abs) => {
  let current
  try { current = fs.readFileSync(abs) } catch { return false }
  return seedDirs().some(dir => { try { return fs.readFileSync(path.join(dir, relPath)).equals(current) } catch { return false } })
}

function classify(root, move) {
  const from = path.join(root, move.from), to = path.join(root, move.to)
  if (!fs.existsSync(from)) return 'skip'
  if (!fs.existsSync(to)) return 'move'
  return sameAsSeed(move.to, to) ? 'replace-seed' : 'conflict'
}

// What is waiting for this workspace. A migration with nothing to move (a workspace made from the new layout)
// is recorded as satisfied and not shown.
export async function plan(root) {
  const state = readState(root)
  const pending = []
  let dirty = false
  for (const m of loadMigrations()) {
    if (state.applied[m.id]) continue
    const moves = m.moves.map(mv => ({ ...mv, status: classify(root, mv) }))
    if (moves.every(mv => mv.status === 'skip')) {
      state.applied[m.id] = { at: new Date().toISOString(), moved: [], note: 'nothing to move' }
      dirty = true
      continue
    }
    const active = moves.filter(mv => mv.status === 'move' || mv.status === 'replace-seed')
    const map = new Map(active.map(mv => [path.join(root, mv.from), path.join(root, mv.to)]))
    const links = (await rewritePlan(root, map)).filter(c => c.newText !== c.text).map(c => rel(root, c.from))
    pending.push({ id: m.id, version: m.version, title: m.title, description: m.description || '', moves, linksToFix: links })
  }
  if (dirty) await writeState(root, state)
  return pending
}

// Applies the pending migrations (all, or the ids given). Conflicts are left alone and reported.
export async function apply(root, ids = null) {
  const pending = await plan(root)
  const state = readState(root)
  const done = []
  for (const m of pending) {
    if (ids && !ids.includes(m.id)) continue
    const active = m.moves.filter(mv => mv.status === 'move' || mv.status === 'replace-seed')
    const skipped = m.moves.filter(mv => mv.status === 'conflict').map(mv => ({ from: mv.from, to: mv.to, why: 'both files exist and differ: merge by hand' }))
    const result = active.length
      ? await moveFiles(root, active.map(({ from, to }) => ({ from, to })), { id: m.id, replace: active.filter(mv => mv.status === 'replace-seed').map(mv => mv.to) })
      : { moved: [], rewritten: [], backup: null }
    state.applied[m.id] = { at: new Date().toISOString(), moved: result.moved, skipped, rewritten: result.rewritten.length, backup: result.backup }
    done.push({ id: m.id, title: m.title, ...result, skipped })
  }
  if (done.length) await writeState(root, state)
  return { done, brokenLinks: await checkLinks(root) }
}

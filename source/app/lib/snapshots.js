// Copies of notes as the owner last saw them, so a card can show what changed since.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { diffLines } from 'diff'

let root = ''
let dir = ''
const fileOf = rel => path.join(dir, crypto.createHash('sha1').update(rel).digest('hex') + '.md')

export async function initSnapshots(projectRoot, appDir, mdPaths) {
  root = projectRoot
  dir = path.join(appDir, 'data', 'snapshots')
  await fsp.mkdir(dir, { recursive: true })
  for (const rel of mdPaths) {
    const f = fileOf(rel)
    if (!fs.existsSync(f)) await snapshot(rel)
  }
}

export async function snapshot(rel) {
  if (!rel || !rel.endsWith('.md')) return
  try { await fsp.copyFile(path.join(root, rel), fileOf(rel)) } catch {}
}

export async function diffFor(rel) {
  let before, after
  try { after = await fsp.readFile(path.join(root, rel), 'utf8') } catch { return null }
  try { before = await fsp.readFile(fileOf(rel), 'utf8') } catch { return { isNew: true } }
  if (before === after) return null
  const parts = diffLines(before, after)
  const md = s => s.replace(/^#+\s*/, '').replace(/^[-*•]\s+/, '').replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  const clip = s0 => { const s = md(s0); return s.length > 180 ? s.slice(0, 180).replace(/\s+\S*$/, '') + '…' : s }
  const useful = l => l && !/^(---|>|\|[-: |]+\|$)/.test(l)
  let added = 0, removed = 0
  let section = null, contextLine = null
  const plus = [], minus = []
  let firstSeen = false
  for (const p of parts) {
    const lines = p.value.split('\n').map(l => l.trim())
    if (!p.added && !p.removed) {
      if (!firstSeen) for (const l of lines) {
        if (/^#{1,4}\s/.test(l)) { section = l; contextLine = null }
        else if (useful(l)) contextLine = l
      }
      continue
    }
    const keep = lines.filter(useful)
    if (p.added) { added += keep.length; if (!firstSeen || plus.length < 4) plus.push(...keep) }
    else { removed += keep.length; if (!firstSeen || minus.length < 3) minus.push(...keep) }
    firstSeen = true
  }
  if (!added && !removed) return null
  const lines = []
  if (contextLine) lines.push({ t: 'c', s: clip(contextLine) })
  lines.push(...minus.slice(0, plus.length ? 1 : 3).map(s => ({ t: '-', s: clip(s) })))
  lines.push(...plus.slice(0, minus.length ? 3 : 4).map(s => ({ t: '+', s: clip(s) })))
  return { added, removed, section: section ? clip(section) : null, lines }
}

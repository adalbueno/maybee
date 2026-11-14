// The project's foundations: knowledge/ (audience, offer, brand) and decisions/. A workspace made before they existed does not
// have them, so this adds the files it is missing from the template (never touching one that exists), and says how much of
// each file is filled in. Each section of a template file is a "## " heading, a prompt in italics and an empty bullet.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { templateDir } from './migrations.js'

const PREFIXES = ['knowledge/', 'decisions/']
const STATUS_FOLDERS = ['knowledge/audience/', 'knowledge/offer/', 'knowledge/brand/']

async function files(dir, base = dir) {
  const out = []
  for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...await files(full, base))
    else if (e.isFile()) out.push(path.relative(base, full).split(path.sep).join('/'))
  }
  return out
}

// Files of the template's foundations that this workspace does not have.
export async function missingFromTemplate(root) {
  const template = templateDir()
  if (!template) return []
  return (await files(template)).filter(rel => PREFIXES.some(p => rel.startsWith(p)) && !fs.existsSync(path.join(root, rel))).sort()
}

export async function addMissing(root) {
  const template = templateDir()
  const created = await missingFromTemplate(root)
  const title = path.basename(root).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const today = new Date().toISOString().slice(0, 10)
  for (const rel of created) {
    const text = (await fsp.readFile(path.join(template, rel), 'utf8')).replaceAll('{{TITLE}}', title).replaceAll('{{DATE}}', today)
    await fsp.mkdir(path.dirname(path.join(root, rel)), { recursive: true })
    await fsp.writeFile(path.join(root, rel), text, { flag: 'wx' })
  }
  return created
}

// Guidance that version 0.1.29 of the template wrote as plain text. It is a prompt, not an answer, so a note made then does not
// look filled in. (Newer templates write their guidance in italics.)
const OLD_GUIDANCE = new Set([
  'For each step, sales per day × price is the daily revenue. Subtract what you spend on ads and remarketing. Check that the attraction step pays for the ads, then that the steps above it add the profit.',
  '- Everyday objects that are peculiar to you.',
  '- Phrases you say all the time.',
  '- The way you already write, when you are not trying.',
])

// Sections of a note and whether each has an answer: anything that is not the italic prompt or an empty bullet.
export function sections(text) {
  const out = []
  let current = null
  for (const line of text.replace(/^---\n[\s\S]*?\n---\n?/, '').split('\n')) {
    const heading = /^## (.+)/.exec(line)
    if (heading) { current = { title: heading[1].trim(), filled: false }; out.push(current); continue }
    if (!current) continue
    const t = line.trim()
    if (!t || /^_.*_$/.test(t) || /^[-*]$/.test(t) || /^\|[\s|:-]*\|$/.test(t) || OLD_GUIDANCE.has(t)) continue
    current.filled = true
  }
  return out
}

// { 'knowledge/audience/persona.md': { filled: 2, total: 16 } } for the notes that have sections.
export async function fillStatus(root) {
  const status = {}
  for (const folder of STATUS_FOLDERS) {
    let entries = []
    try { entries = await fsp.readdir(path.join(root, folder), { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith('.md')) continue
      const list = sections(await fsp.readFile(path.join(root, folder, e.name), 'utf8'))
      if (list.length) status[folder + e.name] = { filled: list.filter(s => s.filled).length, total: list.length }
    }
  }
  return status
}

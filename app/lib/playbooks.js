// Playbooks: a .zip of a folder with a playbook.json and a workspace/ folder of content (ideas, routines, knowledge, decisions...).
// A playbook is shaped like a workspace but does not need PROJECT.md, STATE.md or DASHBOARD.md: it adds to a workspace.
// Applying one copies the files the workspace does not have yet and never touches a file that exists.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { readZip } from './zip.js'

// These files belong to the workspace that receives a playbook, so a playbook never brings them.
const OWN = new Set(['PROJECT.md', 'STATE.md', 'DASHBOARD.md', 'owner/preferences.md'])

function read(dir, name) {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'playbook.json'), 'utf8'))
    const workspace = path.join(dir, String(meta.workspace || 'workspace'))
    if (!fs.existsSync(workspace)) return null
    return { name, title: String(meta.title || name), description: String(meta.description || ''), author: meta.author ? String(meta.author) : null, workspace }
  } catch { return null }
}

async function files(dir, base = dir) {
  const out = []
  for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...await files(full, base))
    else if (e.isFile()) out.push(path.relative(base, full).split(path.sep).join('/'))
  }
  return out
}

// A routine that comes from a playbook starts with auto-run off: the user decides when it runs by itself.
function routineOff(text) {
  const m = /^---\n([\s\S]*?)\n---/.exec(text)
  if (!m || !/^type:\s*routine\s*$/m.test(m[1])) return text
  const fm = /^auto:.*$/m.test(m[1]) ? m[1].replace(/^auto:.*$/m, 'auto: off') : m[1] + '\nauto: off'
  return text.replace(m[1], fm)
}

// Copies the playbook's files into root. Returns what was added and what was left alone because it already existed.
export async function applyPlaybook(root, playbook, { title = '' } = {}) {
  const now = new Date().toISOString().slice(0, 10)
  const added = [], skipped = []
  for (const rel of (await files(playbook.workspace)).sort()) {
    if (OWN.has(rel)) continue
    const dest = path.join(root, rel)
    if (fs.existsSync(dest)) { skipped.push(rel); continue }
    const from = path.join(playbook.workspace, rel)
    await fsp.mkdir(path.dirname(dest), { recursive: true })
    if (rel.endsWith('.md')) await fsp.writeFile(dest, routineOff((await fsp.readFile(from, 'utf8')).replaceAll('{{TITLE}}', title).replaceAll('{{DATE}}', now)), { flag: 'wx' })
    else await fsp.copyFile(from, dest, fs.constants.COPYFILE_EXCL)
    added.push(rel)
  }
  return { playbook: playbook.name, added, skipped }
}

// A playbook sent as a zip: playbook.json and the content folder, at the top of the zip or inside one folder.
// The files are unpacked to a temporary folder, applied, and the temporary folder is removed.
export async function importZip(root, buffer, { title = '' } = {}) {
  const entries = readZip(buffer).filter(e => !e.name.startsWith('__MACOSX/') && !e.name.split('/').pop().startsWith('.'))
  const manifest = entries.map(e => e.name).filter(n => /(^|\/)playbook\.json$/.test(n)).sort((a, b) => a.length - b.length)[0]
  if (!manifest) throw new Error('This zip has no playbook.json.')
  const prefix = manifest.slice(0, manifest.length - 'playbook.json'.length)
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'maybee-playbook-'))
  try {
    for (const e of entries) {
      if (!e.name.startsWith(prefix)) continue
      const dest = path.join(tmp, e.name.slice(prefix.length))
      await fsp.mkdir(path.dirname(dest), { recursive: true })
      await fsp.writeFile(dest, e.data)
    }
    const meta = read(tmp, path.basename(prefix.replace(/\/$/, '')) || 'playbook')
    if (!meta) throw new Error('playbook.json is not valid, or its workspace folder is missing from the zip.')
    return { ...(await applyPlaybook(root, meta, { title })), title: meta.title }
  } finally { await fsp.rm(tmp, { recursive: true, force: true }) }
}

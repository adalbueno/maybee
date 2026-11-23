// Moving, renaming and deleting files and folders from the Brain, without breaking a link.
// A move rewrites, in every note of the workspace: Markdown links that point at what moved (and the moved notes' own links),
// workspace paths written out in full (the changelog, frontmatter like deliverable:), and, on a rename, [[wiki links]].
// A delete is a move into .trash/ (never read by the app), so it can be undone.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

const P = path.posix
const SKIP = new Set(['node_modules', '.git', '.obsidian', '.trash', '__pycache__', '.maybee', 'workspaces'])
// the files and folders the app and the agent count on finding where they are
const FIXED_FILES = new Set(['STATE.md', 'PROJECT.md', 'DASHBOARD.md', 'README.md', 'AGENTS.md', 'CLAUDE.md'])
const TOP = new Set(['ideas', 'outputs', 'knowledge', 'decisions', 'logs', 'people', 'owner'])
const isCard = rel => /^ideas\/[^/]+\.md$/.test(rel)

function fail(msg) { const e = new Error(msg); e.code = 400; throw e }
function clean(rel) {
  const r = P.normalize(String(rel || '').replace(/\\/g, '/')).replace(/^\/+|\/+$/g, '')
  if (!r || r === '.' || r.startsWith('..') || r.split('/').some(s => SKIP.has(s))) fail('That path is outside the project.')
  return r
}
const exists = abs => fs.promises.stat(abs).then(s => s, () => null)

// What can't be moved, renamed or deleted, in the owner's words
function guard(rel, isDir) {
  if (rel === 'logs' || rel.startsWith('logs/')) fail('The logs stay where they are: Maybee writes to them.')
  if (isDir && TOP.has(rel)) fail(`The ${rel}/ folder stays: Maybee and the board look for it there.`)
  if (!isDir && FIXED_FILES.has(rel)) fail(`${rel} stays at the top of the project: Maybee reads it there.`)
}
function guardTarget(from, to, isDir) {
  const dir = P.dirname(to)
  if (isCard(from) && dir !== 'ideas') fail('A card stays directly in ideas/, or it leaves the board.')
  if (dir === 'ideas' && (isDir || !to.endsWith('.md'))) fail('Only cards (notes) go in ideas/.')
  if (dir.startsWith('ideas/')) fail('Nothing goes in a folder inside ideas/: the board only reads ideas/ itself.')
  if (isDir && (to === from || to.startsWith(from + '/'))) fail('A folder can\'t go inside itself.')
  if (to.split('/')[0] === 'logs') fail('Nothing goes in logs/: it is Maybee\'s.')
}

const CODE = /\.(m?js|cjs|ts|json|ya?ml|toml|txt|html|css|sh|py)$/i
async function notes(root, test = n => n.endsWith('.md')) {
  const out = []
  async function walk(abs, rel) {
    let entries
    try { entries = await fsp.readdir(abs, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (SKIP.has(e.name)) continue
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) await walk(path.join(abs, e.name), r)
      else if (test(e.name)) out.push(r)
    }
  }
  await walk(root, '')
  return out
}

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const decode = s => { try { return decodeURIComponent(s) } catch { return s } }

// The new text of one note (it was at fileOld, it will be at fileNew), or null when nothing changes
export function rewrite(text, fileOld, fileNew, map, from, to, isDir) {
  let out = text
  // 1. Markdown links and images: [text](target "title"), with the target resolved from the note's own folder
  out = out.replace(/(\]\()(<[^>\n]*>|[^)\s]+)((?:\s+"[^"\n]*")?\))/g, (all, open, target, close) => {
    const angle = target.startsWith('<')
    const t = angle ? target.slice(1, -1) : target
    if (!t || /^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith('#') || t.startsWith('/')) return all
    const hash = t.indexOf('#')
    const bare = hash < 0 ? t : t.slice(0, hash), frag = hash < 0 ? '' : t.slice(hash)
    const raw = decode(bare)
    const abs = P.normalize(P.join(P.dirname(fileOld), raw))
    if (abs.startsWith('..')) return all
    const nabs = map(abs)
    if (nabs === abs && fileNew === fileOld) return all
    let rel = P.relative(P.dirname(fileNew), nabs) || P.basename(nabs)
    if (rel === P.normalize(raw) && P.dirname(fileNew) === P.dirname(fileOld)) return all
    if (angle) return open + '<' + rel + frag + '>' + close
    if (/%20/.test(bare) || / /.test(rel)) rel = rel.replace(/ /g, '%20')
    return open + rel + frag + close
  })
  // 2. Workspace paths written out in full: "(ideas/Card.md)" in the changelog, "deliverable: outputs/x.md" in frontmatter
  //    A changelog line that records a move or a rename is history: it keeps the paths it was written with.
  const before = '(?<=^|[\\s\\["\'`,:>]|(?<!\\])\\()'
  const re = isDir ? new RegExp(before + esc(from + '/'), 'g') : new RegExp(before + esc(from) + '(?=$|[\\s)\\]"\'`,;:#|])', 'g')
  out = out.split('\n').map(line => /\((?:Maybee app)\) (?:Moved|Renamed) the (?:file|folder) /.test(line) ? line : line.replace(re, isDir ? to + '/' : to)).join('\n')
  // 3. A renamed note: its [[wiki links]] by name
  if (!isDir && from.endsWith('.md') && P.basename(from) !== P.basename(to)) {
    const oldBase = P.basename(from, '.md'), newBase = P.basename(to, '.md')
    out = out.replace(new RegExp('\\[\\[((?:[^\\]|#\\n]*/)?)' + esc(oldBase) + '(?=[\\]|#])', 'g'), (all, dir) => '[[' + dir + newBase)
  }
  return out === text ? null : out
}

// Moves a file or a folder (from) to a new path (to), and fixes every link to it. Returns the notes whose links changed.
export async function movePath(root, fromRel, toRel, { title } = {}) {
  const from = clean(fromRel), to = clean(toRel)
  if (from === to) return { from, to, updated: [] }
  const st = await exists(path.join(root, from))
  if (!st) fail('That file is no longer there.')
  const isDir = st.isDirectory()
  guard(from, isDir)
  guardTarget(from, to, isDir)
  if (await exists(path.join(root, to))) fail(`There is already a ${isDir ? 'folder' : 'file'} called "${P.basename(to)}" there.`)
  const map = p => p === from ? to : isDir && p.startsWith(from + '/') ? to + p.slice(from.length) : p

  // read every note first, from where it is now, and work out the new text
  const changes = []
  for (const f of await notes(root)) {
    const text = await fsp.readFile(path.join(root, f), 'utf8').catch(() => null)
    if (text == null) continue
    let next = rewrite(text, f, map(f), map, from, to, isDir)
    // a renamed card or note keeps its title in step with its name
    if (!isDir && f === from && f.endsWith('.md') && P.basename(from) !== P.basename(to)) {
      const src = next ?? text
      const oldBase = P.basename(from, '.md'), newBase = P.basename(to, '.md')
      const want = (title || newBase).replace(/"/g, '\\"')
      const retitled = src.replace(/^(---\n[\s\S]*?^title:\s*)(.*)$/m, (all, head, val) => {
        const v = val.trim().replace(/^["']|["']$/g, '')
        return isCard(from) || v === oldBase ? head + '"' + want + '"' : all
      })
      if (retitled !== src) next = retitled
    }
    if (next != null) changes.push({ at: map(f), text: next, was: f })
  }
  await fsp.mkdir(path.dirname(path.join(root, to)), { recursive: true })
  await fsp.rename(path.join(root, from), path.join(root, to))
  for (const c of changes) await fsp.writeFile(path.join(root, c.at), c.text)
  // code and data files are never rewritten; the owner is told which ones still name the old path
  const mentions = []
  for (const f of await notes(root, n => CODE.test(n))) {
    const text = await fsp.readFile(path.join(root, f), 'utf8').catch(() => '')
    if (text.includes(from)) mentions.push(f)
  }
  return { from, to, isDir, updated: changes.filter(c => c.was !== from).map(c => c.at), mentions, map }
}

// A new name in the same folder. A file keeps its extension when the new name has none.
export async function renamePath(root, rel, name) {
  const from = clean(rel)
  let n = String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 120).trim()
  if (!n) fail('The name is empty.')
  const st = await exists(path.join(root, from))
  if (!st) fail('That file is no longer there.')
  const ext = st.isDirectory() ? '' : P.extname(from)
  if (ext && !n.toLowerCase().endsWith(ext.toLowerCase())) n += ext
  const dir = P.dirname(from)
  return movePath(root, from, dir === '.' ? n : dir + '/' + n, { title: String(name || '').trim().replace(new RegExp(esc(ext) + '$', 'i'), '') })
}

// Into .trash/<time>/<path>, from where it can be put back
export async function trashPath(root, rel) {
  const from = clean(rel)
  const st = await exists(path.join(root, from))
  if (!st) fail('That file is no longer there.')
  guard(from, st.isDirectory())
  const trash = P.join('.trash', new Date().toISOString().replace(/[:.]/g, '-'), from)
  await fsp.mkdir(path.dirname(path.join(root, trash)), { recursive: true })
  await fsp.rename(path.join(root, from), path.join(root, trash))
  return { from, trash, isDir: st.isDirectory() }
}
export async function restorePath(root, trash, rel) {
  const to = clean(rel)
  const t = P.normalize(String(trash || ''))
  if (!t.startsWith('.trash/') || t.includes('..')) fail('Nothing to put back.')
  if (await exists(path.join(root, to))) fail(`Something called "${P.basename(to)}" is already there.`)
  await fsp.mkdir(path.dirname(path.join(root, to)), { recursive: true })
  await fsp.rename(path.join(root, t), path.join(root, to))
  return { to }
}

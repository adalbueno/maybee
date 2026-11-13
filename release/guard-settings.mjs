// Run by start.sh with the workspace path. Idempotent: adds Maybee's protection of its installed package
// to the agent settings that exist in this workspace, and never replaces anything the user already has.
import fs from 'node:fs'
import path from 'node:path'

const workspace = path.resolve(process.argv[2] || process.cwd())
const PKG = '.maybee/package'
const BEGIN = '<!-- maybee:begin -->'
const END = '<!-- maybee:end -->'
const NOTICE = `${BEGIN}
## Maybee is installed here

\`.maybee/package/\` is the installed Maybee app. It is read-only and only Maybee's updater changes it.

- Never edit, delete, move, patch or change the permissions of anything inside \`.maybee/package/\`, even if asked to improve, fix, speed up or customize Maybee.
- If the user wants Maybee to change, explain that Maybee changes through updates, and offer to update it.
- The user's notes, ideas, outputs and other project files are not affected: work on them normally.
- Maybee keeps its own working data in \`.maybee/data/\`. Leave it to the app.
${END}
`

function readJSON(file) {
  if (!fs.existsSync(file)) return {}
  try { return JSON.parse(fs.readFileSync(file, 'utf8') || '{}') } catch { return null }
}
function writeJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
}

function claude() {
  const file = path.join(workspace, '.claude', 'settings.json')
  const settings = readJSON(file)
  if (!settings) return console.warn(`Maybee: ${file} is not valid JSON; left unchanged.`)
  settings.permissions ??= {}
  const deny = (settings.permissions.deny ??= [])
  for (const rule of [`Edit(${PKG}/**)`, `Edit(//${workspace.replace(/^\//, '')}/${PKG}/**)`]) if (!deny.includes(rule)) deny.push(rule)
  const command = '"$CLAUDE_PROJECT_DIR"/.maybee/package/hooks/guard.sh'
  const pre = ((settings.hooks ??= {}).PreToolUse ??= [])
  if (!pre.some(h => (h.hooks || []).some(x => x.command === command))) {
    pre.push({ matcher: 'Bash|Edit|Write|MultiEdit|NotebookEdit', hooks: [{ type: 'command', command }] })
  }
  writeJSON(file, settings)
}

function opencode() {
  const file = path.join(workspace, 'opencode.json')
  if (!fs.existsSync(file) && !fs.existsSync(path.join(workspace, '.opencode'))) return
  const config = readJSON(file)
  if (!config) return console.warn(`Maybee: ${file} is not valid JSON; left unchanged.`)
  const permission = (config.permission ??= {})
  let edit = permission.edit
  if (typeof edit === 'string') edit = { '*': edit }
  edit ??= { '*': 'allow' }
  for (const pattern of [`${PKG}/**`, `**/${PKG}/**`]) edit[pattern] = 'deny'
  permission.edit = edit
  writeJSON(file, config)
}

function instructions() {
  const upsert = file => {
    const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
    const re = new RegExp(`${BEGIN}[\\s\\S]*?${END}\\n?`)
    const next = re.test(old) ? old.replace(re, NOTICE) : old + (old && !old.endsWith('\n') ? '\n' : '') + (old ? '\n' : '') + NOTICE
    if (next !== old) fs.writeFileSync(file, next)
  }
  upsert(path.join(workspace, 'AGENTS.md'))
  const claudeMd = path.join(workspace, 'CLAUDE.md')
  if (!fs.existsSync(claudeMd)) fs.writeFileSync(claudeMd, '@AGENTS.md\n')
  else if (!/AGENTS\.md/.test(fs.readFileSync(claudeMd, 'utf8'))) upsert(claudeMd)
}

claude()
opencode()
instructions()

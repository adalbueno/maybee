// Gives every new line in logs/CHANGELOG.md its time. An agent that writes "- 2026-11-17: what changed" straight into the file
// leaves out the time; a moment after it writes, the app completes the line ("- 2026-11-17 15:02: what changed") with the
// time it noticed it. The lines already in the file when the app starts are never touched, nor are lines of another day.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

const DATE_ONLY = /^(- )(\d{4}-\d{2}-\d{2})(:\s)/
const known = new Map() // workspace folder -> Map(line -> how many times it was already there without a time)

const logFile = root => path.join(root, 'logs', 'CHANGELOG.md')
const today = d => d.toLocaleDateString('sv-SE')
const hhmm = d => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

function counts(text) {
  const m = new Map()
  for (const line of text.split('\n')) if (DATE_ONLY.test(line)) m.set(line, (m.get(line) || 0) + 1)
  return m
}

/** Remember what is in the file now, so only lines added afterwards get a time. */
export function watchChangelog(root) {
  let text = ''
  try { text = fs.readFileSync(logFile(root), 'utf8') } catch {}
  known.set(root, counts(text))
}

/** Adds the time to the lines written since the last look. Returns how many it stamped. */
export async function stampChangelog(root, now = new Date()) {
  if (!known.has(root)) return 0
  const file = logFile(root)
  let text, before
  try { before = await fsp.stat(file); text = await fsp.readFile(file, 'utf8') } catch { return 0 }
  const seen = new Map(known.get(root))
  let stamped = 0
  const out = text.split('\n').map(line => {
    const m = DATE_ONLY.exec(line)
    if (!m) return line
    const left = seen.get(line) || 0
    if (left > 0) { seen.set(line, left - 1); return line } // it was there before
    if (m[2] !== today(now)) return line // a line for another day: not written just now
    stamped++
    return line.replace(DATE_ONLY, `$1$2 ${hhmm(now)}$3`)
  })
  if (!stamped) { known.set(root, counts(text)); return 0 }
  // the file changed while this ran (the agent is still writing): leave it, the next change looks again
  const after = await fsp.stat(file).catch(() => null)
  if (!after || after.mtimeMs !== before.mtimeMs) return 0
  const next = out.join('\n')
  await fsp.writeFile(file, next)
  known.set(root, counts(next))
  return stamped
}

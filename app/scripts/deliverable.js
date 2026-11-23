// D263: node system/app/scripts/deliverable.js "<routine note path>" "<deliverable path>"
// Sets today's deliverable on a routine note, so the card on Now links to it.
import { setFields, dayKey } from '../lib/desktop.js'
import path from 'node:path'
import { activeRoot } from '../lib/active-root.js'
// The active workspace (workspaces/<name>), not the project folder: the cards live there.
const root = activeRoot()
const [note, file] = process.argv.slice(2)
if (!note || !file) { console.error('usage: deliverable.js <ideas/Note.md> <path/to/file>'); process.exit(1) }
const inside = p => path.isAbsolute(p) ? path.relative(root, p).split(path.sep).join('/') : p
await setFields(root, inside(note), { deliverable: inside(file), deliverable_on: dayKey() })
console.log('ok')

// D263: node system/app/scripts/deliverable.js "<routine note path>" "<deliverable path>"
// Sets today's deliverable on a routine note, so the card on Now links to it.
import { setFields, dayKey } from '../lib/desktop.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const [note, file] = process.argv.slice(2)
if (!note || !file) { console.error('usage: deliverable.js <ideas/Note.md> <path/to/file>'); process.exit(1) }
await setFields(root, note, { deliverable: file, deliverable_on: dayKey() })
console.log('ok')

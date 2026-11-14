// Run: node scripts/test-board-frontmatter.mjs (from the package repository).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const { setStage, withFrontmatter } = await import(new URL('../source/app/lib/board.js', import.meta.url).href)
const { setFields } = await import(new URL('../source/app/lib/desktop.js', import.meta.url).href)

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maybee-frontmatter-'))
fs.mkdirSync(path.join(root, 'ideas'))
const write = (name, text) => fs.writeFileSync(path.join(root, 'ideas', name), text)
const read = name => fs.readFileSync(path.join(root, 'ideas', name), 'utf8')

// a note with no frontmatter can be moved: it gets one, with its title from the file name, and the body is kept
write('Plain note.md', '# Plain note\n\nJust text.\n')
assert.deepEqual(await setStage(root, 'ideas/Plain note.md', 'next'), { from: null, to: 'next' })
assert.equal(read('Plain note.md'), '---\ntitle: Plain note\nstage: next\n---\n\n# Plain note\n\nJust text.\n')

// fields too
await setFields(root, 'ideas/Plain note.md', { next_step: 'Write it down' })
assert.match(read('Plain note.md'), /^---\ntitle: Plain note\nstage: next\nnext_step: "Write it down"\n---\n/)

// a "---" at the top that never closes is a rule in the body, not frontmatter
write('Unclosed.md', '---\nstill the body\n')
await setStage(root, 'ideas/Unclosed.md', 'now')
assert.equal(read('Unclosed.md'), '---\ntitle: Unclosed\nstage: now\n---\n\n---\nstill the body\n')

// existing frontmatter is never rewritten
const text = '---\ntitle: Has fm\n---\nbody\n'
assert.equal(withFrontmatter(text, 'ideas/Has fm.md'), text)

fs.rmSync(root, { recursive: true, force: true })
console.log('board frontmatter: ok')

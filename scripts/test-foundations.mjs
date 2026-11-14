// Run: node scripts/test-foundations.mjs (from the package repository).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const { sections, fillStatus, missingFromTemplate, addMissing } = await import(new URL('../source/app/lib/foundations.js', import.meta.url).href)

// a section is filled only by something other than its prompt and an empty bullet
const list = sections('---\ntitle: x\n---\n# T\n\nintro\n\n## A\n\n_prompt_\n\n-\n\n## B\n\n_prompt_\n\n- real answer\n\n## C\n\n|  |  |\n|---|---|\n')
assert.deepEqual(list, [{ title: 'A', filled: false }, { title: 'B', filled: true }, { title: 'C', filled: false }])

// guidance written as plain text by the 0.1.29 template is still not an answer
assert.equal(sections('## Daily math\n\nFor each step, sales per day × price is the daily revenue. Subtract what you spend on ads and remarketing. Check that the attraction step pays for the ads, then that the steps above it add the profit.\n\n-\n')[0].filled, false)
assert.equal(sections('## How to find yours\n\n- Everyday objects that are peculiar to you.\n- Phrases you say all the time.\n- The way you already write, when you are not trying.\n\n-\n')[0].filled, false)

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'maybee-foundations-'))
const root = path.join(temp, 'my-project')
fs.mkdirSync(path.join(root, 'knowledge'), { recursive: true })
fs.writeFileSync(path.join(root, 'knowledge', 'README.md'), 'mine, keep me\n')

// an old workspace gets what it lacks, and what exists is untouched
const missing = await missingFromTemplate(root)
assert.ok(missing.includes('knowledge/audience/persona.md') && missing.includes('knowledge/offer/ladder.md') && missing.includes('decisions/README.md'))
assert.ok(!missing.includes('knowledge/README.md'))
const created = await addMissing(root)
assert.deepEqual(created, missing)
assert.equal(fs.readFileSync(path.join(root, 'knowledge/README.md'), 'utf8'), 'mine, keep me\n')
assert.deepEqual(await missingFromTemplate(root), [])
assert.deepEqual(await addMissing(root), [])

// a fresh copy is empty; answering one section moves the count
let status = await fillStatus(root)
assert.equal(status['knowledge/audience/persona.md'].filled, 0)
assert.ok(status['knowledge/audience/persona.md'].total >= 10)
assert.equal(status['knowledge/offer/ladder.md'].filled, 0, 'guidance in the template is not an answer')
assert.equal(status['knowledge/brand/design-elements.md'].filled, 0, 'guidance in the template is not an answer')
const file = path.join(root, 'knowledge/audience/persona.md')
fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('## Pains\n\n_What frustrates them today, in their own words._\n\n-', '## Pains\n\n_What frustrates them today, in their own words._\n\n- "I train every day and see nothing"'))
status = await fillStatus(root)
assert.equal(status['knowledge/audience/persona.md'].filled, 1)

fs.rmSync(temp, { recursive: true, force: true })
console.log('foundations: ok')

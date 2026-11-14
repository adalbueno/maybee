// Run: node scripts/test-migrations.mjs (from the package repository).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const { plan, apply, moveFiles, checkLinks, findLinks } = await import(new URL('../source/app/lib/migrations.js', import.meta.url).href)

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'maybee-migrations-'))
let n = 0
function workspace(files) {
  const root = path.join(temp, 'w' + n++)
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    fs.writeFileSync(path.join(root, rel), text)
  }
  return root
}
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8')

// links: code is ignored, web links and anchors are not ours
assert.deepEqual(findLinks('[a](x.md) `[b](y.md)`\n```\n[c](z.md)\n```\n[d](https://e.com) [f](#top)').map(l => l.target), ['x.md', 'https://e.com', '#top'])

// the real migration: both files move, links follow, content is kept, a backup exists
let root = workspace({
  'README.md': '[voice](owner/voice.md) [reg](knowledge/decisions.md#in-force) [v](<owner/voice.md>)\n',
  'owner/voice.md': 'my voice\n',
  'knowledge/decisions.md': '[back](../owner/voice.md)\n',
})
let pending = await plan(root)
assert.equal(pending.length, 1)
assert.deepEqual(pending[0].linksToFix.sort(), ['README.md', 'knowledge/decisions.md'])
let result = await apply(root)
assert.equal(result.brokenLinks.length, 0)
assert.equal(read(root, 'knowledge/brand/voice.md'), 'my voice\n')
assert.equal(read(root, 'README.md'), '[voice](knowledge/brand/voice.md) [reg](decisions/register.md#in-force) [v](<knowledge/brand/voice.md>)\n')
assert.equal(read(root, 'decisions/register.md'), '[back](../knowledge/brand/voice.md)\n')
assert.ok(fs.existsSync(path.join(root, result.done[0].backup, 'owner/voice.md')))
assert.equal((await plan(root)).length, 0, 'applied once, never again')

// a workspace already in the new layout has nothing to migrate and is not bothered
root = workspace({ 'knowledge/brand/voice.md': 'x\n', 'decisions/README.md': 'y\n' })
assert.equal((await plan(root)).length, 0)

// both files exist and differ: left alone, reported, nothing lost
root = workspace({ 'owner/voice.md': 'old\n', 'knowledge/brand/voice.md': 'edited by hand\n', 'knowledge/decisions.md': 'register\n' })
result = await apply(root)
assert.equal(result.done[0].skipped.length, 1)
assert.equal(read(root, 'owner/voice.md'), 'old\n')
assert.equal(read(root, 'knowledge/brand/voice.md'), 'edited by hand\n')
assert.equal(read(root, 'decisions/register.md'), 'register\n')

// a single move with spaces in the name, links in other folders, an anchor
root = workspace({
  'ideas/Start here.md': '[plan](../outputs/plan.md#goals) [self](Start%20here.md)\n',
  'outputs/plan.md': '[idea](../ideas/Start%20here.md)\n',
})
await moveFiles(root, [{ from: 'ideas/Start here.md', to: 'archive/old/Start here.md' }])
assert.equal(read(root, 'archive/old/Start here.md'), '[plan](../../outputs/plan.md#goals) [self](Start%20here.md)\n')
assert.equal(read(root, 'outputs/plan.md'), '[idea](../archive/old/Start%20here.md)\n')
assert.deepEqual(await checkLinks(root), [])

// a broken link is reported with file and line; moving into the workspace's own folder or onto a file is refused
fs.writeFileSync(path.join(root, 'outputs/plan.md'), 'ok\n[gone](nowhere.md)\n')
assert.deepEqual(await checkLinks(root), [{ file: 'outputs/plan.md', line: 2, target: 'nowhere.md' }])
await assert.rejects(moveFiles(root, [{ from: 'outputs/plan.md', to: '../escape.md' }]), /Outside/)
await assert.rejects(moveFiles(root, [{ from: 'outputs/plan.md', to: 'archive/old/Start here.md' }]), /Already exists/)

fs.rmSync(temp, { recursive: true, force: true })
console.log('migrations: ok')

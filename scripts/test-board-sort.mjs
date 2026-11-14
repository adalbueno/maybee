// Run: node scripts/test-board-sort.mjs (from the package repository).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const { board, placeCard, ranksOf, restoreRanks } = await import(new URL('../source/app/lib/board.js', import.meta.url).href)

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maybee-sort-'))
fs.mkdirSync(path.join(root, 'ideas'))
const card = (name, fm, body = `# ${name}\n`) => fs.writeFileSync(path.join(root, 'ideas', name + '.md'), `---\ntitle: ${name}\nstage: ${fm.stage || 'maybe'}\n${Object.entries(fm).filter(([k]) => k !== 'stage').map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\n${body}`)
// hard, members, money, want
card('A', { hard: 3, value_members: 3, value_money: 1, want: 3, rank: 10 })
card('B', { hard: 1, value_members: 1, value_money: 3, want: 1, rank: 20 })
card('C', { hard: 2, value_members: 2, value_money: 2, want: 2, rank: 30 })
card('D', { rank: 40 }) // unrated
const index = () => new Map(fs.readdirSync(path.join(root, 'ideas')).map(f => { const rel = 'ideas/' + f; return [rel, { rel, mtime: fs.statSync(path.join(root, rel)).mtimeMs }] }))
const names = async () => (await board(root, index())).columns.maybe.cards.map(c => c.title).join('')

assert.equal(await names(), 'ABCD', 'the hand-made order prevails')
const before = await ranksOf(root, index(), 'maybe')
for (const [order, want] of [['easy', 'BCAD'], ['members', 'ACBD'], ['business', 'BCAD'], ['unrated', 'DABC' ]]) {
  await placeCard(root, index(), { stage: 'maybe', order })
  const got = await names()
  if (order === 'unrated') assert.equal(got[0], 'D')
  else assert.equal(got, want, order)
}
// undo puts the earlier ranks back
await restoreRanks(root, before)
assert.equal(await names(), 'ABCD')

// why not: from the line, or from the section in the body
card('N1', { stage: 'not', why_not: '"Done in clients."' })
card('N2', { stage: 'not' }, '# N2\n\nSummary.\n\n## Why not\n\nIt belongs in **clients**, not the app.\n\n## Other\n\nText.\n')
const not = (await board(root, index())).columns.not.cards
assert.equal(not.find(c => c.title === 'N1').whyNot, 'Done in clients.')
assert.equal(not.find(c => c.title === 'N2').whyNot, 'It belongs in clients, not the app.')
console.log('board sort tests ok')

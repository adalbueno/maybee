#!/usr/bin/env node
// Workspace changes that move files, with link repair. Run by the agent; it never decides alone:
//   node .maybee/package/app/scripts/migrate.js plan                   what an update wants to move (changes nothing)
//   node .maybee/package/app/scripts/migrate.js apply [id ...]         do it after the owner's yes: moves, fixes links, keeps a backup
//   node .maybee/package/app/scripts/migrate.js move <from> <to>       move one file or note and fix every link to it and inside it
//   node .maybee/package/app/scripts/migrate.js links                  list links that point at nothing (exit 1 if any)
//   node .maybee/package/app/scripts/migrate.js fill                   add the template's knowledge/ and decisions/ files this workspace lacks (never touches one that exists)
// Add --workspace <folder> to act on a workspace other than the active one. Paths are relative to the workspace.
import fs from 'node:fs'
import path from 'node:path'
import { plan, apply, moveFiles, checkLinks } from '../lib/migrations.js'
import { addMissing } from '../lib/foundations.js'

const args = process.argv.slice(2)
const flag = args.indexOf('--workspace')
const explicit = flag > -1 ? args.splice(flag, 2)[1] : null
const [cmd, ...rest] = args

function workspace() {
  if (explicit) return path.resolve(explicit)
  const base = path.resolve(process.env.MAYBEE_PROJECT_ROOT || process.cwd())
  let name = 'default'
  try { name = JSON.parse(fs.readFileSync(path.join(base, '.maybee', 'active-workspace.json'), 'utf8')).name || name } catch {}
  const dir = path.join(base, 'workspaces', name)
  return fs.existsSync(dir) ? dir : base
}
const root = workspace()

function printBroken(broken) {
  if (!broken.length) return console.log('Links: all good.')
  console.log(`Links that point at nothing (${broken.length}):`)
  for (const b of broken) console.log(`  ${b.file}:${b.line}  ${b.target}`)
}

try {
  if (cmd === 'plan') {
    const pending = await plan(root)
    if (!pending.length) console.log('Nothing to migrate.')
    for (const m of pending) {
      console.log(`${m.id}${m.version ? ' (' + m.version + ')' : ''}: ${m.title}`)
      for (const mv of m.moves) console.log(`  ${mv.status.padEnd(12)} ${mv.from} -> ${mv.to}`)
      console.log(`  links to fix in: ${m.linksToFix.length ? m.linksToFix.join(', ') : 'none'}`)
    }
    if (pending.length) console.log('\nstatus: move = will be moved; replace-seed = destination is an untouched package copy, replaced by your file; conflict = both exist and differ, left alone; skip = nothing to move.')
  } else if (cmd === 'apply') {
    const { done, brokenLinks } = await apply(root, rest.length ? rest : null)
    if (!done.length) console.log('Nothing to apply.')
    for (const d of done) {
      console.log(`${d.id}: moved ${d.moved.length}, rewrote links in ${d.rewritten.length} file(s)${d.backup ? ', backup in ' + d.backup : ''}`)
      for (const m of d.moved) console.log(`  ${m.from} -> ${m.to}`)
      for (const s of d.skipped) console.log(`  LEFT ALONE ${s.from} -> ${s.to}: ${s.why}`)
    }
    printBroken(brokenLinks)
  } else if (cmd === 'move' && rest.length === 2) {
    const result = await moveFiles(root, [{ from: rest[0], to: rest[1] }])
    console.log(`Moved ${rest[0]} -> ${rest[1]}; rewrote links in ${result.rewritten.length} file(s); backup in ${result.backup}`)
    printBroken(await checkLinks(root))
  } else if (cmd === 'fill') {
    const created = await addMissing(root)
    if (!created.length) console.log('Nothing missing: this workspace already has the template\'s knowledge/ and decisions/ files.')
    for (const f of created) console.log(`  added ${f}`)
    if (created.length) console.log(`Added ${created.length} file(s). Nothing that existed was changed.`)
  } else if (cmd === 'links') {
    const broken = await checkLinks(root)
    printBroken(broken)
    process.exit(broken.length ? 1 : 0)
  } else {
    console.error('usage: migrate.js plan | apply [id ...] | move <from> <to> | links | fill  [--workspace <folder>]')
    process.exit(2)
  }
} catch (error) {
  console.error('Error: ' + error.message)
  process.exit(1)
}

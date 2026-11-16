// Run: node scripts/test-detach.mjs (from the package repository).
// A detached process must outlive the command that started it, even when that command's whole process group is killed.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { once } from 'node:events'

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'maybee-detach-'))
const detachURL = new URL('../source/app/lib/detach.js', import.meta.url).href
const pgidOf = pid => Number(execFileSync('ps', ['-o', 'pgid=', '-p', String(pid)], { encoding: 'utf8' }).trim())
const alive = pid => { try { process.kill(pid, 0); return true } catch { return false } }

const worker = path.join(temp, 'worker.mjs')
fs.writeFileSync(worker, `console.log('READY at http://127.0.0.1:1'); setInterval(() => {}, 1000)`)
const failing = path.join(temp, 'failing.mjs')
fs.writeFileSync(failing, `console.error('boom: could not start'); process.exit(1)`)
// the "command": starts a detached worker, prints its pid and exits, like start.sh --detach run by an assistant
const launcher = path.join(temp, 'launcher.mjs')
fs.writeFileSync(launcher, `
import { detachSelf } from ${JSON.stringify(detachURL)}
const r = await detachSelf({ script: process.argv[2], args: [], logFile: process.argv[3], ready: /READY at (\\S+)/, timeoutMs: 8000 })
console.log(JSON.stringify({ ok: r.ok, pid: r.pid, reason: r.reason, url: r.match && r.match[1], tail: r.text.trim().split('\\n').pop() }))
process.exit(r.ok ? 0 : 1)
`)

// 1) the command runs as the leader of its own process group, like a command run by an assistant, and the group is killed when it ends
const cmd = spawn('node', [launcher, worker, path.join(temp, 'ok.log')], { detached: true, stdio: ['ignore', 'pipe', 'inherit'] })
let out = ''; cmd.stdout.on('data', d => out += d)
await once(cmd, 'exit')
const res = JSON.parse(out.trim())
assert.equal(res.ok, true); assert.equal(res.url, 'http://127.0.0.1:1')
assert.notEqual(pgidOf(res.pid), cmd.pid, 'the worker is not in the process group of the command')
try { process.kill(-cmd.pid, 'SIGKILL') } catch {} // what Codex does when its command ends
await new Promise(r => setTimeout(r, 500))
assert.ok(alive(res.pid), 'the worker survives the end of the command and the kill of its group')
process.kill(res.pid, 'SIGTERM')

// 2) a worker that cannot start is reported, with its own words
const bad = spawn('node', [launcher, failing, path.join(temp, 'bad.log')], { stdio: ['ignore', 'pipe', 'inherit'] })
let badOut = ''; bad.stdout.on('data', d => badOut += d)
const [code] = await once(bad, 'exit')
const badRes = JSON.parse(badOut.trim())
assert.equal(code, 1); assert.equal(badRes.ok, false); assert.equal(badRes.reason, 'stopped'); assert.match(badRes.tail, /boom/)

fs.rmSync(temp, { recursive: true, force: true })
console.log('detach ok')

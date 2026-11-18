// Run: node scripts/test-resume.mjs (from the package repository). A fake agent stands in for Codex and Claude.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'maybee-resume-'))
const data = path.join(temp, 'data'); fs.mkdirSync(data)
process.env.MAYBEE_DATA_DIR = data
const root = new URL('..', import.meta.url).pathname
const scripts = path.join(root, 'app/scripts')
const { commandFor, runPending, preflight } = await import('../app/lib/resume.js')
const inbox = path.join(data, 'inbox.json')

// the fake agent: reads the request id from the prompt (its last argument, or the one after -p) and does what MODE says
const fake = path.join(temp, 'fake-agent.mjs')
fs.writeFileSync(fake, `
import { execFileSync } from 'node:child_process'
const a = process.argv.slice(2)
const prompt = a.includes('-p') ? a[a.indexOf('-p') + 1] : a[a.length - 1]
const id = /"id":"([^"]+)"/.exec(prompt)[1]
const mode = process.env.FAKE_MODE
if (mode === 'sleep') await new Promise(r => setTimeout(r, 30000))
if (mode === 'fail') process.exit(3)
if (mode === 'writer') {
  const isFork = a.includes('fork')
  if (!isFork && a.includes('s-42')) { console.error('thread s-42 already has an active writer'); process.exit(1) }
  if (isFork) console.log(JSON.stringify({ type: 'thread.started', thread_id: 'fork-7' }))
  if (isFork) console.log('x'.repeat(30000)) // a long run: the id at the top must survive
  execFileSync('node', [${JSON.stringify(path.join(scripts, 'reply.js'))}, id, 'via ' + (isFork ? 'fork' : 'resume') + ' ' + (a.includes('fork-7') ? 'fork-7' : 's-42')])
}
if (mode === 'reply') execFileSync('node', [${JSON.stringify(path.join(scripts, 'reply.js'))}, id, 'fake answer for ' + a.join(' ').includes('s-42')])
`)
fs.chmodSync(fake, 0o755)
process.env.MAYBEE_AGENT_BIN = fake
const shebang = fs.readFileSync(fake, 'utf8'); fs.writeFileSync(fake, '#!/usr/bin/env node\n' + shebang)

const put = (...ids) => fs.writeFileSync(inbox, JSON.stringify(ids.map(id => ({ id, at: new Date().toISOString(), action: 'Request', text: 'hi', path: 'ideas/x.md', title: 'X', status: 'pending', reply: null }))))
const get = id => JSON.parse(fs.readFileSync(inbox, 'utf8')).find(r => r.id === id)
const bridge = agent => ({ agent, sessionId: 's-42', cwd: temp })

// the commands: the exact session id, never --last, never a bypass of approvals
for (const agent of ['codex', 'claude']) {
  const { args } = commandFor(bridge(agent), 'PROMPT', { dataDir: '/d' })
  assert.ok(args.includes('s-42') && args.includes('PROMPT'))
  assert.ok(!args.includes('--last') && !args.some(x => /dangerously|skip-permissions/.test(x)), agent)
}
assert.ok(commandFor(bridge('codex'), 'P', { dataDir: '/d' }).args.some(x => x.includes('writable_roots=["/d"]')))
assert.throws(() => commandFor({ agent: 'gemini' }, 'P'), /Cannot resume/)

// inside Codex's sandbox its home folder is read-only: the listener must refuse to start
const ro = path.join(temp, 'ro-home'); fs.mkdirSync(ro); fs.chmodSync(ro, 0o555)
if (process.getuid && process.getuid() !== 0) assert.match(preflight(bridge('codex'), { CODEX_HOME: ro }), /outside the sandbox/)
assert.equal(preflight(bridge('codex'), { CODEX_HOME: temp }), null)
assert.equal(preflight(bridge('claude'), { CODEX_HOME: ro }), null, 'only Codex needs its folder')

const run = (extra = {}) => runPending({ inbox, bridge: bridge('codex'), dataDir: data, scriptsDir: scripts, timeoutMs: 5000, ...extra })

process.env.FAKE_MODE = 'reply'; put('r1', 'r2')
assert.equal(await run(), 2)
assert.equal(get('r1').status, 'done'); assert.equal(get('r1').reply, 'fake answer for true', 'the agent got the session id and answered')
assert.equal(get('r2').status, 'done')

process.env.FAKE_MODE = 'fail'; put('f1')
await run()
assert.equal(get('f1').status, 'done'); assert.match(get('f1').reply, /ended without an answer \(exit code 3\)/)

process.env.FAKE_MODE = 'sleep'; put('s1')
await run({ timeoutMs: 300 })
assert.equal(get('s1').status, 'done'); assert.match(get('s1').reply, /took longer than/)

// a session open in a window: the first request forks it, the next ones go on in the fork
process.env.FAKE_MODE = 'writer'; put('w1', 'w2')
const wb = bridge('codex'); fs.writeFileSync(path.join(data, 'bridge.json'), JSON.stringify(wb))
await run({ bridge: wb })
assert.equal(get('w1').reply, 'via fork s-42'); assert.equal(get('w2').reply, 'via resume fork-7')
assert.equal(wb.forkId, 'fork-7'); assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'bridge.json'), 'utf8')).forkId, 'fork-7')
assert.ok(commandFor({ ...wb }, 'P', {}).args.includes('fork-7') && commandFor(wb, 'P', { fork: true }).args.includes('s-42'))

process.env.MAYBEE_AGENT_BIN = path.join(temp, 'nothing-here'); put('m1')
await run()
assert.match(get('m1').reply, /Could not start/)

assert.equal(await run(), 0, 'nothing pending, nothing run')

// the listener in resume mode, end to end
process.env.MAYBEE_AGENT_BIN = fake; process.env.FAKE_MODE = 'reply'; put('e1')
const env = { ...process.env, CLAUDE_CODE_SESSION_ID: '', CODEX_THREAD_ID: 's-42', CODEX_SESSION_ID: '' }
const out = execFileSync('node', [path.join(scripts, 'listen.js'), '--resume', '--agent', 'codex', '0.1'], { env, encoding: 'utf8' })
assert.match(out, /resume mode: codex, session s-42/)
assert.equal(get('e1').status, 'done'); assert.equal(get('e1').reply, 'fake answer for true')
assert.throws(() => execFileSync('node', [path.join(scripts, 'listen.js'), '--resume', '0.1'], { env: { ...env, CODEX_THREAD_ID: '' }, stdio: 'pipe' }), /No agent session/)

// maybee.sh stop and status rely on the pid file; a second resume listener must be refused; no time limit without minutes
const { spawn } = await import('node:child_process')
const pidFile = path.join(data, 'listener.pid')
const longLived = spawn('node', [path.join(scripts, 'listen.js'), '--resume', '--agent', 'codex'], { env, stdio: 'ignore' })
for (let i = 0; i < 50 && !fs.existsSync(pidFile); i++) await new Promise(r => setTimeout(r, 100))
const rec = JSON.parse(fs.readFileSync(pidFile, 'utf8'))
assert.equal(rec.pid, longLived.pid); assert.equal(rec.mode, 'resume'); assert.equal(rec.agent, 'codex')
assert.throws(() => execFileSync('node', [path.join(scripts, 'listen.js'), '--resume', '--agent', 'codex', '0.01'], { env, stdio: 'pipe' }), /already running/)
await new Promise(r => setTimeout(r, 2500)); assert.equal(longLived.exitCode, null, 'with no minutes it keeps running')
longLived.kill('SIGTERM')
await new Promise(r => longLived.on('exit', r))
assert.ok(!fs.existsSync(pidFile), 'the pid file goes with the listener')

fs.rmSync(temp, { recursive: true, force: true })
console.log('resume ok')

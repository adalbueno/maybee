#!/usr/bin/env node
// Run by a Claude Code session in the background: waits for "Ask Claude" requests from the Maybee app,
// prints them and exits (which wakes the session). Keeps a heartbeat so the app shows "Claude is listening".
// Usage: node system/app/scripts/listen.js [maxMinutes=55]
//        node system/app/scripts/listen.js --watch [maxMinutes=29]
// Default (one shot): exits when requests arrive; that exit wakes the session, which restarts it after handling them.
// --watch: stays alive and prints one line per request, for a client that wakes the session on each line of output
// (Claude Code's Monitor tool). No gap between requests. Monitor stops anything after 30 minutes, so watch mode ends
// itself at 29 and says so: that last line wakes the session, which starts it again.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA_DIR } from '../lib/paths.js'
import { requestLine, batchInstructions } from '../lib/prompt.js'
import { registerBridge } from '../lib/bridge.js'
import { runPending, preflight } from '../lib/resume.js'
import { detachSelf } from '../lib/detach.js'
const data = DATA_DIR
const here = path.dirname(fileURLToPath(import.meta.url))
const inbox = path.join(data, 'inbox.json'), beat = path.join(data, 'listening')
const args = process.argv.slice(2)
// --agent claude|codex says which agent started this listener (see lib/bridge.js); it is not the minutes
const at = args.indexOf('--agent')
const agentFlag = at < 0 ? null : args.splice(at, 2)[1]
const watch = args.includes('--watch')
// --resume: instead of printing requests for a session to pick up, resume the registered agent's session for each one
const resume = args.includes('--resume')
// The minutes it listens. In resume mode nothing wakes the session, so there is no tool time limit to stay under: it runs until stopped.
const given = args.find(a => !a.startsWith('--'))
const until = given ? Date.now() + Number(given) * 60000 : resume ? Infinity : Date.now() + (watch ? 29 : 55) * 60000
fs.mkdirSync(data, { recursive: true })
// --detach: run in a session of our own and return once it is listening, so it outlives the command that started it (lib/detach.js)
if (process.argv.includes('--detach') && !process.env.MAYBEE_DETACHED) {
  const r = await detachSelf({ script: process.argv[1], args: process.argv.slice(2).filter(a => a !== '--detach'), logFile: path.join(data, 'listener.log'), ready: /MAYBEE LISTENER STARTED/, timeoutMs: 20000 })
  if (r.ok) { console.log(`Listener running in the background (pid ${r.pid}). Stop it with maybee.sh stop.`); process.exit(0) }
  console.error(`The listener did not start (${r.reason}):\n${r.text.trim().split('\n').slice(-6).join('\n')}`); process.exit(1)
}
// `listener.pid` says that a listener is running, for maybee.sh status and stop. Two resume listeners would answer a request twice.
const pidFile = path.join(data, 'listener.pid')
const alive = pid => { try { process.kill(pid, 0); return true } catch { return false } }
// A PID alone can lie: on Windows a dead listener's PID is soon given to another program, so "alive" says yes for a stranger.
// A running listener writes the heartbeat every 2 seconds, so a heartbeat older than 10 seconds means the old one is gone.
const beating = () => { try { return Date.now() - Number(fs.readFileSync(beat, 'utf8')) < 10000 } catch { return false } }
if (resume) {
  try {
    const old = JSON.parse(fs.readFileSync(pidFile, 'utf8'))
    if (old.pid !== process.pid && old.mode === 'resume' && alive(old.pid) && beating()) { console.error(`A resume listener is already running (pid ${old.pid}, ${old.agent}). Stop it first: maybee.sh stop`); process.exit(1) }
  } catch {}
}
// Record which agent and session this is. Asked for with --agent, a failure stops the listener; otherwise it is best effort.
let bridge = null
try { bridge = registerBridge({ agent: agentFlag }) } catch (e) { if (agentFlag || resume) { console.error(e.message); process.exit(1) } }
function writePid() { fs.writeFileSync(pidFile, JSON.stringify({ pid: process.pid, mode: resume ? 'resume' : watch ? 'watch' : 'once', agent: bridge && bridge.agent, startedAt: new Date().toISOString() })) }
process.on('exit', () => { try { if (JSON.parse(fs.readFileSync(pidFile, 'utf8')).pid === process.pid) fs.unlinkSync(pidFile) } catch {} })
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => process.exit(0))
function tick() {
  fs.writeFileSync(beat, String(Date.now()))
  let list = []
  try { list = JSON.parse(fs.readFileSync(inbox, 'utf8')) } catch {}
  const pending = list.filter(r => r.status === 'pending')
  if (pending.length && watch) {
    for (const r of pending) r.status = 'queued'
    fs.writeFileSync(inbox, JSON.stringify(list, null, 1))
    for (const r of pending) {
      // One line per request: each line is a wake-up. Everything needed to handle it is on that line.
      console.log(requestLine(r, here))
    }
  } else if (pending.length) {
    for (const r of pending) r.status = 'queued' // with Claude, in line; status.js start <id> marks the one running now
    fs.writeFileSync(inbox, JSON.stringify(list, null, 1))
    console.log('MAYBEE REQUESTS (from the owner, via the app):')
    for (const r of pending) console.log(JSON.stringify(r))
    for (const line of batchInstructions(here)) console.log(line)
    process.exit(0)
  }
  if (Date.now() > until) { console.log(watch ? 'MAYBEE LISTENER ENDED (time limit). Run the same command again now to keep listening.' : 'No requests; listener timed out. Start it again to keep listening.'); process.exit(0) }
  setTimeout(tick, 2000)
}
let busy = false
writePid()
async function resumeTick() {
  if (!busy) {
    busy = true
    try { await runPending({ inbox, bridge, dataDir: data, scriptsDir: here, timeoutMs: Number(process.env.MAYBEE_RUN_TIMEOUT_MIN || 15) * 60000, log: m => console.log(m) }) }
    catch (e) { console.error(e.message) }
    busy = false
  }
  if (Date.now() > until) { console.log('Listener ended (time limit).'); process.exit(0) }
  setTimeout(resumeTick, 2000)
}
if (resume) {
  const bad = preflight(bridge)
  if (bad) { console.error(bad); process.exit(1) }
  setInterval(() => fs.writeFileSync(beat, String(Date.now())), 2000) // the heartbeat goes on while a long run is waited for
  fs.writeFileSync(beat, String(Date.now()))
  console.log(`MAYBEE LISTENER STARTED (resume mode: ${bridge.agent}, session ${bridge.sessionId})`); resumeTick() } else {
if (watch) console.log('MAYBEE LISTENER STARTED (watching for requests until the time limit)')
tick()
}

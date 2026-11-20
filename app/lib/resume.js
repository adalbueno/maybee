// Resume mode: for each pending request, resume the registered agent's own session (see bridge.js) with the request
// as the prompt, wait for the run to end, and make sure the request is closed even when the agent never answered.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { requestLine } from './prompt.js'
import { updateBridge } from './bridge.js'

// The command that resumes a session with a prompt. Always the exact session id, never "the latest one".
// MAYBEE_AGENT_BIN replaces the program name (tests use a fake agent).
// With `fork`, Codex starts a new session from the registered one instead of resuming it (needed when the session is open in a
// window: a resume then fails with "active writer"). After a fork the app goes on in the fork (bridge.forkId).
// `plainExec`: the Codex from the Microsoft Store runs commands through a launcher ("unified exec") that only works inside the
// installed app; started by the listener it rejects every command. Turning that feature off makes Codex start commands itself.
export function commandFor(bridge, prompt, { dataDir, fork = false, plainExec = false } = {}) {
  const bin = process.env.MAYBEE_AGENT_BIN
  if (bridge.agent === 'codex') {
    // A resumed run is read-only by default (checked with Codex 0.169.0): let it edit the project folder, and write
    // the answer into Maybee's own data folder, which sits outside it. Approvals and the sandbox are never skipped.
    const roots = JSON.stringify(dataDir ? [dataDir] : [])
    const extra = plainExec ? ['-c', 'features.unified_exec=false'] : []
    return { bin: bin || 'codex', args: ['exec', fork ? 'fork' : 'resume', '--json', '--skip-git-repo-check', '-c', 'sandbox_mode="workspace-write"', '-c', 'sandbox_workspace_write.writable_roots=' + roots, ...extra, fork ? bridge.sessionId : (bridge.forkId || bridge.sessionId), prompt] }
  }
  if (bridge.agent === 'claude') {
    // Headless, so nothing can ask for a permission: allow reading, editing and the node scripts of the bridge, no more.
    return { bin: bin || 'claude', args: ['-p', prompt, '--resume', bridge.sessionId, '--allowedTools', 'Read', 'Edit', 'Write', 'Bash(node:*)'] }
  }
  throw new Error(`Cannot resume an agent called "${bridge.agent}".`)
}

// Codex writes its own state (a database, the session files) into its home folder on every run. Inside Codex's sandbox that
// folder is read-only, so a listener started from there would say "Listening" and fail on the first request.
const SANDBOX_HINT = 'Start the listener outside the sandbox: ask Codex to run it with approval to run outside the sandbox, or run it in your own terminal with CODEX_THREAD_ID=<the session id> in front of the command.'
export function preflight(bridge, env = process.env) {
  if (bridge.agent !== 'codex') return null
  const home = env.CODEX_HOME || path.join(os.homedir(), '.codex')
  try { fs.accessSync(home, fs.constants.W_OK); return null } catch {
    return `Codex cannot write its own folder (${home}). This happens when the listener runs inside Codex's sandbox. ${SANDBOX_HINT}`
  }
}

const STORE_HINT = 'Codex could not run any command: the Codex from the Microsoft Store only runs commands inside its own app. Install the standalone Codex (npm install -g @openai/codex) and start the listener again.'
const isDone = (file, id) => { const r = read(file).find(x => x.id === id); return !!r && r.status === 'done' }
const read = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return [] } }
// Always read fresh and write at once: the agent's own scripts write the same file while it runs.
function update(file, id, fields) {
  const list = read(file)
  const r = list.find(x => x.id === id)
  if (!r) return null
  Object.assign(r, fields)
  fs.writeFileSync(file, JSON.stringify(list, null, 1))
  return r
}

function runProcess({ bin, args, cwd, timeoutMs }) {
  return new Promise(resolve => {
    let stderr = '', head = '', stdout = '', timedOut = false, settled = false
    const done = result => { if (!settled) { settled = true; clearTimeout(timer); resolve({ stderr: stderr.trim().slice(-200), all: stderr + head + stdout, ...result }) } }
    const child = spawn(bin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    // the first lines hold the session id (thread.started), so they are kept apart from the tail
    child.stdout.on('data', d => { if (head.length < 4000) head += d; else stdout = (stdout + d).slice(-20000) })
    child.stderr.on('data', d => { stderr = (stderr + d).slice(-2000) })
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM') }, timeoutMs)
    child.on('error', e => done({ code: null, error: e.message }))
    child.on('close', code => done({ code, timedOut }))
  })
}

// Runs every pending request, one at a time. Returns how many it ran.
export async function runPending({ inbox, bridge, dataDir, scriptsDir, timeoutMs = 15 * 60000, log = () => {} }) {
  const pending = read(inbox).filter(r => r.status === 'pending')
  for (const r of pending) {
    update(inbox, r.id, { status: 'working' })
    log(`Request ${r.id} (${r.action}) goes to ${bridge.agent}, session ${bridge.sessionId}`)
    const { bin, args } = commandFor(bridge, requestLine(r, scriptsDir), { dataDir, plainExec: !!bridge.plainExec })
    const cwd = bridge.cwd || process.cwd()
    let out = await runProcess({ bin, args, cwd, timeoutMs })
    if (bridge.agent === 'codex' && out.code !== 0 && !bridge.forkId && /active writer/i.test(out.all)) {
      // the session is open in a window: go on in a fork of it, and stay in that fork for the next requests
      log(`Session ${bridge.sessionId} is open in a window, so this request goes to a fork of it`)
      const f = commandFor(bridge, requestLine(r, scriptsDir), { dataDir, fork: true, plainExec: !!bridge.plainExec })
      out = await runProcess({ bin: f.bin, args: f.args, cwd, timeoutMs })
      const id = /"type":"thread\.started","thread_id":"([^"]+)"/.exec(out.all)
      if (id) { bridge.forkId = id[1]; updateBridge({ forkId: id[1] }); log(`The app now goes on in the fork ${id[1]}`) }
    }
    // Store Codex on Windows: every command was rejected, so the run could not even answer. Try once more with plain exec,
    // in the session the app goes on in now (the fork when there is one), and remember it for the next requests.
    const STORE = /requires an installed app/i
    if (bridge.agent === 'codex' && !bridge.plainExec && STORE.test(out.all) && !isDone(inbox, r.id)) {
      log('Codex could not run commands (Microsoft Store launcher), so this request runs again with unified exec turned off')
      bridge.plainExec = true; updateBridge({ plainExec: true })
      const p = commandFor(bridge, requestLine(r, scriptsDir), { dataDir, plainExec: true })
      out = await runProcess({ bin: p.bin, args: p.args, cwd, timeoutMs })
    }
    const now = read(inbox).find(x => x.id === r.id)
    if (now && now.status !== 'done') {
      const why = out.error ? `Could not start ${bin}: ${out.error}` : out.timedOut ? `The ${bridge.agent} run took longer than ${Math.round(timeoutMs / 60000)} min and was stopped.` : `The ${bridge.agent} run ended without an answer (exit code ${out.code}).${out.stderr ? ' ' + out.stderr : ''}${/read-only file system/i.test(out.all) ? ' ' + SANDBOX_HINT : ''}${STORE.test(out.all) ? ' ' + STORE_HINT : ''}`
      update(inbox, r.id, { status: 'done', reply: why, doneAt: new Date().toISOString() })
      log(why)
    }
  }
  return pending.length
}

// Resume mode: for each pending request, resume the registered agent's own session (see bridge.js) with the request
// as the prompt, wait for the run to end, and make sure the request is closed even when the agent never answered.
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { requestLine } from './prompt.js'

// The command that resumes a session with a prompt. Always the exact session id, never "the latest one".
// MAYBEE_AGENT_BIN replaces the program name (tests use a fake agent).
export function commandFor(bridge, prompt, { dataDir } = {}) {
  const bin = process.env.MAYBEE_AGENT_BIN
  if (bridge.agent === 'codex') {
    // A resumed run is read-only by default (checked with Codex 0.169.0): let it edit the project folder, and write
    // the answer into Maybee's own data folder, which sits outside it. Approvals and the sandbox are never skipped.
    const roots = JSON.stringify(dataDir ? [dataDir] : [])
    return { bin: bin || 'codex', args: ['exec', 'resume', '--json', '--skip-git-repo-check', '-c', 'sandbox_mode="workspace-write"', '-c', 'sandbox_workspace_write.writable_roots=' + roots, bridge.sessionId, prompt] }
  }
  if (bridge.agent === 'claude') {
    // Headless, so nothing can ask for a permission: allow reading, editing and the node scripts of the bridge, no more.
    return { bin: bin || 'claude', args: ['-p', prompt, '--resume', bridge.sessionId, '--allowedTools', 'Read', 'Edit', 'Write', 'Bash(node:*)'] }
  }
  throw new Error(`Cannot resume an agent called "${bridge.agent}".`)
}

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
    let stderr = '', timedOut = false, settled = false
    const done = result => { if (!settled) { settled = true; clearTimeout(timer); resolve({ stderr: stderr.trim().slice(-200), ...result }) } }
    const child = spawn(bin, args, { cwd, stdio: ['ignore', 'ignore', 'pipe'] })
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
    const { bin, args } = commandFor(bridge, requestLine(r, scriptsDir), { dataDir })
    const out = await runProcess({ bin, args, cwd: bridge.cwd || process.cwd(), timeoutMs })
    const now = read(inbox).find(x => x.id === r.id)
    if (now && now.status !== 'done') {
      const why = out.error ? `Could not start ${bin}: ${out.error}` : out.timedOut ? `The ${bridge.agent} run took longer than ${Math.round(timeoutMs / 60000)} min and was stopped.` : `The ${bridge.agent} run ended without an answer (exit code ${out.code}).${out.stderr ? ' ' + out.stderr : ''}`
      update(inbox, r.id, { status: 'done', reply: why, doneAt: new Date().toISOString() })
      log(why)
    }
  }
  return pending.length
}

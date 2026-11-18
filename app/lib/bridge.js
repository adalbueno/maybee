// Which agent answers the app's requests, and which of its sessions. The listener writes `bridge.json` when it starts
// (from inside the user's own session), so a request can later resume that exact session instead of a new one.
import fs from 'node:fs'
import { dataPath } from './paths.js'

export const AGENTS = ['claude', 'codex']

// The session id each agent puts in the environment of the commands it runs.
const ID_VARS = { claude: ['CLAUDE_CODE_SESSION_ID'], codex: ['CODEX_THREAD_ID', 'CODEX_SESSION_ID'] }
export const sessionIdFor = (agent, env = process.env) => (ID_VARS[agent] || []).map(k => env[k]).find(Boolean) || null

// The agent is the one asked for with --agent. Without it, only when exactly one agent's variables are set: a Codex
// started from inside Claude carries both, and guessing between them would resume the wrong session.
export function detectAgent(flag, env = process.env) {
  if (flag) {
    if (!AGENTS.includes(flag)) throw new Error(`Unknown agent "${flag}". Use one of: ${AGENTS.join(', ')}.`)
    return flag
  }
  const found = AGENTS.filter(a => sessionIdFor(a, env))
  if (found.length === 1) return found[0]
  throw new Error(found.length ? `Both ${found.join(' and ')} variables are set, so the agent is unclear. Pass --agent ${found.join('|')}.` : `No agent session found in the environment. Start the listener from inside the agent's session, or pass --agent ${AGENTS.join('|')}.`)
}

export const readBridge = () => { try { return JSON.parse(fs.readFileSync(dataPath('bridge.json'), 'utf8')) } catch { return null } }

// Adds fields to the recorded bridge (the fork the app talks to when the session is open in a window).
export function updateBridge(fields) {
  const info = { ...readBridge(), ...fields }
  fs.writeFileSync(dataPath('bridge.json'), JSON.stringify(info, null, 1))
  return info
}

// Records the agent and session. Throws when the agent has no session id to record.
export function registerBridge({ agent: flag, env = process.env, cwd = process.cwd() } = {}) {
  const agent = detectAgent(flag, env)
  const sessionId = sessionIdFor(agent, env)
  if (!sessionId) throw new Error(`No ${agent} session id in the environment (${ID_VARS[agent].join(' or ')}). The listener has to start from inside that session.`)
  const info = { agent, sessionId, cwd, startedAt: new Date().toISOString() }
  fs.mkdirSync(dataPath(), { recursive: true })
  fs.writeFileSync(dataPath('bridge.json'), JSON.stringify(info, null, 1))
  return info
}

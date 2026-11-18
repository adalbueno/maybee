// Run: node scripts/test-bridge.mjs (from the package repository).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'maybee-bridge-'))
process.env.MAYBEE_DATA_DIR = temp
const { detectAgent, sessionIdFor, registerBridge, readBridge } = await import('../app/lib/bridge.js')

assert.equal(sessionIdFor('claude', { CLAUDE_CODE_SESSION_ID: 'c1' }), 'c1')
assert.equal(sessionIdFor('codex', { CODEX_SESSION_ID: 'x2' }), 'x2')
assert.equal(sessionIdFor('codex', { CODEX_THREAD_ID: 'x1', CODEX_SESSION_ID: 'x2' }), 'x1')
assert.equal(sessionIdFor('codex', {}), null)

assert.equal(detectAgent(null, { CLAUDE_CODE_SESSION_ID: 'c1' }), 'claude')
assert.equal(detectAgent(null, { CODEX_THREAD_ID: 'x1' }), 'codex')
assert.equal(detectAgent('codex', { CLAUDE_CODE_SESSION_ID: 'c1', CODEX_THREAD_ID: 'x1' }), 'codex', 'the flag decides when both are set')
assert.throws(() => detectAgent(null, { CLAUDE_CODE_SESSION_ID: 'c1', CODEX_THREAD_ID: 'x1' }), /unclear/)
assert.throws(() => detectAgent(null, {}), /No agent session/)
assert.throws(() => detectAgent('gemini', {}), /Unknown agent/)

assert.equal(readBridge(), null)
assert.throws(() => registerBridge({ agent: 'codex', env: {} }), /No codex session id/)
const info = registerBridge({ env: { CODEX_THREAD_ID: 'abc-123' }, cwd: '/work' })
assert.deepEqual({ agent: info.agent, sessionId: info.sessionId, cwd: info.cwd }, { agent: 'codex', sessionId: 'abc-123', cwd: '/work' })
assert.equal(readBridge().sessionId, 'abc-123')

// the listener: --agent is not read as the minutes, records the bridge, and fails clearly without a session id
const listen = new URL('../app/scripts/listen.js', import.meta.url).pathname
const env = { ...process.env, MAYBEE_DATA_DIR: temp, CLAUDE_CODE_SESSION_ID: '', CODEX_THREAD_ID: 'run-9', CODEX_SESSION_ID: '' }
execFileSync('node', [listen, '--agent', 'codex', '0.001'], { env, stdio: 'pipe' })
assert.equal(readBridge().sessionId, 'run-9')
assert.throws(() => execFileSync('node', [listen, '--agent', 'claude', '0.001'], { env, stdio: 'pipe' }), /No claude session id/)

fs.rmSync(temp, { recursive: true, force: true })
console.log('bridge ok')

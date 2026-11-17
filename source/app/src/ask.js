// Shared "Ask AI" state: the inbox, whether a session is listening, which agent it is, and sending a request.
import { reactive } from 'vue'

export const claude = reactive({ listening: false, heardAt: null, bridge: null, items: [], toast: '', failed: false })

// what the listener writes when a request could not be answered (see scripts/listen.js)
const FAILURE = /^(Could not start |The \w+ run (took longer than|ended without an answer))/
// the bee's state: grey nobody listens, green listening, yellow working, red when the latest answered request failed
export const beeState = (live = true) => !live ? 'off' : !claude.listening ? 'idle' : claude.items.some(i => i.status === 'working') ? 'busy' : claude.failed ? 'error' : 'ok'

// "Codex · 01a1e4…": the agent that answers and the start of its session id (null when no listener ever recorded one)
const NAMES = { claude: 'Claude', codex: 'Codex' }
export const agentLabel = b => b && b.agent ? (NAMES[b.agent] || b.agent) + ' · ' + String(b.forkId || b.sessionId || '').slice(0, 6) + '…' + (b.forkId ? ' (fork)' : '') : ''
export const agentName = b => b && b.agent ? (NAMES[b.agent] || b.agent) : 'An assistant'

export async function refreshInbox() {
  try {
    const r = await fetch('/api/inbox').then(x => x.json())
    claude.listening = r.listening
    claude.heardAt = r.heardAt || null
    claude.bridge = r.bridge || null
    claude.items = r.items
    const last = [...r.items].reverse().find(i => i.status === 'done')
    claude.failed = !!(last && FAILURE.test(last.reply || ''))
  } catch {}
}
setInterval(refreshInbox, 4000)
refreshInbox()

function say(m) { claude.toast = m; setTimeout(() => { if (claude.toast === m) claude.toast = '' }, 4200) }

// quiet: the caller shows the outcome itself (the chat bubble), so no toast over it
export async function ask({ action, text = '', path = null, title = null, quiet = false }) {
  const res = await fetch('/api/ask', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, text, path, title }),
  }).then(r => r.json())
  if (res.listening) { if (!quiet) say('Sent to ' + (claude.bridge ? agentName(claude.bridge) : 'the assistant') + '. The answer shows up here and in the chat.') }
  else {
    try { await navigator.clipboard.writeText(res.prompt); if (!quiet) say('No session is listening. The request is saved and the prompt is copied: paste it in your assistant.') }
    catch { if (!quiet) say('No session is listening. The request is saved; ask your assistant to "listen to Maybee".') }
  }
  refreshInbox()
  return res
}

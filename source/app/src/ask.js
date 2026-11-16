// Shared "Ask AI" state: the inbox, whether a session is listening, which agent it is, and sending a request.
import { reactive } from 'vue'

export const claude = reactive({ listening: false, heardAt: null, bridge: null, items: [], toast: '' })

// "Codex · 01a1e4…": the agent that answers and the start of its session id (null when no listener ever recorded one)
const NAMES = { claude: 'Claude', codex: 'Codex' }
export const agentLabel = b => b && b.agent ? (NAMES[b.agent] || b.agent) + ' · ' + String(b.sessionId || '').slice(0, 6) + '…' : ''
export const agentName = b => b && b.agent ? (NAMES[b.agent] || b.agent) : 'An assistant'

export async function refreshInbox() {
  try {
    const r = await fetch('/api/inbox').then(x => x.json())
    claude.listening = r.listening
    claude.heardAt = r.heardAt || null
    claude.bridge = r.bridge || null
    claude.items = r.items
  } catch {}
}
setInterval(refreshInbox, 4000)
refreshInbox()

function say(m) { claude.toast = m; setTimeout(() => { if (claude.toast === m) claude.toast = '' }, 4200) }

export async function ask({ action, text = '', path = null, title = null }) {
  const res = await fetch('/api/ask', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, text, path, title }),
  }).then(r => r.json())
  if (res.listening) say('Sent to ' + (claude.bridge ? agentName(claude.bridge) : 'the assistant') + '. The answer shows up here and in the chat.')
  else {
    try { await navigator.clipboard.writeText(res.prompt); say('No session is listening. The request is saved and the prompt is copied: paste it in your assistant.') }
    catch { say('No session is listening. The request is saved; ask your assistant to "listen to Maybee".') }
  }
  refreshInbox()
  return res
}

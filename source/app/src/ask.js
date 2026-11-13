// Shared "Ask Claude" state: the inbox, whether a session is listening, and sending a request.
import { reactive } from 'vue'

export const claude = reactive({ listening: false, heardAt: null, items: [], toast: '' })

export async function refreshInbox() {
  try {
    const r = await fetch('/api/inbox').then(x => x.json())
    claude.listening = r.listening
    claude.heardAt = r.heardAt || null
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
  if (res.listening) say('Sent to Claude. The answer shows up here and in the chat.')
  else {
    try { await navigator.clipboard.writeText(res.prompt); say('No Claude session is listening. The request is saved and the prompt is copied: paste it in the chat.') }
    catch { say('No Claude session is listening. The request is saved; ask Claude to "listen to Maybee".') }
  }
  refreshInbox()
  return res
}

<script setup>
import { ref, computed, watch } from 'vue'
import { claude, agentLabel, beeState } from '../ask.js'
import Bee from './Bee.vue'
const props = defineProps({ live: Boolean })
const emit = defineEmits(['open'])
// one bee: green = a session is listening, yellow = it is working on a request, red = the last request failed, grey = nobody listens (faded when the app is unreachable)
const state = computed(() => beeState(props.live))
const title = computed(() => ({ off: 'Offline: the app is not reachable', ok: 'Listening: ' + (agentLabel(claude.bridge) || 'a session') + ' answers your requests', busy: 'Working: ' + (agentLabel(claude.bridge) || 'a session') + ' is on a request', error: 'The last request failed: open the list to read why', idle: 'No session is listening' }[state.value]))
const open = ref(false)
const active = computed(() => claude.items.filter(i => i.status !== 'done').length)
const heard = computed(() => {
  if (!claude.heardAt) return 'No session has listened yet.'
  const m = Math.round((Date.now() - claude.heardAt) / 60000)
  return 'The last one stopped ' + (m < 1 ? 'a moment' : m < 60 ? m + ' min' : Math.round(m / 60) + ' h') + ' ago.'
})
// When a request finishes and left something to look at (its card reached Done, or today's deliverable is set on it), the bee
// celebrates; the finished request is at the top of the list behind it. No label beside the bee: the celebration is the signal. Any other finish keeps the bee's plain pulse, so the burst stays rare.
const party = ref(0)
const lastStatus = new Map()
watch(() => claude.items.map(i => i.id + ':' + i.status).join(), async () => {
  const finished = claude.items.filter(i => i.status === 'done' && lastStatus.has(i.id) && lastStatus.get(i.id) !== 'done' && i.path && !i.path.startsWith('@'))
  claude.items.forEach(i => lastStatus.set(i.id, i.status))
  if (!finished.length) return
  const b = await fetch('/api/board').then(r => r.json()).catch(() => null)
  if (!b) return
  const isReady = p => (b.columns.done?.cards || []).some(c => c.path === p) || (b.routinesToday || []).some(r => r.path === p && r.deliverable)
  const hit = finished.find(i => isReady(i.path))
  if (!hit) return
  party.value++
})
// Requests grouped by card, newest first. A group is running while any of its requests is, so a busy card never hides behind a done one.
const groups = computed(() => {
  const map = new Map()
  for (const r of claude.items) { // newest first already
    const key = r.path || r.id
    let g = map.get(key)
    if (!g) { g = { key, path: r.path, title: r.path === '@about' ? 'About' : r.path === '@brain' ? 'Brain' : r.path === '@inbox' ? 'Inbox' : r.title || r.path || 'Request', at: r.at, last: r, count: 0, status: 'done' }; map.set(key, g) }
    g.count++
    if (r.status !== 'done' && g.status === 'done') g.status = r.status
  }
  return [...map.values()]
})
function openGroup(g) {
  if (!g.path) return
  open.value = false
  emit('open', g.path.startsWith('@') ? { path: g.path } : { path: g.path, chat: Date.now() })
}
const statusText = r => r.status === 'done' ? 'Done' : r.status === 'working' ? 'Running now' : r.status === 'queued' ? 'In line' : 'Waiting'
// what was asked, without the word Request: the text when there is one, otherwise the button that was pressed
const what = r => r.action === 'Request' ? r.text : r.action === 'Run routine' && /started by/i.test(r.text || '') ? 'Run routine' : r.action + (r.text ? ': ' + r.text : '')
const ago = iso => { const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? 'now' : m < 60 ? m + ' min' : Math.round(m / 60) + ' h' }
</script>

<template>
  <div class="tray" @click.stop>
    <button class="tray-btn" :class="state" @click="open = !open" :title="title" aria-label="Assistant status">
      <Bee :state="state" :height="12" :party="party" /><small v-if="active">{{ active }}</small>
    </button>
    <div v-if="open" class="tray-pop">
      <!-- one line when all is well; the long explanation only when something needs doing -->
      <p class="tray-state" :class="{ on: claude.listening && state !== 'off' }">
        <i></i><b>{{ state === 'off' ? 'Offline' : claude.listening ? 'Listening' : 'Not listening' }}</b>
        <span v-if="state !== 'off' && agentLabel(claude.bridge)" class="who">{{ claude.listening ? '' : 'last: ' }}{{ agentLabel(claude.bridge) }}</span>
      </p>
      <p v-if="state === 'off'" class="tray-help">Maybee lost the connection to the app, so nothing updates by itself. Reload the page, and if it stays offline, start Maybee again.</p>
      <p v-else-if="!claude.listening" class="tray-help">{{ heard }} Listening lasts about 30 minutes, then the assistant has to start it again. Open your assistant in this folder and write "listen to Maybee". Until then, requests are saved and wait.</p>
      <div v-if="!claude.items.length" class="tray-empty">No requests yet.</div>
      <!-- one row per card: the requests about the same card sit together. The row is a link: it opens the card with its chat showing,
           where the answers are. The list itself never shows the conversation. -->
      <button v-for="g in groups" :key="g.key" class="req" :class="g.status" @click="openGroup(g)" :title="g.path ? 'Open the card and its chat' : ''">
        <span class="st" :title="statusText(g)">{{ g.status === 'done' ? '✓' : '' }}</span>
        <span class="req-main">
          <span class="req-top"><b>{{ g.title }}</b><span class="when">{{ g.status === 'done' ? ago(g.at) : statusText(g) }}</span></span>
          <span class="ask">{{ what(g.last) }}<template v-if="g.count > 1"> · {{ g.count }} requests</template></span>
        </span>
      </button>
    </div>
  </div>
</template>

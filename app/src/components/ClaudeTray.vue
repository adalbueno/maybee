<script setup>
import { ref, computed } from 'vue'
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
const ago = iso => { const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? 'now' : m < 60 ? m + ' min' : Math.round(m / 60) + ' h' }
</script>

<template>
  <div class="tray" @click.stop>
    <button class="tray-btn" :class="state" @click="open = !open" :title="title" aria-label="Assistant status">
      <Bee :state="state" :height="12" /><small v-if="active">{{ active }}</small>
    </button>
    <div v-if="open" class="tray-pop">
      <p class="tray-state">
        <b>{{ state === 'off' ? 'Offline.' : claude.listening ? 'Listening.' : 'Not listening.' }}</b>
        <span v-if="state !== 'off' && agentLabel(claude.bridge)" class="who">{{ claude.listening ? '' : 'Last: ' }}{{ agentLabel(claude.bridge) }}</span>
        <template v-if="state === 'off'">Maybee lost the connection to the app, so nothing updates by itself. Reload the page, and if it stays offline, start Maybee again.</template>
        <template v-else>{{ claude.listening ? 'Buttons send straight to the open session.' : heard + ' Listening lasts about 30 minutes, then the assistant has to start it again. Open your assistant in this folder and write "listen to Maybee". Until then, requests are saved and wait.' }}</template>
      </p>
      <div v-if="!claude.items.length" class="tray-empty">No requests yet.</div>
      <div v-for="r in claude.items" :key="r.id" class="req" :class="r.status">
        <div class="req-top"><span class="st">{{ r.status === 'done' ? '✓ done' : r.status === 'working' ? 'running now…' : r.status === 'queued' ? 'in line' : 'waiting' }}</span><span>{{ ago(r.at) }}</span></div>
        <b>{{ r.action }}<template v-if="r.text">: {{ r.text }}</template></b>
        <a v-if="r.path" @click="emit('open', { path: r.path })">{{ r.title || r.path }}</a>
        <p v-if="r.reply" class="reply">{{ r.reply }}</p>
      </div>
    </div>
  </div>
</template>

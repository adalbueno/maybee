<script setup>
import { ref, computed } from 'vue'
import { claude } from '../ask.js'
const emit = defineEmits(['open'])
const open = ref(false)
const active = computed(() => claude.items.filter(i => i.status !== 'done').length)
const ago = iso => { const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? 'now' : m < 60 ? m + ' min' : Math.round(m / 60) + ' h' }
</script>

<template>
  <div class="tray" @click.stop>
    <button class="tray-btn" :class="{ on: claude.listening }" @click="open = !open" :title="claude.listening ? 'A Claude session is listening' : 'No Claude session is listening'">
      <i></i>Claude<small v-if="active">{{ active }}</small>
    </button>
    <div v-if="open" class="tray-pop">
      <p class="tray-state">
        <b>{{ claude.listening ? 'Listening.' : 'Not listening.' }}</b>
        {{ claude.listening ? 'Buttons send straight to the open session.' : 'The Maybee skill should start the listener for this session. Until then, requests are saved and the prompt is copied.' }}
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

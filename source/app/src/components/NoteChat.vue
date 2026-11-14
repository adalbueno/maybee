<script setup>
// A chat dock floating at the bottom of a note: always one line away, and it opens to show what you asked the
// AI about this note and what it answered. It uses the same requests as the "Ask AI" button in the board
// (ask.js), so both end up in the same place.
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { ask, claude } from '../ask.js'
import { quickFor } from '../stages.js'
const props = defineProps({ path: String, title: String, stage: { type: String, default: '' } })
const emit = defineEmits(['settled'])

const items = ref([])
const text = ref('')
const sending = ref(false)
const open = ref(false)
const seen = ref(0) // replies already seen: the dot shows when there are more than this
const box = ref(null)
const field = ref(null)
let timer = null
let doneIds = null // ids already done at the last look; a new one means the AI finished something

const replies = computed(() => items.value.filter(i => i.reply).length)
const pending = computed(() => items.value.filter(i => i.status !== 'done').length)
const unread = computed(() => !open.value && replies.value > seen.value)

async function load() {
  try {
    const r = await fetch('/api/inbox?path=' + encodeURIComponent(props.path)).then(x => x.json())
    const list = (r.items || []).slice().reverse() // oldest first, like a chat
    const done = new Set(list.filter(i => i.status === 'done').map(i => i.id))
    if (doneIds && [...done].some(id => !doneIds.has(id))) emit('settled')
    const first = doneIds === null
    doneIds = done
    const grew = list.length !== items.value.length || list.some((i, n) => i.status !== items.value[n]?.status || i.reply !== items.value[n]?.reply)
    items.value = list
    if (first) seen.value = replies.value // what was there before opening the note is not news
    if (open.value) seen.value = replies.value
    if (grew && open.value) scrollEnd()
  } catch {}
}
const scrollEnd = () => nextTick(() => box.value?.scrollTo({ top: box.value.scrollHeight }))
onMounted(() => { load(); timer = setInterval(load, 3000) })
onBeforeUnmount(() => clearInterval(timer))
watch(() => props.path, () => { items.value = []; doneIds = null; open.value = false; load() })

function toggle(force) {
  open.value = typeof force === 'boolean' ? force : !open.value
  if (open.value) { seen.value = replies.value; scrollEnd() }
}
const label = i => i.action === 'Request' ? i.text : i.action + (i.text ? ': ' + i.text : '')
const state = i => i.status === 'done' ? '' : i.status === 'working' ? 'Working on it…' : i.status === 'queued' ? 'In line…' : (claude.listening ? 'Sent…' : 'Saved. It waits until a Claude session listens again.')
const clock = iso => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

function grow() {
  const el = field.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}
async function send(action = 'Request', extra = text.value) {
  if (sending.value || (action === 'Request' && !extra.trim())) return
  sending.value = true
  toggle(true)
  try { await ask({ action, text: action === 'Request' ? extra.trim() : '', path: props.path, title: props.title }) } finally { sending.value = false }
  if (action === 'Request') { text.value = ''; nextTick(grow) }
  await load()
  scrollEnd()
  field.value?.focus()
}
function onKey(e) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send() }
}
// Esc hides the conversation first; only when it is already hidden does it reach the viewer and close the note.
function onDockKey(e) {
  if (e.key === 'Escape' && open.value) { e.stopPropagation(); toggle(false) }
}
</script>

<template>
  <div class="nchat-dock" @click.stop @keydown="onDockKey">
    <section class="nchat" :class="{ open }">
      <div v-if="open" class="panel">
        <header>
          <b>Ask AI about this note</b>
          <span class="live" :class="{ on: claude.listening }"><i></i>{{ claude.listening ? 'A session is listening' : 'No session is listening: open Claude and write "listen to Maybee"' }}</span>
          <button class="close" title="Hide (Esc)" @click="toggle(false)">⌄</button>
        </header>
        <div ref="box" class="msgs">
          <p v-if="!items.length" class="empty">Nothing asked about this note yet.</p>
          <template v-for="i in items" :key="i.id">
            <div class="you"><p>{{ label(i) }}</p><small>{{ clock(i.at) }}</small></div>
            <div v-if="i.reply" class="ai"><p>{{ i.reply }}</p><small>AI</small></div>
            <div v-else-if="state(i)" class="ai pending"><p>{{ state(i) }}</p></div>
          </template>
        </div>
        <div class="quick">
          <button v-for="q in quickFor(stage)" :key="q" :disabled="sending" @click="send(q)">{{ q }}</button>
        </div>
      </div>
      <div class="compose">
        <button class="mark" :class="{ on: claude.listening }" :title="open ? 'Hide the conversation' : 'Show the conversation'" @click="toggle()">
          <i>✳</i><small v-if="pending">{{ pending }}</small><em v-else-if="unread"></em>
        </button>
        <textarea ref="field" v-model="text" rows="1" placeholder="Ask AI about this note, or tell it what to do…" @keydown="onKey" @input="grow" @focus="items.length && !open && replies > seen && toggle(true)"></textarea>
        <button class="send" :disabled="!text.trim() || sending" @click="send()" title="Send (Enter)">Send</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.nchat-dock { position: absolute; left: 0; right: 0; bottom: 16px; z-index: 20; padding: 0 24px; pointer-events: none; display: flex; justify-content: center; }
.nchat { pointer-events: auto; width: min(720px, 100%); background: var(--card-hi); border-radius: 24px; box-shadow: 0 14px 40px rgba(20, 15, 5, .16), 0 0 0 1px var(--line); display: flex; flex-direction: column; overflow: hidden; }
.panel { display: flex; flex-direction: column; gap: 10px; padding: 14px 14px 4px; border-bottom: 1px solid var(--line); }
header { display: flex; align-items: center; gap: 12px; font-size: 13px; }
header b { flex: 1; }
.live { display: inline-flex; align-items: center; gap: 6px; color: var(--ink-3); font-size: 12px; }
.live i { width: 8px; height: 8px; border-radius: 50%; background: var(--ink-3); }
.live.on i { background: var(--good); box-shadow: 0 0 0 4px color-mix(in srgb, var(--good) 18%, transparent); }
.close { width: 28px; height: 28px; border-radius: 50%; background: var(--card); color: var(--ink-2); font-size: 15px; line-height: 1; }
.msgs { display: flex; flex-direction: column; gap: 8px; max-height: min(42vh, 380px); overflow-y: auto; padding: 2px; }
.msgs p { margin: 0; white-space: pre-wrap; line-height: 1.5; font-size: 14px; }
.msgs small { display: block; margin-top: 3px; font-size: 11px; color: var(--ink-3); }
.msgs .empty { color: var(--ink-3); font-size: 13px; }
.you, .ai { max-width: 86%; padding: 9px 13px; border-radius: 16px; }
.you { align-self: flex-end; background: var(--ink); color: #fff; border-bottom-right-radius: 5px; }
.you small { color: color-mix(in srgb, #fff 60%, transparent); text-align: right; }
.ai { align-self: flex-start; background: var(--card); border-bottom-left-radius: 5px; }
.ai.pending p { color: var(--ink-3); font-style: italic; }
.quick { display: flex; flex-wrap: wrap; gap: 6px; padding-bottom: 8px; }
.quick button { padding: 5px 11px; border-radius: 99px; background: var(--card); font-size: 12.5px; font-weight: 600; color: var(--ink-2); }
.quick button:hover:not(:disabled) { background: var(--accent); color: var(--ink); }
.compose { display: flex; gap: 8px; align-items: flex-end; padding: 8px 8px 8px 10px; }
.compose textarea { flex: 1; border: 0; background: transparent; padding: 8px 4px; font: 500 14px/1.5 var(--sans); resize: none; outline: none; max-height: 120px; color: var(--ink); }
.mark { position: relative; flex: none; width: 34px; height: 34px; border-radius: 50%; background: var(--ink); display: grid; place-items: center; }
.mark i { font-style: normal; color: var(--accent); font-size: 15px; }
.mark small { position: absolute; top: -4px; right: -4px; min-width: 17px; height: 17px; padding: 0 4px; border-radius: 99px; background: var(--accent); color: var(--ink); font-size: 10.5px; font-weight: 700; display: grid; place-items: center; }
.mark em { position: absolute; top: -1px; right: -1px; width: 10px; height: 10px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 2px var(--card-hi); }
.send { flex: none; padding: 8px 16px; border-radius: 99px; background: var(--ink); color: #fff; font-size: 13px; font-weight: 600; }
.send:disabled, .quick button:disabled { opacity: .4; cursor: default; }
@media (max-width: 640px) { .nchat-dock { padding: 0 12px; bottom: 10px; } }
</style>

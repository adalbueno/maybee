<script setup>
// A chat dock floating at the bottom of a note: always one line away, and it opens to show what you asked the
// AI about this note and what it answered. It uses the same requests as the "Ask AI" button in the board
// (ask.js), so both end up in the same place.
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { ask, claude, agentLabel } from '../ask.js'
import { quickFor } from '../stages.js'
import Bee from './Bee.vue'
const beeNow = computed(() => claude.listening ? (claude.items.some(i => i.status === 'working') ? 'busy' : 'ok') : 'idle')
import MarkdownIt from 'markdown-it'
// Replies are Markdown (lists, bold, short paragraphs). Raw HTML is never rendered, and links open outside the app.
const md = new MarkdownIt({ html: false, linkify: true, breaks: true })
const defaultLink = md.renderer.rules.link_open || ((t, i, o, e, self) => self.renderToken(t, i, o))
md.renderer.rules.link_open = (t, i, o, e, self) => { t[i].attrSet('target', '_blank'); t[i].attrSet('rel', 'noopener noreferrer'); return defaultLink(t, i, o, e, self) }
// In the About chat, a file named in code (`knowledge/brand/voice.md`) is a link that opens that file.
const FILE_NAME = /^[\w .\/-]+\.md$/
const defaultCode = md.renderer.rules.code_inline
md.renderer.rules.code_inline = (t, i, o, env, self) => {
  const name = t[i].content.trim()
  if (!env.linkFiles || !FILE_NAME.test(name)) return defaultCode(t, i, o, env, self)
  return `<a class="filelink" href="#" data-open="${md.utils.escapeHtml(name)}">${md.utils.escapeHtml(name)}</a>`
}
const html = text => md.render(text || '', { linkFiles: props.linkFiles })
const props = defineProps({
  path: String, title: String, stage: { type: String, default: '' },
  // the same dock serves other places (About): its own wording, no stage shortcuts, and fixed to the window
  heading: { type: String, default: 'Ask Maybee about this note' },
  placeholder: { type: String, default: 'Ask Maybee about this note, or tell Maybee what to do…' },
  empty: { type: String, default: 'Nothing asked about this note yet.' },
  floating: Boolean,
  linkFiles: Boolean,
  quick: { type: Boolean, default: true },
})
const emit = defineEmits(['settled', 'open'])
function onMsgClick(e) {
  const a = e.target.closest && e.target.closest('a[data-open]')
  if (a) { e.preventDefault(); emit('open', a.dataset.open) }
}

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
const state = i => i.status === 'done' ? '' : i.status === 'working' ? 'Working on it…' : i.status === 'queued' ? 'In line…' : (claude.listening ? 'Sent…' : 'Saved. It waits until a session listens again.')
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
  <div class="nchat-dock" :class="{ floating }" @click.stop @keydown="onDockKey">
    <section class="nchat" :class="{ open }">
      <div v-if="open" class="panel">
        <header>
          <b>{{ heading }}</b>
          <span class="live" :class="{ on: claude.listening }"><i></i>{{ claude.listening ? (agentLabel(claude.bridge) ? agentLabel(claude.bridge) + ' is listening' : 'A session is listening') : 'No session is listening: open your assistant and write "listen to Maybee"' }}</span>
          <button class="close" title="Hide (Esc)" @click="toggle(false)">⌄</button>
        </header>
        <div ref="box" class="msgs" @click="onMsgClick">
          <p v-if="!items.length" class="empty">{{ empty }}</p>
          <template v-for="i in items" :key="i.id">
            <div class="you"><p>{{ label(i) }}</p><small>{{ clock(i.at) }}</small></div>
            <div v-if="i.reply" class="ai"><div class="md" v-html="html(i.reply)"></div><small>Maybee</small></div>
            <div v-else-if="state(i)" class="ai pending"><p>{{ state(i) }}</p></div>
          </template>
        </div>
        <div v-if="quick" class="quick">
          <button v-for="q in quickFor(stage)" :key="q" :disabled="sending" @click="send(q)">{{ q }}</button>
        </div>
      </div>
      <div class="compose">
        <button class="mark" :class="beeNow" :title="open ? 'Hide the conversation' : 'Show the conversation'" @click="toggle()">
          <Bee :state="beeNow" :height="20" /><small v-if="pending">{{ pending }}</small><em v-else-if="unread"></em>
        </button>
        <textarea ref="field" v-model="text" rows="1" :placeholder="placeholder" @keydown="onKey" @input="grow" @focus="items.length && !open && replies > seen && toggle(true)"></textarea>
        <button class="send" :disabled="!text.trim() || sending" @click="send()" title="Send (Enter)">Send</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.nchat-dock { position: absolute; left: 0; right: 0; bottom: 16px; z-index: 20; padding: 0 24px; pointer-events: none; display: flex; justify-content: center; }
.nchat-dock.floating { position: fixed; }
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
.md { font-size: 14px; line-height: 1.55; overflow-wrap: anywhere; }
.md :deep(> :first-child) { margin-top: 0; }
.md :deep(> :last-child) { margin-bottom: 0; }
.md :deep(p) { margin: 0 0 .7em; white-space: normal; }
.md :deep(ul), .md :deep(ol) { margin: 0 0 .7em; padding-left: 1.3em; }
.md :deep(li) { margin: .25em 0; }
.md :deep(li > p) { margin: 0; }
.md :deep(h1), .md :deep(h2), .md :deep(h3), .md :deep(h4) { margin: .9em 0 .4em; font-size: 14px; font-weight: 700; }
.md :deep(code) { padding: 1px 5px; border-radius: 5px; background: color-mix(in srgb, var(--ink) 8%, transparent); font-size: 12.5px; }
.md :deep(pre) { margin: 0 0 .7em; padding: 8px 10px; border-radius: 10px; background: color-mix(in srgb, var(--ink) 8%, transparent); overflow-x: auto; }
.md :deep(pre code) { padding: 0; background: none; }
.md :deep(blockquote) { margin: 0 0 .7em; padding-left: 10px; border-left: 3px solid var(--line); color: var(--ink-2); }
.md :deep(a) { color: inherit; text-decoration: underline; }
.md :deep(a.filelink) { font-size: 12.5px; padding: 1px 6px; border-radius: 5px; background: var(--accent); text-decoration: none; font-weight: 600; }
.ai.pending p { color: var(--ink-3); font-style: italic; }
.quick { display: flex; flex-wrap: wrap; gap: 6px; padding-bottom: 8px; }
.quick button { padding: 5px 11px; border-radius: 99px; background: var(--card); font-size: 12.5px; font-weight: 600; color: var(--ink-2); }
.quick button:hover:not(:disabled) { background: var(--accent); color: var(--ink); }
.compose { display: flex; gap: 8px; align-items: flex-end; padding: 8px 8px 8px 10px; }
.compose textarea { flex: 1; border: 0; background: transparent; padding: 8px 4px; font: 500 14px/1.5 var(--sans); resize: none; outline: none; max-height: 120px; color: var(--ink); }
.mark { position: relative; flex: none; width: 34px; height: 34px; border-radius: 50%; background: radial-gradient(circle, #f4f2ec 0%, #b3afa4 100%); display: grid; place-items: center; margin: 0; }
.mark small { position: absolute; top: -4px; right: -4px; min-width: 17px; height: 17px; padding: 0 4px; border-radius: 99px; background: var(--accent); color: var(--ink); font-size: 10.5px; font-weight: 700; display: grid; place-items: center; }
.mark em { position: absolute; top: -1px; right: -1px; width: 10px; height: 10px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 2px var(--card-hi); }
.send { flex: none; padding: 8px 16px; border-radius: 99px; background: var(--ink); color: #fff; font-size: 13px; font-weight: 600; }
.send:disabled, .quick button:disabled { opacity: .4; cursor: default; }
@media (max-width: 640px) { .nchat-dock { padding: 0 12px; bottom: 10px; } }
</style>

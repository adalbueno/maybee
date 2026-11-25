<script setup>
// A chat dock floating at the bottom of a note: always one line away, and it opens to show what you asked the
// AI about this note and what it answered. It uses the same requests as the "Ask AI" button in the board
// (ask.js), so both end up in the same place.
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { ask, claude, agentLabel, beeState } from '../ask.js'
import { quickFor } from '../stages.js'
import Bee from './Bee.vue'
import FileKind from './FileKind.vue'
const beeNow = computed(() => beeState())
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
  // openAt: a time stamp; each new one opens the conversation (the bee's list opens a card with its chat showing)
  openAt: { type: Number, default: 0 },
  // inline: sits in the page's flow instead of floating over it (the board's capture row)
  inline: Boolean,
  // submit: the text goes to this function instead of the AI (the board saves it as a card straight away); it returns true when done.
  // There is no conversation then: the bee is only a mark and nothing opens.
  submit: Function,
  // about: the note open beside this chat, sent with each request (the Inbox's chat uses it)
  about: { type: String, default: null },
})
const emit = defineEmits(['settled', 'open', 'typing'])
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
// what is being typed, for a page that filters as you type (the Brain); sending empties it
watch(text, t => emit('typing', t))
let timer = null
let doneIds = null // ids already done at the last look; a new one means the AI finished something

// The card's one AI action for its column (stages.js) sits in the bar itself, so it is visible without opening anything.
// It shares one slot with Send: an empty field shows the action, typing turns it into Send. Both are drawn in the same cell,
// so the slot keeps the width of the wider one and nothing in the bar moves when it switches. Actions that are done once (explore, get ready) leave the bar once they were asked for this note; "Do the next step" stays.
const ONCE = { 'Explore this idea': ['Explore this idea', 'Help me explore this idea'], 'Get it ready to start': ['Get it ready to start'], 'What comes next?': ['What comes next?', 'What should come next?'] }
const action = computed(() => {
  const a = props.quick && !props.submit ? (quickFor(props.stage)[0] || '') : ''
  if (a && ONCE[a] && items.value.some(i => ONCE[a].includes(i.action))) return ''
  return a
})
// Files attached to the next message: each one is uploaded to attachments/ as soon as it is picked, dropped or pasted,
// and its path goes with the request (or, in the board's bar, onto the new card).
const files = ref([])
const picker = ref(null)
const dragOver = ref(false)
const uploading = computed(() => files.value.some(f => f.busy))
const ready = computed(() => files.value.filter(f => f.path).map(f => f.path))
const canSend = computed(() => !!(text.value.trim() || ready.value.length) && !uploading.value)
let fileKey = 0
async function attach(list) {
  for (const file of Array.from(list || []).slice(0, 10 - files.value.length)) {
    const f = { key: ++fileKey, name: file.name || 'pasted file', busy: true, path: null, error: '' }
    files.value.push(f)
    const at = files.value.length - 1
    try {
      const r = await fetch('/api/attach?name=' + encodeURIComponent(f.name), { method: 'POST', body: file })
      const out = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(out.error || 'Could not attach it')
      Object.assign(files.value.find(x => x.key === f.key) || {}, { busy: false, path: out.path, name: out.name })
    } catch (e) {
      Object.assign(files.value.find(x => x.key === f.key) || {}, { busy: false, error: e.message })
    }
  }
  nextTick(() => field.value?.focus())
}
// One small icon per kind of file, so a list of attachments reads at a glance
const KINDS = [
  ['image', /\.(png|jpe?g|gif|webp|svg|avif|heic)$/i], ['video', /\.(mp4|webm|mov|mkv|avi)$/i], ['audio', /\.(mp3|wav|m4a|ogg|flac)$/i],
  ['pdf', /\.pdf$/i], ['sheet', /\.(csv|xlsx?|ods|tsv)$/i], ['slides', /\.(pptx?|key|odp)$/i], ['doc', /\.(docx?|odt|rtf|md|txt|pages)$/i],
  ['archive', /\.(zip|tar|gz|rar|7z)$/i], ['code', /\.(m?js|ts|json|html|css|py|sh|ya?ml)$/i],
]
const kindOf = n => (KINDS.find(([, re]) => re.test(String(n))) || ['file'])[0]
const unattach = f => { files.value = files.value.filter(x => x.key !== f.key) }
const clearFiles = () => { files.value = [] }
function onPick(e) { attach(e.target.files); e.target.value = '' }
// A pasted screenshot comes as "image.png": it gets a name with the time, so two pastes are two files
function onPaste(e) {
  const fl = e.clipboardData && e.clipboardData.files
  if (!fl || !fl.length) return
  e.preventDefault()
  const stamp = new Date().toLocaleString('sv-SE').replace(/:/g, '.')
  attach([...fl].map((f, n) => /^image\.\w+$/i.test(f.name) ? new File([f], `Pasted image ${stamp}${fl.length > 1 ? ' ' + (n + 1) : ''}.${f.name.split('.').pop()}`, { type: f.type }) : f))
}
const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files')
function onDragOver(e) { if (!hasFiles(e)) return; e.preventDefault(); dragOver.value = true }
function onDropFiles(e) { if (!hasFiles(e)) return; e.preventDefault(); dragOver.value = false; attach(e.dataTransfer.files) }
const shortName = p => String(p).split('/').pop()
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
onMounted(() => { if (props.submit) return; load(); timer = setInterval(load, 3000) })
onBeforeUnmount(() => clearInterval(timer))
watch(() => props.openAt, n => { if (n && !props.submit) load().then(() => toggle(true)) }, { immediate: true })
watch(() => props.path, () => { items.value = []; doneIds = null; open.value = false; load() })

function toggle(force) {
  if (props.submit) return // capture only: there is no conversation to show
  open.value = typeof force === 'boolean' ? force : !open.value
  if (open.value) { seen.value = replies.value; scrollEnd() }
}
const label = i => i.action === 'Request' ? i.text : i.action + (i.text ? ': ' + i.text : '')
// Playful status while the assistant works: a word per message that changes every few seconds
const WORDS = ['Maybeeing', 'Honeying', 'Buzzing', 'Zzzooming', 'Pollinating', 'Foraging', 'Waggle-dancing', 'Humming along', 'Honeycombing', 'Beelaboring', 'Nectaring', 'Hiving', 'Bee-thinking', 'Stinging an idea', 'Bumbling', 'Swarming on it', 'Royal-jellying', 'Beeswaxing', 'Maybe-ing']
const tick = ref(0)
let wordTimer = null
onMounted(() => { wordTimer = setInterval(() => tick.value++, 2800) })
onBeforeUnmount(() => clearInterval(wordTimer))
const word = i => WORDS[(Math.abs([...String(i.id)].reduce((a, c) => a + c.charCodeAt(0), 0)) + tick.value) % WORDS.length] + '…'
const state = i => i.status === 'done' ? '' : i.status === 'working' ? word(i) : i.status === 'queued' ? 'In line…' : (claude.listening ? 'Sent…' : 'Saved. It waits until a session listens again.')
const clock = iso => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

function grow() {
  const el = field.value
  if (!el) return
  el.style.height = 'auto'
  if (!el.value) return // empty: one line, whatever the placeholder's length
  el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}
async function send(action = 'Request', extra = text.value) {
  if (sending.value || uploading.value || (action === 'Request' && !extra.trim() && !ready.value.length)) return
  const paths = ready.value
  if (props.submit) {
    sending.value = true
    let ok = false
    try { ok = await props.submit(extra.trim(), paths) } finally { sending.value = false }
    if (ok) { text.value = ''; clearFiles(); nextTick(grow) }
    nextTick(() => field.value?.focus())
    return
  }
  sending.value = true
  toggle(true)
  try { await ask({ action, text: action === 'Request' ? extra.trim() : '', path: props.path, title: props.title, about: props.about, files: paths, quiet: true }) } finally { sending.value = false }
  clearFiles()
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
  <div class="nchat-dock" :class="{ floating, inline }" @click.stop @keydown="onDockKey">
    <section class="nchat" :class="{ open, over: dragOver }" @dragover="onDragOver" @dragleave.self="dragOver = false" @drop="onDropFiles">
      <div v-if="open" class="panel">
        <header>
          <b>{{ heading }}</b>
          <span class="live" :class="{ on: claude.listening }"><i></i>{{ claude.listening ? (agentLabel(claude.bridge) ? agentLabel(claude.bridge) + ' is listening' : 'A session is listening') : 'No session is listening: open your assistant and write "listen to Maybee"' }}</span>
          <button class="close" title="Hide (Esc)" @click="toggle(false)">⌄</button>
        </header>
        <div ref="box" class="msgs" @click="onMsgClick">
          <p v-if="!items.length" class="empty">{{ empty }}</p>
          <template v-for="i in items" :key="i.id">
            <div class="you"><p v-if="label(i)">{{ label(i) }}</p><div v-if="i.files && i.files.length" class="atts"><a v-for="f in i.files" :key="f" href="#" class="att" :data-open="f" :title="f"><FileKind :kind="kindOf(f)" />{{ shortName(f) }}</a></div><small>{{ clock(i.at) }}</small></div>
            <div v-if="i.reply" class="ai"><div class="md" v-html="html(i.reply)"></div><div v-if="i.outputs && i.outputs.length" class="outs"><a v-for="o in i.outputs" :key="o.path" href="#" class="out" :data-open="o.path" :title="o.path">{{ o.title }}</a></div><small>Maybee</small></div>
            <div v-else-if="state(i)" class="ai pending"><p>{{ state(i) }}</p></div>
          </template>
        </div>
      </div>
      <div v-if="files.length" class="tray">
        <span v-for="f in files" :key="f.key" class="chip" :class="{ busy: f.busy, bad: f.error }" :title="f.error || f.path || 'Attaching…'">
          <FileKind :kind="kindOf(f.name)" /><span class="cname">{{ f.name }}</span><i v-if="f.busy"> · attaching…</i><i v-else-if="f.error"> · {{ f.error }}</i>
          <button :title="'Remove ' + f.name" @click="unattach(f)">✕</button>
        </span>
      </div>
      <div class="compose">
        <span v-if="submit" class="mark" :class="beeNow" aria-hidden="true"><Bee :state="beeNow" :height="14" /></span>
        <button v-else class="mark" :class="beeNow" :title="open ? 'Hide the conversation' : 'Show the conversation'" @click="toggle()">
          <Bee :state="beeNow" :height="14" /><small v-if="pending">{{ pending }}</small><em v-else-if="unread"></em>
        </button>
        <button class="clip" :disabled="files.length >= 10" title="Attach files (or drop them here, or paste)" aria-label="Attach files" @click="picker.click()"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9"/></svg></button>
        <input ref="picker" type="file" multiple hidden @change="onPick" />
        <textarea ref="field" @paste="onPaste" v-model="text" rows="1" :placeholder="placeholder" @keydown="onKey" @input="grow" @focus="items.length && !open && replies > seen && toggle(true)"></textarea>
        <div class="slot">
          <button v-if="action" class="send primary" :class="{ off: text.trim() || ready.length }" :disabled="sending" :tabindex="text.trim() ? -1 : 0" :aria-hidden="!!text.trim()" @click="send(action)" :title="'Ask Maybee: ' + action">{{ action }}</button>
          <button class="send" :class="{ off: action && !text.trim() && !ready.length }" :disabled="!canSend || sending" :aria-hidden="!!(action && !text.trim())" @click="send()" title="Send (Enter)">Send</button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.nchat-dock { position: absolute; left: 0; right: 0; bottom: 24px; z-index: 20; padding: 0 24px; pointer-events: none; display: flex; justify-content: center; }
.nchat-dock.floating { position: fixed; }
/* inline keeps only the one-line bar in the flow; the open conversation (and a longer text) grows upwards over what is above, never pushing it */
.nchat-dock.inline { position: relative; bottom: auto; padding: 0; height: 50px; pointer-events: auto; }
.nchat-dock.inline .nchat { position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); }
/* The About page's chat is fixed to the window. With a card open beside the page it keeps to the page's own side, so it never covers the card's chat bar;
   on a narrow window, where the card takes the whole width, it steps aside for the card's chat. */
.with-viewer .nchat-dock.floating { right: auto; width: var(--list-pane); }
@media (max-width: 1100px) { .with-viewer .nchat-dock.floating { display: none; } }
/* One chat in sight at a time: with a card or a file open beside the page, the page's own bar (the board's capture, the Inbox's, the Brain's)
   fades out, and comes back while the mouse is over the page's side or while you type in it. The open note's chat stays. */
.nchat-dock.inline { transition: opacity .15s ease .2s; /* a mouse only passing by changes nothing: the switch waits 200 ms */ }
.with-viewer .nchat-dock.inline { opacity: 0; pointer-events: none; }
.with-viewer :hover > .nchat-dock.inline, .with-viewer .nchat-dock.inline:focus-within { opacity: 1; pointer-events: auto; }
/* and the other way round: while the page's bar is in sight, the open note's chat steps aside (unless you are typing in it) */
.nchat-dock:not(.inline) { transition: opacity .15s ease .2s; /* a mouse only passing by changes nothing: the switch waits 200 ms */ }
.with-viewer:has(:hover > .nchat-dock.inline, .nchat-dock.inline:focus-within) .viewer .nchat-dock:not(.inline):not(:focus-within) { opacity: 0; pointer-events: none; }
.nchat { pointer-events: auto; width: min(720px, 100%); background: var(--card-hi); border-radius: 24px; box-shadow: 0 14px 40px rgba(20, 15, 5, .18), 0 0 0 1px color-mix(in srgb, var(--ink) 14%, transparent); display: flex; flex-direction: column; overflow: hidden; }
.panel { display: flex; flex-direction: column; gap: 10px; padding: 14px 14px 12px; border-bottom: 1px solid var(--line); }
header { display: flex; align-items: center; gap: 12px; font-size: 13px; }
header b { flex: 1; }
.live { display: inline-flex; align-items: center; gap: 6px; color: var(--ink-3); font-size: 12px; }
.live i { width: 8px; height: 8px; border-radius: 50%; background: var(--ink-3); }
.live.on i { background: var(--good); box-shadow: 0 0 0 4px color-mix(in srgb, var(--good) 18%, transparent); }
.close { width: 28px; height: 28px; border-radius: 50%; background: var(--card); color: var(--ink-2); font-size: 15px; line-height: 1; }
.msgs { display: flex; flex-direction: column; gap: 8px; max-height: min(42vh, 380px); overflow-y: auto; padding: 2px; }
.msgs p { margin: 0; white-space: pre-wrap; line-height: 1.5; font-size: 14px; }
.msgs small { display: block; margin-top: 3px; font-size: 11px; color: var(--ink-3); }
.msgs .empty { color: var(--ink-3); font-size: 13px; border: 0; padding: 4px 2px; text-align: left; } /* a line, not the board's dashed drop box */
.you, .ai { max-width: 86%; padding: 9px 13px; border-radius: 16px; }
.you { align-self: flex-end; background: var(--ink); color: #fff; border-bottom-right-radius: 5px; }
.you small { color: color-mix(in srgb, #fff 60%, transparent); text-align: right; }
.ai { align-self: flex-start; background: var(--card); border-bottom-left-radius: 5px; }
.md { font-size: 14px; line-height: 1.55; overflow-wrap: anywhere; }
/* The files a request made, under its reply: each one opens the file (they are also on the card, under Work). */
.outs { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.out { font-size: 12.5px; padding: 3px 9px; border-radius: 999px; background: var(--page); border: 1px solid var(--line); color: var(--ink); text-decoration: none; }
.out::before { content: '📄 '; }
.out:hover { border-color: currentColor; }
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
.compose { display: flex; gap: 8px; align-items: flex-end; padding: 8px 8px 8px 10px; }
.compose textarea::placeholder { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.compose textarea { flex: 1; border: 0; background: transparent; padding: 8px 4px; font: 500 14px/1.5 var(--sans); resize: none; outline: none; max-height: 120px; color: var(--ink); }
.mark { position: relative; flex: none; width: 34px; height: 34px; border-radius: 50%; background: radial-gradient(circle, #f4f2ec 0%, #b3afa4 100%); display: grid; place-items: center; margin: 0; }
.mark small { position: absolute; top: -4px; right: -4px; min-width: 17px; height: 17px; padding: 0 4px; border-radius: 99px; background: var(--accent); color: var(--ink); font-size: 10.5px; font-weight: 700; display: grid; place-items: center; }
.mark em { position: absolute; top: -1px; right: -1px; width: 10px; height: 10px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 2px var(--card-hi); }
.clip { flex: none; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; color: var(--ink-2); background: transparent; }
.clip:hover:not(:disabled) { background: var(--card); color: var(--ink); }
.clip:disabled { opacity: .35; }
.nchat.over { box-shadow: 0 14px 40px rgba(20, 15, 5, .18), 0 0 0 2px var(--accent); }
.tray { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 12px 0; }
.chip { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; font-size: 12.5px; padding: 4px 6px 4px 10px; border-radius: 999px; background: var(--card); border: 1px solid var(--line); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.chip .cname { overflow: hidden; text-overflow: ellipsis; }
.chip i { font-style: normal; color: var(--ink-3); }
.chip.bad { border-color: #d9534f; }
.chip.bad i { color: #c0392b; }
.chip.busy { opacity: .7; }
.chip button { width: 18px; height: 18px; border-radius: 50%; font-size: 10px; line-height: 1; color: var(--ink-2); background: transparent; }
.chip button:hover { background: var(--line); }
.atts { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
.att { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, #fff 16%, transparent); color: #fff; text-decoration: none; }
.att:hover { background: color-mix(in srgb, #fff 26%, transparent); }
.send { flex: none; padding: 8px 16px; border-radius: 99px; background: var(--ink); color: #fff; font-size: 13px; font-weight: 600; }
.slot { flex: none; display: grid; }
.slot > .send { grid-area: 1 / 1; white-space: nowrap; }
.slot > .send.off { visibility: hidden; }
.send.primary { background: var(--accent); color: var(--ink); }
.send.primary:hover:not(:disabled) { filter: brightness(.95); }
.send:disabled { opacity: .4; cursor: default; }
@media (max-width: 640px) { .nchat-dock { padding: 0 12px; bottom: 10px; } }
</style>

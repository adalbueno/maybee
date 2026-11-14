<script setup>
import NoteChat from './NoteChat.vue'
import NoteProps from './NoteProps.vue'
import LiveEditor from './LiveEditor.vue'
import { humanize, when } from '../humanize.js'
import { ref, watch, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
const props = defineProps({ target: Object, freshAt: Number, fresh: Object })
const emit = defineEmits(['close', 'open', 'tab'])

const note = ref(null)
// a note always opens on Content (Adal, 8/11), unless the link asks for a tab (D254)
const tab = ref(props.target.tab || 'content')
async function setTab(t) { if (inline.value) await saveNow(true); tab.value = t; emit('tab', t) }
const loading = ref(false)
const bodyEl = ref(null)
const history = ref([])
const editing = ref(false)
const draft = ref('')
const draftMtime = ref(0)
const changedUnder = ref(false)
const saveMsg = ref('')

// A markdown note you can edit (not an "In force" register, which keeps its read view) is always open in the
// editor: no Edit button, and it saves by itself a moment after you stop typing.
const always = computed(() => !!note.value && note.value.ext === '.md' && !note.value.error && !parts.value.record)
const inline = computed(() => always.value && editing.value)
const FM_RE = /^---\n[\s\S]*?\n---[^\n]*\n?(?:[ \t]*\n)*(?:> \[[^\n]*\n)?(?:[ \t]*\n)*/
function splitSource(text) { const m = FM_RE.exec(text); const head = m ? m[0] : ''; return { head, body: text.slice(head.length) } }
const draftHead = ref('')
const savedText = ref('') // the text as last read from or written to disk, to know when there is something to save
const editPath = ref('')
const syncState = ref('') // '' | dirty | saving | saved | conflict | error
let saveTimer = null

let starting = false
async function startEdit() {
  if (starting) return
  starting = true
  try {
    const path = props.target.path
    const src = await fetch('/api/source?path=' + encodeURIComponent(path)).then(r => r.json())
    if (src.error) { saveMsg.value = src.error; return }
    if (props.target.path !== path) return
    openEditor(path, src)
  } finally { starting = false }
}
function openEditor(path, src) {
  // D264: the frontmatter stays out of the editor (Settings edits it) and goes back untouched on save.
  // So does the line of links under it (Dashboard / Start here): the editor starts at the title.
  const { head, body } = splitSource(src.text)
  editPath.value = path; draftHead.value = head; savedText.value = body; draft.value = body
  draftMtime.value = src.mtime; changedUnder.value = false; saveMsg.value = ''; syncState.value = ''; editing.value = true
}
// A note that is always editable cannot be left in the read view: if it ever is (a reload, a failed read, a
// swapped note), the editor opens again by itself.
watch([always, editing, loading], () => { if (always.value && !editing.value && !loading.value) startEdit() })
// classic save, for the notes that keep an Edit button
async function saveClassic() {
  saveMsg.value = 'Saving…'
  const res = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: props.target.path, text: draftHead.value + draft.value, mtime: draftMtime.value }) })
  const r = await res.json()
  if (res.status === 409) { saveMsg.value = 'Not saved: this note changed on disk while you were editing. Copy your text, then reopen it.'; changedUnder.value = true; return }
  if (!res.ok) { saveMsg.value = 'Not saved: ' + (r.error || res.status); return }
  draftMtime.value = r.mtime; saveMsg.value = r.unchanged ? 'No changes.' : 'Saved.'
  editing.value = false
  load(true)
}
const save = () => inline.value ? saveNow(true) : saveClassic()

// autosave: one save at a time, only when the text differs from what is on disk
let inflight = Promise.resolve()
function saveNow(force = false) {
  clearTimeout(saveTimer)
  inflight = inflight.then(async () => {
    if (!inline.value || changedUnder.value) return
    if (draft.value === savedText.value) { if (force) syncState.value = 'saved'; return }
    const path = editPath.value, body = draft.value
    syncState.value = 'saving'
    try {
      const res = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, text: draftHead.value + body, mtime: draftMtime.value, auto: true }) })
      const r = await res.json().catch(() => ({}))
      if (editPath.value !== path) return
      if (res.status === 409) { changedUnder.value = true; syncState.value = 'conflict'; return }
      if (!res.ok) { syncState.value = 'error'; saveMsg.value = 'Not saved: ' + (r.error || res.status); return }
      draftMtime.value = r.mtime; savedText.value = body
      if (draft.value === body) { syncState.value = 'saved'; load(true) } else { syncState.value = 'dirty'; saveTimer = setTimeout(saveNow, 1200) }
    } catch { syncState.value = 'error'; saveMsg.value = 'Not saved: could not reach Maybee.' }
  })
  return inflight
}
watch(draft, () => {
  if (!inline.value) return
  if (draft.value === savedText.value) return
  syncState.value = 'dirty'
  clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 1200)
})
// The note changed on disk while it is open (the AI, Settings, the board, Sync). Quietly take what changed,
// and only ask when the text itself changed on both sides.
async function mergeExternal() {
  const path = editPath.value
  const src = await fetch('/api/source?path=' + encodeURIComponent(path)).then(r => r.json()).catch(() => null)
  if (!src || src.error || editPath.value !== path || src.mtime === draftMtime.value) return
  const { head, body } = splitSource(src.text)
  if (body === savedText.value) { draftHead.value = head; draftMtime.value = src.mtime; load(true); return } // only the settings changed
  if (draft.value === savedText.value) { draftHead.value = head; savedText.value = body; draft.value = body; draftMtime.value = src.mtime; load(true); return }
  changedUnder.value = true; syncState.value = 'conflict'
}
async function keepMine() {
  const src = await fetch('/api/source?path=' + encodeURIComponent(editPath.value)).then(r => r.json()).catch(() => null)
  if (!src || src.error) return
  draftHead.value = splitSource(src.text).head; draftMtime.value = src.mtime; changedUnder.value = false
  await saveNow(true)
}
const takeTheirs = () => startEdit()
const syncText = computed(() => ({
  dirty: 'Typing… it saves when you pause', saving: 'Saving…', saved: 'Saved', error: saveMsg.value || 'Not saved',
  conflict: 'This note changed on disk while you were typing.', '': 'Ctrl+S saves now · it saves by itself when you pause',
}[syncState.value]))
function flushOnLeave() {
  if (document.visibilityState === 'hidden') saveNow(true)
}
function flushOnClose() {
  if (!inline.value || changedUnder.value || draft.value === savedText.value) return
  fetch('/api/save', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: editPath.value, text: draftHead.value + draft.value, mtime: draftMtime.value, auto: true }) }).catch(() => {})
}
document.addEventListener('visibilitychange', flushOnLeave)
window.addEventListener('pagehide', flushOnClose)
onBeforeUnmount(() => { document.removeEventListener('visibilitychange', flushOnLeave); window.removeEventListener('pagehide', flushOnClose); clearTimeout(saveTimer); flushOnClose() })
function cancelEdit() { editing.value = false; saveMsg.value = '' }
function onEditKey(e) { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save() } }

// ---------- collapsible sections (H1/H2) ----------
// H1 starts open; every H2 starts closed (Adal, 7/11: "todos fechados"); a decision opened
// from its card opens its own section. What Adal opens or closes is kept per file while the app is open.
const articleEl = ref(null)
const sectionCount = ref(0)
const openState = new Map() // path -> Map(heading text -> open)
const restEl = ref(null) // D253: the full text of an "In force" file, shown in the Changes tab
function sectionize(root = articleEl.value, count = true) {
  if (count) sectionCount.value = 0
  if (!root || root.dataset.sections) return
  root.dataset.sections = '1'
  const path = props.target.path
  if (!openState.has(path)) openState.set(path, new Map())
  const saved = openState.get(path)
  function wrap(container, level) {
    const tag = 'H' + level
    const out = []
    let cur = null
    for (const n of [...container.childNodes]) {
      if (n.nodeType === 1 && n.tagName === tag) {
        cur = document.createElement('details')
        cur.className = 'sec sec-h' + level
        container.insertBefore(cur, n)
        const sum = document.createElement('summary')
        sum.appendChild(n)
        cur.appendChild(sum)
        out.push(cur)
      } else if (cur) cur.appendChild(n)
    }
    return out
  }
  const h1s = wrap(root, 1)
  const groups = [wrap(root, 2), ...h1s.map(d => wrap(d, 2))]
  const all = [...h1s, ...groups.flat()]
  for (const d of h1s) d.open = true
  for (const g of groups) g.forEach(d => {
    const key = d.querySelector('summary').textContent.trim()
    d.open = saved.has(key) ? saved.get(key) : /^In force/i.test(key)
  })
  for (const d of all) d.addEventListener('toggle', () => saved.set(d.querySelector('summary').textContent.trim(), d.open))
  if (count) sectionCount.value = groups.flat().length
}
function sectionizeAll() { sectionize(); sectionize(restEl.value, false) }
function setAll(open) {
  if (!articleEl.value) return
  articleEl.value.querySelectorAll('details.sec').forEach(d => { d.open = open })
}
watch(editing, async v => { if (!v) { await nextTick(); sectionizeAll() } })

const raw = p => '/raw?path=' + encodeURIComponent(p)
const isImage = computed(() => note.value && /\.(png|jpe?g|webp|gif|svg)$/i.test(note.value.path))
const isVideo = computed(() => note.value && /\.(mp4|webm|mov)$/i.test(note.value.path))
const group = computed(() => props.target.group || null)
const groupIndex = computed(() => group.value ? group.value.indexOf(props.target.path) : -1)

const FM_SHOW = ['status', 'stage', 'type', 'day', 'created', 'captured', 'published', 'updated', 'date', 'members', 'visitors_30d', 'conversion']
const chips = computed(() => {
  const fm = (note.value && note.value.frontmatter) || {}
  return FM_SHOW.filter(k => fm[k] != null && fm[k] !== '' && !Array.isArray(fm[k])).map(k => ({ k, v: String(fm[k]) }))
})
const liveLink = computed(() => {
  const l = note.value && note.value.frontmatter && note.value.frontmatter.link
  return typeof l === 'string' && l.startsWith('http') ? l : null
})

async function load(keepScroll = false) {
  loading.value = !keepScroll
  const top = bodyEl.value ? bodyEl.value.scrollTop : 0
  note.value = await fetch('/api/note?path=' + encodeURIComponent(props.target.path)).then(r => r.json())
  loading.value = false
  // a decision card opens the full register, where its row is (D253)
  if (!keepScroll && props.target.decision && parts.value.record) { tab.value = 'changes'; emit('tab', 'changes') }
  await nextTick()
  sectionizeAll()
  if (always.value && !editing.value) startEdit()
  if (bodyEl.value) {
    bodyEl.value.scrollTop = keepScroll ? top : 0
    if (!keepScroll && props.target.decision) {
      const el = [...bodyEl.value.querySelectorAll('td:first-child')].find(td => td.textContent.trim() === props.target.decision)
      if (el) {
        for (let d = el.closest('details'); d; d = d.parentElement.closest('details')) d.open = true
        el.closest('tr').classList.add('hl'); el.scrollIntoView({ block: 'center' })
      }
    }
    // Plugin 2/3 + 2.5: deep-link via #id in the URL. Auto-switches to the Changes tab
    // when the hash lives in the 'record' (Everything) part of an In-force file.
    if (!keepScroll) await scrollToHash()
  }
}

// Plugin 2/3: #fragment deep links. Opens any collapsed <details> ancestor so the
// target heading and its content are visible, then scrolls + highlights.
// Plugin 2.5: when the target is in the 'record' (Everything) part of an In-force
// file (v-show="curTab === 'changes'" hides it on the Content tab), switches the tab
// first so the scroll lands somewhere visible.
async function scrollToHash() {
  if (!bodyEl.value) return
  const raw = (location.hash || '').slice(1)
  if (!raw) return
  const h = (() => { try { return decodeURIComponent(raw) } catch { return raw } })()
  // Tab auto-switch: if the hash target only exists inside the record, go to Changes
  if (parts.value.record && restEl.value && curTab.value !== 'changes') {
    let inRec
    try { inRec = restEl.value.querySelector('#' + CSS.escape(h)) } catch {}
    if (inRec) {
      tab.value = 'changes'
      emit('tab', 'changes')
      await nextTick()
      sectionize(restEl.value, false)
    }
  }
  let el
  try { el = bodyEl.value.querySelector('#' + CSS.escape(h)) } catch { return }
  if (!el) return
  let d = el.closest('details')
  while (d) { d.open = true; d = d.parentElement && d.parentElement.closest('details') }
  el.classList.add('hl')
  el.scrollIntoView({ block: 'start' })
}
const _onHashChange = () => { scrollToHash() }
window.addEventListener('hashchange', _onHashChange)
onBeforeUnmount(() => window.removeEventListener('hashchange', _onHashChange))

watch(() => props.target, async (t, old) => {
  if (inline.value) await saveNow(true) // the note being left is saved first
  editing.value = false; saveMsg.value = ''
  if (!old || old.path !== t.path) tab.value = t.tab || 'content'
  if (old && old.path !== t.path && !t.fromHistory) history.value.push(old)
  load()
}, { immediate: true })

// live: reload when this file changes
watch(() => props.freshAt, () => {
  if (!(props.fresh && props.fresh.has(props.target.path))) return
  if (inline.value) mergeExternal()
  else if (editing.value) changedUnder.value = true
  else load(true)
})

function onClick(e) {
  const a = e.target.closest('a[data-path]')
  if (a) { e.preventDefault(); emit('open', { path: a.dataset.path }) }
}
function back() {
  const prev = history.value.pop()
  if (prev) emit('open', { ...prev, fromHistory: true })
}
function step(d) {
  const g = group.value
  const i = groupIndex.value + d
  if (g && i >= 0 && i < g.length) emit('open', { path: g[i], group: g })
}
// Header (Adal, 8/11): title on top, then the breadcrumb, then the chips. The note's first H1 and its
// navigation blockquote are lifted out of the body into the header.
const parts = computed(() => {
  const n = note.value
  if (!n || !n.html) return { title: n ? n.title : '', id: '', crumbs: '', body: n ? n.html || '' : '' }
  const doc = new DOMParser().parseFromString('<div id="r">' + n.html + '</div>', 'text/html')
  const r = doc.getElementById('r')
  let crumbs = ''
  const first = r.firstElementChild
  if (first && first.tagName === 'BLOCKQUOTE') { crumbs = first.innerHTML; first.remove() }
  let title = n.title || ''
  const h1 = r.querySelector(':scope > h1')
  if (h1 && r.querySelectorAll(':scope > h1').length === 1) { title = h1.textContent.trim(); h1.remove() }
  const m = title.match(/^([A-Z]\d+):\s*(.+)$/)
  // lead = what comes before the first H2 (the note's description); rest = its sections (Log…)
  const lead = document.createElement('div'), rest = document.createElement('div')
  let inRest = false
  for (const node of [...r.childNodes]) { if (node.nodeType === 1 && node.tagName === 'H2') inRest = true; (inRest ? rest : lead).appendChild(node.cloneNode(true)) }
  // D253: files with an "In force" section (decisions, preferences, voice…): Content = intro + In force; the rest = full record
  let summary = '', record = ''
  const h2s = [...r.children].filter(e => e.tagName === 'H2')
  const inForce = h2s.find(h => /^In force/i.test(h.textContent.trim()))
  if (inForce) {
    const sum = document.createElement('div'), rec = document.createElement('div')
    let part = 'intro'
    for (const node of [...r.childNodes]) {
      if (node.nodeType === 1 && node.tagName === 'H2') part = node === inForce ? 'force' : 'record'
      ;(part === 'record' ? rec : sum).appendChild(node.cloneNode(true))
    }
    summary = sum.innerHTML; record = rec.innerHTML
  }
  // links to Obsidian board views (.base) become plain text
  for (const a of r.querySelectorAll('a[data-base]')) a.replaceWith(doc.createTextNode(a.textContent))
  return { title: m ? m[2] : title, id: m ? m[1] : '', crumbs, body: r.innerHTML, lead: lead.innerHTML.trim(), rest: rest.innerHTML, summary, record }
})
const headTitle = computed(() => note.value && !note.value.error ? (note.value.ext === '.md' ? parts.value.title : note.value.title) : '')
// D249: notes in ideas/ (idea · task · routine) show their settings by type
// D252: three tabs for ideas, tasks and routines: Content · Settings · Changes (remembered)
// every markdown note gets the tabs (Adal, 8/11: the Feed opens notes the same way)
const tabbed = computed(() => note.value && note.value.ext === '.md' && (!editing.value || always.value))
const tabLabel = t => t[0] === 'settings' && !isIdeaNote.value ? 'Details' : parts.value.record && t[0] === 'content' ? 'Summary' : parts.value.record && t[0] === 'changes' ? 'Everything' : t[1]
const hasDetails = computed(() => isIdeaNote.value || chips.value.length > 0 || !!liveLink.value)
const TABS_ALL = [['content', 'Content'], ['settings', 'Settings'], ['changes', 'Changes']]
const TABS = computed(() => TABS_ALL.filter(t => t[0] !== 'settings' || hasDetails.value))
// the remembered tab, unless this note has no settings (then Content)
const curTab = computed(() => tab.value === 'settings' && !hasDetails.value ? 'content' : tab.value)
// every change recorded about this note, in plain words, newest first; the same change in a row is counted, not repeated
const changes = computed(() => {
  const list = (note.value && note.value.caption && note.value.caption.recent) || []
  const out = []
  for (const e of list) {
    const a = { ...humanize(e.text), date: e.date, n: 1 }
    if (a.noop) continue
    const prev = out[out.length - 1]
    if (prev && prev.date === a.date && prev.who === a.who && prev.text === a.text) { prev.n++; continue }
    out.push(a)
  }
  return out
})
const changeDays = computed(() => {
  const g = []
  for (const a of changes.value) {
    const day = when(a.date)
    if (!g.length || g[g.length - 1].day !== day) g.push({ day, items: [] })
    g[g.length - 1].items.push(a)
  }
  return g
})
const isIdeaNote = computed(() => note.value && /^ideas\/[^/]+\.md$/.test(note.value.path) && note.value.frontmatter && note.value.frontmatter.type)
const updated = computed(() => note.value && note.value.mtime
  ? new Date(note.value.mtime).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')
</script>

<template>
  <aside class="viewer" @click="onClick">
    <div class="v-head">
      <button v-if="history.length" class="icon" title="Back" @click="back">←</button>
      <div class="vh-title" :title="target.path">{{ headTitle }}</div>
      <div id="vh-actions" class="vh-actions"></div>
      <a v-if="liveLink" class="v-link" :href="liveLink" target="_blank" rel="noopener">Open live ↗</a>
      <button v-if="note && note.ext === '.md' && !editing" class="v-link quiet edit-btn" @click="startEdit">Edit</button>
      <button class="icon" title="Close (Esc)" @click="emit('close')">✕</button>
    </div>

    <div ref="bodyEl" class="v-body">
      <div v-if="loading" class="v-loading">Opening…</div>
      <template v-else-if="note">
        <div v-if="note.error" class="v-loading">This file isn't there anymore.</div>

        <template v-else-if="isImage || isVideo">
          <div class="v-media">
            <video v-if="isVideo" :key="note.path" :src="raw(note.path)" controls autoplay playsinline></video>
            <img v-else :src="raw(note.path)" :alt="note.title" />
          </div>
          <div class="v-media-foot">
            <span>{{ note.title }}</span>
            <span v-if="group" class="stepper">
              <button class="icon" :disabled="groupIndex <= 0" @click="step(-1)">‹</button>
              {{ groupIndex + 1 }} / {{ group.length }}
              <button class="icon" :disabled="groupIndex >= group.length - 1" @click="step(1)">›</button>
            </span>
          </div>
          <p v-if="note.caption" class="caption" title="The latest line about this file in logs/CHANGELOG.md"><span>Last change · {{ note.caption.date }}</span>{{ note.caption.text }}</p>
        </template>

        <template v-else>
          <template v-if="tabbed">
            <nav class="v-tabs">
              <button v-for="t in TABS" :key="t[0]" :class="{ on: curTab === t[0] }" @click="setTab(t[0])">{{ tabLabel(t) }}<small v-if="t[0] === 'changes' && !parts.record && changes.length">{{ changes.length }}</small></button>
            </nav>
            <div v-if="!isIdeaNote && curTab === 'settings'" class="np-props">
              <template v-for="c in chips" :key="c.k"><span class="np-l">{{ c.k.replace(/_/g, ' ').replace(/^./, x => x.toUpperCase()) }}</span><div class="np-v">{{ c.v }}</div></template>
              <template v-if="liveLink"><span class="np-l">Live</span><div class="np-v"><a :href="liveLink" target="_blank" rel="noopener">{{ liveLink }}</a></div></template>
              <span class="np-l">Saved</span><div class="np-v">{{ updated }}</div>
            </div>
            <NoteProps v-if="isIdeaNote" :path="note.path" :title="parts.title" :fm="note.frontmatter" :show="curTab === 'settings'" @changed="inline ? mergeExternal() : load(true)" />
            <div v-show="curTab === 'content'" v-if="isIdeaNote && parts.lead && !inline" class="np-lead"><div class="prose" v-html="parts.lead"></div></div>
            <section v-if="curTab === 'changes' && !parts.record" class="changes">
              <p v-if="!changes.length" class="ch-empty">No changes recorded yet.</p>
              <div v-for="g in changeDays" :key="g.day" class="ch-day">
                <h3>{{ g.day }}</h3>
                <div v-for="(a, i) in g.items" :key="i" class="act">
                  <span class="act-who" :class="a.who === 'You' ? 'you' : 'ai'">{{ a.who === 'You' ? 'You' : 'AI' }}</span>
                  <div class="act-body">
                    <div class="act-text"><b>{{ a.who === 'You' ? 'You' : 'Claude' }}</b> {{ a.text }}</div>
                    <div v-if="a.details.length" class="act-details">
                      <span v-for="d in a.details" :key="d.label" class="act-d"><em>{{ d.label }}</em><s v-if="d.from !== '—'">{{ d.from }}</s><span class="arrow">→</span><b>{{ d.to }}</b></span>
                    </div>
                  </div>
                  <span v-if="a.n > 1" class="act-n" title="Same change, several times">×{{ a.n }}</span>
                </div>
              </div>
            </section>
          </template>
          <div v-if="editing && !always" class="v-chips">
            <span v-for="c in chips" :key="c.k" class="fm"><b>{{ c.k }}</b> {{ c.v }}</span>
            <span class="fm quiet">saved {{ updated }}</span>
            <span v-if="sectionCount > 1 && !editing" class="sec-tools">
              <button class="fm quiet" @click="setAll(true)">Open all</button>
              <button class="fm quiet" @click="setAll(false)">Close all</button>
            </span>
          </div>
          <div v-if="editing" v-show="!inline || curTab === 'content'" class="editor" :class="{ 'always-on': inline }">
            <p v-if="changedUnder && !inline" class="warn">This note changed on disk while you were editing (Claude or Sync). Saving now would overwrite that change, so the app will refuse. Copy your text first.</p>
            <LiveEditor v-model="draft" :path="editPath" @save="save" @open-link="p => emit('open', { path: p })" />
            <div v-if="inline" class="editor-foot" :class="syncState">
              <span>{{ syncText }}</span>
              <template v-if="changedUnder">
                <button class="pill-btn ghost" @click="takeTheirs">Take the disk version</button>
                <button class="pill-btn yellow" @click="keepMine">Keep mine</button>
              </template>
            </div>
            <div v-else class="editor-foot">
              <span>{{ saveMsg || 'Ctrl+S saves · markup shows only on the line you are on · the changelog gets a line' }}</span>
              <button class="pill-btn ghost" @click="cancelEdit">Cancel</button>
              <button class="pill-btn yellow" @click="save">Save</button>
            </div>
          </div>
          <template v-else>
            <p v-if="saveMsg" class="saved">{{ saveMsg }}</p>
            <div v-if="curTab === 'content' && sectionCount > 1" class="sec-tools2"><button @click="setAll(true)">Open all</button><button @click="setAll(false)">Close all</button></div>
            <article v-show="!tabbed || curTab === 'content'" @dblclick="note.ext === '.md' && startEdit()" title="Double-click to edit" ref="articleEl" :key="note.path + ':' + note.mtime" class="prose" v-html="isIdeaNote ? parts.rest : (parts.summary || parts.body)"></article>
            <article v-if="parts.record" v-show="curTab === 'changes'" ref="restEl" :key="'rec:' + note.path + ':' + note.mtime" class="prose record"><p class="record-note">Everything in this file, by topic. The summary on Content is the part in force.</p><div v-html="parts.record"></div></article>
          </template>
        </template>
      </template>
    </div>
    <NoteChat v-if="note && !note.error && note.ext === '.md' && (!editing || inline)" :key="'chat:' + note.path" :path="note.path" :title="note.title" :stage="isIdeaNote && note.frontmatter.type !== 'routine' ? String(note.frontmatter.stage || 'maybe') : ''" @settled="load(true)" />
  </aside>
</template>

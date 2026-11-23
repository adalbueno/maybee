<script setup>
// Brain: every file of the project, folder by folder as cards, with search at the bottom.
// Title, path and description filter in the browser; "inside the files" asks the server.
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import logo from '../assets/logo.png'
import NoteChat from './NoteChat.vue'
const props = defineProps({ changedAt: Number, activePath: String, workspace: String })
const emit = defineEmits(['open'])

const items = ref([])
const q = ref('')
const kind = ref('all')
const inside = ref([])
const insideTotal = ref(0)
const limit = ref(80)

// The bar at the bottom is the same chat as everywhere else: typing filters the big card, Enter asks Maybee,
// who answers from the project's files; the conversation opens above the bar.

// The open folder is remembered, e.g. Brain › Work › linkedin-posts.
const store = (k, v) => { try { v === undefined ? null : localStorage.setItem(k, v) } catch {} }
const recall = (k, d) => { try { return localStorage.getItem(k) ?? d } catch { return d } }
const trail = ref(JSON.parse(recall('maybee.vault.trail', '[]') || '[]')) // open folders, e.g. ['outputs', 'outputs/linkedin-posts']
watch(trail, v => store('maybee.vault.trail', JSON.stringify(v)), { deep: true })
// The files that define the project, under their own names (Project and Dashboard share a title), in this order after the folders
const DEFINES = { 'PROJECT.md': ['Project', 'What it is, for whom'], 'STATE.md': ['State', 'Where it stands now'], 'DASHBOARD.md': ['Dashboard', 'Links to everything'] }
// At the root the three files that define the project are a band on top, each showing a piece of what it says
const atRoot = computed(() => !q.value && !path.value.length)
const band = ref(null) // { project, focus, waiting, updated, links }
async function loadBand() {
  try {
    const [st, dash] = await Promise.all([fetch('/api/state').then(r => r.json()), fetch('/api/note?path=DASHBOARD.md').then(r => r.json()).catch(() => ({}))])
    const doc = new DOMParser().parseFromString(dash.html || '', 'text/html')
    const links = [...doc.querySelectorAll('a[data-path]')].map(a => ({ path: a.dataset.path, text: a.textContent.trim() })).filter(l => !DEFINES[l.path])
    band.value = { project: st.project || {}, focus: (st.focus || [])[0], waiting: (st.waiting || []).length, links }
  } catch {}
  try { const d = await fetch('/api/foundations').then(r => r.json()); missing.value = Array.isArray(d.missing) ? d.missing : [] } catch {}
}
// an older workspace without audience, offer, brand and decisions files: the Brain offers to add them (nothing that exists is touched)
const missing = ref([])
const filling = ref(false)
async function addFoundations() {
  if (filling.value) return
  filling.value = true
  try { await fetch('/api/foundations/fill', { method: 'POST' }); await load(); await loadBand(); say('Added the missing files') } finally { filling.value = false }
}
onMounted(loadBand)
const showBand = computed(() => atRoot.value && current.value.files.some(f => DEFINES[f.path]))
const gridFiles = computed(() => q.value ? matches.value.slice(0, limit.value) : atRoot.value ? current.value.files.filter(f => !DEFINES[f.path]) : current.value.files)
// one line of what each one says: the project's goal, the current focus, and what the dashboard links to
const bandCards = computed(() => band.value ? [
  { path: 'PROJECT.md', name: 'Project', line: band.value.project.goal || band.value.project.summary || 'What it is, for whom' },
  { path: 'STATE.md', name: 'State', line: band.value.focus ? band.value.focus.title : 'Where it stands now', badge: band.value.waiting },
  { path: 'DASHBOARD.md', name: 'Dashboard', line: band.value.links.length ? band.value.links.map(l => l.text).join(' · ') : 'Links to everything' },
] : [])
const timeOf = p => (items.value.find(i => i.path === p) || {}).time
const rootRank = p => { const i = Object.keys(DEFINES).indexOf(p); return i < 0 ? 99 : i }
const NAMES = { ideas: 'Cards', outputs: 'Work', knowledge: 'Knowledge', decisions: 'Decisions', logs: 'Logs', people: 'People', owner: 'Owner' }
function folderOf(dir) {
  const pre = dir ? dir + '/' : ''
  const dirs = new Map(), files = []
  for (const it of items.value) {
    if (!it.path.startsWith(pre)) continue
    const rest = it.path.slice(pre.length)
    const i = rest.indexOf('/')
    if (i < 0) files.push(it)
    else {
      const name = rest.slice(0, i)
      const d = dirs.get(name) || { name, path: pre + name, count: 0, time: 0, peek: [] }
      d.count++; d.time = Math.max(d.time, it.time)
      if (d.peek.length < 3) d.peek.push(it.title)
      dirs.set(name, d)
    }
  }
  files.sort((a, b) => (a.date && b.date ? a.date.localeCompare(b.date) : 0) || b.time - a.time)
  if (!dir) files.sort((a, b) => rootRank(a.path) - rootRank(b.path))
  return { dirs: [...dirs.values()].sort((a, b) => b.count - a.count), files }
}
// the root is the workspace itself, under its own name
const home = computed(() => props.workspace || 'Brain')
// the open folder (the big card) and the closed columns on its left: Home, then each folder on the way
const path = computed(() => {
  const ok = []
  for (const d of trail.value) { const f = folderOf(d); if (!f.dirs.length && !f.files.length) break; ok.push(d) }
  return ok
})
const current = computed(() => { const dir = path.value[path.value.length - 1] || ''; return { dir, name: dir ? label(dir) : home.value, ...folderOf(dir) } })
const tabs = computed(() => {
  const count = d => { const f = folderOf(d); return f.dirs.reduce((n, x) => n + x.count, 0) + f.files.length }
  // every level is a column, like the board's: the open folder is the last one, the others are closed tabs
  return [{ dir: '', name: home.value, level: 0, count: items.value.length, here: !path.value.length }]
    .concat(path.value.map((d, i) => ({ dir: d, name: label(d), level: i + 1, count: count(d), here: i === path.value.length - 1 })))
})
// the columns slide like the board's once you move (not on the first paint)
const slid = ref(false)
function openDir(p) { slid.value = true; trail.value = path.value.concat(p) }
function goTo(level) { if (level < path.value.length) slid.value = true; trail.value = path.value.slice(0, level) }
const crumbs = computed(() => path.value.map(label))
const label = d => (!d.includes('/') && NAMES[d]) || d.split('/').pop()
// a short status (draft, scheduled, done), not a sentence
const shortStatus = f => f.status && String(f.status).length <= 14 ? f.status : null
// a file's icon: what kind of note it is, in the board's colours for cards
const ICONS = { Idea: ['💡', '#c9c4b6'], Task: ['✓', '#4a7dff'], Routine: ['↻', '#a56bdb'], Decision: ['⚖', '#2f9e5b'], Knowledge: ['✦', '#a56bdb'], Log: ['≡', '#9a968c'], Project: ['◆', '#f2b705'], Member: ['☺', '#4a7dff'], Owner: ['☺', '#4a7dff'] }
const iconOf = f => { const [t, c] = ICONS[f.kind] || ['¶', '#9a968c']; return { t, c } }
// a video's length, read from the file itself once it loads
const lengths = ref({})
const mmss = t => Math.floor(t / 60) + ':' + String(Math.round(t % 60)).padStart(2, '0')
const day = d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

async function load() { items.value = (await fetch('/api/library').then(r => r.json())).items }
onMounted(load)
let t = null
watch(() => props.changedAt, () => { clearTimeout(t); t = setTimeout(() => { load(); loadBand() }, 400) })

// Moving, renaming and deleting. Drag a file or folder onto a folder card, or onto a column on the left to go up.
// The server fixes every link to what moved (lib/files.js); a delete goes to .trash/ and can be undone.
const FIXED = new Set(['STATE.md', 'PROJECT.md', 'DASHBOARD.md', 'README.md', 'AGENTS.md', 'CLAUDE.md'])
const dirOf = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''
const baseOf = p => p.slice(p.lastIndexOf('/') + 1)
const isCard = p => /^ideas\/[^/]+\.md$/.test(p)
const locked = (p, isDir) => p === 'logs' || p.startsWith('logs/') || (isDir ? !p.includes('/') && !!NAMES[p] : FIXED.has(p))
const drag = ref(null) // { path, isDir }
const dropOn = ref(null) // the folder under the pointer ('' = the project's root)
function canDrop(dir) {
  const d = drag.value
  if (!d || dir === dirOf(d.path) || dir === 'logs' || dir.startsWith('logs/') || dir.startsWith('ideas/')) return false
  if (d.isDir && (dir === d.path || dir.startsWith(d.path + '/'))) return false
  if (isCard(d.path)) return false // a card stays in ideas/
  if (dir === 'ideas') return !d.isDir && d.path.endsWith('.md')
  return true
}
function onDragStart(e, p, isDir) {
  if (locked(p, isDir) || isCard(p)) { e.preventDefault(); say(isCard(p) ? 'A card stays in ideas/, or it leaves the board.' : 'This one stays where it is: Maybee reads it there.'); return }
  drag.value = { path: p, isDir }
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', p)
}
function onDragOver(e, dir) { if (canDrop(dir)) { e.preventDefault(); dropOn.value = dir } }
function onDragLeave(dir) { if (dropOn.value === dir) dropOn.value = null }
function onDragEnd() { drag.value = null; dropOn.value = null }
async function onDrop(e, dir) {
  e.preventDefault()
  const d = drag.value, ok = canDrop(dir)
  onDragEnd()
  if (!d || !ok) return
  const r = await files('move', { path: d.path, dir })
  if (r) moved(r, `Moved to ${dir ? label(dir) : home.value}`)
}

const toast = ref(null) // { text, undo? }
let toastTimer = null
function say(text, undo = null) { toast.value = { text, undo }; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.value = null }, undo ? 7000 : 4500) }
async function files(op, body) {
  const r = await fetch('/api/files/' + op, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(x => x.json()).catch(() => ({ error: 'The app did not answer.' }))
  if (r.error) { say(r.error); return null }
  await load()
  return r
}
// after a move or a rename: the open folders and the open note follow it
function moved(r, what) {
  const map = p => p === r.from ? r.to : p.startsWith(r.from + '/') ? r.to + p.slice(r.from.length) : p
  trail.value = trail.value.map(map)
  if (props.activePath && map(props.activePath) !== props.activePath) emit('open', { path: map(props.activePath) })
  const n = r.updated.length
  say(what + (n ? ` · links fixed in ${n} ${n === 1 ? 'note' : 'notes'}` : '') + (r.mentions?.length ? ` · still named in ${r.mentions.join(', ')}` : ''))
}

const menuFor = ref(null)
const renaming = ref(null)
const renameText = ref('')
function closeMenu() { menuFor.value = null }
onMounted(() => document.addEventListener('click', closeMenu))
onBeforeUnmount(() => document.removeEventListener('click', closeMenu))
function startRename(p, isDir, name) {
  menuFor.value = null
  if (locked(p, isDir)) { say('This one keeps its name: Maybee reads it there.'); return }
  renaming.value = p
  renameText.value = name
  nextTick(() => { const el = document.querySelector('.vren'); el?.focus(); el?.select() })
}
async function saveRename() {
  const p = renaming.value, name = renameText.value.trim()
  renaming.value = null
  if (!p || !name) return
  const r = await files('rename', { path: p, name })
  if (r && r.from !== r.to) moved(r, 'Renamed to ' + baseOf(r.to))
}
async function remove(p, isDir) {
  menuFor.value = null
  if (locked(p, isDir)) { say('This one stays: Maybee reads it there.'); return }
  const r = await files('delete', { path: p })
  if (r) say(`Deleted ${baseOf(p)}`, async () => { toast.value = null; if (await files('restore', { trash: r.trash, path: r.from })) say('Put back ' + baseOf(r.from)) })
}
// what the rename field starts with: a card's title, otherwise the file's name without its extension
const nameOf = f => isCard(f.path) ? f.title : baseOf(f.path).replace(/\.[^.]+$/, '')

// the kinds, most files first; the archive always last
const kinds = computed(() => {
  const c = new Map()
  for (const it of items.value) c.set(it.kind, (c.get(it.kind) || 0) + 1)
  return [...c.entries()].sort((a, b) => (a[0] === 'Archive') - (b[0] === 'Archive') || b[1] - a[1]).map(([k, n]) => ({ k, n }))
})

const norm = s => String(s || '').toLowerCase()
const matches = computed(() => {
  const words = norm(q.value).split(/\s+/).filter(Boolean)
  return items.value.filter(it => (kind.value === 'all' || it.kind === kind.value)
    && words.every(w => norm(it.title + ' ' + it.path + ' ' + (it.desc || '')).includes(w)))
})
watch([q, kind], () => { limit.value = 80 })
// folders whose name or path matches the words, anywhere in the brain (Work matches "work" as well as "outputs")
const qDirs = computed(() => {
  const words = norm(q.value).split(/\s+/).filter(Boolean)
  if (!words.length || kind.value !== 'all') return []
  const all = new Set()
  for (const it of items.value) { const parts = it.path.split('/').slice(0, -1); for (let i = 1; i <= parts.length; i++) all.add(parts.slice(0, i).join('/')) }
  const out = []
  for (const d of all) {
    if (!words.every(w => norm(d + ' ' + label(d)).includes(w))) continue
    const parent = d.includes('/') ? d.slice(0, d.lastIndexOf('/')) : ''
    const f = folderOf(parent).dirs.find(x => x.path === d)
    if (f) out.push(f)
  }
  return out.sort((a, b) => b.count - a.count)
})
// opening a folder from the search: go there, with the folders on the way as closed columns
function openFound(d) {
  const parts = d.path.split('/')
  trail.value = parts.map((_, i) => parts.slice(0, i + 1).join('/'))
  q.value = ''
}
// the chips while searching: how many of each kind match the words
const qKinds = computed(() => {
  const words = norm(q.value).split(/\s+/).filter(Boolean)
  const hit = items.value.filter(it => words.every(w => norm(it.title + ' ' + it.path + ' ' + (it.desc || '')).includes(w)))
  const c = new Map()
  for (const it of hit) c.set(it.kind, (c.get(it.kind) || 0) + 1)
  return { all: hit.length, kinds: [...c.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, n })) }
})

let st = null
watch(q, v => {
  clearTimeout(st)
  if (v.trim().length < 3) { inside.value = []; insideTotal.value = 0; return }
  st = setTimeout(async () => {
    const r = await fetch('/api/search?q=' + encodeURIComponent(v.trim())).then(r => r.json())
    const shown = new Set(matches.value.map(m => m.path))
    inside.value = r.items.filter(i => !shown.has(i.path) && (kind.value === 'all' || (items.value.find(x => x.path === i.path) || {}).kind === kind.value)).slice(0, 40)
    insideTotal.value = r.total
  }, 250)
})

const raw = p => '/raw?path=' + encodeURIComponent(p)
function ago(ms) {
  const d = Math.round((Date.now() - ms) / 86400000)
  if (d <= 0) return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (d === 1) return 'yesterday'
  if (d < 7) return d + ' days ago'
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
const folder = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '·'
const titleOf = p => (items.value.find(x => x.path === p) || { title: p.split('/').pop() }).title
</script>

<template>
  <div class="vault-shell">
    <!-- Folders: the open folder is one big card of cards; the folders above it close into columns on the left, like the board's -->
    <div class="vbrowse">
      <div v-for="t in tabs" :key="t.dir || 'home'" class="vcol" :class="{ open: t.here, slid }">
      <button class="vtab" :class="{ home: !t.dir, here: t.here, drop: dropOn === t.dir && drag }" :title="t.here ? t.name : 'Back to ' + t.name" :tabindex="t.here ? -1 : 0" @click="goTo(t.level)"
        @dragover="onDragOver($event, t.dir)" @dragleave="onDragLeave(t.dir)" @drop="onDrop($event, t.dir)">
        <img v-if="!t.dir" :src="logo" class="vlogo" alt="" />
        <span v-else class="vfold"></span>
        <span v-if="t.dir" class="v">{{ t.name }}</span>
        <small>{{ t.count }}</small>
      </button>
      <section v-if="t.here" class="vbig">
        <header v-if="q" class="vbig-head search">
          <h3>Search</h3>
          <small>{{ qDirs.length ? qDirs.length + (qDirs.length === 1 ? ' folder · ' : ' folders · ') : '' }}{{ matches.length }} {{ matches.length === 1 ? 'file' : 'files' }}</small>
          <div class="vchips">
            <button :class="{ on: kind === 'all' }" @click="kind = 'all'">All<small>{{ qKinds.all }}</small></button>
            <button v-for="k in qKinds.kinds" :key="k.k" :class="{ on: kind === k.k }" @click="kind = k.k">{{ k.k }}<small>{{ k.n }}</small></button>
          </div>
        </header>
        <header v-else class="vbig-head">
          <h3>{{ current.name }}</h3>
          <small>{{ current.dirs.length ? current.dirs.length + (current.dirs.length === 1 ? ' folder' : ' folders') + ' · ' : '' }}{{ current.files.length }} {{ current.files.length === 1 ? 'file' : 'files' }}</small>
        </header>
        <p v-if="atRoot && missing.length" class="vmissing">This workspace is missing {{ missing.length }} {{ missing.length === 1 ? 'file' : 'files' }} for your audience, offer, brand and decisions.<button :disabled="filling" @click="addFoundations">{{ filling ? 'Adding…' : 'Add them' }}</button></p>
        <section v-if="showBand && band" class="vband">
          <div v-for="c in bandCards" :key="c.path" class="vbcard" role="button" tabindex="0" :class="{ sel: activePath === c.path }" @click="emit('open', { path: c.path })" @keydown.enter.self="emit('open', { path: c.path })">
            <span class="vicon" style="--c: #f2b705">◆</span>
            <span class="vb-text"><b>{{ c.name }}</b><span class="vb-line">{{ c.line }}</span></span>
            <em v-if="c.badge" class="vb-wait" :title="c.badge + ' waiting for your OK'">{{ c.badge }}</em>
          </div>
        </section>
        <div class="vgrid">
          <div v-for="d in (q ? qDirs : current.dirs)" :key="d.path" class="vcard folder" role="button" tabindex="0" :class="{ drop: dropOn === d.path && drag, dragging: drag && drag.path === d.path }" :title="d.path"
            :draggable="renaming !== d.path" @dragstart="onDragStart($event, d.path, true)" @dragend="onDragEnd" @dragover="onDragOver($event, d.path)" @dragleave="onDragLeave(d.path)" @drop="onDrop($event, d.path)"
            @click="renaming !== d.path && (q ? openFound(d) : openDir(d.path))" @keydown.enter.self="q ? openFound(d) : openDir(d.path)">
            <span class="vtabmark"></span>
            <template v-if="!locked(d.path, true)">
              <span class="vmore" role="button" title="Rename or delete" @click.stop="menuFor = menuFor === d.path ? null : d.path">⋯</span>
              <span v-if="menuFor === d.path" class="vmenu" @click.stop>
                <span role="button" @click.stop="startRename(d.path, true, baseOf(d.path))">Rename</span>
                <span role="button" class="danger" @click.stop="remove(d.path, true)">Delete</span>
              </span>
            </template>
            <input v-if="renaming === d.path" v-model="renameText" class="vren" @click.stop @keydown.enter.prevent="saveRename" @keydown.esc.stop="renaming = null" @blur="saveRename" />
            <b v-else>{{ label(d.path) }}</b>
            <span v-if="q && d.path.includes('/')" class="vwhere">in {{ d.path.split('/').slice(0, -1).map(label).join(' › ') }}</span>
            <span class="vmeta">{{ d.count }} {{ d.count === 1 ? 'file' : 'files' }}</span>
            <span class="vpeek"><span v-for="n in d.peek" :key="n">{{ n }}</span></span>
          </div>
          <div v-for="f in gridFiles" :key="f.path" class="vcard vfile" role="button" tabindex="0" :class="{ sel: activePath === f.path, vmed: f.media, dragging: drag && drag.path === f.path }" :title="f.path"
            :draggable="renaming !== f.path" @dragstart="onDragStart($event, f.path, false)" @dragend="onDragEnd"
            @click="renaming !== f.path && emit('open', { path: f.path })" @keydown.enter.self="emit('open', { path: f.path })">
            <template v-if="!locked(f.path, false)">
              <span class="vmore" role="button" title="Rename or delete" @click.stop="menuFor = menuFor === f.path ? null : f.path">⋯</span>
              <span v-if="menuFor === f.path" class="vmenu" @click.stop>
                <span role="button" @click.stop="startRename(f.path, false, nameOf(f))">Rename</span>
                <span role="button" class="danger" @click.stop="remove(f.path, false)">Delete</span>
              </span>
            </template>
            <span v-if="f.media" class="vmedia">
              <img v-if="f.media === 'image'" :src="raw(f.path)" loading="lazy" alt="" />
              <video v-else :src="raw(f.path) + '#t=0.5'" preload="metadata" muted @loadedmetadata="e => lengths[f.path] = e.target.duration"></video>
              <template v-if="f.media === 'video'">
                <i class="vplay"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg></i>
                <em v-if="lengths[f.path]" class="vlen">{{ mmss(lengths[f.path]) }}</em>
              </template>
            </span>
            <span v-else class="vicon" :style="{ '--c': iconOf(f).c }">{{ iconOf(f).t }}</span>
            <input v-if="renaming === f.path" v-model="renameText" class="vren" @click.stop @keydown.enter.prevent="saveRename" @keydown.esc.stop="renaming = null" @blur="saveRename" />
            <b v-else>{{ DEFINES[f.path] ? DEFINES[f.path][0] : f.title }}</b>
            <span v-if="DEFINES[f.path]" class="vdef">{{ DEFINES[f.path][1] }}</span>
            <span class="vmeta">
              <template v-if="f.date">{{ day(f.date) }}</template><template v-else>{{ ago(f.time) }}</template>
              <span v-if="shortStatus(f)" class="vst" :class="'s-' + f.status">{{ f.status }}</span>
            </span>
          </div>
          <p v-if="q ? !matches.length && !inside.length && !qDirs.length : !current.dirs.length && !current.files.length" class="end">{{ q ? 'Nothing matches.' : 'This folder is empty.' }}</p>
        </div>
        <button v-if="q && matches.length > limit" class="more-btn" @click="limit += 120">Show more ({{ matches.length - limit }} left)</button>
        <template v-if="q && inside.length">
          <header class="vbig-head inside"><h3>Inside the notes</h3><small>{{ insideTotal }} {{ insideTotal === 1 ? 'note mentions' : 'notes mention' }} “{{ q.trim() }}”</small></header>
          <div class="vgrid">
            <button v-for="h in inside" :key="h.path" class="vcard vfile" :class="{ sel: activePath === h.path }" :title="h.path" @click="emit('open', { path: h.path })">
              <span class="vicon" style="--c: #9a968c">{{ h.hits }}</span>
              <b>{{ titleOf(h.path) }}</b>
              <span class="vsnip">{{ h.snippet }}</span>
            </button>
          </div>
        </template>
      </section>
      </div>
    </div>

    <div v-if="toast" class="vtoast">{{ toast.text }}<button v-if="toast.undo" @click="toast.undo()">Undo</button></div>
    <!-- the same chat bar as the board's and About's: it filters as you type, and Enter asks Maybee -->
    <NoteChat path="@brain" title="Brain" inline link-files :quick="false" heading="Ask the brain"
      placeholder="Search the brain, ask it something, or tell it what to change…"
      empty="Nothing asked yet. Type to search the files. Press Enter to ask Maybee, who answers from them, or to change what the project knows (its goal, audience, voice, a decision)."
      @typing="t => q = t" @open="p => emit('open', { path: p })" />
  </div>
</template>

<style scoped>
 /* laid out like the board: the big card fills the page, the bar sits under it */
/* the files that define the project, under their own names (Project and Dashboard share a title) */
.vmissing { display: flex; align-items: center; gap: 12px; margin: 0 0 14px; padding: 10px 12px 10px 16px; border-radius: 14px; background: var(--card-hi); font-size: 13.5px; color: var(--ink-2); }
.vmissing button { margin-left: auto; flex: none; border: 0; border-radius: 99px; padding: 6px 14px; background: var(--ink); color: #fff; font: 600 12.5px var(--sans); cursor: pointer; }
.vband { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 22px; }
@media (max-width: 900px) { .vband { grid-template-columns: 1fr; } }
.vbcard { display: flex; align-items: center; gap: 12px; min-width: 0; padding: 14px 16px; background: var(--card-hi); border-radius: 18px; cursor: pointer; box-shadow: 0 1px 2px rgba(0, 0, 0, .04); transition: box-shadow .15s, transform .15s; }
.vbcard:hover { box-shadow: 0 8px 24px rgba(0, 0, 0, .09); transform: translateY(-2px); }
.vbcard.sel { box-shadow: 0 0 0 2px var(--ink); }
.vbcard .vicon { flex: none; }
.vb-text { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.vb-text b { font-size: 14.5px; letter-spacing: -.01em; }
.vb-line { font-size: 12.5px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vb-wait { flex: none; display: grid; place-items: center; min-width: 22px; height: 22px; padding: 0 7px; border-radius: 99px; background: var(--accent); font: 700 12px var(--sans); font-style: normal; color: var(--ink); }
.vdef { font-size: 12.5px; line-height: 1.35; color: var(--ink-2); }
.vault-shell { position: relative; display: flex; flex-direction: column; gap: 10px; height: 100%; }
/* moving and renaming */
.vcard.dragging { opacity: .45; }
.vcard.drop, .vtab.drop { box-shadow: 0 0 0 3px var(--accent), 0 10px 28px rgba(0, 0, 0, .1); transform: translateY(-2px); }
.vtab.drop { background: var(--accent-soft); }
.vmore { position: absolute; top: 10px; right: 10px; z-index: 2; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; font-size: 16px; font-weight: 700; line-height: 1; color: var(--ink-2); background: color-mix(in srgb, var(--card-hi) 88%, transparent); box-shadow: 0 1px 3px rgba(0, 0, 0, .12); opacity: 0; transition: opacity .12s; cursor: pointer; }
.vcard:hover .vmore, .vcard:focus-within .vmore { opacity: 1; }
.vmore:hover { color: var(--ink); background: var(--card-hi); }
.vmenu { position: absolute; top: 42px; right: 10px; z-index: 3; display: flex; flex-direction: column; min-width: 120px; padding: 5px; background: var(--card-hi); border-radius: 12px; box-shadow: 0 10px 30px rgba(20, 15, 5, .18), 0 0 0 1px color-mix(in srgb, var(--ink) 10%, transparent); }
.vmenu span { padding: 8px 10px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.vmenu span:hover { background: var(--card); }
.vmenu .danger { color: #c0392b; }
.vren { width: 100%; font: 700 14.5px/1.3 var(--sans); letter-spacing: -.01em; color: var(--ink); background: var(--card); border: 0; border-radius: 8px; padding: 5px 8px; outline: 2px solid var(--accent); }
.vtoast { position: absolute; left: 50%; bottom: 66px; transform: translateX(-50%); z-index: 30; display: flex; align-items: center; gap: 14px; max-width: min(720px, 92%); padding: 10px 12px 10px 18px; border-radius: 14px; background: var(--dark); color: #fff; font-size: 13.5px; font-weight: 600; box-shadow: 0 12px 30px rgba(0, 0, 0, .25); }
.vtoast button { flex: none; border: 0; border-radius: 99px; padding: 6px 12px; background: var(--accent); color: var(--ink); font: 700 12.5px var(--sans); cursor: pointer; }
.vbig-head.search { flex-wrap: wrap; }
.vbig-head.inside { margin-top: 26px; }
.vchips { flex-basis: 100%; display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.vchips button { font: inherit; font-size: 12.5px; font-weight: 600; color: var(--ink-2); background: var(--card-hi); border: 0; border-radius: 999px; padding: 6px 12px; cursor: pointer; }
.vchips button small { margin-left: 6px; color: var(--ink-3); }
.vchips button.on { background: var(--accent); color: var(--accent-ink); }
.vsnip { font-size: 12.5px; color: var(--ink-2); line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.vbrowse { flex: 1; min-height: 0; display: flex; gap: 10px; align-items: stretch; }
/* the folders on the way, closed like the board's columns */
/* every level is a column, like the board's and the Inbox's: the open one grows (flex 1 1 0%, which animates), the others
   are 56px tabs; the open column's tab stays on the left while it opens, then fades as its cards come in */
.vcol { position: relative; flex: 0 0 56px; min-width: 0; display: flex; border-radius: 26px; overflow: hidden; background: color-mix(in srgb, var(--card), #fff 30%); transition: flex .15s cubic-bezier(.3, 1.35, .5, 1), background .15s; }
.vcol.open { flex: 1 1 0%; background: var(--card); border-radius: 28px; }
.vcol.open > .vtab { position: absolute; left: 0; top: 0; bottom: 0; opacity: 0; pointer-events: none; }
.vcol.slid.open > .vtab { transition: opacity .08s ease .07s; }
@keyframes vcol-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.vcol.slid.open > .vbig { animation: vcol-in .09s ease .07s both; }
@media (prefers-reduced-motion: reduce) { .vcol { transition: none; } .vcol.slid.open > .vbig { animation: none; } }
.vcol > .vtab { background: transparent; border-radius: 0; }
.vtab { flex: none; width: 56px; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 20px 0; border: 0; border-radius: 26px; background: color-mix(in srgb, var(--card), #fff 30%); cursor: pointer; font: inherit; color: var(--ink); transition: background .12s; }
.vtab:hover { background: var(--card); }
.vtab.here { cursor: default; }
.vtab .v { writing-mode: vertical-rl; font-weight: 700; font-size: 14px; letter-spacing: -.01em; }
.vtab small { font-size: 12px; font-weight: 600; color: var(--ink-3); }
.vlogo { width: 18px; height: 18px; object-fit: contain; }
.vfold { width: 16px; height: 12px; border-radius: 3px; background: var(--accent); }
/* the open folder: one big card of cards */
.vbig { flex: 1; min-width: 0; overflow-y: auto; border-radius: 28px; padding: 20px 20px 22px; }
.vbig-head { display: flex; align-items: baseline; gap: 12px; margin: 2px 4px 16px; }
.vbig-head h3 { margin: 0; font-size: 22px; letter-spacing: -.03em; }
.vbig-head small { font-size: 13px; font-weight: 600; color: var(--ink-3); }
.vgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
.vcard { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; min-height: 150px; text-align: left; font: inherit; color: var(--ink); background: var(--card-hi); border: 0; border-radius: 18px; padding: 16px; cursor: pointer; box-shadow: 0 1px 2px rgba(0, 0, 0, .04); transition: box-shadow .15s, transform .15s; overflow: hidden; }
.vcard:hover { box-shadow: 0 8px 24px rgba(0, 0, 0, .09); transform: translateY(-2px); }
.vcard.sel { box-shadow: 0 0 0 2px var(--ink); }
.vcard b { font-size: 14.5px; line-height: 1.3; letter-spacing: -.01em; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.vmeta { margin-top: auto; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; font-weight: 600; color: var(--ink-3); }
/* a folder: the yellow tab on top, a peek at what's inside */
.vcard.folder { padding-top: 22px; background: linear-gradient(180deg, var(--card-hi) 70%, var(--accent-soft)); }
.vtabmark { position: absolute; top: 0; left: 16px; width: 54px; height: 8px; border-radius: 0 0 6px 6px; background: var(--accent); }
.vwhere { font-size: 11.5px; font-weight: 600; color: var(--ink-3); margin-top: -2px; }
.vpeek { display: flex; flex-direction: column; gap: 3px; width: 100%; }
.vpeek span { font-size: 12px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vcard.folder .vmeta { margin-top: 0; }
/* a file: an icon of its kind, or the picture itself */
.vicon { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; font-size: 16px; font-weight: 700; color: var(--c); background: color-mix(in srgb, var(--c) 14%, #fff); }
.vcard.vmed { padding: 0 0 14px; }
.vcard.vmed b, .vcard.vmed .vmeta { padding: 0 14px; }
.vmedia { position: relative; width: 100%; height: 110px; background: var(--dark); margin-bottom: 6px; }
.vmedia img, .vmedia video { width: 100%; height: 100%; object-fit: cover; display: block; }
.vplay { position: absolute; left: 50%; top: 50%; width: 42px; height: 42px; margin: -21px 0 0 -21px; border-radius: 50%; display: grid; place-items: center; background: rgba(22, 21, 19, .72); color: #fff; box-shadow: 0 2px 12px rgba(0, 0, 0, .3); backdrop-filter: blur(4px); transition: transform .15s; }
.vplay svg { width: 20px; height: 20px; margin-left: 2px; }
.vcard:hover .vplay { transform: scale(1.1); }
.vlen { position: absolute; right: 8px; bottom: 8px; font-style: normal; font-size: 11px; font-weight: 700; color: #fff; background: rgba(22, 21, 19, .78); border-radius: 6px; padding: 2px 6px; }
.vst { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 700; color: var(--ink-2); }
.vst::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--ink-3); }
.vst.s-scheduled::before { background: #4a7dff; } .vst.s-scheduled { color: #2f6fdb; }
.vst.s-published::before, .vst.s-done::before { background: var(--good); }
.vst.s-draft::before, .vst.s-approved::before { background: #f2b705; }
</style>

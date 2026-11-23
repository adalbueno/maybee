<script setup>
// Vault: every file of the project, folder by folder as cards, with search at the bottom.
// Title, path and description filter in the browser; "inside the files" asks the server.
import { ref, computed, watch, onMounted } from 'vue'
import logo from '../assets/logo.png'
const props = defineProps({ changedAt: Number, activePath: String })
const emit = defineEmits(['open'])

const items = ref([])
const q = ref('')
const kind = ref('all')
const inside = ref([])
const insideTotal = ref(0)
const limit = ref(80)

// The open folder is remembered, e.g. Vault › Work › linkedin-posts.
const store = (k, v) => { try { v === undefined ? null : localStorage.setItem(k, v) } catch {} }
const recall = (k, d) => { try { return localStorage.getItem(k) ?? d } catch { return d } }
const trail = ref(JSON.parse(recall('maybee.vault.trail', '[]') || '[]')) // open folders, e.g. ['outputs', 'outputs/linkedin-posts']
watch(trail, v => store('maybee.vault.trail', JSON.stringify(v)), { deep: true })
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
  return { dirs: [...dirs.values()].sort((a, b) => b.count - a.count), files }
}
// the open folder (the big card) and the closed columns on its left: Home, then each folder on the way
const path = computed(() => {
  const ok = []
  for (const d of trail.value) { const f = folderOf(d); if (!f.dirs.length && !f.files.length) break; ok.push(d) }
  return ok
})
const current = computed(() => { const dir = path.value[path.value.length - 1] || ''; return { dir, name: dir ? label(dir) : 'Vault', ...folderOf(dir) } })
const tabs = computed(() => {
  const count = d => { const f = folderOf(d); return f.dirs.reduce((n, x) => n + x.count, 0) + f.files.length }
  return [{ dir: '', name: 'Vault', level: 0, count: items.value.length, here: !path.value.length }]
    .concat(path.value.slice(0, -1).map((d, i) => ({ dir: d, name: label(d), level: i + 1, count: count(d) })))
})
function openDir(p) { trail.value = path.value.concat(p) }
function goTo(level) { trail.value = path.value.slice(0, level) }
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
watch(() => props.changedAt, () => { clearTimeout(t); t = setTimeout(load, 400) })

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
// folders whose name or path matches the words, anywhere in the vault (Work matches "work" as well as "outputs")
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
      <button v-for="(t, i) in tabs" :key="t.dir || 'home'" class="vtab" :class="{ home: !t.dir, here: t.here }" :title="t.here ? 'You are here' : 'Back to ' + t.name" @click="goTo(t.level)">
        <img v-if="!t.dir" :src="logo" class="vlogo" alt="" />
        <span v-else class="vfold"></span>
        <span class="v">{{ t.name }}</span>
        <small>{{ t.count }}</small>
      </button>
      <section class="vbig">
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
        <div class="vgrid">
          <button v-for="d in (q ? qDirs : current.dirs)" :key="d.path" class="vcard folder" :title="d.path" @click="q ? openFound(d) : openDir(d.path)">
            <span class="vtabmark"></span>
            <b>{{ label(d.path) }}</b>
            <span v-if="q && d.path.includes('/')" class="vwhere">in {{ d.path.split('/').slice(0, -1).map(label).join(' › ') }}</span>
            <span class="vmeta">{{ d.count }} {{ d.count === 1 ? 'file' : 'files' }}</span>
            <span class="vpeek"><span v-for="n in d.peek" :key="n">{{ n }}</span></span>
          </button>
          <button v-for="f in (q ? matches.slice(0, limit) : current.files)" :key="f.path" class="vcard vfile" :class="{ sel: activePath === f.path, vmed: f.media }" :title="f.path" @click="emit('open', { path: f.path })">
            <span v-if="f.media" class="vmedia">
              <img v-if="f.media === 'image'" :src="raw(f.path)" loading="lazy" alt="" />
              <video v-else :src="raw(f.path) + '#t=0.5'" preload="metadata" muted @loadedmetadata="e => lengths[f.path] = e.target.duration"></video>
              <template v-if="f.media === 'video'">
                <i class="vplay"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg></i>
                <em v-if="lengths[f.path]" class="vlen">{{ mmss(lengths[f.path]) }}</em>
              </template>
            </span>
            <span v-else class="vicon" :style="{ '--c': iconOf(f).c }">{{ iconOf(f).t }}</span>
            <b>{{ f.title }}</b>
            <span class="vmeta">
              <template v-if="f.date">{{ day(f.date) }}</template><template v-else>{{ ago(f.time) }}</template>
              <span v-if="shortStatus(f)" class="vst" :class="'s-' + f.status">{{ f.status }}</span>
            </span>
          </button>
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

    <!-- search sits at the bottom, the same bar as the board's chat; it filters the big card -->
    <div class="lib-dock">
      <div class="lib-bar">
        <span class="lib-mark" aria-hidden="true"><svg viewBox="0 0 20 20"><circle cx="8.5" cy="8.5" r="5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12.5 12.5l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>
        <input v-model="q" class="lib-q" placeholder="Search the vault: titles, paths and text…" @keydown.esc="q = ''" />
        <button class="lib-clear" :class="{ off: !q }" :disabled="!q" title="Clear (Esc)" @click="q = ''">Clear</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
 /* laid out like the board: the big card fills the page, the bar sits under it */
.vault-shell { display: flex; flex-direction: column; gap: 10px; height: 100%; }
.lib-dock { flex: none; height: 50px; display: flex; justify-content: center; align-items: flex-end; }
/* the same bar as the board's chat (NoteChat): width, radius, shadow, the round mark on the left, the dark pill on the right */
.lib-bar { width: min(720px, 100%); display: flex; gap: 8px; align-items: center; padding: 8px 8px 8px 10px; background: var(--card-hi); border-radius: 24px; box-shadow: 0 14px 40px rgba(20, 15, 5, .18), 0 0 0 1px color-mix(in srgb, var(--ink) 14%, transparent); }
.lib-mark { flex: none; width: 34px; height: 34px; border-radius: 50%; background: radial-gradient(circle, #f4f2ec 0%, #b3afa4 100%); display: grid; place-items: center; color: var(--ink); }
.lib-mark svg { width: 16px; height: 16px; }
.lib-q { flex: 1; min-width: 0; border: 0; background: transparent; padding: 8px 4px; font: 500 14px/1.5 var(--sans); outline: none; color: var(--ink); }
.lib-clear { flex: none; padding: 8px 16px; border: 0; border-radius: 99px; background: var(--ink); color: #fff; font: 600 13px var(--sans); cursor: pointer; }
.lib-clear.off { opacity: .4; cursor: default; }
.vbig-head.search { flex-wrap: wrap; }
.vbig-head.inside { margin-top: 26px; }
.vchips { flex-basis: 100%; display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.vchips button { font: inherit; font-size: 12.5px; font-weight: 600; color: var(--ink-2); background: var(--card-hi); border: 0; border-radius: 999px; padding: 6px 12px; cursor: pointer; }
.vchips button small { margin-left: 6px; color: var(--ink-3); }
.vchips button.on { background: var(--accent); color: var(--accent-ink); }
.vsnip { font-size: 12.5px; color: var(--ink-2); line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.vbrowse { flex: 1; min-height: 0; display: flex; gap: 10px; align-items: stretch; }
/* the folders on the way, closed like the board's columns */
.vtab { flex: none; width: 56px; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 20px 0; border: 0; border-radius: 26px; background: color-mix(in srgb, var(--card), #fff 30%); cursor: pointer; font: inherit; color: var(--ink); transition: background .12s; }
.vtab:hover { background: var(--card); }
.vtab.here { cursor: default; }
.vtab .v { writing-mode: vertical-rl; font-weight: 700; font-size: 14px; letter-spacing: -.01em; }
.vtab small { font-size: 12px; font-weight: 600; color: var(--ink-3); }
.vlogo { width: 26px; height: 26px; object-fit: contain; }
.vfold { width: 16px; height: 12px; border-radius: 3px; background: var(--accent); }
/* the open folder: one big card of cards */
.vbig { flex: 1; min-width: 0; overflow-y: auto; background: var(--card); border-radius: 28px; padding: 20px 20px 22px; }
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

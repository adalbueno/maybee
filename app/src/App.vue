<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import logo from './assets/logo.png'
import ReadyFeed from './components/ReadyFeed.vue'
import Viewer from './components/Viewer.vue'
import Board from './components/Board.vue'
import Library from './components/Library.vue'
import ClaudeTray from './components/ClaudeTray.vue'
import Onboarding from './components/Onboarding.vue'
import AccessGate from './components/AccessGate.vue'
import { claude, refreshInbox } from './ask.js'

// the logo gives a wiggle on hover and a spin with a bounce on click
const logoSpin = ref(false)
let logoTimer = null
function spinLogo() { logoSpin.value = false; clearTimeout(logoTimer); requestAnimationFrame(() => { logoSpin.value = true; logoTimer = setTimeout(() => { logoSpin.value = false }, 800) }) }
// The logo is home: it spins, and takes you to the board on Now (a card that is open stays open)
function goHome() { spinLogo(); onMaybee('board/now') }
const items = ref([])
const next = ref(null)
const total = ref(0)
const loading = ref(false)
const showAll = ref(false)
const nums = ref(null)
const open = ref(null) // { path }
const live = ref(false)
const fresh = ref(new Set()) // paths changed while the page is open
const lastChange = ref(0)
const filter = ref('all')
const setup = ref(null)
// ?setup=1 opens the onboarding; read at load, before the page rewrites its own address
let forceSetup = new URLSearchParams(location.search).get('setup') === '1' // used once: switching workspace must not reopen it
// ?gate=1 (or ?gate=not-member) shows the membership screen as a preview: no check runs, nothing unlocks
const previewGate = new URLSearchParams(location.search).get('gate')
const showOnboarding = ref(false)
const access = ref(null)
const accessReady = ref(false)
const workspaces = ref([])
const activeWorkspace = ref('default')
const workspaceMenuOpen = ref(false)
// D254: routes. /workspace · /inbox · /brain (D260, D261: renamed from /desktop, /feed, /library; /activity became /inbox, /vault became /brain; About (/overview, /numbers) is gone, its parts live in the Brain; the old names still work), plus ?note=<path>&tab=<settings|changes> for a note.
// ?place=desktop (the SessionStart hook, D241) still works; with no route, the remembered place.
// D245: the Desktop is the board (old 'kanban' place maps to it)
const PLACES = ['workspace', 'inbox', 'brain']
const ALIASES = { kanban: 'workspace', desktop: 'workspace', feed: 'inbox', activity: 'inbox', library: 'brain', vault: 'brain', numbers: 'brain', about: 'brain', overview: 'brain' }
const fixPlace = p => ALIASES[p] || p
function readUrl() {
  const q = new URLSearchParams(location.search)
  const parts = location.pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)
  const routePlace = parts.length > 1 ? parts[1] : parts[0]
  const workspace = parts.length > 1 ? parts[0] : null
  let p = PLACES.includes(fixPlace(routePlace)) ? fixPlace(routePlace) : q.get('place') ? fixPlace(q.get('place')) : null
  if (!p) p = 'workspace' // a fresh start always lands where the work happens
  if (!PLACES.includes(p)) p = 'workspace'
  const note = q.get('note')
  return { place: p, workspace, open: note ? { path: note, tab: q.get('tab') || undefined } : null }
}
const start = readUrl()
// Keep the workspace named in the URL while the app is still locked: syncUrl() would otherwise rewrite it to 'default'.
if (start.workspace) activeWorkspace.value = start.workspace
const place = ref(start.place)
const requestedWorkspace = start.workspace
open.value = start.open
const openTab = ref(start.open && start.open.tab || 'content')
function urlFor() {
  let u = '/' + (activeWorkspace.value || 'default') + '/' + place.value
  if (open.value && open.value.path) {
    u += '?note=' + encodeURIComponent(open.value.path)
    if (openTab.value && openTab.value !== 'content') u += '&tab=' + openTab.value
  }
  // Plugin 3/3: keep #fragment so #deep links survive place/tab/note navigation.
  u += location.hash
  return u
}
function syncUrl(push = true) {
  const u = urlFor()
  if (u === location.pathname + location.search + location.hash) return
  history[push ? 'pushState' : 'replaceState'](null, '', u)
}
syncUrl(false)
window.addEventListener('popstate', () => {
  const r = readUrl()
  if (r.workspace && r.workspace !== activeWorkspace.value && workspaces.value.some(w => w.name === r.workspace)) chooseWorkspace(r.workspace)
  place.value = r.place
  if (!r.open) open.value = null
  else if (!open.value || open.value.path !== r.open.path) open.value = r.open
  openTab.value = r.open && r.open.tab || 'content'
})
function onTab(t) { openTab.value = t; syncUrl(false) }
// Links inside a note that talk to the app: maybee:board/<column> opens that column of the board, maybee:go/<place> goes to a page.
// The card that holds the link stays open, so the note and the board work together.
const board = ref(null)
async function onMaybee(cmd) {
  const [kind, what] = String(cmd).split('/')
  if (kind === 'go' && PLACES.includes(fixPlace(what))) return go(what)
  if (kind === 'board') {
    if (place.value !== 'workspace') { go('workspace'); await nextTick() }
    board.value?.show(what)
  }
}
function closeViewer() { open.value = null; syncUrl() }
function go(p) { p = fixPlace(p); place.value = p; try { localStorage.setItem('maybee.place', p) } catch {}; syncUrl() }
// The Inbox shows what arrived for you (/api/ready); its unread count is the badge. "Every change" opens the old file feed.
const unread = ref(0)
const feedUnread = ref(0)
const readyData = ref(null)
async function loadReady() {
  try { readyData.value = await fetch('/api/ready').then(r => r.json()); unread.value = readyData.value.unread || 0 } catch {}
}
function readySeen(it) {
  it.read = true
  unread.value = Math.max(0, unread.value - 1)
  markSeen([it.key])
}
async function readyAllSeen() {
  const keys = (readyData.value?.items || []).filter(i => !i.read).map(i => { i.read = true; return i.key })
  unread.value = 0
  await markSeen(keys)
}
// a request that finished (or made a file) changes what's ready
watch(() => claude.items.map(i => i.id + i.status + (i.outputs ? i.outputs.length : 0)).join(), () => loadReady())

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'posts', label: 'Posts', kinds: ['Post', 'Spokes', 'About page', 'Classroom', 'LinkedIn', 'Instagram', 'Ads'] },
  { key: 'replies', label: 'Replies', kinds: ['Replies'] },
  { key: 'media', label: 'Videos & images', kinds: ['Video', 'Images'], media: true },
  { key: 'ideas', label: 'Ideas & tasks', kinds: ['Idea', 'Task', 'Routine'] },
  { key: 'decisions', label: 'Decisions', kinds: ['Decision'] },
  { key: 'numbers', label: 'Numbers', kinds: ['Numbers'] },
  { key: 'words', label: 'Your words', kinds: ['Your words'] },
]
function matches(it, f) {
  if (f.key === 'all') return true
  if (f.key === 'unread') return !it.read
  if (f.media && it.type === 'media') return true
  return f.kinds.includes(it.kind)
}
const filters = computed(() => FILTERS.map(f => ({ ...f, count: f.key === 'all' ? items.value.length : items.value.filter(it => matches(it, f)).length })))
const visible = computed(() => {
  const f = FILTERS.find(x => x.key === filter.value)
  return items.value.filter(it => matches(it, f))
})

const hero = computed(() => {
  const now = new Date()
  const kicker = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const today = items.value.filter(it => new Date(it.time).toDateString() === now.toDateString())
  const days = nums.value && nums.value.items.find(n => n.key === 'days')
  const parts = []
  const count = (f) => today.filter(it => matches(it, FILTERS.find(x => x.key === f))).length
  const add = (n, one, many) => { if (n) parts.push(`${n} ${n === 1 ? one : many}`) }
  add(count('posts'), 'post or spoke', 'posts and spokes')
  add(count('replies'), 'reply file', 'reply files')
  add(count('media'), 'video or image set', 'videos and image sets')
  add(count('ideas'), 'idea or task', 'ideas and tasks')
  add(count('decisions'), 'decision', 'decisions')
  const title = days && days.value != null && days.alert
    ? { strong: `${days.value} days`, rest: ' without a new member.' }
    : { strong: String(today.length), rest: today.length === 1 ? ' thing moved today.' : ' things moved today.' }
  const sub = today.length ? `Today: ${parts.join(' · ') || today.length + ' changes'}.` : 'Nothing changed yet today.'
  return { kicker, title, sub }
})

async function loadFeed(append = false) {
  loading.value = true
  const params = new URLSearchParams()
  if (showAll.value) params.set('all', '1')
  if (append && next.value) params.set('before', next.value)
  const res = await fetch('/api/feed?' + params).then(r => r.json())
  items.value = append ? items.value.concat(res.items) : res.items
  next.value = res.next
  total.value = res.total
  feedUnread.value = res.unread || 0
  loading.value = false
  loadReady()
}
async function loadNumbers() {
  nums.value = await fetch('/api/numbers').then(r => r.json())
}

const days = computed(() => {
  const groups = []
  let cur = null
  for (const it of visible.value) {
    const d = new Date(it.time)
    const key = d.toDateString()
    if (!cur || cur.key !== key) { cur = { key, date: d, items: [] }; groups.push(cur) }
    cur.items.push(it)
  }
  return groups
})

function dayLabel(d) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const that = new Date(d); that.setHours(0, 0, 0, 0)
  const diff = Math.round((today - that) / 86400000)
  const long = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  if (diff === 0) return ['Today', long]
  if (diff === 1) return ['Yesterday', long]
  return [d.toLocaleDateString('en-GB', { weekday: 'long' }), d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })]
}

function isFresh(it) {
  if (it.type === 'media') return it.files.some(f => fresh.value.has(f.path))
  return it.path && fresh.value.has(it.path) && it.type !== 'decision'
}

async function markSeen(keys) {
  if (!keys.length) return
  await fetch('/api/seen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keys }) })
}
function openItem(payload) {
  if (payload.path === '@inbox') return go('inbox') // the Inbox's chat: its answers show on the Inbox
  if (payload.path === '@brain' || payload.path === '@about') return go('brain') // the Brain's chat (and the old About chat): its answers show on the Brain page
  // Plugin 3/3: drop a stale #fragment when navigating to a different note (the previous
  // note's hash has no meaning on the new one). Keep the hash when only the tab changes.
  const samePath = open.value && open.value.path === payload.path
  if (!samePath && location.hash) history.replaceState(null, '', location.pathname + location.search)
  open.value = payload
  openTab.value = payload.tab || 'content'
  syncUrl()
  // opening a card (from the board, a link or the Inbox) counts what's ready on it as seen, so the badge and the card agree
  const onCard = (readyData.value?.items || []).filter(i => !i.read && (i.card === payload.path || i.file === payload.path))
  if (onCard.length) { onCard.forEach(i => { i.read = true }); unread.value = Math.max(0, unread.value - onCard.length); markSeen(onCard.map(i => i.key)) }
  if (payload.key) {
    const it = items.value.find(i => (i.type === 'decision' ? 'decision:' + i.id : i.type === 'media' ? 'media:' + i.id : i.path) === payload.key)
    if (it && !it.read) { it.read = true; feedUnread.value = Math.max(0, feedUnread.value - 1); markSeen([payload.key]) }
  }
}
async function markAllRead() {
  await fetch('/api/seen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) })
  items.value.forEach(i => { i.read = true })
  feedUnread.value = 0
  loadReady()
}
function toggleAll() { showAll.value = !showAll.value; loadFeed() }

let es = null
let refreshTimer = null
let heartbeatTimer = null
function connect() {
  es = new EventSource('/api/events')
  // The server restarted (an update, a new build): load the new page, so nobody has to notice or refresh by hand.
  let boot = null
  es.addEventListener('hello', e => {
    live.value = true
    let id = null
    try { id = JSON.parse(e.data).boot } catch {}
    if (boot && id && id !== boot) { location.reload(); return }
    boot = id || boot
  })
  es.addEventListener('change', e => {
    const data = JSON.parse(e.data)
    const s = new Set(fresh.value)
    data.paths.forEach(p => s.add(p))
    fresh.value = s
    lastChange.value = data.at
    clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => {
      loadFeed()
      if (data.paths.some(p => p.startsWith('logs/metrics/'))) loadNumbers()
    }, 150)
  })
  es.addEventListener('workspace', e => {
    const data = JSON.parse(e.data)
    activeWorkspace.value = data.workspace
    workspaces.value = data.workspaces || workspaces.value
    lastChange.value = Date.now()
    syncUrl(false)
    open.value = null
    loadSetup(); loadFeed(); loadNumbers()
  })
  es.onerror = () => { live.value = false }
}

function onKey(e) { if (e.key === 'Escape' && open.value) closeViewer() }
// the listener usually comes up a few seconds after the app opens: when it does and the first-run chat is still owed, it opens then
let setupPending = false
watch(() => claude.listening, on => { if (on && setupPending) { setupPending = false; showOnboarding.value = true } })
async function loadSetup() {
  try {
    setup.value = await fetch('/api/setup').then(r => r.json())
    const needed = (!setup.value.initialized && !setup.value.skipped) || !!setup.value.needsOnboarding
    // the first-run chat needs an assistant to read the answers: with none listening the board opens directly, and the chat
    // waits for the next load with an assistant (nothing is marked as skipped). ?setup=1 always opens it.
    if (needed && !forceSetup) await refreshInbox()
    showOnboarding.value = forceSetup || (needed && claude.listening)
    setupPending = needed && !showOnboarding.value
    forceSetup = false
  } catch {}
}
// A workspace made from outside the page (by your assistant, say) shows up without a reload
async function refreshWorkspaces() {
  try { const d = await fetch('/api/workspaces').then(r => r.json()); if (d.items) workspaces.value = d.items } catch {}
}
let wsTimer = null
const onFocusWs = () => { if (accessReady.value) refreshWorkspaces() }
async function loadWorkspaces() {
  try {
    const data = await fetch('/api/workspaces').then(r => r.json())
    workspaces.value = data.items || []
    const requested = requestedWorkspace && workspaces.value.some(w => w.name === requestedWorkspace) ? requestedWorkspace : data.active
    activeWorkspace.value = requested
    if (requested !== data.active) {
      const switched = await fetch('/api/workspaces/switch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: requested }) })
      if (switched.ok) {
        const next = await switched.json()
        workspaces.value = next.workspaces || workspaces.value
      }
    }
    syncUrl(false)
  } catch {}
}
const switchError = ref('')
async function chooseWorkspace(name) {
  if (!name || name === activeWorkspace.value) { workspaceMenuOpen.value = false; return }
  switchError.value = ''
  const res = await fetch('/api/workspaces/switch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }).catch(() => null)
  if (!res || !res.ok) {
    const failure = res ? await res.json().catch(() => ({})) : {}
    switchError.value = failure.error || 'Could not open that workspace.'
    refreshWorkspaces()
    return
  }
  workspaceMenuOpen.value = false
  const data = await res.json()
  activeWorkspace.value = data.workspace
  workspaces.value = data.workspaces || workspaces.value
  open.value = null
  syncUrl()
  await loadSetup(); await loadFeed(); await loadNumbers()
}
const addingWorkspace = ref(false), newWorkspaceName = ref(''), workspaceError = ref('')
const zipInput = ref(null)
// A short message at the bottom of the page: kind is 'ok' or 'error'. A click or a few seconds dismiss it.
const notice = reactive({ text: '', kind: 'ok' })
let noticeTimer = null
function say(text, kind = 'ok') {
  notice.text = text; notice.kind = kind
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => { notice.text = '' }, kind === 'error' ? 7000 : 4500)
}
async function importZipFile(e) {
  const file = e.target.files && e.target.files[0]
  e.target.value = ''
  if (!file) return
  workspaceMenuOpen.value = false
  const res = await fetch('/api/playbooks/import-zip', { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: file }).catch(() => null)
  const data = res ? await res.json().catch(() => ({})) : {}
  if (!res || !res.ok) { say(data.error || 'Could not import the playbook.', 'error'); return }
  const n = data.added.length, k = data.skipped.length
  say(`Imported “${data.title}”: ${n} new file${n === 1 ? '' : 's'}` + (k ? `, ${k} already there and left as they were.` : '.'))
  await loadFeed(); await loadNumbers()
}
async function addWorkspace() {
  const name = newWorkspaceName.value.trim()
  if (!name) return
  workspaceError.value = ''
  const res = await fetch('/api/workspaces', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) { workspaceError.value = data.error || 'Could not create the workspace.'; return }
  addingWorkspace.value = false; newWorkspaceName.value = ''; workspaceMenuOpen.value = false
  activeWorkspace.value = data.workspace
  workspaces.value = data.workspaces || workspaces.value
  open.value = null
  go('workspace')
  await loadSetup(); await loadFeed(); await loadNumbers()
}
function onboardingDone(data) {
  setup.value = data; showOnboarding.value = false; loadFeed(); loadNumbers()
  if (data && data.openPath) openItem({ path: data.openPath })
}
async function accessVerified(data) { access.value = data; accessReady.value = true; connect(); startHeartbeat(); await loadWorkspaces(); loadSetup(); loadFeed(); loadNumbers() }

function accessExpired(data) {
  access.value = data
  accessReady.value = false
  if (es) { es.close(); es = null }
  live.value = false
}

async function heartbeat() {
  try {
    const res = await fetch('/api/session/heartbeat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    const data = await res.json()
    if (data.valid) access.value = data
    else accessExpired(data)
  } catch {
    // A temporary network failure should not revoke an otherwise valid local
    // session. The next heartbeat or the next request will retry.
  }
}

function startHeartbeat() {
  clearInterval(heartbeatTimer)
  heartbeatTimer = setInterval(heartbeat, 60 * 1000)
}

onMounted(() => { fetch('/api/access').then(r => r.json()).then(data => { access.value = data; accessReady.value = !!data.valid; if (data.valid) { loadWorkspaces(); loadFeed(); loadNumbers(); loadSetup(); connect(); startHeartbeat() } }); window.addEventListener('keydown', onKey) })
onMounted(() => { wsTimer = setInterval(() => { if (accessReady.value && !document.hidden) refreshWorkspaces() }, 10000); window.addEventListener('focus', onFocusWs) })
onBeforeUnmount(() => { clearInterval(wsTimer); window.removeEventListener('focus', onFocusWs) })
onBeforeUnmount(() => { es && es.close(); clearInterval(heartbeatTimer); window.removeEventListener('keydown', onKey) })
</script>

<template>
  <div class="shell" :class="{ 'with-viewer': open, onboarding: showOnboarding }" @click="workspaceMenuOpen = false">
    <AccessGate v-if="!accessReady || previewGate" :preview="previewGate" @verified="accessVerified" />
    <Onboarding v-if="showOnboarding" @done="onboardingDone" />
    <header class="top">
      <div class="brand">
        <img class="mark" :class="{ spin: logoSpin }" :src="logo" alt="Maybee: home" title="Home: the Now column" @click="goHome" />
        <span class="name">Maybee</span>
        <div v-if="workspaces.length" class="workspace-picker" @click.stop>
          <button class="workspace-select" :aria-expanded="workspaceMenuOpen" aria-haspopup="listbox" @click="workspaceMenuOpen = !workspaceMenuOpen; if (workspaceMenuOpen) refreshWorkspaces()">
            <span class="workspace-dot"></span><span class="workspace-label">{{ (workspaces.find(w => w.name === activeWorkspace) || {}).label || activeWorkspace }}</span><span class="workspace-chevron">⌄</span>
          </button>
          <div v-if="workspaceMenuOpen" class="workspace-menu" role="listbox">
            <div class="workspace-menu-label">Workspaces</div>
            <button v-for="w in workspaces" :key="w.name" class="workspace-option" :class="{ selected: w.name === activeWorkspace }" role="option" :aria-selected="w.name === activeWorkspace" @click="chooseWorkspace(w.name)">
              <span class="workspace-option-icon"><img v-if="w.name === 'default'" :src="logo" alt="" /><template v-else>↗</template></span>
              <span><b>{{ w.label }}</b><small>{{ w.name === 'default' ? 'Default workspace' : 'Playbook workspace' }}</small></span>
              <span v-if="w.name === activeWorkspace" class="workspace-check">✓</span>
            </button>
            <small v-if="switchError" class="workspace-error workspace-switch-error">{{ switchError }}</small>
            <button v-if="!addingWorkspace" class="workspace-option workspace-add" @click="addingWorkspace = true; workspaceError = ''">
              <span class="workspace-option-icon">+</span>
              <span><b>Add workspace</b></span>
            </button>
            <button class="workspace-option workspace-add" @click="zipInput.click()">
              <span class="workspace-option-icon">↓</span>
              <span><b>Import playbook</b><small>From a .zip; nothing is overwritten</small></span>
            </button>
            <input ref="zipInput" type="file" accept=".zip,application/zip" hidden @change="importZipFile" />
            <form v-if="addingWorkspace" class="workspace-add-form" @submit.prevent="addWorkspace">
              <input v-model="newWorkspaceName" placeholder="Workspace name" maxlength="80" autofocus @keydown.esc="addingWorkspace = false" />
              <button type="submit" :disabled="!newWorkspaceName.trim()">Create</button>
              <small v-if="workspaceError" class="workspace-error">{{ workspaceError }}</small>
            </form>
          </div>
        </div>
      </div>
      <nav class="places">
        <a class="place" :class="{ active: place === 'workspace' }" @click="go('workspace')">Workspace</a>
        <a class="place" :class="{ active: place === 'inbox' }" @click="go('inbox')">Inbox<small v-if="unread" class="place-badge" :title="unread + (unread === 1 ? ' thing' : ' things') + ' ready for you'">{{ unread > 99 ? '99+' : unread }}</small></a>
        <a class="place" :class="{ active: place === 'brain' }" @click="go('brain')">Brain</a>
      </nav>
      <div class="tools">
        <ClaudeTray :live="live" @open="openItem" />
      </div>
    </header>


    <!-- behind the membership lock: the board, read-only, so the app is already there -->
    <div v-if="!accessReady || previewGate" class="body" inert aria-hidden="true">
      <main class="board-wrap"><Board preview /></main>
    </div>
    <div v-else class="body">
      <main v-if="place === 'workspace'" class="board-wrap">
        <Board ref="board" :changed-at="lastChange" :active-path="open && open.path" @open="openItem" />
      </main>
      <main v-else-if="place === 'brain'" class="board-wrap vault-wrap">
        <Library :workspace="(workspaces.find(w => w.name === activeWorkspace) || {}).label || activeWorkspace" :changed-at="lastChange" :active-path="open && open.path" @open="openItem" />
      </main>
      <main v-else class="board-wrap inbox-wrap">
        <ReadyFeed :data="readyData" :active-path="open && open.path" @open="openItem" @seen="readySeen" @all-seen="readyAllSeen" />
      </main>

      <Viewer v-if="open" :target="open" :fresh-at="lastChange" :fresh="fresh" @close="closeViewer" @open="openItem" @tab="onTab" @maybee="onMaybee" />
    </div>
    <div v-if="claude.toast" class="toast">{{ claude.toast }}</div>
    <div v-if="notice.text" class="toast notice" :class="notice.kind" role="status" @click="notice.text = ''">{{ notice.text }}</div>
  </div>
</template>

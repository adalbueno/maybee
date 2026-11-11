<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import FeedCard from './components/FeedCard.vue'
import Viewer from './components/Viewer.vue'
import Board from './components/Board.vue'
import StatePanel from './components/StatePanel.vue'
import Library from './components/Library.vue'
import Numbers from './components/Numbers.vue'
import ClaudeTray from './components/ClaudeTray.vue'
import Onboarding from './components/Onboarding.vue'
import AccessGate from './components/AccessGate.vue'
import { claude } from './ask.js'

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
const showOnboarding = ref(false)
const access = ref(null)
const accessReady = ref(false)
// D254: routes. /overview · /workspace · /activity · /vault (D260, D261: renamed from /numbers, /desktop, /feed, /library; the old names still work), plus ?note=<path>&tab=<settings|changes> for a note.
// ?place=desktop (the SessionStart hook, D241) still works; with no route, the remembered place.
// D245: the Desktop is the board (old 'kanban' place maps to it)
const PLACES = ['overview', 'workspace', 'activity', 'vault']
// D261: Overview has two tabs, Numbers first (Adal 8/11) and "Where we are" (STATE)
const ovTab = ref((() => { try { return localStorage.getItem('maybee.ovTab') || 'numbers' } catch { return 'numbers' } })())
function setOvTab(t) { ovTab.value = t; try { localStorage.setItem('maybee.ovTab', t) } catch {} }
const ALIASES = { kanban: 'workspace', desktop: 'workspace', feed: 'activity', library: 'vault', numbers: 'overview' }
const fixPlace = p => ALIASES[p] || p
function readUrl() {
  const q = new URLSearchParams(location.search)
  const seg = location.pathname.replace(/^\/+|\/+$/g, '')
  let p = PLACES.includes(fixPlace(seg)) ? fixPlace(seg) : q.get('place') ? fixPlace(q.get('place')) : null
  if (!p) { try { p = fixPlace(localStorage.getItem('maybee.place') || 'workspace') } catch { p = 'workspace' } }
  if (!PLACES.includes(p)) p = 'workspace'
  const note = q.get('note')
  return { place: p, open: note ? { path: note, tab: q.get('tab') || undefined } : null }
}
const start = readUrl()
const place = ref(start.place)
open.value = start.open
const openTab = ref(start.open && start.open.tab || 'content')
function urlFor() {
  let u = '/' + place.value
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
  place.value = r.place
  if (!r.open) open.value = null
  else if (!open.value || open.value.path !== r.open.path) open.value = r.open
  openTab.value = r.open && r.open.tab || 'content'
})
function onTab(t) { openTab.value = t; syncUrl(false) }
function closeViewer() { open.value = null; syncUrl() }
function go(p) { p = fixPlace(p); place.value = p; try { localStorage.setItem('maybee.place', p) } catch {}; syncUrl() }
const unread = ref(0)

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
  unread.value = res.unread || 0
  loading.value = false
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
  // Plugin 3/3: drop a stale #fragment when navigating to a different note (the previous
  // note's hash has no meaning on the new one). Keep the hash when only the tab changes.
  const samePath = open.value && open.value.path === payload.path
  if (!samePath && location.hash) history.replaceState(null, '', location.pathname + location.search)
  open.value = payload
  openTab.value = payload.tab || 'content'
  syncUrl()
  if (payload.key) {
    const it = items.value.find(i => (i.type === 'decision' ? 'decision:' + i.id : i.type === 'media' ? 'media:' + i.id : i.path) === payload.key)
    if (it && !it.read) { it.read = true; unread.value = Math.max(0, unread.value - 1); markSeen([payload.key]) }
  }
}
async function markAllRead() {
  await fetch('/api/seen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) })
  items.value.forEach(i => { i.read = true })
  unread.value = 0
}
function toggleAll() { showAll.value = !showAll.value; loadFeed() }

let es = null
let refreshTimer = null
let heartbeatTimer = null
function connect() {
  es = new EventSource('/api/events')
  es.addEventListener('hello', () => { live.value = true })
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
  es.onerror = () => { live.value = false }
}

function onKey(e) { if (e.key === 'Escape' && open.value) closeViewer() }
async function loadSetup() {
  try {
    setup.value = await fetch('/api/setup').then(r => r.json())
    showOnboarding.value = !setup.value.initialized || new URLSearchParams(location.search).get('setup') === '1'
  } catch {}
}
function onboardingDone(data) { setup.value = data; showOnboarding.value = false; loadFeed(); loadNumbers() }
function accessVerified(data) { access.value = data; accessReady.value = true; connect(); startHeartbeat(); loadSetup(); loadFeed(); loadNumbers() }

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

onMounted(() => { fetch('/api/access').then(r => r.json()).then(data => { access.value = data; accessReady.value = !!data.valid; if (data.valid) { loadFeed(); loadNumbers(); loadSetup(); connect(); startHeartbeat() } }); window.addEventListener('keydown', onKey) })
onBeforeUnmount(() => { es && es.close(); clearInterval(heartbeatTimer); window.removeEventListener('keydown', onKey) })
</script>

<template>
  <div class="shell" :class="{ 'with-viewer': open }">
    <AccessGate v-if="!accessReady" @verified="accessVerified" />
    <Onboarding v-if="showOnboarding" @done="onboardingDone" />
    <header class="top">
      <div class="brand">
        <span class="mark">M</span>
        <span class="name">Maybee</span>
        <span class="project">How I</span>
      </div>
      <nav class="places">
        <a class="place" :class="{ active: place === 'overview' }" @click="go('overview')">Overview</a>
        <a class="place" :class="{ active: place === 'workspace' }" @click="go('workspace')">Workspace</a>
        <a class="place" :class="{ active: place === 'activity' }" @click="go('activity')">Activity</a>
        <a class="place" :class="{ active: place === 'vault' }" @click="go('vault')">Vault</a>
      </nav>
      <div class="tools">
        <ClaudeTray @open="openItem" />
        <button class="switch" :class="{ on: showAll }" @click="toggleAll" :title="showAll ? 'Showing every file' : 'Showing what tells the story'">
          {{ showAll ? 'Everything' : 'Story' }}
        </button>
        <span class="live" :class="{ on: live }" :title="live ? 'Updates as files change' : 'Not connected'">
          <i></i>{{ live ? 'Live' : 'Offline' }}
        </span>
      </div>
    </header>


    <div v-if="accessReady" class="body">
      <main v-if="place === 'workspace'" class="board-wrap">
        <Board :changed-at="lastChange" :active-path="open && open.path" @open="openItem" />
      </main>
      <main v-else-if="place === 'vault'" class="lib-wrap">
        <Library :changed-at="lastChange" :active-path="open && open.path" @open="openItem" />
      </main>
      <main v-else-if="place === 'overview'" class="lib-wrap">
        <div class="ov-tabs">
          <button :class="{ on: ovTab === 'numbers' }" @click="setOvTab('numbers')">Numbers</button>
          <button :class="{ on: ovTab === 'state' }" @click="setOvTab('state')">Where we are</button>
        </div>
        <Numbers v-if="ovTab === 'numbers'" :data="nums" @open="openItem" />
        <StatePanel v-else :changed-at="lastChange" @open="openItem" />
      </main>
      <main v-else class="feed">
        <div class="feed-inner">
        <div class="hero">
          <div class="hero-kicker">{{ hero.kicker }}</div>
          <h1 class="hero-title"><b>{{ hero.title.strong }}</b>{{ hero.title.rest }}</h1>
          <p class="hero-sub">{{ hero.sub }}</p>
          <div class="hero-actions">
            <button v-if="unread" class="unread-btn" @click="filter = 'unread'"><i></i>{{ unread }} unread</button>
            <span v-else class="all-read">You've seen everything.</span>
            <button v-if="unread" class="link-btn" @click="markAllRead">Mark all as read</button>
          </div>
        </div>
        <div class="filters">
          <button v-for="f in filters" :key="f.key" class="filter" :class="{ on: filter === f.key }" @click="filter = f.key">
            {{ f.label }}<small v-if="f.key === 'unread' ? unread : (f.key !== 'all' && f.count)">{{ f.key === 'unread' ? unread : f.count }}</small>
          </button>
        </div>
        <section v-for="g in days" :key="g.key" class="day">
          <h2 class="day-label"><span>{{ dayLabel(g.date)[0] }}</span> {{ dayLabel(g.date)[1] }}</h2>
          <FeedCard
            v-for="it in g.items"
            :key="it.type + (it.path || '') + (it.id || '')"
            :item="it"
            :fresh="isFresh(it)"
            :active="open && open.path === it.path && it.type !== 'decision'"
            @open="openItem"
          />
        </section>
        <div class="more">
          <button v-if="next" class="more-btn" :disabled="loading" @click="loadFeed(true)">Earlier</button>
          <p v-else-if="items.length" class="end">That's everything{{ showAll ? '' : ' in the story' }}.</p>
          <p v-else-if="!loading" class="end">Nothing here yet.</p>
        </div>
        </div>
      </main>

      <Viewer v-if="open" :target="open" :fresh-at="lastChange" :fresh="fresh" @close="closeViewer" @open="openItem" @tab="onTab" />
    </div>
    <div v-if="claude.toast" class="toast">{{ claude.toast }}</div>
  </div>
</template>

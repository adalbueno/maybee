<script setup>
import RoutineSchedule from './RoutineSchedule.vue'
import { ask, claude } from '../ask.js'
import { sideMove } from '../stages.js'
import { ref, computed, onMounted, watch } from 'vue'
const props = defineProps({ changedAt: Number, activePath: String })
const emit = defineEmits(['open'])

const cols = ref(null)
const dragging = ref(null)
const over = ref(null)
const openCol = ref('now') // the board always starts on Now
const nearNot = ref(false)
// Routines have their own column; today's due state still controls their Run buttons.
const routines = ref([])
const rLeft = computed(() => routines.value.filter(r => !r.done).length)
const rDone = computed(() => routines.value.filter(r => r.done).length)
// D262: Now shows what can be done now (the next 3 first); what waits for its time and what is done fold away
const rTodo = computed(() => routines.value.filter(r => !r.done && !r.later))
const rLater = computed(() => routines.value.filter(r => !r.done && r.later))
const rFinished = computed(() => routines.value.filter(r => r.done))
const NEXT = 3
const fold = ref({ more: false, later: false, done: false })
const rShown = computed(() => [
  ...rTodo.value.slice(0, NEXT).map(r => ({ r, part: 'next' })),
  ...(fold.value.more ? rTodo.value.slice(NEXT).map(r => ({ r, part: 'more' })) : []),
])
const delivName = r => r.deliverable.split('/').pop().replace(/\.md$/, '')
const laterLabel = r => r.later === 'needs' ? `after “${r.needsTitle}”` + (r.at ? ` · from ${r.at}` : '') : `from ${r.at}`
const todayISO = () => new Date().toISOString().slice(0, 10)
function runState(r) {
  const req = [...claude.items].find(i => i.path === r.path && i.action === 'Run routine' && String(i.at).slice(0, 10) === todayISO())
  return req ? req.status : null
}
async function notToday(r) {
  const res = await fetch('/api/fields', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: r.path, title: r.full || r.title, fields: { not_today: new Date().toLocaleDateString('sv-SE') } }) })
  if (res.ok) routines.value = routines.value.filter(x => x.path !== r.path)
}
// Start: the assistant works on a Now card. With a next step it does that; without one it picks the first step itself.
const working = c => [...claude.items].some(i => i.path === c.path && ['Work on this now', 'Do the next step'].includes(i.action) && ['pending', 'queued', 'working'].includes(i.status))
const start = c => ask({ action: c.nextStep ? 'Do the next step' : 'Work on this now', path: c.path, title: c.title })
const runRoutine = r => ask({ action: 'Run routine', path: r.path, title: r.full || r.title })
// D246: drag to reorder (order = priority = run order), gear to set how it runs by itself, Run all in order
const rDrag = ref(null)
const rOver = ref(null)
function rStart(r, e) { rDrag.value = r.path; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/routine', r.path); e.stopPropagation() }
function rEnter(r, e) { if (!rDrag.value) return; e.preventDefault(); e.stopPropagation(); rOver.value = r.path }
async function rDrop(r, e) {
  if (!rDrag.value) return
  e.preventDefault(); e.stopPropagation()
  const list = routines.value.slice()
  const from = list.findIndex(x => x.path === rDrag.value), to = list.findIndex(x => x.path === r.path)
  rDrag.value = null; rOver.value = null
  if (from < 0 || to < 0 || from === to) return
  list.splice(to, 0, list.splice(from, 1)[0])
  routines.value = list
  await fetch('/api/routines/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths: list.map(x => x.path) }) })
}
function rEnd() { rDrag.value = null; rOver.value = null }
const gearFor = ref(null)
const menuFor = ref(null) // the Run button's dropdown (Not today, Remove)
const removeAsk = ref(null)
if (typeof window !== 'undefined') window.addEventListener('click', () => { menuFor.value = null; removeAsk.value = null })
// D248: removing a routine = stage: not (the file is never deleted); Undo puts the old stage back
const undo = ref(null)
async function removeRoutine(r) {
  menuFor.value = null; removeAsk.value = null
  const res = await fetch('/api/stage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: r.path, title: r.full || r.title, stage: 'not' }) })
  if (!res.ok) { say('Could not remove it'); return }
  const { from } = await res.json()
  routines.value = routines.value.filter(x => x.path !== r.path)
  undo.value = { r, from: from || 'now' }
  setTimeout(() => { if (undo.value && undo.value.r === r) undo.value = null }, 8000)
}
async function undoRemove() {
  const u = undo.value; undo.value = null
  if (!u) return
  await fetch('/api/stage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: u.r.path, title: u.r.full || u.r.title, stage: u.from }) })
  load()
}
function openGear(r) { gearFor.value = gearFor.value === r.path ? null : r.path }
const cap = d => d[0].toUpperCase() + d.slice(1)
function autoLabel(r) {
  const n = r.autoEvery, m = r.autoMode
  if (m === 'session') return 'auto · every session'
  if (m === 'hours') return `auto · every ${n} h`
  if (m === 'days') return `auto · every ${n === 1 ? 'day' : n + ' days'}`
  if (m === 'weeks') return `auto · ${n === 1 ? 'weekly' : 'every ' + n + ' weeks'}${r.autoDays && r.autoDays.length ? ' · ' + r.autoDays.map(cap).join(', ') : ''}`
  if (m === 'months') return `auto · ${n === 1 ? 'monthly' : 'every ' + n + ' months'} · day ${r.autoMday}`
  return ''
}
function runAll() { for (const r of rTodo.value) { const st = runState(r); if (st !== 'pending' && st !== 'queued' && st !== 'working') runRoutine(r) } }
// moved: once the user has opened a column by hand, the next one opens in two steps (the drawer first, then its cards)
const moved = ref(false)
function toggle(key) { moved.value = true; openCol.value = key }
const showBacklog = ref(false)
const backlog = ref([])
const q = ref('')
const toast = ref('')

// the strip colours follow the column dots (style.css .dot.*): background and the text colour that reads on it
const STAGE = { delete: { bg: 'var(--bad)' }, maybe: { bg: '#c9c4b6' }, next: { bg: '#4a7dff' }, now: { bg: '#f2b705' }, done: { bg: 'var(--good)' }, not: { bg: 'var(--bad)' } }
const stageName = key => key === 'delete' ? 'Delete' : (COLS.find(c => c.key === key) || {}).label || key
// the strip at one side of a card: where it would go, and the colour of that column
// the strip that slides out from under the card is the one on the half the mouse is over
function pickSide(e) { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.dataset.side = e.clientX < r.left + r.width / 2 ? 'prev' : 'next' }
const level = p => [2, 3, 5, 8, 13].indexOf(p) + 1
const side = (c, dir) => { const m = sideMove(c.stage, dir); return m && { ...m, name: stageName(m.to), bg: STAGE[m.to].bg } }
const COLS = [
  { key: 'not', label: 'Not', hint: "Won't do", onlyWhileDragging: true },
  { key: 'maybe', label: 'Maybe', hint: 'Worth a look, by priority' },
  { key: 'next', label: 'Next', hint: 'The short queue' },
  { key: 'now', label: 'Now', hint: 'What we are working on' },
  { key: 'routine', label: 'Routine', hint: 'Recurring work' },
  { key: 'done', label: 'Done', hint: '' },
]
const weekAgo = Date.now() - 7 * 86400000
const wins = computed(() => cols.value ? cols.value.done.cards : [])
const winsThisWeek = computed(() => wins.value.filter(c => c.mtime >= weekAgo).length)
const when = ms => { const d = Math.round((Date.now() - ms) / 86400000); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 7 ? d + ' days ago' : new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }
const shown = computed(() => COLS.filter(c => !c.onlyWhileDragging || dragging.value || openCol.value === c.key || (c.key === 'not' && nearNot.value)))

async function load() {
  const res = await fetch('/api/board').then(r => r.json())
  cols.value = res.columns
  routines.value = res.routinesToday || []
}
onMounted(load)
watch(() => props.changedAt, load)

function say(msg) { toast.value = msg; setTimeout(() => { if (toast.value === msg) toast.value = '' }, 2600) }

// Delete asks twice: the first click arms it, the second one (within 4 seconds) moves the note to _to_delete/
let armed = null, armTimer = null
async function remove(card) {
  if (armed !== card.path) { armed = card.path; clearTimeout(armTimer); armTimer = setTimeout(() => { armed = null }, 4000); say('Click Delete again to remove it'); return }
  armed = null
  const src = cols.value[card.stage]
  src.cards = src.cards.filter(c => c.path !== card.path); src.count--
  const res = await fetch('/api/card/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: card.path, mtime: card.mtime, title: card.title }) })
  if (!res.ok) { const err = await res.json().catch(() => ({})); say('Could not delete it: ' + (err.error || res.status)) } else say('Deleted (kept in _to_delete/)')
  load()
}

async function move(card, stage) {
  if (card && stage === 'delete') return remove(card)
  if (!card || card.stage === stage) return
  const from = card.stage
  // optimistic
  const src = cols.value[from], dst = cols.value[stage]
  src.cards = src.cards.filter(c => c.path !== card.path); src.count--
  dst.cards = [{ ...card, stage }, ...dst.cards]; dst.count++
  const res = await fetch('/api/stage', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: card.path, stage, mtime: card.mtime, title: card.title }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    say(err.error === 'changed since you opened it' ? 'That note just changed. Try again.' : 'Could not move it: ' + (err.error || res.status))
  } else say(`Moved to ${stage}`)
  load()
}

function onDragStart(card, e) {
  dragging.value = card; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', card.path)
  // the browser's own drag image is a snapshot of the card with its hover shadow and see-through corners: draw a clean, solid copy instead
  const el = e.currentTarget, box = el.getBoundingClientRect()
  const ghost = el.cloneNode(true)
  ghost.classList.add('drag-ghost'); ghost.classList.remove('dragging', 'active', 'drop-before', 'drop-after')
  ghost.style.width = box.width + 'px'
  document.body.appendChild(ghost)
  e.dataTransfer.setDragImage(ghost, e.clientX - box.left, e.clientY - box.top)
  setTimeout(() => ghost.remove(), 0)
}
function onDragEnd() { dragging.value = null; over.value = null; dropAt.value = null }

// Arrange cards inside Maybe, Next and Now by hand: drop on the upper or lower half of a card.
const RANKED = ['maybe', 'next', 'now']
const dropAt = ref(null)
const sameColumn = c => dragging.value && dragging.value.stage === c.stage && dragging.value.path !== c.path && RANKED.includes(c.stage)
function cardOver(c, e) {
  if (!sameColumn(c)) return
  e.preventDefault(); e.stopPropagation()
  const r = e.currentTarget.getBoundingClientRect()
  dropAt.value = { path: c.path, pos: e.clientY < r.top + r.height / 2 ? 'before' : 'after' }
}
async function cardDrop(c, e) {
  if (!sameColumn(c) || !dropAt.value) return
  e.preventDefault(); e.stopPropagation()
  const d = dragging.value, pos = dropAt.value.pos
  onDragEnd()
  const col = cols.value[c.stage], list = col.cards.filter(x => x.path !== d.path)
  const at = list.findIndex(x => x.path === c.path) + (pos === 'after' ? 1 : 0)
  list.splice(at, 0, d); col.cards = list
  const res = await fetch('/api/rank', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pos === 'before' ? { path: d.path, before: c.path } : { path: d.path, after: c.path }),
  })
  if (!res.ok) say('Could not reorder: ' + ((await res.json().catch(() => ({}))).error || res.status))
  load()
}
// A sort is a one-time action: it rewrites the column's order (which beats a hand-made one), so it can be undone.
const SORTS = [
  ['priority', 'Priority'], ['easy', 'Easy first'], ['members', 'Value for members'],
  ['business', 'Value for business'], ['recent', 'Most recent'], ['unrated', 'Unrated first'],
]
const sortOpen = ref(false)
const sortUndo = ref(null)
let sortTimer = null
async function sortBy(stage, order) {
  sortOpen.value = false
  const res = await fetch('/api/rank', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ byScore: true, order, stage }) })
  if (!res.ok) { say('Could not sort it'); return }
  const { previous } = await res.json()
  const label = SORTS.find(x => x[0] === order)[1].toLowerCase()
  sortUndo.value = { label, previous: previous || [] }
  clearTimeout(sortTimer); sortTimer = setTimeout(() => { sortUndo.value = null }, 10000)
  load()
}
async function undoSort() {
  const u = sortUndo.value; sortUndo.value = null
  if (!u) return
  const res = await fetch('/api/rank', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ restore: u.previous }) })
  say(res.ok ? 'Back to the earlier order' : 'Could not undo the sort')
  load()
}
if (typeof window !== 'undefined') window.addEventListener('click', () => { sortOpen.value = false })

// Quick capture at the bottom of Maybe: the title is the whole idea, Enter adds it at the top
const newTitle = ref('')
const adding = ref(false)
async function addIdea() {
  const title = newTitle.value.trim()
  if (!title || adding.value) return
  adding.value = true
  try {
    const res = await fetch('/api/card', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) })
    const out = await res.json().catch(() => ({}))
    if (res.ok) { newTitle.value = ''; say('Added to Maybe'); await load() }
    else say(out.error || 'Could not add it')
  } finally { adding.value = false }
}
function onDrop(stage) { const c = dragging.value; onDragEnd(); move(c, stage) }

async function openBacklog() {
  showBacklog.value = true
  backlog.value = await fetch('/api/backlog').then(r => r.json())
}
const filtered = computed(() => {
  const t = q.value.trim().toLowerCase()
  const list = t ? backlog.value.filter(c => (c.title + ' ' + (c.description || '') + ' ' + (c.id || '')).toLowerCase().includes(t)) : backlog.value
  return list.slice(0, 200)
})
async function pull(card, stage) {
  await move({ ...card, stage: 'maybe', mtime: null }, stage)
  backlog.value = backlog.value.filter(c => c.path !== card.path)
}

</script>

<template>
  <div class="board" :class="{ moved }" v-if="cols" @mouseleave="nearNot = false">
    <div class="not-edge" aria-label="Reveal Not column" @mouseenter="nearNot = true"></div>
    <section
      v-for="col in shown" :key="col.key" class="col" :class="[col.key, { open: openCol === col.key, over: over === col.key }]"
      @dragover.prevent="over = col.key" @dragleave.self="over = null" @drop.prevent="onDrop(col.key)"
      @mouseenter="col.key === 'not' && (nearNot = true)" @mouseleave="col.key === 'not' && (nearNot = false)"
    >
      <!-- collapsed: a narrow tab -->
      <!-- it stays in the open column too: while the drawer opens the tab is still there, and it fades once the cards appear -->
      <button class="col-tab" :tabindex="openCol === col.key ? -1 : 0" @click="openCol !== col.key && toggle(col.key)" :title="'Open ' + col.label">
        <span v-if="col.key === 'done'" class="check sm">✓</span><span v-else class="dot" :class="col.key"></span><span class="v">{{ col.label }}</span><small>{{ cols[col.key].count }}</small>
      </button>

      <!-- open -->
      <template v-if="openCol === col.key">
        <header class="col-head">
          <h2><span class="dot" :class="col.key"></span>{{ col.label }}<small>{{ cols[col.key].count }}</small></h2>
          <p>{{ col.hint }}</p>
          <div v-if="col.key === 'maybe' && cols.maybe.count > 1" class="sort-wrap" @click.stop>
            <button class="sort-btn" :class="{ open: sortOpen }" @click="sortOpen = !sortOpen" title="Put the column in this order once. It replaces the order you set by hand, and you can still drag cards after">Sort ▾</button>
            <div v-if="sortOpen" class="sort-menu"><button v-for="o in SORTS" :key="o[0]" @click="sortBy('maybe', o[0])">{{ o[1] }}</button></div>
            <span v-if="sortUndo" class="sort-undo">Sorted by {{ sortUndo.label }} <button class="link-btn" @click="undoSort">Undo</button></span>
          </div>
        </header>
        <div class="col-body">
          <div v-if="col.key === 'routine' && routines.length" class="r-today">
            <div v-if="undo" class="r-undo">Removed “{{ undo.r.full || undo.r.title }}” <button class="link-btn" @click.stop="undoRemove">Undo</button></div>
            <div class="r-head">Today's routines <b class="r-count">{{ rDone }} of {{ routines.length }} done</b> <small>drag to set the order · they run in this order</small>
              <button v-if="rTodo.length" class="r-all" @click.stop="runAll" title="Send every routine that can run now to Claude, top to bottom">Run all ({{ rTodo.length }})</button>
            </div>
            <p v-if="!rTodo.length && rLater.length" class="r-empty">Nothing to do right now. Next: {{ rLater[0].full || rLater[0].title }}, {{ laterLabel(rLater[0]) }}.</p>
            <p v-else-if="!rTodo.length" class="r-empty ok">✓ All of today's routines are done.</p>
            <template v-for="({ r, part }, i) in rShown" :key="r.path">
            <div v-if="i === NEXT" class="r-sub">The rest for today</div>
            <article class="kcard routine" :class="{ 'r-next': part === 'next', dragging: rDrag === r.path, 'r-over': rOver === r.path && rDrag !== r.path, 'r-running': runState(r) === 'working', 'r-queued': runState(r) === 'queued' || runState(r) === 'pending' }"
                 draggable="true" @dragstart="rStart(r, $event)" @dragover="rEnter(r, $event)" @drop="rDrop(r, $event)" @dragend="rEnd"
                 @click="emit('open', { path: r.path, key: r.path })">
              <div class="k-meta">
                <span class="tag">Routine</span>
                <span class="prio" title="Run order: drag to change">{{ i + 1 }}</span>
              </div>
              <h3>{{ r.full || r.title }}</h3>
              <p v-if="runState(r) === 'working'" class="r-state run">Claude is doing this now…</p>
              <p v-else-if="runState(r) === 'queued'" class="r-state">In line, Claude does it after the one running</p>
              <p v-else>{{ r.recurring }}<template v-if="r.at"> · at {{ r.at }}</template><template v-if="r.stale"> · <em>{{ r.last ? `${r.idle} days without` : 'Never run' }}</em></template><template v-if="r.auto"> · {{ autoLabel(r) }}</template></p>
              <a v-if="r.deliverable" class="r-deliv" @click.stop="emit('open', { path: r.deliverable, key: r.deliverable })" :title="r.deliverable">📄 {{ delivName(r) }}</a>
              <div class="k-moves r-actions" @click.stop>
                <div class="r-split">
                  <button class="pill-btn yellow" :disabled="runState(r) === 'pending' || runState(r) === 'queued' || runState(r) === 'working'" @click="runRoutine(r)">
                    {{ runState(r) === 'working' ? 'Running…' : runState(r) === 'queued' ? 'In line' : runState(r) === 'pending' ? 'Sent' : 'Run' }}
                  </button>
                  <button class="r-caret" :class="{ open: menuFor === r.path }" @click="menuFor = menuFor === r.path ? null : r.path" title="More">▾</button>
                  <div v-if="menuFor === r.path" class="r-menu">
                    <button @click="menuFor = null; notToday(r)">Not today <small>comes back tomorrow</small></button>
                    <button v-if="removeAsk !== r.path" class="danger" @click="removeAsk = r.path">Remove routine <small>stops it for good (stage: not)</small></button>
                    <button v-else class="danger sure" @click="removeRoutine(r)">Sure? Remove it <small>the note stays, you can bring it back</small></button>
                  </div>
                </div>
                <button class="r-gear" :class="{ on: r.auto, open: gearFor === r.path }" @click.stop="openGear(r)" title="Run by itself: every session, or every N hours, days, weeks or months">⚙</button>
              </div>
            </article>
            <RoutineSchedule v-if="gearFor === r.path" :r="r" cancelable @cancel="gearFor = null" @saved="v => { Object.assign(r, v); gearFor = null; say('Saved') }" />
            </template>
            <button v-if="rTodo.length > NEXT" class="r-fold" @click.stop="fold.more = !fold.more">
              <span class="caret" :class="{ open: fold.more }">▸</span>{{ fold.more ? 'Show only the next 3' : `${rTodo.length - NEXT} more for today` }}
            </button>
            <button v-if="rLater.length" class="r-fold" @click.stop="fold.later = !fold.later">
              <span class="caret" :class="{ open: fold.later }">▸</span>Later today <small>{{ rLater.length }}</small>
            </button>
            <template v-if="fold.later">
              <article v-for="r in rLater" :key="r.path" class="kcard routine r-later" @click="emit('open', { path: r.path, key: r.path })">
                <div class="k-meta"><span class="tag">Routine</span><span class="prio" title="Waits">◷</span></div>
                <h3>{{ r.full || r.title }}</h3>
                <p>{{ laterLabel(r) }}</p>
                <a v-if="r.deliverable" class="r-deliv" @click.stop="emit('open', { path: r.deliverable, key: r.deliverable })" :title="r.deliverable">📄 {{ delivName(r) }}</a>
                <div class="k-moves r-actions" @click.stop>
                  <button class="pill-btn ghost" :disabled="runState(r) === 'pending' || runState(r) === 'queued' || runState(r) === 'working'" @click="runRoutine(r)" title="Run it now anyway">Run now</button>
                </div>
              </article>
            </template>
            <button v-if="rFinished.length" class="r-fold" @click.stop="fold.done = !fold.done">
              <span class="caret" :class="{ open: fold.done }">▸</span>Done today <small>{{ rFinished.length }}</small>
            </button>
            <template v-if="fold.done">
              <article v-for="r in rFinished" :key="r.path" class="kcard routine r-done" @click="emit('open', { path: r.path, key: r.path })">
                <div class="k-meta"><span class="tag">Routine</span><span class="prio" title="Done today">✓</span></div>
                <h3>{{ r.full || r.title }}</h3>
                <p class="r-state ok">Done today · back {{ r.recurring === 'daily' ? 'tomorrow' : 'when due' }}</p>
                <a v-if="r.deliverable" class="r-deliv" @click.stop="emit('open', { path: r.deliverable, key: r.deliverable })" :title="r.deliverable">📄 {{ delivName(r) }}</a>
              </article>
            </template>
          </div>
          <div v-for="c in cols[col.key].cards" :key="c.path" class="krow" @mousemove="pickSide" @mouseleave="$event.currentTarget.dataset.side = ''">
          <!-- moving a card: a strip before and one after, in the colour of the column it goes to (back on the left, on on the right) -->
          <button v-if="side(c, 'prev')" class="k-side prev" :style="{ '--c': side(c, 'prev').bg }" :title="side(c, 'prev').label" :aria-label="side(c, 'prev').label" @click.stop="move(c, side(c, 'prev').to)"><span>‹ {{ side(c, 'prev').name }}</span></button>
          <article
            class="kcard" :class="{ dragging: dragging && dragging.path === c.path, active: activePath === c.path, 'drop-before': dropAt && dropAt.path === c.path && dropAt.pos === 'before', 'drop-after': dropAt && dropAt.path === c.path && dropAt.pos === 'after' }"
            draggable="true" @dragstart="onDragStart(c, $event)" @dragend="onDragEnd" @dragover="cardOver(c, $event)" @drop="cardDrop(c, $event)" @click="emit('open', { path: c.path, key: c.path })"
          >
            <!-- priority is a small signal in the corner, not a row of its own: 2 · 3 · 5 · 8 · 13 fill 1 to 5 bars -->
            <span class="bars" :class="{ none: !c.priority }" :title="c.priority ? 'Priority ' + c.priority + ' (score ' + c.score + ')' : 'Not rated yet'" :aria-label="c.priority ? 'Priority ' + c.priority : 'Not rated yet'">
              <i v-for="n in 5" :key="n" :class="{ on: n <= level(c.priority) }"></i>
            </span>
            <h3 class="rated">{{ c.title }}</h3>
            <p v-if="c.description">{{ c.description }}</p>
            <p v-if="col.key === 'not' && c.whyNot" class="why-not"><span>Why not</span>{{ c.whyNot }}</p>
            <div v-if="col.key === 'now' && c.nextStep" class="next-step">
              <span>Next step</span>{{ c.nextStep }}
            </div>
            <div v-if="col.key === 'now' && c.files && c.files.length" class="files" @click.stop>
              <button v-for="f in c.files" :key="f.path" class="file" :class="{ media: f.media }" @click="emit('open', { path: f.path })" :title="f.path">
                <template v-if="f.media">
                  <video v-if="f.video" :src="'/raw?path=' + encodeURIComponent(f.path) + '#t=0.5'" preload="metadata" muted></video>
                  <img v-else :src="'/raw?path=' + encodeURIComponent(f.path)" loading="lazy" />
                </template>
                <span v-else class="doc">{{ f.name }}</span>
              </button>
              <span v-if="c.moreFiles" class="more-files">+{{ c.moreFiles }}</span>
            </div>
            <div v-if="col.key === 'now'" class="k-moves" @click.stop>
              <button class="start" :disabled="working(c)" :title="c.nextStep ? 'Ask your assistant to do the next step' : 'Ask your assistant to start working on this'" @click="start(c)">{{ working(c) ? 'Working…' : c.nextStep ? 'Do the next step' : 'Start' }}</button>
            </div>
            <div class="k-foot">
              <span v-if="c.area">{{ c.area }}</span>
            </div>
          </article>
          <button v-if="side(c, 'next')" class="k-side next" :style="{ '--c': side(c, 'next').bg }" :title="side(c, 'next').label" :aria-label="side(c, 'next').label" @click.stop="move(c, side(c, 'next').to)"><span>{{ side(c, 'next').name }} ›</span></button>
          </div>
          <div v-if="col.key === 'routine' && !routines.length" class="empty">No routines yet. Ask Maybee to create one.</div>
          <div v-else-if="col.key !== 'routine' && !cols[col.key].cards.length" class="empty">Nothing here. Drag a card onto this column.</div>
        </div>
        <form v-if="col.key === 'maybe'" class="capture" @submit.prevent="addIdea" @dragover.stop @drop.stop>
          <input v-model="newTitle" maxlength="140" placeholder="Write an idea and press Enter" aria-label="New idea" :disabled="adding" />
        </form>
      </template>
    </section>

    <!-- every maybe idea, searchable -->
    <div v-if="showBacklog" class="sheet-wrap" @click.self="showBacklog = false">
      <div class="sheet">
        <div class="sheet-head">
          <h2>All maybe ideas <small>{{ backlog.length }}</small></h2>
          <button class="icon" @click="showBacklog = false">✕</button>
        </div>
        <input v-model="q" class="search" placeholder="Search ideas…" autofocus />
        <div class="sheet-list">
          <div v-for="c in filtered" :key="c.path" class="row">
            <span class="prio" :class="{ none: !c.priority }">{{ c.priority || '·' }}</span>
            <div class="row-main" @click="emit('open', { path: c.path, key: c.path })">
              <b>{{ c.title }}</b>
              <span v-if="c.description">{{ c.description }}</span>
            </div>
            <button class="pull" @click="pull(c, 'next')">Next</button>
            <button class="pull now" @click="pull(c, 'now')">Now</button>
          </div>
          <p v-if="!filtered.length" class="end">No idea matches.</p>
        </div>
      </div>
    </div>

    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>

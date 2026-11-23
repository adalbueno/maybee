<script setup>
import { ask, claude } from '../ask.js'
import { sideMove } from '../stages.js'
import NoteChat from './NoteChat.vue'
import { ref, computed, onMounted, watch, nextTick } from 'vue'
// preview: the board behind the membership lock, read-only, from /api/board/preview (the active workspace's cards).
const props = defineProps({ changedAt: Number, activePath: String, preview: Boolean })
const emit = defineEmits(['open'])

const cols = ref(null)
const dragging = ref(null)
const over = ref(null)
const openCol = ref('now') // the board always starts on Now
const nearNot = ref(false)
const nearRoutine = ref(false) // the pointer is at the right edge: the Routine column slides out, only when there are routines
// Routines have their own column; today's due state still controls their Run buttons.
const routines = ref([])
// the routines that can run now (not done today, not waiting for their time): their number is the yellow dot at the right edge
const rTodo = computed(() => routines.value.filter(r => !r.done && !r.later))
const todayISO = () => new Date().toISOString().slice(0, 10)
function runState(r) {
  const req = [...claude.items].find(i => i.path === r.path && i.action === 'Run routine' && String(i.at).slice(0, 10) === todayISO())
  return req ? req.status : null
}
// Start: the assistant works on a Now card. With a next step it does that; without one it picks the first step itself.
// Work seen: when each card was last opened, against its newest file (per viewer, in this browser).
// The first time, everything already there counts as seen, so only what arrives after shows a dot.
const SEEN_KEY = 'maybee.workSeen'
const workSeen = ref((() => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || 'null') } catch { return null } })())
const unseen = c => !!workSeen.value && c.newest > (workSeen.value[c.path] || 0)
function markSeen(paths) {
  const all = cols.value ? Object.values(cols.value).flatMap(col => col.cards || []) : []
  const next = { ...(workSeen.value || {}) }
  let changed = !workSeen.value
  for (const c of all) if ((!workSeen.value || paths.includes(c.path)) && c.newest && next[c.path] !== c.newest) { next[c.path] = c.newest; changed = true }
  if (!changed || !all.length) return
  workSeen.value = next
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(next)) } catch {}
}
// the open card counts as seen, also when a new file lands while it is open
watch([() => props.activePath, cols], () => markSeen(props.activePath ? [props.activePath] : []), { deep: false })
const working = c => [...claude.items].some(i => i.path === c.path && ['Work on this now', 'Do the next step'].includes(i.action) && ['pending', 'queued', 'working'].includes(i.status))
const start = c => ask({ action: c.nextStep ? 'Do the next step' : 'Work on this now', path: c.path, title: c.title })
const runRoutine = r => ask({ action: 'Run routine', path: r.path, title: r.full || r.title })
// A routine leaves by going to Not, and Not is the only place where a card is deleted. A note of type routine never shows on the board,
// so it stops being a routine on the way: it becomes an ordinary idea in Not, and the delete there is the usual one.
async function routineToNot(r) {
  const title = r.full || r.title
  const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: r.path, title, ...body }) })
  const a = await post('/api/fields', { fields: { type: 'idea' } })
  if (!a.ok) { say('Could not move it'); return }
  const b = await post('/api/stage', { stage: 'not' })
  if (!b.ok) { say('Could not move it'); return }
  routines.value = routines.value.filter(x => x.path !== r.path)
  say('Moved to Not. It is a regular card now: delete it there.')
  load()
}
// Routines are ordered by hand like any card (the order is the run order), and a card dropped on Routine becomes one.
const rDrag = ref(null) // the routine being dragged
const rOver = ref(null) // { path, pos }: where it would land
function rStart(r, e) { rDrag.value = r; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', r.path); dragGhost(e) }
function rEnd() { rDrag.value = null; rOver.value = null; over.value = null }
function rEnter(r, e) {
  if (!rDrag.value || rDrag.value.path === r.path) return
  e.preventDefault(); e.stopPropagation()
  const b = e.currentTarget.getBoundingClientRect()
  rOver.value = { path: r.path, pos: e.clientY < b.top + b.height / 2 ? 'before' : 'after' }
}
async function rDrop(r, e) {
  if (!rDrag.value || !rOver.value) return
  e.preventDefault(); e.stopPropagation()
  const d = rDrag.value, pos = rOver.value.pos
  rEnd()
  const list = routines.value.filter(x => x.path !== d.path)
  list.splice(list.findIndex(x => x.path === r.path) + (pos === 'after' ? 1 : 0), 0, d)
  routines.value = list
  const res = await fetch('/api/routines/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths: list.map(x => x.path) }) })
  if (!res.ok) say('Could not reorder')
  load()
}
// A routine back to a column of the board: it stops being a routine and becomes an ordinary card there (the mirror of making one)
async function routineToCard(r, stage) {
  const title = r.full || r.title
  const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: r.path, title, ...body }) })
  const a = await post('/api/fields', { fields: { type: stage === 'maybe' ? 'idea' : 'task', kind: '' } })
  if (!a.ok) { say('Could not move it'); return }
  const b = await post('/api/stage', { stage })
  if (!b.ok) { say('Could not move it'); return }
  routines.value = routines.value.filter(x => x.path !== r.path)
  say(`Back to ${stageName(stage)}. It is a regular card now.`)
  load()
}
// Not today: the routine skips today and comes back tomorrow (its last run does not change)
async function notToday(r) {
  const res = await fetch('/api/fields', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: r.path, title: r.full || r.title, fields: { not_today: new Date().toLocaleDateString('sv-SE') } }) })
  if (!res.ok) { say('Could not skip it'); return }
  routines.value = routines.value.filter(x => x.path !== r.path)
  say('Skipped for today. It comes back tomorrow.')
  load()
}
// A routine is a type of note, not a stage: making one changes the type (daily, run by hand until you set otherwise, see its Settings)
async function makeRoutine(card) {
  if (!card) return
  const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: card.path, title: card.title, ...body }) })
  const a = await post('/api/fields', { fields: { type: 'routine', kind: 'Routine', recurring: 'daily', auto: 'off' } })
  if (!a.ok) { say('Could not make it a routine'); return }
  if (['not', 'done'].includes(card.stage)) await post('/api/stage', { stage: 'now' }) // a routine in Not is a stopped one, and a routine is never "done": it comes back
  const col = cols.value[card.stage]
  if (col) { col.cards = col.cards.filter(c => c.path !== card.path); col.count-- }
  say('Now it is a routine: it comes back every day. Change that in its Settings.')
  load()
}
// moved: once the user has opened a column by hand, the next one opens in two steps (the drawer first, then its cards)
const moved = ref(false)
function toggle(key) { moved.value = true; openCol.value = key }
const showBacklog = ref(false)
const backlog = ref([])
const q = ref('')
const toast = ref('')

// the strip colours follow the column dots (style.css .dot.*): background and the text colour that reads on it
const STAGE = { delete: { bg: 'var(--bad)' }, maybe: { bg: '#c9c4b6' }, next: { bg: '#4a7dff' }, now: { bg: '#f2b705' }, done: { bg: 'var(--good)' }, not: { bg: 'var(--bad)' }, routine: { bg: '#a56bdb' } }
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
  { key: 'done', label: 'Done', hint: '' },
  { key: 'routine', label: 'Routine', hint: 'Recurring work' },
]
const weekAgo = Date.now() - 7 * 86400000
const wins = computed(() => cols.value ? cols.value.done.cards : [])
const winsThisWeek = computed(() => wins.value.filter(c => c.mtime >= weekAgo).length)
const when = ms => { const d = Math.round((Date.now() - ms) / 86400000); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 7 ? d + ' days ago' : new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }
// Routine hides at the right edge, like Not at the left: it shows only when there is a routine for today, and the pointer is at the edge or it is open
const hasRoutines = computed(() => routines.value.length > 0)
const shown = computed(() => COLS.filter(c => c.key === 'routine'
  ? openCol.value === 'routine' || (hasRoutines.value && nearRoutine.value) || !!dragging.value || !!rDrag.value // while a card is dragged it is a place to drop, even with no routine yet
  : !c.onlyWhileDragging || dragging.value || rDrag.value || openCol.value === c.key || (c.key === 'not' && nearNot.value)))
const routineBusy = r => ['pending', 'queued', 'working'].includes(runState(r))
const routineLabel = r => ({ working: 'Running…', queued: 'In line', pending: 'Sent' }[runState(r)] || 'Run')
const routineLine = r => runState(r) === 'working' ? 'Running now…' : runState(r) === 'queued' ? 'In line' : r.done ? 'Done today' : [r.recurring, r.at && 'at ' + r.at].filter(Boolean).join(' · ')

async function load() {
  if (props.preview) {
    const empty = Object.fromEntries(COLS.map(c => [c.key, { count: 0, cards: [] }]))
    const res = await fetch('/api/board/preview').then(r => r.ok ? r.json() : null).catch(() => null)
    cols.value = { ...empty, ...(res?.columns || {}) }
    // Now when there is something in it, then Next; with nothing else, Maybe, where a first idea goes
    openCol.value = ['now', 'next'].find(k => cols.value[k].cards.length) || 'maybe'
    return
  }
  const res = await fetch('/api/board').then(r => r.json())
  cols.value = res.columns
  routines.value = res.routinesToday || []
}
// A card opened from anywhere (a link, the chat, the URL, the feed) shows the column it is in, and the board scrolls to it.
// Only when a card is opened: moving between columns by hand is never undone.
function reveal(path) {
  if (!path || !cols.value) return
  const stage = Object.keys(cols.value).find(k => cols.value[k].cards.some(c => c.path === path)) || (routines.value.some(r => r.path === path) ? 'routine' : null)
  if (!stage) return
  if (openCol.value !== stage) toggle(stage)
  // the column opens first (its width, then its cards), so the card is only there a moment later
  setTimeout(() => nextTick(() => document.querySelector(`[data-path="${CSS.escape(path)}"]`)?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })), 320)
}
onMounted(() => load().then(() => reveal(props.activePath)))
// a note can open a column by a link (App.vue, onMaybee) while its card stays open
defineExpose({ show: key => { if (COLS.some(c => c.key === key)) toggle(key) } })
watch(() => props.activePath, reveal)
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
  if (card && stage === 'routine') return makeRoutine(card)
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

// the browser's own drag image is a snapshot of the card with its hover shadow and see-through corners: draw a clean, solid copy instead
function dragGhost(e) {
  const el = e.currentTarget, box = el.getBoundingClientRect()
  const ghost = el.cloneNode(true)
  ghost.classList.add('drag-ghost'); ghost.classList.remove('dragging', 'active', 'drop-before', 'drop-after')
  ghost.style.width = box.width + 'px'
  document.body.appendChild(ghost)
  e.dataTransfer.setDragImage(ghost, e.clientX - box.left, e.clientY - box.top)
  setTimeout(() => ghost.remove(), 0)
}
function onDragStart(card, e) { dragging.value = card; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', card.path); dragGhost(e) }
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

// Quick capture: a row of its own under the whole board, not part of a column. The title is the whole idea, Enter adds it at the top of Maybe.
// It looks like the chat on About (NoteChat), but saves the card itself, with or without an assistant listening.
// Then the board goes to the new card and marks it for a moment, so it is clear where it went; the cursor stays in the field for the next idea.
const fresh = ref(null) // the card just added: highlighted for a moment
let freshTimer = null
async function addIdea(title) {
  if (!title) return false
  const res = await fetch('/api/card', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.slice(0, 140) }) })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) { say(out.error || 'Could not add it'); return false }
  await load()
  fresh.value = out.path; clearTimeout(freshTimer); freshTimer = setTimeout(() => { fresh.value = null }, 2400)
  reveal(out.path)
  return true
}
function onDrop(stage) {
  if (rDrag.value) { const r = rDrag.value; rEnd(); if (stage === 'not') routineToNot(r); else if (stage !== 'routine') routineToCard(r, stage); return } // a routine goes to Not, or back to any column as a regular card
  const c = dragging.value; onDragEnd()
  if (stage === 'routine') return makeRoutine(c)
  move(c, stage)
}

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
  <div class="board-shell" v-if="cols">
  <div class="board" :class="{ moved }" @mouseleave="nearNot = false; nearRoutine = false">
    <div class="not-edge" aria-label="Reveal Not column" @mouseenter="nearNot = true"></div>
    <!-- the Routine column waits at the right edge; a yellow dot with a number says there are routines to run today -->
    <div v-if="hasRoutines && openCol !== 'routine'" class="routine-edge" :aria-label="rTodo.length ? rTodo.length + ' routines to run today' : 'Reveal Routine column'" @mouseenter="nearRoutine = true">
      <b v-if="rTodo.length" class="routine-due" :title="rTodo.length + (rTodo.length === 1 ? ' routine to run today' : ' routines to run today')">{{ rTodo.length }}</b>
    </div>
    <section
      v-for="col in shown" :key="col.key" class="col" :class="[col.key, { open: openCol === col.key, over: over === col.key }]"
      @dragover.prevent="over = col.key" @dragleave.self="over = null" @drop.prevent="onDrop(col.key)"
      @mouseenter="col.key === 'not' ? (nearNot = true) : col.key === 'routine' && (nearRoutine = true)" @mouseleave="col.key === 'not' ? (nearNot = false) : col.key === 'routine' && (nearRoutine = false)"
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
          <!-- a routine looks like any other card: its title, a line about it, one button -->
          <template v-if="col.key === 'routine'"><div v-for="r in routines" :key="r.path" class="krow" @mousemove="pickSide" @mouseleave="$event.currentTarget.dataset.side = ''">
            <button class="k-side prev" :style="{ '--c': '#a56bdb' }" title="Not today: it comes back tomorrow" aria-label="Not today" @click.stop="notToday(r)"><span>‹ Not today</span></button>
            <article class="kcard" :data-path="r.path" :class="{ active: activePath === r.path, dragging: rDrag && rDrag.path === r.path, 'drop-before': rOver && rOver.path === r.path && rOver.pos === 'before', 'drop-after': rOver && rOver.path === r.path && rOver.pos === 'after' }"
              draggable="true" @dragstart="rStart(r, $event)" @dragend="rEnd" @dragover="rEnter(r, $event)" @drop="rDrop(r, $event)" @click="emit('open', { path: r.path, key: r.path })">
              <h3>{{ r.full || r.title }}</h3>
              <p>{{ routineLine(r) }}</p>
              <div class="k-moves" @click.stop>
                <button class="start" :disabled="routineBusy(r) || r.done" @click="runRoutine(r)">{{ r.done ? 'Done today' : routineLabel(r) }}</button>
              </div>
            </article>
            <button class="k-side next" :style="{ '--c': 'var(--bad)' }" title="Stop this routine: it goes to Not, where it can be deleted" aria-label="Move to Not" @click.stop="routineToNot(r)"><span>Not ›</span></button>
          </div></template>
          <div v-for="c in cols[col.key].cards" :key="c.path" class="krow" @mousemove="pickSide" @mouseleave="$event.currentTarget.dataset.side = ''">
          <!-- moving a card: a strip before and one after, in the colour of the column it goes to (back on the left, on on the right) -->
          <button v-if="side(c, 'prev')" class="k-side prev" :style="{ '--c': side(c, 'prev').bg }" :title="side(c, 'prev').label" :aria-label="side(c, 'prev').label" @click.stop="move(c, side(c, 'prev').to)"><span>‹ {{ side(c, 'prev').name }}</span></button>
          <article
            class="kcard" :data-path="c.path" :class="{ dragging: dragging && dragging.path === c.path, active: activePath === c.path, fresh: fresh === c.path, 'drop-before': dropAt && dropAt.path === c.path && dropAt.pos === 'before', 'drop-after': dropAt && dropAt.path === c.path && dropAt.pos === 'after' }"
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
            <!-- the work is inside the card (its Work section): here only how many files, and a dot for one not seen yet -->
            <div v-if="c.fileCount" class="work-sig" :class="{ unseen: unseen(c) }" :title="c.fileCount + (c.fileCount === 1 ? ' file' : ' files') + ' in Work' + (unseen(c) ? ', something new since you last opened it' : '')">
              <span v-if="unseen(c)" class="new">New</span>{{ c.fileCount }} {{ c.fileCount === 1 ? 'file' : 'files' }}
            </div>
            <div v-if="col.key === 'now'" class="k-moves" @click.stop>
              <button class="start" :disabled="working(c)" :title="c.nextStep ? 'Ask your assistant to do the next step' : 'Ask your assistant to start working on this'" @click="start(c)">{{ working(c) ? 'Working…' : c.nextStep ? 'Do the next step' : 'Start' }}</button>
            </div>
          </article>
          <button v-if="side(c, 'next')" class="k-side next" :style="{ '--c': side(c, 'next').bg }" :title="side(c, 'next').label" :aria-label="side(c, 'next').label" @click.stop="move(c, side(c, 'next').to)"><span>{{ side(c, 'next').name }} ›</span></button>
          </div>
          <div v-if="col.key === 'routine' && !routines.length" class="empty">No routines yet. Ask Maybee to create one.</div>
          <div v-else-if="col.key !== 'routine' && !cols[col.key].cards.length" class="empty">Nothing here. Drag a card onto this column.</div>
        </div>
      </template>
    </section>
  </div>

    <!-- quick capture for the whole board: a row under all the columns, only the field -->
    <NoteChat class="capture" path="@board" title="Board" inline :quick="false" :submit="addIdea" placeholder="Write an idea and press Enter. It goes to Maybe." />

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

<script setup>
import AskClaude from './AskClaude.vue'
import RoutineSchedule from './RoutineSchedule.vue'
import { ask, claude } from '../ask.js'
import { ref, computed, onMounted, watch } from 'vue'
const props = defineProps({ changedAt: Number, activePath: String })
const emit = defineEmits(['open'])

const cols = ref(null)
const dragging = ref(null)
const over = ref(null)
const openCol = ref('now') // the board always starts on Now
// D242: today's routines, on top of Now until done (not draggable: a routine comes back every day)
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
function toggle(key) { openCol.value = key }
const showBacklog = ref(false)
const backlog = ref([])
const q = ref('')
const toast = ref('')

const COLS = [
  { key: 'maybe', label: 'Maybe', hint: 'Worth a look, by priority' },
  { key: 'next', label: 'Next', hint: 'The short queue' },
  { key: 'now', label: 'Now', hint: 'What we are working on' },
  { key: 'done', label: 'Done', hint: '' },
  { key: 'not', label: 'Not', hint: "Won't do", onlyWhileDragging: true },
]
const weekAgo = Date.now() - 7 * 86400000
const wins = computed(() => cols.value ? cols.value.done.cards : [])
const winsThisWeek = computed(() => wins.value.filter(c => c.mtime >= weekAgo).length)
const when = ms => { const d = Math.round((Date.now() - ms) / 86400000); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 7 ? d + ' days ago' : new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }
const shown = computed(() => COLS.filter(c => !c.onlyWhileDragging || dragging.value || openCol.value === c.key))

async function load() {
  const res = await fetch('/api/board').then(r => r.json())
  cols.value = res.columns
  routines.value = res.routinesToday || []
}
onMounted(load)
watch(() => props.changedAt, load)

function say(msg) { toast.value = msg; setTimeout(() => { if (toast.value === msg) toast.value = '' }, 2600) }

async function move(card, stage) {
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

function onDragStart(card, e) { dragging.value = card; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', card.path) }
function onDragEnd() { dragging.value = null; over.value = null }
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

const ownerMark = o => ({ agent: 'Agent', Adal: 'You', owner: 'You', both: 'You + agent' }[o] || null)
</script>

<template>
  <div class="board" v-if="cols">
    <section
      v-for="col in shown" :key="col.key" class="col" :class="[col.key, { open: openCol === col.key, over: over === col.key }]"
      @dragover.prevent="over = col.key" @dragleave.self="over = null" @drop.prevent="onDrop(col.key)"
    >
      <!-- collapsed: a narrow tab -->
      <button v-if="openCol !== col.key" class="col-tab" @click="toggle(col.key)" :title="'Open ' + col.label">
        <span v-if="col.key === 'done'" class="check sm">✓</span><span v-else class="dot" :class="col.key"></span><span class="v">{{ col.label }}</span><small>{{ cols[col.key].count }}</small>
      </button>

      <!-- open: Done shows the wins -->
      <template v-else-if="col.key === 'done'">
        <header class="wins-head">
          <h2><span class="check">✓</span>Done<small>{{ cols.done.count }}</small></h2>
          <p v-if="winsThisWeek">{{ winsThisWeek }} this week. Nice.</p>
          <p v-else>Drag a card here when it's finished.</p>
        </header>
        <div class="wins-list">
          <div v-for="c in wins" :key="c.path" class="win" :class="{ recent: c.mtime >= weekAgo }" draggable="true"
               @dragstart="onDragStart(c, $event)" @dragend="onDragEnd" @click="emit('open', { path: c.path, key: c.path })">
            <span class="win-dot">✓</span>
            <div><b>{{ c.title }}</b><small>{{ when(c.mtime) }}</small></div>
          </div>
        </div>
      </template>

      <!-- open -->
      <template v-else>
        <header class="col-head">
          <h2><span class="dot" :class="col.key"></span>{{ col.label }}<small>{{ cols[col.key].count }}<template v-if="col.key === 'now' && rLeft"> + {{ rLeft }} routines</template></small></h2>
          <p>{{ col.hint }}</p>
        </header>
        <div class="col-body">
          <div v-if="col.key === 'now' && routines.length" class="r-today">
            <div v-if="undo" class="r-undo">Removed “{{ undo.r.full || undo.r.title }}” <button class="link-btn" @click.stop="undoRemove">Undo</button></div>
            <div class="r-head">Today's routines <b class="r-count">{{ rDone }} of {{ routines.length }} done</b> <small>drag to set the order · they run in this order</small>
              <button v-if="rTodo.length" class="r-all" @click.stop="runAll" title="Send every routine that can run now to Claude, top to bottom">Run all ({{ rTodo.length }})</button>
            </div>
            <p v-if="!rTodo.length && rLater.length" class="r-empty">Nothing to do right now. Next: {{ rLater[0].full || rLater[0].title }}, {{ laterLabel(rLater[0]) }}.</p>
            <p v-else-if="!rTodo.length" class="r-empty ok">✓ All of today's routines are done.</p>
            <template v-for="({ r, part }, i) in rShown" :key="r.path">
            <div v-if="i === NEXT" class="r-sub">The rest for today</div>
            <div class="r-card" :class="{ 'r-next': part === 'next', 'r-dragging': rDrag === r.path, 'r-over': rOver === r.path && rDrag !== r.path, 'r-running': runState(r) === 'working', 'r-queued': runState(r) === 'queued' || runState(r) === 'pending' }"
                 draggable="true" @dragstart="rStart(r, $event)" @dragover="rEnter(r, $event)" @drop="rDrop(r, $event)" @dragend="rEnd"
                 @click="emit('open', { path: r.path, key: r.path })">
              <span v-if="runState(r) === 'working'" class="r-num r-spin" title="Claude is doing this now"></span>
              <span v-else class="r-num" title="Drag to reorder">{{ i + 1 }}</span>
              <div class="r-main">
                <b>{{ r.full || r.title }}</b>
                <span v-if="runState(r) === 'working'" class="r-state run">Claude is doing this now…</span>
                <span v-else-if="runState(r) === 'queued'" class="r-state">In line, Claude does it after the one running</span>
                <span v-else>{{ r.recurring }}<template v-if="r.at"> · at {{ r.at }}</template><template v-if="r.stale"> · <em>{{ r.idle }} days without</em></template><template v-if="r.auto"> · {{ autoLabel(r) }}</template></span>
                <a v-if="r.deliverable" class="r-deliv" @click.stop="emit('open', { path: r.deliverable, key: r.deliverable })" :title="r.deliverable">📄 {{ delivName(r) }}</a>
              </div>
              <button class="r-gear" :class="{ on: r.auto, open: gearFor === r.path }" @click.stop="openGear(r)" title="Run by itself: every session, or every N hours, days, weeks or months">⚙</button>
              <div class="r-split" @click.stop>
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
            </div>
            <RoutineSchedule v-if="gearFor === r.path" :r="r" cancelable @cancel="gearFor = null" @saved="v => { Object.assign(r, v); gearFor = null; say('Saved') }" />
            </template>
            <button v-if="rTodo.length > NEXT" class="r-fold" @click.stop="fold.more = !fold.more">
              <span class="caret" :class="{ open: fold.more }">▸</span>{{ fold.more ? 'Show only the next 3' : `${rTodo.length - NEXT} more for today` }}
            </button>
            <button v-if="rLater.length" class="r-fold" @click.stop="fold.later = !fold.later">
              <span class="caret" :class="{ open: fold.later }">▸</span>Later today <small>{{ rLater.length }}</small>
            </button>
            <template v-if="fold.later">
              <div v-for="r in rLater" :key="r.path" class="r-card r-later" @click="emit('open', { path: r.path, key: r.path })">
                <span class="r-num r-clock" title="Waits">◷</span>
                <div class="r-main"><b>{{ r.full || r.title }}</b><span>{{ laterLabel(r) }}</span><a v-if="r.deliverable" class="r-deliv" @click.stop="emit('open', { path: r.deliverable, key: r.deliverable })" :title="r.deliverable">📄 {{ delivName(r) }}</a></div>
                <div class="r-split" @click.stop>
                  <button class="pill-btn ghost" :disabled="runState(r) === 'pending' || runState(r) === 'queued' || runState(r) === 'working'" @click="runRoutine(r)" title="Run it now anyway">Run now</button>
                </div>
              </div>
            </template>
            <button v-if="rFinished.length" class="r-fold" @click.stop="fold.done = !fold.done">
              <span class="caret" :class="{ open: fold.done }">▸</span>Done today <small>{{ rFinished.length }}</small>
            </button>
            <template v-if="fold.done">
              <div v-for="r in rFinished" :key="r.path" class="r-card r-done" @click="emit('open', { path: r.path, key: r.path })">
                <span class="r-num r-check" title="Done today">✓</span>
                <div class="r-main"><b>{{ r.full || r.title }}</b><span class="r-state ok">Done today · back {{ r.recurring === 'daily' ? 'tomorrow' : 'when due' }}</span><a v-if="r.deliverable" class="r-deliv" @click.stop="emit('open', { path: r.deliverable, key: r.deliverable })" :title="r.deliverable">📄 {{ delivName(r) }}</a></div>
              </div>
            </template>
          </div>
          <article
            v-for="c in cols[col.key].cards" :key="c.path" class="kcard" :class="{ dragging: dragging && dragging.path === c.path, active: activePath === c.path }"
            draggable="true" @dragstart="onDragStart(c, $event)" @dragend="onDragEnd" @click="emit('open', { path: c.path, key: c.path })"
          >
            <div class="k-meta">
              <span class="tag">{{ c.type === 'task' ? 'Task' : 'Idea' }}</span>
              <span v-if="c.id" class="k-id">{{ c.id }}</span>
              <span v-if="c.priority" class="prio" :title="'Priority ' + c.priority + ' (score ' + c.score + ', D170)'">{{ c.priority }}</span>
            </div>
            <h3>{{ c.title }}</h3>
            <p v-if="c.description">{{ c.description }}</p>
            <div v-if="col.key === 'now'" class="next-step" :class="{ missing: !c.nextStep }">
              <span>Next step</span>{{ c.nextStep || 'Not written yet. Ask Claude what it should be.' }}
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
            <div class="k-foot">
              <span v-if="c.area">{{ c.area }}</span>
              <span v-if="ownerMark(c.owner)">{{ ownerMark(c.owner) }}</span>
              <AskClaude v-if="col.key === 'now'" class="k-ask" :path="c.path" :title="c.title" :quick="c.nextStep ? ['Do the next step', 'What is blocking this?'] : ['What should the next step be?', 'What is blocking this?']" small />
            </div>
          </article>
          <div v-if="!cols[col.key].cards.length" class="empty">Nothing here. Drag a card onto this column.</div>
        </div>
        <button v-if="col.key === 'maybe' && cols.maybe.count > cols.maybe.cards.length" class="more-ideas" @click="openBacklog">
          +{{ cols.maybe.count - cols.maybe.cards.length }} more ideas
        </button>
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

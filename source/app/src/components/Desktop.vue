<script setup>
import { ask, claude } from '../ask.js'
import { ref, computed, onMounted, watch } from 'vue'
const props = defineProps({ changedAt: Number, nums: Object, unread: Number })
const emit = defineEmits(['open', 'go'])

const d = ref(null)
const toast = ref('')
const rested = ref(false)
const raw = p => '/raw?path=' + encodeURIComponent(p)

async function load() { d.value = await fetch('/api/desktop').then(r => r.json()) }
onMounted(load)
watch(() => props.changedAt, load)
watch(() => d.value && d.value.idea && d.value.idea.path, () => {
  try { rested.value = localStorage.getItem('maybee.rested') === (d.value.today + d.value.idea.path) } catch {}
})

function say(m) { toast.value = m; setTimeout(() => { if (toast.value === m) toast.value = '' }, 2600) }
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

const greeting = computed(() => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
})
const dateLine = computed(() => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }))
const doneCount = computed(() => d.value ? d.value.rhythm.due.filter(r => r.done).length : 0)

// one maybe idea a day
const REACT = [
  { k: 'value_members', label: 'Members', hint: 'How much it helps members' },
  { k: 'value_money', label: 'Money', hint: 'How much it helps the business ($)' },
  { k: 'want', label: 'Want', hint: 'How much you want to do it' },
  { k: 'hard', label: 'Hard', hint: 'How hard it is' },
]
async function react(k, v) {
  const idea = d.value.idea
  idea.reactions[k] = v
  const res = await post('/api/fields', { path: idea.path, title: idea.title, fields: { [k]: v } })
  if (!res.ok) say('Could not save that reaction')
}
async function pullNext() {
  const idea = d.value.idea
  const res = await post('/api/stage', { path: idea.path, stage: 'next', title: idea.title })
  say(res.ok ? 'Moved to Next' : 'Could not move it')
  load()
}
function rest() {
  rested.value = true
  try { localStorage.setItem('maybee.rested', d.value.today + d.value.idea.path) } catch {}
}

async function keep(r) { await post('/api/routine/keep', { path: r.path, title: r.full || r.title }); say('Kept. It leaves this list for 14 days.'); load() }
async function drop(r) {
  const res = await post('/api/stage', { path: r.path, stage: 'not', title: r.full || r.title })
  say(res.ok ? 'Dropped (stage: not)' : 'Could not drop it'); load()
}
// ---------- to do today (D241): run a routine, run all, or let it run by itself ----------
const todo = computed(() => d.value ? d.value.rhythm.due.filter(r => !r.done && !r.skipped) : [])
const skippedToday = computed(() => d.value ? d.value.rhythm.due.filter(r => !r.done && r.skipped) : [])
const doneToday = computed(() => d.value ? d.value.rhythm.due.filter(r => r.done) : [])
const todayISO = () => new Date().toISOString().slice(0, 10)
function runState(r) {
  const req = [...claude.items].find(i => i.path === r.path && i.action === 'Run routine' && String(i.at).slice(0, 10) === todayISO())
  return req ? req.status : null
}
const offerAuto = ref({})
async function run(r) {
  await ask({ action: 'Run routine', path: r.path, title: r.full || r.title })
  if (!r.auto) offerAuto.value = { ...offerAuto.value, [r.path]: true }
}
async function runAll() {
  for (const r of todo.value) if (!runState(r)) await ask({ action: 'Run routine', path: r.path, title: r.full || r.title })
}
async function setAuto(r, on) {
  const res = await post('/api/fields', { path: r.path, title: r.full || r.title, fields: { auto_run: on ? 'true' : 'false' } })
  if (!res.ok) return say('Could not save that')
  r.auto = on
  offerAuto.value = { ...offerAuto.value, [r.path]: false }
  say(on ? 'Runs by itself at the start of each session, on the days it is due.' : 'Back to manual.')
}
// D243: routines in three tiers (importance: in the note; the badge was removed 7/11)
const TIERS = [
  { k: 'must', label: 'Must do', hint: 'the community depends on these today' },
  { k: 'should', label: 'Should do', hint: 'keeps growth going' },
  { k: 'nice', label: 'Nice to have', hint: 'when there is time' },
]
const tierOf = r => r.importance || 'should'
const tiers = computed(() => TIERS.map(t => {
  const all = d.value ? d.value.rhythm.due.filter(r => tierOf(r) === t.k) : []
  return { ...t, todo: all.filter(r => !r.done && !r.skipped), finished: all.filter(r => r.done), skipped: all.filter(r => !r.done && r.skipped), done: all.filter(r => r.done || r.skipped).length, total: all.length }
}).filter(t => t.total))
const mustTier = computed(() => tiers.value.find(t => t.k === 'must'))
// D244: not today (one day only; it comes back tomorrow, last_done stays)
async function notToday(r, on = true) {
  const res = await post('/api/fields', { path: r.path, title: r.full || r.title, fields: { not_today: on ? d.value.today : 'no' } })
  if (!res.ok) return say('Could not save that')
  r.skipped = on
  say(on ? 'Skipped for today. It comes back tomorrow.' : 'Back on today\'s list.')
}
// a tier opens or folds by clicking its heading; a tier with nothing left to do starts folded
const tierOpen = ref({})
const isOpen = t => tierOpen.value[t.k] ?? t.todo.length > 0
const toggleTier = t => { tierOpen.value = { ...tierOpen.value, [t.k]: !isOpen(t) } }
// Today / Tomorrow: a read-only preview of the routines due tomorrow
const view = ref('today')
const tomorrow = ref(null)
async function showTomorrow() {
  view.value = 'tomorrow'
  tomorrow.value = await fetch('/api/routines').then(r => r.json())
}
const tomorrowLabel = computed(() => tomorrow.value ? new Date(tomorrow.value.day + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : '')
const tomorrowTiers = computed(() => !tomorrow.value ? [] : TIERS.map(t => ({ ...t, list: tomorrow.value.rhythm.due.filter(r => tierOf(r) === t.k) })).filter(t => t.list.length))
async function runTier(t) { for (const r of t.todo) if (!runState(r)) await ask({ action: 'Run routine', path: r.path, title: r.full || r.title }) }

const whoLabel = w => w === 'you' ? 'you' : w === 'both' ? 'you + agent' : w === 'agent' ? 'agent' : ''
const lastLabel = r => r.last ? 'last done ' + new Date(r.last + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'never done'

const since = days => days >= 999 ? 'never done' : `${days} days ago`
</script>

<template>
  <div class="desk" v-if="d">
    <div class="desk-inner">
      <div class="hero">
        <div class="hero-kicker">{{ dateLine }}</div>
        <h1 class="hero-title"><b>{{ greeting }}, Adal.</b></h1>
        <p class="hero-sub">
          <template v-if="mustTier && mustTier.todo.length"><b class="hero-must">{{ mustTier.todo.length }} must-do {{ mustTier.todo.length === 1 ? 'routine' : 'routines' }} left</b> · </template><template v-else-if="mustTier"><b class="hero-must ok">Must-dos done</b> · </template>{{ doneCount }} of {{ d.rhythm.due.length }} routines done today<template v-if="d.waiting.length"> · {{ d.waiting.length }} things wait for you</template><template v-if="unread"> · <a class="inline" @click="emit('go', 'feed')">{{ unread }} unread in the feed</a></template>.
        </p>
      </div>

      <!-- to do today (D241), in tiers (D243) -->
      <section class="block">
        <h2 class="block-title">{{ view === 'today' ? 'To do today' : 'Tomorrow' }} <small v-if="view === 'today'">{{ doneCount }} of {{ d.rhythm.due.length }} done</small><small v-else>{{ tomorrowLabel }} · preview</small>
          <span class="day-switch">
            <button :class="{ on: view === 'today' }" @click="view = 'today'">Today</button>
            <button :class="{ on: view === 'tomorrow' }" @click="showTomorrow">Tomorrow</button>
          </span>
          <button v-if="view === 'today' && todo.length > 1" class="pill-btn yellow todo-all" @click="runAll">Run all ({{ todo.length }})</button>
        </h2>
        <div v-if="view === 'tomorrow'" class="preview">
          <p v-if="!tomorrow" class="all-done">Loading…</p>
          <template v-else>
            <p class="preview-note">This is how tomorrow's list will look: {{ tomorrow.rhythm.due.length }} routines due. The buttons work tomorrow.</p>
            <div v-for="t in tomorrowTiers" :key="t.k" class="tier" :class="'tier-' + t.k">
              <div class="tier-head static"><span class="tier-dot"></span><b>{{ t.label }}</b><small>0/{{ t.list.length }} · {{ t.hint }}</small></div>
              <div class="todo">
                <div v-for="r in t.list" :key="r.path" class="todo-row preview-row">
                  <div class="todo-main" @click="emit('open', { path: r.path })">
                    <b>{{ r.full || r.title }}</b>
                    <span>{{ r.recurring }}<template v-if="whoLabel(r.who)"> · {{ whoLabel(r.who) }}</template> · <em v-if="r.stale" class="stale">{{ since(r.idle) }}</em><template v-else>{{ lastLabel(r) }}</template></span>
                  </div>
                  <button class="skip-btn" disabled>Not today</button>
                  <button class="auto-btn" :class="{ on: r.auto }" disabled><i></i>Auto</button>
                  <button class="pill-btn run-btn" disabled>Run</button>
                </div>
              </div>
            </div>
          </template>
        </div>
        <template v-else>
        <div class="day-progress" :title="doneCount + ' of ' + d.rhythm.due.length + ' routines done today'">
          <span v-for="t in tiers" :key="t.k" class="seg" :class="t.k" :style="{ flexGrow: t.total }">
            <i :style="{ width: (t.done / t.total * 100) + '%' }"></i>
          </span>
        </div>

        <div v-for="t in tiers" :key="t.k" class="tier" :class="['tier-' + t.k, { folded: !isOpen(t), cleared: !t.todo.length }]">
          <div class="tier-head" @click="toggleTier(t)" :title="isOpen(t) ? 'Fold' : 'Open'">
            <span class="tier-caret">▸</span><span class="tier-dot"></span><b>{{ t.label }}</b>
            <small>{{ t.done }}/{{ t.total }}<template v-if="!t.todo.length"> ✓ all done</template><template v-else> · {{ t.hint }}</template></small>
            <button v-if="t.todo.length > 1" class="link-btn" @click.stop="runTier(t)">Run these {{ t.todo.length }}</button>
          </div>
          <template v-if="isOpen(t)">
          <div v-if="t.todo.length" class="todo">
            <div v-for="r in t.todo" :key="r.path" class="todo-row">
              <div class="todo-main" @click="emit('open', { path: r.path })">
                <b>{{ r.full || r.title }}</b>
                <span>{{ r.recurring }}<template v-if="whoLabel(r.who)"> · {{ whoLabel(r.who) }}</template> · <em v-if="r.stale" class="stale">{{ since(r.idle) }}</em><template v-else>{{ lastLabel(r) }}</template><template v-if="r.stale"> · <a class="drop-link" @click.stop="drop(r)">drop it</a></template></span>
                <span v-if="offerAuto[r.path]" class="todo-offer" @click.stop>
                  Run this by itself at the start of every session?
                  <button class="pill-btn yellow" @click="setAuto(r, true)">Yes, always</button>
                  <button class="pill-btn ghost" @click="offerAuto = { ...offerAuto, [r.path]: false }">Not now</button>
                </span>
              </div>
              <button class="skip-btn" @click="notToday(r)" title="Skip it today; it comes back tomorrow">Not today</button>
              <button class="auto-btn" :class="{ on: r.auto }" @click="setAuto(r, !r.auto)" :title="r.auto ? 'Runs by itself at session start (click to make it manual)' : 'Make it run by itself at session start'">
                <i></i>Auto
              </button>
              <button class="pill-btn run-btn" :class="runState(r)" :disabled="runState(r) === 'pending' || runState(r) === 'queued' || runState(r) === 'working'" @click="run(r)">
                {{ runState(r) === 'working' ? 'Running…' : runState(r) === 'queued' ? 'In line' : runState(r) === 'pending' ? 'Sent' : runState(r) === 'done' ? 'Run again' : 'Run' }}
              </button>
            </div>
          </div>
          <!-- done and skipped stay in their tier, checked (Adal 7/11) -->
          <div v-if="t.finished.length || t.skipped.length" class="todo done-list">
            <div v-for="r in t.finished" :key="r.path" class="todo-row is-done" @click="emit('open', { path: r.path })" :title="r.full || r.title">
              <i class="check">✓</i><b>{{ r.full || r.title }}</b><span v-if="r.auto" class="who">auto</span>
            </div>
            <div v-for="r in t.skipped" :key="r.path" class="todo-row is-skipped" :title="'Skipped today (' + (r.full || r.title) + ')'">
              <i class="check">–</i><b @click="emit('open', { path: r.path })">{{ r.full || r.title }}</b><span class="who">not today</span>
              <button class="skip-btn" @click="notToday(r, false)">Undo</button>
            </div>
          </div>
          </template>
        </div>

        </template>
        <div v-if="view === 'today' && d.rhythm.forgotten.length" class="forgotten">
          <p>Not done in 2+ weeks. Run it now, keep it for later, or drop it?</p>
          <div v-for="r in d.rhythm.forgotten" :key="r.path" class="fg">
            <a @click="emit('open', { path: r.path })">{{ r.full || r.title }}</a>
            <span class="ago">{{ since(r.idle) }}</span>
            <button class="auto-btn" :class="{ on: r.auto }" @click="setAuto(r, !r.auto)" title="Run it by itself at session start, on the days it is due"><i></i>Auto</button>
            <button class="pill-btn yellow" :disabled="runState(r) === 'pending' || runState(r) === 'queued' || runState(r) === 'working'" @click="run(r)">{{ runState(r) === 'working' ? 'Running…' : runState(r) === 'queued' ? 'In line' : runState(r) === 'pending' ? 'Sent' : 'Run' }}</button>
            <button class="pill-btn" @click="keep(r)">Keep</button>
            <button class="pill-btn ghost" @click="drop(r)">Drop</button>
          </div>
        </div>
      </section>

      <!-- waiting on Adal -->
      <section v-if="d.waiting.length" class="block">
        <h2 class="block-title">Waiting for you <small>{{ d.waiting.length }}</small></h2>
        <div class="waits">
          <div v-for="(w, i) in d.waiting" :key="i" class="wait" :class="{ link: w.link }" @click="w.link && emit('open', { path: w.link })">
            <b>{{ w.title }}</b>
            <span v-if="w.text">{{ w.text }}</span>
          </div>
        </div>
      </section>

      <!-- one maybe idea a day -->
      <section v-if="d.idea" class="block">
        <h2 class="block-title">Today's maybe <small>one idea a day · {{ d.idea.seenCount }} of {{ d.idea.total }} seen</small></h2>
        <div class="daily" :class="{ rested }">
          <div class="daily-main" @click="emit('open', { path: d.idea.path })">
            <div class="k-meta"><span class="tag">Idea</span><span v-if="d.idea.id" class="k-id">{{ d.idea.id }}</span><span v-if="d.idea.priority" class="prio">{{ d.idea.priority }}</span></div>
            <h3>{{ d.idea.title }}</h3>
            <p v-if="d.idea.description">{{ d.idea.description }}</p>
          </div>
          <template v-if="!rested">
            <div class="reacts">
              <div v-for="r in REACT" :key="r.k" class="react" :title="r.hint">
                <span>{{ r.label }}</span>
                <div class="scale">
                  <button v-for="v in [1, 2, 3]" :key="v" :class="{ on: Number(d.idea.reactions[r.k]) === v }" @click="react(r.k, v)">{{ v }}</button>
                </div>
              </div>
            </div>
            <div class="daily-actions">
              <button class="pill-btn yellow" @click="pullNext">Pull to Next</button>
              <button class="pill-btn ghost" @click="rest">Let it rest</button>
            </div>
          </template>
          <p v-else class="rest-note">Resting until tomorrow. A different idea comes then.</p>
        </div>
      </section>

      <!-- now, with its files -->
      <section class="block">
        <h2 class="block-title">Now <small>{{ d.now.length }}</small><a class="inline right" @click="emit('go', 'kanban')">Open the board</a></h2>
        <div class="nows">
          <article v-for="c in d.now" :key="c.path" class="nowcard">
            <div class="nowcard-main" @click="emit('open', { path: c.path })">
              <div class="k-meta"><span class="tag">{{ c.type === 'task' ? 'Task' : 'Idea' }}</span><span v-if="c.id" class="k-id">{{ c.id }}</span></div>
              <h3>{{ c.title }}</h3>
              <p v-if="c.description">{{ c.description }}</p>
              <div class="next-step" :class="{ missing: !c.nextStep }"><span>Next step</span>{{ c.nextStep || 'Not written yet. Ask Claude what it should be.' }}</div>
            </div>
            <div v-if="c.files.length" class="files">
              <button v-for="f in c.files" :key="f.path" class="file" :class="{ media: f.media }" @click="emit('open', { path: f.path })" :title="f.path">
                <template v-if="f.media">
                  <video v-if="f.video" :src="raw(f.path) + '#t=0.5'" preload="metadata" muted></video>
                  <img v-else :src="raw(f.path)" loading="lazy" />
                </template>
                <span v-else class="doc">{{ f.name }}</span>
              </button>
              <span v-if="c.moreFiles" class="more-files">+{{ c.moreFiles }}</span>
            </div>
            <p v-else class="no-files">No files linked from this note yet.</p>
          </article>
        </div>
      </section>
    </div>
    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>

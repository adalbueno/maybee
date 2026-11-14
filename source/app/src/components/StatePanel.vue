<script setup>
// About: the project's cover page. Where things are and where to go, not a long note. Built from the ordinary files.
import { ref, computed, watch, onMounted } from 'vue'
const props = defineProps({ changedAt: Number })
const emit = defineEmits(['open', 'go'])
const st = ref({ project: {}, focus: [], waiting: [], now: [], decisions: [], changes: [], updated: null })
const selectedWaiting = ref(null)
const resolving = ref(false)
const decisionMessage = ref('')
const counts = ref(null)
const files = ref([])
async function load() {
  try { st.value = await (await fetch('/api/state')).json() } catch {}
  try {
    const b = (await (await fetch('/api/board')).json()).columns
    const weekAgo = Date.now() - 7 * 86400000
    counts.value = { now: b.now.count, next: b.next.count, maybe: b.maybe.count, week: b.done.cards.filter(c => c.mtime >= weekAgo).length }
  } catch {}
  try { files.value = (await (await fetch('/api/library')).json()).items.filter(i => i.ext === '.md') } catch {}
}
const fileName = f => f.path.split('/').pop().replace(/\.md$/, '')
const cleanChange = t => String(t || '').replace(/^\(Maybee app\)\s*/, '').replace(/\s*\((?:[\w .'’-]+\/)*[^()]*\.\w+\)\s*$/, '')
const sub = f => { const t = f.desc || f.title || ''; return t.toLowerCase() === fileName(f).toLowerCase() ? '' : t }
const PLACES = [
  { key: 'workspace', name: 'Workspace', text: 'The board: what is in Maybe, Next, Now and Done, and the routines of the day.' },
  { key: 'activity', name: 'Activity', text: 'What changed lately, newest first.' },
  { key: 'vault', name: 'Vault', text: 'Every file of the project, with search.' },
]
// the files that hold the project's memory: its brief and state, who it is for, what it offers, how it sounds,
// the decisions made, and the owner and knowledge notes that sit directly in their folders
const KEY_FILES = ['PROJECT.md', 'STATE.md', 'README.md']
const memory = computed(() => {
  const by = path => files.value.find(f => f.path === path)
  const group = (label, items) => items.length ? { label, items } : null
  const inFolder = (dir, newestFirst = false) => {
    const list = files.value.filter(f => f.path.startsWith(dir) && f.path.split('/').length === dir.split('/').length)
    const byName = (x, y) => x.path.localeCompare(y.path)
    return list.sort(newestFirst ? (x, y) => byName(y, x) : byName).slice(0, 8)
  }
  return [
    group('The project', KEY_FILES.map(by).filter(Boolean)),
    group('Audience', inFolder('knowledge/audience/')),
    group('Offer', inFolder('knowledge/offer/')),
    group('Brand', inFolder('knowledge/brand/')),
    group('Decisions', inFolder('decisions/', true)),
    group('Owner', inFolder('owner/')),
    group('Knowledge', inFolder('knowledge/')),
  ].filter(Boolean)
})
onMounted(load)
watch(() => props.changedAt, load)
const dayLabel = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''
const open = path => path && emit('open', { path })
async function resolveItem(item, destination) {
  if (resolving.value) return
  resolving.value = true
  decisionMessage.value = ''
  try {
    const response = await fetch('/api/waiting/resolve', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: item.title, destination }),
    })
    const result = await response.json()
    if (!response.ok || !result.ok) throw new Error(result.error || 'Could not save this decision.')
    st.value.waiting = st.value.waiting.filter(x => x.title !== item.title)
    selectedWaiting.value = null
    decisionMessage.value = destination === 'task' ? 'Created in Next.' : destination === 'idea' ? 'Saved in Maybe.' : 'Moved to Not.'
    if (destination !== 'not') emit('open', { path: result.path })
  } catch (error) { decisionMessage.value = error.message }
  finally { resolving.value = false }
}
</script>

<template>
  <section class="overview-brief">
    <header class="brief-hero">
      <div>
        <span class="eyebrow">About</span>
        <h1>{{ st.project.title || 'Your project' }}</h1>
        <p v-if="st.project.summary">{{ st.project.summary }}</p>
      </div>
      <button v-if="st.project.path" class="source-link" @click="open(st.project.path)">Open project brief</button>
    </header>

    <section v-if="st.project.goal || st.focus.length" class="brief-block now-state">
      <div class="block-head"><div><span class="eyebrow">Where we are</span><h2>Goal and focus</h2></div><button v-if="st.updated" class="source-link" @click="open('STATE.md')" :title="'STATE.md, updated ' + dayLabel(st.updated)">STATE · {{ dayLabel(st.updated) }}</button></div>
      <article v-if="st.project.goal" class="brief-card clickable goal-card" @click="open(st.project.path)"><span class="eyebrow">Current goal</span><b>{{ st.project.goal }}</b></article>
      <article v-for="(item, i) in st.focus" :key="'focus-' + i" class="brief-card clickable" :class="{ clickable: true }" @click="open(item.link || 'STATE.md')">
        <span class="eyebrow">Focus</span><b>{{ item.title }}</b><p v-if="item.text">{{ item.text }}</p>
      </article>
    </section>

    <div v-if="counts" class="about-nums">
      <button v-for="(n, i) in [['Now', counts.now], ['Next', counts.next], ['Maybe', counts.maybe], ['Done this week', counts.week]]" :key="n[0]" :class="{ hot: i === 0 && n[1] }" @click="emit('go', 'workspace')"><span>{{ n[0] }}</span><b>{{ n[1] }}</b></button>
    </div>

    <section v-if="st.waiting.length" class="brief-block waiting-block">
      <div class="block-head"><div><span class="eyebrow">Needs a decision</span><h2>Waiting for you</h2></div><small>{{ st.waiting.length }}</small></div>
      <p v-if="decisionMessage" class="decision-message">{{ decisionMessage }}</p>
      <div class="compact-grid">
        <article v-for="(item, i) in st.waiting" :key="'waiting-' + i" class="brief-card waiting clickable" :class="{ selected: selectedWaiting === i }" @click="selectedWaiting = selectedWaiting === i ? null : i">
          <div class="waiting-title"><b>{{ item.title }}</b><span>{{ selectedWaiting === i ? 'Close' : 'Decide' }}</span></div>
          <p>{{ item.text }}</p>
          <div v-if="selectedWaiting === i" class="decision-actions" @click.stop>
            <button v-if="item.link" class="source" @click="open(item.link)">Open source</button>
            <button @click="resolveItem(item, 'task')" :disabled="resolving">Create task</button>
            <button @click="resolveItem(item, 'idea')" :disabled="resolving">Keep as idea</button>
            <button class="not" @click="resolveItem(item, 'not')" :disabled="resolving">Move to Not</button>
          </div>
        </article>
      </div>
    </section>

    <section class="brief-block">
      <div class="block-head"><div><span class="eyebrow">Go to</span><h2>Where things are</h2></div></div>
      <div class="place-cards">
        <button v-for="p in PLACES" :key="p.key" class="place-card" @click="emit('go', p.key)"><b>{{ p.name }}<i>→</i></b><p>{{ p.text }}</p></button>
      </div>
    </section>

    <section v-if="memory.length" class="brief-block">
      <div class="block-head"><div><span class="eyebrow">Memory</span><h2>The project's own files</h2></div></div>
      <div class="memory-grid">
        <div v-for="g in memory" :key="g.label" class="file-group">
          <span class="eyebrow">{{ g.label }}</span>
          <button v-for="f in g.items" :key="f.path" class="mem-row" @click="open(f.path)" :title="f.path"><b>{{ fileName(f) }}</b><span v-if="sub(f)">{{ sub(f) }}</span></button>
        </div>
      </div>
    </section>

    <section class="brief-block">
      <div class="block-head"><div><span class="eyebrow">Latest movement</span><h2>Recent changes</h2></div><button class="source-link" @click="emit('go', 'activity')">See all</button></div>
      <div v-if="st.changes.length" class="timeline changes">
        <button v-for="(change, i) in st.changes.slice(0, 5)" :key="change.date + i" @click="open(change.path)">
          <span>{{ dayLabel(change.date) }}</span><div><p>{{ cleanChange(change.text) }}</p></div>
        </button>
      </div>
      <p v-else class="empty">Changes recorded in logs/CHANGELOG.md will appear here.</p>
    </section>
  </section>
</template>

<style scoped>
.overview-brief { max-width: 820px; margin: 0 auto 42px; }
.brief-hero { display: flex; justify-content: space-between; align-items: flex-end; gap: 28px; padding: 30px 2px 24px; border-bottom: 1px solid var(--line); }
.eyebrow { display: block; color: var(--ink-3); font: 700 11px/1 var(--sans); letter-spacing: .1em; text-transform: uppercase; margin-bottom: 9px; }
.brief-hero h1 { margin: 0; max-width: 760px; font: 750 38px/1.08 var(--sans); letter-spacing: -.035em; }
.brief-hero p { max-width: 760px; margin: 12px 0 0; color: var(--ink-2); font-size: 15px; line-height: 1.55; }
.source-link { flex: none; border: 1px solid var(--line); background: var(--card); border-radius: 999px; padding: 9px 14px; color: var(--ink-2); font: 650 12px/1 var(--sans); cursor: pointer; }
.source-link:hover { color: var(--ink); border-color: var(--ink-3); }
.brief-meta { display: flex; gap: 10px; align-items: center; padding: 11px 2px 28px; color: var(--ink-3); font: 600 11.5px/1 var(--sans); }
.brief-meta span:last-child:not(:first-child) { margin-left: auto; }
.status-dot { width: 7px; height: 7px; border-radius: 50%; background: #4f9b69; }
.brief-grid { display: grid; grid-template-columns: 1fr; gap: 34px; }
.lower-grid { margin-top: 34px; grid-template-columns: 1fr; }
.brief-block { min-width: 0; }
.block-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 14px; margin: 0 0 14px; }
.block-head .eyebrow { margin-bottom: 6px; }
.block-head h2 { margin: 0; font: 720 20px/1.1 var(--sans); letter-spacing: -.02em; }
.block-head small { color: var(--ink-3); font: 650 11px/1 var(--sans); }
.stack { display: grid; gap: 10px; }
.brief-card { background: var(--card); border-radius: 20px; padding: 17px 18px; border: 1px solid transparent; box-shadow: 0 1px 2px rgba(39, 37, 31, .035); transition: background .15s, transform .15s, box-shadow .15s; }
.brief-card.clickable { cursor: pointer; }
.brief-card.clickable:hover { background: #eeede7; box-shadow: 0 5px 16px rgba(39, 37, 31, .07); transform: translateY(-1px); }
.brief-card b { display: block; font: 680 14px/1.3 var(--sans); }
.brief-card p { margin: 5px 0 0; color: var(--ink-2); font-size: 13px; line-height: 1.45; }
.brief-card em { display: block; margin-top: 9px; color: var(--ink-3); font: 600 11.5px/1.4 var(--sans); font-style: normal; }
.card-line { display: flex; justify-content: space-between; gap: 12px; }
.card-line span { color: var(--ink-3); font: 700 9.5px/1 var(--sans); letter-spacing: .06em; text-transform: uppercase; }
.waiting-block { margin-top: 34px; }
.compact-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 9px; }
.brief-card.waiting { border-left: 3px solid var(--accent); }
.brief-card.waiting.selected { background: var(--card-hi); box-shadow: 0 0 0 1px var(--line); }
.waiting-title { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; }
.waiting-title span { flex: none; color: var(--ink-3); font: 700 9.5px/1 var(--sans); letter-spacing: .07em; text-transform: uppercase; }
.decision-actions { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); }
.decision-actions button { border: 0; border-radius: 999px; padding: 8px 11px; background: var(--ink); color: #fff; font: 650 11px/1 var(--sans); cursor: pointer; }
.decision-actions button:hover { transform: translateY(-1px); }
.decision-actions button:disabled { opacity: .45; cursor: wait; }
.decision-actions button.source { margin-right: auto; background: transparent; box-shadow: inset 0 0 0 1px var(--line); color: var(--ink-2); }
.decision-actions button.not { background: transparent; color: var(--ink-3); }
.decision-message { margin: -4px 4px 12px; color: var(--ink-3); font: 600 12px/1.4 var(--sans); }
.timeline { display: grid; gap: 9px; }
.timeline button { display: grid; grid-template-columns: 48px 1fr; gap: 10px; width: 100%; padding: 15px 16px; text-align: left; border: 1px solid transparent; border-radius: 18px; background: var(--card); color: inherit; cursor: pointer; transition: background .15s, transform .15s, box-shadow .15s; }
.timeline button:hover { background: #eeede7; box-shadow: 0 5px 16px rgba(39, 37, 31, .07); transform: translateY(-1px); }
.timeline button > span { color: var(--ink-3); font: 700 10.5px/1.4 var(--sans); }
.timeline button b { font: 650 13px/1.4 var(--sans); }
.timeline button p { margin: 3px 0 0; color: var(--ink-2); font-size: 12px; line-height: 1.4; }
.changes button { grid-template-columns: 54px 1fr; }
.empty { margin: 0; min-height: 92px; display: grid; place-items: center; padding: 18px; border: 1px dashed var(--line); border-radius: 20px; background: rgba(255,255,255,.2); color: var(--ink-3); font-size: 13px; line-height: 1.5; text-align: center; }
@media (max-width: 900px) { .brief-grid, .lower-grid { grid-template-columns: 1fr; } .compact-grid { grid-template-columns: 1fr; } }
@media (max-width: 620px) { .brief-hero { align-items: flex-start; flex-direction: column; } .brief-hero h1 { font-size: 31px; } .brief-meta span:last-child { display: none; } }
.now-state { margin-top: 30px; display: grid; gap: 10px; }
.now-state .block-head { margin-bottom: 4px; }
.now-state .brief-card .eyebrow { margin-bottom: 7px; }
.goal-card { background: var(--accent-soft, #fff6c2); }
.goal-card b { font-size: 16.5px; line-height: 1.4; }
.about-nums { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 26px 0 0; }
.about-nums button { background: var(--card); border-radius: 18px; padding: 15px 17px 14px; text-align: left; display: flex; flex-direction: column; gap: 10px; }
.about-nums button:hover { background: var(--card-hi); box-shadow: 0 0 0 2px var(--accent); }
.about-nums button.hot { background: var(--accent); }
.about-nums span { font-size: 12.5px; color: var(--ink-2); font-weight: 650; }
.about-nums b { font: 750 32px/1 var(--sans); letter-spacing: -.035em; }
.overview-brief > .brief-block { margin-top: 46px; }
.place-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.place-card { background: var(--card); border-radius: 18px; padding: 17px 18px; text-align: left; display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-start; gap: 6px; }
.place-card:hover { background: var(--card-hi); box-shadow: 0 0 0 2px var(--accent); }
.place-card b { width: 100%; display: flex; justify-content: space-between; font-size: 15.5px; letter-spacing: -.015em; }
.place-card b i { font-style: normal; color: var(--ink-3); }
.place-card:hover b i { color: var(--ink); }
.place-card p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--ink-2); }
.memory-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 26px; }
.file-group { display: flex; flex-direction: column; gap: 2px; }
.file-group .eyebrow { margin: 0 0 8px 12px; }
.mem-row { display: flex; flex-direction: column; gap: 2px; align-items: flex-start; text-align: left; width: 100%; padding: 9px 12px; border-radius: 14px; }
.mem-row:hover { background: var(--card); }
.mem-row b { font-size: 14px; letter-spacing: -.01em; }
.mem-row span { font-size: 12.5px; color: var(--ink-3); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.timeline.changes { gap: 0; }
.timeline.changes button { background: transparent; border-radius: 0; border: 0; border-top: 1px solid var(--line); padding: 14px 6px; grid-template-columns: 64px 1fr; align-items: baseline; box-shadow: none; transform: none; }
.timeline.changes button:hover { background: var(--card); box-shadow: none; transform: none; }
.timeline.changes button p { margin: 0; font-size: 13.5px; color: var(--ink); }
.timeline.changes button > span { font-size: 12px; }
@media (max-width: 640px) { .about-nums { grid-template-columns: 1fr 1fr; } .place-cards, .memory-grid { grid-template-columns: 1fr; } }
</style>

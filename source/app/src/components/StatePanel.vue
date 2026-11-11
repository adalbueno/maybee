<script setup>
// D273: Overview is the workspace's live briefing, assembled from its ordinary files.
import { ref, watch, onMounted } from 'vue'
const props = defineProps({ changedAt: Number })
const emit = defineEmits(['open'])
const st = ref({ project: {}, focus: [], waiting: [], now: [], decisions: [], changes: [], updated: null })
const selectedWaiting = ref(null)
const resolving = ref(false)
const decisionMessage = ref('')
async function load() {
  try { st.value = await (await fetch('/api/state')).json() } catch {}
}
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
        <span class="eyebrow">Project overview</span>
        <h1>{{ st.project.title || 'Your project' }}</h1>
        <p v-if="st.project.summary">{{ st.project.summary }}</p>
      </div>
      <button v-if="st.project.path" class="source-link" @click="open(st.project.path)">Open project brief</button>
    </header>

    <div class="brief-meta">
      <span class="status-dot"></span><span>Current workspace</span>
      <span v-if="st.updated">STATE updated {{ dayLabel(st.updated) }}</span>
    </div>

    <div class="brief-grid">
      <section class="brief-block focus-block">
        <div class="block-head"><div><span class="eyebrow">Current state</span><h2>What matters now</h2></div><small>{{ st.focus.length }} focus item{{ st.focus.length === 1 ? '' : 's' }}</small></div>
        <div v-if="st.focus.length" class="stack">
          <article v-for="(item, i) in st.focus" :key="'focus-' + i" class="brief-card" :class="{ clickable: item.link }" @click="open(item.link)">
            <b>{{ item.title }}</b><p>{{ item.text }}</p>
          </article>
        </div>
        <p v-else class="empty">Nothing is marked as a current focus yet.</p>
      </section>

      <section class="brief-block now-block">
        <div class="block-head"><div><span class="eyebrow">Workspace</span><h2>In Now</h2></div><small>{{ st.now.length }} card{{ st.now.length === 1 ? '' : 's' }}</small></div>
        <div v-if="st.now.length" class="stack">
          <article v-for="card in st.now" :key="card.path" class="brief-card clickable" @click="open(card.path)">
            <div class="card-line"><b>{{ card.title }}</b><span>{{ card.type }}</span></div>
            <p v-if="card.description">{{ card.description }}</p>
            <em v-if="card.nextStep">Next: {{ card.nextStep }}</em>
          </article>
        </div>
        <p v-else class="empty">Nothing is in Now. Move one clear next action there when it deserves attention.</p>
      </section>
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

    <div class="brief-grid lower-grid">
      <section class="brief-block">
        <div class="block-head"><div><span class="eyebrow">Why we work this way</span><h2>Recent decisions</h2></div></div>
        <div v-if="st.decisions.length" class="timeline">
          <button v-for="decision in st.decisions" :key="decision.id" @click="open(decision.path)">
            <span>{{ decision.id }}</span><div><b>{{ decision.title }}</b><p v-if="decision.text">{{ decision.text }}</p></div>
          </button>
        </div>
        <p v-else class="empty">No decision register yet. Decisions recorded in knowledge/decisions.md will appear here.</p>
      </section>

      <section class="brief-block">
        <div class="block-head"><div><span class="eyebrow">Latest movement</span><h2>Recent changes</h2></div></div>
        <div v-if="st.changes.length" class="timeline changes">
          <button v-for="(change, i) in st.changes" :key="change.date + i" @click="open(change.path)">
            <span>{{ dayLabel(change.date) }}</span><div><p>{{ change.text }}</p></div>
          </button>
        </div>
        <p v-else class="empty">Changes recorded in logs/CHANGELOG.md will appear here.</p>
      </section>
    </div>
  </section>
</template>

<style scoped>
.overview-brief { max-width: 1180px; margin: 0 auto 42px; }
.brief-hero { display: flex; justify-content: space-between; align-items: flex-end; gap: 28px; padding: 30px 2px 24px; border-bottom: 1px solid var(--line); }
.eyebrow { display: block; color: var(--ink-3); font: 700 11px/1 var(--sans); letter-spacing: .1em; text-transform: uppercase; margin-bottom: 9px; }
.brief-hero h1 { margin: 0; max-width: 760px; font: 750 38px/1.08 var(--sans); letter-spacing: -.035em; }
.brief-hero p { max-width: 760px; margin: 12px 0 0; color: var(--ink-2); font-size: 15px; line-height: 1.55; }
.source-link { flex: none; border: 1px solid var(--line); background: var(--card); border-radius: 999px; padding: 9px 14px; color: var(--ink-2); font: 650 12px/1 var(--sans); cursor: pointer; }
.source-link:hover { color: var(--ink); border-color: var(--ink-3); }
.brief-meta { display: flex; gap: 10px; align-items: center; padding: 11px 2px 28px; color: var(--ink-3); font: 600 11.5px/1 var(--sans); }
.brief-meta span:last-child:not(:first-child) { margin-left: auto; }
.status-dot { width: 7px; height: 7px; border-radius: 50%; background: #4f9b69; }
.brief-grid { display: grid; grid-template-columns: 1.15fr .85fr; gap: 34px; }
.lower-grid { margin-top: 34px; grid-template-columns: 1fr 1fr; }
.brief-block { min-width: 0; }
.block-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 14px; margin: 0 4px 13px; }
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
</style>

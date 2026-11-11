<script setup>
import { computed } from 'vue'
import { humanize } from '../humanize.js'
import { claude } from '../ask.js'
const props = defineProps({ item: Object, fresh: Boolean, active: Boolean })
const emit = defineEmits(['open'])

const raw = p => '/raw?path=' + encodeURIComponent(p)
const time = computed(() => new Date(props.item.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))
const shown = computed(() => (props.item.files || []).slice(0, 4))
const extra = computed(() => Math.max(0, (props.item.files || []).length - 4))
// the agent's changelog line, only when it was written the same day as this change
const showNote = computed(() => {
  const c = props.item.caption
  if (!c || (props.item.diff && props.item.diff.lines)) return false
  const d = new Date(props.item.time)
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return c.date === day
})
const chip = computed(() => props.item.routine ? null : (props.item.stage || props.item.status || null))
// routines: today's status instead of the stage, and the last log line instead of the note's opening text
const rt = computed(() => props.item.routine || null)
const dayLabel = d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const rtStatus = computed(() => {
  const r = rt.value
  if (!r) return null
  // live: what Claude is doing with it right now (from the app's inbox)
  const today = new Date().toISOString().slice(0, 10)
  const req = claude.items.find(i => i.path === props.item.path && i.action === 'Run routine' && String(i.at).slice(0, 10) === today && i.status !== 'done')
  if (req && req.status === 'working') return { cls: 's-running', text: 'Running now' }
  if (req) return { cls: 's-queued', text: req.status === 'queued' ? 'In line' : 'Sent to Claude' }
  if (r.doneToday) return { cls: 's-done', text: 'Done today' }
  if (r.skippedToday) return { cls: 's-not', text: 'Not today' }
  return { cls: 's-now', text: r.lastDone ? `Last done ${dayLabel(r.lastDone)}` : 'Never done' }
})

// a big check on the right when it's done: a routine done today, or a note/post that is done or published
const isDone = computed(() => rt.value ? !!(rtStatus.value && rtStatus.value.cls === 's-done') : ['done', 'published'].includes(String(chip.value || '').toLowerCase()))

const key = computed(() => props.item.type === 'decision' ? 'decision:' + props.item.id : props.item.type === 'media' ? 'media:' + props.item.id : props.item.path)
function openCard() {
  const it = props.item
  if (it.type === 'media') emit('open', { path: it.files[0].path, group: it.files.map(f => f.path), key: key.value })
  else emit('open', { path: it.path, decision: it.type === 'decision' ? it.id : null, key: key.value })
}
function openFile(i) {
  const it = props.item
  emit('open', { path: it.files[i].path, group: it.files.map(f => f.path), key: key.value })
}
const human = computed(() => props.item.caption ? humanize(props.item.caption.text) : { who: '', text: '' })
</script>

<template>
  <article class="card" :class="['is-' + item.type, { fresh, active, unread: !item.read, 'has-media': item.type === 'media', 'is-done': isDone }]" @click="openCard">
    <div class="meta">
      <span v-if="!item.read" class="unread-dot" title="Not seen yet"></span>
      <span class="tag">{{ item.kind }}</span>
      <span class="time">{{ time }}</span>
      <span v-if="isDone" class="done-check" :title="rt ? 'Done today' : chip"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>{{ rt ? 'Done today' : chip }}</span>
      <span v-else-if="rtStatus" class="pill" :class="rtStatus.cls">{{ rtStatus.text }}</span>
      <span v-if="rt && rt.schedule" class="sched">↻ {{ rt.schedule }}</span>
      <span v-if="chip && !isDone" class="pill" :class="'s-' + String(chip).toLowerCase().split(/[ (]/)[0]">{{ chip }}</span>
      <a v-if="item.link" class="ext" :href="item.link" target="_blank" rel="noopener" @click.stop>Open live ↗</a>
      <span v-if="item.diff && item.diff.isNew" class="pill s-new">new</span>
      <span v-if="fresh" class="new">just changed</span>
    </div>

    <h3 class="title">{{ item.title }}</h3>
    <p v-if="item.context" class="context">{{ item.context }}</p>

    <div v-if="rt && rt.lastLog" class="lastlog"><b>{{ dayLabel(rt.lastLog.date) }}</b>{{ rt.lastLog.text }}</div>
    <p v-if="item.excerpt && !(rt && rt.lastLog)" class="excerpt" :class="{ short: item.diff && item.diff.lines }">{{ item.excerpt }}</p>
    <div v-if="item.diff && item.diff.lines" class="diff">
      <div class="diff-head"><em>Changed since you looked<template v-if="item.diff.section"> · in <b class="sec">{{ item.diff.section }}</b></template></em><span><b class="add">+{{ item.diff.added }}</b><b v-if="item.diff.removed" class="del">−{{ item.diff.removed }}</b></span></div>
      <div v-for="(l, i) in item.diff.lines.filter(l => l.t !== 'c')" :key="i" class="dl" :class="l.t === '+' ? 'add' : 'del'"><i>{{ l.t === '+' ? '+' : '−' }}</i>{{ l.s }}</div>
    </div>
    <p v-if="item.type === 'decision'" class="excerpt">{{ item.text }}</p>

    <p v-if="showNote && item.type === 'media'" class="caption"><span>{{ human.who }}</span>{{ human.text }}</p>
    <div v-if="item.type === 'media'" class="media" :class="'n' + Math.min(shown.length, 4)">
      <div v-for="(f, i) in shown" :key="f.path" class="thumb" @click.stop="openFile(i)">
        <video v-if="f.video" :src="raw(f.path) + '#t=0.5'" preload="metadata" muted playsinline></video>
        <img v-else :src="raw(f.path)" loading="lazy" :alt="f.path" />
        <span v-if="f.video" class="play">▶</span>
        <span v-if="i === 3 && extra" class="extra">+{{ extra }}</span>
      </div>
    </div>

    <p v-if="showNote && item.type !== 'media'" class="caption"><span>{{ human.who }}</span>{{ human.text }}</p>
    <p class="path">{{ item.type === 'media' ? item.dir : item.path }}</p>
  </article>
</template>

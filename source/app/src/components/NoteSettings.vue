<script setup>
// D249: settings of an ideas/ note, as clickable chips in the viewer's top row (next to stage and saved).
// Each chip opens a small popover. "Make it a routine" = switch the type chip to Routine.
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import RoutineSchedule from './RoutineSchedule.vue'
const props = defineProps({ path: String, title: String, fm: Object })
const emit = defineEmits(['changed'])

const TYPES = [['idea', 'Idea'], ['task', 'Task'], ['routine', 'Routine']]
const TIERS = [['must', 'Must'], ['should', 'Should'], ['nice', 'Nice']]
const OWNERS = [['agent', 'Claude'], ['owner', 'Adal'], ['both', 'Both']]
const REACT = [['value_members', 'Value for members'], ['value_money', 'Value for money'], ['want', 'I want it'], ['hard', 'Hard to do']]
const SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const local = ref({})
const pop = ref(null) // which chip's popover is open
const msg = ref('')
watch(() => [props.path, props.fm], () => { local.value = { ...(props.fm || {}) } }, { immediate: true, deep: true })
watch(() => props.path, () => { pop.value = null })
const type = computed(() => String(local.value.type || 'idea'))

async function setFields(fields, close = true) {
  const res = await fetch('/api/fields', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: props.path, title: props.title, fields }) })
  if (!res.ok) { msg.value = 'Not saved'; return }
  Object.assign(local.value, fields); msg.value = ''
  if (close) pop.value = null
  emit('changed')
}
function switchType(t) {
  if (t === type.value) { pop.value = null; return }
  const f = { type: t }
  if (t === 'routine') { f.kind = 'Routine'; if (!local.value.recurring) f.recurring = 'daily'; if (!local.value.auto) f.auto = 'off' }
  if (t === 'task' && (!local.value.kind || local.value.kind === 'Routine')) f.kind = 'Do'
  setFields(f)
}

const routine = computed(() => {
  const fm = local.value
  let mode = ['off', 'session', 'hours', 'days', 'weeks', 'months'].includes(fm.auto) ? fm.auto : null
  if (!mode) mode = (fm.auto_run === true || fm.auto_run === 'true') ? 'session' : 'off'
  return {
    path: props.path, title: props.title, autoMode: mode,
    autoEvery: Math.max(1, parseInt(fm.auto_every, 10) || (mode === 'hours' ? 3 : 1)),
    autoDays: String(fm.auto_days || '').toLowerCase().split(/[-,\s]+/).filter(d => SHORT.includes(d)),
    autoMday: Math.max(1, Math.min(31, parseInt(fm.auto_mday, 10) || 1)),
  }
})
const autoText = computed(() => {
  const r = routine.value, n = r.autoEvery
  return r.autoMode === 'session' ? 'every session' : r.autoMode === 'hours' ? `every ${n} h`
    : r.autoMode === 'days' ? (n === 1 ? 'every day' : `every ${n} days`)
    : r.autoMode === 'weeks' ? (n === 1 ? 'weekly' : `every ${n} weeks`) + (r.autoDays.length ? ' · ' + r.autoDays.join(', ') : '')
    : r.autoMode === 'months' ? (n === 1 ? 'monthly' : `every ${n} months`) + ' · day ' + r.autoMday : 'manual'
})
const ownerKey = computed(() => ({ Adal: 'owner', owner: 'owner', agent: 'agent', both: 'both' })[String(local.value.owner || '')] || '')
const ownerText = computed(() => (OWNERS.find(o => o[0] === ownerKey.value) || [0, '—'])[1])
const reactText = computed(() => REACT.map(x => local.value[x[0]] ?? '·').join(' '))
const lastDone = computed(() => local.value.last_done ? String(local.value.last_done).slice(0, 10) : 'never')

function toggle(k) { pop.value = pop.value === k ? null : k }
const root = ref(null)
function outside(e) { if (pop.value && root.value && !root.value.contains(e.target)) pop.value = null }
onMounted(() => document.addEventListener('mousedown', outside))
onBeforeUnmount(() => document.removeEventListener('mousedown', outside))
</script>

<template>
  <span ref="root" class="nchips">
    <button class="fm edit" :class="{ open: pop === 'type' }" @click="toggle('type')"><b>type</b> {{ type }} ▾</button>
    <template v-if="type === 'routine'">
      <button class="fm edit" :class="{ open: pop === 'tier' }" @click="toggle('tier')"><b>tier</b> {{ local.importance || 'should' }} ▾</button>
      <button class="fm edit" :class="{ open: pop === 'auto' }" @click="toggle('auto')"><b>⚙</b> {{ autoText }}</button>
      <span class="fm"><b>last done</b> {{ lastDone }}</span>
    </template>
    <template v-else-if="type === 'task'">
      <button class="fm edit" :class="{ open: pop === 'who' }" @click="toggle('who')"><b>who</b> {{ ownerText }} ▾</button>
      <button class="fm edit" :class="{ open: pop === 'by' }" @click="toggle('by')"><b>needed by</b> {{ local.needed_by || '—' }}</button>
    </template>
    <template v-else>
      <button class="fm edit" :class="{ open: pop === 'react' }" @click="toggle('react')"><b>reactions</b> {{ reactText }}</button>
    </template>
    <span v-if="msg" class="fm warn">{{ msg }}</span>

    <div v-if="pop" class="npop" :class="{ wide: pop === 'auto' }">
      <div v-if="pop === 'type'" class="seg"><button v-for="t in TYPES" :key="t[0]" :class="{ on: type === t[0] }" @click="switchType(t[0])">{{ t[1] }}</button></div>
      <div v-else-if="pop === 'tier'" class="seg"><button v-for="t in TIERS" :key="t[0]" :class="{ on: (local.importance || 'should') === t[0] }" @click="setFields({ importance: t[0] })">{{ t[1] }}</button></div>
      <RoutineSchedule v-else-if="pop === 'auto'" :r="routine" cancelable @cancel="pop = null" @saved="pop = null; emit('changed')" />
      <div v-else-if="pop === 'who'" class="seg"><button v-for="o in OWNERS" :key="o[0]" :class="{ on: ownerKey === o[0] }" @click="setFields({ owner: o[0] })">{{ o[1] }}</button></div>
      <input v-else-if="pop === 'by'" class="nset-input" :value="local.needed_by || ''" placeholder="e.g. This week, 2026-11-15 (Enter saves)" @keydown.enter="setFields({ needed_by: $event.target.value })" autofocus>
      <div v-else-if="pop === 'react'" class="nreact">
        <template v-for="r in REACT" :key="r[0]">
          <span>{{ r[1] }}</span>
          <div class="seg"><button v-for="v in [1, 2, 3]" :key="v" :class="{ on: Number(local[r[0]]) === v }" @click="setFields({ [r[0]]: v }, false)">{{ v }}</button></div>
        </template>
      </div>
    </div>
  </span>
</template>

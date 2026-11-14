<script setup>
import { movesFor } from '../stages.js'
// D250: the header of an idea, task or routine note: title with its main action, then a properties area
// (label on the left, control on the right, all visible). No id, breadcrumb, path or saved time.
import { ref, computed, watch } from 'vue'
import RoutineSchedule from './RoutineSchedule.vue'
import { ask, claude } from '../ask.js'
const props = defineProps({ path: String, title: String, fm: Object, show: { type: Boolean, default: true } })
const emit = defineEmits(['changed'])

const TYPES = [['idea', 'Idea'], ['task', 'Task'], ['routine', 'Routine']]
const STAGES = [['maybe', 'Maybe'], ['next', 'Next'], ['now', 'Now'], ['done', 'Done']]
const OWNERS = [['agent', 'Claude'], ['owner', 'You'], ['both', 'Both']]
const REACT = [['value_members', 'Brings value to members'], ['value_money', 'Brings value to the business'], ['want', 'I want to do it'], ['hard', 'It looks difficult']]
const SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const local = ref({})
const msg = ref('')
watch(() => [props.path, props.fm], () => { local.value = { ...(props.fm || {}) }; msg.value = '' }, { immediate: true, deep: true })
const type = computed(() => String(local.value.type || 'idea'))
const stage = computed(() => String(local.value.stage || 'maybe'))
const today = () => new Date().toLocaleDateString('sv-SE')
const say = t => { msg.value = t; setTimeout(() => { if (msg.value === t) msg.value = '' }, 2200) }

async function setFields(fields, note = 'Saved') {
  const res = await fetch('/api/fields', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: props.path, title: props.title, fields }) })
  if (!res.ok) { say('Not saved'); return false }
  Object.assign(local.value, fields); say(note); emit('changed'); return true
}
async function setStage(s, note) {
  const res = await fetch('/api/stage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: props.path, title: props.title, stage: s }) })
  if (!res.ok) { say('Not saved'); return false }
  local.value.stage = s; say(note || 'Moved to ' + s); emit('changed'); return true
}
function switchType(t) {
  if (t === type.value) return
  const f = { type: t }
  if (t === 'routine') { f.kind = 'Routine'; if (!local.value.recurring) f.recurring = 'daily'; if (!local.value.auto) f.auto = 'off' }
  if (t === 'task' && (!local.value.kind || local.value.kind === 'Routine')) f.kind = 'Do'
  setFields(f, 'Now a ' + t)
}
async function markDone() { if (await setStage('done', 'Done')) await setFields({ done: today() }, 'Done') }

// routine
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
const lastDone = computed(() => local.value.last_done ? String(local.value.last_done).slice(0, 10) : null)
const doneToday = computed(() => lastDone.value === today())
const ago = d => { if (!d) return 'never'; const n = Math.round((new Date(today()) - new Date(d)) / 86400000); return n <= 0 ? 'today' : n === 1 ? 'yesterday' : n + ' days ago' }
const runState = computed(() => {
  const req = [...claude.items].find(i => i.path === props.path && i.action === 'Run routine' && String(i.at).slice(0, 10) === new Date().toISOString().slice(0, 10))
  return req ? req.status : null
})
const run = () => ask({ action: 'Run routine', path: props.path, title: props.title })

// task
const ownerKey = computed(() => ({ Adal: 'owner', owner: 'owner', agent: 'agent', both: 'both' })[String(local.value.owner || '')] || '')
</script>

<template>
  <header class="np">
    <!-- the title lives in the viewer's fixed bar; the main action goes there too (Adal, 8/11) -->
    <Teleport to="#vh-actions">
      <div class="np-actions">
        <span v-if="msg" class="np-msg">{{ msg }}</span>
        <template v-if="type === 'routine'">
          <button class="pill-btn yellow" :disabled="runState === 'pending' || runState === 'queued' || runState === 'working'" @click="run">{{ runState === 'working' ? 'Running…' : runState === 'queued' ? 'In line' : runState === 'pending' ? 'Sent' : 'Run' }}</button>
        </template>
        <template v-else>
          <span v-if="stage === 'done'" class="np-done">✓ Done</span>
          <button v-for="m in movesFor(stage)" :key="m.to" class="pill-btn" :class="m.primary ? 'yellow' : 'ghost'" @click="m.to === 'done' ? markDone() : setStage(m.to, m.to === 'not' ? 'Not now' : 'Moved to ' + m.to)">{{ m.label }}</button>
        </template>
      </div>
    </Teleport>

    <div v-show="show" class="np-props">
      <span class="np-l">Type</span>
      <div class="np-v"><div class="seg"><button v-for="t in TYPES" :key="t[0]" :class="{ on: type === t[0] }" @click="switchType(t[0])">{{ t[1] }}</button></div></div>

      <template v-if="type === 'routine'">
        <span class="np-l">Today</span>
        <div class="np-v">
          <span :class="doneToday ? 'np-ok' : 'np-wait'">{{ doneToday ? '✓ Done' : 'Not yet' }}</span>
          <span class="np-dim">· last done {{ ago(lastDone) }}</span>
        </div>
        <template v-if="local.last_result">
          <span class="np-l">Last result</span>
          <div class="np-v">{{ local.last_result }}</div>
        </template>
        <span class="np-l np-ltop">Runs</span>
        <div class="np-v"><RoutineSchedule :r="routine" @saved="emit('changed')" /></div>
      </template>

      <template v-else>
        <span class="np-l">Stage</span>
        <div class="np-v"><div class="seg"><button v-for="s in STAGES" :key="s[0]" :class="{ on: stage === s[0] }" @click="setStage(s[0])">{{ s[1] }}</button></div><span v-if="stage === 'not'" class="np-dim">(not doing it)</span></div>
      </template>

      <template v-if="type === 'task'">
        <span class="np-l">Who</span>
        <div class="np-v"><div class="seg"><button v-for="o in OWNERS" :key="o[0]" :class="{ on: ownerKey === o[0] }" @click="setFields({ owner: o[0] })">{{ o[1] }}</button></div></div>
        <span class="np-l">Needed by</span>
        <div class="np-v"><input class="np-input" :value="local.needed_by || ''" placeholder="e.g. This week" @change="setFields({ needed_by: $event.target.value })"></div>
      </template>


      <template v-if="type === 'idea'">
        <span class="np-l np-ltop">Worth it</span>
        <div class="np-v np-react">
          <span v-for="r in REACT" :key="r[0]" class="np-r">
            <span class="dots"><button v-for="v in [1, 2, 3]" :key="v" class="dot" :class="{ on: Number(local[r[0]]) >= v }" :title="r[1] + ': ' + v" @click="setFields({ [r[0]]: v })"></button></span>
            <small>{{ r[1] }}</small>
          </span>
        </div>
      </template>

      <template v-if="type !== 'routine'">
        <span class="np-l">Next step</span>
        <div class="np-v"><input class="np-input" :value="local.next_step || ''" placeholder="What happens next?" @change="setFields({ next_step: $event.target.value })"></div>
      </template>
    </div>
  </header>
</template>

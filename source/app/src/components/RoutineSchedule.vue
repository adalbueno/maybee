<script setup>
// How a routine runs by itself (D246, D247): Off · every session · every N hours/days/weeks (weekdays)/months (day of month).
// Used by the board's gear and by the note's settings in the viewer (D249).
import { ref, watch } from 'vue'
const props = defineProps({ r: Object, cancelable: Boolean })
const emit = defineEmits(['saved', 'cancel'])

const WEEK = [['mon', 'M'], ['tue', 'T'], ['wed', 'W'], ['thu', 'T'], ['fri', 'F'], ['sat', 'S'], ['sun', 'S']]
const SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const cap = d => d[0].toUpperCase() + d.slice(1)
const g = ref({})
const msg = ref('')
function reset() {
  const r = props.r || {}, m = r.autoMode || 'off'
  g.value = {
    kind: m === 'off' || m === 'session' ? m : 'every',
    every: r.autoEvery || (m === 'hours' ? 3 : 1),
    unit: ['hours', 'days', 'weeks', 'months'].includes(m) ? m : 'hours',
    days: (r.autoDays && r.autoDays.length) ? [...r.autoDays] : [SHORT[new Date().getDay()]],
    mday: r.autoMday || new Date().getDate(),
  }
  msg.value = ''
}
watch(() => props.r && props.r.path, reset, { immediate: true })
function toggleDay(d) { const s = g.value.days; g.value.days = s.includes(d) ? s.filter(x => x !== d) : [...s, d] }

async function save() {
  const v = g.value
  const every = Math.max(1, Math.min(999, parseInt(v.every, 10) || 1))
  const mday = Math.max(1, Math.min(31, parseInt(v.mday, 10) || 1))
  const mode = v.kind === 'every' ? v.unit : v.kind
  const days = mode === 'weeks' ? WEEK.map(w => w[0]).filter(d => v.days.includes(d)) : []
  if (mode === 'weeks' && !days.length) { msg.value = 'Pick at least one day'; return }
  const fields = { auto: mode, auto_every: every, auto_run: mode === 'off' ? 'false' : 'true' }
  if (mode === 'weeks') fields.auto_days = days.join('-')
  if (mode === 'months') fields.auto_mday = mday
  if (mode === 'weeks' || mode === 'months') fields.auto_since = new Date().toLocaleDateString('sv-SE')
  const res = await fetch('/api/fields', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: props.r.path, title: props.r.full || props.r.title, fields }) })
  if (!res.ok) { msg.value = 'Not saved'; return }
  msg.value = 'Saved'
  emit('saved', { autoMode: mode, autoEvery: every, autoDays: days, autoMday: mday, auto: mode !== 'off' })
}
</script>

<template>
  <div class="r-config" @click.stop>
    <b>Run by itself</b>
    <label><input type="radio" value="off" v-model="g.kind"> Off (only when I press Run)</label>
    <label><input type="radio" value="session" v-model="g.kind"> At the start of every session</label>
    <label><input type="radio" value="every" v-model="g.kind"> Every
      <input type="number" min="1" max="999" v-model="g.every" @focus="g.kind = 'every'">
      <select v-model="g.unit" @focus="g.kind = 'every'">
        <option value="hours">{{ Number(g.every) === 1 ? 'hour' : 'hours' }}</option>
        <option value="days">{{ Number(g.every) === 1 ? 'day' : 'days' }}</option>
        <option value="weeks">{{ Number(g.every) === 1 ? 'week' : 'weeks' }}</option>
        <option value="months">{{ Number(g.every) === 1 ? 'month' : 'months' }}</option>
      </select>
    </label>
    <div v-if="g.kind === 'every' && g.unit === 'weeks'" class="r-days">
      <span>on</span>
      <button v-for="w in WEEK" :key="w[0]" :class="{ on: g.days.includes(w[0]) }" :title="cap(w[0])" @click="toggleDay(w[0])">{{ w[1] }}</button>
    </div>
    <label v-if="g.kind === 'every' && g.unit === 'months'" class="r-mday">on day
      <input type="number" min="1" max="31" v-model="g.mday"> of the month <small v-if="Number(g.mday) > 28">(or the last day, in shorter months)</small>
    </label>
    <p>Runs only while the app and a Claude session are open. Posts, DMs and comments still wait for your OK.</p>
    <div class="r-config-actions">
      <span v-if="msg" class="r-msg">{{ msg }}</span>
      <button v-if="cancelable" class="link-btn" @click="emit('cancel')">Cancel</button>
      <button class="pill-btn yellow" @click="save">Save</button>
    </div>
  </div>
</template>

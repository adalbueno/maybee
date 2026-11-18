<script setup>
// Numbers page (v3): the big figures, one small line chart per measure (one axis each,
// never two scales together), hover for the exact value, and the records as a table.
import { ref, computed } from 'vue'
const props = defineProps({ data: Object })
const emit = defineEmits(['open'])

const series = computed(() => (props.data && props.data.series) || [])
const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

function value(n) {
  if (n.value == null) return '—'
  const v = typeof n.value === 'number' ? n.value.toLocaleString('en-GB') : n.value
  return n.unitFirst ? `${n.unit || ''}${v}` : `${v}${n.unit || ''}`
}
function delta(n) {
  if (n.delta == null || n.delta === 0) return null
  return (n.delta > 0 ? '+' : '−') + Math.abs(n.delta).toLocaleString('en-GB') + (n.unit === '%' ? ' pts' : '')
}

const CHARTS = [
  { key: 'members', label: 'Members', unit: '' },
  { key: 'visitors', label: 'About page visitors, last 30 days', unit: '' },
  { key: 'signups', label: 'Signups, last 30 days', unit: '' },
  { key: 'conversion', label: 'Conversion, visitors to signups', unit: '%' },
]

// chart geometry
const W = 640, H = 170, L = 40, R = 16, T = 14, B = 26
function chart(c) {
  const pts = series.value.filter(r => typeof r[c.key] === 'number')
  if (pts.length < 2) return null
  const t0 = new Date(pts[0].date).getTime(), t1 = new Date(pts[pts.length - 1].date).getTime()
  const vals = pts.map(p => p[c.key])
  let lo = Math.min(...vals), hi = Math.max(...vals)
  lo = c.key === 'conversion' || lo > 0 ? Math.min(0, lo) : lo
  if (hi === lo) hi = lo + 1
  const step = niceStep((hi - lo) / 3)
  hi = Math.ceil(hi / step) * step
  const x = d => L + (new Date(d).getTime() - t0) / (t1 - t0 || 1) * (W - L - R)
  const y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B)
  const ticks = []
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push({ v: Number(v.toFixed(2)), y: y(v) })
  const dots = pts.map(p => ({ x: x(p.date), y: y(p[c.key]), v: p[c.key], date: p.date, path: p.path }))
  const line = dots.map((d, i) => (i ? 'L' : 'M') + d.x.toFixed(1) + ' ' + d.y.toFixed(1)).join(' ')
  const area = line + ` L${dots[dots.length - 1].x.toFixed(1)} ${y(lo).toFixed(1)} L${dots[0].x.toFixed(1)} ${y(lo).toFixed(1)} Z`
  const first = dots[0], last = dots[dots.length - 1]
  return { dots, line, area, ticks, first, last, base: y(lo), xFirst: fmtDate(first.date), xLast: fmtDate(last.date) }
}
function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)))
  const n = raw / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}
const charts = computed(() => CHARTS.map(c => ({ ...c, g: chart(c) })).filter(c => c.g))

// hover: nearest record by x
const hover = ref({})
function onMove(e, c) {
  const svg = e.currentTarget
  const r = svg.getBoundingClientRect()
  const px = (e.clientX - r.left) / r.width * W
  let best = null
  for (const d of c.g.dots) if (!best || Math.abs(d.x - px) < Math.abs(best.x - px)) best = d
  hover.value = { ...hover.value, [c.key]: best }
}
function onLeave(c) { hover.value = { ...hover.value, [c.key]: null } }
const fmtV = (v, unit) => v == null ? '—' : v.toLocaleString('en-GB') + (unit || '')

const rows = computed(() => [...series.value].reverse())
</script>

<template>
  <div class="num-inner" v-if="data">
    <div class="hero">
      <div class="hero-kicker">Numbers · last record {{ fmtDate(data.date) }}<template v-if="data.prevDate">, change vs {{ fmtDate(data.prevDate) }}</template></div>
      <h1 class="hero-title"><b>{{ series.length }}</b> records since {{ series.length ? fmtDate(series[0].date) : '—' }}.</h1>
      <p class="hero-sub">From <a class="inline" @click="emit('open', { path: 'logs/metrics/' + data.date + '.md' })">logs/metrics</a>, written by the agent when it reads Skool, social and ads.</p>
    </div>

    <div class="tiles">
      <div v-for="n in data.items" :key="n.key" class="tile" :class="{ alert: n.alert }" :title="n.note || ''">
        <span class="tile-label"><i v-if="n.alert"></i>{{ n.label }}</span>
        <b class="tile-value">{{ value(n) }}</b>
        <span class="tile-foot">
          <em v-if="delta(n)" :class="(n.key === 'conversion' || n.key === 'visitors' || n.key === 'members') ? (n.delta > 0 ? 'up' : 'down') : ''">{{ delta(n) }}</em>
          <span v-if="n.note">{{ n.note }}</span>
        </span>
      </div>
    </div>

    <section v-for="c in charts" :key="c.key" class="chart-card">
      <div class="chart-head">
        <h2>{{ c.label }}</h2>
        <span class="chart-read">
          <template v-if="hover[c.key]"><b>{{ fmtV(hover[c.key].v, c.unit) }}</b> on {{ fmtDate(hover[c.key].date) }}</template>
          <template v-else><b>{{ fmtV(c.g.last.v, c.unit) }}</b> now · {{ fmtV(c.g.first.v, c.unit) }} on {{ c.g.xFirst }}</template>
        </span>
      </div>
      <svg :viewBox="`0 0 ${W} ${H}`" class="chart" role="img" :aria-label="c.label" @mousemove="onMove($event, c)" @mouseleave="onLeave(c)">
        <g class="grid">
          <template v-for="t in c.g.ticks" :key="t.v">
            <line :x1="L" :x2="W - R" :y1="t.y" :y2="t.y" />
            <text :x="L - 8" :y="t.y + 4" text-anchor="end">{{ t.v.toLocaleString('en-GB') }}{{ c.unit }}</text>
          </template>
          <text :x="L" :y="H - 6">{{ c.g.xFirst }}</text>
          <text :x="W - R" :y="H - 6" text-anchor="end">{{ c.g.xLast }}</text>
        </g>
        <path :d="c.g.area" class="area" />
        <path :d="c.g.line" class="line" />
        <circle v-for="d in c.g.dots" :key="d.date" :cx="d.x" :cy="d.y" r="3.2" class="dot" />
        <template v-if="hover[c.key]">
          <line :x1="hover[c.key].x" :x2="hover[c.key].x" :y1="T" :y2="c.g.base" class="cross" />
          <circle :cx="hover[c.key].x" :cy="hover[c.key].y" r="6" class="dot-hi" />
        </template>
      </svg>
    </section>

    <section class="block">
      <h2 class="block-title">Every record <small>click a date to open its note</small></h2>
      <div class="num-table-wrap">
        <table class="num-table">
          <thead><tr><th>Date</th><th>Members</th><th>Visitors 30d</th><th>Signups 30d</th><th>Conversion</th><th>Best video</th><th>Ads</th></tr></thead>
          <tbody>
            <tr v-for="r in rows" :key="r.date">
              <td><a class="inline" @click="emit('open', { path: r.path })">{{ fmtDate(r.date) }}</a></td>
              <td>{{ fmtV(r.members) }}</td>
              <td>{{ fmtV(r.visitors) }}</td>
              <td>{{ fmtV(r.signups) }}</td>
              <td>{{ fmtV(r.conversion, '%') }}</td>
              <td>{{ fmtV(r.video) }}</td>
              <td>{{ r.ads == null ? '—' : '$' + r.ads }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

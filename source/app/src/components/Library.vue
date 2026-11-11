<script setup>
// Library (v3): every file of the project by type, with search.
// Title, path and description filter in the browser; "inside the files" asks the server.
import { ref, computed, watch, onMounted } from 'vue'
const props = defineProps({ changedAt: Number, activePath: String })
const emit = defineEmits(['open'])

const items = ref([])
const q = ref('')
const kind = ref('all')
const inside = ref([])
const insideTotal = ref(0)
const limit = ref(80)

async function load() { items.value = (await fetch('/api/library').then(r => r.json())).items }
onMounted(load)
let t = null
watch(() => props.changedAt, () => { clearTimeout(t); t = setTimeout(load, 400) })

// the kinds, most files first; the archive always last
const kinds = computed(() => {
  const c = new Map()
  for (const it of items.value) c.set(it.kind, (c.get(it.kind) || 0) + 1)
  return [...c.entries()].sort((a, b) => (a[0] === 'Archive') - (b[0] === 'Archive') || b[1] - a[1]).map(([k, n]) => ({ k, n }))
})

const norm = s => String(s || '').toLowerCase()
const matches = computed(() => {
  const words = norm(q.value).split(/\s+/).filter(Boolean)
  return items.value.filter(it => (kind.value === 'all' || it.kind === kind.value)
    && words.every(w => norm(it.title + ' ' + it.path + ' ' + (it.desc || '')).includes(w)))
})
watch([q, kind], () => { limit.value = 80 })

let st = null
watch(q, v => {
  clearTimeout(st)
  if (v.trim().length < 3) { inside.value = []; insideTotal.value = 0; return }
  st = setTimeout(async () => {
    const r = await fetch('/api/search?q=' + encodeURIComponent(v.trim())).then(r => r.json())
    const shown = new Set(matches.value.map(m => m.path))
    inside.value = r.items.filter(i => !shown.has(i.path) && (kind.value === 'all' || (items.value.find(x => x.path === i.path) || {}).kind === kind.value)).slice(0, 40)
    insideTotal.value = r.total
  }, 250)
})

const raw = p => '/raw?path=' + encodeURIComponent(p)
function ago(ms) {
  const d = Math.round((Date.now() - ms) / 86400000)
  if (d <= 0) return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (d === 1) return 'yesterday'
  if (d < 7) return d + ' days ago'
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
const folder = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '·'
const titleOf = p => (items.value.find(x => x.path === p) || { title: p.split('/').pop() }).title
</script>

<template>
  <div class="lib-inner">
    <div class="hero">
      <div class="hero-kicker">Library</div>
      <h1 class="hero-title"><b>{{ items.length.toLocaleString('en-GB') }}</b> files, by type.</h1>
      <p class="hero-sub">Notes, images and videos of the whole project. Search looks at titles first, then inside the notes.</p>
    </div>
    <input v-model="q" class="lib-search" type="search" placeholder="Search titles, paths and text…" autofocus />
    <div class="filters">
      <button class="filter" :class="{ on: kind === 'all' }" @click="kind = 'all'">All<small>{{ items.length }}</small></button>
      <button v-for="k in kinds" :key="k.k" class="filter" :class="{ on: kind === k.k }" @click="kind = k.k">{{ k.k }}<small>{{ k.n }}</small></button>
    </div>

    <p class="lib-count">{{ matches.length.toLocaleString('en-GB') }} {{ matches.length === 1 ? 'file' : 'files' }}<template v-if="q"> match “{{ q }}”</template>, newest first</p>
    <div class="lib-list">
      <a v-for="it in matches.slice(0, limit)" :key="it.path" class="lib-row" :class="{ active: activePath === it.path }" @click="emit('open', { path: it.path })">
        <span class="lib-thumb" :class="it.media || 'note'">
          <img v-if="it.media === 'image'" :src="raw(it.path)" loading="lazy" alt="" />
          <template v-else-if="it.media === 'video'">▶</template>
          <template v-else>{{ it.kind.slice(0, 1) }}</template>
        </span>
        <span class="lib-main">
          <b>{{ it.title }}</b>
          <span v-if="it.desc" class="lib-desc">{{ it.desc }}</span>
          <span class="lib-path">{{ folder(it.path) }}</span>
        </span>
        <span class="lib-meta">
          <em class="lib-kind">{{ it.kind }}</em>
          <span v-if="it.status" class="lib-status">{{ it.status }}</span>
          <span class="lib-ago">{{ ago(it.time) }}</span>
        </span>
      </a>
      <button v-if="matches.length > limit" class="more-btn" @click="limit += 120">Show more ({{ matches.length - limit }} left)</button>
      <p v-if="!matches.length && !inside.length" class="end">Nothing matches.</p>
    </div>

    <template v-if="inside.length">
      <h2 class="block-title lib-inside">Inside the notes <small>{{ insideTotal }} {{ insideTotal === 1 ? 'note mentions' : 'notes mention' }} “{{ q.trim() }}”</small></h2>
      <div class="lib-list">
        <a v-for="s in inside" :key="s.path" class="lib-row" :class="{ active: activePath === s.path }" @click="emit('open', { path: s.path })">
          <span class="lib-thumb note">{{ s.hits }}</span>
          <span class="lib-main">
            <b>{{ titleOf(s.path) }}</b>
            <span class="lib-desc">{{ s.snippet }}</span>
            <span class="lib-path">{{ s.path }}</span>
          </span>
        </a>
      </div>
    </template>
  </div>
</template>

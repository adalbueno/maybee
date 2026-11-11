<script setup>
// Overview page, top part (D261): where we are (STATE.md › Focus) and what waits for the owner
// (STATE.md › Waiting on the owner). Click an item to open the note it points to.
import { ref, watch, onMounted } from 'vue'
const props = defineProps({ changedAt: Number })
const emit = defineEmits(['open'])
const st = ref({ focus: [], waiting: [], updated: null })
async function load() {
  try { st.value = await (await fetch('/api/state')).json() } catch {}
}
onMounted(load)
watch(() => props.changedAt, load)
const dayLabel = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''
</script>

<template>
  <section class="state">
    <div class="state-head">
      <h2>Where we are</h2>
      <span v-if="st.updated" class="upd">STATE · updated {{ dayLabel(st.updated) }}</span>
    </div>
    <div class="state-grid">
      <div class="st-col">
        <h3>Focus <small>{{ st.focus.length }}</small></h3>
        <div v-for="(f, i) in st.focus" :key="'f' + i" class="item" :class="{ link: f.link }" @click="f.link && emit('open', { path: f.link })">
          <b>{{ f.title }}</b>
          <p>{{ f.text }}</p>
        </div>
      </div>
      <div class="st-col">
        <h3>Waiting for you <small>{{ st.waiting.length }}</small></h3>
        <div v-for="(w, i) in st.waiting" :key="'w' + i" class="item wait" :class="{ link: w.link }" @click="w.link && emit('open', { path: w.link })">
          <b>{{ w.title }}</b>
          <p>{{ w.text }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.state { margin: 0 0 36px; }
.state-head { display: flex; align-items: baseline; gap: 14px; margin-bottom: 14px; }
.state-head h2 { font: 700 26px/1.1 var(--sans); margin: 0; }
.upd { font-size: 12.5px; color: var(--ink-3); font-weight: 600; }
.state-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
@media (max-width: 900px) { .state-grid { grid-template-columns: 1fr; } }
.st-col h3 { font: 700 14px/1 var(--sans); color: var(--ink-3); text-transform: uppercase; letter-spacing: .06em; margin: 0 0 10px; }
.st-col h3 small { font-size: 12px; margin-left: 4px; }
.item { background: var(--card); border-radius: var(--radius); padding: 14px 16px; margin-bottom: 10px; }
.item.link { cursor: pointer; }
.item.link:hover { background: #eeede7; }
.item b { display: block; font-size: 14.5px; margin-bottom: 4px; }
.item p { margin: 0; font-size: 13.5px; line-height: 1.45; color: var(--ink-2); }
.item.wait { border-left: 3px solid var(--accent); }
</style>

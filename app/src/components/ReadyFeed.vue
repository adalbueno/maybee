<script setup>
// The Inbox: what arrived for you. Waiting for your OK on top, then what the agent finished, each tied to its card.
// Every file change is still in the card's Changes tab and in the Vault ("Every change" shows the old list).
import { computed } from 'vue'
const props = defineProps({ data: Object, activePath: String })
const emit = defineEmits(['open', 'seen', 'changes', 'all-seen'])

const items = computed(() => props.data?.items || [])
const waiting = computed(() => props.data?.waiting || [])
const unread = computed(() => items.value.filter(i => !i.read).length)

// one group per card, the card with the newest work first; inside, newest first
const groups = computed(() => {
  const by = new Map()
  for (const it of items.value) {
    const k = it.card || ''
    if (!by.has(k)) by.set(k, { card: it.card, title: it.cardTitle || 'Not on a card', stage: it.cardStage, items: [], time: 0 })
    const g = by.get(k)
    g.items.push(it)
    g.time = Math.max(g.time, it.time)
  }
  return [...by.values()].sort((a, b) => b.time - a.time)
})
// the card's column, in the board's colours
const STAGES = { maybe: ['Maybe', '#c9c4b6'], next: ['Next', '#4a7dff'], now: ['Now', '#f2b705'], done: ['Done', '#2f9e5b'], not: ['Not', '#e0503a'], routine: ['Routine', '#a56bdb'] }
// cards with something new on top; once all is seen a card moves down to Seen, and leaves after 7 days
const SEEN_DAYS = 7
const newGroups = computed(() => groups.value.filter(g => fresh(g)))
const seenGroups = computed(() => groups.value.filter(g => !fresh(g) && g.time > Date.now() - SEEN_DAYS * 86400000))
const fresh = g => g.items.filter(i => !i.read).length
function when(t) {
  const d = new Date(t)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const that = new Date(d); that.setHours(0, 0, 0, 0)
  const diff = Math.round((today - that) / 86400000)
  const hm = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (diff === 0) return hm
  if (diff === 1) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// a row opens what was made; the group's head opens the card. Either way it counts as seen.
function openItem(it) {
  if (!it.read) emit('seen', it)
  if (it.file) emit('open', { path: it.file })
  else if (it.card) emit('open', { path: it.card, key: it.card })
}
function openGroup(g) {
  for (const it of g.items) if (!it.read) emit('seen', it)
  if (g.card) emit('open', { path: g.card, key: g.card })
}
</script>

<template>
  <div class="ready">
    <div class="hero">
      <div class="hero-kicker">Inbox</div>
      <h1 class="hero-title" v-if="unread || waiting.length">
        <template v-if="unread"><b>{{ unread }}</b> new {{ unread === 1 ? 'thing' : 'things' }} for you</template>
        <template v-if="unread && waiting.length">, </template>
        <template v-if="waiting.length"><b>{{ waiting.length }}</b> {{ waiting.length === 1 ? 'waits' : 'wait' }} for your OK</template>.
      </h1>
      <h1 class="hero-title" v-else-if="items.length">You've seen <b>everything</b>.</h1>
      <h1 class="hero-title" v-else>Your inbox is <b>empty</b>.</h1>
      <p class="hero-sub">What Maybee made or created for you, card by card. Answers stay in each card's chat, and every file change is in the Vault.</p>
      <div class="hero-actions">
        <button v-if="unread" class="link-btn" @click="emit('all-seen')">Mark all as seen</button>
        <button class="link-btn" @click="emit('changes')">Every change</button>
      </div>
    </div>

    <section v-if="waiting.length" class="group panel wait-panel">
      <h2 class="g-head">Waiting for your OK <small>{{ waiting.length }}</small></h2>
      <article v-for="w in waiting" :key="w.key" class="r-item" :class="{ link: w.card }" @click="w.card && emit('open', { path: w.card, key: w.card })">
        <h3>{{ w.title }}</h3>
        <p v-if="w.text">{{ w.text }}</p>
        <div class="r-foot">
          <button v-if="w.card" class="r-go" @click.stop="emit('open', { path: w.card, key: w.card })">Open</button>
        </div>
      </article>
    </section>

    <template v-for="(list, li) in [newGroups, seenGroups]" :key="li">
    <h2 v-if="li === 1 && list.length" class="seen-head">Seen</h2>
    <section v-for="g in list" :key="g.card || 'none'" class="group panel" :class="{ seen: li === 1 }">
      <h2 class="g-head" :class="{ link: g.card }" :title="g.card ? 'Open the card' : null" @click="openGroup(g)">
        <span v-if="g.stage" class="g-stage" :style="{ '--c': STAGES[g.stage][1] }">{{ STAGES[g.stage][0] }}</span>
        <span class="g-title">{{ g.title }}</span>
        <span v-if="fresh(g)" class="g-dot g-new" title="Something new here"></span>
        <small>{{ fresh(g) ? fresh(g) + ' new' : g.items.length }}</small>
      </h2>
      <div class="rows">
        <button v-for="it in g.items" :key="it.key" class="row" :class="{ unread: !it.read, active: activePath === it.file }" :title="it.file" @click="openItem(it)">
          <i class="r-new" :class="{ on: !it.read }"></i>
          <span class="r-title">{{ it.type === 'card' ? 'New card, created by Maybee' : it.title }}</span>
          <span class="r-time">{{ when(it.time) }}</span>
        </button>
      </div>
    </section>
    </template>

    <div class="more">
      <p v-if="!newGroups.length && !seenGroups.length && !waiting.length" class="end">Nothing new. When Maybee makes something or creates a card, it shows here.</p>
      <p v-else-if="seenGroups.length" class="end">What you've seen leaves after 7 days. It stays on its card.</p>
    </div>
  </div>
</template>

<style scoped>
/* Like the board: a soft panel per group, white cards on it, so each item stands out. */
.group { margin-top: 26px; }
.panel { background: var(--card); border-radius: var(--radius); padding: 18px 16px 8px; }
.g-head { display: flex; align-items: center; gap: 10px; margin: 2px 6px 14px; font-size: 18px; font-weight: 700; letter-spacing: -.02em; }
.g-head small { font-size: 12px; font-weight: 700; color: var(--ink-2); background: var(--card-hi); border-radius: 999px; padding: 2px 9px; }
.g-dot { flex: none; width: 9px; height: 9px; border-radius: 50%; background: var(--ink-3); }
.g-dot.g-wait { background: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.r-item { background: var(--card-hi); border-radius: 18px; padding: 16px 18px 14px; margin-bottom: 10px; border: 1.5px solid transparent; box-shadow: 0 1px 2px rgba(0, 0, 0, .04); transition: box-shadow .15s, border-color .15s, transform .15s; }
.r-item.link { cursor: pointer; }
.r-item.link:hover { box-shadow: 0 6px 22px rgba(0, 0, 0, .08); transform: translateY(-1px); }
.r-item.active { border-color: var(--ink); }
.g-head.link { cursor: pointer; }
.g-head.link:hover .g-title { text-decoration: underline; text-underline-offset: 3px; }
.seen-head { margin: 40px 6px 0; font-size: 13px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--ink-3); }
.panel.seen { padding-top: 14px; margin-top: 12px; }
.panel.seen .g-head { font-size: 15.5px; margin-bottom: 10px; }
.panel.seen .row { padding: 10px 16px; }
.panel.seen .r-title { font-size: 14px; }
.g-stage { flex: none; display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: var(--ink-2); background: var(--card-hi); border-radius: 999px; padding: 4px 10px 4px 8px; }
.g-stage::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--c); }
.g-dot.g-new { background: #f5a50b; }
.rows { display: flex; flex-direction: column; gap: 6px; padding-bottom: 10px; }
.row { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; font: inherit; background: var(--card-hi); border: 1.5px solid transparent; border-radius: 14px; padding: 13px 16px; cursor: pointer; box-shadow: 0 1px 2px rgba(0, 0, 0, .04); transition: box-shadow .15s, border-color .15s, transform .15s; }
.row:hover { box-shadow: 0 6px 22px rgba(0, 0, 0, .08); transform: translateY(-1px); }
.row.active { border-color: var(--ink); }
.r-new { flex: none; width: 8px; height: 8px; border-radius: 50%; background: transparent; }
.r-new.on { background: #f5a50b; }
.r-title { flex: 1; font-size: 15px; font-weight: 600; color: var(--ink-2); letter-spacing: -.01em; }
.row.unread .r-title { color: var(--ink); font-weight: 700; }
.r-time { flex: none; font-size: 12.5px; font-weight: 600; color: var(--ink-3); }
.r-item h3 { margin: 0 0 4px; font-size: 16.5px; line-height: 1.35; font-weight: 700; letter-spacing: -.02em; color: var(--ink); }
.r-item p { margin: 0; font-size: 14px; line-height: 1.5; color: var(--ink-2); }
.r-foot { display: flex; align-items: center; gap: 10px; margin-top: 12px; }
.r-go { font: inherit; font-size: 12.5px; font-weight: 700; padding: 6px 14px; border-radius: 999px; border: 0; background: var(--dark); color: #fff; cursor: pointer; }
.r-go:hover { opacity: .85; }
.wait-panel { background: var(--accent-soft); }
</style>

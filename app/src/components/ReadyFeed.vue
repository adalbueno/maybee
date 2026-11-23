<script setup>
// The Inbox, like mail in the board's accordion: two boxes, Needs you and For you. The open box is one big card
// with a list like an inbox; the other closes into a column beside it, like the board's closed columns.
// For you is one line per card, like a mail thread: the card (the sender, in its column's colour), how many things
// arrived from it, the latest one and the others, and when. Unread threads are bold and on top. A line opens the card,
// where everything that arrived is under Work, and counts the thread as seen. Every file change is in the Brain.
import { ref, computed, watch } from 'vue'
import NoteChat from './NoteChat.vue'
const props = defineProps({ data: Object, activePath: String })
const emit = defineEmits(['open', 'seen', 'all-seen'])

// the chat at the bottom: typing filters both boxes, Enter asks Maybee (answer what needs you, act on what arrived)
const q = ref('')
const words = computed(() => q.value.toLowerCase().split(/\s+/).filter(Boolean))
const hit = (...texts) => { const t = texts.join(' ').toLowerCase(); return words.value.every(w => t.includes(w)) }
const items = computed(() => props.data?.items || [])
const allWaiting = computed(() => props.data?.waiting || [])
const waiting = computed(() => allWaiting.value.filter(w => hit(w.title, w.text || '')))
// one thread per card: unread threads first, then the rest, newest first in each
const threads = computed(() => {
  const by = new Map()
  for (const it of items.value) {
    const k = it.card || 'none'
    if (!by.has(k)) by.set(k, { key: k, card: it.card, title: it.cardTitle || 'Not on a card', stage: it.cardStage, items: [], time: 0, unread: 0 })
    const t = by.get(k)
    t.items.push(it); t.time = Math.max(t.time, it.time); if (!it.read) t.unread++
  }
  for (const t of by.values()) t.items.sort((a, b) => b.time - a.time)
  return [...by.values()].filter(t => hit(t.title, ...t.items.map(i => i.title || ''))).sort((a, b) => (b.unread > 0) - (a.unread > 0) || b.time - a.time)
})
const unread = computed(() => items.value.filter(i => !i.read).length)

const BOXES = [
  { key: 'waiting', name: 'Needs you' },
  { key: 'maybee', name: 'For you' },
]
const count = k => k === 'waiting' ? allWaiting.value.length : unread.value
const total = k => k === 'waiting' ? waiting.value.length : threads.value.length
// the box you had open stays open; the first time, the one that needs you most
const recall = () => { try { return localStorage.getItem('maybee.inbox.box') } catch { return null } }
const box = ref(['waiting', 'maybee'].includes(recall()) ? recall() : allWaiting.value.length ? 'waiting' : 'maybee')
watch(box, b => { try { localStorage.setItem('maybee.inbox.box', b) } catch {} })
// like the board: each box is one column that grows and shrinks; the list fades in once a column opened by a click
const moved = ref(false)
function pick(k) { if (k !== box.value) { moved.value = true; box.value = k } }

// the card's column, in the board's colours
const STAGES = { maybe: ['Maybe', '#c9c4b6'], next: ['Next', '#4a7dff'], now: ['Now', '#f2b705'], done: ['Done', '#2f9e5b'], not: ['Not', '#e0503a'], routine: ['Routine', '#a56bdb'] }
const stageColor = s => (STAGES[s] || [, '#c9c4b6'])[1]
function when(t) {
  const d = new Date(t)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const that = new Date(d); that.setHours(0, 0, 0, 0)
  const diff = Math.round((today - that) / 86400000)
  if (diff === 0) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (diff === 1) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
const subject = it => it.type === 'card' ? 'New card' : it.title

// a thread opens its card (everything that arrived is under Work there); without a card, the one file
function openThread(t) {
  for (const it of t.items) if (!it.read) emit('seen', it)
  if (t.card) emit('open', { path: t.card, key: t.card })
  else if (t.items[0]?.file) emit('open', { path: t.items[0].file })
}
const empty = computed(() => q.value.trim() ? 'Nothing matches. Press Enter to ask Maybee instead.' : box.value === 'waiting' ? 'Nothing waits for you. When Maybee needs your OK, it shows here.'
  : 'Nothing yet. When Maybee makes something or creates a card, it shows here.')
</script>

<template>
  <div class="ibx-shell">
  <div class="ibx" :class="{ moved }">
    <div v-for="b in BOXES" :key="b.key" class="ibx-col" :class="['c-' + b.key, { open: box === b.key }]">
      <button class="ibx-tab" :class="{ hot: count(b.key) }" :title="b.name" :tabindex="box === b.key ? -1 : 0" @click="pick(b.key)">
        <small>{{ count(b.key) }}</small><span class="v">{{ b.name }}</span>
      </button>

      <section v-if="box === b.key" class="ibx-big">
        <header class="ibx-head">
          <h3>{{ b.name }}</h3>
          <small>{{ b.key === 'maybee' && unread ? unread + ' new' : total(b.key) }}</small>
          <span class="ibx-actions">
            <button v-if="b.key === 'maybee' && unread" class="ibx-link" @click="emit('all-seen')">Mark all as seen</button>
          </span>
        </header>

        <!-- waiting: what Maybee needs from you, from STATE.md -->
        <div v-if="b.key === 'waiting'" class="ibx-list">
          <div v-for="w in waiting" :key="w.key" class="ibx-row ibx-w" :class="{ active: w.card && activePath === w.card }" role="button" tabindex="0" @click="w.card && emit('open', { path: w.card, key: w.card })" @keydown.enter.self="w.card && emit('open', { path: w.card, key: w.card })">
            <i class="ibx-dot" style="--c: var(--accent)"></i>
            <span class="ibx-subject"><b>{{ w.title }}</b><span v-if="w.text" class="ibx-text">{{ w.text }}</span></span>
            <span v-if="w.card" class="ibx-go">Open</span>
          </div>
        </div>

        <!-- for you: one line per card, like a mail thread -->
        <div v-else class="ibx-list">
          <div v-for="t in threads" :key="t.key" class="ibx-row" :class="{ unread: t.unread, active: activePath && activePath === t.card }" role="button" tabindex="0" :title="t.card ? 'Open the card' : t.items[0].file" @click="openThread(t)" @keydown.enter.self="openThread(t)">
            <i class="ibx-dot" :class="{ off: !t.unread }"></i>
            <span class="ibx-from">
              <em v-if="t.stage" class="ibx-tag" :style="{ '--c': stageColor(t.stage) }" :title="'The card is in ' + STAGES[t.stage][0]">{{ STAGES[t.stage][0] }}</em><span class="ibx-name">{{ t.title }}</span><em v-if="t.items.length > 1" class="ibx-n">{{ t.items.length }}</em>
            </span>
            <span class="ibx-subject"><b>{{ subject(t.items[0]) }}</b><span v-if="t.items.length > 1" class="ibx-more">{{ t.items.slice(1).map(subject).join(' · ') }}</span></span>
            <span class="ibx-time">{{ when(t.time) }}</span>
          </div>
        </div>

        <p v-if="!total(b.key)" class="ibx-empty">{{ empty }}</p>
      </section>
    </div>
  </div>
  <!-- the same chat bar as the board's and the Brain's; with a card open beside, the message is about that card -->
  <NoteChat path="@inbox" title="Inbox" inline link-files :quick="false" :about="activePath || null" heading="Answer and act from the Inbox"
    :placeholder="activePath ? 'Answer, approve or ask about the open card…' : 'Answer what needs you, approve what arrived, or ask…'"
    empty="Nothing asked yet. Answer what needs you (&quot;the contract allows side projects&quot;), act on what arrived (&quot;approve the three drafts&quot;), or ask. Typing also filters the Inbox."
    @typing="t => q = t" @open="p => emit('open', { path: p })" />
  </div>
</template>

<style scoped>
.ibx-shell { height: 100%; display: flex; flex-direction: column; gap: 10px; }
.ibx-shell > .ibx { flex: 1; min-height: 0; height: auto; }
/* the board's accordion: every box is a column; the open one grows (flex 1 1 0%, which can be animated), the others are
   56px tabs. The open column's tab stays on the left while it opens, then fades as the list comes in, like the board's. */
.ibx { height: 100%; display: flex; gap: 10px; align-items: stretch; }
.ibx-col { position: relative; flex: 0 0 56px; min-width: 0; display: flex; border-radius: 26px; overflow: hidden; transition: flex .15s cubic-bezier(.3, 1.35, .5, 1), background .15s; }
/* a touch of colour per box, the way the board's columns carry their stage's: Needs you warm (the accent), For you blue */
.ibx-col { background: color-mix(in srgb, color-mix(in srgb, var(--card), #fff 30%), var(--tone) var(--tint)); }
.ibx-col.open { flex: 1 1 0%; border-radius: 28px; background: color-mix(in srgb, var(--card), var(--tone) var(--tint)); }
.ibx-col.c-waiting { --tone: #f2b705; --tint: 6%; }
.ibx-col.c-maybee { --tone: #4a7dff; --tint: 3.5%; }
.ibx-col:not(.open) .ibx-tab:hover { background: color-mix(in srgb, var(--tone) 10%, transparent); }
.ibx-col.open > .ibx-tab { position: absolute; left: 0; top: 0; bottom: 0; opacity: 0; pointer-events: none; }
.ibx.moved .ibx-col.open > .ibx-tab { transition: opacity .08s ease .07s; }
@keyframes ibx-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.ibx.moved .ibx-col.open > .ibx-big { animation: ibx-in .09s ease .07s both; }
@media (prefers-reduced-motion: reduce) { .ibx-col { transition: none; } .ibx.moved .ibx-col.open > .ibx-big { animation: none; } }
.ibx-tab { flex: none; width: 56px; display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 20px 0; border: 0; border-radius: 26px; background: color-mix(in srgb, var(--card), #fff 30%); cursor: pointer; font: inherit; color: var(--ink); transition: background .12s; }
.ibx-tab { background: transparent; border-radius: 0; }
.ibx-tab .v { writing-mode: vertical-rl; font-weight: 700; font-size: 14px; letter-spacing: -.01em; }
.ibx-tab small { min-width: 24px; height: 24px; padding: 0 7px; border-radius: 99px; display: grid; place-items: center; font-size: 12px; font-weight: 700; color: var(--ink-3); background: var(--card-hi); }
.ibx-tab.hot small { background: var(--accent); color: var(--ink); }
.ibx-big { flex: 1; min-width: 0; overflow-y: auto; padding: 20px 20px 22px; }
.ibx-head { display: flex; align-items: baseline; gap: 12px; margin: 2px 4px 16px; }
.ibx-head h3 { margin: 0; font-size: 22px; letter-spacing: -.03em; }
.ibx-head small { font-size: 13px; font-weight: 600; color: var(--ink-3); }
.ibx-actions { margin-left: auto; display: flex; gap: 14px; }
.ibx-link { border: 0; background: none; padding: 0; font: 600 13px var(--sans); color: var(--ink-2); cursor: pointer; }
.ibx-link:hover { color: var(--ink); text-decoration: underline; text-underline-offset: 3px; }
/* a mail list: white lines on the big card */
.ibx-list { display: flex; flex-direction: column; gap: 6px; }
.ibx-row { display: flex; align-items: center; gap: 12px; min-width: 0; padding: 13px 18px 13px 12px; background: var(--card-hi); border-radius: 16px; cursor: pointer; box-shadow: 0 1px 2px rgba(0, 0, 0, .04); transition: box-shadow .15s, transform .15s; }
.ibx-row:hover { box-shadow: 0 6px 22px rgba(0, 0, 0, .08); transform: translateY(-1px); }
.ibx-row.active { box-shadow: 0 0 0 2px var(--ink); }
.ibx-dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--c, #f5a50b); }
.ibx-dot.off { background: transparent; }
.ibx-from { flex: 0 0 min(320px, 34%); min-width: 0; display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ibx-from:hover { color: var(--ink); text-decoration: underline; text-underline-offset: 3px; }
.ibx-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.ibx-n { flex: none; font-style: normal; font-size: 12px; font-weight: 700; color: var(--ink-3); }
.ibx-more { min-width: 0; font-size: 13.5px; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ibx-subject b { flex: none; max-width: 60%; }
.ibx-tag { flex: none; width: 74px; box-sizing: border-box; padding: 3px 0; border-radius: 99px; text-align: center; font-style: normal; font-size: 11px; font-weight: 750; letter-spacing: .03em; text-transform: uppercase; color: color-mix(in srgb, var(--c), #000 45%); background: color-mix(in srgb, var(--c) 18%, #fff); }
.ibx-subject { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 10px; overflow: hidden; }
.ibx-subject b { font-size: 14.5px; font-weight: 600; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: -.01em; }
/* read and unread, like mail: read lines are lighter and sit back a little; unread ones are bold, dark, with the dot */
.ibx-row:not(.unread):not(.ibx-w) { background: color-mix(in srgb, var(--card-hi) 55%, transparent); box-shadow: none; }
.ibx-row:not(.unread):not(.ibx-w) .ibx-from, .ibx-row:not(.unread):not(.ibx-w) .ibx-subject b { font-weight: 450; color: var(--ink-2); }
.ibx-row.unread .ibx-from, .ibx-row.unread .ibx-subject b { color: var(--ink); font-weight: 750; }
.ibx-row.unread .ibx-time { color: var(--ink); font-weight: 700; }
.ibx-row.ibx-w .ibx-subject { flex-direction: column; gap: 3px; }
.ibx-row.ibx-w .ibx-subject b { color: var(--ink); font-weight: 700; font-size: 15px; white-space: normal; }
.ibx-text { font-size: 13.5px; line-height: 1.45; color: var(--ink-2); }
.ibx-time { flex: none; font-size: 12.5px; font-weight: 600; color: var(--ink-3); }
.ibx-go { flex: none; font-size: 12.5px; font-weight: 700; padding: 6px 14px; border-radius: 999px; background: var(--dark); color: #fff; }
.ibx-empty { margin: 18px 6px 4px; font-size: 13.5px; color: var(--ink-3); }
@media (max-width: 700px) { .ibx-from { display: none; } .ibx-tab { width: 44px; } }
</style>

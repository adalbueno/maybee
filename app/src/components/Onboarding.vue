<script setup>
// First run: Maybee introduces itself and asks four things in a short chat. The questions are a script, so they work
// before any assistant is connected; the assistant only comes in at the end, for the first step on the first card.
import logo from '../assets/logo.png'
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import MarkdownIt from 'markdown-it'
import { ask, claude, refreshInbox } from '../ask.js'

const emit = defineEmits(['done'])
const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

const STEPS = [
  { key: 'purpose', say: ['Hi, I’m Maybee.', 'I turn your ideas into things you actually finish: I keep them in one place, help you pick the next step, and work through it with you.', 'Four quick questions and I’m set up.', 'What are you working on right now?'], hint: 'A newsletter, a course, my studio…' },
  { key: 'audience', say: ['Nice.', 'Who is it for?'], chips: ['Clients', 'Members of my community', 'Readers', 'Just me'], hint: 'Or tell me in your own words' },
  { key: 'goal', say: ['Got it.', 'What matters most in the next few weeks?'], hint: 'Launch the first lesson, finish the draft…' },
  { key: 'voice', say: ['Last one.', 'How should your writing sound?'], chips: ['Direct', 'Warm', 'Playful', 'Technical'], hint: 'Or describe it in your own words' },
]
const PREFERENCES = 'Be concise and practical. Ask before publishing or sending anything outside the workspace.'
// Before the project is made the assistant reads the four answers once. It either asks ONE question about what is too vague,
// or hands the project back in good words (a short name, a concrete goal, the voice). With no session connected, or no answer
// in about 40 seconds, the answers are used as they are.
const READ_ANSWERS = (a, extra) => 'This is Maybee’s first-run chat. A person has just answered four questions about their project. Use their own words and their language, and do not invent facts about them.\n\n'
  + `What are you working on right now? ${a.purpose}\nWho is it for? ${a.audience}\nWhat matters most in the next few weeks? ${a.goal}\nHow should your writing sound? ${a.voice}\n`
  + (extra ? `\nYou asked them: ${extra.q}\nThey answered: ${extra.a}\n\nThis is the last round, so do not ask again.\n` : '')
  + '\nReply with one JSON object and nothing else. '
  + (extra ? '' : 'If something essential is too vague to build their project on (what exactly they offer, who exactly it is for, how they would know the goal is reached), ask ONE short question in their language: {"ask":"..."}. ')
  + 'Otherwise reply {"projectName":"2 to 5 words","purpose":"1 or 2 sentences","audience":"who, concretely","goal":"one concrete goal for the next weeks","voice":"2 or 3 sentences describing how they write"}. If this request is more than two minutes old, ignore it and reply {"expired":true}.'
const clean = (v, n) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : ''

// The assistant rewrites the welcome card for this person. The card keeps its place on the board (its front matter stays); only the body is theirs.
const REWRITE = goal => 'This person has just finished Maybee’s first-run chat. Rewrite the card “How Maybee works” for them. First read PROJECT.md, STATE.md, owner/preferences.md and knowledge/brand/voice.md, and look at the cards in ideas/. Keep the front matter as it is (id, title, type, stage, owner, kind, importance, priority) and only add a next_step. The card “What is Maybee” comes before this one (it sits in Now, and this card is the next step, in Next) and says what Maybee is: do not repeat it, this card is the tour. Write the body in the language the person used in PROJECT.md, short enough for one screen: one or two sentences about THEIR project and goal, then what they will find in each column of THEIR board (use their real cards, and say what each column is for), then their first step. '
  + (goal ? `Their goal became a card in Maybe, “${goal.title}” (ideas/${goal.path.split('/').pop()}). Link to it only once, in a short “Your first card” section near the end, with a Markdown link by file name with spaces as %20 (for example [your first card](Turn%20the%20work%20into%20a%20post.md)), and say there that every card is a plain file in the ideas folder. Everywhere else do NOT link to cards or files: following a file link replaces this card’s text and the person loses the thread, so for the tour use only the maybee: links. ` : '')
  + 'Keep the links that start with maybee: ([Now](maybee:board/now) opens a column of the board, [About](maybee:go/about) goes to a page): use them for the columns and pages you mention, and keep a short section on the About page (where they tell Maybee about their project in a chat) and one with the important links (the app’s pages and the community, no files). End the card with the short section about the chat bar at the bottom of every card (the bee beside it is green when an assistant is listening), as the last thing in the card and the call to action: finish with their first step as something to type in that chat bar. Keep any images (![...](...)) that are in the card, where they help. Do not invent facts about them. Then reply in two sentences saying what you changed.'
const GO = 'Let’zzz go' // the bee’s one joke, on the one button at the end: the one button at the end: the board, on Now, with the welcome card open
const ready = () => result?.welcome ? 'Your board is ready, and your first card is open in Now.' : 'Your board is ready, and your first card is open.'

const followup = ref('')    // the question the assistant asked back, while the person answers it
const msgs = ref([])        // { id, from: 'bee' | 'you', text | html }
const typing = ref(false)   // Maybee is "writing": the dots, and the bee leans
const saving = ref(false)
const mode = ref('bot')     // 'bot' talking · 'ask' waiting for an answer · 'after' the setup is done
const chips = ref([])
const input = ref('')
const error = ref('')
const step = ref(0)
const box = ref(null)
const field = ref(null)
const answers = {}
let result = null
let uid = 0
let alive = true

const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const sleep = ms => new Promise(r => setTimeout(r, ms))
const scrollEnd = async () => { await nextTick(); if (box.value) box.value.scrollTo({ top: box.value.scrollHeight, behavior: reduce ? 'auto' : 'smooth' }) }

// each line shows the dots for a moment first, longer for a longer line, like someone typing
async function say(lines) {
  for (const text of [].concat(lines)) {
    if (!alive) return
    typing.value = true; scrollEnd()
    await sleep(reduce ? 0 : Math.min(900, 380 + text.length * 11))
    typing.value = false
    msgs.value.push({ id: ++uid, from: 'bee', text })
    await scrollEnd()
  }
}
const youSaid = text => { msgs.value.push({ id: ++uid, from: 'you', text }); scrollEnd() }

async function askStep() {
  const s = STEPS[step.value]
  mode.value = 'bot'; chips.value = []
  await say(s.say)
  if (!alive) return
  chips.value = s.chips || []
  mode.value = 'ask'
}
async function submit(text = input.value) {
  text = String(text || '').trim().slice(0, 2000)
  if (!text || mode.value !== 'ask') return
  input.value = ''; chips.value = []; mode.value = 'bot'
  youSaid(text)
  if (followup.value) { const q = followup.value; followup.value = ''; return finish({ q, a: text }) }
  answers[STEPS[step.value].key] = text
  if (step.value < STEPS.length - 1) { step.value++; await askStep() } else await finish()
}

// "A newsletter about cooking. Weekly." -> "A newsletter about cooking"
const nameFrom = t => { const n = t.split(/[.\n;:—–]|\s-\s/)[0].trim().replace(/\s+/g, ' ').slice(0, 60); return n ? n[0].toUpperCase() + n.slice(1) : 'My Maybee project' }

async function refine(extra) {
  const res = await ask({ action: 'Request', text: READ_ANSWERS(answers, extra), title: 'First-run chat', quiet: true }).catch(() => null)
  const id = res?.request?.id
  typing.value = true; scrollEnd()
  let reply = null
  for (let i = 0; i < 27 && alive && id && reply === null; i++) {
    await sleep(1500); await refreshInbox()
    const item = claude.items.find(x => x.id === id)
    if (item && item.status === 'done') reply = item.reply || ''
  }
  typing.value = false
  if (!reply) return null
  try { return JSON.parse(reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1)) } catch { return null }
}

let refined = null
async function finish(extra = null) {
  error.value = ''
  if (!refined && claude.listening) {
    await say(extra ? 'Thanks, that helps.' : 'One moment, let me read everything you told me.')
    const j = await refine(extra)
    if (!alive) return
    const question = j && !extra ? clean(j.ask, 300) : ''
    if (question) { followup.value = question; await say(question); mode.value = 'ask'; return }
    if (j && clean(j.projectName, 80)) {
      refined = { projectName: clean(j.projectName, 80), purpose: clean(j.purpose, 600), audience: clean(j.audience, 400), goal: clean(j.goal, 300), voice: clean(j.voice, 600) }
      for (const k of Object.keys(refined)) if (!refined[k]) delete refined[k]
    }
  }
  await say('Perfect. Give me a second to set things up…')
  saving.value = true
  try {
    const res = await fetch('/api/setup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...answers, projectName: nameFrom(answers.purpose), ...(refined || {}), preferences: PREFERENCES, language: 'English', firstCard: true }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Could not set up the project')
    result = data
    saving.value = false
    await say(data.firstCard
      ? ['Done. Your project is set up.', `I put your goal on the board as your first idea: “${data.firstCard.title}”.`]
      : ['Done. Your project is set up.'])
    // with a welcome card, the assistant writes it for this person right away; there is nothing to choose, only one button at the end
    if (data.welcome) await around()
    else { await say(ready()); chips.value = [GO]; mode.value = 'after' }
  } catch (e) {
    saving.value = false
    await say(`Something went wrong: ${e.message}`)
    chips.value = ['Try again']; mode.value = 'after'
  }
}

// The first real use: the assistant rewrites the welcome card for this person, and Maybee says what it did. Without a connected
// session Maybee says so plainly: the card stays as the general version, which still explains the board.
async function around() {
  const card = result?.welcome
  mode.value = 'bot'; chips.value = []
  if (!card) { await say(ready()); chips.value = [GO]; mode.value = 'after'; return }
  if (!claude.listening) {
    await say(['I can’t rewrite it for you just yet: no assistant session is connected to me.', 'The card is still there with the general version, and it explains the board. When you start a session in this project I turn green, and you can ask me to make it yours.'])
    await say(ready()); chips.value = [GO]; mode.value = 'after'; return
  }
  await say('Give me a moment: I’m writing the “How Maybee works” card for your project.')
  const res = await ask({ action: 'Request', text: REWRITE(result.firstCard), path: card.path, title: card.title, quiet: true }).catch(() => null)
  const id = res?.request?.id
  typing.value = true; scrollEnd()
  let reply = null
  for (let i = 0; i < 100 && alive && id && !reply; i++) {
    await sleep(1500); await refreshInbox()
    const item = claude.items.find(x => x.id === id)
    if (item && item.status === 'done') reply = item.reply || ''
  }
  typing.value = false
  if (!alive) return
  if (reply) { msgs.value.push({ id: ++uid, from: 'bee', html: md.render(reply) }); await scrollEnd() }
  else await say('This is taking longer than I expected. The card will change on its own when it is ready.')
  await say(ready()); chips.value = [GO]; mode.value = 'after'
}
// the welcome card opens in the viewer and the board shows the column it is in (Board.vue, reveal); with no welcome card, the goal card
const go = () => emit('done', { ...result, openPath: result?.intro?.path || result?.welcome?.path || result?.firstCard?.path })

function pick(c) {
  if (mode.value === 'ask') return submit(c)
  if (c === GO) return go()
  youSaid(c)
  if (c === 'Try again') return finish()
}

async function skip() {
  saving.value = true; error.value = ''
  try {
    const res = await fetch('/api/setup/skip', { method: 'POST' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Could not skip')
    emit('done', data)
  } catch (e) { error.value = e.message; saving.value = false }
}

function onKey(e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit() } }
watch(mode, m => { if (m === 'ask') nextTick(() => field.value?.focus()) })
onMounted(askStep)
onBeforeUnmount(() => { alive = false })
</script>

<template>
  <div class="onboarding-backdrop">
    <section class="ob" role="dialog" aria-label="Meet Maybee">
      <header>
        <img class="ob-bee" :class="{ leaning: typing || saving }" :src="logo" alt="" />
        <div class="ob-who"><b>Maybee</b><span class="ob-dots" :aria-label="'Question ' + (step + 1) + ' of ' + STEPS.length"><i v-for="(s, i) in STEPS" :key="s.key" :class="{ on: i < step || (i === step && mode === 'ask'), done: mode === 'after' || saving }"></i></span></div>
        <button class="ob-skip" :disabled="saving" @click="skip">Skip for now</button>
      </header>

      <div ref="box" class="ob-msgs" aria-live="polite">
        <div v-for="m in msgs" :key="m.id" class="ob-row" :class="m.from === 'you' ? 'you' : 'ai'">
          <div v-if="m.html" class="md" v-html="m.html"></div>
          <p v-else>{{ m.text }}</p>
        </div>
        <div v-if="typing" class="ob-row ai typing" aria-label="Maybee is writing"><i></i><i></i><i></i></div>
      </div>

      <div v-if="chips.length" class="ob-quick">
        <button v-for="c in chips" :key="c" :class="{ main: c === GO }" :aria-label="c === GO ? 'Let’s go' : null" @click="pick(c)">{{ c }}</button>
      </div>
      <p v-if="error" class="onboarding-error ob-error">{{ error }}</p>
      <form v-if="mode !== 'after'" class="ob-compose" @submit.prevent="submit()">
        <textarea ref="field" v-model="input" rows="1" maxlength="2000" :disabled="mode !== 'ask'"
          :placeholder="mode === 'ask' ? (followup ? 'Your answer…' : STEPS[step].hint) : 'Maybee is writing…'" @keydown="onKey"></textarea>
        <button class="ob-send" :disabled="mode !== 'ask' || !input.trim()" title="Send (Enter)">Send</button>
      </form>
    </section>
  </div>
</template>

<style scoped>
.ob { width: min(620px, 100%); height: min(700px, calc(100vh - 48px)); display: flex; flex-direction: column; border-radius: 28px; background: var(--card-hi); box-shadow: 0 24px 80px #16151333; overflow: hidden; }
header { display: flex; align-items: center; gap: 12px; padding: 18px 22px 14px; border-bottom: 1px solid var(--line); }
.ob-bee { height: 40px; width: auto; display: block; transform-origin: 50% 85%; }
.ob-bee.leaning { animation: ob-sway 1.6s ease-in-out infinite; }
@keyframes ob-sway { 0%, 100% { transform: rotate(-6deg); } 50% { transform: rotate(6deg); } }
.ob-who { display: grid; gap: 5px; flex: 1; }
.ob-who b { font-size: 17px; letter-spacing: -.02em; line-height: 1; }
.ob-dots { display: flex; gap: 5px; }
.ob-dots i { width: 18px; height: 4px; border-radius: 99px; background: var(--line); transition: background .25s ease; }
.ob-dots i.on, .ob-dots i.done { background: var(--accent); }
.ob-skip { padding: 7px 13px; border-radius: 99px; color: var(--ink-3); font-size: 13px; font-weight: 600; }
.ob-skip:hover:not(:disabled) { background: var(--card); color: var(--ink-2); }
.ob-skip:disabled { opacity: .4; cursor: default; }

.ob-msgs { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding: 22px 22px 8px; scrollbar-width: none; }
.ob-msgs::-webkit-scrollbar { display: none; }
.ob-row { max-width: 84%; padding: 10px 15px; border-radius: 18px; animation: ob-in .2s ease both; }
.ob-row p { margin: 0; white-space: pre-wrap; line-height: 1.5; font-size: 15px; }
.ob-row.ai { align-self: flex-start; background: var(--card); border-bottom-left-radius: 6px; }
.ob-row.you { align-self: flex-end; background: var(--ink); color: #fff; border-bottom-right-radius: 6px; }
.ob-row .md { font-size: 14.5px; line-height: 1.55; }
.ob-row .md :deep(p) { margin: 0 0 8px; }
.ob-row .md :deep(p:last-child), .ob-row .md :deep(ul:last-child) { margin-bottom: 0; }
.ob-row .md :deep(ul), .ob-row .md :deep(ol) { margin: 0 0 8px; padding-left: 20px; }
@keyframes ob-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

.ob-row.typing { display: flex; gap: 5px; align-items: center; padding: 14px 16px; }
.ob-row.typing i { width: 7px; height: 7px; border-radius: 50%; background: var(--ink-3); animation: ob-dot 1.1s ease-in-out infinite; }
.ob-row.typing i:nth-child(2) { animation-delay: .16s; }
.ob-row.typing i:nth-child(3) { animation-delay: .32s; }
@keyframes ob-dot { 0%, 60%, 100% { opacity: .35; transform: none; } 30% { opacity: 1; transform: translateY(-3px); } }

.ob-quick { display: flex; flex-wrap: wrap; gap: 8px; padding: 6px 22px 12px; }
.ob-quick button { padding: 8px 15px; border-radius: 99px; background: var(--card); font-size: 14px; font-weight: 600; color: var(--ink-2); transition: background .12s ease, color .12s ease; }
.ob-quick button:hover { background: var(--accent); color: var(--ink); }
.ob-quick button.main { background: var(--accent); color: var(--ink); }
.ob-quick button.main:hover { background: color-mix(in srgb, var(--accent), #000 7%); }
.ob-error { margin: 0 22px 8px; }

.ob-compose { display: flex; align-items: flex-end; gap: 8px; margin: 4px 16px 16px; padding: 8px 8px 8px 16px; border: 1px solid var(--line); border-radius: 26px; background: var(--page); transition: border-color .12s ease, box-shadow .12s ease; }
.ob-compose:focus-within { border-color: var(--ink-3); box-shadow: 0 0 0 3px var(--accent-soft); }
.ob-compose textarea { flex: 1; min-height: 24px; max-height: 120px; border: 0; background: transparent; padding: 7px 0; font: 500 15px/1.5 var(--sans); resize: none; outline: none; color: var(--ink); field-sizing: content; }
.ob-compose textarea:disabled { color: var(--ink-3); }
.ob-send { flex: none; padding: 9px 18px; border-radius: 99px; background: var(--ink); color: #fff; font-size: 14px; font-weight: 700; }
.ob-send:disabled { opacity: .38; cursor: default; }

@media (max-width: 640px) { .ob { height: calc(100vh - 24px); border-radius: 22px; } .ob-row { max-width: 92%; } }
@media (prefers-reduced-motion: reduce) { .ob-bee.leaning, .ob-row, .ob-row.typing i { animation: none; } }
</style>

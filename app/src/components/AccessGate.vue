<script setup>
import logo from '../assets/logo.png'
import { computed, onMounted, onUnmounted, ref } from 'vue'

const props = defineProps({ preview: { type: String, default: null } })
const emit = defineEmits(['verified'])
const status = ref(null)
const checking = ref(false)
const error = ref('')
const opened = ref(false)
const confirmed = ref(false)
// The check can finish in about two seconds, too fast for the person to notice that a validation
// happened. When this screen ran the check, it stays visible for at least MIN_CHECK_MS in total and
// ends with a short "Membership confirmed" before opening the app.
const MIN_CHECK_MS = 5000
const MIN_CONFIRMED_MS = 1200
let checkStartedAt = 0
let finishing = false
function startClock() { if (!checkStartedAt) checkStartedAt = Date.now() }
function finish(data) {
  if (finishing) return
  finishing = true
  if (!checkStartedAt) { emit('verified', data); return }   // already verified before this screen: no wait
  confirmed.value = true
  error.value = ''
  const wait = Math.max(MIN_CONFIRMED_MS, MIN_CHECK_MS - (Date.now() - checkStartedAt))
  setTimeout(() => emit('verified', data), wait)
}
let accessEvents

async function jsonResponse(response) {
  const text = await response.text()
  try { return JSON.parse(text) } catch { throw new Error(`Maybee server returned ${response.status} instead of access JSON. Restart the local server.`) }
}

async function load() {
  try {
    status.value = await jsonResponse(await fetch('/api/access'))
    if (status.value.verifying) startClock()
    if (status.value.valid) finish(status.value)
  } catch (e) { if (!status.value) error.value = e.message }
}
let silentRun = false // the automatic check on open: if it cannot confirm, the button is enough, no message
async function verify(silent = false) {
  if (props.preview) return
  silentRun = silent === true
  checking.value = true; error.value = ''; startClock()
  try {
    if (status.value?.mode === 'agent-browser') {
      if (!opened.value) window.open(status.value.verificationTarget, '_blank', 'noopener,noreferrer')
      opened.value = true
    }
    const res = await fetch('/api/access/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'available-browser', reason: silent === true ? 'auto-silent' : 'manual' }) })
    status.value = await jsonResponse(res)
    if (status.value.valid) finish(status.value)
    else if (status.value.mode === 'agent-browser') error.value = 'Leave the How I tab open. Log in if needed, then ask Claude/Codex to check again. This screen will unlock automatically after confirmation.'
    else if (!status.value.verifying && !silentRun) error.value = status.value.details
  } catch (e) { error.value = e.message }
  finally { checking.value = false }
}
// The local browser check runs in the background (it may wait for a Skool login), so the
// server pushes every change on /api/access/events instead of the page polling.
const verifying = computed(() => confirmed.value || checking.value || !!status.value?.verifying)
const phaseText = computed(() => status.value?.phase === 'waiting-login'
  ? 'Log in to Skool in the window that opened…'
  : status.value?.phase === 'checking' ? 'Checking your membership…' : 'Opening the browser…')
const buttonText = computed(() => confirmed.value ? '✓ Membership confirmed' : verifying.value ? phaseText.value : (opened.value ? 'Check again' : (status.value?.mode === 'agent-browser' ? 'Open How I' : 'Verify membership')))
// The community's name and page come from the server, so a rename is one change there.
const community = computed(() => status.value?.community || 'How I')
const plan = computed(() => `${community.value} Premium`)
const groupUrl = computed(() => (status.value?.verificationTarget || 'https://www.skool.com/how-i-9301').replace(/\/$/, ''))
const joinUrl = computed(() => groupUrl.value + '/about')
const plansUrl = computed(() => groupUrl.value + '/plans')
// Not in the community, or in it on the free plan: either way the way in is How I Premium.
const notMember = computed(() => !verifying.value && ['not-member', 'not-premium'].includes(status.value?.result))
const freePlan = computed(() => status.value?.result === 'not-premium')
// With no button for non-members, coming back from Skool (after joining or upgrading) runs the silent check again.
function onReturn() { if (notMember.value) verify(true) }
let wasVerifying = false
async function onAccessEvent(event) {
  const data = JSON.parse(event.data)
  await load()
  // A check that just ended without unlocking: show why (not a member, window closed, timeout…).
  if (wasVerifying && !data.verifying && !status.value?.valid) error.value = silentRun ? '' : (status.value?.details || '')
  if (!data.verifying && wasVerifying) silentRun = false
  if (data.verifying) { error.value = ''; startClock() }
  if (!data.verifying && !status.value?.valid) checkStartedAt = 0
  wasVerifying = !!data.verifying
}
// The app starts locked. The member explicitly starts the local browser check
// with the button; after a failed attempt the same button is the retry path.
onMounted(() => {
  if (props.preview) { status.value = { community: 'How I', mode: 'local', result: ['not-member', 'not-premium'].includes(props.preview) ? props.preview : null }; return }
  // The check starts by itself, but only the silent kind: no window ever opens without a click. If it cannot
  // confirm (not logged in, unreadable page) the button is what is left, and the click may open the Skool window.
  // Not after a failure either: a browser that failed to start is retried only by the button.
  load().then(() => {
    const s = status.value
    if (s && !s.valid && !s.verifying && !s.lastErrorAt && s.mode !== 'agent-browser') verify(true)
  })
  window.addEventListener('focus', onReturn)
  accessEvents = new EventSource('/api/access/events')
  accessEvents.onmessage = onAccessEvent
})
onUnmounted(() => { accessEvents?.close(); window.removeEventListener('focus', onReturn) })
</script>

<template>
  <div class="onboarding-backdrop gate-backdrop">
    <section class="gate" role="dialog" aria-label="Maybee membership">
      <div class="gate-glow" aria-hidden="true"></div>
      <img class="gate-bee" :class="{ busy: verifying && !confirmed }" :src="logo" alt="" />
      <p class="gate-kicker">For {{ plan }} members</p>
      <h1 v-if="confirmed">Welcome back.</h1>
      <h1 v-else-if="notMember">Maybee comes with {{ plan }}.</h1>
      <h1 v-else>Your ideas, from a first thought to finished work.</h1>
      <p v-if="freePlan" class="gate-lead">You’re in {{ community }} on the free plan. Maybee comes with Premium.</p>
      <p v-else-if="notMember" class="gate-lead">This Skool account isn’t on {{ plan }} yet.</p>
      <p v-else class="gate-lead">Maybee is available with your {{ plan }} membership on Skool. Sign in once and it opens.</p>

      <ul class="gate-points">
        <li><span>💡</span><b>One place for every idea</b></li>
        <li><span>👣</span><b>Always a clear next step</b></li>
        <li><span>🤝</span><b>An assistant that does the work with you</b></li>
      </ul>

      <p v-if="error && !verifying && !notMember" class="gate-error">{{ error }}</p>
      <div class="gate-actions">
        <a v-if="notMember" class="gate-go" :href="freePlan ? plansUrl : joinUrl" target="_blank" rel="noopener noreferrer">{{ freePlan ? 'Upgrade to Premium' : 'Get ' + plan }}</a>
        <button v-else class="gate-go" :disabled="verifying" :aria-busy="verifying" @click="verify"><span v-if="verifying && !confirmed" class="access-spinner" aria-hidden="true"></span>{{ buttonText }}</button>
      </div>
      <p v-if="notMember" class="gate-instant">⚡ Access is unlocked instantly.<br />Come back to this tab and Maybee opens.</p>
      <a v-if="!notMember && !verifying" class="gate-join" :href="joinUrl" target="_blank" rel="noopener noreferrer">Not on Premium yet? See {{ plan }} →</a>

      <p v-if="status?.mode === 'agent-browser'" class="gate-fine">Maybee opens {{ community }} in the browser your assistant uses. Log in there if Skool asks, then tell your assistant to check again; this screen unlocks by itself.</p>
      <p v-else-if="notMember" class="gate-fine">Maybee only reads your {{ community }} membership and plan on Skool. Your password and e-mail are not stored.</p>
      <p v-else class="gate-fine">Maybee checks in the background first. If it can’t confirm, the button opens a small Skool window to log in (only the first time). It only reads whether you’re a member: your password and e-mail are not stored.</p>
    </section>
  </div>
</template>

<style scoped>
/* the lock sits above everything in the app, the idea bar and sheets included */
.gate-backdrop { z-index: 100; }
.gate { position: relative; overflow: hidden; width: min(600px, 100%); max-height: calc(100vh - 48px); overflow-y: auto; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 32px 32px 24px; border-radius: 28px; background: var(--dark); color: #fff; box-shadow: 0 24px 80px #16151333; scrollbar-width: none; }
.gate > * { position: relative; }
.gate-glow { position: absolute; width: 380px; height: 380px; top: -90px; left: 50%; transform: translateX(-50%); border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--accent) 42%, transparent), transparent 70%); animation: gate-pulse 4s ease-in-out infinite; pointer-events: none; }
.gate-bee { height: 76px; width: auto; animation: gate-arrive .9s cubic-bezier(.2,.9,.3,1.3) both, gate-hover 3s ease-in-out .9s infinite; }
.gate-bee.busy { animation: gate-sway 1.4s ease-in-out infinite; }
.gate-kicker { margin: 14px 0 0; font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--accent); animation: gate-in .5s ease .3s both; }
.gate h1 { margin: 6px 0 0; max-width: 480px; font-size: 30px; line-height: 1.12; letter-spacing: -.035em; animation: gate-in .5s ease .4s both; }
.gate-lead { margin: 10px 0 0; max-width: 420px; font-size: 16px; line-height: 1.5; color: #ffffffb3; animation: gate-in .5s ease .5s both; }
.gate-points { list-style: none; margin: 20px 0 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; width: 100%; animation: gate-in .5s ease .6s both; }
.gate-points li { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 10px; border-radius: 14px; background: #ffffff0f; text-align: center; }
.gate-points span { font-size: 18px; line-height: 1; }
.gate-points b { font-size: 13px; font-weight: 600; line-height: 1.3; color: #ffffffe6; }
.gate-error { margin: 16px 0 0; max-width: 420px; padding: 10px 14px; border-radius: 12px; background: #ff6b5a1f; color: #ffb4a8; font-size: 13.5px; line-height: 1.45; }
.gate-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 20px; animation: gate-in .5s ease .7s both; }
.gate-go { display: inline-flex; align-items: center; padding: 14px 28px; border-radius: 99px; font-size: 16px; font-weight: 700; text-decoration: none; transition: transform .12s ease, background .12s ease; }
.gate-go { background: var(--accent); color: var(--ink); }
.gate-go:hover:not(:disabled) { transform: scale(1.03); }
.gate-go:disabled { cursor: default; opacity: .85; }
.gate-instant { margin: 12px 0 0; font-size: 13.5px; font-weight: 600; color: #ffffffb3; }
.gate-join { margin-top: 14px; font-size: 14px; font-weight: 600; color: #ffffffa6; text-decoration: none; }
.gate-join:hover { color: var(--accent); }
.gate-fine { margin: 18px 0 0; max-width: 420px; font-size: 12.5px; line-height: 1.5; color: #ffffff73; }
.access-spinner { display: inline-block; width: 0.9em; height: 0.9em; margin-right: 0.55em; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; vertical-align: -0.12em; animation: access-spin 0.8s linear infinite; }
@keyframes access-spin { to { transform: rotate(360deg); } }
@keyframes gate-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes gate-arrive { from { opacity: 0; transform: translate(-50px, 26px) rotate(-25deg) scale(.6); } to { opacity: 1; transform: none; } }
@keyframes gate-hover { 0%, 100% { transform: translateY(0) rotate(-3deg); } 50% { transform: translateY(-6px) rotate(3deg); } }
@keyframes gate-sway { 0%, 100% { transform: rotate(-7deg); } 50% { transform: rotate(7deg); } }
@keyframes gate-pulse { 0%, 100% { opacity: .7; } 50% { opacity: 1; } }
@media (max-width: 640px) { .gate { padding: 28px 18px 20px; border-radius: 22px; } .gate h1 { font-size: 24px; } .gate-points { grid-template-columns: 1fr; } .gate-points li { flex-direction: row; padding: 9px 12px; text-align: left; } }
/* short windows: the button must stay in view */
@media (max-height: 760px) { .gate { padding-top: 22px; } .gate-bee { height: 52px; } .gate h1 { font-size: 26px; } .gate-lead { font-size: 15px; } .gate-points { margin-top: 14px; } .gate-points li { padding: 9px 8px; } .gate-actions { margin-top: 14px; } .gate-fine { margin-top: 12px; } }
@media (max-height: 620px) { .gate-points { display: none; } .gate-glow { top: -140px; } }
@media (prefers-reduced-motion: reduce) { .gate-glow, .gate-bee, .gate-kicker, .gate h1, .gate-lead, .gate-points, .gate-actions { animation: none; } }
</style>

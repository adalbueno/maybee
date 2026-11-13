<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'

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
async function verify() {
  checking.value = true; error.value = ''; startClock()
  try {
    if (status.value?.mode === 'agent-browser') {
      if (!opened.value) window.open(status.value.verificationTarget, '_blank', 'noopener,noreferrer')
      opened.value = true
    }
    const res = await fetch('/api/access/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'available-browser' }) })
    status.value = await jsonResponse(res)
    if (status.value.valid) finish(status.value)
    else if (status.value.mode === 'agent-browser') error.value = 'Leave the How I tab open. Log in if needed, then ask Claude/Codex to check again. This screen will unlock automatically after confirmation.'
    else if (!status.value.verifying) error.value = status.value.details
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
let wasVerifying = false
async function onAccessEvent(event) {
  const data = JSON.parse(event.data)
  await load()
  // A check that just ended without unlocking: show why (not a member, window closed, timeout…).
  if (wasVerifying && !data.verifying && !status.value?.valid) error.value = status.value?.details || ''
  if (data.verifying) { error.value = ''; startClock() }
  if (!data.verifying && !status.value?.valid) checkStartedAt = 0
  wasVerifying = !!data.verifying
}
// The app starts locked. The member explicitly starts the local browser check
// with the button; after a failed attempt the same button is the retry path.
onMounted(() => {
  // The window opens at once and the check starts by itself (no click needed): it runs without a
  // window, and a Skool window only appears when the person has to log in.
  load().then(() => {
    const s = status.value
    if (s && !s.valid && !s.verifying && s.mode !== 'agent-browser') verify()
  })
  accessEvents = new EventSource('/api/access/events')
  accessEvents.onmessage = onAccessEvent
})
onUnmounted(() => accessEvents?.close())
</script>

<template>
  <div class="onboarding-backdrop">
    <section class="onboarding-card access-card">
      <div class="onboarding-mark">M</div>
      <p class="onboarding-kicker">Session access</p>
      <h1>Verify your How I membership.</h1>
      <p v-if="status?.mode === 'agent-browser'" class="onboarding-intro">Maybee opens How I in the browser already available to Claude or Codex. If Skool asks you to log in, do it there; Maybee will unlock after the browser confirms your membership.</p>
      <p v-else class="onboarding-intro">Maybee opens a small browser window on Skool to confirm that you are a member of How I. If Skool asks you to log in, do it there (only the first time); the window closes by itself and Maybee unlocks.</p>
      <div class="access-rule"><b>Required every session</b><span>Without a successful check, the app stays locked.</span></div>
      <p v-if="error && !verifying" class="onboarding-error">{{ error }}</p>
      <button class="onboarding-next access-button" :disabled="verifying" :aria-busy="verifying" @click="verify"><span v-if="verifying && !confirmed" class="access-spinner" aria-hidden="true"></span>{{ buttonText }}</button>
      <p v-if="status?.mode === 'agent-browser'" class="access-help">After logging in, tell your assistant to verify access in the open Skool tab. This screen unlocks when verification is complete.</p>
      <p v-else class="access-help">Maybee only reads whether your Skool account is a member of How I. Your password and e-mail are not stored.</p>
    </section>
  </div>
</template>

<style scoped>
.access-spinner { display: inline-block; width: 0.9em; height: 0.9em; margin-right: 0.55em; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; vertical-align: -0.12em; animation: access-spin 0.8s linear infinite; }
@keyframes access-spin { to { transform: rotate(360deg); } }
</style>

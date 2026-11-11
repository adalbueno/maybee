<script setup>
import { onMounted, ref } from 'vue'

const emit = defineEmits(['verified'])
const status = ref(null)
const checking = ref(false)
const error = ref('')
const opened = ref(false)

async function jsonResponse(response) {
  const text = await response.text()
  try { return JSON.parse(text) } catch { throw new Error(`Maybee server returned ${response.status} instead of access JSON. Restart the local server.`) }
}

async function load() {
  try {
    status.value = await jsonResponse(await fetch('/api/access'))
    if (status.value.valid) emit('verified', status.value)
  } catch (e) { if (!status.value) error.value = e.message }
}
async function verify() {
  checking.value = true; error.value = ''
  try {
    if (status.value?.mode === 'agent-browser') {
      if (!opened.value) window.open(status.value.verificationTarget, '_blank', 'noopener,noreferrer')
      opened.value = true
    }
    const res = await fetch('/api/access/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'available-browser' }) })
    status.value = await jsonResponse(res)
    if (status.value.valid) emit('verified', status.value)
    else if (status.value.mode === 'agent-browser') error.value = 'Leave the How I tab open. Log in if needed, then ask Claude/Codex to check again. This screen will unlock automatically after confirmation.'
    else error.value = status.value.details
  } catch (e) { error.value = e.message }
  finally { checking.value = false }
}
// The app starts locked. The browser agent confirms membership; the member
// explicitly starts another check with the button after logging in.
onMounted(load)
</script>

<template>
  <div class="onboarding-backdrop">
    <section class="onboarding-card access-card">
      <div class="onboarding-mark">M</div>
      <p class="onboarding-kicker">Session access</p>
      <h1>Verify your How I membership.</h1>
      <p class="onboarding-intro">Maybee opens How I in the browser already available to Claude or Codex. If Skool asks you to log in, do it there; Maybee will unlock after the browser confirms your membership.</p>
      <div class="access-rule"><b>Required every session</b><span>Without a successful check, the app stays locked.</span></div>
      <p v-if="error" class="onboarding-error">{{ error }}</p>
      <button class="onboarding-next access-button" :disabled="checking" @click="verify">{{ checking ? 'Checking…' : (opened ? 'Check again' : 'Open How I') }}</button>
      <p class="access-help">Keep the tab open after logging in, then click “Check again”. No password or cookie is sent to Maybee.</p>
    </section>
  </div>
</template>

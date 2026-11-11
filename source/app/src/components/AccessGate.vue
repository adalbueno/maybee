<script setup>
import { onMounted, ref } from 'vue'

const emit = defineEmits(['verified'])
const status = ref(null)
const checking = ref(false)
const error = ref('')

async function jsonResponse(response) {
  const text = await response.text()
  try { return JSON.parse(text) } catch { throw new Error(`Maybee server returned ${response.status} instead of access JSON. Restart the local server.`) }
}

async function load() {
  status.value = await jsonResponse(await fetch('/api/access'))
  if (status.value.valid) emit('verified', status.value)
}
async function verify() {
  checking.value = true; error.value = ''
  try {
    const res = await fetch('/api/access/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'skool-local-verifier' }) })
    status.value = await jsonResponse(res)
    if (status.value.valid) emit('verified', status.value)
    else error.value = status.value.details
  } catch (e) { error.value = e.message }
  finally { checking.value = false }
}
// The app starts locked. The member explicitly starts the local browser check
// with the button; after a failed attempt the same button is the retry path.
onMounted(load)
</script>

<template>
  <div class="onboarding-backdrop">
    <section class="onboarding-card access-card">
      <div class="onboarding-mark">M</div>
      <p class="onboarding-kicker">Session access</p>
      <h1>Verify your How I membership.</h1>
      <p class="onboarding-intro">Before opening the project, Maybee will open How I in a local browser and confirm that this account can access the community. No Skool password or cookie is sent to the Maybee server.</p>
      <div class="access-rule"><b>Required every session</b><span>Without a successful check, the app stays locked.</span></div>
      <p v-if="error" class="onboarding-error">{{ error }}</p>
      <button class="onboarding-next access-button" :disabled="checking" @click="verify">{{ checking ? 'Checking Skool…' : 'Verify on Skool' }}</button>
      <p class="access-help">The first check may open a separate local browser profile. Log in there once; the profile stays on this computer and is never uploaded.</p>
    </section>
  </div>
</template>

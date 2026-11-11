<script setup>
import { ref } from 'vue'

const emit = defineEmits(['done'])
const step = ref(0)
const saving = ref(false)
const error = ref('')
const answers = ref({ projectName: '', purpose: '', audience: '', goal: '', preferences: '', voice: '', language: 'English' })
const questions = [
  ['projectName', 'What is this project called?', 'For example: my studio, my research, or my business.'],
  ['purpose', 'What are you trying to make or move forward?', 'A short description is enough.'],
  ['audience', 'Who is this project for?', 'People, clients, members, readers, or only you.'],
  ['goal', 'What matters most right now?', 'This becomes the first line in STATE.md.'],
  ['preferences', 'How should Maybee work with you?', 'For example: concise, practical, ask before publishing, keep things simple.'],
  ['voice', 'How should your writing sound?', 'For example: warm, direct, playful, technical, or understated.'],
]
const current = () => questions[step.value]
function next() {
  if (!answers.value[current()[0]].trim()) return
  if (step.value < questions.length - 1) step.value++
  else finish()
}
async function finish() {
  saving.value = true; error.value = ''
  try {
    const res = await fetch('/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(answers.value) })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Could not create the project')
    emit('done', data)
  } catch (e) { error.value = e.message }
  finally { saving.value = false }
}
async function skip() {
  saving.value = true; error.value = ''
  try {
    const res = await fetch('/api/setup/skip', { method: 'POST' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Could not skip onboarding')
    emit('done', data)
  } catch (e) { error.value = e.message }
  finally { saving.value = false }
}
</script>

<template>
  <div class="onboarding-backdrop">
    <section class="onboarding-card">
      <div class="onboarding-mark">M</div>
      <p class="onboarding-kicker">First run · {{ step + 1 }} of {{ questions.length }}</p>
      <h1>Let’s make this project yours.</h1>
      <p class="onboarding-intro">I’ll ask a few questions, then create the Maybee structure in this workspace. Existing files will be kept.</p>
      <label>{{ current()[1] }}<small>{{ current()[2] }}</small>
        <textarea v-model="answers[current()[0]]" autofocus @keydown.enter.exact.prevent="next" />
      </label>
      <p v-if="error" class="onboarding-error">{{ error }}</p>
      <div class="onboarding-actions">
        <button class="onboarding-back" :disabled="saving" @click="skip">Skip for now</button>
        <button v-if="step" class="onboarding-back" @click="step--">Back</button>
        <button class="onboarding-next" :disabled="saving || !answers[current()[0]].trim()" @click="next">{{ saving ? 'Creating…' : step === questions.length - 1 ? 'Create my project' : 'Continue' }}</button>
      </div>
    </section>
  </div>
</template>

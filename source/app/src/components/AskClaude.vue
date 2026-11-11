<script setup>
import { ref } from 'vue'
import { ask } from '../ask.js'
const props = defineProps({ path: String, title: String, quick: { type: Array, default: () => [] }, label: { type: String, default: 'Ask AI' }, small: Boolean })

const open = ref(false)
const text = ref('')
const sending = ref(false)

async function send(action, extra = '') {
  sending.value = true
  await ask({ action, text: extra, path: props.path, title: props.title })
  sending.value = false
  open.value = false
  text.value = ''
}
</script>

<template>
  <div class="ask" @click.stop>
    <button class="ask-btn" :class="{ small }" @click="open = !open"><i>✳</i>{{ label }}</button>
    <div v-if="open" class="ask-pop">
      <div v-if="quick.length" class="ask-quick">
        <button v-for="q in quick" :key="q" :disabled="sending" @click="send(q)">{{ q }}</button>
      </div>
      <textarea v-model="text" rows="3" placeholder="Or write what you want the AI to do…" @keydown.ctrl.enter="text.trim() && send('Request', text)" @keydown.meta.enter="text.trim() && send('Request', text)"></textarea>
      <div class="ask-foot">
        <span>Ctrl+Enter</span>
        <button class="pill-btn" :disabled="!text.trim() || sending" @click="send('Request', text)">Send</button>
      </div>
    </div>
  </div>
</template>

<script setup>
// Maybee's face. Three bees are stacked and the state fades between them:
// grey = nobody listens (fainter when the app is offline), green = listening,
// yellow = working, swaying, then back to green when it is done.
import grey from '../assets/bee-grey.png'
import green from '../assets/bee-green.png'
import yellow from '../assets/bee-yellow.png'
import { ref, watch } from 'vue'
const props = defineProps({ state: { type: String, default: 'idle' }, height: { type: Number, default: 14 } })
// when the work ends and it goes back to green, the bee gives one pulse, as if it had finished
const done = ref(false)
let timer = null
watch(() => props.state, (now, was) => {
  if (was !== 'busy' || now !== 'ok') return
  done.value = true
  clearTimeout(timer); timer = setTimeout(() => { done.value = false }, 700)
})
</script>

<template>
  <span class="bee" :class="[state, { done }]" :style="{ height: height + 'px', width: height * 0.775 + 'px' }" aria-hidden="true">
    <img class="b-grey" :src="grey" alt="" /><img class="b-green" :src="green" alt="" /><img class="b-yellow" :src="yellow" alt="" />
  </span>
</template>

<style scoped>
.bee { position: relative; display: block; flex: none; }
.bee img { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; transition: opacity .3s ease; }
.idle .b-grey { opacity: .75; }
.off .b-grey { opacity: .35; }
.ok .b-green { opacity: 1; }
/* the yellow bee fades in and sways, a little to one side and then the other, until the work is over */
.busy .b-yellow { opacity: 1; animation: bee-sway 1.2s ease-in-out infinite; }
@keyframes bee-sway { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(-11deg); } 75% { transform: rotate(11deg); } }
.done .b-green { animation: bee-done .6s ease-out; }
@keyframes bee-done { 0% { transform: scale(1); } 35% { transform: scale(1.3); } 100% { transform: scale(1); } }
@media (prefers-reduced-motion: reduce) { .busy .b-yellow, .done .b-green { animation: none; } }
</style>

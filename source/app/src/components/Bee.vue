<script setup>
// Maybee's status mark: the logo's body without the antennae, one shape, and the colour says the state.
// grey = nobody listens (fainter when the app is offline), green = listening (a slow pulse),
// yellow = working: the real bee, with its antennae, leans slowly from side to side, red = the last request failed (one shake).
// Colour is never the only signal: each state also moves differently.
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
  <span class="bee" :class="[state, { done }]" :style="{ height: height + 'px', width: height * 1.09 + 'px' }" aria-hidden="true">
    <svg viewBox="0 0 100 92" width="100%" height="100%">
      <defs>
        <linearGradient id="bee-shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fff" stop-opacity=".38" /><stop offset=".55" stop-color="#fff" stop-opacity="0" /><stop offset="1" stop-color="#000" stop-opacity=".16" />
        </linearGradient>
      </defs>
      <rect class="body" x="3" y="3" width="94" height="86" rx="30" />
      <rect x="3" y="3" width="94" height="86" rx="30" fill="url(#bee-shade)" />
    </svg>
    <img class="real" :src="yellow" alt="" />
  </span>
</template>

<style scoped>
.bee { --bee: #9aa0a6; position: relative; display: block; flex: none; }
.bee svg { display: block; overflow: visible; transition: opacity .3s ease; }
/* working: the square gives way to the real bee (the logo itself, antennae included) */
.bee .real { position: absolute; left: 50%; top: 50%; height: 125%; width: auto; transform: translate(-50%, -50%); opacity: 0; transition: opacity .3s ease; pointer-events: none; }
.busy svg { opacity: 0; }
.busy .real { opacity: 1; animation: bee-sway 1.6s ease-in-out infinite; }
.bee .body { fill: var(--bee); transition: fill .3s ease; }
.idle { --bee: #9aa0a6; }
.off { --bee: #9aa0a6; opacity: .45; }
.ok { --bee: #2fae6b; }
.busy { --bee: #f2b01e; }
.error { --bee: #d94848; }
/* listening: a slow pulse; bigger and darker as it comes closer, smaller and lighter as it drifts away */
.ok svg { animation: bee-listen 2.6s ease-in-out infinite; }
@keyframes bee-listen { 0%, 100% { transform: scale(1); opacity: .75; } 50% { transform: scale(1.04); opacity: 1; } }
/* working: leans slowly from side to side, no bounce, until the work is over */
@keyframes bee-sway { 0%, 100% { transform: translate(-50%, -50%) rotate(-7deg); } 50% { transform: translate(-50%, -50%) rotate(7deg); } }
.ok.done svg { animation: bee-done .6s ease-out; }
@keyframes bee-done { 0% { transform: scale(1); } 35% { transform: scale(1.3); } 100% { transform: scale(1); } }
/* failed: one quick shake, then still */
.error svg { animation: bee-shake .5s ease-in-out; }
@keyframes bee-shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-12%); } 40% { transform: translateX(10%); } 60% { transform: translateX(-7%); } 80% { transform: translateX(4%); } }
@media (prefers-reduced-motion: reduce) { .busy .real, .ok svg, .ok.done svg, .error svg { animation: none; } }
</style>

<script setup>
// Maybee's status mark: the logo's body without the antennae, one shape, and the colour says the state.
// grey = nobody listens (fainter when the app is offline), green = listening (a slow pulse),
// yellow = working: the real bee, with its antennae, leans slowly from side to side, red = the last request failed (one shake).
// Colour is never the only signal: each state also moves differently.
import yellow from '../assets/bee-yellow.png'
import { ref, watch } from 'vue'
// party: a counter the top bar raises when finished work is ready to look at. Each rise is a small win: the bee spins like the logo
// does on click and a burst of pollen flies out. An ordinary finish keeps the plain pulse.
const props = defineProps({ state: { type: String, default: 'idle' }, height: { type: Number, default: 14 }, party: { type: Number, default: 0 } })
// when the work ends and it goes back to green, the bee gives one pulse, as if it had finished
const done = ref(false)
let timer = null
watch(() => props.state, (now, was) => {
  if (was !== 'busy' || now !== 'ok') return
  done.value = true
  clearTimeout(timer); timer = setTimeout(() => { done.value = false }, 700)
})
const big = ref(false)
let bigTimer = null
watch(() => props.party, n => {
  if (!n) return
  big.value = false
  requestAnimationFrame(() => { big.value = true }) // restart the animation when two wins come close together
  clearTimeout(bigTimer); bigTimer = setTimeout(() => { big.value = false }, 950)
})
</script>

<template>
  <span class="bee" :class="[state, { done, big }]" :style="{ height: height + 'px', width: height * 1.09 + 'px' }" aria-hidden="true">
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
    <span v-if="big" class="burst"><i v-for="n in 10" :key="n" :style="{ '--a': n * 36 + 'deg' }"></i></span>
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
/* big (the top bar, when work is ready to look at): the logo's own spin with a bounce, and ten dots of pollen flying out and fading */
/* it is the real yellow bee that spins, not the green listening square: the square steps aside at once and comes back after */
.big svg, .ok.done.big svg { opacity: 0; transition: none; animation: none; }
.big .real { opacity: 1; transition: none; animation: bee-spin .8s cubic-bezier(.3, 1.4, .5, 1); }
@keyframes bee-spin { 0% { transform: translate(-50%, -50%) rotate(0) scale(1); } 40% { transform: translate(-50%, -50%) rotate(240deg) scale(1.3); } 100% { transform: translate(-50%, -50%) rotate(360deg) scale(1); } }
.burst { position: absolute; left: 50%; top: 50%; width: 0; height: 0; pointer-events: none; }
.burst i { position: absolute; left: -2px; top: -2px; width: 4px; height: 4px; border-radius: 50%; background: #f2b01e; opacity: 0; animation: bee-burst .75s ease-out .1s forwards; }
.burst i:nth-child(even) { background: #2fae6b; width: 3px; height: 3px; }
@keyframes bee-burst { 0% { transform: rotate(var(--a)) translateY(0); opacity: 1; } 100% { transform: rotate(var(--a)) translateY(-18px) scale(.4); opacity: 0; } }
/* failed: one quick shake, then still */
.error svg { animation: bee-shake .5s ease-in-out; }
@keyframes bee-shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-12%); } 40% { transform: translateX(10%); } 60% { transform: translateX(-7%); } 80% { transform: translateX(4%); } }
@media (prefers-reduced-motion: reduce) { .busy .real, .ok svg, .ok.done svg, .error svg { animation: none; } .burst { display: none; } .big .real { animation: none; filter: drop-shadow(0 0 4px #f2b01e); } }
</style>

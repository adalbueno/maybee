<script setup>
// Maybee's face. Three bees are stacked and the state fades between them:
// grey = nobody listens (fainter when the app is offline), green = listening,
// yellow = working, blinking, then back to green when it is done.
import grey from '../assets/bee-grey.png'
import green from '../assets/bee-green.png'
import yellow from '../assets/bee-yellow.png'
defineProps({ state: { type: String, default: 'idle' }, height: { type: Number, default: 14 } })
</script>

<template>
  <span class="bee" :class="state" :style="{ height: height + 'px', width: height * 0.775 + 'px' }" aria-hidden="true">
    <img class="b-grey" :src="grey" alt="" /><img class="b-green" :src="green" alt="" /><img class="b-yellow" :src="yellow" alt="" />
  </span>
</template>

<style scoped>
.bee { position: relative; display: block; flex: none; }
.bee img { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; transition: opacity .3s ease; }
.idle .b-grey { opacity: .75; }
.off .b-grey { opacity: .35; }
.ok .b-green { opacity: 1; }
/* the yellow bee fades in, then blinks (its opacity alternates) until the work is over */
.busy .b-yellow { animation: bee-in .3s ease-out, bee-blink 1.7s ease-in-out .3s infinite backwards; }
@keyframes bee-in { from { opacity: 0; } to { opacity: .6; } }
@keyframes bee-blink { 0%, 100% { opacity: .6; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .busy .b-yellow { animation: none; opacity: 1; } }
</style>

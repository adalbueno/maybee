<script setup>
const props = defineProps({ data: Object })
const emit = defineEmits(['open'])

const SHORT = { members: 'members', days: 'd no join', visitors: 'visitors', conversion: '', video: 'best video', ads: 'ads' }
function value(n) {
  if (n.value == null) return '—'
  const v = typeof n.value === 'number' ? n.value.toLocaleString('en-GB') : n.value
  return n.unitFirst ? `${n.unit || ''}${v}` : `${v}${n.unit || ''}`
}
function delta(n) {
  if (n.delta == null || n.delta === 0) return null
  return (n.delta > 0 ? '+' : '−') + Math.abs(n.delta).toLocaleString('en-GB')
}
function tip(n) {
  const parts = [n.label]
  if (n.note) parts.push(n.note)
  parts.push(`as of ${props.data.date}` + (props.data.prevDate ? `, change vs ${props.data.prevDate}` : ''))
  return parts.join(' · ')
}
</script>

<template>
  <button class="nums" @click="emit('open', { path: data.path })" :title="'Numbers of ' + data.date + ' (click for charts)'">
    <span
      v-for="n in data.items"
      :key="n.key"
      class="n"
      :class="{ alert: n.alert, key: n.key === 'members' }"
      :title="tip(n)"
    >
      <i v-if="n.alert"></i>
      <b>{{ value(n) }}</b><span class="lbl"><template v-if="n.key === 'days'">d no join</template><template v-else-if="SHORT[n.key]">&nbsp;{{ SHORT[n.key] }}</template></span>
      <em v-if="delta(n)" :class="n.delta > 0 ? 'up' : 'down'">{{ delta(n) }}</em>
    </span>
  </button>
</template>

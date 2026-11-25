<script setup>
// A small icon for a kind of file (image, video, PDF, sheet…), in its own colour, for the chat's attachments.
defineProps({ kind: { type: String, default: 'file' } })
const COLORS = { image: '#2f9e6b', video: '#7a5af5', audio: '#d9480f', pdf: '#e03131', sheet: '#2b8a3e', slides: '#e8590c', doc: '#3b6fd8', archive: '#8d6e63', code: '#495057', file: '#868e96' }
</script>

<template>
  <svg class="fkind" viewBox="0 0 16 16" width="15" height="15" fill="none" :stroke="COLORS[kind] || COLORS.file" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="kind === 'image'"><rect x="2" y="2.5" width="12" height="11" rx="2" /><circle cx="6" cy="6.3" r="1.2" /><path d="M2.5 12l3.8-3.6 2.7 2.4 2-1.8 2.6 2.4" /></template>
    <template v-else-if="kind === 'video'"><rect x="1.8" y="3" width="12.4" height="10" rx="2" /><path d="M6.6 6v4l3.4-2z" :fill="COLORS.video" /></template>
    <template v-else-if="kind === 'audio'"><path d="M6 12V3.5l7-1.5v8.5" /><circle cx="4.3" cy="12" r="1.7" /><circle cx="11.3" cy="10.5" r="1.7" /></template>
    <template v-else-if="kind === 'sheet'"><rect x="2" y="2.5" width="12" height="11" rx="1.6" /><path d="M2 6.2h12M2 9.8h12M6.5 2.5v11" /></template>
    <template v-else-if="kind === 'slides'"><rect x="1.8" y="2.5" width="12.4" height="8.5" rx="1.4" /><path d="M8 11v2.5M5.5 13.5h5" /></template>
    <template v-else-if="kind === 'archive'"><rect x="2.5" y="2" width="11" height="12" rx="1.8" /><path d="M8 2v2M8 5.2v1.3M8 7.8v1.3" /><rect x="6.6" y="9.6" width="2.8" height="2.4" rx=".6" /></template>
    <template v-else-if="kind === 'code'"><path d="M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5" /></template>
    <template v-else>
      <path d="M4 1.8h5.2L12.5 5v9.2H4z" /><path d="M9 1.8V5.2h3.4" />
      <path v-if="kind === 'doc'" d="M6 8h4.5M6 10.5h4.5" />
      <text v-else-if="kind === 'pdf'" x="8.2" y="11.8" text-anchor="middle" font-size="4.4" font-weight="800" :fill="COLORS.pdf" stroke="none" font-family="sans-serif">PDF</text>
    </template>
  </svg>
</template>

<style scoped>
.fkind { flex: none; display: block; }
</style>

<script setup>
// D264: the note editor. CodeMirror 6 with live preview: the document IS the markdown text, so saving
// writes back exactly what was typed (no reformatting). Markup (**, #, [](), >) is hidden except on the
// line the cursor is on, like Obsidian's Live Preview. [[links]] and ![[embeds]] are styled, never touched.
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, Decoration, ViewPlugin, MatchDecorator, drawSelection } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { syntaxTree, HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

const props = defineProps({ modelValue: String })
const emit = defineEmits(['update:modelValue', 'save', 'cancel'])
const host = ref(null)
let view = null

const style = HighlightStyle.define([
  // titles carry the app's yellow underline
  { tag: t.heading1, fontSize: '1.7em', fontWeight: '700', letterSpacing: '-.02em', textDecoration: 'underline', textDecorationColor: 'var(--accent)', textDecorationThickness: '3px', textUnderlineOffset: '5px' },
  { tag: t.heading2, fontSize: '1.35em', fontWeight: '700', letterSpacing: '-.01em', textDecoration: 'underline', textDecorationColor: 'var(--accent)', textDecorationThickness: '3px', textUnderlineOffset: '4px' },
  { tag: t.heading3, fontSize: '1.15em', fontWeight: '700', textDecoration: 'underline', textDecorationColor: 'var(--accent)', textDecorationThickness: '2px', textUnderlineOffset: '4px' },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: '700' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, textDecoration: 'underline', textUnderlineOffset: '3px' },
  { tag: t.url, color: 'var(--ink-3)' },
  { tag: t.monospace, fontFamily: 'ui-monospace, monospace', fontSize: '.92em' },
  { tag: t.processingInstruction, color: 'var(--ink-3)' },
  { tag: t.contentSeparator, color: 'var(--ink-3)' },
])

const HIDE = new Set(['HeaderMark', 'EmphasisMark', 'CodeMark', 'LinkMark', 'URL', 'LinkTitle', 'QuoteMark', 'StrikethroughMark'])
const hide = Decoration.replace({})
const lineCls = c => Decoration.line({ class: c })

// is any cursor/selection on the lines between from and to?
function touched(state, from, to) {
  const a = state.doc.lineAt(from).from, b = state.doc.lineAt(to).to
  return state.selection.ranges.some(r => r.from <= b && r.to >= a)
}

function build(view) {
  const { state } = view
  const decos = []
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from, to,
      enter(node) {
        const n = node.name
        if (n === 'Blockquote' || n === 'FencedCode') {
          const cls = n === 'Blockquote' ? 'cm-bq' : 'cm-fence'
          for (let pos = node.from; pos <= node.to;) {
            const line = state.doc.lineAt(pos)
            decos.push(lineCls(cls).range(line.from))
            pos = line.to + 1
          }
          if (n === 'FencedCode') return false // keep the fences and code as typed
        }
        if (!HIDE.has(n)) return
        const parent = node.node.parent
        if (!parent) return
        // a link or a mark whose line has the cursor stays visible, so it can be edited
        if (touched(state, parent.from, parent.to)) return
        // only hide the URL of a real link [text](url), not bare URLs
        if ((n === 'URL' || n === 'LinkTitle') && parent.name !== 'Link' && parent.name !== 'Image') return
        if (parent.name === 'Image') return // images keep their markup
        let end = node.to
        // "# " and "> ": hide the space after the mark too
        if ((n === 'HeaderMark' || n === 'QuoteMark') && state.doc.sliceString(end, end + 1) === ' ') end++
        if (end > node.from) decos.push(hide.range(node.from, end))
      },
    })
  }
  return Decoration.set(decos, true)
}

const livePreview = ViewPlugin.fromClass(class {
  constructor(v) { this.decorations = build(v) }
  update(u) { if (u.docChanged || u.selectionSet || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) this.decorations = build(u.view) }
}, { decorations: v => v.decorations })

// [[links]] and ![[embeds]] (Obsidian syntax): styled as links, text untouched
const wikiMatcher = new MatchDecorator({ regexp: /!?\[\[[^\]\n]+\]\]/g, decoration: m => Decoration.mark({ class: m[0].startsWith('!') ? 'cm-wiki cm-embed' : 'cm-wiki' }) })
const wikiLinks = ViewPlugin.fromClass(class {
  constructor(v) { this.decorations = wikiMatcher.createDeco(v) }
  update(u) { this.decorations = wikiMatcher.updateDeco(u, this.decorations) }
}, { decorations: v => v.decorations })

onMounted(() => {
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: props.modelValue || '',
      extensions: [
        history(), drawSelection(), EditorView.lineWrapping,
        markdown({ base: markdownLanguage }),
        syntaxHighlighting(style), livePreview, wikiLinks,
        EditorView.contentAttributes.of({ spellcheck: 'true' }),
        keymap.of([
          { key: 'Mod-s', preventDefault: true, run: () => { emit('save'); return true } },
          indentWithTab, ...defaultKeymap, ...historyKeymap,
        ]),
        EditorView.updateListener.of(u => { if (u.docChanged) emit('update:modelValue', u.state.doc.toString()) }),
      ],
    }),
  })
  view.focus()
})
// if the parent replaces the text (e.g. reloaded from disk), follow it
watch(() => props.modelValue, v => {
  if (view && v !== view.state.doc.toString()) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v || '' } })
})
onBeforeUnmount(() => { if (view) view.destroy() })
</script>

<template>
  <div ref="host" class="live-editor prose"></div>
</template>

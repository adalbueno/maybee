<script setup>
// D264: the note editor. CodeMirror 6 with live preview: the document IS the markdown text, so saving
// writes back exactly what was typed (no reformatting). Markup (**, #, [](), >) is hidden except on the
// line the cursor is on, like Obsidian's Live Preview. [[links]] and ![[embeds]] are styled, never touched.
// The note opens for reading: a click on a link follows it, and a double click turns editing on (Esc or leaving
// the note turns it off). Only the border changes between the two. Ctrl/Cmd+click follows a link while editing.
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { EditorState, Compartment, Facet, StateField } from '@codemirror/state'
import { EditorView, keymap, Decoration, ViewPlugin, MatchDecorator, WidgetType, drawSelection } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { syntaxTree, HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

const props = defineProps({ modelValue: String, path: String })
const emit = defineEmits(['update:modelValue', 'save', 'cancel', 'open-link'])
const editing = ref(false)
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

// Whether the note is being edited. While it is only read, no line is "touched": all markup stays hidden.
const editingFacet = Facet.define({ combine: v => v[0] })
const editingSlot = new Compartment()
const editableSlot = new Compartment()

// is any cursor/selection on the lines between from and to?
function touched(state, from, to) {
  if (!state.facet(editingFacet)) return false
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
  update(u) { if (u.docChanged || u.selectionSet || u.viewportChanged || u.startState.facet(editingFacet) !== u.state.facet(editingFacet) || syntaxTree(u.startState) !== syntaxTree(u.state)) this.decorations = build(u.view) }
}, { decorations: v => v.decorations })

// Tables: a Markdown table is drawn as a table, like in the read view. The text is shown only while the cursor is inside it.
function inlineNodes(text) {
  const out = []
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|(?<![\w*])[*_]([^*_]+)[*_](?![\w*])|\[([^\]]+)\]\(([^)\s]+)\)/g
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(document.createTextNode(text.slice(last, m.index)))
    let el
    if (m[1] != null) { el = document.createElement('code'); el.textContent = m[1] }
    else if (m[2] != null) { el = document.createElement('strong'); el.textContent = m[2] }
    else if (m[3] != null) { el = document.createElement('em'); el.textContent = m[3] }
    else { el = document.createElement('a'); el.textContent = m[4]; el.href = '#'; el.dataset.href = m[5] }
    out.push(el)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(document.createTextNode(text.slice(last)))
  return out
}
const splitRow = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'))
const alignOf = c => (/^:-+:$/.test(c) ? 'center' : /-:$/.test(c) ? 'right' : /^:-/.test(c) ? 'left' : '')
const ALIGN_MARK = { center: ':---:', right: '---:', left: ':---', '': '---' }

// The rows of a table as text: rows[0] is the header, the delimiter row (--- | ---) is kept as alignments.
function parseTable(text) {
  const lines = text.split('\n').filter(l => l.trim())
  return { rows: lines.filter((_, i) => i !== 1).map(splitRow), aligns: lines.length > 1 ? splitRow(lines[1]).map(alignOf) : [] }
}
function toMarkdown(rows, aligns) {
  const cols = Math.max(1, ...rows.map(r => r.length))
  const fmt = r => '| ' + Array.from({ length: cols }, (_, i) => String(r[i] ?? '').replace(/\|/g, '\\|')).join(' | ') + ' |'
  const delim = '| ' + Array.from({ length: cols }, (_, i) => ALIGN_MARK[aligns[i] || '']).join(' | ') + ' |'
  return [fmt(rows[0] || []), delim, ...rows.slice(1).map(fmt)].join('\n')
}
const readRows = wrap => [...wrap.querySelectorAll('tr')].map(tr => [...tr.children].map(c => c.textContent.replace(/\s*\n\s*/g, ' ').trim()))
function focusCell(cell) {
  if (!cell) return
  cell.focus()
  const range = document.createRange()
  range.selectNodeContents(cell); range.collapse(false)
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range)
}

// A change that adds a row or a column: the table is drawn again and the cursor goes to (row, col).
function restructure(wrap, view, rows, row, col) {
  const text = toMarkdown(rows, wrap._aligns)
  const from = view.posAtDOM(wrap)
  const to = from + wrap._text.length
  wrap._text = null // not the text the drawing shows: updateDOM draws it again
  view.dispatch({ changes: { from, to, insert: text }, userEvent: 'input.table' })
  focusCell(wrap.querySelectorAll('tr')[row]?.children[col])
}
// Typing in a cell: write the table back. The drawing already shows what was typed, so it stays and the caret keeps its place.
function syncTable(wrap, view) {
  const text = toMarkdown(readRows(wrap), wrap._aligns)
  if (text === wrap._text) return
  const from = view.posAtDOM(wrap)
  const to = from + wrap._text.length
  wrap._text = text
  view.dispatch({ changes: { from, to, insert: text }, userEvent: 'input.table' })
}

function drawTable(wrap, view, text, editable) {
  const { rows, aligns } = parseTable(text)
  wrap.replaceChildren()
  wrap._text = text; wrap._editable = editable; wrap._aligns = aligns
  const table = document.createElement('table')
  table.className = 'cm-table'
  const head = document.createElement('thead'), body = document.createElement('tbody')
  rows.forEach((cells, r) => {
    const tr = document.createElement('tr')
    cells.forEach((cell, i) => {
      const td = document.createElement(r === 0 ? 'th' : 'td')
      if (aligns[i]) td.style.textAlign = aligns[i]
      // while editing a cell holds its Markdown as typed; while reading it is drawn
      if (editable) { td.contentEditable = 'true'; td.textContent = cell } else inlineNodes(cell).forEach(n => td.appendChild(n))
      tr.appendChild(td)
    })
    ;(r === 0 ? head : body).appendChild(tr)
  })
  table.append(head, body)
  wrap.appendChild(table)
  if (!editable) return
  const cols = () => wrap.querySelectorAll('tr')[0].children.length
  const go = (r, c) => {
    const trs = [...wrap.querySelectorAll('tr')]
    if (r < 0 || c < 0) return
    if (r >= trs.length) { const all = readRows(wrap); all.push(Array(cols()).fill('')); restructure(wrap, view, all, all.length - 1, c); return }
    focusCell(trs[r].children[c])
  }
  const where = el => { const cell = el.closest('td,th'); const tr = cell && cell.parentElement; return cell ? { r: [...wrap.querySelectorAll('tr')].indexOf(tr), c: [...tr.children].indexOf(cell) } : null }
  table.addEventListener('input', () => syncTable(wrap, view))
  table.addEventListener('paste', e => { e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData.getData('text/plain') || '').replace(/\s*\n\s*/g, ' ')) })
  table.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEditing(false); return }
    const at = where(e.target)
    if (!at) return
    if (e.key === 'Enter') { e.preventDefault(); go(at.r + 1, at.c) }
    else if (e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) { if (at.c > 0) go(at.r, at.c - 1); else if (at.r > 0) go(at.r - 1, cols() - 1) }
      else if (at.c + 1 < cols()) go(at.r, at.c + 1)
      else go(at.r + 1, 0)
    }
  })
  const tools = document.createElement('div')
  tools.className = 'cm-table-tools'
  const button = (label, run) => {
    const b = document.createElement('button')
    b.type = 'button'; b.textContent = label
    b.addEventListener('mousedown', e => e.preventDefault()) // the cell keeps the focus
    b.addEventListener('click', run)
    tools.appendChild(b)
  }
  button('+ Row', () => { const all = readRows(wrap); all.push(Array(cols()).fill('')); restructure(wrap, view, all, all.length - 1, 0) })
  button('+ Column', () => { const all = readRows(wrap).map(r => [...r, '']); wrap._aligns = [...wrap._aligns, '']; restructure(wrap, view, all, 0, all[0].length - 1) })
  // the Markdown text of the table, to change what the cells cannot (remove a row or a column, set an alignment)
  button('Edit as text', () => { view.dispatch({ selection: { anchor: view.posAtDOM(wrap) } }); view.focus() })
  wrap.appendChild(tools)
  // Leaving the table ends editing. A drawing that is replaced takes the focused cell with it, which also looks like leaving,
  // and an editor update must not be started from inside another: so look after the update, and at where the focus really is.
  if (!wrap._wired) {
    wrap._wired = true
    wrap.addEventListener('focusout', () => setTimeout(() => {
      if (!wrap.isConnected || !wrap._editable || !document.hasFocus()) return
      const active = document.activeElement
      if (active && (wrap.contains(active) || view.dom.contains(active))) return
      setEditing(false)
    }, 0))
  }
}

class TableWidget extends WidgetType {
  constructor(text, cells) { super(); this.text = text; this.cells = cells } // cells: whether the cells can be typed in
  eq(other) { return other.text === this.text && other.cells === this.cells }
  toDOM(view) {
    const wrap = document.createElement('div')
    wrap.className = 'cm-table-wrap'
    drawTable(wrap, view, this.text, this.cells)
    return wrap
  }
  updateDOM(dom, view) {
    if (dom._editable !== this.cells) return false
    if (dom._text !== this.text) drawTable(dom, view, this.text, this.cells)
    return true
  }
  // while the cells are editable they handle their own events
  ignoreEvent() { return this.cells }
}
function buildTables(state) {
  const decos = []
  const editingNow = state.facet(editingFacet)
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'Table') return
      // the text of the table shows only when the cursor is in it ("Edit as text")
      const inside = editingNow && state.selection.ranges.some(r => r.from <= node.to && r.to >= node.from)
      if (!inside) decos.push(Decoration.replace({ widget: new TableWidget(state.doc.sliceString(node.from, node.to), editingNow), block: true }).range(node.from, node.to))
      return false
    },
  })
  return Decoration.set(decos, true)
}
const tables = StateField.define({
  create: buildTables,
  update(deco, tr) {
    if (tr.docChanged || tr.selection || tr.startState.facet(editingFacet) !== tr.state.facet(editingFacet) || syntaxTree(tr.startState) !== syntaxTree(tr.state)) return buildTables(tr.state)
    return deco
  },
  provide: field => EditorView.decorations.from(field),
})

// [[links]] and ![[embeds]] (Obsidian syntax): styled as links, text untouched
const wikiMatcher = new MatchDecorator({ regexp: /!?\[\[[^\]\n]+\]\]/g, decoration: m => Decoration.mark({ class: m[0].startsWith('!') ? 'cm-wiki cm-embed' : 'cm-wiki' }) })
const wikiLinks = ViewPlugin.fromClass(class {
  constructor(v) { this.decorations = wikiMatcher.createDeco(v) }
  update(u) { this.decorations = wikiMatcher.updateDeco(u, this.decorations) }
}, { decorations: v => v.decorations })

// The link under a position: a [text](url), a bare URL or a [[wiki link]]. Returns the target text, or null.
function linkAt(state, pos) {
  for (let node = syntaxTree(state).resolveInner(pos, 0); node; node = node.parent) {
    if (node.name === 'Image') return null
    if (node.name === 'Link') { const url = node.getChild('URL'); return url ? state.doc.sliceString(url.from, url.to) : null }
    if (node.name === 'URL') return state.doc.sliceString(node.from, node.to)
  }
  const line = state.doc.lineAt(pos)
  for (const m of line.text.matchAll(/!?\[\[([^\]\n]+)\]\]/g)) {
    const from = line.from + m.index
    if (pos >= from && pos <= from + m[0].length && !m[0].startsWith('!')) return m[1].split('|')[0].split('#')[0].trim()
  }
  return null
}
function follow(target) {
  const t = target.trim().replace(/^<|>$/g, '')
  if (!t || t.startsWith('#')) return
  if (/^https?:\/\//i.test(t)) { window.open(t, '_blank', 'noopener'); return }
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return
  fetch('/api/resolve?name=' + encodeURIComponent(t) + '&from=' + encodeURIComponent(props.path || ''))
    .then(r => r.json()).then(r => { if (r && r.path) emit('open-link', r.path) }).catch(() => {})
}

let dirtyOnEnter = ''
function setEditing(on, pos = null) {
  if (!view || editing.value === on) return
  editing.value = on
  view.dispatch({ effects: [editingSlot.reconfigure(editingFacet.of(on)), editableSlot.reconfigure(EditorView.editable.of(on))] })
  if (on) {
    dirtyOnEnter = view.state.doc.toString()
    if (pos != null) view.dispatch({ selection: { anchor: pos } })
    view.focus()
  } else if (view.state.doc.toString() !== dirtyOnEnter) emit('save')
}

onMounted(() => {
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: props.modelValue || '',
      extensions: [
        editingSlot.of(editingFacet.of(false)), editableSlot.of(EditorView.editable.of(false)),
        EditorView.domEventHandlers({
          mousedown(e, v) {
            const cell = e.target.closest && e.target.closest('a[data-href]')
            if (e.button === 0 && cell && (!editing.value || e.ctrlKey || e.metaKey)) { e.preventDefault(); follow(cell.dataset.href); return true }
            if (e.button !== 0 || (editing.value && !(e.ctrlKey || e.metaKey))) return false
            const pos = v.posAtCoords({ x: e.clientX, y: e.clientY })
            const target = pos == null ? null : linkAt(v.state, pos)
            if (!target) return false
            e.preventDefault()
            follow(target)
            return true
          },
          dblclick(e, v) {
            if (editing.value) return false
            // a double click on a drawn table turns the cells editable and puts the cursor in the one clicked
            const drawn = e.target.closest && e.target.closest('.cm-table')
            setEditing(true, drawn ? null : v.posAtCoords({ x: e.clientX, y: e.clientY }))
            if (drawn) requestAnimationFrame(() => { const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest('td,th'); if (cell && cell.isContentEditable) focusCell(cell) })
            return true
          },
          keydown(e) {
            if (e.key === 'Escape' && editing.value) { e.stopPropagation(); setEditing(false); return true }
            return false
          },
          mousemove(e, v) {
            // a hand over a link that a click will follow
            const pos = v.posAtCoords({ x: e.clientX, y: e.clientY })
            const over = pos != null && linkAt(v.state, pos) && (!editing.value || e.ctrlKey || e.metaKey)
            v.contentDOM.style.cursor = over ? 'pointer' : ''
            return false
          },
          blur(e, v) { if (e.relatedTarget && v.dom.contains(e.relatedTarget)) return false; if (document.hasFocus()) setEditing(false); return false },
        }),
        history(), drawSelection(), EditorView.lineWrapping,
        markdown({ base: markdownLanguage }),
        syntaxHighlighting(style), livePreview, tables, wikiLinks,
        EditorView.contentAttributes.of({ spellcheck: 'true' }),
        keymap.of([
          { key: 'Mod-s', preventDefault: true, run: () => { emit('save'); return true } },
          indentWithTab, ...defaultKeymap, ...historyKeymap,
        ]),
        EditorView.updateListener.of(u => { if (u.docChanged) emit('update:modelValue', u.state.doc.toString()) }),
      ],
    }),
  })
  // an empty note (a new one) opens for typing
  if (!(props.modelValue || '').trim()) setEditing(true)
})
// if the parent replaces the text (e.g. reloaded from disk), follow it
watch(() => props.modelValue, v => {
  if (view && v !== view.state.doc.toString()) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v || '' } })
})
onBeforeUnmount(() => { if (view) view.destroy() })
</script>

<template>
  <div ref="host" class="live-editor prose" :class="{ 'is-editing': editing }" :title="editing ? '' : 'Double-click to edit'"></div>
</template>

// Turns a changelog line about a note into a short sentence for people ("You moved it to Now").
const TYPE = { idea: 'an idea', task: 'a task', routine: 'a routine' }
const STAGE = { maybe: 'Maybe', next: 'Next', now: 'Now', done: 'Done', not: 'Not doing' }
const OWNER = { agent: 'Claude', owner: 'you', Adal: 'you', both: 'both of you' }
function runs(mode, every) {
  const n = Number(every) || 1
  if (mode === 'off' || mode === 'false') return 'only when you press Run'
  if (mode === 'session') return 'at the start of every session'
  const unit = { hours: 'hour', days: 'day', weeks: 'week', months: 'month' }[mode]
  return unit ? (n === 1 ? 'every ' + unit : `every ${n} ${unit}s`) : mode
}
export function humanize(raw) {
  let text = String(raw || '').trim()
  let who = 'Claude'
  const app = /^\(Adal, Maybee app\)\s*/.exec(text)
  if (app) { who = 'You'; text = text.slice(app[0].length) }
  text = text.replace(/^\d{4}-\d{2}-\d{2}\s*·\s*/, '').replace(/^Claude Code\s*·\s*/, '')
  if (!app) {
    // agent lines: "files: what changed" → keep what changed, drop file names and decision codes in brackets
    const i = text.indexOf(': ')
    if (i > 0 && i < 160 && /[./]/.test(text.slice(0, i))) text = text.slice(i + 2)
    return { who, text: text.replace(/\s*\((?:D\d+[^)]*)\)/g, '').replace(/\s*\([^)]*\.md\)/g, ''), details: [] }
  }
  if (/^Routines reordered/.test(text)) return { who, text: 'reordered the routines', details: [] }
  text = text.replace(/\s*\([^)]*\.md\)\s*$/, '')
  const colon = text.indexOf(': ')
  const body = colon >= 0 ? text.slice(colon + 2) : text
  const f = {}
  for (const part of body.split(/,\s*/)) {
    const m = /^(\w+)\s+(.*?)\s*→\s*(.*)$/.exec(part)
    if (m) f[m[1]] = { from: m[2], to: m[3] }
  }
  // what changed, field by field, in people's words (shown under the sentence in the Changes tab)
  const LABEL = { type: 'Type', stage: 'Stage', auto: 'Runs', not_today: 'Today', last_done: 'Last done', owner: 'Who', needed_by: 'Needed by', next_step: 'Next step', importance: 'Tier', value_members: 'Members', value_money: 'Money', want: 'Want', hard: 'Hard', priority: 'Order' }
  const show = (k, v) => {
    v = String(v || '').replace(/^"|"$/g, '')
    if (!v || v === '—' || v === 'null') return '—'
    if (k === 'type') return v[0].toUpperCase() + v.slice(1)
    if (k === 'stage') return STAGE[v] || v
    if (k === 'auto') return runs(v, f.auto_every && f.auto_every.to).replace(/^./, c => c.toUpperCase())
    if (k === 'owner') return (OWNER[v] || v).replace(/^you$/, 'Adal').replace(/^both of you$/, 'Both')
    return v
  }
  const details = Object.keys(LABEL).filter(k => f[k]).map(k => ({ label: LABEL[k], from: show(k, f[k].from), to: show(k, f[k].to) }))
  const out = []
  if (f.type) out.push(`changed it from ${TYPE[f.type.from] || f.type.from} to ${TYPE[f.type.to] || f.type.to}`)
  if (f.stage) out.push(f.stage.to === 'not' ? 'set it aside' : `moved it to ${STAGE[f.stage.to] || f.stage.to}`)
  if (f.auto) out.push(`set it to run ${runs(f.auto.to, f.auto_every && f.auto_every.to)}`)
  else if (f.auto_run) out.push(f.auto_run.to === 'true' ? 'set it to run by itself' : 'set it to run only when you press Run')
  if (f.not_today) out.push(f.not_today.to === 'no' ? 'brought it back for today' : 'skipped it for today')
  if (f.last_done) out.push('marked it done')
  if (f.owner) out.push(`gave it to ${OWNER[f.owner.to] || f.owner.to}`)
  if (f.needed_by) out.push(`set "needed by" to ${f.needed_by.to.replace(/^"|"$/g, '')}`)
  if (f.next_step) out.push('updated the next step')
  if (f.importance) out.push(`set the tier to ${f.importance.to}`)
  if (f.value_members || f.value_money || f.want || f.hard) out.push('rated it')
  if (f.priority) out.push('changed its place in the order')
  if (!out.length) out.push(body.replace(/^kept as a routine.*/, 'kept it as a routine'))
  // a save that changed nothing (same value before and after) is marked so the viewer can hide it
  const real = details.filter(d => d.from !== d.to)
  const noop = details.length > 0 && real.length === 0 && !f.last_done && !f.not_today
  return { who, text: out.join(' and '), details: real, noop }
}
export function when(date) {
  const today = new Date().toLocaleDateString('sv-SE')
  const y = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE')
  if (date === today) return 'today'
  if (date === y) return 'yesterday'
  return new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

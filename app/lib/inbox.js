// Requests from the app to a Claude Code session (the "Ask Claude" buttons).
import fs from 'node:fs'
import path from 'node:path'
import { dataPath } from './paths.js'
import { ABOUT_SCOPE, BRAIN_SCOPE, BRAIN_RULES, INBOX_SCOPE, INBOX_RULES } from './prompt.js'
export { ABOUT_SCOPE, BRAIN_SCOPE, BRAIN_RULES, INBOX_SCOPE, INBOX_RULES }

let file = '', beat = ''
export function initInbox(appDir) {
  file = dataPath('inbox.json')
  beat = dataPath('listening')
}
export function readInbox() { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return [] } }
function writeInbox(list) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(list.slice(-200), null, 1)) }

// A session is listening when listen.js touched the heartbeat in the last 20 seconds.
export function listening() { try { return Date.now() - fs.statSync(beat).mtimeMs < 20000 } catch { return false } }

// When a session last listened (ms since epoch), or null if none ever did.
export function lastHeard() { try { return fs.statSync(beat).mtimeMs } catch { return null } }

export function addRequest({ action, text, path: p, title, workspace, about, files }) {
  const list = readInbox()
  const req = { id: Date.now().toString(36), at: new Date().toISOString(), action: String(action || 'ask').slice(0, 60), text: String(text || '').slice(0, 2000), path: p || null, title: title || null, workspace: workspace || null, status: 'pending', reply: null }
  // the note open beside a page's chat (the Inbox), so the agent knows what "this" is
  if (about && typeof about === 'string') req.about = about.slice(0, 300)
  // files the owner attached in the chat (saved in attachments/ first), as paths inside the workspace
  const att = Array.isArray(files) ? files.filter(f => typeof f === 'string' && f && !f.includes('..')).map(f => f.slice(0, 300)).slice(0, 10) : []
  if (att.length) req.files = att
  list.push(req)
  writeInbox(list)
  return req
}
const attached = req => req.files && req.files.length ? ` (the owner attached: ${req.files.join(', ')}; read them first)` : ''
export function promptFor(req) {
  return promptText(req) + attached(req)
}
function promptText(req) {
  if (req.path === ABOUT_SCOPE) return `[From the Maybee app, Brain page] ${req.text} (${BRAIN_RULES})` // the About page is gone; an old request from it is handled like the Brain's
  if (req.path === BRAIN_SCOPE) return `[From the Maybee app, Brain page] ${req.text} (${BRAIN_RULES})`
  if (req.path === INBOX_SCOPE) return `[From the Maybee app, Inbox] ${req.text}${req.about ? ` (open beside the Inbox: ${req.about})` : ''} (${INBOX_RULES})`
  const about = req.path ? ` (about ${req.title ? '"' + req.title + '" — ' : ''}${req.path})` : ''
  return `[From the Maybee app] ${req.action}${about}${req.text ? ': ' + req.text : ''}`
}

// Requests from the app to a Claude Code session (the "Ask Claude" buttons).
import fs from 'node:fs'
import path from 'node:path'

let file = '', beat = ''
export function initInbox(appDir) {
  file = path.join(appDir, 'data', 'inbox.json')
  beat = path.join(appDir, 'data', 'listening')
}
export function readInbox() { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return [] } }
function writeInbox(list) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(list.slice(-200), null, 1)) }

// A session is listening when listen.js touched the heartbeat in the last 20 seconds.
export function listening() { try { return Date.now() - fs.statSync(beat).mtimeMs < 20000 } catch { return false } }

export function addRequest({ action, text, path: p, title }) {
  const list = readInbox()
  const req = { id: Date.now().toString(36), at: new Date().toISOString(), action: String(action || 'ask').slice(0, 60), text: String(text || '').slice(0, 2000), path: p || null, title: title || null, status: 'pending', reply: null }
  list.push(req)
  writeInbox(list)
  return req
}
export function promptFor(req) {
  const about = req.path ? ` (about ${req.title ? '"' + req.title + '" — ' : ''}${req.path})` : ''
  return `[From the Maybee app] ${req.action}${about}${req.text ? ': ' + req.text : ''}`
}

// Requests from the app to a Claude Code session (the "Ask Claude" buttons).
import fs from 'node:fs'
import path from 'node:path'
import { dataPath } from './paths.js'

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

export function addRequest({ action, text, path: p, title, workspace }) {
  const list = readInbox()
  const req = { id: Date.now().toString(36), at: new Date().toISOString(), action: String(action || 'ask').slice(0, 60), text: String(text || '').slice(0, 2000), path: p || null, title: title || null, workspace: workspace || null, status: 'pending', reply: null }
  list.push(req)
  writeInbox(list)
  return req
}
// The About chat is not about one file: it asks to change the project's foundations by words.
export const ABOUT_SCOPE = '@about'
export const ABOUT_RULES = 'This is a request to change the project, from the About page. Find the right file among PROJECT.md, STATE.md, knowledge/audience, knowledge/offer, knowledge/brand (voice included), the other notes in knowledge/ and decisions/ (read them first), make the change straight away, keep the file\'s language and format, and add a line to logs/CHANGELOG.md. A change to a decision is a new dated file in decisions/, not an overwrite. If it is not clear which file, or the request is about the app\'s own settings, ask in the reply instead of guessing. Anything that goes outside the project waits for the owner\'s OK. In the reply say which file changed and what the new line says, and end the reply.js call with --changed followed by every file you changed, as paths inside the workspace, for example: --changed knowledge/brand/voice.md PROJECT.md (the About page marks those files as updated).'
export function promptFor(req) {
  if (req.path === ABOUT_SCOPE) return `[From the Maybee app, About page] ${req.text} (${ABOUT_RULES})`
  const about = req.path ? ` (about ${req.title ? '"' + req.title + '" — ' : ''}${req.path})` : ''
  return `[From the Maybee app] ${req.action}${about}${req.text ? ': ' + req.text : ''}`
}

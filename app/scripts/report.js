// Prepares a bug report for Maybee as a GitHub issue link, already filled in. Nothing is sent: the owner opens the link,
// reads the report, and only then submits it on GitHub themselves.
//   node report.js "<short title>" "<what happened, what you tried>"
// Prints the report (to show the owner first) and the link. Personal data is removed from it: the home folder, the user
// name, emails, session ids and anything that looks like a token.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { dataPath } from '../lib/paths.js'

const REPO = 'https://github.com/adalbueno/maybee/issues/new'
const MAX_URL = 7500 // browsers and GitHub cut longer links

const [title, what] = process.argv.slice(2)
if (!title || !what) { console.error('usage: node report.js "<short title>" "<what happened, what you tried>"'); process.exit(1) }

const here = path.dirname(fileURLToPath(import.meta.url))
const readJSON = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }
// the installed package keeps manifest.json two folders up; the source repository keeps it in release/
const manifest = readJSON(path.join(here, '..', '..', 'manifest.json')) || readJSON(path.join(here, '..', '..', 'release', 'manifest.json')) || {}
const bridge = readJSON(dataPath('bridge.json')) || {}
const pid = readJSON(dataPath('listener.pid'))
let beat = 0
try { beat = Number(fs.readFileSync(dataPath('listening'), 'utf8')) } catch {}
const listening = Date.now() - beat < 10000
let log = ''
try { log = fs.readFileSync(dataPath('listener.log'), 'utf8').trim().split('\n').slice(-25).join('\n') } catch {}

const user = os.userInfo().username
const scrub = text => String(text || '')
  .split(os.homedir()).join('~')
  .replace(new RegExp(user.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '<user>')
  .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
  .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>')
  .replace(/\b(sk|ghp|gho|xox[abp])[-_][\w-]{10,}/g, '<token>')
  .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '<long-value>')

const env = [
  `- Maybee: ${manifest.version || 'unknown'}`,
  `- System: ${os.platform()} ${os.release()} (${os.arch()})`,
  `- Node: ${process.version}`,
  `- Agent: ${bridge.agent || 'unknown'}`,
  `- Listener: ${pid ? `${pid.mode} mode, ` : ''}${listening ? 'heartbeat fresh' : 'no fresh heartbeat'}`,
].join('\n')

function body(logLines) {
  return [
    '## What happened', scrub(what), '',
    '## Environment', env, '',
    ...(logLines ? ['## Listener log (last lines)', '```', scrub(logLines), '```', ''] : []),
    '_Prepared by the Maybee skill. Personal data was removed before this was shown to the owner._',
  ].join('\n')
}

// shorten the log until the link fits
let lines = log.split('\n'), text = body(log), url
for (;;) {
  url = `${REPO}?${new URLSearchParams({ title: scrub(title), body: text, labels: 'from-skill' })}`
  if (url.length <= MAX_URL || !lines.length) break
  lines = lines.slice(Math.ceil(lines.length / 4))
  text = body(lines.join('\n'))
}

console.log('REPORT (show this to the owner before they open the link):\n')
console.log(`Title: ${scrub(title)}\n`)
console.log(text)
console.log('\nLINK (the owner opens it, reads it on GitHub and submits it there; nothing is sent until then):')
console.log(url)

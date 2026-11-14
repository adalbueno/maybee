#!/usr/bin/env node
// Lets an agent use Maybee's own browser for a task, in a new window.
//   node browser.js run <script.mjs> [args...]   runs the script with MAYBEE_BROWSER (the browser's control address)
//                                                and MAYBEE_BROWSER_LIB (see browser-lib.js) set
//   node browser.js window [url]                 opens a new window on url and leaves it open for the user
// Works only while Maybee is unlocked (the membership check passed): the app answers 403 until then.
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DATA_DIR } from '../lib/paths.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const fail = msg => { console.error(msg); process.exit(1) }

// The same discovery the session hook uses: the active workspace's server.json, checked against the live app.
async function instanceUrl() {
  if (process.env.MAYBEE_URL) return process.env.MAYBEE_URL
  const base = path.dirname(path.dirname(DATA_DIR))
  let root = base
  try {
    const name = JSON.parse(fs.readFileSync(path.join(base, '.maybee', 'active-workspace.json'), 'utf8')).name
    if (name && fs.existsSync(path.join(base, 'workspaces', name))) root = path.join(base, 'workspaces', name)
  } catch {}
  try {
    const info = JSON.parse(fs.readFileSync(path.join(root, '.maybee', 'server.json'), 'utf8'))
    const url = `http://127.0.0.1:${info.port}`
    const live = await (await fetch(url + '/api/instance', { signal: AbortSignal.timeout(1500) })).json()
    if (live.workspace === info.workspace && live.pid === info.pid) return url
  } catch {}
  return null
}

async function browserEndpoint() {
  const url = await instanceUrl()
  if (!url) fail('Maybee is not running. Start it first.')
  const res = await fetch(url + '/api/browser', { signal: AbortSignal.timeout(60000) }).catch(() => null)
  if (!res) fail('Maybee did not answer.')
  if (res.status === 403) fail('Maybee is locked: the How I membership check has not passed yet, so its browser is not available.')
  const out = await res.json().catch(() => ({}))
  if (!res.ok || !out.endpoint) fail(out.error || 'Maybee could not give its browser.')
  return out.endpoint
}

const [cmd, ...rest] = process.argv.slice(2)
if (cmd === 'run' && rest[0]) {
  const script = path.resolve(rest[0])
  if (!fs.existsSync(script)) fail(`No such script: ${script}`)
  const endpoint = await browserEndpoint()
  const child = spawn(process.execPath, [script, ...rest.slice(1)], {
    stdio: 'inherit',
    env: { ...process.env, MAYBEE_BROWSER: endpoint, MAYBEE_BROWSER_LIB: pathToFileURL(path.join(here, 'browser-lib.js')).href },
  })
  child.on('exit', code => process.exit(code ?? 1))
} else if (cmd === 'window') {
  process.env.MAYBEE_BROWSER = await browserEndpoint()
  const { endpoint } = await import(pathToFileURL(path.join(here, 'browser-lib.js')).href)
  const { chromium } = await import('playwright-core')
  const browser = await chromium.connectOverCDP(endpoint)
  const context = browser.contexts()[0]
  const before = new Set(context.pages())
  const cdp = await browser.newBrowserCDPSession()
  await cdp.send('Target.createTarget', { url: rest[0] || 'about:blank', newWindow: true })
  await new Promise(r => setTimeout(r, 600))
  await browser.close().catch(() => {}) // lets go of the connection; the window stays open
  console.log('Opened a new window' + (rest[0] ? ' on ' + rest[0] : '') + '.')
} else {
  fail('Usage: browser.js run <script.mjs> [args...]  |  browser.js window [url]')
}

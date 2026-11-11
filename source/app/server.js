// Maybee app server: reads the project folder, serves the Vue page, pushes live changes.
// The .md files are the only source of truth. This server never deletes, moves or renames files.
import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer as createVite } from 'vite'
import { buildIndex, feed, numbers, library, search, readNote, resolveName, statFile, allPaths, getIndex } from './lib/project.js'
import { board, backlog, setStage, logChange } from './lib/board.js'
import { desktop, setFields, dayKey, nowCards, routinesOn, overviewState } from './lib/desktop.js'
import { initInbox, readInbox, addRequest, listening, promptFor } from './lib/inbox.js'
import { initSnapshots, snapshot, diffFor } from './lib/snapshots.js'
import { verifySkool } from './local-skool-verifier.js'

const APP_DIR = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROOT = path.resolve(APP_DIR, '..', '..')
const PORT = Number(process.env.PORT || argValue('--port') || 8780)
const HOST = '127.0.0.1'
// A packaged Maybee can be started from any directory. The project is explicit
// when provided, and the existing How I layout remains the safe default.
const ROOT = path.resolve(process.env.MAYBEE_PROJECT_ROOT || argValue('--project') || DEFAULT_ROOT)
// The default verifier is the agent's already-available browser. This avoids
// launching a second Chrome/Chromium process from a sandboxed local server.
const ACCESS_MODE = process.env.MAYBEE_ACCESS_MODE || 'agent-browser'
let accessChallenge = crypto.randomBytes(24).toString('hex')
const SKOOL_TARGET = process.env.MAYBEE_SKOOL_URL || 'https://www.skool.com/how-i-9301'
const ACCESS_RECHECK_MS = Number(process.env.MAYBEE_ACCESS_RECHECK_HOURS || 6) * 3600000
const ACCESS_IDLE_MS = Number(process.env.MAYBEE_ACCESS_IDLE_HOURS || 2) * 3600000
const ACCESS_SWEEP_MS = 60 * 1000
const ACCESS_SESSION_FILE = path.join(APP_DIR, 'data', 'access-session.json')
let accessSession = {
  valid: false,
  checkedAt: 0,
  lastSkoolCheckAt: 0,
  lastAppActivityAt: 0,
  sessionStartedAt: Date.now(),
  expiresAt: 0,
  method: null,
  details: 'Access has not been verified for this session.',
}
let lastServerActivityAt = Date.now()
const accessClients = new Set()

function saveAccessSession(event = null) {
  try {
    fs.mkdirSync(path.dirname(ACCESS_SESSION_FILE), { recursive: true })
    const previous = fs.existsSync(ACCESS_SESSION_FILE)
      ? JSON.parse(fs.readFileSync(ACCESS_SESSION_FILE, 'utf8'))
      : {}
    const history = Array.isArray(previous.history) ? previous.history.slice(-49) : []
    if (event) history.push({ at: new Date().toISOString(), ...event })
    fs.writeFileSync(ACCESS_SESSION_FILE, JSON.stringify({
      sessionStartedAt: new Date(accessSession.sessionStartedAt).toISOString(),
      lastAppActivityAt: accessSession.lastAppActivityAt ? new Date(accessSession.lastAppActivityAt).toISOString() : null,
      lastSkoolCheckAt: accessSession.lastSkoolCheckAt ? new Date(accessSession.lastSkoolCheckAt).toISOString() : null,
      accessExpiresAt: accessSession.expiresAt ? new Date(accessSession.expiresAt).toISOString() : null,
      valid: accessSession.valid,
      community: accessSession.community || 'How I',
      method: accessSession.method,
      history,
      note: 'Local Maybee access/session audit. No password or browser cookie is stored.',
    }, null, 2))
  } catch (error) {
    console.warn(`Could not write access session audit: ${error.message}`)
  }
}

function touchAppActivity(source = 'request') {
  if (!accessSession.valid) return
  accessSession.lastAppActivityAt = Date.now()
  saveAccessSession({ type: 'activity', source })
}

function touchServerActivity() {
  lastServerActivityAt = Date.now()
}

function expireAccess(reason) {
  if (!accessSession.valid) return false
  accessSession.valid = false
  accessSession.member = false
  accessSession.expiresAt = Date.now()
  accessSession.details = reason
  saveAccessSession({ type: 'access-expired', reason })
  return true
}

function enforceIdleExpiry() {
  if (!accessSession.valid || !accessSession.lastAppActivityAt) return false
  if (Date.now() - accessSession.lastAppActivityAt <= ACCESS_IDLE_MS) return false
  return expireAccess('The Maybee session expired after being inactive.')
}

// What Adal has seen: { baseline: ms, items: { key: ms } }. Agents can read it too.
const SEEN_FILE = path.join(APP_DIR, 'data', 'seen.json')
let seen = { baseline: 0, items: {} }
function loadSeen() {
  try { seen = JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8')) } catch {
    const d = new Date(); d.setHours(0, 0, 0, 0)
    seen = { baseline: d.getTime(), items: {}, note: 'Written by the Maybee app: what the owner has opened. baseline = everything older counts as read.' }
    saveSeen()
  }
}
function saveSeen() {
  fs.mkdirSync(path.dirname(SEEN_FILE), { recursive: true })
  fs.writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 1))
}
const seenKey = it => it.type === 'decision' ? 'decision:' + it.id : it.type === 'media' ? 'media:' + it.id : it.path
function markRead(items) {
  for (const it of items) {
    const at = Math.max(seen.baseline, seen.items[seenKey(it)] || 0)
    it.read = it.time <= at
  }
  return items
}
function readBody(req) {
  return new Promise(resolve => { let b = ''; req.on('data', c => (b += c)); req.on('end', () => { try { resolve(JSON.parse(b || '{}')) } catch { resolve({}) } }) })
}

function argValue(name) {
  const i = process.argv.indexOf(name)
  return i > -1 ? process.argv[i + 1] : null
}

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8', '.pdf': 'application/pdf', '.json': 'application/json',
}

// Only paths inside the project folder.
function safePath(rel) {
  if (!rel) return null
  const abs = path.resolve(ROOT, rel)
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null
  return abs
}

function sendJSON(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(data))
}

function accessStatus() {
  enforceIdleExpiry()
  return {
    valid: accessSession.valid,
    member: !!accessSession.member,
    community: accessSession.community || 'How I',
    checkedAt: accessSession.checkedAt || null,
    lastSkoolCheckAt: accessSession.lastSkoolCheckAt || null,
    lastAppActivityAt: accessSession.lastAppActivityAt || null,
    sessionStartedAt: accessSession.sessionStartedAt,
    expiresAt: accessSession.expiresAt || null,
    recheckAfterMs: ACCESS_RECHECK_MS,
    idleAfterMs: ACCESS_IDLE_MS,
    method: accessSession.method,
    details: accessSession.details,
    mode: ACCESS_MODE,
    verificationTarget: SKOOL_TARGET,
    verificationChallenge: accessSession.valid ? null : accessChallenge,
  }
}

function openMaybeeAfterAccess() {
  // If the UI is already connected, its access gate will unlock in place. When
  // a skill/CLI performs the first check before opening a browser, open one
  // only after membership succeeds.
  if (clients.size || process.env.MAYBEE_OPEN_AFTER_ACCESS === '0') return
  import('node:child_process').then(({ spawn }) => {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
    spawn(cmd, [`http://${HOST}:${PORT}/?place=workspace`], { detached: true, stdio: 'ignore' }).unref()
  }).catch(() => {})
}

async function verifyAccess(body = {}) {
  // Development-only escape hatch for testing the gate. Production defaults to
  // `skool`, where a local browser/Playwright adapter must provide the result.
  if (ACCESS_MODE === 'demo') {
    const now = Date.now()
    accessSession = { ...accessSession, valid: true, member: true, community: 'How I', checkedAt: now, lastSkoolCheckAt: now, lastAppActivityAt: now, expiresAt: now + ACCESS_RECHECK_MS, method: 'demo', details: 'Demo: the local verifier confirmed access to the How I community.' }
    saveAccessSession({ type: 'access-verified', method: 'demo', reason: body.reason || 'manual' })
    return accessStatus()
  }
  if (ACCESS_MODE === 'agent-browser') {
    if (body.reason === 'scheduled-6-hour-renewal') expireAccess('A fresh How I membership check is required for this session.')
    return {
      ...accessStatus(),
      waitingForBrowser: true,
      details: `Open ${SKOOL_TARGET} in the browser available to the agent, confirm that the account is a member, then send the local confirmation.`,
    }
  }
  try {
    const result = await verifySkool()
    const now = Date.now()
    accessSession = { ...accessSession, valid: !!result.member, member: !!result.member, community: 'How I', checkedAt: now, lastSkoolCheckAt: now, lastAppActivityAt: now, expiresAt: result.member ? now + ACCESS_RECHECK_MS : now, method: 'playwright-persistent-profile', details: result.details, url: result.url }
    saveAccessSession({ type: result.member ? 'access-verified' : 'access-denied', method: 'playwright-persistent-profile', reason: body.reason || 'manual' })
    if (accessSession.valid) openMaybeeAfterAccess()
  } catch (error) {
    accessSession = { ...accessSession, valid: false, member: false, community: 'How I', checkedAt: Date.now(), expiresAt: Date.now(), method: 'playwright-persistent-profile', details: error.message || 'The local Skool verifier could not start.' }
    saveAccessSession({ type: 'access-error', method: 'playwright-persistent-profile', reason: body.reason || 'manual' })
  }
  return accessStatus()
}

function confirmAgentBrowser(body = {}) {
  const url = String(body.url || '')
  const evidence = String(body.evidence || '')
  const member = body.member === true
  const isHowI = /^https:\/\/www\.skool\.com\/how-i-9301(?:\/|$)/i.test(url)
  const looksLoggedOut = /\/login|\/sign-in|\/auth\//i.test(url) || /\b(LOG IN|SIGN IN|JOIN GROUP|JOIN COMMUNITY)\b/i.test(evidence)
  const hasMemberControl = /\b(SETTINGS|LEAVE GROUP|CLASSROOM)\b/i.test(evidence)
  if (ACCESS_MODE !== 'agent-browser') return { ...accessStatus(), details: 'Agent-browser verification is disabled for this session.' }
  if (String(body.challenge || '') !== accessChallenge) return { ...accessStatus(), details: 'This browser verification request has expired. Start a new Maybee session.' }
  if (!member || !isHowI || looksLoggedOut || !hasMemberControl) {
    accessSession = { ...accessSession, valid: false, member: false, checkedAt: Date.now(), expiresAt: Date.now(), method: 'agent-browser', details: 'The available browser did not confirm access to the How I community.' }
    saveAccessSession({ type: 'access-denied', method: 'agent-browser', reason: 'browser evidence did not confirm membership' })
    return accessStatus()
  }
  const now = Date.now()
  accessSession = { ...accessSession, valid: true, member: true, community: 'How I', checkedAt: now, lastSkoolCheckAt: now, lastAppActivityAt: now, expiresAt: now + ACCESS_RECHECK_MS, method: 'agent-browser', details: `The available browser confirmed membership at ${url}.`, url }
  saveAccessSession({ type: 'access-verified', method: 'agent-browser', reason: 'confirmed by the agent browser' })
  accessChallenge = crypto.randomBytes(24).toString('hex')
  for (const client of accessClients) client.write('data: ' + JSON.stringify({ valid: true }) + '\n\n')
  openMaybeeAfterAccess()
  return accessStatus()
}

async function heartbeat() {
  enforceIdleExpiry()
  if (!accessSession.valid) return accessStatus()
  if (Date.now() - accessSession.lastSkoolCheckAt >= ACCESS_RECHECK_MS) {
    return verifyAccess({ reason: 'scheduled-6-hour-renewal' })
  }
  touchAppActivity('heartbeat')
  return accessStatus()
}

const ONBOARDING_DIRS = ['owner', 'knowledge', 'ideas', 'people', 'outputs', 'logs']
function setupStatus() {
  const has = rel => fs.existsSync(path.join(ROOT, rel))
  return {
    root: ROOT,
    initialized: has('PROJECT.md') && has('STATE.md'),
    hasProject: has('PROJECT.md'),
    hasState: has('STATE.md'),
    directories: ONBOARDING_DIRS.map(name => ({ name, exists: has(name) })),
  }
}

function cleanAnswer(value, fallback = '') {
  return String(value ?? fallback).trim().replace(/\r/g, '').slice(0, 2000)
}

async function initializeProject(body) {
  const projectName = cleanAnswer(body.projectName, 'My Maybee project')
  const purpose = cleanAnswer(body.purpose, 'A project I want to move forward.')
  const audience = cleanAnswer(body.audience, 'The people this project serves.')
  const goal = cleanAnswer(body.goal, 'Make steady progress and keep the work visible.')
  const preferences = cleanAnswer(body.preferences, 'Keep the system simple, concrete and useful.')
  const voice = cleanAnswer(body.voice, 'Clear, direct and human.')
  const language = cleanAnswer(body.language, 'English')
  const now = new Date().toISOString().slice(0, 10)
  for (const dir of ONBOARDING_DIRS) await fsp.mkdir(path.join(ROOT, dir), { recursive: true })
  const files = {
    'PROJECT.md': `---\ntitle: ${projectName}\nlanguage: ${language}\ncreated: ${now}\n---\n\n# ${projectName}\n\n## Purpose\n${purpose}\n\n## Who this is for\n${audience}\n\n## Current goal\n${goal}\n\nThis project is operated through Maybee. Project facts belong here and in the linked folders; the app reads this workspace locally.\n`,
    'STATE.md': `---\ntitle: ${projectName} — state\nupdated: ${now}\nby: Maybee onboarding\n---\n\n# State\n\n## Focus\n- ${goal}\n\n## Next\n- Decide the smallest useful next action.\n`,
    'owner/preferences.md': `---\ntitle: Preferences\nsource: Maybee onboarding\n---\n\n# Preferences\n\n${preferences}\n`,
    'owner/voice.md': `---\ntitle: Voice\nsource: Maybee onboarding\n---\n\n# Voice\n\n${voice}\n`,
    'knowledge/README.md': '# Knowledge\n\nFacts, references and lessons that belong to this project.\n',
    'ideas/README.md': '# Ideas\n\nIdeas and tasks begin here.\n',
    'people/README.md': '# People\n\nPeople connected to this project.\n',
    'outputs/README.md': '# Outputs\n\nThings this project produces.\n',
    'logs/CHANGELOG.md': `# Changelog\n\n- ${now}: Maybee created the initial project structure through onboarding.\n`,
  }
  const created = []
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(ROOT, rel)
    if (fs.existsSync(abs)) continue
    await fsp.writeFile(abs, text)
    created.push(rel)
  }
  return { ...setupStatus(), created, preserved: Object.keys(files).filter(rel => !created.includes(rel)) }
}

async function sendRaw(req, res, rel) {
  const abs = safePath(rel)
  if (!abs) return sendJSON(res, { error: 'outside the project' }, 403)
  let st
  try { st = await fsp.stat(abs) } catch { return sendJSON(res, { error: 'not found' }, 404) }
  const type = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream'
  const range = req.headers.range
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range)
    let start = m && m[1] ? Number(m[1]) : 0
    let end = m && m[2] ? Number(m[2]) : st.size - 1
    if (start >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end() }
    end = Math.min(end, st.size - 1)
    res.writeHead(206, {
      'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Cache-Control': 'no-cache',
    })
    fs.createReadStream(abs, { start, end }).pipe(res)
    return
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' })
  fs.createReadStream(abs).pipe(res)
}

// Live updates: one EventSource per open page.
const clients = new Set()
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of clients) res.write(msg)
}

const IGNORED = /(^|\/)(node_modules|\.git|\.obsidian|\.trash|__pycache__)(\/|$)|\.pyc$|~$|\.swp$/
let pending = new Set()
let timer = null
function watch() {
  fs.watch(ROOT, { recursive: true }, (_type, file) => {
    if (!file) return
    const rel = file.split(path.sep).join('/')
    if (IGNORED.test(rel) || rel.startsWith('system/app/')) return
    pending.add(rel)
    clearTimeout(timer)
    timer = setTimeout(async () => {
      const paths = [...pending]
      pending = new Set()
      for (const p of paths) await statFile(ROOT, p)
      broadcast('change', { paths, at: Date.now() })
    }, 250)
  })
}

async function main() {
  const rootStat = await fsp.stat(ROOT).catch(() => null)
  if (!rootStat?.isDirectory()) throw new Error(`Project folder does not exist: ${ROOT}`)
  await buildIndex(ROOT)
  loadSeen()
  initInbox(APP_DIR)
  await initSnapshots(ROOT, APP_DIR, allPaths('.md'))
  const server = http.createServer()
  const vite = await createVite({
    root: APP_DIR,
    configFile: path.join(APP_DIR, 'vite.config.js'),
    server: { middlewareMode: true, hmr: { server } },
    appType: 'spa',
  })

  server.on('request', async (req, res) => {
    touchServerActivity()
    const url = new URL(req.url, `http://${HOST}`)
    const q = Object.fromEntries(url.searchParams)
    try {
      if (url.pathname === '/api/access' && req.method === 'GET') return sendJSON(res, accessStatus())
      if (url.pathname === '/api/access/events' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
        res.write('data: ' + JSON.stringify({ valid: accessStatus().valid }) + '\n\n')
        accessClients.add(res)
        req.on('close', () => accessClients.delete(res))
        return
      }
      if (url.pathname === '/api/access/verify' && req.method === 'POST') return sendJSON(res, await verifyAccess(await readBody(req)))
      if (url.pathname === '/api/access/confirm' && req.method === 'POST') return sendJSON(res, confirmAgentBrowser(await readBody(req)))
      if (url.pathname === '/api/session/heartbeat' && req.method === 'POST') return sendJSON(res, await heartbeat())
      if (url.pathname.startsWith('/api/') && !accessSession.valid) return sendJSON(res, { error: 'Skool membership must be verified for this session.', access: accessStatus() }, 403)
      if (url.pathname.startsWith('/api/')) touchAppActivity(url.pathname)
      if (url.pathname === '/api/setup' && req.method === 'GET') return sendJSON(res, setupStatus())
      if (url.pathname === '/api/setup' && req.method === 'POST') {
        const body = await readBody(req)
        return sendJSON(res, await initializeProject(body))
      }
      if (url.pathname === '/api/feed') {
        const out = await feed(ROOT, { all: q.all === '1', before: q.before ? Number(q.before) : null })
        markRead(out.items)
        for (const it of out.items) if (!it.read && it.type === 'file' && it.ext === '.md') it.diff = await diffFor(it.path)
        const all = await feed(ROOT, { all: q.all === '1', limit: 100000, enrich: false })
        out.unread = markRead(all.items).filter(i => !i.read).length
        return sendJSON(res, out)
      }
      if (url.pathname === '/api/seen' && req.method === 'POST') {
        const body = await readBody(req)
        const now = Date.now()
        if (body.all) {
          seen.baseline = now; seen.items = {}
          for (const rel of allPaths('.md')) await snapshot(rel)
        }
        for (const k of body.keys || []) { seen.items[k] = now; if (!k.includes(':')) await snapshot(k) }
        saveSeen()
        return sendJSON(res, { ok: true })
      }
      if (url.pathname === '/api/board') {
        const b = await board(ROOT, getIndex())
        const withFiles = await nowCards(ROOT, getIndex())
        b.columns.now.cards = b.columns.now.cards.map(c => ({ ...c, ...(withFiles.find(w => w.path === c.path) || {}) }))
        // D242: today's routines sit on top of Now; done ones stay there with a check (Adal, 2026-11-08)
        const d = await desktop(ROOT, getIndex(), APP_DIR, seen)
        b.routinesToday = d.rhythm.due.filter(r => !r.skipped).sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title))
        return sendJSON(res, b)
      }
      if (url.pathname === '/api/backlog') return sendJSON(res, await backlog(ROOT, getIndex()))
      if (url.pathname === '/api/stage' && req.method === 'POST') {
        const body = await readBody(req)
        try {
          const r = await setStage(ROOT, body.path, body.stage, body.mtime)
          await statFile(ROOT, body.path)
          seen.items[body.path] = Date.now() + 2000; saveSeen(); await snapshot(body.path)
          if (r.from !== r.to) await logChange(ROOT, `${body.title || body.path}: stage ${r.from || '—'} → ${r.to} (${body.path})`)
          return sendJSON(res, { ok: true, ...r })
        } catch (err) {
          return sendJSON(res, { error: err.message }, err.code === 409 ? 409 : 400)
        }
      }
      if (url.pathname === '/api/routines') {
        const t = new Date(); t.setDate(t.getDate() + 1)
        const day = /^\d{4}-\d{2}-\d{2}$/.test(q.day || '') ? q.day : dayKey(t)
        return sendJSON(res, await routinesOn(ROOT, getIndex(), day, seen))
      }
      if (url.pathname === '/api/desktop') return sendJSON(res, await desktop(ROOT, getIndex(), APP_DIR, seen))
      if (url.pathname === '/api/fields' && req.method === 'POST') {
        const body = await readBody(req)
        const allowed = ['value_members', 'value_money', 'want', 'hard', 'last_done', 'auto_run', 'importance', 'not_today', 'auto', 'auto_every', 'priority', 'auto_days', 'auto_since', 'auto_mday', 'type', 'kind', 'recurring', 'owner', 'needed_by', 'area', 'next_step', 'done', 'at', 'needs', 'deliverable', 'deliverable_on']
        // D249: values may have spaces (needed_by: "This week"); one line, short
        const fields = Object.fromEntries(Object.entries(body.fields || {}).filter(([k, v]) => allowed.includes(k) && String(v).length <= 200 && !/[\r\n]/.test(String(v))))
        if (fields.type && !['idea', 'task', 'routine'].includes(fields.type)) delete fields.type
        if (!Object.keys(fields).length) return sendJSON(res, { error: 'nothing to change' }, 400)
        try {
          const before = await setFields(ROOT, body.path, fields)
          await statFile(ROOT, body.path)
          seen.items[body.path] = Date.now() + 2000; saveSeen(); await snapshot(body.path)
          const what = Object.entries(fields).map(([k, v]) => `${k} ${before[k] ?? '—'} → ${v}`).join(', ')
          await logChange(ROOT, `${body.title || body.path}: ${what} (${body.path})`)
          return sendJSON(res, { ok: true })
        } catch (err) { return sendJSON(res, { error: err.message }, 400) }
      }
      // D241: the SessionStart hook calls this; due routines marked auto_run go to Claude once a day
      if (url.pathname === '/api/autorun' && req.method === 'POST') {
        return sendJSON(res, { ok: true, sent: await autoTick('session') })
      }
      // D246: the board's order is the routines' priority and run order
      if (url.pathname === '/api/routines/order' && req.method === 'POST') {
        const body = await readBody(req)
        const paths = (body.paths || []).filter(p => /^ideas\/[^/]+\.md$/.test(p))
        for (let i = 0; i < paths.length; i++) { await setFields(ROOT, paths[i], { priority: i + 1 }); await statFile(ROOT, paths[i]); seen.items[paths[i]] = Date.now() + 2000 }
        saveSeen()
        await logChange(ROOT, `Routines reordered (priority = run order): ${paths.map(p => p.replace(/^ideas\/|\.md$/g, '')).join(' → ')}`)
        return sendJSON(res, { ok: true })
      }
      if (url.pathname === '/api/routine/keep' && req.method === 'POST') {
        const body = await readBody(req)
        const d = new Date(); d.setDate(d.getDate() + 14)
        seen.keepRoutines = { ...(seen.keepRoutines || {}), [body.path]: dayKey(d) }
        saveSeen()
        await logChange(ROOT, `${body.title || body.path}: kept as a routine (hidden from "forgotten" for 14 days)`)
        return sendJSON(res, { ok: true })
      }
      if (url.pathname === '/api/source') {
        const abs = safePath(q.path)
        if (!abs || !abs.endsWith('.md')) return sendJSON(res, { error: 'only .md files in the project' }, 403)
        const st = await fsp.stat(abs)
        return sendJSON(res, { path: q.path, text: await fsp.readFile(abs, 'utf8'), mtime: st.mtimeMs })
      }
      if (url.pathname === '/api/save' && req.method === 'POST') {
        const body = await readBody(req)
        const abs = safePath(body.path)
        if (!abs || !abs.endsWith('.md') || body.path.startsWith('system/app/')) return sendJSON(res, { error: 'only .md files in the project' }, 403)
        let st
        try { st = await fsp.stat(abs) } catch { return sendJSON(res, { error: 'not found' }, 404) }
        if (Math.abs(st.mtimeMs - Number(body.mtime)) > 1) return sendJSON(res, { error: 'changed since you opened it' }, 409)
        if (typeof body.text !== 'string') return sendJSON(res, { error: 'no text' }, 400)
        const before = await fsp.readFile(abs, 'utf8')
        if (before === body.text) return sendJSON(res, { ok: true, unchanged: true, mtime: st.mtimeMs })
        await fsp.writeFile(abs, body.text)
        await statFile(ROOT, body.path)
        seen.items[body.path] = Date.now() + 2000; saveSeen(); await snapshot(body.path)
        const delta = body.text.split('\n').length - before.split('\n').length
        await logChange(ROOT, `edited ${body.path} in the app (${delta >= 0 ? '+' : ''}${delta} lines)`)
        const nst = await fsp.stat(abs)
        return sendJSON(res, { ok: true, mtime: nst.mtimeMs })
      }
      if (url.pathname === '/api/inbox') return sendJSON(res, { listening: listening(), items: readInbox().slice(-20).reverse() })
      if (url.pathname === '/api/ask' && req.method === 'POST') {
        const body = await readBody(req)
        const r = addRequest(body)
        return sendJSON(res, { ok: true, listening: listening(), request: r, prompt: promptFor(r) })
      }
      if (url.pathname === '/api/library') return sendJSON(res, await library())
      if (url.pathname === '/api/search') return sendJSON(res, await search(q.q))
      if (url.pathname === '/api/numbers') return sendJSON(res, await numbers(ROOT))
      if (url.pathname === '/api/state') return sendJSON(res, await overviewState(ROOT))
      if (url.pathname === '/api/note') {
        if (!safePath(q.path)) return sendJSON(res, { error: 'outside the project' }, 403)
        return sendJSON(res, await readNote(ROOT, q.path))
      }
      if (url.pathname === '/api/resolve') return sendJSON(res, { path: resolveName(q.name || '', q.from || '') })
      if (url.pathname === '/raw') return sendRaw(req, res, q.path)
      if (url.pathname === '/api/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
        res.write(`event: hello\ndata: {}\n\n`)
        clients.add(res)
        const ping = setInterval(() => res.write(': ping\n\n'), 25000)
        req.on('close', () => { clearInterval(ping); clients.delete(res) })
        return
      }
    } catch (err) {
      console.error(err)
      return sendJSON(res, { error: String(err.message || err) }, 500)
    }
    vite.middlewares(req, res)
  })

  // D246: routines that run by themselves, in priority order.
  // 'session' (start of a session): session ones that are due and not done, once a day, plus any overdue hours/days ones.
  // 'timer' (every 5 minutes while the app runs): hours ones whose last run is older than N hours, days ones that are due.
  async function autoTick(trigger) {
    const d = await desktop(ROOT, getIndex(), APP_DIR, seen)
    const inbox = readInbox().filter(r => r.action === 'Run routine')
    const lastAsk = p => inbox.filter(r => r.path === p).reduce((m, r) => Math.max(m, Date.parse(r.at) || 0), 0)
    const askedToday = p => inbox.some(r => r.path === p && String(r.at).slice(0, 10) === new Date().toISOString().slice(0, 10))
    const open = p => inbox.some(r => r.path === p && (r.status === 'pending' || r.status === 'queued' || r.status === 'working') && Date.now() - Date.parse(r.at) < 6 * 3600000)
    const sent = []
    for (const r of d.rhythm.due) {
      if (r.skipped || r.later || open(r.path)) continue // D262: not before its time or the routine it needs
      let go = false
      if (r.autoMode === 'session') go = trigger === 'session' && !r.done && !askedToday(r.path)
      else if (r.autoMode === 'hours') go = Date.now() - lastAsk(r.path) >= r.autoEvery * 3600000
      else if (r.autoMode === 'days' || r.autoMode === 'weeks' || r.autoMode === 'months') go = !r.done && !askedToday(r.path)
      if (!go) continue
      const why = r.autoMode === 'session' ? 'session start' : `every ${r.autoEvery} ${r.autoMode}${r.autoMode === 'weeks' && r.autoDays.length ? ' on ' + r.autoDays.join(', ') : ''}${r.autoMode === 'months' ? ' on day ' + r.autoMday : ''}`
      addRequest({ action: 'Run routine', text: `automatic (${why}), ${new Date().toLocaleString('sv-SE')}`, path: r.path, title: r.full || r.title })
      sent.push(r.full || r.title)
    }
    return sent
  }
  setInterval(() => { autoTick('timer').catch(() => {}) }, 5 * 60000)

  // Keep the process around while the app or Claude is using it, but do not
  // leave a forgotten local server running forever. The browser heartbeat is
  // also what renews the Skool check every six hours.
  setInterval(() => {
    enforceIdleExpiry()
    const serverIdleMs = Number(process.env.MAYBEE_SERVER_IDLE_HOURS || 2) * 3600000
    if (Date.now() - lastServerActivityAt <= serverIdleMs || clients.size) return
    console.log(`Maybee is stopping after ${serverIdleMs / 3600000} hours without activity.`)
    process.exit(0)
  }, ACCESS_SWEEP_MS)

  watch()
  server.listen(PORT, HOST, () => {
    const url = `http://${HOST}:${PORT}`
    console.log(`Maybee is open at ${url}  (Ctrl+C to stop)`)
    if (!process.argv.includes('--no-open')) {
      import('node:child_process').then(({ spawn }) => {
        const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
        spawn(cmd, [url + '/?place=workspace'], { detached: true, stdio: 'ignore' }).unref() // D241: start on the Workspace (D260)
      })
    }
  })
}

main()

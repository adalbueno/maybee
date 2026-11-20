// The browser Maybee owns: a Chromium-based browser started with a CDP port on 127.0.0.1 and its own
// profile (data/skool-profile). It does NOT show the Maybee interface: the app opens in the owner's own
// browser (server.js). This one starts only when it is needed, with no window of its own: to check Skool
// (the verifier reads Skool in a hidden target, and opens one window only when the person must log in) and
// for an agent task that needs a browser (scripts/browser.js opens its own window in it). When it has had
// no window for a couple of minutes, it is closed. It is launched normally (no --enable-automation), so
// there is no "controlled by automated software" banner and navigator.webdriver stays false.
//
// Order of preference for the executable: MAYBEE_BROWSER_EXECUTABLE, a Chromium-based browser
// already installed (Chrome, Edge, Brave, Chromium), then the Chromium Playwright downloaded.
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dataPath } from './paths.js'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const PROFILE = dataPath('skool-profile')

let current = null   // { proc, port, browser } while our browser is running
let launching = null
let lastUsed = 0     // when ensureBrowser was last called: a browser just started for a hidden read has no page yet
let heldUntil = 0    // an agent script was just handed the browser and is about to open its window

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function onPath(names) {
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean)
  const exts = process.platform === 'win32' ? ['.exe', ''] : ['']
  const out = []
  for (const dir of dirs) for (const name of names) for (const ext of exts) out.push(path.join(dir, name + ext))
  return out
}

function systemCandidates() {
  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ]
  }
  if (process.platform === 'win32') {
    const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean)
    const rel = [
      ['Microsoft', 'Edge', 'Application', 'msedge.exe'],
      ['Google', 'Chrome', 'Application', 'chrome.exe'],
      ['BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'],
      ['Chromium', 'Application', 'chrome.exe'],
    ]
    return roots.flatMap(root => rel.map(parts => path.join(root, ...parts)))
  }
  return onPath(['chromium', 'chromium-browser', 'google-chrome-stable', 'google-chrome', 'microsoft-edge-stable', 'brave-browser'])
}

// ---- the owner's default browser ----------------------------------------------------------------------
// The app opens in the owner's own browser. When that browser is Chromium-based it opens as an app window
// (--app: no tabs, no address bar) with the owner's normal profile; otherwise it opens as a normal tab.
// Returns the executable of the default browser when it is Chromium-based, or null.
const CHROMIUM_ID = /chrom|brave|edge|vivaldi|opera|helium/i
function execFromDesktop(id) {
  const dirs = [process.env.XDG_DATA_HOME || path.join(process.env.HOME || '', '.local/share'), ...(process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':')]
  for (const dir of dirs) {
    try {
      const text = fs.readFileSync(path.join(dir, 'applications', id), 'utf8')
      const exec = (text.match(/^Exec=(\S+)/m) || [])[1]
      if (!exec) return null
      if (path.isAbsolute(exec)) return fs.existsSync(exec) ? exec : null
      return onPath([exec]).find(f => fs.existsSync(f)) || null
    } catch {}
  }
  return null
}
export function defaultChromiumBrowser() {
  const run = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return '' } }
  if (process.platform === 'linux') {
    let id = run('xdg-settings', ['get', 'default-web-browser'])
    // a wrapper entry (Omarchy's omarchy-browser.desktop) names the real browser through its own helper
    if (id && !CHROMIUM_ID.test(id)) id = run('omarchy-cmd-default-browser', []) || id
    return id && CHROMIUM_ID.test(id) ? execFromDesktop(id) : null
  }
  if (process.platform === 'win32') {
    const out = run('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice', '/v', 'ProgId'])
    const progId = (out.match(/ProgId\s+REG_SZ\s+(\S+)/) || [])[1] || ''
    const want = /^MSEdge/i.test(progId) ? 'msedge.exe' : /^ChromeHTML/i.test(progId) ? 'Chrome' : /^Brave/i.test(progId) ? 'brave.exe' : null
    return want ? systemCandidates().find(f => f.includes(want) && fs.existsSync(f)) || null : null
  }
  return null // macOS: the default browser is not read here; the app opens with `open` in a normal tab
}

export function findBrowser(bundledPath = null) {
  const configured = process.env.MAYBEE_BROWSER_EXECUTABLE
  if (configured && fs.existsSync(configured)) return configured
  for (const candidate of systemCandidates()) if (fs.existsSync(candidate)) return candidate
  if (bundledPath && fs.existsSync(bundledPath)) return bundledPath
  return null
}

export async function loadPlaywright() {
  // playwright-core is a dependency of the package (no browser download: Maybee uses the
  // browser already installed). MAYBEE_PLAYWRIGHT_MODULE can point to another install.
  const candidates = [
    process.env.MAYBEE_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.MAYBEE_PLAYWRIGHT_MODULE).href : null,
    'playwright-core',
    'playwright',
  ].filter(Boolean)
  let lastError = null
  for (const specifier of candidates) {
    try { return await import(specifier) } catch (error) { lastError = error }
  }
  throw new Error(`Playwright is not available locally. Install it in the Maybee package or set MAYBEE_PLAYWRIGHT_MODULE. (${lastError?.message || 'module not found'})`)
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

// Some setups (Omarchy's chromium-flags.conf, or the browser's own settings) restore the last
// session at start, which would reopen the old Maybee/Skool tabs in a normal window next to the
// app window. The profile only needs its cookies, so the saved window/tab state is dropped before
// the browser starts.
function forgetLastSession() {
  const dir = path.join(PROFILE, 'Default')
  for (const name of ['Sessions', 'Current Session', 'Current Tabs', 'Last Session', 'Last Tabs']) {
    try { fs.rmSync(path.join(dir, name), { recursive: true, force: true }) } catch {}
  }
}

const alive = c => !!c && c.proc.exitCode === null && c.browser.isConnected()

// A browser from an earlier run of Maybee may still be open on this profile (the server was restarted or
// stopped while its window stayed). Launching a second one would only hand the start over to that browser,
// open one more window and exit, so the app could never connect. The port of the browser Maybee starts is kept
// in a small file next to the profile: when that browser still answers, use it as it is.
const MARKER = dataPath('browser.json')
async function adopt(playwright) {
  let port
  try { port = Number(JSON.parse(fs.readFileSync(MARKER, 'utf8')).port) } catch { return null }
  if (!Number.isInteger(port) || port <= 0) return null
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) })
    if (!res.ok) return null
    const browser = await playwright.chromium.connectOverCDP(`http://127.0.0.1:${port}`)
    const proc = { exitCode: null, kill() {}, once() {} }
    browser.on('disconnected', () => { proc.exitCode = 0; if (current && current.proc === proc) current = null })
    return { proc, port, browser }
  } catch { return null }
}

async function launch() {
  const playwright = await loadPlaywright()
  const existing = await adopt(playwright)
  if (existing) return existing
  let bundled = null
  try { bundled = playwright.chromium.executablePath() } catch {}
  const executable = findBrowser(bundled)
  if (!executable) {
    throw new Error('No Chromium-based browser found. Install Chrome, Edge, Brave or Chromium, or set MAYBEE_BROWSER_EXECUTABLE.')
  }
  fs.mkdirSync(PROFILE, { recursive: true })
  forgetLastSession()
  const port = await freePort()
  const proc = spawn(executable, [
    `--remote-debugging-port=${port}`,
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    // no window at start: the verifier and the agent scripts open the windows they need
    '--no-startup-window',
  ], { stdio: 'ignore' })
  let exited = false
  proc.once('exit', () => { exited = true; if (current && current.proc === proc) current = null })
  proc.once('error', () => { exited = true })

  let browser = null
  for (let i = 0; i < 40 && !browser; i++) {
    if (exited) break
    try { browser = await playwright.chromium.connectOverCDP(`http://127.0.0.1:${port}`) } catch { await sleep(500) }
  }
  if (!browser) {
    if (proc.exitCode === null) proc.kill()
    throw new Error('The Maybee browser did not start. If another window is using the Maybee profile, close it and try again.')
  }
  try { fs.writeFileSync(MARKER, JSON.stringify({ port, pid: proc.pid, startedAt: new Date().toISOString() })) } catch {}
  return { proc, port, browser }
}

/** The running Maybee browser, started (with no window) if it was not running yet. */
export function ensureBrowser() {
  lastUsed = Date.now()
  if (alive(current)) return Promise.resolve(current)
  if (!launching) launching = launch().then(c => { current = c; return c }).finally(() => { launching = null })
  return launching
}

/** Closes Maybee's browser when it has no window left (and was not just asked for). Safe to call any time. */
export async function closeBrowserIfIdle(graceMs = 0) {
  const c = current
  if (!alive(c) || launching || Date.now() < heldUntil || Date.now() - lastUsed < graceMs) return false
  const pages = c.browser.contexts().flatMap(context => context.pages())
  if (pages.length) return false
  current = null
  try { const cdp = await c.browser.newBrowserCDPSession(); await cdp.send('Browser.close') } catch {}
  try { if (c.proc.exitCode === null) c.proc.kill() } catch {}
  try { fs.rmSync(MARKER, { force: true }) } catch {}
  return true
}
// an agent's window closed, a login window closed: the browser goes away after two quiet minutes
setInterval(() => { closeBrowserIfIdle(2 * 60000).catch(() => {}) }, 60000).unref()

/** Keeps the browser for a while even with no window: an agent script got its address and opens a window next. */
export function holdBrowser(ms = 30000) { heldUntil = Math.max(heldUntil, Date.now() + ms) }

export function browserRunning() { return alive(current) }

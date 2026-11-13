// The browser Maybee owns: one Chromium-based window in --app mode that shows the Maybee
// interface, started with a CDP port on 127.0.0.1 and its own profile (data/skool-profile).
// The same browser is used to check Skool: the verifier opens one extra window in it, reads the
// page and closes that window again. It is launched normally (no --enable-automation), so there
// is no "controlled by automated software" banner and navigator.webdriver stays false.
//
// Order of preference for the executable: MAYBEE_BROWSER_EXECUTABLE, a Chromium-based browser
// already installed (Chrome, Edge, Brave, Chromium), then the Chromium Playwright downloaded.
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const PROFILE = path.join(APP_DIR, 'data', 'skool-profile')

let current = null   // { proc, port, browser } while our browser is running
let launching = null

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

async function launch(startUrl) {
  const playwright = await loadPlaywright()
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
    `--app=${startUrl || 'about:blank'}`,
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
  return { proc, port, browser }
}

/** The running Maybee browser, started on `startUrl` if it was not running yet. */
export function ensureBrowser(startUrl) {
  if (alive(current)) return Promise.resolve(current)
  if (!launching) launching = launch(startUrl).then(c => { current = c; return c }).finally(() => { launching = null })
  return launching
}

/** Shows the Maybee interface: starts the window, or brings the existing one to the front. */
export async function openAppWindow(url) {
  const wasRunning = alive(current)
  const c = await ensureBrowser(url)
  if (wasRunning) {
    const origin = new URL(url).origin
    const pages = c.browser.contexts().flatMap(context => context.pages())
    const page = pages.find(p => p.url().startsWith(origin))
    if (page) await page.bringToFront().catch(() => {})
    else {
      const fresh = await c.browser.contexts()[0].newPage()
      await fresh.goto(url).catch(() => {})
    }
  }
  return c
}

export function browserRunning() { return alive(current) }

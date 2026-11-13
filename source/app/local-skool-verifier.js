// Local-only Skool membership check.
//
// Maybee launches a Chromium-based browser itself (a normal launch, with a CDP
// port on 127.0.0.1 and its own profile), attaches Playwright to it, opens Skool,
// and reads the `__NEXT_DATA__` block that Skool renders into every page:
//   props.pageProps.self            -> null when logged out
//   props.pageProps.self.member     -> the user's membership of the current group
//   props.pageProps.currentGroup    -> the group the page belongs to
// Only { userId, groupId, role, approvedAt } leave the page: never the e-mail,
// the name or `allGroups`. The profile and its cookies never leave this machine.
//
// Flow: open browser -> if logged out, the window stays on Skool so the person can
// log in (once; the profile keeps the login) -> as soon as the membership shows up
// the browser is closed. Closing the window or hitting the timeout cancels.
import { ensureBrowser, PROFILE } from './lib/browser.js'

const TARGET = process.env.MAYBEE_SKOOL_URL || 'https://www.skool.com/how-i-9301/about'
const TARGET_URL = new URL(TARGET)
const GROUP_PATH = '/' + (TARGET_URL.pathname.split('/').filter(Boolean)[0] || '')
const TIMEOUT_MS = Number(process.env.MAYBEE_VERIFY_TIMEOUT_MIN || 5) * 60000
const POLL_MS = 2000
let running = null
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// ---- reading Skool ------------------------------------------------------

// Runs inside the page. Returns only what Maybee needs, never the whole `self`.
function readSkoolState() {
  const el = document.getElementById('__NEXT_DATA__')
  if (!el) return null
  try {
    const pageProps = JSON.parse(el.textContent).props.pageProps
    const self = pageProps.self
    const member = self && self.member
    return {
      loggedIn: !!self,
      pathname: location.pathname,
      groupId: (pageProps.currentGroup && pageProps.currentGroup.id) || null,
      member: member ? { userId: member.userId || null, groupId: member.groupId || null, role: member.role || null, approvedAt: member.approvedAt || null } : null,
    }
  } catch { return null }
}

const looksLikeAuthPage = url => /\/(login|sign-?in|signup|sign-?up|auth)(\/|\?|$)/i.test(url.pathname)

function resultFor(state, lastUrl) {
  const m = state.member
  const isMember = !!(m && m.groupId && m.groupId === state.groupId && m.approvedAt)
  return isMember
    ? { state: 'member', member: m, details: `Membership confirmed at ${lastUrl} (role: ${m.role || 'member'}).`, url: lastUrl }
    : { state: 'not-member', member: null, details: 'You are logged in to Skool, but this account is not a member of the How I community.', url: lastUrl }
}

// First attempt, with no window at all: Skool is loaded in a hidden browser target (it has no tab
// and no window) and the page state is read over the browser's CDP socket. If the person is not
// logged in (or the page cannot be read) the caller opens a visible window instead.
async function readHidden(handle) {
  const session = await handle.browser.newBrowserCDPSession()
  let targetId = null
  let ws = null
  try {
    ;({ targetId } = await session.send('Target.createTarget', { url: TARGET, hidden: true, background: true }))
    ws = new WebSocket(`ws://127.0.0.1:${handle.port}/devtools/page/${targetId}`)
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('Could not reach the hidden page.')) })
    let id = 0
    const waiting = new Map()
    ws.onmessage = event => {
      const message = JSON.parse(event.data)
      if (message.id && waiting.has(message.id)) { waiting.get(message.id)(message); waiting.delete(message.id) }
    }
    const call = (method, params) => new Promise(resolve => { const n = ++id; waiting.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params })) })
    const expression = `JSON.stringify((${readSkoolState.toString()})())`
    for (let i = 0; i < 30; i++) {
      const reply = await call('Runtime.evaluate', { expression, returnByValue: true })
      const value = reply.result && reply.result.result && reply.result.result.value
      if (value && value !== 'null') return JSON.parse(value)
      await sleep(500)
    }
    return null
  } finally {
    try { ws?.close() } catch {}
    if (targetId) await session.send('Target.closeTarget', { targetId }).catch(() => {})
    await session.detach().catch(() => {})
  }
}

/**
 * Opens a browser on Skool and resolves when the membership is known.
 * onPhase('opening-browser' | 'checking' | 'waiting-login') lets the UI update.
 * Resolves { state, member, details, url } where state is one of
 * 'member' | 'not-member' | 'closed' | 'timeout'. Throws on setup errors.
 */
export function verifySkool({ onPhase = () => {}, appUrl = null } = {}) {
  if (running) return running
  running = (async () => {
    onPhase('opening-browser')
    // The Maybee window itself is the browser (lib/browser.js); Skool gets one extra window in it.
    const handle = await ensureBrowser(appUrl)
    onPhase('checking')
    let quick = null
    try { quick = await readHidden(handle) } catch {}
    if (quick && quick.loggedIn && quick.pathname.startsWith(GROUP_PATH)) return resultFor(quick, TARGET_URL.origin + quick.pathname)

    // Not logged in (or unreadable): show one window on Skool so the person can log in.
    const context = handle.browser.contexts()[0]
    const page = await context.newPage()
    try {
      await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
      const deadline = Date.now() + TIMEOUT_MS
      let phase = 'checking'
      let lastUrl = ''
      let lastNavigated = ''
      while (Date.now() < deadline) {
        if (page.isClosed() || !handle.browser.isConnected() || handle.proc.exitCode !== null) {
          return { state: 'closed', member: null, details: 'The verification window was closed before the membership was confirmed.', url: lastUrl }
        }
        let current
        try { current = new URL(page.url()) } catch { current = null }
        const state = await page.evaluate(readSkoolState).catch(() => null)
        if (current) lastUrl = current.origin + current.pathname

        if (state && !state.loggedIn) {
          if (phase !== 'waiting-login') { phase = 'waiting-login'; onPhase(phase) }
          // Skool's login is a client-side navigation, so __NEXT_DATA__ stays stale until
          // a full load: after a login redirect back to skool.com, reload the target once.
          const onSkool = current && /(^|\.)skool\.com$/i.test(current.hostname)
          if (onSkool && !looksLikeAuthPage(current) && lastNavigated !== page.url() && page.url() !== TARGET) {
            lastNavigated = page.url()
            await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
          }
        } else if (state && state.loggedIn) {
          if (!state.pathname.startsWith(GROUP_PATH)) {
            await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
          } else {
            return resultFor(state, lastUrl)
          }
        }
        await sleep(POLL_MS)
      }
      return { state: 'timeout', member: null, details: 'Verification timed out before the membership was confirmed.', url: lastUrl }
    } finally {
      // Only the Skool window closes; the Maybee window stays.
      await page.close().catch(() => {})
    }
  })()
  return running.finally(() => { running = null })
}

export function verifierProfile() { return PROFILE }

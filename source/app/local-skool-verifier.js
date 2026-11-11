// Local-only Skool membership check.
// The browser profile and its cookies never leave this machine.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = path.dirname(fileURLToPath(import.meta.url))
const PROFILE = path.join(APP_DIR, 'data', 'skool-profile')
const TARGET = process.env.MAYBEE_SKOOL_URL || 'https://www.skool.com/how-i-9301/about'
const COMMUNITY_MARKER = process.env.MAYBEE_SKOOL_MEMBER_MARKER || 'How I Accountability Club'
const BROWSER_EXECUTABLE = process.env.MAYBEE_BROWSER_EXECUTABLE || null
let running = null
let context = null
let verifierPage = null

async function ensureContext(chromium) {
  if (context) {
    try {
      const pages = context.pages()
      if (pages.length || context.browser()?.isConnected?.() !== false) return context
    } catch {
      // The user closed the verifier window; discard the stale Playwright object.
      context = null
      verifierPage = null
    }
  }
  const launchOptions = {
    headless: false,
    chromiumSandbox: true,
    viewport: { width: 1280, height: 900 },
  }
  // Prefer Playwright's own Chromium. A system Chrome profile can be blocked
  // by macOS Crashpad/TCC when launched with a persistent automation profile.
  if (BROWSER_EXECUTABLE && fs.existsSync(BROWSER_EXECUTABLE)) launchOptions.executablePath = BROWSER_EXECUTABLE
  context = await chromium.launchPersistentContext(PROFILE, launchOptions)
  context.on('close', () => { context = null; verifierPage = null })
  return context
}

async function ensureVerifierPage(chromium) {
  await ensureContext(chromium)
  if (verifierPage) {
    try {
      if (!verifierPage.isClosed()) return verifierPage
    } catch {
      verifierPage = null
    }
  }
  verifierPage = context.pages()[0] || await context.newPage()
  verifierPage.once('close', () => { verifierPage = null })
  return verifierPage
}

async function loadPlaywright() {
  const candidates = [
    process.env.MAYBEE_PLAYWRIGHT_MODULE,
    path.join(APP_DIR, 'node_modules', 'playwright', 'index.mjs'),
    '/home/adalbueno/.local/share/mise/installs/playwright/latest/node_modules/playwright/index.mjs',
  ].filter(Boolean)
  let lastError = null
  for (const modulePath of candidates) {
    try { return await import(modulePath) } catch (error) { lastError = error }
  }
  throw new Error(`Playwright is not available locally. Install it in the Maybee package or set MAYBEE_PLAYWRIGHT_MODULE. (${lastError?.message || 'module not found'})`)
}

export async function verifySkool() {
  if (running) return running
  running = (async () => {
    const { chromium } = await loadPlaywright()
    const page = await ensureVerifierPage(chromium)
    await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(1500)
    const url = page.url()
    const body = (await page.locator('body').innerText().catch(() => '')).slice(0, 50000)
    const texts = await page.locator('button, a').allTextContents().catch(() => [])
    const labels = texts.map(text => text.trim().replace(/\s+/g, ' ').toUpperCase()).filter(Boolean)
    const loginPage = /\/login|\/sign-in|\/auth\//i.test(url) || labels.some(label => /^(LOG IN|SIGN IN|CREATE ACCOUNT)$/.test(label))
    const communityVisible = body.includes(COMMUNITY_MARKER) || body.includes('How I Accountability Club')
    const joined = labels.includes('JOIN GROUP') || labels.includes('JOIN COMMUNITY')
    const memberMarker = labels.includes('SETTINGS') || labels.includes('LEAVE GROUP') || labels.includes('CLASSROOM')
    const member = communityVisible && !loginPage && !joined && memberMarker
    return {
      member,
      url,
      details: member
        ? `Playwright opened ${url} and found the member controls for How I; the verifier window remains open.`
        : `Playwright opened ${url || TARGET}, but found ${joined ? 'JOIN GROUP' : loginPage ? 'a login state' : 'no reliable member control'}. Log in once in the verifier browser if needed.`,
    }
  })()
  try { return await running } finally { running = null }
}

export function verifierProfile() { return PROFILE }

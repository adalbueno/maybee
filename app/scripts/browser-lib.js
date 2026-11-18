// What an agent's browser script imports (the path arrives in MAYBEE_BROWSER_LIB when it is started by browser.js).
// It opens a NEW window in Maybee's own browser and gives back a Playwright page for it. The Maybee app window is
// never handed out: the script works only in the window it opened.
import { chromium } from 'playwright-core'

export const endpoint = process.env.MAYBEE_BROWSER

const sleep = ms => new Promise(r => setTimeout(r, ms))

export async function newWindowPage(url = 'about:blank') {
  if (!endpoint) throw new Error('Run this script with browser.js run <script>, which sets MAYBEE_BROWSER.')
  const browser = await chromium.connectOverCDP(endpoint)
  const context = browser.contexts()[0]
  const before = new Set(context.pages())
  const cdp = await browser.newBrowserCDPSession()
  await cdp.send('Target.createTarget', { url: 'about:blank', newWindow: true })
  let page = null
  for (let i = 0; i < 40 && !page; i++) {
    page = context.pages().find(p => !before.has(p)) || null
    if (!page) await sleep(100)
  }
  if (!page) throw new Error('The new browser window did not open.')
  if (url !== 'about:blank') await page.goto(url)
  // close() shuts only the window this script opened and lets go of the connection; the browser and the app keep running.
  return { page, close: async () => { await page.close().catch(() => {}); await browser.close().catch(() => {}) } }
}

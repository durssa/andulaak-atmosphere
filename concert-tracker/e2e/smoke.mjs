/**
 * End-to-end smoke test: builds nothing, serves ./dist with `vite preview`, drives the app in headless
 * Chromium with all third-party APIs mocked, and fails on any page error or broken flow.
 * Run: npm run build && npm run test:e2e
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { tmEvent, tmResponse, bitEvent, bitArtist, nominatimBerlin } from '../src/__tests__/fixtures.js'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, 'output')
mkdirSync(outDir, { recursive: true })
const PORT = 4173
const BASE = `http://127.0.0.1:${PORT}/`

function findChromium() {
  const candidates = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium/chrome-linux/chrome']
  try { for (const d of readdirSync('/opt/pw-browsers')) if (d.startsWith('chromium-')) candidates.push(`/opt/pw-browsers/${d}/chrome-linux/chrome`) } catch { /* no bundled browsers dir */ }
  return candidates.find((c) => c && existsSync(c))
}

async function waitFor(url, ms = 20000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(url); if (r.ok) return } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`Server at ${url} did not start`)
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: resolve(here, '..'), stdio: 'ignore' })
const fail = (msg) => { console.error(`\n✖ ${msg}`); process.exitCode = 1 }
let browser, page
try {
  await waitFor(BASE)
  const exe = findChromium()
  browser = await chromium.launch(exe ? { executablePath: exe } : {})
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'en-GB', timezoneId: 'Europe/London' })
  page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/net::|Failed to load resource|ERR_/.test(m.text())) errors.push(`console: ${m.text()}`) })

  // ── Mocks ────────────────────────────────────────────────────────────
  const calls = { tm: 0, bit: 0, nominatim: 0 }
  await page.route(/basemaps\.cartocdn\.com|fonts\.g(oogleapis|static)\.com|img\//, (r) => r.abort())
  await page.route(/app\.ticketmaster\.com\/discovery\/v2\/events\.json/, (r) => {
    calls.tm++
    const u = new URL(r.request().url())
    if (u.searchParams.get('apikey') !== 'test-key') return r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ fault: { faultstring: 'Invalid ApiKey' } }) })
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(tmResponse([tmEvent])) })
  })
  await page.route(/rest\.bandsintown\.com\/artists\/[^/?]+\/events/, (r) => { calls.bit++; r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([bitEvent]) }) })
  await page.route(/rest\.bandsintown\.com\/artists\/[^/?]+\?/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(bitArtist) }))
  await page.route(/nominatim\.openstreetmap\.org\/search/, (r) => { calls.nominatim++; r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(nominatimBerlin) }) })

  // ── 1. Home renders ───────────────────────────────────────────────────
  await page.goto(BASE)
  await page.getByRole('heading', { level: 1 }).waitFor()
  if (!(await page.locator('.brand').innerText()).includes('Encore')) fail('brand missing')
  if (!(await page.getByText('No upcoming shows tracked').isVisible())) fail('empty next-up state missing')
  await page.screenshot({ path: `${outDir}/01-home-empty.png` })

  // ── 2. Artist search works with no key (Bandsintown) ───────────────────
  await page.getByRole('button', { name: 'Discover' }).click()
  await page.fill('#q', 'Radiohead')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.locator('[data-testid="event-card"]').first().waitFor({ timeout: 10000 })
  let cards = await page.locator('[data-testid="event-card"]').count()
  if (cards !== 1) fail(`expected 1 card from Bandsintown, got ${cards}`)
  if (!(await page.locator('.badge.bit').first().isVisible())) fail('Bandsintown badge missing')
  if (calls.tm !== 0) fail('Ticketmaster was called without a key')
  await page.locator('.enc-marker').first().waitFor()
  await page.screenshot({ path: `${outDir}/02-discover-nokey.png` })

  // ── 3. Add a Ticketmaster key in Settings ──────────────────────────────
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.fill('#tmKey', 'test-key')
  await page.getByRole('button', { name: 'Test connection' }).click()
  await page.getByText(/Connected —/).waitFor()
  if (!(await page.locator('.header-right .pill.on').first().isVisible())) fail('Ticketmaster pill not green after key')
  await page.screenshot({ path: `${outDir}/03-settings.png` })

  // ── 4. Location search via Nominatim + Ticketmaster, dedupe with Bandsintown ──
  await page.getByRole('button', { name: 'Discover' }).click()
  await page.fill('#q', 'Radiohead')
  await page.fill('#loc', 'Berlin')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.locator('[data-testid="event-card"]').first().waitFor()
  await page.waitForTimeout(400)
  cards = await page.locator('[data-testid="event-card"]').count()
  if (cards !== 1) fail(`expected 1 deduped card, got ${cards}`)
  if (!(await page.locator('.badge.tm').first().isVisible())) fail('Ticketmaster badge missing after key')
  if (calls.nominatim < 1) fail('geocoder not called')
  if (!(await page.getByText(/near Berlin/).isVisible())) fail('origin label missing')
  if (!(await page.getByText(/GBP 65–120/).isVisible())) fail('price badge missing')
  await page.screenshot({ path: `${outDir}/04-discover-results.png` })

  // ── 5. Track the event ────────────────────────────────────────────────
  await page.locator('[data-testid="track-btn"]').first().click()
  await page.getByRole('menuitem', { name: /Going/ }).click()
  await page.getByText(/You're going to Radiohead/).waitFor()
  if (!(await page.locator('.event-card .badge.pink').first().isVisible())) fail('status badge missing after tracking')
  if ((await page.locator('.nav .badge').innerText()) !== '1') fail('nav badge count wrong')
  if (!(await page.locator('.enc-marker.tracked').first().isVisible())) fail('tracked marker colour missing')

  // ── 6. My Concerts: note + calendar ───────────────────────────────────
  await page.getByRole('button', { name: /My Concerts/ }).click()
  await page.locator('[data-testid="tracked-list"] [data-testid="event-card"]').first().waitFor()
  await page.getByRole('button', { name: '+ Add a note' }).click()
  await page.locator('.notes-box textarea').fill('Standing, with Sam')
  await page.locator('.notes-box textarea').blur()
  await page.getByText('Standing, with Sam').waitFor()
  const dl = page.waitForEvent('download', { timeout: 5000 })
  await page.getByRole('button', { name: /Export upcoming/ }).click()
  const file = await dl
  if (!/\.ics$/.test(file.suggestedFilename())) fail('ics export filename wrong')
  await page.screenshot({ path: `${outDir}/05-my-concerts.png` })

  // ── 7. Follow an artist ───────────────────────────────────────────────
  await page.getByRole('button', { name: 'Artists' }).click()
  await page.fill('#artist', 'Radiohead')
  await page.getByRole('button', { name: 'Follow', exact: true }).click()
  await page.locator('[data-testid="artist-card"]').waitFor()
  await page.getByText(/1 upcoming show/).waitFor({ timeout: 10000 })
  await page.screenshot({ path: `${outDir}/06-artists.png` })

  // ── 8. Home shows countdown + stats and survives reload ───────────────
  await page.getByRole('button', { name: 'Home' }).click()
  await page.getByTestId('next-up').getByText('Radiohead').waitFor()
  if (!(await page.locator('.countdown').isVisible())) fail('countdown missing')
  await page.reload()
  await page.getByTestId('next-up').getByText('Radiohead').waitFor()
  if ((await page.locator('.nav .badge').innerText()) !== '1') fail('tracked state did not persist across reload')
  await page.screenshot({ path: `${outDir}/07-home.png` })

  // ── 9. Mobile layout ───────────────────────────────────────────────────
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${BASE}#/discover`)
  await page.locator('[data-testid="results"]').waitFor()
  const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  if (hasHScroll) fail('horizontal overflow on mobile')
  await page.screenshot({ path: `${outDir}/08-mobile-discover.png`, fullPage: false })
  await page.goto(`${BASE}#/home`)
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${outDir}/09-mobile-home.png`, fullPage: true })

  if (errors.length) fail(`page errors:\n  ${errors.join('\n  ')}`)
  console.log(process.exitCode ? '\nSmoke test FAILED' : `\n✔ Smoke test passed (${calls.tm} Ticketmaster, ${calls.bit} Bandsintown, ${calls.nominatim} geocoder calls mocked)`)
} catch (e) {
  fail(e.stack || String(e))
  try { await page?.screenshot({ path: `${outDir}/failure.png` }); console.error(await page?.evaluate(() => document.querySelector('main')?.innerText.slice(0, 1500))) } catch { /* ignore */ }
} finally {
  await browser?.close()
  server.kill()
}

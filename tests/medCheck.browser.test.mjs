// "Did you take your meds?" in the real app, and Insights → Places.
//
// A daily 8:00 med with no answer: opening Bloom at 9:00 asks about
// yesterday's dose, then today's. "Yes" ticks it; "No" → "Taking them now"
// ticks it with the time; "No" → "Skip meds" marks it skipped without the
// how-are-you sheet. Answered doses aren't asked again.

import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
const DIST = fileURLToPath(new URL('../dist', import.meta.url)).replace(/\/$/, ''), BASE = '/vivian-hub/'
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (!p.startsWith(BASE)) { res.writeHead(404); res.end(); return }
  p = p.slice(BASE.length) || 'index.html'; const file = normalize(join(DIST, p))
  if (!existsSync(file) || !extname(file)) { res.writeHead(200, {'Content-Type':'text/html'}); res.end(readFileSync(join(DIST,'index.html'))); return }
  res.writeHead(200, {'Content-Type': TYPES[extname(file)] || 'application/octet-stream'}); res.end(readFileSync(file))
})
await new Promise(r => server.listen(4197, r))
const browser = await chromium.launch()
let pass = 0, fail = 0
const ok = (n, c, x='') => { if (c) { pass++; console.log('  ok  ', n) } else { fail++; console.log('  FAIL', n, x) } }

async function open(width = 430) {
  const ctx = await browser.newContext({ viewport:{ width, height:900 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(2026, 10, 6, 9, 0) })
  await page.goto(`http://localhost:4197${BASE}`, { waitUntil:'networkidle' })
  await page.evaluate(() => {
    const set = (k, v) => localStorage.setItem('vivian_' + k, JSON.stringify(v))
    set('commitments', []); set('commitment_meta', {}); set('recurring_exceptions', {})
    set('recurring_tasks_v2', [{ id:'r-med', label:'08:00 — Morning meds', days:[], startDate:'2026-11-01' }])
    set('recurring_meta', { 'r-med': { freq:'daily' } })
    set('med_tasks', { 'r-med': true })
    set('completions', {}); set('day_notes', {})
  })
  await page.reload({ waitUntil:'networkidle' }); await page.waitForTimeout(1200)
  return { ctx, page }
}
const read = (page, k) => page.evaluate((k) => JSON.parse(localStorage.getItem('vivian_' + k) || 'null'), k)
const sheet = (page) => page.getByTestId('med-check-sheet')

console.log('\n— yes, and taking them now —')
{
  const { ctx, page } = await open()
  ok('asks about yesterday first', await sheet(page).isVisible() && /Yesterday at 8:00/i.test(await sheet(page).innerText()), await sheet(page).innerText().catch(() => ''))
  ok('and says there are two', /1 of 2/i.test(await sheet(page).innerText()))
  await page.getByTestId('med-took').click(); await page.waitForTimeout(300)
  ok('then today', /Today at 8:00/i.test(await sheet(page).innerText()))
  await page.getByTestId('med-not').click()
  await page.getByTestId('med-now').click(); await page.waitForTimeout(500)
  ok('the sheet goes away', !(await sheet(page).isVisible()))
  const done = await read(page, 'completions')
  ok('both doses are ticked', done['2026-11-05_r-med'] === true && done['2026-11-06_r-med'] === true, JSON.stringify(done))
  const notes = await read(page, 'day_notes')
  ok('taking them now notes the time', !!notes?.['2026-11-06_r-med']?.takenAt, JSON.stringify(notes))
  await page.reload({ waitUntil:'networkidle' }); await page.waitForTimeout(1200)
  ok('answered doses are not asked again', !(await sheet(page).isVisible()))
  await ctx.close()
}

console.log('\n— skip —')
{
  const { ctx, page } = await open()
  await page.getByTestId('med-took').click(); await page.waitForTimeout(300)
  await page.getByTestId('med-not').click()
  await page.getByTestId('med-skip').click(); await page.waitForTimeout(500)
  const done = await read(page, 'completions')
  ok('a skipped dose is recorded as not taken', done['2026-11-06_r-med'] === false, JSON.stringify(done))
  ok('and marked skipped', (await read(page, 'day_notes'))?.['2026-11-06_r-med']?.skipped === true)
  ok('no second "how are you" sheet', !(await page.getByTestId('med-skip-sheet').isVisible()))
  ok('nothing left to ask', !(await sheet(page).isVisible()))
  await ctx.close()
}

console.log('\n— ask me later —')
{
  const { ctx, page } = await open()
  await page.getByTestId('med-later').click(); await page.waitForTimeout(300)
  ok('moves on to the next dose', /Today at 8:00/i.test(await sheet(page).innerText()))
  await page.getByTestId('med-later').click(); await page.waitForTimeout(300)
  ok('then leaves you be', !(await sheet(page).isVisible()))
  await page.clock.runFor(61 * 60 * 1000); await page.waitForTimeout(500)
  ok('and asks again an hour later', await sheet(page).isVisible())
  await ctx.close()
}

console.log('\n— Insights → Places —')
{
  const { ctx, page } = await open(375)
  await page.getByTestId('med-later').click(); await page.getByTestId('med-later').click()
  await page.locator('.nav-btn', { hasText: 'Insights' }).first().dispatchEvent('click'); await page.waitForTimeout(500)
  await page.locator('button:visible', { hasText: /^Places$/ }).first().click(); await page.waitForTimeout(400)
  ok('the Places view opens', await page.getByTestId('places-empty').isVisible())
  ok('the top tile names where you spent time', await page.getByText('Most time at').isVisible())
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  ok('no sideways scroll at phone width', wide <= 0, `${wide}px`)
  await page.screenshot({ path: process.env.SHOT || '/dev/null', fullPage: false }).catch(() => {})
  await ctx.close()
}

console.log(`\n${pass} passed, ${fail} failed`)
await browser.close(); server.close()
process.exit(fail ? 1 : 0)

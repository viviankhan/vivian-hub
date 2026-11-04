// The add sheet's button names the day the task will land on: "Add to today",
// "Add to tomorrow", a weekday later this week, month/day in another month,
// month/day/year in another year.
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

// Opens the app at `now`, taps day `dayKey` on the week strip (or stays on
// today), opens the + sheet, and returns its bottom button's text.
async function buttonFor(now, dayKey) {
  const ctx = await browser.newContext({ viewport:{width:430,height:900}, serviceWorkers:'block' })
  const page = await ctx.newPage()
  await page.clock.install({ time: now })
  await page.goto(`http://localhost:4197${BASE}`, { waitUntil:'networkidle' })
  await page.evaluate(() => { localStorage.setItem('vivian_commitments', '[]'); localStorage.setItem('vivian_recurring_tasks_v2', '[]') })
  await page.reload({ waitUntil:'networkidle' }); await page.waitForTimeout(600)
  if (dayKey) {
    await page.locator(`[data-daykey="${dayKey}"]`).evaluate(el => el.click())
    await page.waitForTimeout(300)
  }
  await page.locator('.today-fab').click(); await page.waitForTimeout(300)
  await page.locator('input[placeholder="What\'s happening?"]').fill('Test')
  const txt = (await page.getByRole('button', { name:/^Add to / }).last().textContent()).trim()
  await ctx.close()
  return txt
}

const wed = new Date(2026, 10, 4, 9, 0)          // Wed 4 Nov 2026
let t
t = await buttonFor(wed, null);  ok('today', t === 'Add to today', t)
t = await buttonFor(wed, '2026-11-05');     ok('tomorrow', t === 'Add to tomorrow', t)
t = await buttonFor(wed, '2026-11-07');     ok('later this week, same month → weekday', t === 'Add to Saturday', t)
t = await buttonFor(wed, '2026-11-18');     ok('later this month → the date', t === 'Add to the 18th', t)
const endOct = new Date(2026, 9, 29, 9, 0)       // Thu 29 Oct 2026
t = await buttonFor(endOct, '2026-11-02');  ok('another month → month/day', t === 'Add to 11/2', t)
const endYear = new Date(2026, 11, 30, 9, 0)     // Wed 30 Dec 2026
t = await buttonFor(endYear, '2027-01-02'); ok('another year → month/day/year', t === 'Add to 1/2/2027', t)

console.log(`\n${pass} passed, ${fail} failed`)
await browser.close(); server.close()
process.exit(fail ? 1 : 0)

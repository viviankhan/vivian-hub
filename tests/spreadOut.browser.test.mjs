// Real-browser test of "Spread out": a Canvas feed piles a class's work onto
// one due date; one tap turns it into tasks spaced over the days before it,
// leaving other classes due that day alone.
import { chromium } from 'playwright'
import http from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spreadDates } from '../src/lib/importedTasks.js'

const DIST = fileURLToPath(new URL('../dist', import.meta.url)).replace(/\/$/, '')
const BASE = '/vivian-hub/'
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.webmanifest':'application/manifest+json' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0])
  if (!p.startsWith(BASE)) { res.writeHead(404); res.end(); return }
  p = p.slice(BASE.length) || 'index.html'
  const file = normalize(join(DIST, p))
  if (!file.startsWith(DIST) || !existsSync(file) || !extname(file)) {
    res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(readFileSync(join(DIST, 'index.html'))); return
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise(r => server.listen(4179, r))
const URL_ = `http://localhost:4179${BASE}`

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', g, '\n        want', w) }
}
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const plus = (n) => { const d = new Date(); d.setHours(12); d.setDate(d.getDate() + n); return d }
const today = ymd(plus(0)), due = ymd(plus(8))

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } })
// The feed URL is fake; the cached copy below is what the app shows.
await ctx.route('https://canvas.example.invalid/**', r => r.abort())
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e)))

console.log('\n— spread out a Canvas pile-up —')
await page.goto(URL_, { waitUntil: 'networkidle' })
await page.evaluate(({ due }) => {
  const ev = (uid, summary) => ({ uid, summary, startDate: due, endDate: due, allDay: false, startTime: '23:59', endTime: '23:59' })
  localStorage.setItem('vivian_external_calendars', JSON.stringify([
    { id: 'canvas', name: 'Canvas', url: 'https://canvas.example.invalid/feed.ics', color: '#C2410C', enabled: true },
  ]))
  localStorage.setItem('bloom_extcal_canvas', JSON.stringify({ fetchedAt: Date.now(), events: [
    ev('a1', 'Problem Set 6 [CHEM 2420 Organic Chemistry II]'),
    ev('a2', 'Lab Report 4 [CHEM 2420 Organic Chemistry II]'),
    ev('a3', 'Reading Quiz Ch 17 [CHEM 2420 Organic Chemistry II]'),
    ev('a4', 'Mechanism Worksheet [CHEM 2420 Organic Chemistry II]'),
    ev('b1', 'Essay Draft [ENGL 1020]'),
  ] }))
}, { due })
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(800)
await page.waitForSelector('#root > *')
await page.getByRole('button', { name: 'Calendar', exact: true }).first().click()
await page.waitForTimeout(300)

// Walk forward a month if the due date falls in the next one, then pick it.
if (due.slice(0, 7) !== today.slice(0, 7)) await page.locator('button', { hasText: '›' }).first().click()
await page.locator('.cal-cell').filter({ has: page.locator('.cal-day-num', { hasText: new RegExp(`^${Number(due.slice(8))}$`) }) }).first().click()
await page.waitForTimeout(200)

const bar = page.getByText('items are all due this day.')
eq('offers to spread the Orgo II pile, not the lone English essay', await bar.count(), 1)
eq('names the class and how many', (await bar.first().innerText()).trim(), '4 CHEM 2420 Organic Chemistry II items are all due this day.')

await page.getByRole('button', { name: 'Spread out' }).click()
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: true })
await page.getByRole('button', { name: 'Spread 4 tasks' }).click()
await page.waitForTimeout(400)

const commitments = await page.evaluate(() => JSON.parse(localStorage.getItem('vivian_commitments') || '[]'))
const mine = commitments.filter(c => /CHEM 2420/.test(c.text)).sort((a, b) => a.date.localeCompare(b.date))
eq('adopts all four as tasks of your own', mine.length, 4)
eq('each with its own id', new Set(mine.map(c => c.id)).size, 4)
eq('spaced from today through the due date, weekdays only', mine.map(c => c.date), spreadDates(today, due, 4, { weekdaysOnly: true }))
eq('nothing lands on a weekend', mine.some(c => [0, 6].includes(new Date(c.date + 'T12:00:00').getDay())), false)
eq('nothing lands before today', mine.every(c => c.date > today), true)
eq('the English essay is left alone', commitments.some(c => /ENGL/.test(c.text)), false)
const meta = await page.evaluate(() => JSON.parse(localStorage.getItem('vivian_commitment_meta') || '{}'))
eq('moved copies say when they are really due', /· due /.test((meta[mine[0].id] || {}).description || ''), true)
eq('the button goes away once they are spread', await bar.count(), 0)
eq('the Canvas originals stay on the due date, marked Added', await page.getByText('✓ Added').count(), 4)

eq('no page errors', errors, [])
console.log(`\n${pass} passed, ${fail} failed`)
await browser.close(); server.close()
process.exit(fail ? 1 : 0)

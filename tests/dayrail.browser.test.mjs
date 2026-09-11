// Real-browser test of the day-rail's time controls — the wheel picker inside
// the "when" rows and the marker detail card's span editor.
//
// The bug this guards against: those rows once wrapped TimeField (a composite —
// text input, pop-out wheel, buttons of its own) in a <label>. The browser
// forwards clicks inside a label to its control and focuses it on mousedown,
// which closed the wheel before a row could be picked — so a time chosen on the
// wheel silently came back empty, and saving wrote "still going" over a span
// the user had just set. Typing worked, which is why it went unnoticed.
//
// Sits alongside browser.test.mjs and serves the same built app; run all three
// with `npm run test:browser`.
import { chromium } from 'playwright'
import http from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

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
await new Promise(r => server.listen(4176, r))
const URL_ = `http://localhost:4176${BASE}`

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', g, '\n        want', w) }
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await browser.newContext({ viewport: { width: 430, height: 940 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource/i.test(m.text())) errors.push('console: ' + m.text()) })

const pad = n => String(n).padStart(2, '0')
const today = new Date()
const dayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
const at = (h, m = 0) => { const d = new Date(today); d.setHours(h, m, 0, 0); return d.toISOString() }

// One condition still running since 9:08am, and enough schedule for the
// timeline (and so the rail) to lay itself out.
await page.goto(URL_, { waitUntil: 'networkidle' })
await page.evaluate(({ eps, cs }) => {
  localStorage.setItem('vivian_wellness_episodes', JSON.stringify(eps))
  localStorage.setItem('vivian_commitments', JSON.stringify(cs))
  localStorage.setItem('bloom_rail_timed', '1')
}, {
  eps: [{ id: 'ep-live', effectId: 'fx-calm', start: at(9, 8), end: null, note: '', photos: [] }],
  cs: [
    { id: 'c1', text: 'Stats lecture', date: dayKey, cat: 'school', done: false, time: '10:00', durationMins: 90 },
    { id: 'c2', text: 'Lab write-up', date: dayKey, cat: 'school', done: false, time: '14:30', durationMins: 120 },
  ],
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.rail-fx', { timeout: 15000 })
await page.waitForTimeout(1500)

const storedEnd = () => page.evaluate(() =>
  (JSON.parse(localStorage.getItem('vivian_wellness_episodes') || '[]')[0] || {}).end || null)

// The end field of whichever time row is on screen, and its wheel.
const endField = () => page.locator('.rail-when-field').nth(1)
const endValue = () => endField().locator('input').inputValue()
const openWheel = async () => {
  await endField().locator('button[aria-label="Pick time"]').click()
  await page.waitForTimeout(300)
}
// Pick a time on the open wheel. The columns are hour / minute / meridiem, in
// that order. An empty field opens the wheel on the current time, so the minute
// is set explicitly rather than left wherever "now" happens to sit.
const pickOnWheel = async (hour, mer) => {
  const cols = endField().locator('div[style*="scroll-snap-type"]')
  await cols.nth(0).getByText(String(hour), { exact: true }).click()
  await page.waitForTimeout(200)
  await cols.nth(1).getByText('00', { exact: true }).click()
  await page.waitForTimeout(200)
  await cols.nth(2).getByText(mer, { exact: true }).click()
  await page.waitForTimeout(200)
}

console.log('\n— the detail card: closing a running condition from the wheel —')
await page.click('.rail-fx >> nth=0', { force: true })   // a live marker hovers, so never "stable"
await page.waitForTimeout(300)
await page.click('.rail-span-read')
await page.waitForTimeout(300)
eq('it opens on "still going"', await endValue(), '')

await openWheel()
await pickOnWheel(4, 'PM')
eq('the wheel fills the end field', await endValue(), '4:00 PM')
await endField().getByRole('button', { name: 'Done' }).click()
await page.waitForTimeout(200)
eq('and Done keeps it', await endValue(), '4:00 PM')

await page.getByRole('button', { name: 'Save times' }).click()
await page.waitForTimeout(600)
eq('the span is closed at 4pm', (await storedEnd() || '').slice(11, 16), new Date(at(16)).toISOString().slice(11, 16))

console.log('\n— and the same wheel, re-opened, moves it again —')
await page.click('.rail-span-read')
await page.waitForTimeout(300)
eq('the editor seeds from the saved end', await endValue(), '4:00 PM')
await openWheel()
await pickOnWheel(6, 'PM')
await endField().getByRole('button', { name: 'Done' }).click()
await page.waitForTimeout(200)
await page.getByRole('button', { name: 'Save times' }).click()
await page.waitForTimeout(600)
eq('moved to 6pm, not cleared', (await storedEnd() || '').slice(11, 16), new Date(at(18)).toISOString().slice(11, 16))

console.log('\n— "clear" still puts it back to still-going —')
await page.click('.rail-span-read')
await page.waitForTimeout(300)
await endField().getByRole('button', { name: 'clear' }).click()
await page.waitForTimeout(200)
eq('the field empties', await endValue(), '')
await page.getByRole('button', { name: 'Save times' }).click()
await page.waitForTimeout(600)
eq('and the span runs open again', await storedEnd(), null)

console.log('\n— the status sheet’s "when" row uses the same wheel —')
await page.keyboard.press('Escape')
await page.click('.rail-film', { position: { x: 380, y: 120 } })
await page.waitForTimeout(300)
await page.click('.rail-blob-btn')
await page.waitForTimeout(400)
await page.click('.rail-bub-lotus')
await page.waitForTimeout(300)
await page.click('.rail-fxpick >> nth=0')
await page.waitForTimeout(300)
await page.click('.rail-when-add')
await page.waitForTimeout(300)
await openWheel()
await pickOnWheel(8, 'PM')
eq('the sheet’s end field takes the wheel too', await endValue(), '8:00 PM')

eq('no uncaught errors', errors, [])

await browser.close()
server.close()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

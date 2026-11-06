// Where you were vs. what you planned, in the real app.
//
// It's 6 PM. The 1 PM Weyand lab meeting has a place (Mayo Clinic) and the
// open app saw you at home the whole hour → it goes to the inbox on its own.
// The 4 PM gym session has a place and Bloom saw nothing → "Did you do it?";
// "No" sends it to the inbox too. From the inbox, "Do today" puts the lab
// meeting on today, and "Done" ticks the gym session where it was.
// A 9 AM clinic shift with no place, seen at Mayo the last two mornings, is
// offered Mayo as its place.

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
await new Promise(r => server.listen(4196, r))
const browser = await chromium.launch()
let pass = 0, fail = 0
const ok = (n, c, x='') => { if (c) { pass++; console.log('  ok  ', n) } else { fail++; console.log('  FAIL', n, x) } }

const ctx = await browser.newContext({ viewport:{ width:390, height:844 }, deviceScaleFactor: 2, serviceWorkers: 'block' })
// No geocoder in tests: every address lookup comes back empty.
await ctx.route('https://nominatim.openstreetmap.org/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
const page = await ctx.newPage()
await page.clock.install({ time: new Date(2026, 10, 6, 18, 0) })
await page.goto(`http://localhost:4196${BASE}`, { waitUntil:'networkidle' })
await page.evaluate(() => {
  const set = (k, v) => localStorage.setItem('vivian_' + k, JSON.stringify(v))
  const t = (d, h, m = 0) => new Date(2026, 10, d, h, m).getTime()
  const MAYO = { name: 'Mayo Clinic', lat: 44.0225, lng: -92.4668 }
  const HOME = { name: 'Home', lat: 44.0488, lng: -92.4927 }
  const GYM = { name: 'Gym', lat: 44.0300, lng: -92.4800 }
  set('commitments', []); set('commitment_meta', {}); set('recurring_exceptions', {}); set('completions', {})
  set('recurring_tasks_v2', [
    { id: 'r-lab', label: '13:00 — Weyand lab meeting', days: [], startDate: '2026-11-01' },
    { id: 'r-gym', label: '16:00 — Gym session', days: [], startDate: '2026-11-01' },
    { id: 'r-shift', label: '09:00 — Clinic shift', days: [], startDate: '2026-11-01' },
  ])
  set('recurring_meta', {
    'r-lab': { freq: 'daily', durationMins: 60, location: { ...MAYO, radius: null, autoStart: false } },
    'r-gym': { freq: 'daily', durationMins: 60, location: { ...GYM, radius: null, autoStart: false } },
    'r-shift': { freq: 'daily', durationMins: 120 },
  })
  localStorage.setItem('bloom_saved_places', JSON.stringify([{ id: 'p1', ...MAYO }, { id: 'p2', ...HOME }]))
  // Yesterday the lab meeting and gym happened where they should (no reviews
  // left from yesterday); the last two mornings at Mayo; today home from noon.
  localStorage.setItem('bloom_visits', JSON.stringify([
    { id: 'a', ...MAYO, start: t(4, 8, 30), end: t(4, 11, 30), fixes: 4 },
    { id: 'b', ...MAYO, start: t(5, 8, 30), end: t(5, 14, 30), fixes: 4 },
    { id: 'c', ...GYM, start: t(5, 16, 0), end: t(5, 17, 0), fixes: 4 },
    { id: 'd', ...HOME, start: t(6, 12, 0), end: t(6, 14, 30), fixes: 6 },
  ]))
})
await page.reload({ waitUntil:'networkidle' }); await page.waitForTimeout(1800)

console.log('\n— seen at home during the lab meeting → inbox —')
const inbox = page.getByTestId('inbox-card')
ok('the inbox shows the lab meeting', await inbox.isVisible() && /Weyand lab meeting/.test(await inbox.innerText()), await inbox.innerText().catch(() => ''))
ok('and says where you were', /you were at Home/.test(await inbox.innerText()))
ok('it is off today’s schedule', (await page.evaluate(() => JSON.parse(localStorage.getItem('vivian_recurring_exceptions') || '{}')))['r-lab:2026-11-06'] === true
  || Object.keys(await page.evaluate(() => JSON.parse(localStorage.getItem('vivian_recurring_exceptions') || '{}'))).some(k => k.includes('r-lab')),
  await page.evaluate(() => localStorage.getItem('vivian_recurring_exceptions')))

console.log('\n— no sighting for the gym → asked —')
const sheet = page.getByTestId('did-you-do-sheet')
ok('"Did you do Gym session?"', await sheet.isVisible() && /Did you do Gym session\?/.test(await sheet.innerText()), await sheet.innerText().catch(() => ''))
await page.getByTestId('did-no').click(); await page.waitForTimeout(600)
ok('no → it joins the inbox', (await page.getByTestId('inbox-item').count()) === 2)
ok('the sheet is gone', !(await sheet.isVisible()))

console.log('\n— location status —')
ok('shows where you were last seen', /Home/.test(await page.getByTestId('location-now').innerText()), await page.getByTestId('location-now').innerText().catch(() => ''))
await page.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/location-today.png' : '/dev/null' }).catch(() => {})

console.log('\n— a place, suggested —')
const sug = page.getByTestId('place-suggestion')
ok('clinic shift → Mayo Clinic?', await sug.isVisible() && /Clinic shift/.test(await sug.innerText()) && /Mayo Clinic/.test(await sug.innerText()), await sug.innerText().catch(() => ''))
await sug.getByRole('button', { name: 'Add place' }).click(); await page.waitForTimeout(500)
const meta = await page.evaluate(() => JSON.parse(localStorage.getItem('vivian_recurring_meta') || '{}'))
ok('the shift now has Mayo as its place', meta['r-shift']?.location?.name === 'Mayo Clinic', JSON.stringify(meta['r-shift']))
ok('and keeps its duration', meta['r-shift']?.durationMins === 120)

console.log('\n— from the inbox —')
const item = (title) => page.getByTestId('inbox-item').filter({ hasText: title })
await item('Weyand lab meeting').getByTestId('inbox-today').click(); await page.waitForTimeout(600)
const commits = await page.evaluate(() => JSON.parse(localStorage.getItem('vivian_commitments') || '[]'))
ok('do today → a task for today', commits.some(c => c.text === 'Weyand lab meeting' && c.date === '2026-11-06'), JSON.stringify(commits))
await item('Gym session').getByTestId('inbox-done').click(); await page.waitForTimeout(600)
const done = await page.evaluate(() => JSON.parse(localStorage.getItem('vivian_completions') || '{}'))
ok('done → ticked on its own day', done['2026-11-06_r-gym'] === true, JSON.stringify(done))
const exc = await page.evaluate(() => JSON.parse(localStorage.getItem('vivian_recurring_exceptions') || '{}'))
ok('and back on that day', !Object.keys(exc).some(k => k.includes('r-gym')), JSON.stringify(exc))
ok('the inbox is empty', !(await page.getByTestId('inbox-card').isVisible()))

console.log('\n— nothing asked twice —')
await page.reload({ waitUntil:'networkidle' }); await page.waitForTimeout(1500)
ok('no sheet after a reload', !(await page.getByTestId('did-you-do-sheet').isVisible()))
ok('no inbox after a reload', !(await page.getByTestId('inbox-card').isVisible()))
const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
ok('no sideways scroll', wide <= 0, `${wide}px`)

console.log(`\n${pass} passed, ${fail} failed`)
await browser.close(); server.close()
process.exit(fail ? 1 : 0)

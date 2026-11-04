// A repeating task moved for just today (a shift, or an earlier one-day edit)
// still takes a series-wide time change.
//
// "Check email" repeats daily at 10:00 but was nudged to 10:25 today. Editing it
// to 9:45 and choosing "Apply to all events" used to update the series and leave
// today's 10:25 move in place — so on the timeline it looked like the time
// simply wouldn't change.
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
await new Promise(r => server.listen(4195, r))
const browser = await chromium.launch()
let pass = 0, fail = 0
const ok = (n, c, x='') => { if (c) { pass++; console.log('  ok  ', n) } else { fail++; console.log('  FAIL', n, x) } }
const DAY = '2026-11-04', TOMORROW = '2026-11-05'

async function run(edit) {
  const ctx = await browser.newContext({ viewport:{width:430,height:900}, serviceWorkers:'block' })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(2026, 10, 4, 8, 58) })
  await page.goto(`http://localhost:4195${BASE}`, { waitUntil:'networkidle' })
  await page.evaluate(([DAY, TOMORROW]) => {
    const set = (k, v) => localStorage.setItem('vivian_' + k, JSON.stringify(v))
    set('commitments', []); set('commitment_meta', {}); set('recurring_exceptions', {}); set('completions', {})
    set('recurring_tasks_v2', [{ id:'r-email', label:'10:00 — Check email', days:[], startDate:null }])
    set('recurring_meta', { 'r-email': { freq:'daily', durationMins:15 } })
    localStorage.setItem('vivian_timeshift_' + DAY, JSON.stringify({ 'r-email': 10 * 60 + 25 }))
    localStorage.setItem('vivian_timeshift_' + TOMORROW, JSON.stringify({ 'r-email': 11 * 60 }))
  }, [DAY, TOMORROW])
  await page.reload({ waitUntil:'networkidle' }); await page.waitForTimeout(800)
  await page.getByText('Check email', { exact:true }).first().click()
  await page.waitForTimeout(300)
  await edit(page)
  await page.getByRole('button', { name:'Save changes' }).click()
  await page.waitForTimeout(200)
  await page.getByRole('button', { name:'Apply to all events' }).click()
  await page.waitForTimeout(500)
  const out = await page.evaluate(([DAY, TOMORROW]) => ({
    body: document.body.innerText,
    series: JSON.parse(localStorage.getItem('vivian_recurring_tasks_v2'))[0].label,
    today: JSON.parse(localStorage.getItem('vivian_timeshift_' + DAY) || '{}'),
    tomorrow: JSON.parse(localStorage.getItem('vivian_timeshift_' + TOMORROW) || '{}'),
  }), [DAY, TOMORROW])
  await ctx.close()
  return out
}

console.log('— change the time, apply to all events —')
const a = await run(async page => {
  // Opens on the time the timeline shows today, not the series' usual one.
  await page.getByText(/^10:25 AM\s*[–-]\s*10:40 AM$/).last().click()
  await page.waitForTimeout(200)
  const f = page.locator('input[placeholder="e.g. 9:30 AM"]').first()
  await f.fill('9:45 AM'); await f.press('Tab')
})
ok('the series moves to 9:45', /^0?9:45/.test(a.series), a.series)
ok("today's old 10:25 move is dropped", a.today['r-email'] === undefined, JSON.stringify(a.today))
ok("and a later day's move too", a.tomorrow['r-email'] === undefined, JSON.stringify(a.tomorrow))
ok('the timeline shows 9:45', /9:45\s*[–-]\s*10:00 AM/.test(a.body), (a.body.match(/.*Check email.*\n?.*/)||[''])[0])

console.log('— rename only, apply to all events —')
const b = await run(async page => {
  const f = page.locator('input[placeholder="What\'s happening?"]')
  await f.fill('Check inbox')
})
ok("the series keeps its own 10:00 (today's move doesn't leak into it)", /^10:00/.test(b.series), b.series)
ok("today's 10:25 move stays", b.today['r-email'] === 625, JSON.stringify(b.today))

console.log(`\n${pass} passed, ${fail} failed`)
await browser.close(); server.close()
process.exit(fail ? 1 : 0)

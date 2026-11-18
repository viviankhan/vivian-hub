// "Delete this & all future" on a repeating task, from the timeline's ⋯ sheet
// and from the task editor's ⋯ menu.
//
// It used to leave days behind: a single day edited on its own ("Just this
// event") is stored as a one-off copy, and ending the series didn't touch those,
// so the task kept turning up on them. Deleting from the series' very first day
// also left an empty series that ended before it started.
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

async function setup(startDate) {
  const ctx = await browser.newContext({ viewport:{width:430,height:900}, serviceWorkers:'block' })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(2026, 10, 4, 8, 58) })   // Wed Nov 4
  await page.goto(`http://localhost:4196${BASE}`, { waitUntil:'networkidle' })
  await page.evaluate((startDate) => {
    const set = (k, v) => localStorage.setItem('vivian_' + k, JSON.stringify(v))
    // Nov 10's walk was moved to 7am on its own — a detached one-off copy.
    set('commitments', [
      { id:'occ-r-walk-2026-11-10', text:'Walk', date:'2026-11-10', time:'07:00', durationMins:30, done:false },
      { id:'occ-r-walk-2026-11-02', text:'Walk', date:'2026-11-02', time:'07:00', durationMins:30, done:false },
    ])
    set('commitment_meta', {}); set('recurring_exceptions', {}); set('completions', {})
    set('recurring_tasks_v2', [{ id:'r-walk', label:'10:00 — Walk', days:[], startDate }])
    set('recurring_meta', { 'r-walk': { freq:'daily', durationMins:30 } })
  }, startDate)
  await page.reload({ waitUntil:'networkidle' }); await page.waitForTimeout(800)
  return { ctx, page }
}
const stored = page => page.evaluate(() => ({
  series: JSON.parse(localStorage.getItem('vivian_recurring_tasks_v2') || '[]'),
  ids: JSON.parse(localStorage.getItem('vivian_commitments') || '[]').map(c => c.id),
}))

console.log('— timeline ⋯ sheet —')
{
  const { ctx, page } = await setup('2026-10-01')
  await page.getByText('···').first().click()
  await page.waitForTimeout(250)
  const sheet = page.getByTestId('manage-sheet')
  ok('opens as a sheet', await sheet.isVisible())
  ok('no emoji on the rows', !/\p{Extended_Pictographic}/u.test(await sheet.innerText()))
  await sheet.getByRole('menuitem', { name:'Delete this & all future' }).click()
  await page.waitForTimeout(250)
  let r = await stored(page)
  ok('first tap only asks', !r.series[0].endDate && await sheet.getByText(/tap again/).isVisible())
  await sheet.getByRole('menuitem', { name:/tap again/ }).click()
  await page.waitForTimeout(600)
  r = await stored(page)
  ok('series ends the day before', r.series[0]?.endDate === '2026-11-03', JSON.stringify(r.series))
  ok("Nov 10's moved copy is gone", !r.ids.includes('occ-r-walk-2026-11-10'), JSON.stringify(r.ids))
  ok("Nov 2's (in the past) stays", r.ids.includes('occ-r-walk-2026-11-02'), JSON.stringify(r.ids))
  ok('off the timeline', await page.getByText('Walk', { exact:true }).count() === 0)
  await ctx.close()
}

console.log('— editor ⋯ menu, from the first day —')
{
  const { ctx, page } = await setup('2026-11-04')
  await page.getByText('Walk', { exact:true }).first().click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name:'More actions' }).click()
  await page.waitForTimeout(200)
  await page.getByText('Delete this & all future').click()
  await page.waitForTimeout(600)
  const r = await stored(page)
  ok('the series is gone, not left ending before it starts', r.series.length === 0, JSON.stringify(r.series))
  ok("Nov 10's moved copy is gone", !r.ids.includes('occ-r-walk-2026-11-10'), JSON.stringify(r.ids))
  await ctx.close()
}

console.log(`\n${pass} passed, ${fail} failed`)
await browser.close(); server.close()
process.exit(fail ? 1 : 0)

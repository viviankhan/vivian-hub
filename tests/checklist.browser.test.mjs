// A repeating task with a checklist: "Take meds" every night, with
// sulfasalazine and hydroxychloroquine daily and methotrexate only on Fridays.
// Each box is ticked for that day; ticking the last one ticks the task.

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
await new Promise(r => server.listen(4202, r))
const browser = await chromium.launch()
let pass = 0, fail = 0
const ok = (n, c, x='') => { if (c) { pass++; console.log('  ok  ', n) } else { fail++; console.log('  FAIL', n, x) } }

async function open(day) {
  const ctx = await browser.newContext({ viewport:{ width:430, height:900 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(2026, 10, day, 19, 0) })
  await page.goto(`http://localhost:4202${BASE}`, { waitUntil:'networkidle' })
  await page.evaluate(() => {
    const set = (k, v) => localStorage.setItem('vivian_' + k, JSON.stringify(v))
    set('commitments', []); set('commitment_meta', {}); set('recurring_exceptions', {}); set('completions', {})
    set('recurring_tasks_v2', [{ id:'r-meds', label:'20:00 — Take meds', note:'Sulfasalazine + hydroxychloroquine nightly; methotrexate Fridays.', days:[], startDate:'2026-11-01' }])
    set('recurring_meta', { 'r-meds': { freq:'daily', icon:'glyph:capsule', subtasks: [
      { id:'s-sulfa', text:'Sulfasalazine' }, { id:'s-hcq', text:'Hydroxychloroquine' }, { id:'s-mtx', text:'Methotrexate', days:['friday'] },
    ] } })
  })
  await page.reload({ waitUntil:'networkidle' }); await page.waitForTimeout(1200)
  return { ctx, page }
}
const has = (page, t) => page.evaluate((t) => document.body.innerText.includes(t), t)

console.log('\n— Friday —')
{
  const { ctx, page } = await open(6)
  ok('one task, not three', await has(page, 'Take meds') && !(await has(page, 'RA meds')))
  ok('its note says which meds', await has(page, 'methotrexate Fridays'))
  ok('all three boxes, already open', await has(page, 'Sulfasalazine') && await has(page, 'Hydroxychloroquine') && await has(page, 'Methotrexate'))
  for (const t of ['Sulfasalazine', 'Hydroxychloroquine']) { await page.getByText(t, { exact: true }).click(); await page.waitForTimeout(250) }
  let done = await page.evaluate(() => JSON.parse(localStorage.getItem('vivian_completions') || '{}'))
  ok('each box is ticked for today', done['2026-11-06_r-meds~s-sulfa'] === true && done['2026-11-06_r-meds~s-hcq'] === true, JSON.stringify(done))
  ok('two of three: the task is not done yet', !done['2026-11-06_r-meds'])
  await page.getByText('Methotrexate', { exact: true }).click(); await page.waitForTimeout(400)
  done = await page.evaluate(() => JSON.parse(localStorage.getItem('vivian_completions') || '{}'))
  ok('the last box ticks the task', done['2026-11-06_r-meds'] === true, JSON.stringify(done))
  await ctx.close()
}

console.log('\n— Thursday —')
{
  const { ctx, page } = await open(5)
  ok('no methotrexate box', await has(page, 'Sulfasalazine') && !(await has(page, 'Methotrexate')))
  ok('two boxes', await page.evaluate(() => document.body.innerText.includes('0/2')))
  await ctx.close()
}

console.log(`\n${pass} passed, ${fail} failed`)
await browser.close(); server.close()
process.exit(fail ? 1 : 0)

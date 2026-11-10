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

console.log('\n— "when I get home", still at work at 9:30 PM —')
async function evening(where) {
  const ctx = await browser.newContext({ viewport:{ width:430, height:900 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(2026, 10, 9, 21, 30) })
  await page.goto(`http://localhost:4202${BASE}`, { waitUntil:'networkidle' })
  await page.evaluate((where) => {
    const set = (k, v) => localStorage.setItem('vivian_' + k, JSON.stringify(v))
    const HOME = { name:'Home', lat:44.0485681637716, lng:-92.49244473870289, radius:100 }
    const WORK = { name:'Guggenheim Building', lat:44.0207422, lng:-92.4668928 }
    set('commitments', []); set('commitment_meta', {}); set('recurring_exceptions', {}); set('completions', {})
    set('recurring_tasks_v2', [{ id:'r-meds', label:'20:00 — Take meds', days:[], startDate:'2026-11-01' }])
    set('recurring_meta', { 'r-meds': { freq:'daily', icon:'glyph:capsule', location: { ...HOME, autoStart:false, remindOnArrival:true, notBefore:null } } })
    const at = where === 'work' ? WORK : HOME
    const t = (h, m = 0) => new Date(2026, 10, 9, h, m).getTime()
    localStorage.setItem('bloom_visits', JSON.stringify([{ id:'v', ...at, start:t(9, 6), end:t(21, 29), fixes:9 }]))
  }, where)
  await page.reload({ waitUntil:'networkidle' }); await page.waitForTimeout(1200)
  const text = await page.evaluate(() => document.body.innerText)
  await ctx.close()
  return text
}
{
  const work = await evening('work')
  ok('not overdue while you are at work', work.includes('Take meds') && !/OVERDUE/.test(work), work.slice(0, 400))
  ok('it says it is waiting for home', /When you.re at Home/i.test(work))
  ok('and offers no "start now"', !/Start now/.test(work))
  const home = await evening('home')
  ok('home and still not taken: overdue', /OVERDUE/.test(home) && !/When you.re at Home/i.test(home))
}

console.log('\n— adding a med in the editor —')
{
  const { ctx, page } = await open(5)   // a Thursday
  await page.getByText('Take meds', { exact: true }).first().click(); await page.waitForTimeout(600)
  const values = await page.evaluate(() => [...document.querySelectorAll('textarea, input')].map(e => e.value).filter(Boolean))
  ok('the editor lists every med, Friday-only ones too', ['Sulfasalazine', 'Hydroxychloroquine', 'Methotrexate'].every(m => values.includes(m)), JSON.stringify(values))
  ok('methotrexate shows its day', (await page.getByTestId('sub-days').allInnerTexts()).includes('Fri'))
  await page.getByPlaceholder(/^Add (a med|subtask)$/).fill('Folic acid')
  await page.getByRole('button', { name: 'Add', exact: true }).click(); await page.waitForTimeout(200)
  // Folic acid every day but Friday.
  const chips = page.getByTestId('sub-days')
  await chips.nth(3).click()
  for (const d of ['Mo', 'Tu', 'We', 'Th', 'Sa', 'Su']) await page.getByTestId('sub-day-picker').getByRole('button', { name: d, exact: true }).click()
  await page.getByRole('button', { name: 'Save changes' }).click(); await page.waitForTimeout(300)
  const all = page.getByRole('button', { name: 'Apply to all events' })
  if (await all.isVisible().catch(() => false)) await all.click()
  await page.waitForTimeout(600)
  const meta = await page.evaluate(() => JSON.parse(localStorage.getItem('vivian_recurring_meta') || '{}'))
  const subs = meta['r-meds']?.subtasks || []
  ok('the new med is saved on the series', subs.some(x => x.text === 'Folic acid'), JSON.stringify(subs))
  ok('with its days', JSON.stringify(subs.find(x => x.text === 'Folic acid')?.days?.slice().sort()) === JSON.stringify(['monday','saturday','sunday','thursday','tuesday','wednesday']), JSON.stringify(subs))
  ok('methotrexate keeps Fridays', JSON.stringify(subs.find(x => x.text === 'Methotrexate')?.days) === '["friday"]', JSON.stringify(subs))
  ok('and Thursday shows three boxes now', await page.evaluate(() => document.body.innerText.includes('0/3')))
  await ctx.close()
}

console.log('\n— removing one —')
{
  const { ctx, page } = await open(5)
  await page.getByText('Take meds', { exact: true }).first().click(); await page.waitForTimeout(600)
  const rows = page.locator('button[aria-label="Remove subtask"]')
  await rows.nth(2).click()   // methotrexate
  await page.getByRole('button', { name: 'Save changes' }).click(); await page.waitForTimeout(300)
  const all = page.getByRole('button', { name: 'Apply to all events' })
  if (await all.isVisible().catch(() => false)) await all.click()
  await page.waitForTimeout(600)
  const meta = await page.evaluate(() => JSON.parse(localStorage.getItem('vivian_recurring_meta') || '{}'))
  ok('a removed Friday-only med really goes', !(meta['r-meds']?.subtasks || []).some(x => x.text === 'Methotrexate'), JSON.stringify(meta['r-meds']?.subtasks))
  await ctx.close()
}

console.log(`\n${pass} passed, ${fail} failed`)
await browser.close(); server.close()
process.exit(fail ? 1 : 0)

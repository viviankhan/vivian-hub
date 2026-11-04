// A task done in pieces: "Gate comp experiment" ran 9–10 and again 11–12:45.
// The time row takes extra start/end pairs ("+ Add another time"); the task
// then shows on the timeline once per piece, and stays ONE task — ticking either
// row ticks both, and it counts once in the day's tally.
import { chromium } from 'playwright'
import http from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST = fileURLToPath(new URL('../dist', import.meta.url)).replace(/\/$/, ''), BASE = '/vivian-hub/'
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (!p.startsWith(BASE)) { res.writeHead(404); res.end(); return }
  p = p.slice(BASE.length) || 'index.html'; const file = normalize(join(DIST, p))
  if (!file.startsWith(DIST) || !existsSync(file) || !extname(file)) { res.writeHead(200, {'Content-Type':'text/html'}); res.end(readFileSync(join(DIST,'index.html'))); return }
  res.writeHead(200, {'Content-Type': TYPES[extname(file)] || 'application/octet-stream'}); res.end(readFileSync(file))
})
await new Promise(r => server.listen(4198, r))
const URL_ = `http://localhost:4198${BASE}`
const browser = await chromium.launch()
let pass = 0, fail = 0
const ok = (n, c, x='') => { if (c) { pass++; console.log('  ok  ', n) } else { fail++; console.log('  FAIL', n, x) } }

const ctx = await browser.newContext({ viewport:{ width:430, height:900 }, serviceWorkers:'block' })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e)))
await page.clock.install({ time: new Date(2026, 10, 4, 12, 50) })   // Wed 4 Nov, 12:50 PM
await page.goto(URL_, { waitUntil:'networkidle' })
await page.evaluate(() => {
  const s = (k, v) => localStorage.setItem('vivian_' + k, JSON.stringify(v))
  s('commitments', [{ id:'c-gate', text:'Gate comp experiment', date:'2026-11-04', time:'11:00', durationMins:105, cat:'', done:false }])
  s('commitment_meta', {})
  s('recurring_tasks_v2', [])
})
await page.reload({ waitUntil:'networkidle' }); await page.waitForTimeout(600)

const rows = () => page.locator('[data-task-row="c-gate"]')
ok('one row to start', await rows().count() === 1, await rows().count())

// Open the task, open its time row, add a second time frame 9–10.
await rows().first().getByText('Gate comp experiment').first().click(); await page.waitForTimeout(300)
await page.getByText('11:00 AM – 12:45 PM', { exact:true }).last().click(); await page.waitForTimeout(200)
await page.getByRole('button', { name:'+ Add another time' }).click(); await page.waitForTimeout(150)
const slot = page.locator('[data-extra-slot]')
ok('a second start/end row appears', await slot.count() === 1)
const [st, en] = [slot.locator('input').nth(0), slot.locator('input').nth(1)]
await st.fill('9:00 AM'); await st.blur()
await en.fill('10:00 AM'); await en.blur()
await page.waitForTimeout(150)
ok('summary lists both times', await page.getByText('11:00 AM – 12:45 PM, 9:00 AM – 10:00 AM').count() > 0)
await page.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/sheet.png' : '/dev/null' }).catch(()=>{})
await page.getByRole('button', { name:/^Save/ }).last().click(); await page.waitForTimeout(500)
await page.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/timeline.png' : '/dev/null' }).catch(()=>{})

const meta = await page.evaluate(() => JSON.parse(localStorage.getItem('vivian_commitment_meta') || '{}'))
ok('saved the extra piece', JSON.stringify(meta['c-gate']?.extraSlots) === JSON.stringify([{ time:'09:00', durationMins:60 }]), JSON.stringify(meta['c-gate']))

ok('two rows on the timeline', await rows().count() === 2, await rows().count())
const texts = await rows().allTextContents()
ok('9 AM piece comes first', /9:00/.test(texts[0]) && /11:00/.test(texts[1]), JSON.stringify(texts))
ok('rows say which part they are', /Part 1 of 2/.test(texts[0]) && /Part 2 of 2/.test(texts[1]), JSON.stringify(texts))

// Tick the 9 AM row → the whole task is done, both rows crossed off.
await rows().first().locator('span:text-is("Gate comp experiment") + div').click(); await page.waitForTimeout(400)
const ticks = await rows().evaluateAll(els => els.map(el => el.textContent.includes('✓')))
ok('ticking one piece ticks both rows', JSON.stringify(ticks) === '[true,true]', JSON.stringify(ticks))
ok('counts as one task done', await page.getByText('1 of 1 done').count() > 0)

ok('no page errors', errors.length === 0, errors.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
await browser.close(); server.close()
process.exit(fail ? 1 : 0)

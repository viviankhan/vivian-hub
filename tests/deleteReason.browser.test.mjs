// Deleting an event can say why: the reason typed into the delete confirm is
// kept with that delete in Settings → History. Leaving it blank still deletes.

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
await new Promise(r => server.listen(4203, r))
const browser = await chromium.launch()
let pass = 0, fail = 0
const ok = (n, c, x='') => { if (c) { pass++; console.log('  ok  ', n) } else { fail++; console.log('  FAIL', n, x) } }

const ctx = await browser.newContext({ viewport:{ width:430, height:900 }, serviceWorkers: 'block' })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e)))
await page.goto(`http://localhost:4203${BASE}`, { waitUntil:'networkidle' })
await page.evaluate(() => {
  const set = (k, v) => localStorage.setItem('vivian_' + k, JSON.stringify(v))
  set('events', [
    { id:'ev-retreat', label:'Immunology Retreat', startDate:'2026-11-20', endDate:'2026-11-22', allDay:true, color:'#7C9CBF', icon:'' },
    { id:'ev-conf', label:'Writing Conference', startDate:'2026-12-03', endDate:'2026-12-04', allDay:true, color:'#7C9CBF', icon:'' },
  ])
  set('change_history', [])
  localStorage.setItem('vivian_last_tab', 'events')
})
await page.reload({ waitUntil:'networkidle' }); await page.waitForTimeout(1000)
const history = () => page.evaluate(() => JSON.parse(localStorage.getItem('vivian_change_history') || '[]'))

console.log('\n— delete with a reason —')
await page.locator('[title="Delete event"]').first().click()
const box = page.getByPlaceholder('Why? (optional — saved in History)')
ok('the confirm asks why', await box.isVisible())
await page.screenshot({ path: process.env.SHOT || '/dev/null' }).catch(() => {})
await box.fill('Retreat was cancelled')
await page.getByRole('button', { name: 'Delete', exact: true }).click()
await page.waitForTimeout(500)
let h = await history()
ok('the retreat is gone', !(await page.evaluate(() => document.body.innerText.includes('Immunology Retreat\n'))) )
ok('the delete is in History with its reason', h[0]?.kind === 'delete' && h[0]?.label.includes('Immunology Retreat') && h[0]?.reason === 'Retreat was cancelled', JSON.stringify(h[0]))

console.log('\n— delete without one —')
await page.locator('[title="Delete event"]').first().click()
await page.getByPlaceholder('Why? (optional — saved in History)').press('Enter')
await page.waitForTimeout(500)
h = await history()
ok('Enter deletes, no reason needed', h[0]?.kind === 'delete' && h[0]?.label.includes('Writing Conference') && !('reason' in h[0]), JSON.stringify(h[0]))

console.log('\n— History shows it —')
await page.evaluate(() => localStorage.setItem('vivian_last_tab', 'events'))
await page.reload({ waitUntil:'networkidle' }); await page.waitForTimeout(800)
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(b => /settings/i.test(b.getAttribute('aria-label') || b.title || '')); b && b.click() })
await page.waitForTimeout(400)
await page.getByText('History', { exact: true }).first().click()
await page.waitForTimeout(400)
ok('the reason is under the delete', await page.evaluate(() => document.body.innerText.includes('Why: Retreat was cancelled')))
if (process.env.SHOT2) await page.screenshot({ path: process.env.SHOT2 })
ok('no page errors', errors.length === 0, errors.join('\n'))

await browser.close(); server.close()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

// A task shifted on Today reminds at its shifted time, not the series' usual one.
//
// Check email normally starts 9:35 with a 5-minute alert. Pulled to 9:01 on
// Today, the 9:30 "Check email in 5 min" used to arrive anyway — after the
// task had already happened (and auto-completed inside the Work block).

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
await new Promise(r => server.listen(4194, r))
const browser = await chromium.launch()
let pass = 0, fail = 0
const ok = (n, c, x='') => { if (c) { pass++; console.log('  ok  ', n) } else { fail++; console.log('  FAIL', n, x) } }

async function run(shifted) {
  const ctx = await browser.newContext({ viewport:{width:430,height:900}, permissions:['notifications'], serviceWorkers: 'block' })
  await ctx.addInitScript(() => {
    window.__shown = []
    const N = function (title, opts) { window.__shown.push(title) }
    N.permission = 'granted'; N.requestPermission = async () => 'granted'
    window.Notification = N
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(2026, 10, 3, 9, 25) })
  await page.goto(`http://localhost:4194${BASE}`, { waitUntil:'networkidle' })
  await page.evaluate((shifted) => {
    const set = (k, v) => localStorage.setItem('vivian_' + k, JSON.stringify(v))
    set('commitments', []); set('commitment_meta', {}); set('recurring_exceptions', {})
    set('recurring_tasks_v2', [{ id:'r-email', label:'09:35 — Check email', days:[], startDate:null }])
    set('recurring_meta', { 'r-email': { freq:'daily', durationMins: 15 } })
    localStorage.setItem('vivian_notif_settings', JSON.stringify({ enabled: true }))
    localStorage.setItem('bloom_default_alerts', JSON.stringify([5]))
    if (shifted) localStorage.setItem('vivian_timeshift_2026-11-03', JSON.stringify({ 'r-email': 9 * 60 + 1 }))
  }, shifted)
  await page.reload({ waitUntil:'networkidle' }); await page.waitForTimeout(1500)
  await page.clock.runFor(6 * 60 * 1000)   // to 9:31
  await page.waitForTimeout(500)
  const shown = await page.evaluate(() => window.__shown)
  await ctx.close()
  return shown
}
const plain = await run(false)
ok('control: an unshifted 9:35 task reminds at 9:30', plain.some(t => /Check email in 5 min/.test(t)), JSON.stringify(plain))
const moved = await run(true)
ok('shifted to 9:01, it does not remind at 9:30', !moved.some(t => /Check email/.test(t)), JSON.stringify(moved))
console.log(`\n${pass} passed, ${fail} failed`)
await browser.close(); server.close()
process.exit(fail ? 1 : 0)

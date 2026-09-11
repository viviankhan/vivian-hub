// Real-browser test of what an installed Bloom does when midnight passes while
// it is open — which, on a phone, is most nights: the app is backgrounded, not
// closed, so the React tree that rendered last night is the one you're looking
// at in the morning.
//
// The bug this guards against: the day the timeline showed was read from the
// clock ONCE, when the component mounted. Left open overnight it was still
// showing yesterday in the morning — and worse than looking wrong, every action
// taken on it was written against yesterday's date: a tick recorded a
// completion on the day that had already ended, and a task pushed off the end
// of the day was filed onto the day after TODAY, so it left the day it was on
// and never arrived on the one in front of you.
//
// Sits alongside browser.test.mjs and blocks.browser.test.mjs; run them all
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
await new Promise(r => server.listen(4178, r))
const URL_ = `http://localhost:4178${BASE}`

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

// Ten to midnight on a Thursday. The clock is faked from here on — including
// inside the page — so the night can be crossed on demand instead of waited
// through. Installed before the first navigation so nothing ever sees the real
// date. (A Wednesday–Thursday pair inside one month keeps the day names and the
// month label out of the assertions' way.)
const NIGHT = new Date(2026, 2, 5, 23, 50, 0)   // Thu 5 March 2026, 23:50
const EVE = '2026-03-05', MORN = '2026-03-06'
await page.clock.install({ time: NIGHT })

// ── Seeding ────────────────────────────────────────────────────
// Without Supabase configured every store is just localStorage under a
// `vivian_` prefix, so the evening can be laid out from the outside and the app
// simply reads it on the next load.
const seed = async (data) => {
  await page.goto(URL_, { waitUntil: 'networkidle' })
  await page.evaluate((d) => {
    for (const [k, v] of Object.entries(d)) localStorage.setItem('vivian_' + k, JSON.stringify(v))
  }, data)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('#root > *')
  await page.waitForTimeout(300)
}
const store = (key) => page.evaluate(k => JSON.parse(localStorage.getItem('vivian_' + k) || 'null'), key)
// The day the timeline is showing, read off its own header ("March 5,").
const shownDay = () => page.evaluate(() => {
  const el = [...document.querySelectorAll('span.serif')].find(s => /^[A-Za-z]+ \d{1,2},$/.test(s.textContent.trim()))
  return el ? el.textContent.trim().replace(/,$/, '') : null
})
// Which cell of the day wheel is filled in (the selected day), by its date key.
const selectedDay = () => page.evaluate(() => {
  const cell = [...document.querySelectorAll('.day-cell')].find(c =>
    [...c.querySelectorAll('span')].some(s => /background:\s*var\(--teal\)/.test(s.getAttribute('style') || '')))
  return cell ? cell.dataset.daykey : null
})
// Cross a task off by tapping its circle — the 24px ring at the end of the row.
const tick = async (taskId) => {
  await page.locator(`[data-task-row="${taskId}"] div[style*="width: 24px"][style*="border-radius: 50%"]`).first().click()
  await page.waitForTimeout(300)
}
// Let the night pass. The app watches the clock on a 30s beat, so a jump of
// several minutes crosses midnight and fires it exactly as a real night would.
const passMidnight = async () => {
  await page.clock.fastForward('15:00')
  await page.waitForTimeout(400)
}

// An evening routine — the last thing on the day, and the thing that was
// getting lost.
const evening = {
  commitments: [],
  commitment_meta: {},
  recurring_tasks_v2: [
    { id:'r-winddown', label:'21:30 — Wind down', days:[], startDate:null },
    { id:'r-lightsout', label:'22:00 — Lights out', days:[], startDate:null },
  ],
  recurring_meta: {
    'r-winddown':  { freq:'daily', durationMins:20 },
    'r-lightsout': { freq:'daily', durationMins:15 },
  },
  recurring_exceptions: {}, completions: {}, routine_groups: [],
}

// ── The night passes with the app open ─────────────────────────
console.log('\n— midnight, with the app still open —')
await seed(evening)
eq('the evening opens on its own day', await shownDay(), 'March 5')
eq('with that day filled in on the wheel', await selectedDay(), EVE)

await passMidnight()
eq('morning comes and the timeline has moved with it', await shownDay(), 'March 6')
eq('the wheel followed too', await selectedDay(), MORN)

// The real damage: what the day is decides what every tap writes.
await tick('r-winddown')
eq('a tick now lands on the new day', Object.keys((await store('completions')) || {}), [`${MORN}_r-winddown`])

// ── A day you chose stays where you put it ─────────────────────
// Following the clock is only right for the day the clock put you on. A day
// navigated to deliberately — looking back at Monday — must not be yanked
// forward under the user at midnight.
console.log('\n— a day you navigated to —')
await seed(evening)
await page.locator('[data-daykey="2026-03-02"]').click()
await page.waitForTimeout(300)
eq('looking back at Monday', await shownDay(), 'March 2')
await passMidnight()
eq('midnight leaves it alone', await shownDay(), 'March 2')
eq('and the wheel keeps it selected', await selectedDay(), '2026-03-02')

eq('no uncaught errors', errors, [])

await browser.close()
server.close()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

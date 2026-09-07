// Real-browser test of the containers on the Today timeline — time blocks and
// routines — and the ⋯ each one now wears: can the container itself be edited
// and deleted from the band it draws, without going hunting for it in another
// tab?
//
// Sits alongside browser.test.mjs and labels.browser.test.mjs; run all three
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
await new Promise(r => server.listen(4175, r))
const URL_ = `http://localhost:4175${BASE}`

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', g, '\n        want', w) }
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource/i.test(m.text())) errors.push('console: ' + m.text()) })

// ── Seeding ────────────────────────────────────────────────────
// Without Supabase configured every store is just localStorage under a
// `vivian_` prefix, so a day can be laid out from the outside and the app
// simply reads it on the next load.
const seed = async (build) => {
  await page.goto(URL_, { waitUntil: 'networkidle' })
  await page.evaluate((src) => {
    const today = (() => { const d = new Date()
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
    // eslint-disable-next-line no-new-func
    const data = new Function('today', `return (${src})(today)`)(today)
    for (const [k, v] of Object.entries(data)) localStorage.setItem('vivian_' + k, JSON.stringify(v))
    // Per-day UI state that would otherwise carry over between cases.
    localStorage.removeItem('vivian_collapsed_blocks')
  }, build.toString())
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('#root > *')
  await page.waitForTimeout(250)
}
const store = (key) => page.evaluate(k => JSON.parse(localStorage.getItem('vivian_' + k) || 'null'), key)
// The band's ⋯ — labelled with the container's own name.
const bandMenu = (name) => page.locator(`button[aria-label="${name} — more actions"]`)
const menuItems = () => page.$$eval('[role="menuitem"]', bs => bs.map(b => b.textContent.trim()))
const clickMenuItem = (text) => page.evaluate(t => {
  const b = [...document.querySelectorAll('[role="menuitem"]')].find(x => x.textContent.trim() === t)
  if (!b) throw new Error(`no menu item “${t}”`)
  b.click()
}, text)
// Every uppercase band label currently on the timeline. A block's own band
// draws it as a span, a band label riding on a task (or a routine head) as a
// button — so look at both.
const bandLabels = () => page.evaluate(() =>
  [...document.querySelectorAll('button, span')]
    .map(b => b.textContent.trim())
    .filter(t => /^[A-Z0-9 ’'&-]{2,}$/.test(t)))

// ── A one-off time block ───────────────────────────────────────
console.log('\n— a one-off time block —')
await seed(today => ({
  commitments: [{ id:'c-block1', text:'Work', date:today, time:'09:00', durationMins:180, cat:'', done:false }],
  commitment_meta: { 'c-block1': { block:true, color:'#4A9EB5' } },
  recurring_tasks_v2: [], recurring_meta: {}, recurring_exceptions: {}, completions: {},
}))
eq('its band is on the timeline', (await bandLabels()).includes('WORK'), true)
eq('and the band carries a ⋯', await bandMenu('Work').count(), 1)

await bandMenu('Work').click()
eq('which offers the block’s own edit + delete', await menuItems(), ['Edit block', 'Delete block'])
await clickMenuItem('Delete block')
await page.waitForTimeout(300)
eq('deleting takes the band off the day', (await bandLabels()).includes('WORK'), false)
eq('and the block itself is gone', await store('commitments'), [])

// ── A repeating time block ─────────────────────────────────────
console.log('\n— a repeating time block —')
const repeating = today => ({
  commitments: [], commitment_meta: {},
  recurring_tasks_v2: [{ id:'r-block1', label:'14:00 — Studio', days:[], startDate:null }],
  recurring_meta: { 'r-block1': { block:true, durationMins:120, freq:'daily' } },
  recurring_exceptions: {}, completions: {},
})
await seed(repeating)
eq('its band is on the timeline', (await bandLabels()).includes('STUDIO'), true)
await bandMenu('Studio').click()
eq('and its delete is scoped like a series', await menuItems(),
   ['Edit block', 'Delete just this day', 'Delete this & all future', 'Delete every day'])

await clickMenuItem('Delete just this day')
await page.waitForTimeout(300)
const todayKey = await page.evaluate(() => { const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })
eq('one day drops off', (await bandLabels()).includes('STUDIO'), false)
eq('as a skip for that date only', Object.keys((await store('recurring_exceptions')) || {}), [`r-block1@${todayKey}`])
eq('the series itself is untouched', ((await store('recurring_tasks_v2')) || []).length, 1)

// Deleting every day is not undoable, so it asks a second time first.
await seed(repeating)
await bandMenu('Studio').click()
await clickMenuItem('Delete every day')
await page.waitForTimeout(150)
eq('“every day” arms rather than fires', await menuItems(),
   ['Edit block', 'Delete just this day', 'Delete this & all future', 'Tap again to confirm'])
eq('and nothing is deleted yet', ((await store('recurring_tasks_v2')) || []).length, 1)
await clickMenuItem('Tap again to confirm')
await page.waitForTimeout(300)
eq('the second tap deletes the series', await store('recurring_tasks_v2'), [])
eq('and the band is off the day', (await bandLabels()).includes('STUDIO'), false)

// ── A routine ──────────────────────────────────────────────────
console.log('\n— a routine —')
const withRoutine = today => ({
  commitments: [], commitment_meta: {},
  routine_groups: [{ id:'rt-deep', name:'Deep work', tint:'#BBD5F0' }],
  recurring_tasks_v2: [
    { id:'r-t1', label:'10:00 — Write',  days:[], startDate:null },
    { id:'r-t2', label:'11:00 — Review', days:[], startDate:null },
  ],
  recurring_meta: {
    'r-t1': { routine:'rt-deep', durationMins:60, freq:'daily' },
    'r-t2': { routine:'rt-deep', durationMins:60, freq:'daily' },
  },
  recurring_exceptions: {},
  // An explicit "not done" record for each, so the routine doesn't fold itself
  // up into its done-summary row partway through the day the test happens to run.
  completions: { [`${today}_r-t1`]: false, [`${today}_r-t2`]: false },
})
await seed(withRoutine)
eq('the routine names its own band', (await bandLabels()).includes('DEEP WORK'), true)
eq('and the band carries a ⋯', await bandMenu('Deep work').count(), 1)
await bandMenu('Deep work').click()
eq('which edits or deletes the routine itself', await menuItems(), ['Edit routine', 'Delete routine'])

// Edit: rename it, and the band renames with it.
await clickMenuItem('Edit routine')
await page.waitForTimeout(200)
await page.fill('input[aria-label="Routine name"]', 'Studio hours')
await page.getByRole('button', { name: 'Save changes' }).click()
await page.waitForTimeout(300)
eq('a rename lands on the band', (await bandLabels()).includes('STUDIO HOURS'), true)
eq('and on the stored group', ((await store('routine_groups')) || []).map(r => r.name), ['Studio hours'])

// Delete: the group goes, its tasks stay.
await bandMenu('Studio hours').click()
await clickMenuItem('Delete routine')
await page.waitForTimeout(150)
await clickMenuItem('Tap again to confirm')
await page.waitForTimeout(300)
eq('deleting drops the routine', await store('routine_groups'), [])
eq('but keeps its tasks on the day', await page.evaluate(() =>
  ['Write', 'Review'].every(t => document.body.innerText.includes(t))), true)

eq('no uncaught errors', errors, [])

await browser.close()
server.close()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

// Real-browser test of the containers on the Today timeline — time blocks —
// and the ⋯ each one wears: can the container itself be edited and deleted
// from the band it draws, without going hunting for it in another tab? Also
// checks that a routine saved from before turns into a block on load.
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
// Open it and wait for the portalled popover to be measured and painted.
const openMenu = async (name) => {
  await bandMenu(name).click()
  await page.waitForSelector('[role="menuitem"]', { timeout: 3000 })
}
const menuItems = () => page.$$eval('[role="menuitem"]', bs => bs.map(b => b.textContent.trim()))
// A REAL click, not a dispatched one. Playwright checks the point actually
// hits this element, which is the whole point: an earlier version of the menu
// was painted under the next band and every tap fell through to it — a
// synthetic element.click() sails through that and reports success.
const clickMenuItem = (text) =>
  page.getByRole('menuitem', { name: text, exact: true }).click({ timeout: 3000 })
// An armed row states the consequence and ends in "— tap again"; that sentence
// IS the confirmation, so the test reads it rather than a fixed string.
const clickConfirm = () =>
  page.getByRole('menuitem', { name: /— tap again$/ }).click({ timeout: 3000 })
// Nothing on the timeline should have opened a task sheet behind the menu.
const sheetOpen = () => page.evaluate(() =>
  !!document.body.innerText.match(/ADD TO TODAY|Add to Today/))
// Every uppercase band label currently on the timeline. A block's own band
// draws it as a span, a band label riding on a task as a button — so look at
// both.
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

await openMenu('Work')
eq('which offers the block’s own edit + removal', await menuItems(), ['Edit block', 'Remove from today'])
await clickMenuItem('Remove from today')
await page.waitForTimeout(300)
eq('and the tap did not fall through to the band', await sheetOpen(), false)
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
await openMenu('Studio')
eq('and its delete is scoped like a series', await menuItems(),
   ['Edit block', 'Remove from today', 'Delete this & all future…', 'Delete every day…'])

await clickMenuItem('Remove from today')
await page.waitForTimeout(300)
const todayKey = await page.evaluate(() => { const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })
eq('one day drops off', (await bandLabels()).includes('STUDIO'), false)
eq('as a skip for that date only', Object.keys((await store('recurring_exceptions')) || {}), [`r-block1@${todayKey}`])
eq('the series itself is untouched', ((await store('recurring_tasks_v2')) || []).length, 1)

// Deleting every day is not undoable, so it asks a second time first.
await seed(repeating)
await openMenu('Studio')
await clickMenuItem('Delete every day…')
await page.waitForTimeout(150)
eq('“every day” arms, saying what it will do', (await menuItems())[3],
   'Delete this block on every day, past and future? This cannot be undone. — tap again')
eq('and nothing is deleted yet', ((await store('recurring_tasks_v2')) || []).length, 1)
await clickConfirm()
await page.waitForTimeout(300)
eq('the second tap deletes the series', await store('recurring_tasks_v2'), [])
eq('and the band is off the day', (await bandLabels()).includes('STUDIO'), false)

// ── A routine left over from before ────────────────────────────
// Routines are time blocks now. A routine group still saved from before is
// folded into a block on load: same name, same color, spanning its tasks.
console.log('\n— a saved routine becomes a block —')
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
  completions: { [`${today}_r-t1`]: false, [`${today}_r-t2`]: false },
})
await seed(withRoutine)
eq('its band is on the timeline', (await bandLabels()).includes('DEEP WORK'), true)
eq('the group store is emptied', await store('routine_groups'), [])
eq('a repeating block took its place', ((await store('recurring_tasks_v2')) || []).map(r => r.id).sort(),
   ['r-blk-rt-deep-0', 'r-t1', 'r-t2'])
eq('spanning both tasks, in the routine’s color', (await store('recurring_meta'))['r-blk-rt-deep-0'],
   { block:true, durationMins:120, freq:'daily', color:'#BBD5F0', icon:'glyph:sun' })
eq('and the tasks are no longer filed under anything', await page.evaluate(() =>
  Object.values(JSON.parse(localStorage.getItem('vivian_recurring_meta') || '{}')).filter(v => v.routine).length), 0)
// A block folds itself shut once its window has passed — pin this one open so
// the check doesn't depend on the hour the test runs.
await page.evaluate(() => localStorage.setItem('vivian_collapsed_blocks', JSON.stringify({ 'r-blk-rt-deep-0': false })))
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('#root > *')
await page.waitForTimeout(250)
eq('they still sit on the day, inside it', await page.evaluate(() =>
  ['Write', 'Review'].every(t => document.body.innerText.includes(t))), true)
await openMenu('Deep work')
eq('and its ⋯ is a block’s ⋯', await menuItems(),
   ['Edit block', 'Clear from today — block + 2 tasks', 'Remove the block only, keep its 2 tasks', 'Delete this & all future…', 'Delete every day…'])
await page.keyboard.press('Escape')

// Loading again (as above) must not make a second block.
eq('a reload leaves one block', ((await store('recurring_tasks_v2')) || []).length, 3)

// ── One-off tasks in a routine ─────────────────────────────────
console.log('\n— a routine’s one-off tasks get a block on their day —')
await seed(today => ({
  commitments: [
    { id:'c-a', text:'Pack bag', date:today, time:'07:00', durationMins:15, cat:'', done:false },
    { id:'c-b', text:'Walk dog', date:today, time:'07:30', durationMins:30, cat:'', done:false },
  ],
  commitment_meta: { 'c-a': { routine:'rt-am' }, 'c-b': { routine:'rt-am' } },
  routine_groups: [{ id:'rt-am', name:'Morning routine', tint:'#FBE79E' }],
  recurring_tasks_v2: [], recurring_meta: {}, recurring_exceptions: {},
  completions: { 'c-a': false, 'c-b': false },
}))
eq('its band is on the timeline', (await bandLabels()).includes('MORNING ROUTINE'), true)
eq('as a one-off block from 7:00 to 8:00', ((await store('commitments')) || []).filter(c => c.id.startsWith('c-blk-'))
   .map(c => [c.text, c.time, c.durationMins]), [['Morning routine', '07:00', 60]])
eq('no task is left filed under it', await store('commitment_meta'), {
  [`c-blk-rt-am-${todayKey}`]: { block:true, color:'#FBE79E', icon:'glyph:sun' } })
await openMenu('Morning routine')
eq('its ⋯ is a one-off block’s', await menuItems(),
   ['Edit block', 'Clear from today — block + 2 tasks', 'Remove the block only, keep its 2 tasks'])
await page.keyboard.press('Escape')

// ── The holiday: a block cleared off one day ───────────────────
// Clearing a block off today takes what's inside with it and leaves every
// other day alone.
console.log('\n— a work block cleared on a day off —')
await seed(today => ({
  commitments: [], commitment_meta: {},
  recurring_tasks_v2: [
    { id:'r-wblk', label:'09:00 — Work', days:[], startDate:null },
    { id:'r-w1', label:'09:30 — Standup',     days:[], startDate:null },
    { id:'r-w2', label:'11:00 — Code review', days:[], startDate:null },
  ],
  recurring_meta: {
    'r-wblk': { block:true, durationMins:480, freq:'daily', color:'#B9A7D9' },
    'r-w1': { durationMins:30, freq:'daily' },
    'r-w2': { durationMins:60, freq:'daily' },
  },
  recurring_exceptions: {}, completions: {},
}))
eq('only the block wears a ⋯', await page.$$eval(
  'button[aria-label$="more actions"]', bs => bs.map(b => b.getAttribute('aria-label'))), ['Work — more actions'])
await openMenu('Work')
await clickMenuItem('Clear from today — block + 2 tasks')
await page.waitForTimeout(150)
await clickConfirm()
await page.waitForTimeout(500)
eq('the block goes', (await bandLabels()).includes('WORK'), false)
eq('its tasks go with it', await page.evaluate(() =>
  ['Standup', 'Code review'].filter(t => document.body.innerText.includes(t))), [])
eq('the templates are all still there', ((await store('recurring_tasks_v2')) || []).length, 3)
eq('as skips for this date only', Object.keys((await store('recurring_exceptions')) || {}).sort(),
   [`r-w1@${todayKey}`, `r-w2@${todayKey}`, `r-wblk@${todayKey}`].sort())

eq('no uncaught errors', errors, [])

await browser.close()
server.close()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

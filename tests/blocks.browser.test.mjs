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
await openMenu('Deep work')
eq('which leads with clearing it off THIS day', await menuItems(),
   ['Clear from today — 2 tasks', 'Edit routine', 'Delete the routine group…'])

// Edit: rename it, and the band renames with it.
await clickMenuItem('Edit routine')
await page.waitForTimeout(200)
await page.fill('input[aria-label="Routine name"]', 'Studio hours')
await page.getByRole('button', { name: 'Save changes' }).click()
await page.waitForTimeout(300)
eq('a rename lands on the band', (await bandLabels()).includes('STUDIO HOURS'), true)
eq('and on the stored group', ((await store('routine_groups')) || []).map(r => r.name), ['Studio hours'])

// Delete: the group goes, its tasks stay.
await openMenu('Studio hours')
await clickMenuItem('Delete the routine group…')
await page.waitForTimeout(150)
await clickConfirm()
await page.waitForTimeout(300)
eq('deleting drops the routine', await store('routine_groups'), [])
eq('but keeps its tasks on the day', await page.evaluate(() =>
  ['Write', 'Review'].every(t => document.body.innerText.includes(t))), true)

// ── A done routine sitting right above a block band ────────────
// The layout that broke the menu: every band row pins its film with a z-index,
// which makes it a stacking context — so a popover rendered inside one row was
// painted UNDER the rows and bands that follow it, and every tap fell through
// to whatever was on top (usually a block band's "add a task here"). The menu
// is portalled out to the body now; these check the taps land where they're aimed.
console.log('\n— a done routine stacked above a block band —')
await seed(today => ({
  commitments: [{ id:'c-blk', text:'Studio', date:today, time:'23:00', durationMins:59, cat:'', done:false }],
  commitment_meta: { 'c-blk': { block:true, color:'#8B7BB8' } },
  routine_groups: [{ id:'rt-am', name:'Morning routine', tint:'#FBE79E' }],
  recurring_tasks_v2: [{ id:'r-am1', label:'00:05 — Stretch', days:[], startDate:null }],
  recurring_meta: { 'r-am1': { routine:'rt-am', durationMins:15, freq:'daily' } },
  recurring_exceptions: {},
  // Done, so the routine renders as its collapsed summary row — the row the
  // screenshot showed the menu vanishing behind.
  completions: { [`${today}_r-am1`]: true },
}))
eq('the routine collapsed to its summary row', await page.evaluate(() =>
  document.body.innerText.includes('First thing in the morning')), true)
await openMenu('Morning routine')
eq('its menu is reachable over the band below', await menuItems(),
   ['Clear from today — 1 task', 'Edit routine', 'Delete the routine group…'])
await clickMenuItem('Edit routine')
await page.waitForTimeout(300)
eq('and Edit opens the routine editor, not the add sheet', await page.evaluate(() =>
  !!document.querySelector('input[aria-label="Routine name"]')), true)
eq('no task sheet opened behind it', await sheetOpen(), false)
await page.getByRole('button', { name: 'Cancel' }).click()
await page.waitForTimeout(200)

// …and the same for Delete, which is what actually fell through in the report.
await openMenu('Morning routine')
await clickMenuItem('Delete the routine group…')
await page.waitForTimeout(200)
eq('Delete arms in place instead of opening anything', (await menuItems())[2],
   'Delete “Morning routine” from every day? Its tasks stay — they just stop being grouped. — tap again')
eq('still no task sheet', await sheetOpen(), false)
await clickConfirm()
await page.waitForTimeout(300)
eq('and the second tap removes the group', await store('routine_groups'), [])

// ── The holiday: a routine whose tasks live inside a block ─────
// The case that went wrong. A routine's tasks sitting inside a time block lose
// the band to that block, so the routine used to get NO header at all — its only
// handle was the done-summary row, whose only offer was a permanent, unrecorded
// delete. Wanting "not today" and being given "gone forever" is the bug.
console.log('\n— a work routine inside a work block, on a day off —')
const holiday = today => ({
  commitments: [{ id:'c-workblk', text:'Work', date:today, time:'09:00', durationMins:480, cat:'', done:false }],
  commitment_meta: { 'c-workblk': { block:true, color:'#B9A7D9' } },
  routine_groups: [{ id:'rt-work', name:'Work routine', tint:'#D9C7EE' }],
  recurring_tasks_v2: [
    { id:'r-w1', label:'09:30 — Standup',     days:[], startDate:null },
    { id:'r-w2', label:'11:00 — Code review', days:[], startDate:null },
    { id:'r-w3', label:'14:00 — Deploy',      days:[], startDate:null },
  ],
  recurring_meta: {
    'r-w1': { routine:'rt-work', durationMins:30, freq:'daily' },
    'r-w2': { routine:'rt-work', durationMins:60, freq:'daily' },
    'r-w3': { routine:'rt-work', durationMins:60, freq:'daily' },
  },
  recurring_exceptions: {}, completions: {},
})
await seed(holiday)
eq('the block and the routine each get their own ⋯', await page.$$eval(
  'button[aria-label$="more actions"]', bs => bs.map(b => b.getAttribute('aria-label')).sort()),
  ['Work routine — more actions', 'Work — more actions'])

// Clearing the routine off today must not touch what it is on any other day.
await openMenu('Work routine')
eq('the routine leads with the one-day action', (await menuItems())[0], 'Clear from today — 3 tasks')
await clickMenuItem('Clear from today — 3 tasks')
await page.waitForTimeout(150)
eq('and says so before it fires', (await menuItems())[0],
   "Take Work routine's 3 tasks off today? Every other day keeps them. — tap again")
await clickConfirm()
await page.waitForTimeout(500)
eq('its tasks leave the day', await page.evaluate(() =>
  ['Standup', 'Code review', 'Deploy'].filter(t => document.body.innerText.includes(t))), [])
eq('the group survives', ((await store('routine_groups')) || []).map(r => r.name), ['Work routine'])
eq('every template survives', ((await store('recurring_tasks_v2')) || []).length, 3)
eq('and it is a skip for THIS date only', Object.keys((await store('recurring_exceptions')) || {}).sort(),
   [`r-w1@${todayKey}`, `r-w2@${todayKey}`, `r-w3@${todayKey}`].sort())

// The block, cleared with everything in it — "the work block + everything in it".
await seed(holiday)
await openMenu('Work')
eq('the block offers to take its contents with it', (await menuItems())[1],
   'Clear from today — block + 3 tasks')
await clickMenuItem('Clear from today — block + 3 tasks')
await page.waitForTimeout(150)
await clickConfirm()
await page.waitForTimeout(500)
eq('the block goes', (await bandLabels()).includes('WORK'), false)
eq('its tasks go with it', await page.evaluate(() =>
  ['Standup', 'Code review', 'Deploy'].filter(t => document.body.innerText.includes(t))), [])
eq('and the templates are all still there', ((await store('recurring_tasks_v2')) || []).length, 3)

// ── Deleting the group is undoable now ────────────────────────
console.log('\n— deleting a routine group can be taken back —')
await seed(holiday)
await openMenu('Work routine')
await clickMenuItem('Delete the routine group…')
await page.waitForTimeout(150)
await clickConfirm()
await page.waitForTimeout(400)
eq('the group goes', await store('routine_groups'), [])
eq('its tasks are unfiled', await page.evaluate(() =>
  Object.values(JSON.parse(localStorage.getItem('vivian_recurring_meta') || '{}')).filter(v => v.routine).length), 0)
await page.keyboard.press('Control+z')
await page.waitForTimeout(500)
eq('Ctrl+Z brings the group back', ((await store('routine_groups')) || []).map(r => r.name), ['Work routine'])
eq('with its tasks re-filed under it', await page.evaluate(() =>
  Object.values(JSON.parse(localStorage.getItem('vivian_recurring_meta') || '{}')).filter(v => v.routine === 'rt-work').length), 3)

eq('no uncaught errors', errors, [])

await browser.close()
server.close()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

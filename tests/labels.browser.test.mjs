// Real-browser test of the label chain: can a label be dragged up or down it,
// does the new order stick, and is it the same order everywhere labels appear?
//
// Sits alongside browser.test.mjs and serves the same built app; run both with
// `npm run test:browser`.
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
await new Promise(r => server.listen(4174, r))
const URL_ = `http://localhost:4174${BASE}`

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

// Click a button by its exact text — the nav tucks half its tabs behind "More".
const clickText = (text) => page.evaluate(t => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === t)
  if (!b) throw new Error(`no button “${t}”`)
  b.click()
}, text)

const openLabelSettings = async () => {
  await page.goto(URL_, { waitUntil: 'networkidle' })
  await page.waitForSelector('#root > *')
  await page.getByTitle(/settings/i).first().click()
  await page.getByRole('button', { name: 'Labels', exact: true }).click()
  await page.waitForSelector('button[aria-label^="Reorder"]')
}
// The chain as the settings list has it — one grip per label, in order.
const chain = () => page.$$eval('button[aria-label^="Reorder"]', bs =>
  bs.map(b => b.getAttribute('aria-label').replace(/^Reorder /, '')))

// Drag the grip of row `from` onto row `to`.
const dragGrip = async (from, to) => {
  const grips = page.locator('button[aria-label^="Reorder"]')
  const g = await grips.nth(from).boundingBox()
  const t = await grips.nth(to).boundingBox()
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
  await page.mouse.down()
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2 + 12, { steps: 3 })   // past the threshold
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(250)
}

console.log('\n— settings: dragging a label up the chain —')
await openLabelSettings()
const before = await chain()
eq('the chain starts in the seeded order', before.slice(0, 4), ['Lab', 'Class', 'Study', 'Meeting'])

await dragGrip(3, 0)                       // Meeting → the top
const after = await chain()
eq('the dragged label is first now', after[0], 'Meeting')
eq('everything it passed keeps its order', after.slice(1, 4), ['Lab', 'Class', 'Study'])
eq('no label was lost on the way', after.length, before.length)

console.log('\n— and it survives a reload —')
await openLabelSettings()
eq('the saved order is what comes back', await chain(), after)

console.log('\n— the arrow keys move it too —')
await page.locator('button[aria-label^="Reorder"]').nth(0).focus()
await page.keyboard.press('ArrowDown')
await page.waitForTimeout(200)
eq('the focused label moved down one', (await chain()).slice(0, 2), ['Lab', 'Meeting'])

console.log('\n— the add-task sheet shows the same chain —')
await page.goto(URL_, { waitUntil: 'networkidle' })
await page.waitForSelector('#root > *')
await page.getByText('Add a task', { exact: false }).first().click()
await page.waitForTimeout(400)
await page.getByText('No label', { exact: false }).first().click()
await page.waitForTimeout(300)
const chipText = await page.$$eval('button', bs => bs.map(b => b.textContent.trim()))
const places = ['Lab', 'Meeting', 'Class', 'Study'].map(n => chipText.indexOf(n))
eq('the chips run in the saved order', places.every((v, i) => v >= 0 && (i === 0 || v > places[i - 1])), true)

await page.getByRole('button', { name: 'Meeting', exact: true }).first().click()
await page.waitForTimeout(200)
eq('a plain tap still just picks the label',
  await page.$$eval('button', bs => bs.some(b => b.textContent.trim() === '✓ Meeting')), true)

console.log('\n— the task menu: press and hold a chip to carry it —')
await page.goto(URL_, { waitUntil: 'networkidle' })
await page.waitForSelector('#root > *')
await clickText('More ▾')
await page.waitForTimeout(250)
await clickText('Task Menu')
await page.waitForTimeout(400)
await page.getByText('Add a task to the menu').click()
await page.waitForTimeout(400)
const chipBox = (name) => page.getByRole('button', { name, exact: true }).first().boundingBox()
const held = await chipBox('Study'), onto = await chipBox('Lab')
await page.mouse.move(held.x + held.width / 2, held.y + held.height / 2)
await page.mouse.down()
await page.waitForTimeout(400)             // hold still, so the drag arms
await page.mouse.move(onto.x + onto.width / 2, onto.y + onto.height / 2, { steps: 14 })
await page.mouse.up()
await page.waitForTimeout(300)
const menuChips = await page.$$eval('button', bs => bs.map(b => b.textContent.trim()))
eq('the held chip took the slot it was dropped on',
  menuChips.indexOf('Study') >= 0 && menuChips.indexOf('Study') < menuChips.indexOf('Lab'), true)
eq('carrying a chip did not also select it', menuChips.includes('✓ Study'), false)

await openLabelSettings()
const settingsChain = await chain()
eq('settings agrees with the task menu',
  settingsChain.indexOf('Study') < settingsChain.indexOf('Lab'), true)

eq('no uncaught errors', errors, [])

console.log(`\n${pass} passed, ${fail} failed`)
await browser.close()
server.close()
process.exit(fail ? 1 : 0)

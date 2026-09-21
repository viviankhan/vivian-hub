// Real-browser test of the blob noticing you were gone.
//
// The whole point of the feature is the days you *didn't* open anything, so
// there is no way to check it from the pure rule alone: it only works if the
// app actually remembers when it last had you, asks on the way back in, and
// writes the answer into the past rather than onto today. This drives that
// end to end in a real browser — arrive after two days away, answer the blob,
// and read back what landed in storage.
//
// Sits alongside browser.test.mjs / dayrail.browser.test.mjs and serves the
// same built app; run them all with `npm run test:browser`.
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

const pad = n => String(n).padStart(2, '0')
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const today = new Date()
const dayKey = keyOf(today)
// Two days and a bit ago — clear of any night window, so the stretch qualifies
// under the default rule however the clock happens to sit when this runs.
const awaySince = new Date(today.getTime() - 50 * 3600 * 1000)
const COMMITMENTS = [
  { id: 'c1', text: 'Stats lecture', date: dayKey, cat: 'school', done: false, time: '10:00', durationMins: 90 },
  { id: 'c2', text: 'Lab write-up', date: dayKey, cat: 'school', done: false, time: '14:30', durationMins: 120 },
]

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', g, '\n        want', w) }
}
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, detail ? '\n        ' + detail : '') }
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const errors = []
// A context that opens as though the app had been closed `hoursAgo` hours ago,
// with a schedule for the timeline to lay out. The seeding is an init script
// rather than an evaluate-then-reload, because the app writes "I'm here" the
// moment it boots: any presence planted after a first load is simply the
// present again, and the absence under test never existed.
const arriveAfter = async (hoursAgo, rules = null) => {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 940 } })
  await ctx.addInitScript(({ seen, cs, rules }) => {
    if (localStorage.getItem('__seeded')) return      // survive a reload untouched
    localStorage.setItem('__seeded', '1')
    const rec = { seen, handled: null, handledAt: 0 }
    // Both copies: the local one and the synced mirror. Presence takes the
    // later of the two (an evening spent in the app on a laptop must not read
    // as absence on the phone), so seeding only one proves nothing.
    localStorage.setItem('bloom_presence', JSON.stringify(rec))
    localStorage.setItem('vivian_wellness_presence', JSON.stringify(rec))
    localStorage.setItem('vivian_commitments', JSON.stringify(cs))
    if (rules) localStorage.setItem('vivian_wellness_rules', JSON.stringify(rules))
  }, { seen: Date.now() - hoursAgo * 3600 * 1000, cs: COMMITMENTS, rules })
  const page = await ctx.newPage()
  page.on('pageerror', e => errors.push(String(e)))
  page.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource/i.test(m.text())) errors.push('console: ' + m.text()) })
  await page.goto(URL_, { waitUntil: 'networkidle' })
  await page.waitForSelector('.rail-blob', { timeout: 20000 })
  return { ctx, page }
}

console.log('\n— coming back after two days —')
const { ctx, page } = await arriveAfter(50)
await page.waitForSelector('.rail-nudge', { timeout: 15000 })
const said = (await page.locator('.rail-nudge-say').innerText()).trim()
ok('the blob says it has not seen you', /haven.t seen you since/i.test(said), said)
ok('and says how long that was, in waking hours', /\d+\s*(d|h)\b/i.test(said), said)

console.log('\n— filling the stretch in —')
await page.click('.rail-nudge-yes')
await page.waitForSelector('.rail-gap', { timeout: 5000 })
const spanText = (await page.locator('.rail-gap').innerText()).replace(/\s+/g, ' ').trim()
ok('the sheet states the span before writing anything', /→ now/.test(spanText), spanText)
ok('and says how many days it covers', /3 days/.test(spanText), spanText)

// Rough, carrying a low mood through it, felt at a 7.
await page.locator('.rail-moodpick').first().click()
await page.waitForTimeout(250)
await page.getByRole('button', { name: /Low mood/ }).click()
await page.waitForTimeout(250)
await page.locator('.rail-scale-dot').nth(6).click()
await page.waitForTimeout(150)
await page.locator('.rail-log').click()
await page.waitForTimeout(900)

const stored = await page.evaluate(() => ({
  checkins: JSON.parse(localStorage.getItem('vivian_wellness_checkins') || '[]'),
  episodes: JSON.parse(localStorage.getItem('vivian_wellness_episodes') || '[]'),
  presence: JSON.parse(localStorage.getItem('bloom_presence') || '{}'),
}))

const days = [...new Set(stored.checkins.map(c => c.date))].sort()
eq('a mood check-in for every day the absence touched', days.length, 3)
ok('the earliest lands on the day you disappeared, not today',
  days[0] === keyOf(awaySince), `${days[0]} vs ${keyOf(awaySince)}`)
ok('and the latest on today', days[days.length - 1] === dayKey, days[days.length - 1])
ok('each covers a stretch of its own day rather than an instant',
  stored.checkins.every(c => c.ts && c.endTs && Date.parse(c.endTs) > Date.parse(c.ts)))
eq('all of them carry the one mood you gave', [...new Set(stored.checkins.map(c => c.mood))], [1])
ok('and are marked as filled in after the fact', stored.checkins.every(c => c.via === 'absence'))

eq('the condition is one span, not three fragments', stored.episodes.length, 1)
eq('rated at what you said, and already closed', [stored.episodes[0].intensity, !!stored.episodes[0].end], [7, true])
ok('running from when you went quiet',
  Math.abs(Date.parse(stored.episodes[0].start) - awaySince.getTime()) < 120000,
  stored.episodes[0].start)

console.log('\n— and never asked twice —')
ok('the absence is remembered as handled', !!stored.presence.handled, JSON.stringify(stored.presence))
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.rail-blob', { timeout: 15000 })
await page.waitForTimeout(1200)
eq('so coming back again asks nothing', await page.locator('.rail-nudge').count(), 0)
ok('while the stretch it wrote is still on the rail',
  (await page.locator('.rail-mood').count()) > 0)

// A night's sleep is not an absence — the rule's whole reason for existing, and
// the difference between a nudge that means something and one you swipe away
// every single morning. The night window is moved onto the last nine hours
// rather than waiting for the test to be run at 7am, so the same nine-hour gap
// that would otherwise qualify is read as a night and stays silent.
console.log('\n— a normal night says nothing —')
const hhmm = (msFromNow) => {
  const d = new Date(Date.now() + msFromNow)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const night = await arriveAfter(9, {
  enabled: true, hours: 8, skipSleep: true,
  sleepStart: hhmm(-9.5 * 3600 * 1000), sleepEnd: hhmm(0.5 * 3600 * 1000),
  askConditions: true, maxDays: 14,
})
await night.page.waitForTimeout(1800)
eq('nine hours inside the night window is not an absence', await night.page.locator('.rail-nudge').count(), 0)
// …and the same nine hours, with the night switched off, is.
const counted = await arriveAfter(9, {
  enabled: true, hours: 8, skipSleep: false,
  sleepStart: '22:00', sleepEnd: '08:00', askConditions: true, maxDays: 14,
})
await counted.page.waitForSelector('.rail-nudge', { timeout: 15000 })
eq('the very same gap, counting nights, is', await counted.page.locator('.rail-nudge').count(), 1)
await night.ctx.close()

// The rule is the "condition" the whole feature hangs on, so it has to be
// changeable — and the change has to actually reach storage, not just the
// screen it was made on.
console.log('\n— setting the rule yourself —')
const rulePage = counted.page
// Widened so the wellness tab is one click on the top bar rather than a trip
// through the phone drawer — the rule, not the navigation, is what's on test.
await rulePage.setViewportSize({ width: 1200, height: 900 })
await rulePage.waitForTimeout(400)
await rulePage.locator('.nav-btn', { hasText: 'Wellness' }).first().click()
await rulePage.waitForTimeout(800)
const card = rulePage.locator('.wl-card', { hasText: 'When I go quiet' })
ok('the wellness tab carries the rule', await card.count() > 0)
await card.getByRole('button', { name: '4h', exact: true }).click()
await rulePage.waitForTimeout(600)
const savedRule = await rulePage.evaluate(() => JSON.parse(localStorage.getItem('vivian_wellness_rules') || 'null'))
eq('a shorter threshold is saved', savedRule.hours, 4)
await card.getByRole('button', { name: 'Turn off' }).click()
await rulePage.waitForTimeout(600)
eq('and turning it off is saved too',
  await rulePage.evaluate(() => JSON.parse(localStorage.getItem('vivian_wellness_rules') || 'null').enabled), false)

eq('no uncaught errors', errors, [])

await counted.ctx.close()
await ctx.close()
await browser.close()
server.close()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

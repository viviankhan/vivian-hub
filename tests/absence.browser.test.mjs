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
const arriveAfter = async (hoursAgo, rules = null, cs = COMMITMENTS) => {
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
  }, { seen: Date.now() - hoursAgo * 3600 * 1000, cs, rules })
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

// The words for what you were carrying are yours, and they have to be usable
// the moment you need them — not after a detour through a settings screen.
await page.getByRole('button', { name: /name one/ }).click()
await page.locator('.rail-cond-adder input').fill('Depressed')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
const rows = page.locator('.rail-whenday')
eq('a condition named here is added and picked in one go', await rows.count(), 1)
ok('with your own word on it', /Depressed/.test(await rows.first().innerText()))
ok('and it is in the palette for next time',
  await page.evaluate(() => (JSON.parse(localStorage.getItem('vivian_wellness_effects') || '[]'))
    .some(f => f.name === 'Depressed')))

// A second condition, narrowed to the days it was actually there — the whole
// point of the day chips: "depressed all week, anxious only since yesterday".
await page.getByRole('button', { name: /^Anxious$/ }).click()
await page.waitForTimeout(300)
eq('two conditions, each with their own days', await rows.count(), 2)
const anxiousDays = rows.nth(1).locator('.rail-day')
eq('a condition starts as the whole stretch', await anxiousDays.evaluateAll(b => b.filter(x => x.className.includes('on')).length), 3)
await anxiousDays.first().click()
await page.waitForTimeout(250)
eq('and a day can be taken off it', await anxiousDays.evaluateAll(b => b.filter(x => x.className.includes('on')).length), 2)

await page.locator('.rail-moodpick').first().click()
await page.waitForTimeout(250)
await page.locator('.rail-log').click()
await page.waitForTimeout(900)

const stored = await page.evaluate(() => ({
  checkins: JSON.parse(localStorage.getItem('vivian_wellness_checkins') || '[]'),
  episodes: JSON.parse(localStorage.getItem('vivian_wellness_episodes') || '[]'),
  presence: JSON.parse(localStorage.getItem('bloom_presence') || '{}'),
  effects: JSON.parse(localStorage.getItem('vivian_wellness_effects') || '[]'),
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

const named = stored.effects.find(f => f.name === 'Depressed')
const mine = stored.episodes.find(e => e.effectId === named.id)
const anxious = stored.episodes.find(e => e.effectId === 'fx-anxious')
eq('one span per condition, not one per day', stored.episodes.length, 2)
ok('the one you named runs the whole stretch',
  Math.abs(Date.parse(mine.start) - awaySince.getTime()) < 120000, mine.start)
ok('while the narrowed one starts a day later, at that day’s own beginning',
  Date.parse(anxious.start) > Date.parse(mine.start) && new Date(anxious.start).getHours() === 0,
  anxious.start)
ok('both are closed, not left running', !!mine.end && !!anxious.end)

// The point of the whole feature is the feeling that those days are down.
const flash = (await page.locator('.rail-blob-flash').innerText()).replace(/\s+/g, ' ').trim()
ok('the blob says what it wrote down', /Written down: depressed and anxious/i.test(flash), flash)
ok('and hands the day back', /today can start from here/i.test(flash), flash)

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

// The blob can only notice the absences it sees. A streak you came back from
// before it counted — or one on a device this app wasn't on — still has to be
// loggable, which is what the third bubble on the blob's crown is for.
console.log('\n— logging a streak nobody asked about —')
const past = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return keyOf(d) }
const hand = await arriveAfter(1, null, [
  { id: 'h0', text: 'Stats lecture', date: dayKey, cat: 'school', done: false, time: '10:00', durationMins: 90 },
  { id: 'h1', text: 'Email advisor', date: past(1), cat: 'school', done: false, time: '09:00', durationMins: 30 },
  { id: 'h2', text: 'Groceries', date: past(1), cat: 'home', done: false, time: '17:00', durationMins: 45 },
  { id: 'h3', text: 'Lab write-up', date: past(2), cat: 'school', done: false, time: '14:00', durationMins: 60 },
  { id: 'h4', text: 'Call mum', date: past(2), cat: 'home', done: true, time: '19:00', durationMins: 20 },
])
await hand.page.waitForTimeout(1200)
eq('an hour away raises no question of its own', await hand.page.locator('.rail-nudge').count(), 0)
await hand.page.click('.rail-blob-btn')
await hand.page.waitForTimeout(400)
await hand.page.click('.rail-bub-streak')
await hand.page.waitForSelector('.rail-gap', { timeout: 5000 })
ok('the sheet opens asking how far back it goes', await hand.page.locator('.rail-backs').count() > 0)
eq('it starts on three days', (await hand.page.locator('.rail-gap').innerText()).includes('3 days'), true)
await hand.page.getByRole('button', { name: 'a week', exact: true }).click()
await hand.page.waitForTimeout(300)
eq('and reaches back as far as you say', (await hand.page.locator('.rail-gap').innerText()).includes('7 days'), true)
await hand.page.getByRole('button', { name: '3 days', exact: true }).click()
await hand.page.waitForTimeout(300)

// The pile those days are still holding. Offered, never assumed — and today's
// own task is not part of it.
const letgo = hand.page.locator('.rail-letgo')
ok('it offers to let go of what was waiting', await letgo.count() > 0)
ok('counting only the unfinished, and not today’s',
  /3 things/.test(await letgo.innerText()), (await letgo.innerText()).replace(/\n/g, ' '))

await hand.page.getByRole('button', { name: /name one/ }).click()
await hand.page.locator('.rail-cond-adder input').fill('Depressed')
await hand.page.keyboard.press('Enter')
await hand.page.waitForTimeout(300)
await hand.page.getByRole('button', { name: /What set it off/ }).click()
await hand.page.waitForTimeout(200)
await hand.page.locator('.rail-note').fill('Three nights of no sleep.')
await letgo.click()
await hand.page.waitForTimeout(200)
await hand.page.locator('.rail-log').click()
await hand.page.waitForTimeout(1200)

const after = await hand.page.evaluate(() => ({
  left: JSON.parse(localStorage.getItem('vivian_commitments') || '[]').map(c => c.text).sort(),
  episodes: JSON.parse(localStorage.getItem('vivian_wellness_episodes') || '[]'),
}))
eq('what was waiting on those days is gone', after.left, ['Call mum', 'Stats lecture'])
eq('the streak itself is one span', after.episodes.length, 1)
eq('carrying the answer to what set it off', after.episodes[0].note, 'Three nights of no sleep.')
const handFlash = (await hand.page.locator('.rail-blob-flash').innerText()).replace(/\s+/g, ' ').trim()
ok('and the blob names it as a streak', /a depressed streak across 3 days/i.test(handFlash), handFlash)
ok('…and says what it swept up', /3 things let go of/i.test(handFlash), handFlash)
await hand.ctx.close()

// ── A streak that is already over ─────────────────────────────
// The presets all run up to now. A streak that began five days ago and lifted
// three days ago needs both ends picked — a start date AND an end date.
console.log('\n— a streak with its own start and end —')
const range = await arriveAfter(1, null, [])
await range.page.waitForTimeout(1200)
await range.page.click('.rail-blob-btn')
await range.page.waitForTimeout(400)
await range.page.click('.rail-bub-streak')
await range.page.waitForSelector('.rail-range', { timeout: 5000 })
// Tap a day on the open calendar, stepping back a month if it's in the last one.
const pickDay = async (p, key) => {
  const d = new Date(key + 'T12:00:00')
  if (d.getMonth() !== new Date().getMonth()) {
    await p.locator('.rail-when-cal').getByRole('button', { name: 'Previous month' }).click()
    await p.waitForTimeout(150)
  }
  await p.locator('.rail-when-cal').getByRole('button', { name: String(d.getDate()), exact: true }).click()
  await p.waitForTimeout(250)
}
eq('the end starts at now', (await range.page.getByRole('button', { name: 'End date' }).innerText()).trim(), 'now')
await range.page.getByRole('button', { name: 'Start date' }).click()
await range.page.waitForTimeout(200)
await pickDay(range.page, past(5))
await range.page.getByRole('button', { name: 'End date' }).click()
await range.page.waitForTimeout(200)
await pickDay(range.page, past(3))
const rangeSpan = (await range.page.locator('.rail-gap').innerText()).replace(/\s+/g, ' ').trim()
ok('the span no longer runs to now', !/→ now/.test(rangeSpan) && /3 days/.test(rangeSpan), rangeSpan)
eq('no preset claims it', await range.page.locator('.rail-back.on').count(), 0)
await range.page.locator('.rail-cond').first().click()
await range.page.waitForTimeout(200)
await range.page.locator('.rail-log').click()
await range.page.waitForTimeout(1000)
const rangeEps = await range.page.evaluate(() => JSON.parse(localStorage.getItem('vivian_wellness_episodes') || '[]'))
const midnight = (key) => new Date(key + 'T00:00:00').toISOString()
const closeOf = (key) => new Date(key + 'T23:59:00').toISOString()
eq('one span, from the start day…', rangeEps.map(e => e.start), [midnight(past(5))])
eq('…to the close of the end day', rangeEps.map(e => e.end), [closeOf(past(3))])
await range.ctx.close()

eq('no uncaught errors', errors, [])

await counted.ctx.close()
await ctx.close()
await browser.close()
server.close()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

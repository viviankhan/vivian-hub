// The edges of a window. Two things the review caught: a clock-change day has
// 23 or 25 hours, so the end of a condition window must be the next local
// midnight rather than "24 hours later"; and momentum anchored to a day in the
// past must ignore everything logged after it. Pinned under a zone that
// actually changes its clocks, so the arithmetic is exercised for real.
process.env.TZ = 'America/New_York'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const W = await import(resolve(REPO, 'src/lib/wellness.js'))
const S = await import(resolve(REPO, 'src/lib/skills.js'))

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', g, '\n        want', w) }
}
const local = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0)
const iso = (...a) => local(...a).toISOString()

console.log('\n— a window ends at the next local midnight, clocks changed or not —')
eq('the zone really changes its clocks', local(2026, 11, 1, 12).getTimezoneOffset() - local(2026, 10, 31, 12).getTimezoneOffset(), 60)
const now = local(2026, 11, 3, 12).getTime()
const autumn = [{ id: 'a', effectId: 'fx-migraine', start: iso(2026, 11, 1, 20), end: iso(2026, 11, 2, 2) }]
eq('a span across the fall-back midnight is cut at midnight, all four hours of it',
  W.effectTotalsBetween(autumn, '2026-10-26', '2026-11-01', now).get('fx-migraine').mins, 240)
const spring = [
  { id: 'b', effectId: 'fx-calm', start: iso(2026, 3, 8, 22), end: iso(2026, 3, 9, 3) },
  { id: 'c', effectId: 'fx-focused', start: iso(2026, 3, 9, 0, 30), end: iso(2026, 3, 9, 0, 50) },
]
const springNow = local(2026, 3, 10, 12).getTime()
eq('a span across the spring-forward midnight is cut at midnight, two hours of it',
  W.effectTotalsBetween(spring, '2026-03-02', '2026-03-08', springNow).get('fx-calm').mins, 120)
eq('a span that lies entirely on the next day is not counted at all',
  W.effectTotalsBetween(spring, '2026-03-02', '2026-03-08', springNow).has('fx-focused'), false)

console.log('\n— momentum anchored to a past day ignores what came after —')
const entries = [
  { date: '2026-08-10', mins: 60, title: 'Write methods section', cat: '' },
  { date: '2026-09-15', mins: 60, title: 'Write methods section', cat: '' },
  { date: '2026-10-05', mins: 240, title: 'Write methods section', cat: '' },
  { date: '2026-10-13', mins: 240, title: 'Write methods section', cat: '' },
]
const t = S.skillTrend(entries, [], 30, local(2026, 9, 30)).get('writing')
eq('the recent half is only the window', t.recentMins, 60)
eq('…and the prior half the 30 days before it', t.priorMins, 60)
eq('nothing dated after the anchor leaks in', t.recentCount + t.priorCount, 2)
const open = S.skillTrend(entries, [], 30, local(2026, 10, 14)).get('writing')
eq('anchored to today it still sees today, and the day on the cut', open.recentMins, 540)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

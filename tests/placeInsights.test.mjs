// Insights → Places (src/lib/placeInsights.js): time per place over a window,
// the unnamed check-in stops as "Somewhere else" without double counting, the
// split at midnight, and your mood where you were when you logged it.
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

process.env.TZ = 'America/Chicago'
const REPO = fileURLToPath(new URL('..', import.meta.url))
const { placeInsights, ELSEWHERE } = await import(resolve(REPO, 'src/lib/placeInsights.js'))

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', g, '\n        want', w) }
}
const ms = (s) => Date.parse(s)
const NOW = ms('2026-11-06T20:00')

console.log('\n— a day of check-ins —')
{
  const r = placeInsights({
    stays: [
      { name: 'Home, Rochester', start: ms('2026-11-05T22:00'), end: ms('2026-11-06T08:00') },
      { name: 'Mayo Clinic', start: ms('2026-11-06T08:30'), end: ms('2026-11-06T17:00') },
    ],
    elsewhere: [
      { start: ms('2026-11-06T08:00'), end: ms('2026-11-06T08:30') },   // the drive in
      { start: ms('2026-11-06T17:00'), end: null },                     // left, not home yet
    ],
    checkins: [
      { ts: '2026-11-06T10:00:00', mood: 4 },
      { ts: '2026-11-06T15:00:00', mood: 2 },
      { ts: '2026-11-06T18:00:00', mood: 5 },
    ],
    fromKey: '2026-11-06', toKey: '2026-11-06', now: NOW,
  })
  eq('places, longest first', r.places.map(p => [p.name, p.mins]), [['Mayo Clinic', 510], ['Home', 480], [ELSEWHERE, 210]])
  eq('the window starts at midnight', r.places.find(p => p.name === 'Home').mins, 8 * 60)
  eq('ongoing stop runs to now', r.byDay[0].stops.at(-1), { name: ELSEWHERE, start: ms('2026-11-06T17:00'), end: NOW, mins: 180, ongoing: true })
  eq('mood at a place averages its check-ins', r.places.find(p => p.name === 'Mayo Clinic').mood, 3)
  eq('mood elsewhere', r.places.find(p => p.name === ELSEWHERE).mood, 5)
  eq('top place is a named one', r.top.name, 'Mayo Clinic')
  eq('total = every minute of the day so far', r.totalMins, 20 * 60)
  eq('named time leaves out elsewhere', r.namedMins, 990)
}

console.log('\n— no double counting —')
{
  const r = placeInsights({
    stays: [{ name: 'Mayo Clinic', start: ms('2026-11-06T09:00'), end: ms('2026-11-06T12:00') }],
    elsewhere: [{ start: ms('2026-11-06T08:00'), end: ms('2026-11-06T13:00') }],
    fromKey: '2026-11-06', toKey: '2026-11-06', now: NOW,
  })
  eq('elsewhere is only the uncovered hours', r.places.map(p => [p.name, p.mins]), [['Mayo Clinic', 180], [ELSEWHERE, 120]])
  eq('two visits elsewhere count as one stop', r.places.find(p => p.name === ELSEWHERE).visits, 1)
}

console.log('\n— across days —')
{
  const r = placeInsights({
    stays: [{ name: 'Home', start: ms('2026-11-04T21:00'), end: ms('2026-11-05T07:00') }],
    fromKey: '2026-11-04', toKey: '2026-11-05', now: NOW,
  })
  eq('a night splits at midnight', r.byDay.map(d => [d.date, d.stops[0].mins]), [['2026-11-05', 420], ['2026-11-04', 180]])
  eq('one visit over two days', [r.places[0].visits, r.places[0].days], [1, 2])
  eq('outside the window is left out', placeInsights({
    stays: [{ name: 'Home', start: ms('2026-11-01T09:00'), end: ms('2026-11-01T10:00') }],
    fromKey: '2026-11-04', toKey: '2026-11-05', now: NOW,
  }).places, [])
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)

// Does where you were line up with what you planned? (src/lib/locationCheck.js)
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

process.env.TZ = 'America/Chicago'
const REPO = fileURLToPath(new URL('..', import.meta.url))
const L = await import(resolve(REPO, 'src/lib/locationCheck.js'))

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', g, '\n        want', w) }
}
const ms = (s) => Date.parse(s)
// Rochester: Mayo (Gonda) and home about 3 km apart.
const MAYO = { name: 'Mayo Clinic', lat: 44.0225, lng: -92.4668 }
const HOME = { name: 'Home', lat: 44.0488, lng: -92.4927 }
const GYM  = { name: 'Gym', lat: 44.0300, lng: -92.4800 }
const NOW = ms('2026-11-06T18:00')
const meeting = { key: '2026-11-06_r-lab', id: 'r-lab', date: '2026-11-06', title: 'Weyand lab meeting', place: MAYO, startMs: ms('2026-11-06T13:00'), endMs: ms('2026-11-06T14:00'), done: false }
const stop = (p, a, b, key = p.name) => ({ ...p, key, start: ms(a), end: b ? ms(b) : null })
const pt = (p, a) => ({ lat: p.lat, lng: p.lng, at: ms(a), name: p.name })
const status = (ev, t = meeting) => L.whereDuring(t.place, t.startMs, t.endMs, ev, NOW).status

console.log('\n— where were you during the meeting? —')
eq('checked in at Mayo before it, still there', status({ stops: [stop(MAYO, '2026-11-06T08:30', null)] }), 'there')
eq('arrived late, during it: still there', status({ stops: [stop(HOME, '2026-11-06T07:00', '2026-11-06T13:40'), stop(MAYO, '2026-11-06T13:40', null)] }), 'there')
eq('the open app saw you at Mayo', status({ stays: [{ ...MAYO, start: ms('2026-11-06T13:10'), end: ms('2026-11-06T13:20') }] }), 'there')
eq('at home the whole time (named stop, never left)', status({ stops: [stop(HOME, '2026-11-06T07:00', null)] }), 'elsewhere')
eq('a check-in at the gym during it', status({ points: [pt(GYM, '2026-11-06T13:30')] }), 'elsewhere')
eq('the open app saw you at home during it', status({ stays: [{ ...HOME, start: ms('2026-11-06T13:05'), end: ms('2026-11-06T13:50') }] }), 'elsewhere')
eq('left home before it, nothing after: unknown', status({ stops: [stop(HOME, '2026-11-06T07:00', '2026-11-06T12:30'), { lat: 44.04, lng: -92.48, key: null, name: '', start: ms('2026-11-06T12:30'), end: null }] }), 'unknown')
eq('no sightings at all: unknown', status({}), 'unknown')
eq('home only part of the window: unknown, not elsewhere', status({ stops: [stop(HOME, '2026-11-06T07:00', '2026-11-06T13:30')] }), 'unknown')

console.log('\n— reviewing the day —')
const ev = { stops: [stop(HOME, '2026-11-06T07:00', null)] }
const r = L.reviewLocatedTasks([meeting], ev, { now: NOW })
eq('missed while home → inbox', r.map(t => [t.title, t.action, t.seen.name]), [['Weyand lab meeting', 'inbox', 'Home']])
eq('unknown → ask', L.reviewLocatedTasks([meeting], {}, { now: NOW }).map(t => t.action), ['ask'])
eq('done → nothing', L.reviewLocatedTasks([{ ...meeting, done: true }], ev, { now: NOW }), [])
eq('not over yet → nothing', L.reviewLocatedTasks([meeting], ev, { now: ms('2026-11-06T13:30') }), [])
eq('already decided → nothing', L.reviewLocatedTasks([meeting], ev, { now: NOW, decided: k => k === meeting.key }), [])
eq('a week old → left alone', L.reviewLocatedTasks([meeting], ev, { now: ms('2026-11-13T18:00') }), [])
eq('no duration: 30 minutes', L.reviewLocatedTasks([{ ...meeting, endMs: null }], ev, { now: ms('2026-11-06T13:31') }).length, 1)

console.log('\n— today, lined up —')
const day = [meeting, { ...meeting, key: 'k2', title: 'Gym', place: GYM, startMs: ms('2026-11-06T19:00'), endMs: ms('2026-11-06T20:00') }]
eq('past one at home, later one upcoming', L.lineUp(day, ev, NOW).map(t => t.status), ['elsewhere', 'upcoming'])
eq('in progress and not there yet: now', L.lineUp([meeting], ev, ms('2026-11-06T13:15')).map(t => t.status), ['now'])
eq('in progress and there: there', L.lineUp([meeting], { stops: [stop(MAYO, '2026-11-06T12:50', null)] }, ms('2026-11-06T13:15')).map(t => t.status), ['there'])

console.log('\n— suggesting a place —')
const occ = (d) => ({ taskId: 'r-lab', title: 'Weyand lab meeting', startMs: ms(`2026-11-0${d}T13:00`), endMs: ms(`2026-11-0${d}T14:00`) })
const atMayo = (d) => stop(MAYO, `2026-11-0${d}T08:00`, `2026-11-0${d}T17:00`)
eq('seen at Mayo twice → suggest Mayo', L.suggestTaskPlaces([occ(2), occ(3)], [MAYO, HOME], { stops: [atMayo(2), atMayo(3)] }, { now: NOW }).map(s => [s.taskId, s.place.name, s.times]), [['r-lab', 'Mayo Clinic', 2]])
eq('once is not a habit', L.suggestTaskPlaces([occ(2), occ(3)], [MAYO, HOME], { stops: [atMayo(2)] }, { now: NOW }), [])
eq('mixed places → no suggestion', L.suggestTaskPlaces([occ(2), occ(3), occ(4)], [MAYO, HOME],
  { stops: [atMayo(2), atMayo(3), stop(HOME, '2026-11-04T07:00', '2026-11-04T20:00')], points: [] }, { now: NOW }).map(s => s.times), [])
eq('a title naming a place', L.suggestTaskPlaces([{ taskId: 'r-gym', title: 'Gym session', startMs: ms('2026-11-05T18:00') }], [GYM, HOME], {}, { now: NOW }).map(s => [s.place.name, s.why]), [['Gym', 'name']])
eq('"Homework" is not Home', L.suggestTaskPlaces([{ taskId: 'r-hw', title: 'Homework', startMs: ms('2026-11-05T18:00') }], [GYM, HOME], {}, { now: NOW }), [])

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)

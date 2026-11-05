// Arrive/leave from an iPhone Shortcut (src/lib/placeStamps.js): a day runs
// from its first arrival to its last departure, by local day, so stepping out
// for lunch doesn't end work and a stray departure can't start anything.
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

process.env.TZ = 'America/Chicago'
const REPO = fileURLToPath(new URL('..', import.meta.url))
const P = await import(resolve(REPO, 'src/lib/placeStamps.js'))

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', g, '\n        want', w) }
}
const at = (s) => new Date(s).toISOString()
const ms = (s) => Date.parse(s)
const ev = (kind, s, task_id = 'r-work') => ({ task_id, kind, at: at(s) })

console.log('\n— a day at work —')
eq('arrived, still there', P.placeStamps([ev('arrive', '2026-10-28T09:42')]),
  { 'r-work@2026-10-28': { start: ms('2026-10-28T09:42'), end: null } })
eq('arrived and left', P.placeStamps([ev('arrive', '2026-10-28T09:42'), ev('leave', '2026-10-28T17:55')]),
  { 'r-work@2026-10-28': { start: ms('2026-10-28T09:42'), end: ms('2026-10-28T17:55') } })
eq('lunch out and back: first arrival to last departure', P.placeStamps([
  ev('arrive', '2026-10-28T09:42'), ev('leave', '2026-10-28T12:01'),
  ev('arrive', '2026-10-28T12:40'), ev('leave', '2026-10-28T18:10')]),
  { 'r-work@2026-10-28': { start: ms('2026-10-28T09:42'), end: ms('2026-10-28T18:10') } })
eq('back from lunch and still there: no end yet', P.placeStamps([
  ev('arrive', '2026-10-28T09:42'), ev('leave', '2026-10-28T12:01'), ev('arrive', '2026-10-28T12:40')]),
  { 'r-work@2026-10-28': { start: ms('2026-10-28T09:42'), end: null } })

console.log('\n— edges —')
eq('a departure with no arrival that day is ignored', P.placeStamps([ev('leave', '2026-10-28T08:00')]), {})
eq('days are local: 11pm CDT stays on its own day', Object.keys(P.placeStamps([ev('arrive', '2026-10-28T23:00')])), ['r-work@2026-10-28'])
eq('separate items and days stay apart', Object.keys(P.placeStamps([
  ev('arrive', '2026-10-27T09:30'), ev('arrive', '2026-10-28T09:30'), ev('arrive', '2026-10-28T10:00', 'c-1')])).sort(),
  ['c-1@2026-10-28', 'r-work@2026-10-27', 'r-work@2026-10-28'])
eq('junk rows are skipped', P.placeStamps([{ task_id: 'r-work', kind: 'arrive', at: 'nope' }, { kind: 'arrive', at: at('2026-10-28T09:00') }]), {})

// ── Check-ins: one link for every automation ─────────────────────
// A commute, every automation running Bloom check-in. Pins are ~1 km apart
// except the desk and its parking lot, which sit 120 m apart.
const HOME = { name: 'Heritage Manor', lat: 44.0300, lng: -92.4700 }
const LOT = { name: 'Guggenheim lot', lat: 44.0218, lng: -92.4668 }
const DESK = { name: 'Guggenheim desk', lat: 44.0207, lng: -92.4669, radius: 50 }
const ROCA = { name: 'Roca', lat: 44.0400, lng: -92.4500 }
const PLACES = [HOME, LOT, DESK, ROCA]
const ping = (s, p, dLat = 0) => ({ kind: 'ping', lat: p.lat + dLat, lng: p.lng, at: at(s) })
const BUS = { lat: 44.0260, lng: -92.4690 }   // between home and work, nowhere named
const day = [
  ping('2026-11-05T07:50', HOME),          // leave Heritage (still by the door)
  ping('2026-11-05T08:10', LOT),           // arrive in the lot
  ping('2026-11-05T08:15', BUS),           // bus leaves the lot
  ping('2026-11-05T08:35', DESK, 0.0001),  // get to the desk (GPS a bit off)
  ping('2026-11-05T17:05', DESK),          // leave Guggenheim
  ping('2026-11-05T17:12', LOT),           // leave the lot
  ping('2026-11-05T17:40', HOME),          // home
]
const stops = P.checkinStops(day, PLACES)
console.log('\n— a day of check-ins —')
eq('each stop runs until the next check-in somewhere else',
  stops.map(s => [s.name || '(somewhere else)', new Date(s.start).toTimeString().slice(0, 5), s.end && new Date(s.end).toTimeString().slice(0, 5)]),
  [['Heritage Manor', '07:50', '08:10'], ['Guggenheim lot', '08:10', '08:15'], ['(somewhere else)', '08:15', '08:35'],
   ['Guggenheim desk', '08:35', '17:12'], ['Guggenheim lot', '17:12', '17:40'], ['Heritage Manor', '17:40', null]])
eq('the desk and the lot next to it stay apart', P.placeForCheckin({ lat: LOT.lat, lng: LOT.lng }, PLACES).name, 'Guggenheim lot')
eq('a repeat check-in at the same place doesn\'t split the stop',
  P.checkinStops([ping('2026-11-05T09:00', ROCA), ping('2026-11-05T10:30', ROCA)], PLACES).length, 1)
eq('arrive/leave rows without a location are left out', P.checkinStops([ev('arrive', '2026-11-05T09:00')], PLACES), [])

console.log('\n— located items from check-ins —')
const work = { id: 'r-work', location: { lat: 44.02074, lng: -92.46689 } }
eq('Work runs from reaching the desk to leaving it', P.locatedStamps(stops, [work]),
  { 'r-work@2026-11-05': { start: ms('2026-11-05T08:35'), end: ms('2026-11-05T17:12') } })
eq('the lot 120 m away isn\'t work', Object.keys(P.locatedStamps(P.checkinStops([ping('2026-11-05T08:10', LOT), ping('2026-11-05T08:15', BUS)], PLACES), [work])), [])
eq('still at the desk: no end yet', P.locatedStamps(P.checkinStops(day.slice(0, 4), PLACES), [work]),
  { 'r-work@2026-11-05': { start: ms('2026-11-05T08:35'), end: null } })
const lunch = [...day.slice(0, 4), ping('2026-11-05T12:00', BUS), ping('2026-11-05T12:40', DESK), ...day.slice(4)]
eq('lunch out and back keeps one workday', P.locatedStamps(P.checkinStops(lunch, PLACES), [work]),
  { 'r-work@2026-11-05': { start: ms('2026-11-05T08:35'), end: ms('2026-11-05T17:12') } })

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)

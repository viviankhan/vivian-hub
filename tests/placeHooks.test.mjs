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

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)

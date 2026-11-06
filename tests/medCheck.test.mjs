// "Did you take your meds?" (src/lib/medCheck.js): which unanswered doses Bloom
// asks about, and when.
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

process.env.TZ = 'America/Chicago'
const REPO = fileURLToPath(new URL('..', import.meta.url))
const { pendingMedChecks } = await import(resolve(REPO, 'src/lib/medCheck.js'))

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', g, '\n        want', w) }
}
const ms = (s) => Date.parse(s)
const ids = (list) => list.map(d => `${d.date} ${d.id}`)
const am = { id: 'r-am', title: 'Morning meds', time: '08:00' }
const pm = { id: 'r-pm', title: 'Evening meds', time: '20:00' }
const any = { id: 'r-any', title: 'Vitamin D', time: null }
const doses = (...days) => days.flatMap(date => [am, pm, any].map(m => ({ ...m, date })))

console.log('\n— when it asks —')
eq('not before its time', ids(pendingMedChecks({ doses: doses('2026-11-06'), now: ms('2026-11-06T07:55') })), [])
eq('not inside the grace window', ids(pendingMedChecks({ doses: doses('2026-11-06'), now: ms('2026-11-06T08:20') })), [])
eq('after time + 30 min', ids(pendingMedChecks({ doses: doses('2026-11-06'), now: ms('2026-11-06T08:30') })), ['2026-11-06 r-am'])
eq('untimed: not today', ids(pendingMedChecks({ doses: doses('2026-11-06'), now: ms('2026-11-06T23:00') })), ['2026-11-06 r-am', '2026-11-06 r-pm'])
eq('yesterday: every unanswered dose, oldest first', ids(pendingMedChecks({ doses: doses('2026-11-05', '2026-11-06'), now: ms('2026-11-06T09:00') })),
  ['2026-11-05 r-am', '2026-11-05 r-pm', '2026-11-05 r-any', '2026-11-06 r-am'])
eq('older days are left alone', ids(pendingMedChecks({ doses: doses('2026-11-04'), now: ms('2026-11-06T09:00') })), [])
eq('yesterday is marked', pendingMedChecks({ doses: doses('2026-11-05'), now: ms('2026-11-06T09:00') })[0].yesterday, true)

console.log('\n— answered and snoozed —')
const answered = (date, id) => date === '2026-11-06' && id === 'r-am'
eq('an answer (taken or skipped) stops the question', ids(pendingMedChecks({ doses: doses('2026-11-06'), answered, now: ms('2026-11-06T21:00') })), ['2026-11-06 r-pm'])
eq('ask me later, for a while', ids(pendingMedChecks({ doses: doses('2026-11-06'), snoozed: { '2026-11-06_r-am': ms('2026-11-06T10:00') }, now: ms('2026-11-06T09:00') })), [])
eq('then again', ids(pendingMedChecks({ doses: doses('2026-11-06'), snoozed: { '2026-11-06_r-am': ms('2026-11-06T10:00') }, now: ms('2026-11-06T10:01') })), ['2026-11-06 r-am'])

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)

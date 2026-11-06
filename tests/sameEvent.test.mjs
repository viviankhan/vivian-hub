// Same appointment, two titles (src/lib/sameEvent.js) — with Vivian's real
// Nov 9 and Nov 13 duplicates.
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const { isSameEvent, findSameEvent } = await import(resolve(REPO, 'src/lib/sameEvent.js'))

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', g, '\n        want', w) }
}
const c = (text, date, time, durationMins = 60) => ({ text, date, time, durationMins })
const consult = c('Consultation', '2026-11-13', '08:30:00')
const opts = { owner: ['Vivian'] }

console.log('\n— the same visit —')
eq('"Vivian\'s appointment" is the 8:30 Consultation', isSameEvent({ title: "Vivian's appointment", date: '2026-11-13', time: '08:30', durationMins: 60 }, consult, opts), true)
eq('the doubled Weinhold consultation', isSameEvent(c('Consultation with Megan Weinhold, APRN, C.N.P.', '2026-11-09', '07:45'), c('Consultation with Megan Weinhold, APRN, C.N.P.', '2026-11-09', '07:45:00'), opts), true)
eq('"Weinhold visit" at 7:50 is that consultation', isSameEvent({ title: 'Weinhold visit', date: '2026-11-09', time: '07:50', durationMins: 60 }, c('Consultation with Megan Weinhold, APRN, C.N.P.', '2026-11-09', '07:45:00'), opts), true)
eq('no length given: still the same', isSameEvent({ title: 'Appointment', date: '2026-11-13', time: '08:30' }, consult, opts), true)

eq('anyone\'s appointment, no owner given', isSameEvent({ title: "Mom's appointment", date: '2026-11-13', time: '08:30', durationMins: 60 }, consult), true)

console.log('\n— different things —')
eq('a different day', isSameEvent({ title: "Vivian's appointment", date: '2026-11-12', time: '08:30', durationMins: 60 }, consult, opts), false)
eq('an hour later', isSameEvent({ title: "Vivian's appointment", date: '2026-11-13', time: '09:30', durationMins: 60 }, consult, opts), false)
eq('a much longer thing at the same time', isSameEvent({ title: 'Appointment', date: '2026-11-13', time: '08:30', durationMins: 180 }, consult, opts), false)
eq('double-booked: lab meeting vs class', isSameEvent({ title: 'Weyand lab meeting', date: '2026-08-31', time: '13:00', durationMins: 60 }, c('BLOW class', '2026-08-31', '13:00'), opts), false)
eq('a named thing vs a generic one', isSameEvent({ title: 'Dentist', date: '2026-11-13', time: '08:30', durationMins: 60 }, consult, opts), false)
eq('"Lab meeting: Geoff" vs "Coffee with Danya"', isSameEvent(c('Lab meeting: Geoff', '2026-11-06', '08:30', 90), c('Coffee with Danya', '2026-11-06', '08:30', 90), opts), false)

console.log('\n— finding it —')
eq('finds the consultation among the day', findSameEvent({ title: "Vivian's appointment", date: '2026-11-13', time: '08:30', durationMins: 60 },
  [c('Work', '2026-11-13', '09:10', 510), consult], opts)?.text, 'Consultation')
eq('a block is never the match', findSameEvent({ title: 'Work shift', date: '2026-11-13', time: '09:10', durationMins: 510 }, [{ ...c('Work', '2026-11-13', '09:10', 510), block: true }], opts), null)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)

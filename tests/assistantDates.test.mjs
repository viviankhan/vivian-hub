// The assistant's guard against its own "no date → today" fallback when
// reading photos (src/lib/parseEvent.js: saysToday, flagGuessedDates).
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const shim = resolve(here, '.parseEvent.shim.mjs')
writeFileSync(shim, readFileSync(resolve(here, '../src/lib/parseEvent.js'), 'utf8')
  .replace(/import\.meta\.env\.VITE_SUPABASE_URL/g, '""')
  .replace(/import\.meta\.env\.VITE_SUPABASE_ANON_KEY/g, '""'))
const P = await import(shim)

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', g, '\n        want', w) }
}
const today = '2026-09-28'

console.log('\n— what counts as the photo saying "today" —')
eq('"today"', P.saysToday('Today at 5pm', today), true)
eq('"tonight"', P.saysToday('tonight', today), true)
eq('numeric date', P.saysToday('9/28', today), true)
eq('month name', P.saysToday('Mon, Sept 28', today), true)
eq('a different day', P.saysToday('Oct 4', today), false)
eq('nothing quoted', P.saysToday('', today), false)
eq('a bare weekday is not proof', P.saysToday('Monday', today), false)

console.log('\n— a flyer + an agenda: the agenda items fell back to today —')
const plan = [
  { kind: 'create', title: 'Fall Festival', date: '2026-10-04', dateFrom: 'Sat Oct 4', time: '10:00' },
  { kind: 'create', title: 'Pumpkin carving', date: today, dateFrom: '', time: '11:00' },
  { kind: 'create', title: 'Hayride', date: today, time: '13:00' },               // older function: no dateFrom
  { kind: 'event', title: 'Festival weekend', startDate: today, endDate: '2026-10-05', dateFrom: '' },
  { kind: 'create', title: 'RSVP', date: today, dateFrom: 'RSVP by today' },
  { kind: 'create', title: 'No date anywhere', date: '' },
  { kind: 'setDone', taskId: 'x', done: true },
]
const out = P.flagGuessedDates(plan, { today, command: '' })
eq('a date the photo gave is kept', out[0].needsDate, undefined)
eq('today with nothing saying so is flagged', [out[1].needsDate, out[1].guessedToday], [true, true])
eq('same when the function sent no dateFrom', out[2].needsDate, true)
eq('an event starting "today" without proof is flagged', out[3].needsDate, true)
eq('"by today" is believed', out[4].needsDate, undefined)
eq('an undated task must get a date', out[5].needsDate, true)
eq('other kinds untouched', out[6], plan[6])

console.log('\n— the instruction can say today —')
const told = P.flagGuessedDates([{ kind: 'create', title: 'Call', date: today }], { today, command: 'add this for today' })
eq('believed', told[0].needsDate, undefined)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

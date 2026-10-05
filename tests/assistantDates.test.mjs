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

console.log('\n— six overlapping screenshots of a patient-portal appointment list —')
const portal = [
  { kind: 'create', title: 'OBG Procedure', date: '2026-10-07', time: '13:45', durationMins: 60, description: 'Building A, Entrance A2' },
  { kind: 'create', title: 'OBG Procedure', date: '2026-10-07', time: '14:15', durationMins: 60, description: '' },
  { kind: 'create', title: 'OBG Procedure', date: '2026-10-07', time: '14:15', durationMins: 0, description: 'Mayo Family Clinic Northwest, Building A, Entrance A2, Second Floor' },
  { kind: 'create', title: 'Video visit with Dr. Jissy Cyriac', date: '2026-10-16', time: '15:45', reminders: [1440] },
  { kind: 'create', title: 'Ultrasound Pelvis Exam', date: '2026-11-05', time: '07:30' },
  { kind: 'create', title: 'OB/GYN consult with Megan Weinhold, APRN', date: '2026-11-09', time: '07:45' },
  { kind: 'create', title: 'Consultation', date: '2026-11-09', time: '07:45', description: 'Eisenberg Building, Fourth Floor, Desk 4A' },
  { kind: 'create', title: 'Rheumatology consultation', date: '2026-11-13', time: '08:30' },
  { kind: 'create', title: 'Undated', date: '', time: '' },
  { kind: 'create', title: 'Undated', date: '', time: '' },
]
const merged = P.mergeDuplicateItems(portal)
eq('one action per appointment (undated ones left alone)', merged.map(a => `${a.date} ${a.time}`),
  ['2026-10-07 13:45', '2026-10-07 14:15', '2026-10-16 15:45', '2026-11-05 07:30', '2026-11-09 07:45', '2026-11-13 08:30', ' ', ' '])
eq('back-to-back procedures the same day both stay', merged.filter(a => a.date === '2026-10-07').length, 2)
eq('a duplicate fills in what the first copy missed', [merged[1].description, merged[1].durationMins],
  ['Mayo Family Clinic Northwest, Building A, Entrance A2, Second Floor', 60])
eq('the more specific title wins', merged[4].title, 'OB/GYN consult with Megan Weinhold, APRN')
eq('and keeps the other copy’s location', merged[4].description, 'Eisenberg Building, Fourth Floor, Desk 4A')
eq('other kinds pass through', P.mergeDuplicateItems([{ kind: 'setDone', taskId: 'x' }]), [{ kind: 'setDone', taskId: 'x' }])

console.log('\n— the AI read both Oct 7 cards but planned only the 1:45 one —')
const fivePlan = [
  { kind: 'create', title: 'OBG Procedure', date: '2026-10-07', time: '13:45', durationMins: 60, description: 'Mayo Family Clinic Northwest, Building A', reminders: [1440, 90] },
  { kind: 'create', title: 'Video visit with Dr. Jissy Cyriac', date: '2026-10-16', time: '15:45' },
  { kind: 'create', title: 'Ultrasound Pelvis Exam', date: '2026-11-05', time: '07:30' },
  { kind: 'create', title: 'OB/GYN consult with Megan Weinhold, APRN', date: '2026-11-09', time: '07:45' },
  { kind: 'create', title: 'Rheumatology consultation', date: '2026-11-13', time: '08:30' },
]
const seen = [
  { date: '2026-10-07', time: '13:45', title: 'OBG Procedure' },
  { date: '2026-10-07', time: '14:15', title: 'OBG Procedure' },
  { date: '2026-10-07', time: '14:15', title: 'OBG Procedure' },   // same card on the next screenshot
  { date: '2026-10-16', time: '15:45', title: 'Appointment (Video Visit)' },
  { date: '2026-11-05', time: '07:30', title: 'Ultrasound Pelvis Exam' },
  { date: '2026-11-09', time: '07:45', title: 'Consultation' },
  { date: '2026-11-13', time: '08:30', title: 'Consultation' },
  { date: '2026-11-20', time: '09:00', title: 'Lab draw' },          // read but never planned, nothing to copy
]
const filled = P.fillMissedCards(fivePlan, seen)
eq('the 2:15 visit and the lab draw are added, once each', filled.added, 2)
eq('in date order next to their day', filled.actions.map(a => `${a.date} ${a.time}`),
  ['2026-10-07 13:45', '2026-10-07 14:15', '2026-10-16 15:45', '2026-11-05 07:30', '2026-11-09 07:45', '2026-11-13 08:30', '2026-11-20 09:00'])
eq('the added 2:15 visit carries the 1:45 one’s place and reminders',
  [filled.actions[1].title, filled.actions[1].description, filled.actions[1].reminders], ['OBG Procedure', 'Mayo Family Clinic Northwest, Building A', [1440, 90]])
eq('an unmatched card becomes a plain task', [filled.actions[6].title, filled.actions[6].durationMins], ['Lab draw', 60])
eq('nothing seen, nothing changed', P.fillMissedCards(fivePlan, undefined), { actions: fivePlan, added: 0 })

console.log('\n— reminders follow Settings unless the instruction asks for some —')
const withLeads = [{ kind: 'create', title: 'OBG Procedure', reminders: [1440, 90] }, { kind: 'create', title: 'Lab', reminders: [] }, { kind: 'setDone', taskId: 'x' }]
eq('invented reminders are dropped (photo only, no instruction)', P.keepAskedReminders(withLeads, '').map(a => a.reminders), [[], [], undefined])
eq('dropped for an instruction that never mentions them', P.keepAskedReminders(withLeads, 'add these appointments')[0].reminders, [])
eq('kept when asked', P.keepAskedReminders(withLeads, 'add these and remind me 2 hours before')[0].reminders, [1440, 90])
eq('"alarm" counts as asking', P.keepAskedReminders(withLeads, 'set an alarm the day before')[0].reminders, [1440, 90])

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

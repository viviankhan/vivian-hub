// Repeating tasks from the AI assistant (src/lib/parseEvent.js) and the
// yearly rule they rely on (src/lib/occurrences.js).
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const shim = resolve(here, '.parseEvent.shim.mjs')
writeFileSync(shim, readFileSync(resolve(here, '../src/lib/parseEvent.js'), 'utf8')
  .replace(/import\.meta\.env\.VITE_SUPABASE_URL/g, '""')
  .replace(/import\.meta\.env\.VITE_SUPABASE_ANON_KEY/g, '""'))
const P = await import(shim)
const O = await import(resolve(here, '../src/lib/occurrences.js'))

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', g, '\n        want', w) }
}

console.log('\n— birthdays repeat every year even if the AI forgot —')
const [bday, meeting, gym, noDate] = P.applyRepeatDefaults([
  { kind: 'create', title: "Mom's birthday", date: '2027-03-14' },
  { kind: 'create', title: 'Team meeting', date: '2026-10-02' },
  { kind: 'create', title: 'Gym', date: '2026-10-05', repeat: { freq: 'weekly', interval: 1, days: [] } },
  { kind: 'create', title: "Sam's bday", date: '' },
])
eq('birthday → yearly', bday.repeat, { freq: 'yearly', interval: 1, days: [], endDate: '' })
eq('a one-off stays one-off', meeting.repeat, null)
eq('weekly with no days takes the date\'s weekday', gym.repeat.days, ['monday'])
eq('an undated birthday needs a date', noDate.needsDate, true)
eq('described', P.describeRepeat(bday.repeat), 'Repeats: Yearly')
eq('described weekly', P.describeRepeat({ freq: 'weekly', interval: 2, days: ['monday', 'thursday'] }), 'Repeats: Every 2 weeks · Mon, Thu')

console.log('\n— it becomes a real recurring template —')
const t = P.recurringFromTask({ ...bday, time: '', description: 'Call her', subtasks: [{ text: 'buy card' }], categoryIds: ['fam'] }, bday.repeat, { id: 'r-1', today: '2026-09-29' })
eq('shape', [t.id, t.freq, t.interval, t.monthDay, t.startDate, t.label, t.cat], ['r-1', 'yearly', 1, 14, '2027-03-14', "Mom's birthday", 'fam'])
eq('subtasks kept in the note', t.note, 'Call her\n• buy card')
const g = P.recurringFromTask({ title: 'Gym', date: '2026-10-05', time: '07:00', durationMins: 60 }, { freq: 'weekly', days: ['monday', 'thursday'] }, { id: 'r-2', today: '2026-09-29' })
eq('timed weekly', [g.label, g.days, g.durationMins], ['7:00 AM — Gym', ['monday', 'thursday'], 60])

console.log('\n— the yearly rule lands once a year —')
eq('on the day', O.recurringActiveOn(t, '2028-03-14'), true)
eq('not the day before', O.recurringActiveOn(t, '2028-03-13'), false)
eq('not the same day next month', O.recurringActiveOn(t, '2028-04-14'), false)
eq('not before it starts', O.recurringActiveOn(t, '2026-03-14'), false)
const leap = { freq: 'yearly', startDate: '2028-02-29', monthDay: 29 }
eq('Feb 29 birthday shows Feb 28 in other years', O.recurringActiveOn(leap, '2029-02-28'), true)
eq('and Feb 29 in leap years', O.recurringActiveOn(leap, '2032-02-29'), true)
const every2 = { freq: 'yearly', interval: 2, startDate: '2026-06-01', monthDay: 1 }
eq('every 2 years skips odd ones', [O.recurringActiveOn(every2, '2027-06-01'), O.recurringActiveOn(every2, '2028-06-01')], [false, true])

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

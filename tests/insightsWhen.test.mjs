// "When did I first / last …?" is a question about a date, not a total
// (src/lib/insights.js answerWhen). These pin it: the question is recognised,
// the framing words drop out of the topic, it searches everything ever logged
// rather than the page's window, and it says when nothing matches.
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const I = await import(resolve(REPO, 'src/lib/insights.js'))

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', g, '\n        want', w) }
}
const e = (date, title, desc = '', mins = 60) => ({ date, title, desc, mins, cat: '', subList: [] })

const all = [
  e('2026-09-01', 'Gym'),
  e('2026-09-14', 'Work', 'Onboarding, laptop setup'),
  e('2026-09-15', 'Work', 'Grant proposal'),
  e('2026-10-20', 'Work', 'Grant proposal budget'),
  e('2026-10-21', 'MCAT study', 'CARS passages'),
]
const week = all.filter(x => x.date >= '2026-10-16')

console.log('\n— recognising the question —')
eq('"what was my first day of work?" is a first-question', I.whenIntent('What was my first day of work?'), 'first')
eq('"when did I last study MCAT?" is a last-question', I.whenIntent('When did I last study MCAT?'), 'last')
eq('"when did I start the grant proposal" is a first-question', I.whenIntent('when did I start the grant proposal'), 'first')
eq('"how many hours on work" is not', I.whenIntent('how many hours on work'), null)
eq('"what did I get done last week" is not', I.whenIntent('what did I get done last week'), null)

console.log('\n— answering from everything, not the window —')
const a = I.answerQuestion(week, 'What was my first day of work?', [], { allEntries: all })
eq('it is a when-answer', a.type, 'when')
eq('…about "work", not "what first day work"', a.topic, 'work')
eq('…on the first day work was logged, outside the 7-day window', a.date, '2026-09-14')
eq('…showing that day\'s sessions', a.dayEntries.map(x => x.desc), ['Onboarding, laptop setup'])
eq('…and counting every work session', a.sessions, 3)
eq('…knowing tracking began earlier', a.trackedSince, '2026-09-01')

const b = I.answerQuestion(week, 'When was the last time I did the grant proposal?', [], { allEntries: all })
eq('last time for a phrase from the description', b.date, '2026-10-20')
eq('…first seen', b.firstDate, '2026-09-15')

const c = I.answerQuestion(week, 'When did I first do pottery?', [], { allEntries: all })
eq('nothing ever matched → no date', c.date, null)
eq('…but still names what it looked for', c.topic, 'pottery')

const d = I.answerQuestion(week, 'What was my first day?', [], { allEntries: all })
eq('no topic → the first day anything was logged', d.date, '2026-09-01')

console.log('\n— the hours question is untouched —')
const h = I.answerQuestion(all, 'how many hours on work', [])
eq('still a topic answer', [h.type, h.sessions, h.totalMins], ['topic', 3, 180])

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)

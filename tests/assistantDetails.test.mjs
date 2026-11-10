// Details are not subtasks (src/lib/assistantDetails.js) — with the seminar
// flyer the assistant read on Nov 10, 2026.
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const D = await import(resolve(REPO, 'src/lib/assistantDetails.js'))

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', g, '\n        want', w) }
}
const flyer = [
  'In person: Phoenix - IERB Auditorium - AZ PX RE 01 216',
  'Virtual: Teams - https://teams.microsoft.com/meet/22308671589797?p=rDODCunuoV2CPXy4T ; Meeting ID: 223 086 715 897 978 ; Passcode: 5Jv93Vv6',
  'Presenter: James SeongJun Han, Ph.D., Post-Doctoral Scholar, Harvard Medical School',
  'Host: Dr. Hirohito Kita',
].map(text => ({ text, done: false }))

console.log('\n— what a detail looks like —')
eq('the four flyer lines are all details', flyer.map(s => D.isDetailLine(s.text)), [true, true, true, true])
eq('a step is not', ['read chapter 4', 'call to confirm', 'Bring insurance card', 'Email Geoff the slides'].map(D.isDetailLine), [false, false, false, false])
eq('a bare link is a detail', D.isDetailLine('https://zoom.us/j/123'), true)

console.log('\n— moving them —')
const seminar = { kind: 'addSubtasks', taskId: 'c-sem', subtasks: flyer }
const out = D.normalizeActions([{ kind: 'reschedule', taskId: 'c-sem', date: '2026-11-11', time: '13:00' }, seminar])
eq('subtasks on an existing task become its notes', out.map(a => a.kind), ['reschedule', 'addDetails'])
eq('all four lines, in order', out[1].details.length === 4 && out[1].details[3] === 'Host: Dr. Hirohito Kita', true)
const mixed = D.normalizeActions([{ kind: 'addSubtasks', taskId: 'c-x', subtasks: [flyer[3], { text: 'Read the paper first', done: false }] }])
eq('real steps stay steps', mixed.map(a => [a.kind, a.details || a.subtasks.map(s => s.text)]), [['addDetails', ['Host: Dr. Hirohito Kita']], ['addSubtasks', ['Read the paper first']]])
const created = D.normalizeActions([{ kind: 'create', title: 'Seminar', description: 'Aging and immunity', subtasks: [...flyer.slice(0, 1), { text: 'Bring laptop', done: false }] }])[0]
eq('on a new task they go in its description', [created.description, created.subtasks.map(s => s.text)], ['Aging and immunity\nIn person: Phoenix - IERB Auditorium - AZ PX RE 01 216', ['Bring laptop']])
const plain = [{ kind: 'addSubtasks', taskId: 'c-y', subtasks: [{ text: 'read chapter 4', done: true }] }]
eq('nothing to move: the same plan back', D.normalizePlan({ summary: '', actions: plain }).actions === plain, true)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)

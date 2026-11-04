// Which tasks the assistant is shown (src/lib/parseEvent.js: pickAssistantTasks).
// With more than 150, the ones a request is likely about must make the cut.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const shim = resolve(here, '.parseEvent.tasks.shim.mjs')
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
const today = '2026-11-04'

console.log('\n— 271 tasks, this week\'s coffee added late (#232) —')
const old = Array.from({ length: 231 }, (_, i) => ({ id: 'o' + i, title: 'old ' + i, date: '2026-0' + (1 + (i % 8)) + '-10', done: i % 2 === 0 }))
const coffee = { id: 'c-bravo', title: 'Coffee at Bravo', date: '2026-11-05', time: '08:30:00', done: false }
const later = Array.from({ length: 39 }, (_, i) => ({ id: 'l' + i, title: 'later ' + i, date: '2026-12-' + String(1 + (i % 28)).padStart(2, '0'), done: false }))
const all = [...old, coffee, ...later]
const picked = P.pickAssistantTasks(all, today)
eq('sends at most 150', picked.length, 150)
eq('the coffee is sent', picked.some(t => t.id === 'c-bravo'), true)
eq('soonest upcoming first', picked[0].id, 'c-bravo')
eq('every upcoming task is sent', later.every(l => picked.some(t => t.id === l.id)), true)

console.log('\n— small lists go as they are —')
eq('under the cap: unchanged', P.pickAssistantTasks([coffee], today), [coffee])

console.log('\n— a task from a few days ago still counts as recent —')
const recent = { id: 'r', title: 'Dentist', date: '2026-10-31', done: false }
const many = [...old, ...old.map(t => ({ ...t, id: t.id + 'b' })), recent]
eq('undone last-week task is sent', P.pickAssistantTasks(many, today).some(t => t.id === 'r'), true)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)

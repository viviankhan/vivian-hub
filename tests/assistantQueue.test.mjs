// The AI assistant's queue (src/lib/assistantQueue.js): a request you send is
// read in the background and waits as suggestions you can edit, accept, or
// delete — so you never have to sit and watch a screenshot load.
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const Q = await import(resolve(here, '../src/lib/assistantQueue.js'))

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', g, '\n        want', w) }
}
const tick = () => new Promise(r => setTimeout(r, 0))
const settle = async () => { for (let i = 0; i < 10; i++) await tick() }

console.log('\n— a queued request is read in the background and waits for review —')
Q.__resetForTests()
const calls = []
const ready = []
Q.startQueue({
  run: async (item, ctx) => { calls.push({ cmd: item.command, today: item.today, tasks: ctx.tasks.length }); return { summary: 's', actions: [{ kind: 'create', title: 'Dentist' }] } },
  ctx: () => ({ tasks: [1, 2, 3] }),
  decorate: plan => ({ ...plan, actions: plan.actions.map(a => ({ ...a, icon: 'glyph:tooth' })) }),
  onReady: it => ready.push(it.id),
})
const a = Q.enqueue({ command: 'dentist tue 3pm', today: '2026-10-07' })
eq('enqueued as pending (or already running)', ['pending', 'running'].includes(Q.getQueue()[0].status), true)
await settle()
eq('ran once with the day it was asked and current tasks', calls, [{ cmd: 'dentist tue 3pm', today: '2026-10-07', tasks: 3 }])
eq('now ready', Q.getQueue()[0].status, 'ready')
eq('decorated with an icon', Q.getQueue()[0].plan.actions[0].icon, 'glyph:tooth')
eq('onReady told', ready, [a.id])
eq('counts as unseen + ready', [Q.unseenCount(Q.getQueue()), Q.readyCount(Q.getQueue())], [1, 1])
Q.markAllSeen()
eq('seen after looking', Q.unseenCount(Q.getQueue()), 0)

console.log('\n— editing a suggestion keeps it in the queue —')
Q.updatePlan(a.id, { summary: 's', actions: [{ kind: 'create', title: 'Dentist (edited)' }] })
eq('edited title stored', Q.getQueue()[0].plan.actions[0].title, 'Dentist (edited)')

console.log('\n— one at a time, oldest first; failures can be retried —')
Q.__resetForTests()
let fails = 1
const order = []
Q.startQueue({
  run: async (item) => {
    order.push(item.command)
    if (item.command === 'b' && fails-- > 0) throw new Error('offline')
    return { summary: '', actions: [] }
  },
})
const b = Q.enqueue({ command: 'a' })
const c = Q.enqueue({ command: 'b' })
await settle()
eq('ran in order', order, ['a', 'b'])
eq('b failed with its message', [Q.getQueue()[1].status, Q.getQueue()[1].error], ['error', 'offline'])
Q.retry(c.id)
await settle()
eq('retry succeeds', Q.getQueue()[1].status, 'ready')

console.log('\n— delete, and clear —')
Q.removeItem(b.id)
eq('deleted one', Q.getQueue().map(i => i.command), ['b'])
Q.enqueue({ command: 'x' })
Q.clearQueue()
eq('cleared everything', Q.getQueue().length, 0)

console.log('\n— a request deleted while it was being read is let go —')
Q.__resetForTests()
let release
Q.startQueue({ run: () => new Promise(r => { release = r }) })
const d = Q.enqueue({ command: 'slow' })
await settle()
Q.removeItem(d.id)
release({ summary: '', actions: [] })
await settle()
eq('stays gone', Q.getQueue().length, 0)

console.log('\n— reopening the app picks up where it left off —')
const revived = Q.reviveItems([
  { id: '2', createdAt: 2, status: 'running' },
  { id: '1', createdAt: 1, status: 'ready' },
  null,
])
eq('running → pending, oldest first', revived.map(i => [i.id, i.status]), [['1', 'ready'], ['2', 'pending']])

console.log('\n— trimming lets old finished ones go, never waiting ones —')
const many = [{ id: 'p', status: 'pending' }, { id: 'r1', status: 'ready' }, { id: 'r2', status: 'ready' }, { id: 'p2', status: 'pending' }]
eq('drops the oldest finished', Q.trimItems(many, 3).map(i => i.id), ['p', 'r2', 'p2'])

console.log('\n— labels —')
eq('typed text', Q.itemLabel({ command: '  dentist   next tue ' }), 'dentist next tue')
eq('photos only', Q.itemLabel({ command: '', photos: [{}, {}] }), '2 screenshots')
eq('a file', Q.itemLabel({ command: '', photos: [], docs: [{ name: 'syllabus.pdf' }] }), 'syllabus.pdf')

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)

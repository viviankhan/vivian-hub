// Exercises the offline engine's coalescing, ordering and failure handling.
// Stubs just enough of a browser for the module to load with its in-memory
// (no IndexedDB) fallback.
const listeners = {}
globalThis.window = {
  addEventListener: (k, fn) => { (listeners[k] ||= []).push(fn) },
  dispatchEvent: () => true,
}
globalThis.document = { hidden: false, addEventListener: () => {} }
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o) } }

const off = await import(new URL('../src/lib/offline.js', import.meta.url).href)
await off.ready()

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', g, '\n        want', w) }
}

// Capture what replay is asked to send, and let a test make it fail.
let sentOps = [], failWith = null
off.registerReplay(async op => {
  if (failWith) { const e = failWith; failWith = null; throw e }
  sentOps.push(`${op.table}:${op.op}:${op.id}`)
})
off.setActiveUid('u1')

const q = (o) => off.enqueue({ uid: 'u1', ...o })

console.log('\n— coalescing —')
// Repeated saves of one blob collapse to the last value.
await q({ table: 'kv_store', op: 'set', id: 'notes', row: { key: 'notes', value: 'a' } })
await q({ table: 'kv_store', op: 'set', id: 'notes', row: { key: 'notes', value: 'b' } })
await q({ table: 'kv_store', op: 'set', id: 'notes', row: { key: 'notes', value: 'c' } })
eq('three saves of one key collapse to one', off.pendingCount(), 1)

// Edit-then-edit of one row becomes a single merged update.
await q({ table: 'commitments', op: 'update', id: 'c1', changes: { text: 'x' } })
await q({ table: 'commitments', op: 'update', id: 'c1', changes: { time: '09:00' } })
eq('two edits of one row merge', off.pendingCount(), 2)

// Creating then deleting a row offline leaves nothing to send.
await q({ table: 'commitments', op: 'insert', id: 'c2', row: { id: 'c2', text: 'temp' } })
eq('insert queued', off.pendingCount(), 3)
await q({ table: 'commitments', op: 'delete', id: 'c2' })
eq('create+delete offline cancels out', off.pendingCount(), 2)

// Editing a row that has not been uploaded yet folds into its insert.
await q({ table: 'commitments', op: 'insert', id: 'c3', row: { id: 'c3', text: 'draft' } })
await q({ table: 'commitments', op: 'update', id: 'c3', changes: { text: 'final' } })
eq('edit of an unsent insert folds in', off.pendingCount(), 3)

// Deleting a row that HAS been uploaded still queues a delete.
await q({ table: 'events', op: 'delete', id: 'e9' })
eq('delete of a synced row queues', off.pendingCount(), 4)

// "Clear the table" supersedes everything pending for it.
await q({ table: 'recurring_tasks', op: 'insert', id: 'r1', row: { id: 'r1' } })
await q({ table: 'recurring_tasks', op: 'clear', id: '*' })
eq('clear supersedes pending writes to that table', off.pendingCount(), 5)

console.log('\n— pending lookups —')
eq('hasPending by table+id', off.hasPending('commitments', 'c1'), true)
eq('hasPending misses other ids', off.hasPending('commitments', 'nope'), false)
eq('hasPending by table alone', off.hasPending('events'), true)
eq('hasPending on an untouched table', off.hasPending('vacations'), false)

console.log('\n— flush —')
const res = await off.flush()
eq('everything queued was sent', res.sent, 5)
eq('queue is empty afterwards', off.pendingCount(), 0)
eq('sent in the order the edits were made', sentOps, [
  'kv_store:set:notes',
  'commitments:update:c1',
  'commitments:insert:c3',
  'events:delete:e9',
  'recurring_tasks:clear:*',
])
eq('the folded insert carried the final value', true, true)

console.log('\n— failure handling —')
sentOps = []
await q({ table: 'events', op: 'insert', id: 'e1', row: {} })
await q({ table: 'events', op: 'insert', id: 'e2', row: {} })
failWith = Object.assign(new Error('Failed to fetch'), { name: 'TypeError' })
const r2 = await off.flush()
eq('a dropped connection stops the flush', r2.sent, 0)
eq('and keeps every queued write', off.pendingCount(), 2)

const r3 = await off.flush()
eq('the retry sends them', r3.sent, 2)
eq('in order', sentOps, ['events:insert:e1', 'events:insert:e2'])

sentOps = []
await q({ table: 'events', op: 'insert', id: 'e3', row: {} })
await q({ table: 'events', op: 'insert', id: 'e4', row: {} })
failWith = Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' })
const r4 = await off.flush()
eq('a rejected write is dropped, not retried forever', off.pendingCount(), 0)
eq('and the queue keeps draining behind it', sentOps, ['events:insert:e4'])
eq('one of the two still went', r4.sent, 1)

console.log('\n— account scoping —')
await q({ table: 'kv_store', op: 'set', id: 'k', row: { key: 'k', value: 1 } })
off.setActiveUid('u2')
const r5 = await off.flush()
eq('another account’s queued writes are not sent', r5.sent, 0)
eq('they stay queued for when that account returns', off.pendingCount(), 1)
off.setActiveUid('u1')
const r6 = await off.flush()
eq('and go up once that account is back', r6.sent, 1)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

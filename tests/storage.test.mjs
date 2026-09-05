// End-to-end test of the offline wiring in src/lib/storage.js: reads fall back
// to the mirror, writes queue while offline, and the queue replays into the
// (mock) database when the connection returns.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = fileURLToPath(new URL('..', import.meta.url))

// Browser globals the modules expect, installed before either is loaded.
const store = new Map()
globalThis.localStorage = {
  get length() { return store.size },
  key: i => [...store.keys()][i],
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
}
globalThis.window = { addEventListener: () => {}, dispatchEvent: () => true }
globalThis.document = { hidden: false, addEventListener: () => {} }
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o) } }

// storage.js is source that Vite normally transforms (bare import + import.meta.env).
// Rewrite just those two things so Node can load the real file unmodified otherwise.
const src = readFileSync(resolve(REPO, 'src/lib/storage.js'), 'utf8')
  .replace("from '@supabase/supabase-js'", `from ${JSON.stringify(resolve(here, 'mock-supabase.mjs'))}`)
  .replace("from './offline.js'", `from ${JSON.stringify(resolve(REPO, 'src/lib/offline.js'))}`)
  .replace('import.meta.env.VITE_SUPABASE_URL', JSON.stringify('https://proj.supabase.co'))
  .replace('import.meta.env.VITE_SUPABASE_ANON_KEY', JSON.stringify('anon-key'))
const shimPath = resolve(here, '.storage.shim.mjs')
writeFileSync(shimPath, src)

const mock = await import(resolve(here, 'mock-supabase.mjs'))
const off = await import(resolve(REPO, 'src/lib/offline.js'))
const S = await import(shimPath)

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', g, '\n        want', w) }
}
const goOffline = () => { mock.state.offline = true; globalThis.navigator.onLine = false }
const goOnline  = () => { mock.state.offline = false; globalThis.navigator.onLine = true }

await off.ready()
S.setStorageUser('user-1')

console.log('\n— online writes reach the database —')
await S.dbSet('notes', 'hello')
const c1 = await S.addCommitment({ id: 'c1', text: 'Dentist', date: '2026-09-08', cat: 'health' })
await S.setCompletion('c1', true)
eq('kv row written', mock.state.tables.kv_store?.[0]?.value, 'hello')
eq('commitment written', mock.state.tables.commitments?.length, 1)
eq('addCommitment returns the row', c1.text, 'Dentist')
eq('completion written', mock.state.tables.task_completions?.length, 1)
eq('nothing is queued while online', off.pendingCount(), 0)

console.log('\n— reads work with no network —')
goOffline()
eq('notes served from the mirror', await S.getNotes(), 'hello')
eq('commitments served from the mirror', (await S.getCommitments()).map(c => c.text), ['Dentist'])
eq('completions served from the mirror', await S.getCompletions(), { c1: true })
eq('a table never read stays empty, not undefined', await S.getEvents(), [])

console.log('\n— edits made offline are kept and queued —')
await S.dbSet('notes', 'edited on the train')
await S.addCommitment({ id: 'c2', text: 'Groceries', date: '2026-09-09', cat: '' })
await S.updateCommitment('c1', { time: '14:30' })
await S.setCompletion('c2', true)
await S.addEvent({ id: 'ev1', label: 'Retreat', startDate: '2026-09-20', endDate: '2026-09-22' })
await S.addLogEntry({ date: '2026-09-09', label: 'Groceries', tag: '', storageKey: 'c2' })

eq('the note reads back as edited', await S.getNotes(), 'edited on the train')
eq('the new task is there', (await S.getCommitments()).map(c => c.text).sort(), ['Dentist', 'Groceries'])
eq('the edit to the old task stuck', (await S.getCommitments()).find(c => c.id === 'c1').time, '14:30')
eq('the new event is there', (await S.getEvents()).map(e => e.label), ['Retreat'])
eq('the log entry is there', (await S.getLogEntries()).map(e => e.label), ['Groceries'])
eq('nothing reached the database', mock.state.tables.commitments.length, 1)
eq('six changes are waiting', off.pendingCount(), 6)

console.log('\n— an offline write does not throw at the caller —')
let threw = false
try { await S.dbSet('thoughts', [{ id: 't1' }]) } catch { threw = true }
eq('dbSet resolves instead of erroring', threw, false)

console.log('\n— reconnecting uploads everything —')
goOnline()
const flushed = await off.flush()
eq('the queue drained', off.pendingCount(), 0)
eq('every change was sent', flushed.sent, 7)
eq('the note is in the database', mock.state.tables.kv_store.find(r => r.key === 'notes').value, 'edited on the train')
eq('both tasks are in the database', mock.state.tables.commitments.map(r => r.text).sort(), ['Dentist', 'Groceries'])
eq('the offline edit landed', mock.state.tables.commitments.find(r => r.id === 'c1').time, '14:30')
eq('the event landed', mock.state.tables.events.map(r => r.label), ['Retreat'])
eq('the log entry landed', mock.state.tables.log_entries.map(r => r.label), ['Groceries'])
eq('both completions landed', mock.state.tables.task_completions.map(r => r.storage_key).sort(), ['c1', 'c2'])

console.log('\n— a task created and deleted offline never reaches the cloud —')
goOffline()
await S.addCommitment({ id: 'c3', text: 'Typo task', date: '2026-09-10', cat: '' })
await S.deleteCommitment('c3')
eq('it is gone locally', (await S.getCommitments()).some(c => c.id === 'c3'), false)
eq('and nothing is queued for it', off.hasPending('commitments', 'c3'), false)
goOnline()
await off.flush()
eq('the database never saw it', mock.state.tables.commitments.some(r => r.id === 'c3'), false)

console.log('\n— unchecking something logged offline —')
goOffline()
await S.addLogEntry({ date: '2026-09-11', label: 'Run', tag: '', storageKey: 'c9' })
await S.deleteLogEntry('Run', 'c9')
eq('the log is back where it was', (await S.getLogEntries()).map(e => e.label), ['Groceries'])
goOnline()
await off.flush()
eq('and the database only has the real entry', mock.state.tables.log_entries.map(r => r.label), ['Groceries'])

console.log('\n— a cloud read never overwrites an unsent edit —')
goOffline()
await S.dbSet('notes', 'my newest text')
goOnline()
// Someone else's device wrote a different value while we were away.
mock.state.tables.kv_store.find(r => r.key === 'notes').value = 'stale remote value'
eq('the pending local edit wins', await S.getNotes(), 'my newest text')
await off.flush()
eq('and it is what ends up in the cloud', mock.state.tables.kv_store.find(r => r.key === 'notes').value, 'my newest text')
eq('afterwards the cloud is authoritative again', await S.getNotes(), 'my newest text')

console.log('\n— a real rejection still surfaces to the caller —')
// Inserting a duplicate id is a server rejection, not a network failure.
let rejected = null
try { await S.addCommitment({ id: 'c1', text: 'Duplicate', date: '2026-09-08', cat: '' }) }
catch (e) { rejected = e.message }
eq('the caller is told', /duplicate key/i.test(rejected || ''), true)
eq('and it was not silently queued', off.pendingCount(), 0)

console.log('\n— a dropped connection mid-write queues instead of failing —')
// navigator still claims to be online; only the request fails.
mock.state.offline = true
globalThis.navigator.onLine = true
let quietlyQueued = true
try { await S.addCommitment({ id: 'c4', text: 'Flaky wifi', date: '2026-09-12', cat: '' }) }
catch { quietlyQueued = false }
eq('the write did not throw', quietlyQueued, true)
eq('it went to the queue', off.hasPending('commitments', 'c4'), true)
goOnline()
await off.flush()
eq('and uploaded on the retry', mock.state.tables.commitments.some(r => r.id === 'c4'), true)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

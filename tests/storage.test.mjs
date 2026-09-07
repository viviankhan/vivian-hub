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
let reauthRequests = 0
globalThis.window.dispatchEvent = e => { if (e && e.type === 'bloom-auth-stale') reauthRequests++; return true }

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

console.log('\n— one app load, one kv_store query —')
// The first load asks for two dozen blobs at once. Sent one at a time that is
// two dozen round trips and two dozen pooled connections per launch, which is
// what wore the database out. They have to leave as a single query.
goOnline()
await off.flush()
const KEYS = ['notes', 'label_meta', 'tracker_folders', 'time_logs', 'task_templates',
              'change_history', 'wellness_checkins', 'art_overrides', 'recurring_meta']
mock.state.tables.kv_store = KEYS.map((key, i) => ({ user_id: 'user-1', key, value: 'v' + i }))
mock.state.calls = []
const batched = await Promise.all(KEYS.map(k => S.dbGet(k)))
const kvSelects = mock.state.calls.filter(c => c === 'kv_store.select').length
eq('nine reads in one tick cost one query', kvSelects, 1)
eq('and every one of them got its own value', batched, KEYS.map((_, i) => 'v' + i))

// The batch must keep every guarantee a single read had.
mock.state.calls = []
eq('a key with no row still reads as null', await S.dbGet('never_written'), null)

await S.dbSet('notes', 'edited offline')   // online here, so it lands in the cloud
goOffline()
await S.dbSet('notes', 'edited with no signal')
const [pendingKey, freshKey] = await Promise.all([S.dbGet('notes'), S.dbGet('label_meta')])
eq('an unsent edit still beats the cloud copy', pendingKey, 'edited with no signal')
eq('and its neighbours still come from the mirror', freshKey, 'v1')
goOnline()
await off.flush()

console.log('\n— the server is down while the device still has wifi —')
// navigator.onLine stays true through a server outage, so nothing else in the
// app notices. Editing must still be silent and lossless.
goOnline()
mock.state.offline = false
const before = mock.state.tables.commitments.length
// A paused/overloaded Supabase project answers with a 5xx rather than refusing
// the connection.
mock.state.forceError = Object.assign(new Error('Service Unavailable'), { status: 503 })
let alerted = false
try { await S.addCommitment({ id: 'd1', text: 'During the outage', date: '2026-09-13', cat: '' }) }
catch { alerted = true }
try { await S.dbSet('notes', 'written during the outage') } catch { alerted = true }
try { await S.setCompletion('d1', true) } catch { alerted = true }
eq('nothing was thrown at the user', alerted, false)
eq('the task is there locally', (await S.getCommitments()).some(c => c.id === 'd1'), true)
eq('the note reads back', await S.getNotes(), 'written during the outage')
eq('the database was not touched', mock.state.tables.commitments.length, before)
eq('it is all queued', off.pendingCount() >= 3, true)

console.log('\n— a stale session mid-outage —')
// A 401 is not the server refusing the data; it means the token needs renewing.
// The edit is valid and must be kept, not thrown back at the user per change.
// The 5xx above left the engine in a known-down state, where it queues without
// trying. Clear that so the request is actually attempted and can come back 401.
off.noteSuccess()
mock.state.forceError = Object.assign(new Error('JWT expired'), { status: 401, code: 'PGRST301' })
let authAlerted = false
try { await S.addCommitment({ id: 'd2', text: 'Stale token', date: '2026-09-14', cat: '' }) }
catch { authAlerted = true }
eq('still nothing thrown at the user', authAlerted, false)
eq('and the edit is queued, not lost', off.hasPending('commitments', 'd2'), true)
eq('the app asked for the session to be renewed', reauthRequests > 0, true)

console.log('\n— the server comes back —')
mock.state.forceError = null
await off.flush()
eq('everything made during the outage went up', mock.state.tables.commitments.filter(r => r.id === 'd1' || r.id === 'd2').length, 2)
eq('including the note', mock.state.tables.kv_store.find(r => r.key === 'notes').value, 'written during the outage')
eq('and the queue is empty', off.pendingCount(), 0)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

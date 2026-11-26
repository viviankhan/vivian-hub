// The move to a new database (storage.js "Carrying this device's copy…").
//
// The first project stopped starting and could not be revived, so the app was
// pointed at a fresh, EMPTY one. Each device's mirror became the only copy of
// the data. These tests pin the three things that must hold for that to be
// safe:
//   1. an empty cloud never overwrites the mirror
//   2. the first device puts everything it holds back in the cloud
//   3. a later device fills gaps and replays its own edits, without
//      re-uploading its (older) copy over the first device's
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = fileURLToPath(new URL('..', import.meta.url))

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

const mock = await import(resolve(here, 'mock-supabase.mjs'))

// One "device" = its own copy of the offline engine (mirror + outbox) and of
// storage.js, all talking to the same mock database.
async function device(tag) {
  store.clear()                     // each device has its own localStorage
  const offUrl = pathToFileURL(resolve(REPO, 'src/lib/offline.js')).href + '?device=' + tag
  const src = readFileSync(resolve(REPO, 'src/lib/storage.js'), 'utf8')
    .replace("from '@supabase/supabase-js'", `from ${JSON.stringify(resolve(here, 'mock-supabase.mjs'))}`)
    .replace("from './offline.js'", `from ${JSON.stringify(offUrl)}`)
    .replace('import.meta.env.VITE_SUPABASE_URL', JSON.stringify('https://new.supabase.co'))
    .replace('import.meta.env.VITE_SUPABASE_ANON_KEY', JSON.stringify('anon-key'))
    .replace("(import.meta.env && import.meta.env.VITE_MOVED_FROM_REF) || ''", JSON.stringify('oldref'))
  const shim = resolve(here, `.move-storage.${tag}.shim.mjs`)
  writeFileSync(shim, src)
  const off = await import(offUrl)
  const S = await import(shim)
  await off.ready()
  return { off, S }
}

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', g, '\n        want', w) }
}
const U = 'u1'
const kvRow = key => (mock.state.tables.kv_store || []).find(r => r.key === key)
const ids = t => (mock.state.tables[t] || []).map(r => r.id).sort()

// ── The phone: a full mirror, plus edits made during the outage ────────────
const phone = await device('phone')
const m = (name, v) => phone.off.cacheWrite(U + ':' + name, v)
await m('kv:notes', 'remember the milk')
await m('kv:scheduled_tasks', [{ id: 't1', text: 'Lab' }, { id: 't2', text: 'Climbing with K' }])
await m('kv:ui_prefs', { theme: 'autumn' })
await m('kv:never_set', null)
await m('categories', [{ id: 'cat-1', label: 'Health', color: '#abc', icon: '', sortOrder: 2 }])
await m('commitments', [
  { id: 'c1', text: 'Dentist', date: '2026-11-30', time: '14:30', prepMin: null, durationMins: 30, cat: 'cat-1', person: null, done: false, createdAt: '2026-11-01T00:00:00Z' },
  { id: 'c9', text: 'Made offline', date: '2026-12-01', cat: '', createdAt: '2026-11-22T00:00:00Z' },
])
await m('events', [{ id: 'ev1', label: 'Retreat', startDate: '2026-12-05', endDate: '2026-12-06', allDay: true, startTime: null, endTime: null, color: '#7C9CBF', icon: '' }])
await m('vacations', [{ id: 'vac-1', label: 'Break', startDate: '2026-12-20', endDate: '2026-12-27' }])
await m('recurring_tasks', [{ id: 'r-1', days: [1, 3], cat: 'cat-1', tag: 'cat-1', startDate: null, endDate: null, label: 'Meds', note: '' }])
await m('log', [{ id: '11111111-1111-4111-8111-111111111111', date: '2026-11-19', dateLabel: 'Thu', label: 'Meds', tag: 'cat-1', storageKey: 'r-1@2026-11-19', ts: '2026-11-19T15:00:00Z' }])
await m('completions', { 'c1': true, 'r-1@2026-11-24': false })
// What was waiting to upload when the old database died. The mirror above
// already reflects all of it.
const q = o => phone.off.enqueue({ uid: U, ...o })
await q({ table: 'kv_store', op: 'set', id: 'scheduled_tasks', row: { key: 'scheduled_tasks', value: [{ id: 't1', text: 'Lab' }, { id: 't2', text: 'Climbing with K' }] } })
await q({ table: 'commitments', op: 'update', id: 'c1', changes: { time: '14:30' } })
await q({ table: 'commitments', op: 'insert', id: 'c9', row: { id: 'c9', text: 'Made offline', date: '2026-12-01', cat: '', createdAt: '2026-11-22T00:00:00Z' } })
await q({ table: 'events', op: 'delete', id: 'ev-gone' })
const waiting = phone.off.pendingCount()

console.log('\n— an unconfirmed sign-in asks the empty database nothing —')
mock.reset()
phone.S.setStorageUser(U, { verified: false })
eq('notes come from this device', await phone.S.getNotes(), 'remember the milk')
eq('tasks come from this device', (await phone.S.getScheduledTasks()).length, 2)
eq('commitments come from this device', (await phone.S.getCommitments()).map(c => c.id), ['c1', 'c9'])
await phone.S.dbSet('notes', 'remember the milk and eggs')
await phone.off.flush()
eq('the database was not asked or written to', mock.state.calls, [])
eq('the edit is waiting', phone.off.pendingCount(), waiting + 1)
eq('the mirror still holds the tasks', (await phone.off.cacheRead(U + ':kv:scheduled_tasks')).length, 2)

console.log('\n— a refused write during the move is kept, not dropped —')
// (A slow database, so the upload that starts by itself when the move settles
// is still in flight when the refusals begin.)
mock.state.delay = 5
phone.S.setStorageUser(U)                       // the sign-in is confirmed
eq('the move settles', await phone.S.settleMove(), true)
const queuedForMove = phone.off.pendingCount()
eq('everything this device holds is queued', queuedForMove > waiting + 1, true)
mock.state.forceError = Object.assign(new Error("Could not find the 'x' column"), { code: 'PGRST204', status: 400 })
await phone.off.flush()
eq('nothing was discarded', phone.off.pendingCount(), queuedForMove)
eq('and reads still come from this device', (await phone.S.getCommitments()).map(c => c.id), ['c1', 'c9'])
mock.state.forceError = null
mock.state.delay = 0

console.log('\n— the first device puts everything back —')
await phone.off.flush()
eq('the outbox drained', phone.off.pendingCount(), 0)
eq('notes (with the edit made while unconfirmed)', kvRow('notes')?.value, 'remember the milk and eggs')
eq('tasks, including the one made during the outage', kvRow('scheduled_tasks')?.value.map(t => t.id), ['t1', 't2'])
eq('prefs', kvRow('ui_prefs')?.value, { theme: 'autumn' })
eq('a key that was never set is not invented', kvRow('never_set'), undefined)
eq('rows are filed under the account', kvRow('notes')?.user_id, U)
eq('the database is marked as moved-into', !!kvRow('__move'), true)
eq('categories', ids('categories'), ['cat-1'])
eq('commitments, once each', ids('commitments'), ['c1', 'c9'])
eq('commitment fields are in database form', mock.state.tables.commitments.find(r => r.id === 'c1').duration_mins, 30)
eq('events', ids('events'), ['ev1'])
eq('vacations', ids('vacations'), ['vac-1'])
eq('recurring tasks', mock.state.tables.recurring_tasks.map(r => [r.id, r.label, r.days]), [['r-1', 'Meds', [1, 3]]])
eq('log entries', mock.state.tables.log_entries.map(r => [r.id.slice(0, 8), r.date_label, r.storage_key]), [['11111111', 'Thu', 'r-1@2026-11-19']])
eq('ticks, including an explicit un-tick', (mock.state.tables.task_completions || []).map(r => [r.storage_key, r.done]).sort(), [['c1', true], ['r-1@2026-11-24', false]])

console.log('\n— afterwards the cloud is read as normal, and says the same thing —')
mock.state.calls = []
eq('notes', await phone.S.getNotes(), 'remember the milk and eggs')
eq('commitments', (await phone.S.getCommitments()).map(c => [c.id, c.time]).sort(), [['c1', '14:30'], ['c9', undefined]].sort())
eq('recurring', (await phone.S.getRecurringTasks()).map(r => r.label), ['Meds'])
eq('ticks', await phone.S.getCompletions(), { 'c1': true, 'r-1@2026-11-24': false })
eq('the cloud was actually asked', mock.state.calls.includes('kv_store.select'), true)
eq('a restart does not upload it all again', (phone.S.setStorageUser(U), await phone.S.settleMove(), phone.off.pendingCount()), 0)

// ── The laptop: an older mirror, one thing the phone never had, one edit ───
console.log('\n— a second device fills gaps and replays its own edits —')
const laptop = await device('laptop')
const lm = (name, v) => laptop.off.cacheWrite(U + ':' + name, v)
await lm('kv:notes', 'an older note')                              // stale: the phone's is newer
await lm('kv:ui_prefs', { theme: 'summer' })                       // stale
await lm('kv:wellness_photo_9', { v: 1, data: 'data:image/jpeg;base64,AAAA' })   // only ever opened here
await lm('kv:quick_links', [{ id: 'q1', url: 'https://example.com' }])            // edited here during the outage
await lm('commitments', [{ id: 'c1', text: 'Dentist', date: '2026-11-30', cat: 'cat-1' }, { id: 'c-old', text: 'Deleted on the phone since', date: '2026-11-10', cat: '' }])
await laptop.off.enqueue({ uid: U, table: 'kv_store', op: 'set', id: 'quick_links', row: { key: 'quick_links', value: [{ id: 'q1', url: 'https://example.com' }] } })
laptop.S.setStorageUser(U)
eq('the move settles', await laptop.S.settleMove(), true)
await laptop.off.flush()
eq('the outbox drained', laptop.off.pendingCount(), 0)
eq('its own edit went up', kvRow('quick_links')?.value?.[0]?.id, 'q1')
eq('the photo only it had went up', kvRow('wellness_photo_9')?.value?.v, 1)
eq('its stale note did NOT replace the phone’s', kvRow('notes')?.value, 'remember the milk and eggs')
eq('its stale prefs did NOT replace the phone’s', kvRow('ui_prefs')?.value, { theme: 'autumn' })
eq('its old rows were not re-added', ids('commitments'), ['c1', 'c9'])
eq('and it now reads what the phone uploaded', await laptop.S.getNotes(), 'remember the milk and eggs')
eq('including the task made during the outage', (await laptop.S.getScheduledTasks()).map(t => t.id), ['t1', 't2'])

// ── A brand-new device has nothing to offer and leaves no mark ─────────────
console.log('\n— a device with nothing leaves no mark —')
mock.reset()
const fresh = await device('fresh')
fresh.S.setStorageUser(U)
eq('the move settles', await fresh.S.settleMove(), true)
await fresh.off.flush()
eq('nothing was written', mock.state.tables.kv_store || [], [])
eq('so a device that does have the data still goes first', kvRow('__move'), undefined)

// ── The database not answering leaves everything as it was ─────────────────
console.log('\n— a server that is not answering changes nothing —')
mock.reset()
const train = await device('train')
await train.off.cacheWrite(U + ':kv:notes', 'still here')
mock.state.offline = true
train.S.setStorageUser(U)
eq('the move does not settle', await train.S.settleMove(), false)
eq('reads come from this device', await train.S.getNotes(), 'still here')
mock.state.offline = false
globalThis.navigator.onLine = true
train.off.noteSuccess()
eq('and it settles when the server is back', await train.S.settleMove(), true)
await train.off.flush()
eq('with the data uploaded', kvRow('notes')?.value, 'still here')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

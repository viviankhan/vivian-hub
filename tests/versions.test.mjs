// Version history (src/lib/versions.js): every write through storage.js is
// journaled with what it replaced, and restoring a version writes the earlier
// state back — to the mirror, the cloud, or the outbox — across kv values, row
// tables and check-offs.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
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

const storageShim = resolve(here, '.versions-storage.shim.mjs')
writeFileSync(storageShim, readFileSync(resolve(REPO, 'src/lib/storage.js'), 'utf8')
  .replace("from '@supabase/supabase-js'", `from ${JSON.stringify(resolve(here, 'mock-supabase.mjs'))}`)
  .replace("from './offline.js'", `from ${JSON.stringify(resolve(REPO, 'src/lib/offline.js'))}`)
  .replace('import.meta.env.VITE_SUPABASE_URL', JSON.stringify('https://proj.supabase.co'))
  .replace('import.meta.env.VITE_SUPABASE_ANON_KEY', JSON.stringify('anon-key')))
const versionsShim = resolve(here, '.versions.shim.mjs')
writeFileSync(versionsShim, readFileSync(resolve(REPO, 'src/lib/versions.js'), 'utf8')
  .replace("from './storage.js'", `from ${JSON.stringify(storageShim)}`))

const mock = await import(resolve(here, 'mock-supabase.mjs'))
const off = await import(resolve(REPO, 'src/lib/offline.js'))
const S = await import(storageShim)
const V = await import(versionsShim)

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', g, '\n        want', w) }
}
const goOffline = () => { mock.state.offline = true; globalThis.navigator.onLine = false }
const goOnline  = () => { mock.state.offline = false; globalThis.navigator.onLine = true }
const tick = () => new Promise(r => setTimeout(r, 5))
const lastSeq = async () => { const vs = await V.listVersions(); return vs.length ? vs[0].seq : 0 }

await off.ready()
S.setStorageUser('user-1')

// The app always reads before it writes; do the same so "before" is known.
await S.getNotes(); await S.getThoughts(); await S.getCommitments(); await S.getEvents()
await S.getCategories(); await S.getCompletions(); await S.getLogEntries(); await S.getUiPrefs()

console.log('\n— the state to come back to —')
await S.setNotes('first draft')
await S.addCommitment({ id: 'c1', text: 'Dentist', date: '2026-09-28', cat: '' })
await S.updateCommitment('c1', { time: '09:00' })
await S.addEvent({ id: 'ev1', label: 'Retreat', startDate: '2026-10-01', endDate: '2026-10-03' })
await S.setCompletion('c1', true)
await S.addLogEntry({ date: '2026-09-28', label: 'Dentist', tag: '', storageKey: 'c1' })
await S.setUiPrefs({ theme: 'sage' })
await V.settled()
const good = await lastSeq()
eq('the edits were journaled', good > 0, true)
const v0 = (await V.listVersions())[0]
eq('the version lists what changed', v0.items.includes('Added task “Dentist”') && v0.items.includes('Edited Notes'), true)
eq('look & feel prefs are not journaled', v0.items.some(t => /Ui prefs/i.test(t)), false)
eq('log entries restore but are not listed', v0.items.some(t => /log entry/.test(t)), false)

console.log('\n— a burst of edits to undo —')
await tick()
await S.setNotes('ruined')
await S.setThoughts([{ id: 't1', text: 'oops' }])
await S.updateCommitment('c1', { text: 'Dentist (moved)', time: '15:00' })
await S.deleteEvent('ev1')
await S.setCompletion('c1', false)
await S.deleteLogEntry('Dentist', 'c1')
await S.addCommitment({ id: 'c2', text: 'Junk', date: '2026-09-29', cat: '' })
await S.addCategory({ id: 'cat-x', label: 'Mistake', color: '#f00' })
eq('changes counted (log entries ride along unlisted)', await V.changesSince(good), 7)

console.log('\n— restoring puts everything back, locally and in the cloud —')
const res = await V.restoreTo(good)
eq('no failures', res.failed, [])
eq('notes back', await S.getNotes(), 'first draft')
eq('thoughts back to empty', await S.getThoughts(), [])
const cs = await S.getCommitments()
eq('only the original task remains', cs.map(c => c.id), ['c1'])
eq('with its text and time from then', [cs[0].text, cs[0].time], ['Dentist', '09:00'])
eq('the deleted event is back', (await S.getEvents()).map(e => e.label), ['Retreat'])
eq('the check-off is back', (await S.getCompletions()).c1, true)
eq('the log entry is back', (await S.getLogEntries()).map(e => e.label), ['Dentist'])
eq('the new label is gone', (await S.getCategories()).some(c => c.id === 'cat-x'), false)
eq('cloud: notes', mock.state.tables.kv_store.find(r => r.key === 'notes').value, 'first draft')
eq('cloud: tasks', mock.state.tables.commitments.map(r => r.text), ['Dentist'])
eq('cloud: event', mock.state.tables.events.map(r => r.label), ['Retreat'])
eq('cloud: check-off', mock.state.tables.task_completions.map(r => r.storage_key), ['c1'])
eq('cloud: prefs untouched', mock.state.tables.kv_store.find(r => r.key === 'ui_prefs').value, { theme: 'sage' })

console.log('\n— the restore is its own version, and can be undone —')
const vs = await V.listVersions()
eq('newest version is the restore', vs[0].restore, true)
eq('it records which version it restored', vs[0].restoredTo, v0.end)
const beforeRestore = vs[1].seq
await V.restoreTo(beforeRestore)
eq('notes ruined again', await S.getNotes(), 'ruined')
eq('junk task back', (await S.getCommitments()).map(c => c.id).sort(), ['c1', 'c2'])
eq('event gone again', await S.getEvents(), [])

console.log('\n— restoring offline queues, then syncs —')
await V.restoreTo(good)   // back to the good state (online)
await S.setNotes('offline mess')
await S.deleteCommitment('c1')
const mark = await lastSeq()
goOffline()
const r2 = await V.restoreTo(good)
eq('offline restore succeeded', r2.failed, [])
eq('reads show the restored notes offline', await S.getNotes(), 'first draft')
eq('and the task', (await S.getCommitments()).map(c => c.text), ['Dentist'])
eq('the cloud has not seen it yet', mock.state.tables.kv_store.find(r => r.key === 'notes').value, 'offline mess')
goOnline()
await off.flush()
eq('after reconnecting the cloud has the notes', mock.state.tables.kv_store.find(r => r.key === 'notes').value, 'first draft')
eq('and the task', mock.state.tables.commitments.map(r => r.text), ['Dentist'])
eq('mark was a real point', mark > good, true)

console.log('\n— setting a value back while a different one is still queued —')
goOffline()
await S.setNotes('queued value')
goOnline()
// The cloud's last confirmed value is "first draft"; setting it back must not be skipped.
await S.setNotes('first draft')
await off.flush()
eq('the cloud ends on the value set last', mock.state.tables.kv_store.find(r => r.key === 'notes').value, 'first draft')

console.log('\n— restore to a moment in time —')
const t0 = Date.now()
await tick()
await S.setNotes('later edit')
eq('one change since then', await V.changesSinceTime(t0), 1)
await V.restoreToTime(t0)
eq('notes as they were at that moment', await S.getNotes(), 'first draft')

console.log('\n— repeated edits fold into one entry —')
const before = (await V.listVersions()).reduce((n, v) => n + v.entries.length, 0)
for (const t of ['a', 'ab', 'abc', 'abcd']) await S.setNotes(t)
await V.settled()
const after = (await V.listVersions()).reduce((n, v) => n + v.entries.length, 0)
eq('typing four times adds one entry', after - before, 1)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

// The move, against a REAL Supabase project (not part of `npm test`).
//
// tests/move.test.mjs proves the logic against a mock. This proves the parts a
// mock can't: that the new project's tables, row-level security and
// adopt-session function accept everything the app sends. It makes a throwaway
// account, plays a device that was signed in to the OLD project through the
// real auth.js + storage.js + supabase-js, checks what landed, and deletes the
// account and every row it made.
//
//   LIVE_URL=https://<ref>.supabase.co LIVE_ANON=… LIVE_SERVICE=… \
//   OLD_JWT_SECRET=… OLD_REF=<old ref> node tests/move.live.test.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createHmac, randomUUID } from 'node:crypto'

const { LIVE_URL, LIVE_ANON, LIVE_SERVICE, OLD_JWT_SECRET, OLD_REF } = process.env
if (!LIVE_URL || !LIVE_ANON || !LIVE_SERVICE || !OLD_JWT_SECRET || !OLD_REF) {
  console.error('Set LIVE_URL, LIVE_ANON, LIVE_SERVICE, OLD_JWT_SECRET and OLD_REF.'); process.exit(2)
}
const here = dirname(fileURLToPath(import.meta.url))
const REPO = fileURLToPath(new URL('..', import.meta.url))

let pass = 0, fail = 0
// Postgres jsonb does not keep the order of an object's keys, so compare
// values, not spellings.
const canon = v => Array.isArray(v) ? v.map(canon)
  : (v && typeof v === 'object') ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v
const eq = (name, got, want) => {
  const g = JSON.stringify(canon(got)), w = JSON.stringify(canon(want))
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', (g || '').slice(0, 400), '\n        want', (w || '').slice(0, 400)) }
}

// ── a throwaway account on the new project ───────────────────
const T = randomUUID()
const EMAIL = `move-selftest-${T.slice(0, 8)}@example.com`
const admin = { apikey: LIVE_SERVICE, Authorization: 'Bearer ' + LIVE_SERVICE, 'Content-Type': 'application/json' }
const rest = (path, init = {}) => fetch(LIVE_URL + path, { ...init, headers: { ...admin, ...(init.headers || {}) } })
{
  const r = await rest('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ id: T, email: EMAIL, password: randomUUID() + randomUUID(), email_confirm: true }) })
  if (!r.ok) { console.error('could not create the test account:', r.status, await r.text()); process.exit(2) }
}
const TABLES = ['kv_store', 'commitments', 'events', 'vacations', 'recurring_tasks', 'categories', 'log_entries', 'task_completions']
async function cleanup() {
  for (const t of TABLES) await rest(`/rest/v1/${t}?user_id=eq.${T}`, { method: 'DELETE' }).catch(() => {})
  await rest(`/rest/v1/kv_history?user_id=eq.${T}`, { method: 'DELETE' }).catch(() => {})
  await rest(`/auth/v1/admin/users/${T}`, { method: 'DELETE' }).catch(() => {})
}

try {
  // ── the token the OLD project would have issued this device ──
  const b64u = b => Buffer.from(b).toString('base64url')
  const iat = Math.floor(Date.now() / 1000) - 6 * 86400
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64u(JSON.stringify({ iss: `https://${OLD_REF}.supabase.co/auth/v1`, sub: T, aud: 'authenticated', role: 'authenticated', email: EMAIL, iat, exp: iat + 3600 }))
  const oldToken = `${head}.${body}.${createHmac('sha256', OLD_JWT_SECRET).update(`${head}.${body}`).digest('base64url')}`

  // ── a browser, as far as the modules can tell ────────────────
  const store = new Map()
  globalThis.localStorage = {
    get length() { return store.size },
    key: i => [...store.keys()][i],
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  }
  globalThis.window = {
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true,
    location: { href: 'http://localhost/', hash: '', search: '', origin: 'http://localhost' },
    localStorage: globalThis.localStorage,
  }
  globalThis.document = { hidden: false, visibilityState: 'visible', addEventListener: () => {}, removeEventListener: () => {} }
  globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o) } }
  // What the device has from before the move: the old project's session, and
  // who was signed in.
  store.set(`sb-${OLD_REF}-auth-token`, JSON.stringify({ access_token: oldToken, refresh_token: 'spent', user: { id: T, email: EMAIL } }))
  store.set('bloom_last_account', JSON.stringify({ id: T, email: EMAIL, at: Date.now() }))

  const offUrl = pathToFileURL(resolve(REPO, 'src/lib/offline.js')).href
  const storageShim = resolve(here, '.move-storage.live.shim.mjs')
  writeFileSync(storageShim, readFileSync(resolve(REPO, 'src/lib/storage.js'), 'utf8')
    .replace("from './offline.js'", `from ${JSON.stringify(offUrl)}`)
    .replace('import.meta.env.VITE_SUPABASE_URL', JSON.stringify(LIVE_URL))
    .replace('import.meta.env.VITE_SUPABASE_ANON_KEY', JSON.stringify(LIVE_ANON))
    .replace("(import.meta.env && import.meta.env.VITE_MOVED_FROM_REF) || ''", JSON.stringify(OLD_REF)))
  const authShim = resolve(here, '.move-storage.live-auth.shim.mjs')
  writeFileSync(authShim, readFileSync(resolve(REPO, 'src/lib/auth.js'), 'utf8')
    .replace("from './storage.js'", `from ${JSON.stringify(pathToFileURL(storageShim).href)}`)
    .replace("from './offline.js'", `from ${JSON.stringify(offUrl)}`))
  const off = await import(offUrl)
  const S = await import(pathToFileURL(storageShim).href)
  const auth = await import(pathToFileURL(authShim).href)
  await off.ready()

  // ── what the device holds ────────────────────────────────────
  const m = (name, v) => off.cacheWrite(T + ':' + name, v)
  const big = 'data:image/jpeg;base64,' + 'A'.repeat(1_500_000)          // a background photo
  const tasks = [
    { id: 't1', text: 'CLL lab meeting', date: '2026-11-25', time: '16:00', durationMins: 60, cats: ['meeting'], subtasks: [{ id: 's1', text: 'slides', done: false }] },
    { id: 't2', text: 'Rock climbing with K', date: '2026-12-02', time: '18:30', durationMins: 120, emoji: '🧗', note: 'unicode — “quotes” & <tags>' },
  ]
  await m('kv:notes', 'line one\nline two')
  await m('kv:scheduled_tasks', tasks)
  await m('kv:ui_prefs', { theme: 'autumn', nested: { a: [1, 2, { b: null }] } })
  await m('kv:bloom_bg_custom', { v: 1, data: big })
  await m('kv:commitment_meta', { c1: { description: 'bring card', subs: [] } })
  await m('kv:never_set', null)
  await m('categories', [
    { id: 'cat-1', label: 'Health', color: '#abc123', icon: '', sortOrder: 2 },
    { id: 'meeting', label: 'Meeting', color: '#4A9EBF', icon: 'flask', sortOrder: 0 },
  ])
  await m('commitments', [
    { id: 'c1', text: 'Dentist', date: '2026-11-30', time: '14:30:00', prepMin: 15, durationMins: 30, cat: 'cat-1', person: 'Dr. A', done: false, createdAt: '2026-11-01T00:00:00+00:00' },
    { id: 'c2', text: 'No time, no category', date: '2026-12-01', time: null, prepMin: null, durationMins: null, cat: '', person: null, done: true, createdAt: '2026-11-02T00:00:00+00:00' },
    { id: 'c9', text: 'Made offline', date: '2026-12-03', cat: null, createdAt: '2026-11-22T00:00:00.000Z' },
    { id: 'c-undated', text: 'Someday', date: null, time: null, cat: '', done: false, createdAt: '2026-11-03T00:00:00+00:00' },
  ])
  await m('events', [
    { id: 'ev1', label: 'Retreat', startDate: '2026-12-05', endDate: '2026-12-06', allDay: true, startTime: null, endTime: null, color: '#7C9CBF', icon: '' },
    { id: 'ev2', label: 'Seminar', startDate: '2026-12-07', endDate: '2026-12-07', allDay: false, startTime: '09:00:00', endTime: '10:30:00', color: '#C97B84', icon: 'book' },
  ])
  await m('vacations', [{ id: 'vac-1', label: 'Break', startDate: '2026-12-20', endDate: '2026-12-27' }])
  await m('recurring_tasks', [
    { id: 'r-1', days: ['Mon', 'Wed', 'Fri'], cat: 'cat-1', tag: 'cat-1', startDate: '2026-09-01', endDate: null, label: 'Meds', note: 'with food' },
    { id: 'r-2', days: [], cat: 'meeting', tag: 'meeting', startDate: null, endDate: null, label: 'CLL lab meeting', note: '' },
  ])
  const logId = randomUUID()
  await m('log', [{ id: logId, date: '2026-11-19', dateLabel: 'Thu, Nov 19', label: 'Meds', tag: 'cat-1', storageKey: 'r-1@2026-11-19', ts: '2026-11-19T15:00:00+00:00' }])
  await m('completions', { 'c2': true, 'r-1@2026-11-24': false, 'r-1@2026-11-25': true })
  // …and what was waiting to upload when the old database died.
  const q = o => off.enqueue({ uid: T, ...o })
  await q({ table: 'kv_store', op: 'set', id: 'scheduled_tasks', row: { key: 'scheduled_tasks', value: tasks } })
  await q({ table: 'commitments', op: 'update', id: 'c1', changes: { time: '14:30:00', prepMin: 15 } })
  await q({ table: 'commitments', op: 'insert', id: 'c9', row: { id: 'c9', text: 'Made offline', date: '2026-12-03', cat: '', createdAt: '2026-11-22T00:00:00.000Z' } })
  await q({ table: 'events', op: 'delete', id: 'ev-gone' })
  await q({ table: 'recurring_tasks', op: 'delete', id: 'r-gone' })
  await q({ table: 'task_completions', op: 'set', id: 'r-1@2026-11-25', row: { storageKey: 'r-1@2026-11-25', done: true, keep: false } })
  await q({ table: 'log_entries', op: 'insert', id: logId, row: { id: logId, date: '2026-11-19', dateLabel: 'Thu, Nov 19', label: 'Meds', tag: 'cat-1', storageKey: 'r-1@2026-11-19', ts: '2026-11-19T15:00:00+00:00' } })

  console.log('\n— the device signs itself in to the new project —')
  const user = await auth.initAuth()
  eq('signed in as the same account', user?.id, T)
  eq('and the server confirmed it', auth.isSessionUnverified(), false)

  console.log('\n— and puts back everything it holds —')
  eq('the move settles', await S.settleMove(), true)
  for (let i = 0; i < 8 && off.pendingCount() > 0; i++) await off.flush()
  eq('nothing is left waiting', off.pendingCount(), 0)
  eq('nothing was refused', off.getStatus().lastError, null)

  const rows = async (t, sel = '*') => (await rest(`/rest/v1/${t}?user_id=eq.${T}&select=${sel}`)).json()
  const kv = Object.fromEntries((await rows('kv_store', 'key,value')).map(r => [r.key, r.value]))
  eq('notes', kv.notes, 'line one\nline two')
  eq('tasks, exactly', kv.scheduled_tasks, tasks)
  eq('prefs, exactly', kv.ui_prefs, { theme: 'autumn', nested: { a: [1, 2, { b: null }] } })
  eq('a 1.5 MB photo', kv.bloom_bg_custom?.data?.length, big.length)
  eq('commitment extras', kv.commitment_meta, { c1: { description: 'bring card', subs: [] } })
  eq('a never-set key is not invented', 'never_set' in kv, false)
  eq('the move marker', kv.__move?.from, OLD_REF)
  const byId = list => Object.fromEntries(list.map(r => [r.id, r]))
  const C = byId(await rows('commitments'))
  eq('commitments', Object.keys(C).sort(), ['c-undated', 'c1', 'c2', 'c9'])
  eq('a full commitment', [C.c1.text, C.c1.date, C.c1.time, C.c1.prep_min, C.c1.duration_mins, C.c1.cat, C.c1.person, C.c1.done], ['Dentist', '2026-11-30', '14:30:00', 15, 30, 'cat-1', 'Dr. A', false])
  eq('a bare commitment', [C.c2.time, C.c2.cat, C.c2.done], [null, '', true])
  eq('one made offline', [C.c9.text, C.c9.cat, C.c9.done], ['Made offline', '', false])
  eq('its original creation time is kept', new Date(C.c1.created_at).toISOString(), '2026-11-01T00:00:00.000Z')
  const E = byId(await rows('events'))
  eq('events', [E.ev1.all_day, E.ev1.start_time, E.ev2.all_day, E.ev2.start_time, E.ev2.end_time, E.ev2.icon], [true, null, false, '09:00:00', '10:30:00', 'book'])
  eq('vacations', (await rows('vacations')).map(r => [r.id, r.start_date, r.end_date]), [['vac-1', '2026-12-20', '2026-12-27']])
  const R = byId(await rows('recurring_tasks'))
  eq('recurring tasks', [R['r-1'].days, R['r-1'].start_date, R['r-1'].note, R['r-2'].label, R['r-2'].days], [['Mon', 'Wed', 'Fri'], '2026-09-01', 'with food', 'CLL lab meeting', []])
  eq('categories', (await rows('categories')).map(r => [r.id, r.label, r.sort_order]).sort(), [['cat-1', 'Health', 2], ['meeting', 'Meeting', 0]])
  eq('log entries', (await rows('log_entries')).map(r => [r.id, r.date, r.date_label, r.storage_key]), [[logId, '2026-11-19', 'Thu, Nov 19', 'r-1@2026-11-19']])
  eq('ticks', (await rows('task_completions', 'storage_key,done')).map(r => [r.storage_key, r.done]).sort(), [['c2', true], ['r-1@2026-11-24', false], ['r-1@2026-11-25', true]])

  console.log('\n— the app then reads the same thing back from the cloud —')
  eq('tasks', await S.getScheduledTasks(), tasks)
  eq('commitments', (await S.getCommitments()).map(c => c.id).sort(), ['c-undated', 'c1', 'c2', 'c9'])
  eq('events', (await S.getEvents()).map(e => [e.id, e.allDay]).sort(), [['ev1', true], ['ev2', false]])
  eq('recurring', (await S.getRecurringTasks()).map(r => r.label).sort(), ['CLL lab meeting', 'Meds'])
  eq('ticks', await S.getCompletions(), { 'c2': true, 'r-1@2026-11-24': false, 'r-1@2026-11-25': true })
  eq('log', (await S.getLogEntries()).map(l => l.id), [logId])
  eq('the mirror was refreshed from the cloud, not emptied', (await off.cacheRead(T + ':commitments')).length, 4)

  console.log('\n— and ordinary edits work on the new project —')
  await S.addCommitment({ id: 'c-new', text: 'After the move', date: '2026-12-09', cat: 'cat-1' })
  await S.updateCommitment('c-new', { time: '08:15', durationMins: 45 })
  await S.setCompletion('c-new', true)
  await S.setScheduledTasks([...tasks, { id: 't3', text: 'New after move' }])
  await S.addEvent({ id: 'ev3', label: 'Trip', startDate: '2026-12-10', endDate: '2026-12-12' })
  await S.deleteEvent('ev3')
  await S.addRecurringTask({ id: 'r-3', label: 'Stretch', days: ['Sat', 'Sun'], cat: 'cat-1' })
  await S.updateRecurringTask('r-3', { label: 'Stretch more', days: ['Sun'], cat: 'cat-1' })
  await S.addCategory({ id: 'cat-2', label: 'Fun', color: '#ff00aa' })
  await S.addLogEntry({ date: '2026-11-26', dateLabel: 'Thu', label: 'After move', tag: 'cat-2', storageKey: 'c-new' })
  await S.addVacation({ id: 'vac-2', label: 'Jan', startDate: '2027-01-02', endDate: '2027-01-04' })
  eq('nothing queued', off.pendingCount(), 0)
  const C2 = byId(await rows('commitments'))
  eq('new commitment', [C2['c-new']?.time, C2['c-new']?.duration_mins], ['08:15:00', 45])
  eq('new task list', (await rows('kv_store', 'key,value')).find(r => r.key === 'scheduled_tasks').value.length, 3)
  eq('event added then removed', (await rows('events')).map(r => r.id).sort(), ['ev1', 'ev2'])
  eq('recurring edited', byId(await rows('recurring_tasks'))['r-3']?.label, 'Stretch more')

  console.log('\n— nobody else can see any of it —')
  const anon = await fetch(`${LIVE_URL}/rest/v1/kv_store?select=key&user_id=eq.${T}`, { headers: { apikey: LIVE_ANON, Authorization: 'Bearer ' + LIVE_ANON } })
  eq('a signed-out request sees no rows', await anon.json(), [])
} catch (e) {
  fail++
  console.error('\nTEST CRASHED:', e)
} finally {
  await cleanup()
  const left = await (await rest(`/rest/v1/kv_store?user_id=eq.${T}&select=key`)).json()
  eq('the test account’s rows were removed', left, [])
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

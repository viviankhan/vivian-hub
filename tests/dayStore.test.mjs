// The timeline's day-keyed scratch stores: they must stay bounded, and a write
// that the browser refuses must never take the interaction down with it.
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const REPO = fileURLToPath(new URL('..', import.meta.url))

// A localStorage stand-in whose quota and failure mode the tests can steer.
let store = new Map()
let failWrites = false
globalThis.localStorage = {
  get length() { return store.size },
  key: i => [...store.keys()][i] ?? null,
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => {
    // Emulate a full quota: writes throw until enough old keys are gone.
    if (failWrites && store.size > 3) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e }
    store.set(k, String(v))
  },
  removeItem: k => store.delete(k),
}

const { writeDayStore, pruneDayStores, DAY_STORE_RETENTION_DAYS } =
  await import(resolve(REPO, 'src/lib/dayStore.js'))

let pass = 0, fail = 0
const ok = (name, cond) => {
  if (cond) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name) }
}
const eq = (name, got, want) => {
  const good = JSON.stringify(got) === JSON.stringify(want)
  if (!good) console.log(`        got ${JSON.stringify(got)} want ${JSON.stringify(want)}`)
  ok(name, good)
}

// A YYYY-MM-DD key `days` ago.
const keyDaysAgo = (days) => {
  const n = new Date()
  const d = new Date(n.getFullYear(), n.getMonth(), n.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

console.log('\n— the day stores stay bounded —')
store = new Map(); failWrites = false
store.set('vivian_deleted_' + keyDaysAgo(0), '["a"]')
store.set('vivian_custom_' + keyDaysAgo(5), '["b"]')
store.set('vivian_timeshift_' + keyDaysAgo(DAY_STORE_RETENTION_DAYS + 10), '{"c":1}')
store.set('vivian_deleted_' + keyDaysAgo(400), '["d"]')
// Things that merely look similar must be left alone.
store.set('vivian_collapsed_blocks', '{}')
store.set('bloom_focus_pauses', '{}')
store.set('vivian_last_tab', 'today')
store.set('vivian_deleted_not-a-date', '["e"]')

const removed = pruneDayStores()
eq('two stale days are dropped', removed, 2)
ok('today survives', store.has('vivian_deleted_' + keyDaysAgo(0)))
ok('a recent day survives', store.has('vivian_custom_' + keyDaysAgo(5)))
ok('a day past the window is gone', !store.has('vivian_timeshift_' + keyDaysAgo(DAY_STORE_RETENTION_DAYS + 10)))
ok('and so is a very old one', !store.has('vivian_deleted_' + keyDaysAgo(400)))
ok('the un-dated settings key is untouched', store.has('vivian_collapsed_blocks'))
ok('an unrelated key is untouched', store.has('bloom_focus_pauses'))
ok('the last-tab key is untouched', store.has('vivian_last_tab'))
ok('a malformed date suffix is left alone', store.has('vivian_deleted_not-a-date'))

console.log('\n— a normal write —')
store = new Map(); failWrites = false
eq('reports success', writeDayStore('vivian_deleted_2026-09-09', ['x']), true)
eq('and round-trips', JSON.parse(store.get('vivian_deleted_2026-09-09')), ['x'])

console.log('\n— a write against a full quota —')
// Fill with stale days, then make writes throw until they are pruned away.
store = new Map()
for (let i = 1; i <= 6; i++) store.set('vivian_custom_' + keyDaysAgo(DAY_STORE_RETENTION_DAYS + i), '[]')
failWrites = true
const landed = writeDayStore('vivian_deleted_' + keyDaysAgo(0), ['kept'])
eq('it prunes and retries rather than throwing', landed, true)
eq('and the value is actually there', JSON.parse(store.get('vivian_deleted_' + keyDaysAgo(0))), ['kept'])
ok('the stale days were cleared to make room', ![...store.keys()].some(k => k.startsWith('vivian_custom_')))

console.log('\n— a browser that refuses storage outright —')
store = new Map()
const denied = {
  get length() { throw new Error('denied') },
  key: () => { throw new Error('denied') },
  getItem: () => { throw new Error('denied') },
  setItem: () => { throw new Error('denied') },
  removeItem: () => { throw new Error('denied') },
}
const realLS = globalThis.localStorage
globalThis.localStorage = denied
let threw = false
let result
try { result = writeDayStore('vivian_deleted_2026-09-09', ['x']) } catch { threw = true }
ok('writeDayStore does not throw', !threw)
eq('it reports the write did not land', result, false)
let pruneThrew = false
try { pruneDayStores() } catch { pruneThrew = true }
ok('pruneDayStores does not throw either', !pruneThrew)
globalThis.localStorage = realLS

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)

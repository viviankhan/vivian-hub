// A slow connection must not hold the app on "Loading…".
//
// Reads that fail fast were always covered by the offline mirror. A read that
// just hangs was not: the first load waits on every read, so a weak signal
// meant a splash screen for as long as the browser cared to wait. This pins
// the deadline — and that the late answer isn't thrown away when it arrives.
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
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
let landed = 0
globalThis.window = { addEventListener: () => {}, dispatchEvent: e => { if (e && e.type === 'bloom-late-read') landed++; return true } }
globalThis.document = { hidden: false, addEventListener: () => {} }
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o) } }

const src = readFileSync(resolve(REPO, 'src/lib/storage.js'), 'utf8')
  .replace("from '@supabase/supabase-js'", `from ${JSON.stringify(resolve(here, 'mock-supabase.mjs'))}`)
  .replace("from './offline.js'", `from ${JSON.stringify(resolve(REPO, 'src/lib/offline.js'))}`)
  .replace('import.meta.env.VITE_SUPABASE_URL', JSON.stringify('https://proj.supabase.co'))
  .replace('import.meta.env.VITE_SUPABASE_ANON_KEY', JSON.stringify('anon-key'))
  // Same logic, test-sized clock.
  .replace('const READ_DEADLINE_MS = 5000', 'const READ_DEADLINE_MS = 150')
const shimPath = resolve(here, '.slow-read.shim.mjs')
writeFileSync(shimPath, src)

const mock = await import(resolve(here, 'mock-supabase.mjs'))
const off = await import(resolve(REPO, 'src/lib/offline.js'))
const S = await import(shimPath)
rmSync(shimPath, { force: true })

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', g, '\n        want', w) }
}
const wait = ms => new Promise(r => setTimeout(r, ms))
const timed = async p => { const t = Date.now(); const v = await p; return [v, Date.now() - t] }

await off.ready()
S.setStorageUser('u1')

console.log('\n— a first launch on a new device has nothing else to show —')
mock.state.tables.kv_store = [{ key: 'notes', value: 'from the cloud' }]
mock.state.delay = 400
let [v, ms] = await timed(S.getNotes())
eq('so it waits for the real answer', v, 'from the cloud')
eq('however long that takes', ms >= 380, true)

console.log('\n— once this device has a copy, a hanging request is not waited out —')
mock.state.tables.kv_store = [{ key: 'notes', value: 'newer, from another device' }]
mock.state.delay = 600
;[v, ms] = await timed(S.getNotes())
eq('the saved copy is shown', v, 'from the cloud')
eq('after the deadline, not the full wait', ms < 450, true)
await wait(700)
eq('when the answer lands it is kept', await S.getNotes().then(x => x), 'newer, from another device')
eq('and the app is told to re-read', landed, 1)

console.log('\n— an edit made while waiting is not overwritten by the late answer —')
mock.state.delay = 0
mock.state.tables.kv_store = [{ key: 'notes', value: 'stale cloud' }]
mock.state.delay = 500
landed = 0
const slow = S.getNotes()
await wait(200)
mock.state.delay = 0
await S.dbSet('notes', 'typed just now')
eq('the read had already answered from the copy', await slow, 'newer, from another device')
await wait(500)
mock.state.offline = true; globalThis.navigator.onLine = false
eq('the mirror still holds the edit', await S.getNotes(), 'typed just now')
eq('and no stale refresh was announced', landed, 0)
mock.state.offline = false; globalThis.navigator.onLine = true

console.log('\n— a fast answer is untouched —')
mock.state.tables.kv_store = [{ key: 'notes', value: 'quick' }]
;[v, ms] = await timed(S.getNotes())
eq('comes straight from the cloud', v, 'quick')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

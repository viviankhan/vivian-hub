// Startup must never hang.
//
// Every read and write in the app funnels through the offline engine, and the
// engine opens IndexedDB first. A browser whose IndexedDB open request answers
// with nothing — no success, no error, not even blocked — used to leave the
// whole app waiting on it: the sign-in screen never appeared and a signed-in
// user sat on "Loading…" forever. This pins the deadline that stops that.
const listeners = {}
globalThis.window = {
  addEventListener: (k, fn) => { (listeners[k] ||= []).push(fn) },
  dispatchEvent: () => true,
}
globalThis.document = { hidden: false, addEventListener: () => {} }
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o) } }

// An IndexedDB that accepts the request and then says nothing, ever.
let opened = 0
Object.defineProperty(globalThis, 'indexedDB', {
  configurable: true,
  value: { open() { opened++; return { onsuccess: null, onerror: null, onblocked: null, onupgradeneeded: null } } },
})

let pass = 0, fail = 0
const ok = (name, cond) => { if (cond) { pass++; console.log('  ok  ', name) } else { fail++; console.log('  FAIL', name) } }

const off = await import(new URL('../src/lib/offline.js', import.meta.url).href)

console.log('\n— an IndexedDB that never answers —')
ok('the engine did try to open it', opened > 0)

// The deadline is 3s; give it room, and fail loudly rather than hanging the
// whole suite if the fallback ever regresses.
const deadline = new Promise((_, rej) => setTimeout(() => rej(new Error('startup hung')), 10000))
let hung = false
const started = Date.now()
try { await Promise.race([off.ready(), deadline]) } catch { hung = true }
ok('ready() still settles', !hung)
ok('and it gives up rather than waiting forever', Date.now() - started < 10000)

// With no database, the mirror and the queue fall back to memory — the session
// loses durability, but the app runs.
await off.cacheWrite('k', { v: 1 })
ok('a mirrored read still comes back', JSON.stringify(await off.cacheRead('k')) === '{"v":1}')

off.registerReplay(async () => {})
off.setActiveUid('u1')
await off.enqueue({ uid: 'u1', table: 'kv_store', op: 'set', id: 'notes', row: { key: 'notes', value: 'a' } })
ok('a write still queues', off.pendingCount() === 1)

// The login screen asks the browser, not the app's own heuristic — that one is
// cleared only by a successful data request, which a signed-out app never makes.
console.log('\n— the sign-in gate —')
off.noteFailure(Object.assign(new Error('Failed to fetch'), { name: 'TypeError' }))
ok('a failed data request marks the app offline', off.isOnline() === false)
ok('but the browser is still online, so sign-in stays reachable', off.isBrowserOnline() === true)
ok('and the status reports both', off.getStatus().online === false && off.getStatus().browserOnline === true)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

// The server going down must not interrupt the user.
//
// Being offline was handled from the start; the server being *unreachable while
// the device still has wifi* is a different and nastier case, because
// navigator.onLine keeps saying "online" the whole time. These pin the two ways
// that used to surface as an interruption:
//   1. Opening the app bounced to the login screen, because getSession() can
//      hand back an empty session with NO error when it can't reach the server
//      to refresh — indistinguishable from being signed out unless you ask.
//   2. Editing anything raised an alert per change, because a server error that
//      wasn't a 5xx was treated as the server refusing the write.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

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
const winListeners = {}
globalThis.window = {
  addEventListener: (k, fn) => { (winListeners[k] ||= []).push(fn) },
  removeEventListener: () => {},
  dispatchEvent: e => { (winListeners[e.type] || []).forEach(f => f(e)); return true },
}
globalThis.document = { hidden: false, addEventListener: () => {} }
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o) } }

// ── The server we can switch off ─────────────────────────────
// `mode` is what the Supabase project is doing right now.
const server = { mode: 'up', sessionUser: { id: 'u1', email: 'her@example.com' }, healthCalls: 0 }
const transportFail = () => Object.assign(new Error('TypeError: Failed to fetch'), { name: 'TypeError' })

globalThis.fetch = async (url) => {
  if (String(url).includes('/auth/v1/health')) {
    server.healthCalls++
    if (server.mode === 'up' || server.mode === 'signed-out') return { ok: true, status: 200 }
    if (server.mode === 'down-5xx') return { ok: false, status: 503 }
    throw transportFail()                       // 'unreachable'
  }
  throw transportFail()
}

const fakeStorage = `
export const isUsingSupabase = true
export const supabaseUrl = 'https://proj.supabase.co'
export const supabaseAnonKey = 'anon'
export let lastUid = null
export function setStorageUser(uid) { lastUid = uid }
export async function clearOfflineMirror() {}
export const server = globalThis.__server
export const supabase = {
  auth: {
    getSession: async () => {
      // The heart of it: when the server can't be reached to refresh an expired
      // token, supabase-js resolves with NO session and NO error.
      if (server.mode === 'unreachable' || server.mode === 'down-5xx') return { data: { session: null }, error: null }
      if (server.mode === 'signed-out') return { data: { session: null }, error: null }
      return { data: { session: { user: server.sessionUser } }, error: null }
    },
    refreshSession: async () => {
      if (server.mode === 'unreachable') throw ${'Object'}.assign(new Error('TypeError: Failed to fetch'), { name: 'TypeError' })
      if (server.mode === 'signed-out') throw ${'Object'}.assign(new Error('Invalid Refresh Token: Refresh Token Not Found'), { status: 400 })
      return { data: { session: { user: server.sessionUser } }, error: null }
    },
    onAuthStateChange: (fn) => { globalThis.__emitAuth = fn; return { data: { subscription: { unsubscribe() {} } } } },
    signOut: async () => ({ error: null }),
  },
}
`
globalThis.__server = server
const storageShim = resolve(here, '.storage-stub.mjs')
writeFileSync(storageShim, fakeStorage)

const authSrc = readFileSync(resolve(REPO, 'src/lib/auth.js'), 'utf8')
  .replace("from './storage.js'", JSON.stringify(storageShim).replace(/^/, 'from '))
  .replace("from './offline.js'", `from ${JSON.stringify(resolve(REPO, 'src/lib/offline.js'))}`)
const authShim = resolve(here, '.auth-stub.mjs')
writeFileSync(authShim, authSrc)

const auth = await import(authShim)

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, `\n        got ${g}, want ${w}`) }
}

console.log('\n— the device has wifi; the server does not answer —')
// This is the exact shape of the reported problem: signed in yesterday, server
// goes down, open the app today. navigator.onLine is true the whole time.
localStorage.setItem('bloom_last_account', JSON.stringify({ id: 'u1', email: 'her@example.com' }))
server.mode = 'unreachable'
const user = await auth.initAuth()
eq('the app opens on the remembered account', user?.id, 'u1')
eq('it is not treated as a confirmed sign-in', auth.isSessionUnverified(), true)
eq('no sign-out reason was recorded', auth.readSignedOut(), null)
eq('the server was actually asked before deciding', server.healthCalls > 0, true)

console.log('\n— the server answers, and says the sign-in is over —')
// The other direction must still work, or "never sign anyone out" would just
// mean "trap people in an app that cannot sync".
store.clear()
localStorage.setItem('bloom_last_account', JSON.stringify({ id: 'u1', email: 'her@example.com' }))
server.mode = 'signed-out'
server.healthCalls = 0
const fresh = await import(authShim + '?v=2')
const out = await fresh.initAuth()
eq('the login screen is shown', out, null)
eq('and it says why', fresh.readSignedOut()?.reason, 'expired')
eq('after actually reaching the server', server.healthCalls > 0, true)

console.log('\n— the server is up but returning 5xx —')
store.clear()
localStorage.setItem('bloom_last_account', JSON.stringify({ id: 'u1', email: 'her@example.com' }))
server.mode = 'down-5xx'
const broken = await import(authShim + '?v=3')
eq('a broken server is not a sign-out', (await broken.initAuth())?.id, 'u1')
eq('still unconfirmed', broken.isSessionUnverified(), true)

console.log('\n— nobody has ever signed in on this device —')
store.clear()
server.mode = 'unreachable'
const blank = await import(authShim + '?v=4')
eq('the login screen is shown', await blank.initAuth(), null)
eq('and it does not claim a session expired', blank.readSignedOut()?.reason !== 'expired', true)

console.log('\n— the server comes back —')
store.clear()
localStorage.setItem('bloom_last_account', JSON.stringify({ id: 'u1', email: 'her@example.com' }))
server.mode = 'unreachable'
const back = await import(authShim + '?v=5')
await back.initAuth()
eq('opened unconfirmed during the outage', back.isSessionUnverified(), true)
server.mode = 'up'
await back.revalidateSession()
eq('and confirms itself once the server returns', back.isSessionUnverified(), false)
eq('still the same account, so no reload', back.getCurrentUser()?.id, 'u1')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

// src/lib/auth.js
// ─────────────────────────────────────────────────────────────
// Thin wrapper around Supabase Auth. Bloom is single-space when there's no
// Supabase configured (local dev / localStorage mode) — there, auth is a no-op
// and the app just opens. When Supabase IS configured, the app is gated behind
// a real account (see components/Auth.jsx + App.jsx), and every database row is
// scoped to the signed-in user by row-level security (see supabase_auth_migration.sql).
//
// The one piece of shared state other modules need is the current user's id —
// storage.js stamps it onto kv_store writes so two accounts can hold the same
// key independently. We cache it here and keep it live via onAuthStateChange.
//
// ── Staying signed in ────────────────────────────────────────
// Signing in should be a once-per-device event. Three things conspire against
// that, and each has an answer here:
//
//   1. The session lives in localStorage, which browsers do sometimes clear on
//      their own (Safari's cap on script-writable storage, storage-pressure
//      eviction). So every session is MIRRORED into IndexedDB and restored from
//      there at startup if localStorage has come up empty.
//   2. Launching with no network. Supabase can't refresh an expired access
//      token offline, and a null session would drop the user on the login
//      screen — with all their cached data sitting right there, unreachable. So
//      a remembered account signs the user in locally and is re-verified the
//      moment the connection returns.
//   3. A transient failure being mistaken for a revoked session. Nothing signs
//      the user out except an explicit sign-out or the server actually
//      rejecting the refresh token.
// ─────────────────────────────────────────────────────────────
import { supabase, isUsingSupabase, setStorageUser, clearOfflineMirror } from './storage.js'
import { cacheRead, cacheWrite, isOnline, isNetworkError, pendingCount, flush as flushOutbox } from './offline.js'

// When there's no Supabase, everyone is the same implicit "local" user. A fixed
// non-null id keeps code paths that expect an id working without branching.
const LOCAL_UID = 'local'

let currentUser = null       // the Supabase user object, or null
let currentUid = isUsingSupabase ? null : LOCAL_UID
const listeners = new Set()  // (user) => void

// True when the signed-in user came from this device's memory rather than a
// session Supabase confirmed just now. The app is fully usable in this state —
// it just hasn't been able to check in with the server yet.
let unverified = false

// Whether accounts are in play at all. The UI hides the login screen and the
// sign-out control when this is false.
export const authEnabled = isUsingSupabase

// The signed-in user's id, synchronously. null until the first session loads
// (in Supabase mode); 'local' in localStorage mode. storage.js reads this.
export function getUserId() { return currentUid }
export function getCurrentUser() { return currentUser }
// True while we're running on a remembered session that hasn't been confirmed
// with the server yet (offline launch, or the network died mid-refresh).
export function isSessionUnverified() { return unverified }

function setUser(user) {
  currentUser = user || null
  currentUid = user?.id || (isUsingSupabase ? null : LOCAL_UID)
  // Tell storage.js who's writing BEFORE any listener triggers a data load, so
  // kv_store reads/writes are scoped to this account from the first request.
  setStorageUser(currentUid)
  for (const fn of listeners) { try { fn(currentUser) } catch (e) { console.error('[auth] listener', e) } }
}

// Subscribe to sign-in / sign-out. Fires immediately with the current user.
// Returns an unsubscribe function.
export function onAuth(fn) {
  listeners.add(fn)
  try { fn(currentUser) } catch (e) { console.error('[auth] listener', e) }
  return () => listeners.delete(fn)
}

// ── Remembering the account ──────────────────────────────────
// Two separate things are remembered, for two different failure modes:
//   • WHO was signed in (tiny, in localStorage) — enough to open the app on the
//     right account's cached data when there's no network to ask Supabase.
//   • The session TOKENS themselves, mirrored into IndexedDB — the recovery
//     path for when localStorage is cleared but IndexedDB survives.
const WHO_KEY = 'bloom_last_account'
const SESSION_MIRROR = 'auth:session'   // IndexedDB key (not account-namespaced)

function rememberUser(user) {
  if (!user) return
  try { localStorage.setItem(WHO_KEY, JSON.stringify({ id: user.id, email: user.email, at: Date.now() })) } catch {}
}
function readRememberedUser() {
  try {
    const raw = localStorage.getItem(WHO_KEY)
    if (!raw) return null
    const v = JSON.parse(raw)
    return (v && v.id) ? { id: v.id, email: v.email } : null
  } catch { return null }
}
function forgetUser() { try { localStorage.removeItem(WHO_KEY) } catch {} }

// Supabase names its auth entry `sb-<project-ref>-auth-token`, and splits large
// sessions across `.0`, `.1`… suffixes. Match the family rather than assuming
// one exact key, so the mirror keeps working across supabase-js versions.
const AUTH_KEY_RE = /^sb-[a-z0-9-]+-auth-token(\.\d+)?$/i

function authKeysInLocalStorage() {
  const out = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && AUTH_KEY_RE.test(k)) out.push(k)
    }
  } catch {}
  return out
}

// Copy whatever Supabase has written for the session into IndexedDB.
async function mirrorSession() {
  const keys = authKeysInLocalStorage()
  if (!keys.length) return
  const entries = {}
  try { keys.forEach(k => { const v = localStorage.getItem(k); if (v != null) entries[k] = v }) } catch {}
  if (!Object.keys(entries).length) return
  await cacheWrite(SESSION_MIRROR, { entries, at: Date.now() })
}

// The recovery path: localStorage lost the session but IndexedDB still has it.
// Writing the tokens back BEFORE the client reads them means supabase-js starts
// up already signed in, exactly as if nothing had been cleared.
async function restoreSessionFromMirror() {
  if (authKeysInLocalStorage().length) return false
  let saved
  try { saved = await cacheRead(SESSION_MIRROR) } catch { return false }
  if (!saved || !saved.entries) return false
  let restored = false
  for (const [k, v] of Object.entries(saved.entries)) {
    if (!AUTH_KEY_RE.test(k)) continue
    try { localStorage.setItem(k, v); restored = true } catch {}
  }
  if (restored) console.info('[auth] restored the signed-in session from local storage backup')
  return restored
}

async function clearSessionMirror() {
  try { await cacheWrite(SESSION_MIRROR, null) } catch {}
}

// Does this error mean the server actually rejected our refresh token — as
// opposed to the request never getting there? Only the former may sign someone
// out; everything else has to fail open, or a flaky connection would log the
// user out of their own planner.
function isSessionRejected(e) {
  if (!e || isNetworkError(e)) return false
  const msg = String(e.message || e)
  if (e.status === 400 || e.status === 401 || e.status === 403) return true
  return /invalid refresh token|refresh token not found|already used|invalid claim|jwt expired|session[_ ]not[_ ]found|user (from sub claim )?not found/i.test(msg)
}

// A request that never returns would strand the app on the splash screen. Cap
// how long startup will wait for Supabase before falling back to what this
// device remembers — a hung request is, for our purposes, being offline.
function withTimeout(promise, ms, label) {
  return new Promise(resolve => {
    let settled = false
    const t = setTimeout(() => { if (!settled) { settled = true; resolve({ timedOut: true }) } }, ms)
    promise.then(v => { if (!settled) { settled = true; clearTimeout(t); resolve({ value: v }) } },
                 e => { if (!settled) { settled = true; clearTimeout(t); resolve({ error: e }) } })
  }).then(r => {
    if (r.timedOut) console.warn(`[auth] ${label} timed out — continuing from the remembered session`)
    return r
  })
}

// Resolve the initial session once at startup. Returns the user (or null).
// In localStorage mode there's nothing to load — resolves to the local user.
let initPromise = null
export function initAuth() {
  if (initPromise) return initPromise
  if (!isUsingSupabase) { initPromise = Promise.resolve(null); return initPromise }
  initPromise = (async () => {
    // Put the tokens back first if they went missing, so getSession finds them.
    await restoreSessionFromMirror().catch(() => false)

    const res = await withTimeout(supabase.auth.getSession(), 8000, 'getSession')
    const session = res.value?.data?.session || null
    const sessionErr = res.error || res.value?.error || null
    let user = session?.user || null

    if (user) {
      rememberUser(user)
      unverified = false
      setUser(user)
      mirrorSession().catch(() => {})
    } else {
      // No usable session came back. Before showing a login screen, check
      // whether this device already knows whose app this is: if we couldn't
      // reach Supabase (offline, timed out, transport error), the right answer
      // is to open their planner from the local mirror, not to demand a
      // password they can't submit anyway.
      const remembered = readRememberedUser()
      const couldNotAsk = res.timedOut || !isOnline() || (sessionErr && isNetworkError(sessionErr))
      if (remembered && couldNotAsk) {
        unverified = true
        setUser(remembered)
        console.info('[auth] offline — opening on the remembered account; will re-verify when back online')
      } else {
        if (sessionErr) console.error('[auth] getSession failed:', sessionErr.message || sessionErr)
        setUser(null)
      }
    }

    // Keep the cached user in step with every later sign-in / sign-out / refresh.
    supabase.auth.onAuthStateChange((event, s) => {
      if (s?.user) {
        unverified = false
        rememberUser(s.user)
        setUser(s.user)
        mirrorSession().catch(() => {})
        return
      }
      if (event === 'SIGNED_OUT') {
        // The only path that genuinely forgets an account.
        unverified = false
        forgetUser()
        clearSessionMirror().catch(() => {})
        setUser(null)
        return
      }
      // A null session that ISN'T an explicit sign-out — INITIAL_SESSION firing
      // before the stored token is read, or a token refresh that couldn't reach
      // the network. Dropping the user here is exactly the "it logged me out on
      // the train" bug, so hold on to the remembered account instead.
      if (!currentUser) {
        const remembered = readRememberedUser()
        if (remembered) { unverified = true; setUser(remembered) }
      }
    })

    return currentUser
  })().catch(e => { console.error('[auth] init failed:', e); return null })
  return initPromise
}

// Check in with the server about a session we've only been assuming is good.
// Called when the connection comes back and when the app is brought forward.
// Fails open: only a real rejection from the server signs anyone out.
let revalidating = false
export async function revalidateSession() {
  if (!isUsingSupabase || !unverified || revalidating) return
  if (!isOnline()) return
  revalidating = true
  try {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    if (data?.session?.user) {
      unverified = false
      rememberUser(data.session.user)
      setUser(data.session.user)
      mirrorSession().catch(() => {})
      return
    }
    // A session-less success means the stored refresh token was used up or
    // revoked. Ask for a refresh explicitly so we get a definitive answer
    // rather than guessing from an empty response.
    const { data: r, error: rErr } = await supabase.auth.refreshSession()
    if (rErr) throw rErr
    if (r?.session?.user) {
      unverified = false
      rememberUser(r.session.user)
      setUser(r.session.user)
      mirrorSession().catch(() => {})
    }
  } catch (e) {
    if (isSessionRejected(e)) {
      console.warn('[auth] the stored session is no longer valid — signing out')
      unverified = false
      forgetUser()
      await clearSessionMirror()
      setUser(null)
    }
    // Anything else (still offline, server hiccup): stay signed in and try again
    // on the next reconnect.
  } finally {
    revalidating = false
  }
}

if (typeof window !== 'undefined' && isUsingSupabase) {
  window.addEventListener('online', () => { revalidateSession() })
  document.addEventListener('visibilitychange', () => { if (!document.hidden) revalidateSession() })
  // Re-mirror periodically: supabase-js rotates the refresh token on every
  // refresh, and a mirror holding a used-up token is worth nothing.
  setInterval(() => { if (currentUser && !unverified) mirrorSession().catch(() => {}) }, 5 * 60 * 1000)
}

export async function signIn(email, password) {
  if (!isUsingSupabase) return { user: null }
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw new Error(error.message)
  return data
}

// Sign up. Depending on the project's settings this may require email
// confirmation before a session exists — the caller checks `session` to tell
// "you're in" from "check your email".
export async function signUp(email, password) {
  if (!isUsingSupabase) return { user: null, session: null }
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password })
  if (error) throw new Error(error.message)
  return data
}

export async function sendPasswordReset(email) {
  if (!isUsingSupabase) return
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
  })
  if (error) throw new Error(error.message)
}

export async function signOut() {
  if (!isUsingSupabase) return
  // Signing out drops this device's local mirror, so anything still waiting to
  // be uploaded would be lost with it. Try to get it up first, and refuse
  // rather than silently discard the user's work if it can't go.
  if (pendingCount() > 0) {
    try { await flushOutbox() } catch {}
    if (pendingCount() > 0) {
      throw new Error(
        `${pendingCount()} change${pendingCount() === 1 ? '' : 's'} made offline ${pendingCount() === 1 ? 'hasn’t' : 'haven’t'} been uploaded yet. ` +
        'Reconnect so they can sync, then sign out.'
      )
    }
  }
  const uid = currentUid
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(error.message)
  unverified = false
  forgetUser()
  await clearSessionMirror()
  // Wipe this account's offline copy so the next person to open Bloom on this
  // browser can't read it straight out of IndexedDB.
  if (uid) await clearOfflineMirror(uid).catch(() => {})
}

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
import { supabase, isUsingSupabase, supabaseUrl, supabaseAnonKey, setStorageUser, clearOfflineMirror } from './storage.js'
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

// ── Why am I looking at the login screen? ────────────────────
// Being signed out is the kind of thing that happens once in a while on a
// phone and is impossible to reproduce on demand — which is exactly why it
// went unfixed. So every path that ends at the login screen now records why,
// and the login screen says it out loud. Its own key, so it survives whatever
// removed the session.
const REASON_KEY = 'bloom_signout_reason'
export function noteSignedOut(reason, detail) {
  try { localStorage.setItem(REASON_KEY, JSON.stringify({ reason, detail: detail || '', at: Date.now() })) } catch {}
}
export function readSignedOut() {
  try {
    const v = JSON.parse(localStorage.getItem(REASON_KEY) || 'null')
    return (v && v.reason) ? v : null
  } catch { return null }
}
export function clearSignedOut() { try { localStorage.removeItem(REASON_KEY) } catch {} }

// The last account's email, kept so a forced re-login is one field, not two.
export function lastKnownEmail() { return readRememberedUser()?.email || '' }

// ── Did the browser throw our storage away? ──────────────────
// A marker written to BOTH localStorage and IndexedDB on first run. Which of
// the two survives tells us what actually happened:
//   both        → storage is intact, so the session ended for some other
//                 reason and that's a bug worth chasing
//   IndexedDB   → localStorage alone was cleared; the session mirror recovers it
//   neither     → the whole origin was evicted. On iOS this happens after about
//                 seven days without opening the site, and NO client-side code
//                 can prevent it — only installing Bloom to the Home Screen can.
// It cannot tell a genuine first run from a full wipe (that is the nature of
// losing every writable store), so the login screen words it as both.
const MARK_KEY = 'bloom_install_mark'
const MARK_MIRROR = 'auth:install-mark'
export async function storageReport() {
  let ls = null, idb = null
  try { ls = localStorage.getItem(MARK_KEY) } catch {}
  try { idb = await cacheRead(MARK_MIRROR) } catch {}
  const mark = ls || (idb && idb.id) || null
  if (!mark) {
    const fresh = 'm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    try { localStorage.setItem(MARK_KEY, fresh) } catch {}
    cacheWrite(MARK_MIRROR, { id: fresh, at: Date.now() }).catch(() => {})
    return { known: false, localStorage: false, indexedDb: false }
  }
  // Heal whichever side went missing, so the next comparison still means something.
  if (!ls) { try { localStorage.setItem(MARK_KEY, mark) } catch {} }
  if (!idb) cacheWrite(MARK_MIRROR, { id: mark, at: Date.now() }).catch(() => {})
  return { known: true, localStorage: !!ls, indexedDb: !!idb }
}

// Is the auth server actually answering right now?
//
// This exists because getSession() cannot tell us. When it can't reach the
// server to refresh an expired token it resolves with NO session and NO error
// — byte-for-byte identical to "this person is signed out". Guessing wrong in
// one direction strands someone on a login screen during an outage; guessing
// wrong in the other leaves a genuinely signed-out person in a broken app. So
// we ask, with one cheap unauthenticated request.
//
// Only a real HTTP answer below 500 counts as "the server is up and talking".
// A 5xx means it's there but not serving, which for our purposes is the same
// as unreachable: not a basis for signing anyone out.
async function authServerReachable(ms = 6000) {
  if (!supabaseUrl) return false
  let timer = null
  try {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
    if (ctrl) timer = setTimeout(() => ctrl.abort(), ms)
    const res = await fetch(supabaseUrl + '/auth/v1/health', {
      method: 'GET',
      cache: 'no-store',
      headers: supabaseAnonKey ? { apikey: supabaseAnonKey } : undefined,
      signal: ctrl ? ctrl.signal : undefined,
    })
    return !!res && typeof res.status === 'number' && res.status < 500
  } catch {
    return false
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// Does this error mean the server actually rejected our refresh token — as
// opposed to the request never getting there? Only the former may sign someone
// out; everything else has to fail open, or a flaky connection would log the
// user out of their own planner.
function isSessionRejected(e) {
  if (!e || isNetworkError(e)) return false
  const msg = String(e.message || e)
  const name = String(e.name || '')
  // "Auth session missing" is NOT the server rejecting us. It means this device
  // has nothing to refresh — storage was cleared, or we're running on a
  // remembered account whose tokens are gone. Supabase reports it as a 400,
  // which is why matching on the status code alone was wrong: it turned a
  // recoverable state into a forced sign-out.
  if (name === 'AuthSessionMissingError' || /auth ?session ?missing|session missing|no session/i.test(msg)) return false
  // A refresh token the server actively refuses. This is the one case that
  // genuinely means "this sign-in is over".
  if (/invalid refresh token|refresh token not found|refresh_token_not_found|already used|invalid claim|jwt expired|user (from sub claim )?not found/i.test(msg)) return true
  return e.status === 401 || e.status === 403
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
      // The default here has to be "stay signed in". An empty session only
      // means the sign-in is over if we actually reached the server and it
      // said so — otherwise it just means we couldn't ask, and the honest
      // response is to open their planner from the local mirror.
      //
      // Everything except a confirmed answer counts as "couldn't ask": no
      // network, a timeout, a transport error, a server that is down or
      // returning 5xx. This is the case that used to bounce someone to the
      // login screen during an outage — their device had wifi the whole time,
      // so nothing else here noticed anything was wrong.
      const couldNotAsk = remembered && (
        res.timedOut ||
        !isOnline() ||
        (sessionErr && isNetworkError(sessionErr)) ||
        !(await authServerReachable())
      )
      if (couldNotAsk) {
        unverified = true
        setUser(remembered)
        console.info('[auth] could not confirm the session (offline or the server is down) — opening on the remembered account and re-verifying later')
      } else {
        if (sessionErr) console.error('[auth] getSession failed:', sessionErr.message || sessionErr)
        // Record what this looked like, so the login screen can say something
        // more useful than nothing. If our install marker is gone from BOTH
        // stores, the browser evicted everything — that's the iOS seven-day
        // cap, not a bug in the app.
        const report = await storageReport().catch(() => null)
        if (remembered) {
          noteSignedOut('expired', 'The saved sign-in was no longer accepted.')
        } else if (report && !report.known) {
          noteSignedOut('storage-cleared', 'This browser had no saved sign-in — either it is new to Bloom, or the browser cleared Bloom\u2019s storage.')
        } else {
          noteSignedOut('no-session', 'No signed-in session was found on this device.')
        }
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
        if (!signingOutDeliberately) noteSignedOut('server-ended', 'The server ended this session.')
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
      noteSignedOut('expired', 'Your saved sign-in expired or was revoked. Anything you changed offline is still saved here and will upload once you sign back in.')
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

// A data request came back saying our credentials are stale. Renew the session
// rather than making the user deal with it: the writes that hit this are sitting
// safely in the outbox and go up as soon as the token is good again.
//
// Only a refresh the server actively refuses ends the session here — the same
// strict rule as everywhere else, so an outage can't sign anyone out.
let renewing = false
let lastRenewAt = 0
export async function renewSession() {
  if (!isUsingSupabase || renewing) return
  // Every failed write asks for this, so a burst of edits during an outage
  // must not become a burst of refresh calls.
  if (Date.now() - lastRenewAt < 5000) return
  renewing = true
  lastRenewAt = Date.now()
  try {
    const { data, error } = await supabase.auth.refreshSession()
    if (error) throw error
    if (data?.session?.user) {
      unverified = false
      rememberUser(data.session.user)
      setUser(data.session.user)
      mirrorSession().catch(() => {})
      flushOutbox()          // the queued writes can go up now
    }
  } catch (e) {
    if (isSessionRejected(e)) {
      console.warn('[auth] the session was refused on renewal — signing out')
      unverified = false
      noteSignedOut('expired', 'Your sign-in expired. Anything you changed is still saved on this device and will upload once you sign back in.')
      forgetUser()
      await clearSessionMirror()
      setUser(null)
    }
    // Otherwise: the server is unreachable or having trouble. Stay signed in.
  } finally {
    renewing = false
  }
}

if (typeof window !== 'undefined' && isUsingSupabase) {
  window.addEventListener('bloom-auth-stale', () => { renewSession() })
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

// Set while the user's own sign-out is in flight, so the SIGNED_OUT event it
// triggers isn't recorded as something that happened *to* them.
let signingOutDeliberately = false

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
  signingOutDeliberately = true
  let error
  try { ({ error } = await supabase.auth.signOut()) } finally { signingOutDeliberately = false }
  if (error) throw new Error(error.message)
  unverified = false
  clearSignedOut()
  forgetUser()
  await clearSessionMirror()
  // Wipe this account's offline copy so the next person to open Bloom on this
  // browser can't read it straight out of IndexedDB.
  if (uid) await clearOfflineMirror(uid).catch(() => {})
}

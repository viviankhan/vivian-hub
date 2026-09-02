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
// ─────────────────────────────────────────────────────────────
import { supabase, isUsingSupabase, setStorageUser } from './storage.js'

// When there's no Supabase, everyone is the same implicit "local" user. A fixed
// non-null id keeps code paths that expect an id working without branching.
const LOCAL_UID = 'local'

let currentUser = null       // the Supabase user object, or null
let currentUid = isUsingSupabase ? null : LOCAL_UID
const listeners = new Set()  // (user) => void

// Whether accounts are in play at all. The UI hides the login screen and the
// sign-out control when this is false.
export const authEnabled = isUsingSupabase

// The signed-in user's id, synchronously. null until the first session loads
// (in Supabase mode); 'local' in localStorage mode. storage.js reads this.
export function getUserId() { return currentUid }
export function getCurrentUser() { return currentUser }

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

// Resolve the initial session once at startup. Returns the user (or null).
// In localStorage mode there's nothing to load — resolves to the local user.
let initPromise = null
export function initAuth() {
  if (initPromise) return initPromise
  if (!isUsingSupabase) { initPromise = Promise.resolve(null); return initPromise }
  initPromise = supabase.auth.getSession().then(({ data }) => {
    setUser(data?.session?.user || null)
    // Keep the cached user in step with every later sign-in / sign-out / refresh.
    supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null))
    return currentUser
  }).catch(e => { console.error('[auth] getSession failed:', e); return null })
  return initPromise
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
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(error.message)
}

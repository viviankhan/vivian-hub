// src/lib/push.js
// ─────────────────────────────────────────────────────────────
// Background push: the half of the reminder system that arrives even when
// Bloom is fully closed. It complements src/lib/notifications.js (which fires
// while the app is open / on reopen) — here we hand the schedule to the cloud:
//
//   1. Subscribe this device to Web Push (a browser PushSubscription).
//   2. Store that subscription in Supabase (push_subscriptions).
//   3. Whenever reminders change, write the concrete upcoming ones into
//      Supabase (scheduled_pushes).
//
// A scheduled Edge Function (supabase/functions/send-reminders) then delivers
// each reminder at its moment, via the service worker's `push` handler — no
// open tab required. All of this no-ops gracefully when push isn't supported or
// Supabase isn't configured, so the app is unchanged for anyone who skips setup.
// ─────────────────────────────────────────────────────────────

import { supabase, isUsingSupabase } from './storage.js'
import { buildScheduledPushes } from './notifications.js'

// The VAPID public key identifies our push sender. It is NOT a secret (it ships
// to every browser), so it can live in the code; an env var can override it.
// The matching *private* key lives only as a Supabase Edge Function secret.
const VAPID_PUBLIC_KEY =
  import.meta.env.VITE_VAPID_PUBLIC_KEY ||
  'BOzhhdVPYiXuL08Y1WB6y09vKPfoL5PymZNL9ijlMKzVZJgyG4hmpCYFxcnnIS71mO9sInzMs3LBKad6YaBbwgc'

const ENABLED_KEY = 'vivian_bg_push_enabled'
const DEVICE_KEY = 'vivian_device_id'

// A stable per-device id so a browser/phone owns exactly one subscription row
// and its own queue of reminders.
function deviceId() {
  let id = null
  try { id = localStorage.getItem(DEVICE_KEY) } catch {}
  if (!id) {
    id = (crypto?.randomUUID?.() || 'dev-' + Math.random().toString(36).slice(2) + Date.now())
    try { localStorage.setItem(DEVICE_KEY, id) } catch {}
  }
  return id
}

// True where real background push can work: a service worker, the Push API, a
// configured VAPID key, and Supabase to coordinate through.
export function pushSupported() {
  return typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    !!VAPID_PUBLIC_KEY &&
    isUsingSupabase
}

export function backgroundPushEnabled() {
  try { return localStorage.getItem(ENABLED_KEY) === '1' } catch { return false }
}
function setEnabledFlag(on) {
  try { on ? localStorage.setItem(ENABLED_KEY, '1') : localStorage.removeItem(ENABLED_KEY) } catch {}
}

// VAPID keys are base64url; the Push API wants a Uint8Array.
function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function readyRegistration() {
  if (!('serviceWorker' in navigator)) return null
  try { return await navigator.serviceWorker.ready } catch { return null }
}

// Subscribe (or reuse an existing subscription) and store it in Supabase.
// Returns the PushSubscription, or null on failure.
async function subscribeAndStore() {
  const reg = await readyRegistration()
  if (!reg || !reg.pushManager) return null
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }
  if (!supabase) return sub
  const { error } = await supabase.from('push_subscriptions').upsert({
    device_id: deviceId(),
    subscription: sub.toJSON(),
    updated_at: new Date().toISOString(),
  })
  if (error) { console.warn('[push] store subscription failed:', error.message); return null }
  return sub
}

// Turn on background push for this device. Caller must already hold Notification
// permission ('granted'). Returns true on success.
export async function enableBackgroundPush(events, commitments, recurring = []) {
  if (!pushSupported()) return false
  const sub = await subscribeAndStore()
  if (!sub) return false
  setEnabledFlag(true)
  await syncScheduledPushes(events, commitments, recurring)
  return true
}

// Turn it off: drop the subscription (which cascades to this device's queued
// reminders) and unsubscribe the browser.
export async function disableBackgroundPush() {
  setEnabledFlag(false)
  try {
    const reg = await readyRegistration()
    const sub = reg && reg.pushManager && await reg.pushManager.getSubscription()
    if (sub) await sub.unsubscribe()
  } catch {}
  if (supabase) {
    try { await supabase.from('push_subscriptions').delete().eq('device_id', deviceId()) } catch {}
  }
}

// Called on app load when background push is already on: make sure the stored
// subscription still matches this browser's (the browser can silently rotate
// it), re-storing it if so. Cheap and idempotent.
export async function ensureBackgroundPush() {
  if (!backgroundPushEnabled() || !pushSupported()) return
  try { await subscribeAndStore() } catch (e) { console.warn('[push] ensure failed:', e) }
}

// Write this device's upcoming reminders into Supabase so the Edge Function can
// deliver them. Replaces the device's pending (future, unsent) queue each call,
// so deleted/rescheduled items don't linger. No-op unless background push is on.
export async function syncScheduledPushes(events, commitments, recurring = []) {
  if (!backgroundPushEnabled() || !pushSupported() || !supabase) return
  const id = deviceId()
  const rows = buildScheduledPushes(events, commitments, recurring)
    .map(r => ({ ...r, device_id: id, sent: false }))
  const nowISO = new Date().toISOString()
  try {
    // Clear the still-future queue for this device, then write the current set.
    // Past-but-undelivered rows are left alone so a just-due reminder isn't
    // dropped before the next Edge Function run picks it up.
    await supabase.from('scheduled_pushes')
      .delete().eq('device_id', id).eq('sent', false).gt('at', nowISO)
    if (rows.length) {
      const { error } = await supabase.from('scheduled_pushes')
        .upsert(rows, { onConflict: 'device_id,tag' })
      if (error) console.warn('[push] queue reminders failed:', error.message)
    }
  } catch (e) {
    console.warn('[push] syncScheduledPushes failed:', e)
  }
}

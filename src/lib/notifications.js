// src/lib/notifications.js
// ─────────────────────────────────────────────────────────────
// Reminders for what's coming up.
//
// Bloom already knows your Commitments (dated / timed to-dos) and Events
// (multi-day spans). This turns those into notifications: "tomorrow" and
// "in 1 hour" nudges before each one starts.
//
// How it fires:
//   • While Bloom is open, a timer fires each reminder at its moment.
//   • When you (re)open Bloom, we "catch up" — anything whose reminder time
//     passed while the app was closed, but whose event is still upcoming,
//     fires right away so you don't miss it.
// Each reminder is remembered as "fired" in localStorage so you only ever get
// it once. Truly-in-the-background reminders (app fully closed) need a push
// server — see SETUP.md.
// ─────────────────────────────────────────────────────────────

const FIRED_KEY = 'vivian_fired_reminders'
const SETTINGS_KEY = 'vivian_notif_settings'

// The app is served from a sub-path (Vite `base`, e.g. "/vivian-hub/"). Use it
// for the service worker URL and for links opened from a notification.
const BASE = import.meta.env.BASE_URL || '/'

// The lead times a user can choose from, in minutes before an item starts.
// Editable in Settings → Reminders; the chosen set is stored per-device.
export const LEAD_OPTIONS = [
  { mins: 5,        label: '5 min'  },
  { mins: 15,       label: '15 min' },
  { mins: 45,       label: '45 min' },
  { mins: 60,       label: '1 hour' },
  { mins: 24 * 60,  label: '1 day'  },
  { mins: 7 * 24 * 60, label: '1 week' },
]
// What's on by default (preserves the original "a day + an hour before").
const DEFAULT_LEADS = [24 * 60, 60]

// Resolve the saved lead-minute list into {mins, key} entries to schedule.
function activeLeads() {
  const raw = getSettings().leads
  const mins = Array.isArray(raw) && raw.length ? raw : DEFAULT_LEADS
  return mins.map(m => ({ mins: m, key: `m${m}` }))
}

// Reminders more than this far in the future aren't scheduled with a live
// timer (setTimeout gets unreliable over long spans and the tab rarely stays
// open that long). They still fire via catch-up whenever the app is reopened.
const MAX_TIMER_MS = 6 * 60 * 60 * 1000 // 6 hours

let timers = []
let swRegistration = null

// ── Settings (persisted, local-only) ───────────────────────────
export function getSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return { enabled: false, leads: [24 * 60, 60], ...(raw ? JSON.parse(raw) : {}) }
  } catch {
    return { enabled: false, leads: [24 * 60, 60] }
  }
}
export function saveSettings(patch) {
  const next = { ...getSettings(), ...patch }
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)) } catch {}
  return next
}

// ── Capability + permission ─────────────────────────────────────
export function notificationsSupported() {
  return typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator
}

export function permissionState() {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission // 'granted' | 'denied' | 'default'
}

export async function requestPermission() {
  if (!('Notification' in window)) return 'unsupported'
  try {
    const res = await Notification.requestPermission()
    return res
  } catch {
    return Notification.permission
  }
}

// ── Service worker registration ─────────────────────────────────
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null
  try {
    swRegistration = await navigator.serviceWorker.register(BASE + 'sw.js', { scope: BASE })
    // Make sure it's active before we try to message it.
    await navigator.serviceWorker.ready
    return swRegistration
  } catch (e) {
    console.warn('[notifications] SW registration failed:', e)
    return null
  }
}

// ── Fired-reminder bookkeeping ─────────────────────────────────
function loadFired() {
  try { return JSON.parse(localStorage.getItem(FIRED_KEY)) || {} } catch { return {} }
}
function saveFired(map) {
  try { localStorage.setItem(FIRED_KEY, JSON.stringify(map)) } catch {}
}

// ── Turn commitments + events into concrete reminders ──────────
// Returns [{ id, title, body, at (ms epoch), startMs, url }]
function buildReminders(events = [], commitments = []) {
  const out = []
  const now = Date.now()

  const leads = activeLeads()
  const push = (item, startMs, name, body) => {
    for (const lead of leads) {
      const at = startMs - lead.mins * 60 * 1000
      out.push({
        id: `${item.id}:${lead.key}`,
        name,          // heading is built at fire time from how far off the start is
        body,
        at,
        startMs,
        leadKey: lead.key,
        url: BASE,
      })
    }
    void now
  }

  // Commitments: date (+ optional time). No time → treat as 9:00 AM.
  for (const c of commitments) {
    if (!c || c.done || !c.date) continue
    const startMs = toEpoch(c.date, c.time)
    if (startMs == null) continue
    const timeLabel = c.time ? ` at ${fmt12(c.time)}` : ''
    push(c, startMs, c.text || 'Commitment', `${dateLabel(c.date)}${timeLabel}`)
  }

  // Events: multi-day. Remind before the start. All-day → 9:00 AM.
  for (const ev of events) {
    if (!ev || !ev.startDate) continue
    const t = ev.allDay ? null : ev.startTime
    const startMs = toEpoch(ev.startDate, t)
    if (startMs == null) continue
    const timeLabel = t ? ` at ${fmt12(t)}` : ''
    push(ev, startMs, ev.label || 'Event', `${dateLabel(ev.startDate)}${timeLabel}`)
  }

  return out
}

// ── The main entry point ────────────────────────────────────────
// Call on app load and whenever events/commitments change. Fires anything
// due now (catch-up) and sets live timers for anything due soon.
export function syncReminders(events, commitments) {
  clearTimers()
  const settings = getSettings()
  if (!settings.enabled) return
  if (permissionState() !== 'granted') return

  const reminders = buildReminders(events, commitments)
  const fired = loadFired()
  const now = Date.now()
  let firedChanged = false

  // Prune fired entries for reminders that no longer exist (deleted items),
  // so the map doesn't grow forever.
  const liveIds = new Set(reminders.map(r => r.id))
  for (const key of Object.keys(fired)) {
    if (!liveIds.has(key)) { delete fired[key]; firedChanged = true }
  }

  for (const r of reminders) {
    if (fired[r.id]) continue
    // Don't bother reminding about something that has already started.
    if (r.startMs <= now) { fired[r.id] = now; firedChanged = true; continue }

    const delay = r.at - now
    if (delay <= 0) {
      // Catch-up: its reminder moment passed, but the event is still ahead.
      fire(r)
      fired[r.id] = now
      firedChanged = true
    } else if (delay <= MAX_TIMER_MS) {
      // Due soon — schedule a live timer while the app stays open.
      const t = setTimeout(() => {
        fire(r)
        const f = loadFired(); f[r.id] = Date.now(); saveFired(f)
      }, delay)
      timers.push(t)
    }
    // else: too far out — will be caught on a future open.
  }

  if (firedChanged) saveFired(fired)
}

// Build the notification heading from how far the start is *now* (fire time),
// so a catch-up reminder that pops late still reads accurately.
function headingFor(reminder) {
  if (!reminder.startMs) return reminder.name || '🌸 Bloom'
  const mins = Math.round((reminder.startMs - Date.now()) / 60000)
  let when
  if (mins <= 0)          when = 'Now'
  else if (mins < 60)     when = `In ${mins} min`
  else if (mins < 120)    when = 'In 1 hour'
  else if (mins < 24 * 60) when = `In ${Math.round(mins / 60)} hours`
  else if (mins < 48 * 60) when = 'Tomorrow'
  else                    when = `In ${Math.round(mins / 60 / 24)} days`
  return `${when}: ${reminder.name}`
}

// Called once when the user first turns reminders on: mark every reminder
// whose moment has already passed as "handled", so enabling doesn't replay a
// backlog of notifications for items already on the calendar. Anything still
// in the future fires normally from here on.
export function primeBaseline(events, commitments) {
  const reminders = buildReminders(events, commitments)
  const fired = loadFired()
  const now = Date.now()
  for (const r of reminders) {
    if (r.at <= now) fired[r.id] = now
  }
  saveFired(fired)
}

function fire(reminder) {
  const title = reminder.name && reminder.startMs === undefined
    ? reminder.name           // pre-formatted (e.g. the test notification)
    : headingFor(reminder)
  const options = {
    body: reminder.body,
    tag: reminder.id,        // collapse duplicates
    data: { url: reminder.url },
    requireInteraction: false,
  }
  // Prefer the service worker (shows even when the tab is backgrounded).
  if (swRegistration && swRegistration.active) {
    swRegistration.active.postMessage({ type: 'show-notification', title, options })
  } else if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'show-notification', title, options })
  } else if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification(title, options) } catch {}
  }
}

// Fire a one-off test notification so the user can confirm it works.
export function sendTestNotification() {
  fire({
    id: 'test:' + Date.now(),
    name: '🌸 Bloom reminders are on',
    body: "You'll get a nudge the day before and an hour before what's coming up.",
    url: BASE,
  })
}

function clearTimers() {
  timers.forEach(t => clearTimeout(t))
  timers = []
}

// ── Small date helpers ──────────────────────────────────────────
function toEpoch(dateStr, timeStr) {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return null
  let hh = 9, mm = 0 // default reminder anchor for untimed items: 9:00 AM
  if (timeStr) {
    const parts = timeStr.split(':').map(Number)
    hh = parts[0]; mm = parts[1] || 0
  }
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime()
}

function fmt12(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function dateLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// src/lib/notifications.js
// ─────────────────────────────────────────────────────────────
// Reminders for what's coming up.
//
// Bloom already knows your Commitments (dated / timed to-dos) and Events
// (multi-day spans). This turns those into notifications: "tomorrow" and
// "in 1 hour" nudges before each one starts.
//
// How it fires:
//   • Where the browser supports the Notification Triggers API (Chrome/Android
//     and installed PWAs), each upcoming reminder is handed to the OS ahead of
//     time, so it fires at the right moment even if Bloom has been fully closed
//     for days — you no longer have to open the app for a reminder to arrive.
//   • Everywhere else we fall back to the older scheme: a timer fires each
//     reminder while Bloom is open, and on (re)open we "catch up" — anything
//     whose reminder time passed while the app was closed, but whose event is
//     still upcoming, fires right away so you don't miss it.
// Each reminder is remembered as "fired" in localStorage so you only ever get
// it once.
// ─────────────────────────────────────────────────────────────

const FIRED_KEY = 'vivian_fired_reminders'
const SETTINGS_KEY = 'vivian_notif_settings'

// The app is served from a sub-path (Vite `base`, e.g. "/vivian-hub/"). Use it
// for the service worker URL and for links opened from a notification.
const BASE = import.meta.env.BASE_URL || '/'

import { playSound } from './sounds.js'

// The lead times a user can choose from, in minutes before an item starts.
// Editable in Settings → Reminders; the chosen set is stored per-device.
export const LEAD_OPTIONS = [
  { mins: 0,        label: 'Starting now' },
  { mins: 5,        label: '5 min'  },
  { mins: 15,       label: '15 min' },
  { mins: 45,       label: '45 min' },
  { mins: 60,       label: '1 hour' },
  { mins: 24 * 60,  label: '1 day'  },
  { mins: 7 * 24 * 60, label: '1 week' },
]
// What's on by default (preserves the original "a day + an hour before").
const DEFAULT_LEADS = [24 * 60, 60]

// The resolved default lead-minute list (the user's Settings choice, or the
// built-in default). Exported so the add sheet can *show* what "Default" means
// instead of the opaque word "Default".
export function getDefaultLeads() {
  const raw = getSettings().leads
  return Array.isArray(raw) && raw.length ? raw : DEFAULT_LEADS
}
// A short human label for one lead time in minutes ("1 day", "45 min"). The
// special value 'end' means "when the task ends" rather than a lead before it.
export function leadLabel(mins) {
  if (mins === 'end') return 'when it ends'
  const opt = LEAD_OPTIONS.find(o => o.mins === mins)
  if (opt) return opt.label
  if (mins % (24 * 60) === 0) { const d = mins / (24 * 60); return `${d} day${d > 1 ? 's' : ''}` }
  if (mins % 60 === 0) { const h = mins / 60; return `${h} hr` }
  return `${mins} min`
}
// Turn a set of lead-minute values into a natural phrase, keeping the
// "before" timings together and folding in the "starting now" (0-minute)
// lead as "right when it starts" so nothing reads as "Starting now before".
// e.g. "1 day & 1 hour before", "right when it starts",
// "1 hour before & right when it starts".
export function leadsPhrase(leads, joiner = ' & ') {
  if (!Array.isArray(leads) || !leads.length) return 'No alerts'
  const nums = leads.filter(m => m !== 'end').sort((a, b) => b - a)
  const before = nums.filter(m => m > 0).map(leadLabel)
  const atStart = nums.some(m => m <= 0)
  const atEnd = leads.includes('end')
  const parts = []
  if (before.length) parts.push(before.join(joiner) + ' before')
  if (atStart) parts.push('right when it starts')
  if (atEnd) parts.push('when it ends')
  return parts.join(' & ')
}
// The default lead times as a single readable phrase, e.g. "1 day & 1 hour before".
export function defaultLeadsLabel() {
  return leadsPhrase(getDefaultLeads())
}

// Resolve the saved lead list into schedulable entries. An 'end' entry becomes
// an end-of-task alert (fires at start + duration); the rest are leads before.
function activeLeads() {
  return getDefaultLeads().map(m => m === 'end' ? { end: true, key: 'end' } : { mins: m, key: `m${m}` })
}

// ── Per-item reminder overrides ────────────────────────────────
// A single item (one commitment/event) can opt out of the global lead times
// and use its own. Stored locally, keyed by the item's id — consistent with
// the rest of the reminder system, which is entirely device-local (so this
// needs no database column). An empty array means "no reminders for this one";
// null / missing means "use the global defaults".
const ITEM_REMINDERS_KEY = 'vivian_item_reminders'
export function getItemReminders(id) {
  if (!id) return null
  try {
    const map = JSON.parse(localStorage.getItem(ITEM_REMINDERS_KEY) || '{}')
    return Array.isArray(map[id]) ? map[id] : null
  } catch { return null }
}
export function setItemReminders(id, mins) {
  if (!id) return
  try {
    const map = JSON.parse(localStorage.getItem(ITEM_REMINDERS_KEY) || '{}')
    if (mins == null) delete map[id]
    else map[id] = mins
    localStorage.setItem(ITEM_REMINDERS_KEY, JSON.stringify(map))
  } catch {}
}
// ── Per-item alert sound ───────────────────────────────────────
// Device-local, keyed by item id (like the reminder overrides above). A web
// app can't set the OS push sound, so this only drives the in-app chime that
// plays when a reminder fires while Bloom is open.
const ITEM_SOUNDS_KEY = 'vivian_item_sounds'
export function getItemSound(id) {
  if (!id) return null
  try {
    const map = JSON.parse(localStorage.getItem(ITEM_SOUNDS_KEY) || '{}')
    return map[id] || null
  } catch { return null }
}
export function setItemSound(id, sound) {
  if (!id) return
  try {
    const map = JSON.parse(localStorage.getItem(ITEM_SOUNDS_KEY) || '{}')
    if (!sound) delete map[id]
    else map[id] = sound
    localStorage.setItem(ITEM_SOUNDS_KEY, JSON.stringify(map))
  } catch {}
}

// Leads for a specific item: its override if set, otherwise the global list.
// An 'end' entry becomes an end-of-task alert (fires at start + duration).
function leadsForItem(id, globalLeads) {
  const override = getItemReminders(id)
  if (override) return override.map(m => m === 'end' ? { end: true, key: 'end' } : { mins: m, key: `m${m}` })
  return globalLeads
}

// Reminders more than this far in the future aren't scheduled with a live
// timer (setTimeout gets unreliable over long spans and the tab rarely stays
// open that long). They still fire via catch-up whenever the app is reopened.
const MAX_TIMER_MS = 6 * 60 * 60 * 1000 // 6 hours

let timers = []
let swRegistration = null

// ── Background scheduling (Notification Triggers API) ──────────
// Where supported, a notification can be handed to the OS with a TimestampTrigger
// so it fires at its moment even when the app is fully closed — no push server,
// no open tab required. This is what makes reminders arrive when you haven't
// opened Bloom recently. Feature-detected; everything degrades to the timer +
// catch-up path when it's missing (Safari/iOS, Firefox).
export function triggersSupported() {
  return typeof window !== 'undefined' &&
    'Notification' in window &&
    'showTrigger' in Notification.prototype &&
    typeof window.TimestampTrigger !== 'undefined'
}
// Tags we've scheduled as OS triggers this session, so a later sync can cancel
// any that no longer correspond to a live reminder (deleted/rescheduled items).
const scheduledTriggerTags = new Set()

async function scheduleTriggeredReminder(reminder) {
  if (!swRegistration) return
  try {
    await swRegistration.showNotification(headingFor(reminder, reminder.at), {
      body: reminder.body,
      tag: reminder.id,
      data: { url: reminder.url },
      icon: BASE + 'icon-192.png',
      badge: BASE + 'icon-192.png',
      requireInteraction: false,
      showTrigger: new window.TimestampTrigger(reminder.at),
    })
    scheduledTriggerTags.add(reminder.id)
  } catch (e) {
    // A browser can advertise the API but reject a specific trigger; fall back
    // to the timer path for anything due soon.
    console.warn('[notifications] trigger schedule failed:', e)
  }
}

// Cancel any OS-scheduled (not-yet-fired) reminders whose tag is no longer live
// — e.g. the item was deleted, retimed, or completed since we scheduled it.
async function reconcileTriggered(liveTags) {
  if (!swRegistration || !swRegistration.getNotifications) return
  try {
    const pending = await swRegistration.getNotifications({ includeTriggered: true })
    for (const n of pending) {
      if (n.tag && scheduledTriggerTags.has(n.tag) && !liveTags.has(n.tag)) {
        n.close()
        scheduledTriggerTags.delete(n.tag)
      }
    }
  } catch {}
}

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
// Also drives auto-update: when a new build is deployed, the new service
// worker installs, activates (it calls skipWaiting), and takes control —
// which fires `controllerchange`, and we reload once so the running app
// swaps to the new bundle. Without this, an installed PWA (especially on
// iOS) can keep showing a stale version after a deploy.
let reloadingForUpdate = false
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null
  try {
    // Whether this page was already controlled by a worker when it loaded. On a
    // brand-new visit it isn't (controller is null); the first worker to claim
    // the page then fires controllerchange, and we must NOT reload for that —
    // only for a *later* worker swap, which is a genuine deploy update.
    const hadController = !!navigator.serviceWorker.controller

    swRegistration = await navigator.serviceWorker.register(BASE + 'sw.js', { scope: BASE })

    // Reload once when a new deploy's worker takes control of an already
    // controlled page (so the running app swaps onto the fresh bundle).
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadingForUpdate || !hadController) return
      reloadingForUpdate = true
      window.location.reload()
    })

    // Check for a new build now, and every time the app comes back to the
    // foreground (how you'd normally return to an installed PWA).
    const checkForUpdate = () => { swRegistration && swRegistration.update().catch(() => {}) }
    checkForUpdate()
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForUpdate()
    })

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

// ── Turn commitments + events + recurring into concrete reminders ──
// Returns [{ id, title, body, at (ms epoch), startMs, url }]
function buildReminders(events = [], commitments = [], recurring = []) {
  const out = []
  const now = Date.now()

  const globalLeads = activeLeads()
  // `leadId` (when given) picks per-item reminder overrides while `id` stays
  // the unique fired-bookkeeping key — recurring occurrences share a template's
  // lead settings but need a per-date id so each day fires once.
  const push = (item, startMs, name, body, durMins) => {
    for (const lead of leadsForItem(item.leadId || item.id, globalLeads)) {
      if (lead.end) {
        // End-of-task alert — fires when the task's window closes. Needs a known
        // duration; skip silently for items without one.
        if (!durMins) continue
        out.push({
          id: `${item.id}:end`,
          name, kind: 'end',
          body: 'Time to wrap up.',
          at: startMs + durMins * 60 * 1000,
          startMs, leadKey: 'end', url: BASE,
        })
        continue
      }
      const at = startMs - lead.mins * 60 * 1000
      out.push({
        id: `${item.id}:${lead.key}`,
        name,          // heading is built at fire time from how far off the start is
        kind: 'start',
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
    push(c, startMs, c.text || 'Commitment', `${dateLabel(c.date)}${timeLabel}`, c.durationMins)
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

  // Recurring occurrences: pre-expanded by App into concrete {id, leadId, date,
  // time, text} for the days ahead. Only timed ones remind. `id` already
  // carries the date so today's and tomorrow's fire independently.
  for (const r of recurring) {
    if (!r || !r.date || !r.time) continue
    const startMs = toEpoch(r.date, r.time)
    if (startMs == null) continue
    push({ id: r.id, leadId: r.leadId }, startMs, r.text || 'Task', `${dateLabel(r.date)} at ${fmt12(r.time)}`, r.durationMins)
  }

  return out
}

// ── Concrete future reminders, for background push ─────────────
// Same reminders `syncReminders` would fire, but shaped for server-side
// delivery: only the still-future ones, each with a fixed title/body computed
// now (the OS shows exactly this text later). src/lib/push.js queues these into
// Supabase so the send-reminders Edge Function can deliver them even when Bloom
// is closed. Independent of the local 'fired' bookkeeping — the server tracks
// its own 'sent' flag per device.
export function buildScheduledPushes(events, commitments, recurring = []) {
  const now = Date.now()
  return buildReminders(events, commitments, recurring)
    .filter(r => r.at > now)
    .map(r => ({
      tag: r.id,
      at: new Date(r.at).toISOString(),
      title: headingFor(r, r.at),
      body: r.body || '',
      url: r.url || BASE,
    }))
}

// ── The main entry point ────────────────────────────────────────
// Call on app load and whenever events/commitments change. Fires anything
// due now (catch-up) and sets live timers for anything due soon.
export function syncReminders(events, commitments, recurring = []) {
  clearTimers()
  const settings = getSettings()
  // Turned off (or not permitted): also drop any OS-scheduled triggers so
  // reminders stop arriving in the background too.
  if (!settings.enabled || permissionState() !== 'granted') {
    if (triggersSupported() && swRegistration) reconcileTriggered(new Set())
    return
  }

  const reminders = buildReminders(events, commitments, recurring)
  const fired = loadFired()
  const now = Date.now()
  let firedChanged = false

  // Prune fired entries for reminders that no longer exist (deleted items),
  // so the map doesn't grow forever.
  const liveIds = new Set(reminders.map(r => r.id))
  for (const key of Object.keys(fired)) {
    if (!liveIds.has(key)) { delete fired[key]; firedChanged = true }
  }

  // Prefer OS-scheduled triggers when the browser supports them: they fire even
  // when Bloom is fully closed. The live-timer + catch-up path is the fallback.
  const useTriggers = triggersSupported() && !!swRegistration
  const liveTags = new Set()

  for (const r of reminders) {
    // Don't bother reminding about something that has already started — but an
    // end-of-task alert fires at the END, so it's judged by its own moment (r.at)
    // below, not by whether the task has started.
    if (r.kind !== 'end' && r.startMs <= now) {
      if (!fired[r.id]) { fired[r.id] = now; firedChanged = true }
      continue
    }

    if (r.at > now) {
      // Future reminder.
      if (useTriggers) {
        // Hand it to the OS (idempotent by tag — rescheduling just replaces).
        liveTags.add(r.id)
        scheduleTriggeredReminder(r)
      } else if (!fired[r.id]) {
        const delay = r.at - now
        if (delay <= MAX_TIMER_MS) {
          // Due soon — schedule a live timer while the app stays open.
          const t = setTimeout(() => {
            fire(r)
            const f = loadFired(); f[r.id] = Date.now(); saveFired(f)
          }, delay)
          timers.push(t)
        }
        // else: too far out — will be caught on a future open.
      }
      continue
    }

    // r.at <= now < startMs: the reminder moment has passed but the event is
    // still ahead. With triggers, the OS already fired it (or will, if it's
    // still queued) — mark it handled so the catch-up path doesn't double it.
    // Without triggers, catch up now.
    if (!fired[r.id]) {
      if (!useTriggers) fire(r)
      fired[r.id] = now
      firedChanged = true
    }
  }

  if (useTriggers) reconcileTriggered(liveTags)
  if (firedChanged) saveFired(fired)
}

// Build the notification heading from how far the start is at fire time, so a
// catch-up reminder that pops late — or one pre-scheduled with a trigger —
// still reads accurately. `atMs` is when it fires (defaults to now).
function headingFor(reminder, atMs = Date.now()) {
  // End-of-task alert reads as the task finishing right now.
  if (reminder.kind === 'end') return `${reminder.name} finishing now`
  if (!reminder.startMs) return reminder.name || '🌸 Bloom'
  const mins = Math.round((reminder.startMs - atMs) / 60000)
  // At (or past) the start — the start alert reads as the task starting now.
  if (mins <= 0) return `${reminder.name} starting now`
  // Lead reminders read as "<task> in 15 min" / "<task> tomorrow".
  let when
  if (mins < 60)          when = `in ${mins} min`
  else if (mins < 120)    when = 'in 1 hour'
  else if (mins < 24 * 60) when = `in ${Math.round(mins / 60)} hours`
  else if (mins < 48 * 60) when = 'tomorrow'
  else                    when = `in ${Math.round(mins / 60 / 24)} days`
  return `${reminder.name} ${when}`
}

// Called once when the user first turns reminders on: mark every reminder
// whose moment has already passed as "handled", so enabling doesn't replay a
// backlog of notifications for items already on the calendar. Anything still
// in the future fires normally from here on.
export function primeBaseline(events, commitments, recurring = []) {
  const reminders = buildReminders(events, commitments, recurring)
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

  // If Bloom is open in the foreground, play this item's chosen alert sound.
  // (The OS controls the sound of the push notification itself.)
  try {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      const itemId = String(reminder.id || '').split(':')[0]
      const s = getItemSound(itemId)
      if (s && s !== 'none') playSound(s)
    }
  } catch {}
}

// Announce that a location-tagged task auto-started because you arrived. Fires
// only when notifications are permitted (it's a nudge, not a scheduled remind).
export function notifyArrival(name) {
  if (permissionState() !== 'granted') return
  fire({
    id: 'arrive:' + Date.now(),
    name: `📍 Started: ${name || 'task'}`,
    body: "You've arrived — Bloom started this task's progress.",
    url: BASE,
  })
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

// src/lib/calendars.js
// ─────────────────────────────────────────────────────────────
// Subscribed (external) calendars — the plumbing behind "let Bloom auto-populate
// my calendar with the events Mom schedules on our Apple Family calendar."
//
// Mom publishes the shared iCloud calendar (Calendar app → the calendar's ⓘ →
// Public Calendar → copy the webcal:// link). We store that URL, fetch the .ics
// on load, parse it (src/lib/ical.js), cache the result on-device, and hand the
// events to the Calendar view as read-only colored bands. A per-calendar toggle
// turns each feed on or off without deleting it.
//
// Fetching a cross-origin .ics from the browser is usually blocked by CORS, so
// we route through a tiny server proxy when one is configured (a Supabase Edge
// Function by default — see supabase/functions/ics-proxy). If none is available
// we still try a direct fetch (some feeds allow it), and either way the last
// good result stays cached so events persist offline and between sessions.
// ─────────────────────────────────────────────────────────────
import { parseICS } from './ical.js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
// Explicit override wins; otherwise use the Supabase Edge Function if Supabase
// is configured. Empty string disables proxying (direct fetch only).
const PROXY = import.meta.env.VITE_ICS_PROXY != null
  ? import.meta.env.VITE_ICS_PROXY
  : (SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/ics-proxy` : '')

export const DEFAULT_CAL_COLOR = '#C6A15B'

const cacheKey = (id) => `bloom_extcal_${id}`

// webcal:// is just http(s) with a different scheme — normalize it so fetch and
// the proxy can handle it.
export function normalizeIcsUrl(url) {
  const u = (url || '').trim()
  if (/^webcal:\/\//i.test(u)) return u.replace(/^webcal:\/\//i, 'https://')
  return u
}

// Fetch raw .ics text for a URL, preferring the proxy (CORS-safe) and falling
// back to a direct fetch. Throws with a friendly message on total failure.
export async function fetchIcsText(url) {
  const target = normalizeIcsUrl(url)
  if (!/^https?:\/\//i.test(target)) throw new Error('That doesn’t look like a calendar link. Use the webcal:// or https:// URL Apple gives you.')

  const attempts = []
  if (PROXY) {
    attempts.push(async () => {
      const res = await fetch(`${PROXY}?url=${encodeURIComponent(target)}`, {
        headers: SUPABASE_KEY ? { Authorization: `Bearer ${SUPABASE_KEY}`, apikey: SUPABASE_KEY } : {},
      })
      if (!res.ok) throw new Error(`Proxy responded ${res.status}`)
      return res.text()
    })
  }
  // Direct fetch (works only if the feed sends permissive CORS headers).
  attempts.push(async () => {
    const res = await fetch(target)
    if (!res.ok) throw new Error(`Feed responded ${res.status}`)
    return res.text()
  })

  let lastErr
  for (const run of attempts) {
    try {
      const text = await run()
      if (text && /BEGIN:VCALENDAR/i.test(text)) return text
      lastErr = new Error('That link didn’t return a calendar (no VCALENDAR data).')
    } catch (e) { lastErr = e }
  }
  throw lastErr || new Error('Could not reach that calendar link.')
}

// Fetch + parse a subscription; on success cache the parsed events on-device.
// Returns { events, fetchedAt }. Throws on failure (caller keeps the cache).
export async function refreshCalendar(sub) {
  const text = await fetchIcsText(sub.url)
  const events = parseICS(text)
  const payload = { events, fetchedAt: Date.now() }
  try { localStorage.setItem(cacheKey(sub.id), JSON.stringify(payload)) } catch {}
  return payload
}

// Read the last cached parse for a subscription (instant, offline-friendly).
export function loadCachedCalendar(id) {
  try {
    const raw = localStorage.getItem(cacheKey(id))
    if (!raw) return null
    const v = JSON.parse(raw)
    if (v && Array.isArray(v.events)) return v
  } catch {}
  return null
}

export function clearCachedCalendar(id) {
  try { localStorage.removeItem(cacheKey(id)) } catch {}
}

// Map a subscription's parsed events into the shape Bloom's Calendar renders for
// multi-day spans, tagged read-only so the UI never offers to edit/delete them.
export function eventsToSpans(sub, events) {
  return (events || []).map((e, i) => ({
    id: `ext:${sub.id}:${e.uid}:${e.startDate}:${i}`,
    label: e.summary,
    startDate: e.startDate,
    endDate: e.endDate,
    allDay: e.allDay,
    startTime: e.startTime,
    endTime: e.endTime,
    color: sub.color || DEFAULT_CAL_COLOR,
    icon: sub.icon || '',
    external: true,
    calendarId: sub.id,
    calendarName: sub.name,
    location: e.location || '',
  }))
}

// Whether a real fetch proxy is available — used by the UI to warn when a direct
// fetch is the only option (iCloud feeds usually need the proxy for CORS).
export const hasProxy = !!PROXY

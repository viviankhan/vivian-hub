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

// Fetch raw .ics text for a URL. When a proxy is configured we go through it and
// report its exact outcome (so a failure says *why* — 404, 401, 502…). Only when
// there's no proxy do we try a direct browser fetch. Throws a short, specific
// message on failure.
export async function fetchIcsText(url) {
  const target = normalizeIcsUrl(url)
  if (!/^https?:\/\//i.test(target)) throw new Error('That doesn’t look like a calendar link. Use the webcal:// or https:// URL Apple gives you.')

  if (PROXY) {
    const endpoint = `${PROXY}?url=${encodeURIComponent(target)}`
    let res
    try {
      res = await fetch(endpoint, { headers: SUPABASE_KEY ? { Authorization: `Bearer ${SUPABASE_KEY}`, apikey: SUPABASE_KEY } : {} })
    } catch (e) {
      // A rejected fetch (not an HTTP status) = the request never completed. For
      // a Supabase function this is almost always the CORS preflight being
      // blocked because the function has JWT verification ON — turn it OFF.
      console.warn('[Bloom] proxy fetch rejected:', endpoint, e)
      throw new Error('Proxy blocked (CORS/JWT). In Supabase, open the ics-proxy function’s settings and turn OFF “Verify JWT”, then tap ⟳.')
    }
    if (!res.ok) {
      let body = ''
      try { body = (await res.text()).slice(0, 100) } catch {}
      console.warn('[Bloom] proxy error', res.status, endpoint, body)
      if (res.status === 404) throw new Error('Proxy 404 — no “ics-proxy” function at this project. Check the function name is exactly ics-proxy and it’s deployed.')
      if (res.status === 401 || res.status === 403) throw new Error('Proxy 401 — auth rejected. Turn OFF “Verify JWT” on the ics-proxy function, then tap ⟳.')
      if (res.status === 502 || res.status === 500) throw new Error(`Proxy couldn’t load that link (${res.status}). Check the calendar URL is a public webcal/ICS link.${body ? ' · ' + body : ''}`)
      throw new Error(`Proxy error ${res.status}${body ? ' — ' + body : ''}`)
    }
    const text = await res.text()
    if (/BEGIN:VCALENDAR/i.test(text)) return text
    throw new Error('That link didn’t return a calendar. Make sure it’s the public webcal/ICS link, not the Calendar sharing page.')
  }

  // No proxy configured — direct browser fetch (works only for CORS-enabled feeds).
  let res
  try { res = await fetch(target) }
  catch (e) { console.warn('[Bloom] direct fetch failed:', e); throw new Error('Couldn’t reach the calendar. An iCloud link needs the ics-proxy function set up (see CALENDAR_SYNC.md).') }
  if (!res.ok) throw new Error(`Calendar feed responded ${res.status}.`)
  const text = await res.text()
  if (/BEGIN:VCALENDAR/i.test(text)) return text
  throw new Error('That link didn’t return a calendar (no VCALENDAR data).')
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

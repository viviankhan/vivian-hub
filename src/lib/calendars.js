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
    // Supabase validates a Bearer token even when the function's JWT check is
    // OFF, so only put the key in Authorization when it's actually a JWT (legacy
    // anon keys start with "eyJ"). New "publishable" keys (sb_...) go in the
    // apikey header only — a Bearer'd non-JWT is exactly what triggers a 401.
    const isJwt = typeof SUPABASE_KEY === 'string' && SUPABASE_KEY.startsWith('eyJ')
    const headerVariants = []
    if (SUPABASE_KEY) headerVariants.push(isJwt ? { Authorization: `Bearer ${SUPABASE_KEY}`, apikey: SUPABASE_KEY } : { apikey: SUPABASE_KEY })
    headerVariants.push({})   // last resort: no auth at all (works when JWT verify is off)

    let res, lastStatus = 0, lastBody = ''
    for (const headers of headerVariants) {
      try {
        res = await fetch(endpoint, { headers })
      } catch (e) {
        console.warn('[Bloom] proxy fetch rejected:', endpoint, e)
        throw new Error('Proxy blocked (CORS). The ics-proxy function isn’t reachable — confirm it’s deployed at this project, then tap ⟳.')
      }
      if (res.ok) break
      lastStatus = res.status
      try { lastBody = (await res.text()).slice(0, 120) } catch {}
      console.warn('[Bloom] proxy error', res.status, JSON.stringify(headers), lastBody)
      if (res.status !== 401 && res.status !== 403) break   // only an auth error is worth retrying without auth
      res = null
    }

    if (!res || !res.ok) {
      if (lastStatus === 404) throw new Error('Proxy 404 — no “ics-proxy” function at this project. Check the function name is exactly ics-proxy and it’s deployed.')
      if (lastStatus === 401 || lastStatus === 403) throw new Error('Proxy 401 even with no auth — the ics-proxy function still has JWT/auth enforced. In its Settings turn OFF “Verify JWT”, Save, then tap ⟳.')
      if (lastStatus === 502 || lastStatus === 500) throw new Error(`Proxy couldn’t load that link (${lastStatus}). Check the calendar URL is a public webcal/ICS link.${lastBody ? ' · ' + lastBody : ''}`)
      throw new Error(`Proxy error ${lastStatus || '?'}${lastBody ? ' — ' + lastBody : ''}`)
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

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
// we route through Bloom's own server proxy (a Supabase Edge Function — see
// supabase/functions/ics-proxy). If that fails we still try a direct fetch
// (some feeds allow it), and either way the last good result stays cached so
// events persist offline and between sessions. A feed URL is a secret key to
// someone's calendar, so it never goes to a third-party relay.
// ─────────────────────────────────────────────────────────────
import { parseICS } from './ical.js'
import { supabase } from './storage.js'

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

// A fetch that gives up after `ms`, so a hung proxy falls through to the direct
// fetch instead of stalling the sync.
async function fetchWithTimeout(url, opts = {}, ms = 12000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...opts, signal: ctrl.signal }) }
  finally { clearTimeout(timer) }
}

// Try Bloom's own Supabase Edge Function proxy. Returns .ics text, or throws
// with a specific reason. The proxy only serves signed-in accounts, so it gets
// this session's token; the project key alone (signed out) is tried too, for a
// proxy deployed without that check.
async function viaSupabaseProxy(target) {
  const endpoint = `${PROXY}?url=${encodeURIComponent(target)}`
  const isJwt = typeof SUPABASE_KEY === 'string' && SUPABASE_KEY.startsWith('eyJ')
  let token = null
  try { token = (await supabase?.auth.getSession())?.data?.session?.access_token || null } catch {}
  const headerVariants = []
  if (token) headerVariants.push({ Authorization: `Bearer ${token}`, ...(SUPABASE_KEY ? { apikey: SUPABASE_KEY } : {}) })
  else if (SUPABASE_KEY) headerVariants.push(isJwt ? { Authorization: `Bearer ${SUPABASE_KEY}`, apikey: SUPABASE_KEY } : { apikey: SUPABASE_KEY })
  headerVariants.push({})

  let res, lastStatus = 0, lastBody = ''
  for (const headers of headerVariants) {
    try { res = await fetchWithTimeout(endpoint, { headers }) }
    catch (e) { console.warn('[Bloom] proxy fetch rejected:', e); throw new Error('proxy-unreachable') }
    if (res.ok) break
    lastStatus = res.status
    try { lastBody = (await res.text()).slice(0, 120) } catch {}
    console.warn('[Bloom] proxy error', res.status, JSON.stringify(headers), lastBody)
    if (res.status !== 401 && res.status !== 403) break
    res = null
  }
  if (!res || !res.ok) { const e = new Error(`proxy-${lastStatus || 'error'}`); e.status = lastStatus; e.body = lastBody; throw e }
  const text = await res.text()
  if (/BEGIN:VCALENDAR/i.test(text)) return text
  throw new Error('proxy-no-vcalendar')
}

// Fetch raw .ics text for a URL: through Bloom's own proxy, else directly.
export async function fetchIcsText(url) {
  const target = normalizeIcsUrl(url)
  if (!/^https?:\/\//i.test(target)) throw new Error('That doesn’t look like a calendar link. Use the webcal:// or https:// URL Apple gives you.')

  let proxyErr = null
  if (PROXY) {
    try { return await viaSupabaseProxy(target) }
    catch (e) { proxyErr = e; console.warn('[Bloom] Supabase proxy failed, trying a direct fetch:', e?.message) }
  }

  // Last resort: a direct fetch (works only for CORS-enabled feeds).
  try {
    const res = await fetch(target)
    if (res.ok) { const t = await res.text(); if (/BEGIN:VCALENDAR/i.test(t)) return t }
  } catch (e) { console.warn('[Bloom] direct fetch failed:', e?.message) }

  // Everything failed — surface the most useful reason.
  if (proxyErr?.status === 404) throw new Error('Couldn’t load the calendar. (ics-proxy 404 — check the function is deployed.)')
  if (proxyErr?.status === 401 || proxyErr?.status === 403) throw new Error('Couldn’t load the calendar. Sign in again, then tap ⟳.')
  throw new Error('Couldn’t reach the calendar. Check it’s a public webcal/ICS link and you’re online, then tap ⟳.')
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
    // The event's own UID + start day give it a stable identity across re-parses
    // (the array index in `id` is not stable) — Today/Week key a task's checked
    // state and "added to my schedule" adoption off this. See lib/importedTasks.
    uid: e.uid || '',
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

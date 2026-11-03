// src/lib/visits.js
// ─────────────────────────────────────────────────────────────
// Where you spent your time, so the ✨ assistant can answer "how long was I at
// work?", "how long have I been here?" or "how long was I at Roca climbing gym
// yesterday?" without sending anything anywhere.
//
// While Bloom is open (and location memory is on) every position fix is filed
// into a *stay*: one unbroken stretch at one spot. A fix near one of your
// places (saved places, recent places, a task's place) is filed under that
// place's name; a fix somewhere new starts a stay at that spot, which is then
// named by a one-off reverse geocode ("Roca Climbing Gym, Seattle"), so a gym
// you never saved can still be asked about by name.
//
// The honest limit: a web app can't see your location while it's closed. A
// stay therefore runs from the first to the last time Bloom saw you there, and
// two sightings of the same place a few hours apart with nothing elsewhere in
// between are treated as one stay (you opened Bloom at work at 9 and again at
// 5 → you were at work 9–5). Answers say which times Bloom saw, so you can
// tell how solid a number is.
//
// The log lives only on this device (localStorage) — it's never sent to the
// cloud or to the AI. The pure half (recordFix, answerPlaceQuestion…) takes
// everything as arguments so it can be unit-tested in node.
// ─────────────────────────────────────────────────────────────
import { distanceMeters, DEFAULT_RADIUS_M, geolocationSupported, geolocationPermission, getCurrentLocation, reverseGeocode } from './geofence.js'
import { getSavedPlaces, getRecentPlaces } from './places.js'

const LOG_KEY = 'bloom_visits'
const PREF_KEY = 'bloom_visit_tracking'   // '1' on, '0' off, unset = on when location is already allowed
export const VISITS_EVENT = 'bloom-visits'

// Two sightings of the same place this close together (with nothing elsewhere
// between) are one stay — long enough to bridge a workday opened morning and
// evening, short enough not to bridge a night.
export const JOIN_MS = 9 * 60 * 60 * 1000
// A fix vaguer than this can't tell one building from the next — skip it.
export const MAX_ACCURACY_M = 250
// You're "still here" if Bloom saw you here this recently.
export const HERE_MS = 20 * 60 * 1000
const KEEP_MS = 120 * 86400000
const KEEP_MAX = 3000

// ── Pure: filing fixes into stays ──────────────────────────────

function cleanStays(stays) {
  return (Array.isArray(stays) ? stays : []).filter(s =>
    s && Number.isFinite(s.lat) && Number.isFinite(s.lng) && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end >= s.start)
}

// The known place a fix falls inside, nearest first; null when it's nowhere
// you've named.
export function matchPlace(fix, places) {
  let best = null, bestD = Infinity
  const slack = Math.min(fix.accuracy || 0, 100)
  for (const p of places || []) {
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue
    const d = distanceMeters(fix, p)
    if (d <= (p.radius || DEFAULT_RADIUS_M) + slack && d < bestD) { best = p; bestD = d }
  }
  return best
}

function sameSpot(stay, fix, place) {
  if (place && stay.placeId) return stay.placeId === placeKey(place)
  return distanceMeters(stay, place || fix) <= DEFAULT_RADIUS_M + Math.min(fix.accuracy || 0, 100)
}

// Places are identified by name+rough position rather than id: the same spot
// can be both a saved place and a recent place, with different ids.
function placeKey(p) {
  return `${(p.name || '').trim().toLowerCase()}@${p.lat.toFixed(3)},${p.lng.toFixed(3)}`
}

// File one fix ({lat,lng,accuracy}) seen at time `t`. Returns a new stays array
// (newest last); the input is not modified.
export function recordFix(stays, fix, places, t) {
  const list = cleanStays(stays)
  if (!fix || !Number.isFinite(fix.lat) || !Number.isFinite(fix.lng) || !Number.isFinite(t)) return list
  if ((fix.accuracy || 0) > MAX_ACCURACY_M) return list
  const place = matchPlace(fix, places)
  const last = list[list.length - 1]
  if (last && t >= last.end && t - last.end <= JOIN_MS && sameSpot(last, fix, place)) {
    const next = { ...last, end: t, fixes: (last.fixes || 1) + 1 }
    // A place named after the stay began (you saved it while there) claims it.
    if (place && !last.placeId) Object.assign(next, { placeId: placeKey(place), name: place.name || last.name, lat: place.lat, lng: place.lng })
    return [...list.slice(0, -1), next]
  }
  if (last && t < last.end) return list   // out of order — ignore
  const stay = place
    ? { id: 's' + t, placeId: placeKey(place), name: place.name || '', lat: place.lat, lng: place.lng, start: t, end: t, fixes: 1 }
    : { id: 's' + t, placeId: null, name: '', lat: fix.lat, lng: fix.lng, start: t, end: t, fixes: 1 }
  return trim([...list, stay], t)
}

function trim(list, now) {
  const kept = list.filter(s => now - s.end <= KEEP_MS)
  return kept.length > KEEP_MAX ? kept.slice(-KEEP_MAX) : kept
}

// The stay you're in right now, if Bloom saw you there recently.
export function currentStay(stays, now) {
  const list = cleanStays(stays)
  const last = list[list.length - 1]
  return last && now - last.end <= HERE_MS ? last : null
}

// ── Pure: reading a question ───────────────────────────────────

const HERE_WORDS = /^(?:(?:this|my|the)\s+)?(?:(?:current|present)\s+)?(?:location|place|spot)$|^here$|^where i am\b/
// Word families so "work" finds a place you saved as "Office".
const SYNONYMS = [
  ['work', 'office', 'job', 'workplace'],
  ['home', 'house', 'apartment', 'apt', 'my place', 'flat'],
  ['gym', 'fitness'],
  ['school', 'campus', 'class', 'university', 'college'],
  ['climbing', 'climbing gym', 'bouldering'],
]
const STOP = new Set(['the', 'a', 'an', 'my', 'at', 'in', 'of', 'to'])

function norm(s) {
  return String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
}
function tokens(s) { return norm(s).split(' ').filter(w => w && !STOP.has(w)) }

// Is this a "how long / when" question about a place? (Cheap and local, so the
// assistant can answer it on the spot instead of queueing it for the AI.)
export function isPlaceQuestion(text) {
  return !!parsePlaceQuestion(text, Date.now())
}

function startOfDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
function addDays(t, n) { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime() }
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

// Pull a time range out of the question and return the rest of the text.
export function takeScope(q, now) {
  const today = startOfDay(now)
  const rules = [
    [/\b(?:so far )?today\b/, () => ({ from: today, to: addDays(today, 1), label: 'today' })],
    [/\byesterday\b/, () => ({ from: addDays(today, -1), to: today, label: 'yesterday' })],
    [/\bthis week\b/, () => { const f = addDays(today, -((new Date(today).getDay() + 6) % 7)); return { from: f, to: addDays(f, 7), label: 'this week' } }],
    [/\blast week\b/, () => { const f = addDays(today, -((new Date(today).getDay() + 6) % 7) - 7); return { from: f, to: addDays(f, 7), label: 'last week' } }],
    [/\bthis month\b/, () => { const d = new Date(today); d.setDate(1); const f = d.getTime(); d.setMonth(d.getMonth() + 1); return { from: f, to: d.getTime(), label: 'this month' } }],
    [/\b(?:in the )?(?:last|past) (\d+) days\b/, (m) => ({ from: addDays(today, -(+m[1] - 1)), to: addDays(today, 1), label: `in the last ${m[1]} days` })],
    [new RegExp(`\\b(?:on |last )?(${WEEKDAYS.join('|')})\\b`), (m) => {
      const want = WEEKDAYS.indexOf(m[1])
      let back = (new Date(today).getDay() - want + 7) % 7
      if (back === 0 && /last /.test(m[0])) back = 7
      const f = addDays(today, -back)
      return { from: f, to: addDays(f, 1), label: back === 0 ? 'today' : back === 1 ? 'yesterday' : `on ${m[1][0].toUpperCase()}${m[1].slice(1)}` }
    }],
  ]
  for (const [re, fn] of rules) {
    const m = q.match(re)
    if (m) return { scope: fn(m), rest: (q.slice(0, m.index) + ' ' + q.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim() }
  }
  return { scope: null, rest: q }
}

// → { ask: 'duration'|'arrived'|'left', target: string|'HERE', scope, ongoing }
// or null when the text isn't a place question.
export function parsePlaceQuestion(text, now) {
  let q = norm(text)
  if (!q) return null
  let ask = null
  if (/\b(?:how long|how much time|how many hours|how many minutes)\b/.test(q)) ask = 'duration'
  else if (/\bwhen did i (?:get (?:to|here|there)|arrive|show up)\b/.test(q)) ask = 'arrived'
  else if (/\bwhen did i (?:leave|head out|go home from)\b/.test(q)) ask = 'left'
  if (!ask) return null
  const { scope, rest } = takeScope(q, now)
  q = rest
  let target = null
  const m = q.match(/\b(?:at|in|from|to)\s+(.+)$/) || q.match(/\b(?:leave|left)\s+(.+)$/)
  if (m) {
    // Trailing filler: "for", "so far", "for in total"…
    target = m[1].replace(/\b(?:for|so far|in total|total|altogether|last time|the last time|this time|right now|now)\b.*$/, '').trim()
  }
  if (!target ? /\bhere\b/.test(q) : HERE_WORDS.test(target)) target = 'HERE'
  else if (target) target = target.replace(/^(?:the|my)\s+/, '').trim()
  if (!target) return null
  // Make sure it's about you being somewhere, not "how long is the drive to…".
  if (!/\b(?:i|ive|was i|have i|did i|am i|been|spend|spent|stay|stayed)\b/.test(q)) return null
  const ongoing = /\b(?:have i been|ive been|am i|been here|so far)\b/.test(norm(text))
  return { ask, target, scope, ongoing }
}

// How well a place name answers a target ("work", "roca climbing gym").
// 0 = not it.
export function nameScore(name, target) {
  const n = norm(name), t = norm(target)
  if (!n || !t) return 0
  const head = norm(String(name).split(',')[0])
  if (n === t || head === t) return 4
  if (head.startsWith(t) || head.includes(t) || (head.length > 2 && t.includes(head))) return 3
  const nt = new Set(tokens(name))
  const expand = (w) => { const fam = SYNONYMS.find(f => f.includes(w)); return fam ? fam : [w] }
  const tt = tokens(target)
  if (!tt.length) return 0
  const hits = tt.filter(w => expand(w).some(x => x.split(' ').every(y => nt.has(y)) || [...nt].some(y => y.startsWith(w) && w.length >= 4)))
  if (hits.length === tt.length) return 2
  if (hits.length * 2 >= tt.length && hits.length > 0 && tt.length > 1) return 1
  return 0
}

// The stays a target refers to: by name, or near a known place of that name.
export function staysFor(stays, places, target) {
  const list = cleanStays(stays)
  const named = [...(places || []).filter(p => p && Number.isFinite(p.lat)), ...list].map(x => ({ x, s: nameScore(x.name, target) })).filter(o => o.s > 0)
  if (!named.length) return { stays: [], name: '' }
  const top = Math.max(...named.map(o => o.s))
  const best = named.filter(o => o.s === top).map(o => o.x)
  const name = (best.find(b => !('start' in b)) || best[best.length - 1]).name
  const anchors = best
  const out = list.filter(s => anchors.some(a => a === s || (s.placeId && a.placeId && s.placeId === a.placeId)
    || distanceMeters(s, a) <= Math.max(a.radius || DEFAULT_RADIUS_M, DEFAULT_RADIUS_M)))
  return { stays: out, name: String(name || '').split(',')[0].trim() || target }
}

// ── Pure: answering ────────────────────────────────────────────

function fmtDur(ms) {
  const m = Math.max(0, Math.round(ms / 60000))
  if (m < 1) return 'less than a minute'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60), rm = m % 60
  if (h < 24) return rm ? `${h}h ${rm}m` : `${h}h`
  const d = Math.floor(h / 24), rh = h % 24
  return rh ? `${d}d ${rh}h` : `${d}d`
}
function fmtTime(t) {
  return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
function fmtDay(t, now) {
  const d0 = startOfDay(now), d = startOfDay(t)
  if (d === d0) return 'today'
  if (d === addDays(d0, -1)) return 'yesterday'
  if (d0 - d < 6 * 86400000) return 'on ' + new Date(t).toLocaleDateString([], { weekday: 'long' })
  return 'on ' + new Date(t).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}
function span(s, now) {
  const sameDay = startOfDay(s.start) === startOfDay(s.end)
  return sameDay
    ? `${fmtTime(s.start)}–${fmtTime(s.end)} ${fmtDay(s.start, now)}`
    : `${fmtTime(s.start)} ${fmtDay(s.start, now)} to ${fmtTime(s.end)} ${fmtDay(s.end, now)}`
}

const LIMIT_NOTE = 'Bloom only sees your location while it’s open, so these are the first and last times it saw you there.'

// Answer a place question from the stay log. Returns
// { text, note?, needsTracking? } — or null when it isn't a place question.
export function answerPlaceQuestion(text, { stays, places, now, tracking = true }) {
  const q = parsePlaceQuestion(text, now)
  if (!q) return null
  const list = cleanStays(stays)
  const off = !tracking
  const empty = (msg) => ({ text: msg, note: off ? 'Location memory is off, so Bloom isn’t keeping track of where you spend time. Turn it on and it will start remembering (only while Bloom is open, and only on this device).' : LIMIT_NOTE, needsTracking: off })

  // Which stays?
  let pool, name
  if (q.target === 'HERE') {
    const cur = currentStay(list, now)
    if (!cur) return empty(off ? 'I don’t know where you are right now.' : 'I haven’t seen your location in the last few minutes, so I can’t tell how long you’ve been here. Keep Bloom open for a moment and ask again.')
    pool = list.filter(s => s === cur || (s.placeId && s.placeId === cur.placeId) || distanceMeters(s, cur) <= DEFAULT_RADIUS_M)
    name = (cur.name || '').split(',')[0].trim()
  } else {
    const r = staysFor(list, places, q.target)
    pool = r.stays; name = r.name
    if (!pool.length) {
      const known = r.name && (places || []).some(p => nameScore(p.name, q.target) > 0)
      return empty(known
        ? `I haven’t seen you at ${r.name} yet.`
        : `I don’t have a place called “${q.target}”. Save it under Settings → Saved places (or just open Bloom while you’re there) and I’ll remember your time there.`)
    }
  }
  const isHere = q.target === 'HERE'
  // "at Work" / "here at Work"; and the bare form for "got to …" / "left …".
  const atWhere = isHere ? (name ? `here at ${name}` : 'here') : `at ${name}`
  const bare = isHere ? 'here' : name
  const cur = currentStay(list, now)
  const isNow = (s) => cur && s.id === cur.id

  // A range: total time across every stay in it.
  if (q.scope && q.ask === 'duration') {
    const parts = pool.map(s => ({ s, a: Math.max(s.start, q.scope.from), b: Math.min(isNow(s) ? now : s.end, q.scope.to) })).filter(p => p.b > p.a || (p.b === p.a && p.a >= q.scope.from && p.a < q.scope.to))
    if (!parts.length) return { text: `I didn’t see you ${atWhere} ${q.scope.label}.`, note: LIMIT_NOTE }
    const total = parts.reduce((n, p) => n + (p.b - p.a), 0)
    const visits = parts.length
    const detail = parts.map(p => isNow(p.s) ? `${fmtTime(p.a)}–now` : `${fmtTime(p.a)}–${fmtTime(p.b)}`).join(', ')
    return {
      text: `You were ${atWhere} for ${fmtDur(total)} ${q.scope.label}${visits > 1 ? ` across ${visits} visits` : ''} (${detail}).`,
      note: LIMIT_NOTE,
    }
  }

  // No range: the visit you're in, or the most recent one.
  const last = pool[pool.length - 1]
  const inIt = isNow(last)
  if (q.ask === 'arrived') {
    return { text: `You got ${isHere ? 'here' : 'to ' + bare} around ${fmtTime(last.start)} ${fmtDay(last.start, now)}.`, note: 'That’s when Bloom first saw you there — you may have arrived a little earlier.' }
  }
  if (q.ask === 'left') {
    if (inIt) return { text: `You’re still ${atWhere} — you’ve been there since ${fmtTime(last.start)}.`, note: LIMIT_NOTE }
    return { text: `You left ${bare} around ${fmtTime(last.end)} ${fmtDay(last.end, now)}.`, note: 'That’s the last time Bloom saw you there — you may have left a little later.' }
  }
  if (inIt) {
    const dur = now - last.start
    return { text: `You’ve been ${atWhere} for ${fmtDur(dur)} so far — since ${fmtTime(last.start)}${startOfDay(last.start) === startOfDay(now) ? '' : ' ' + fmtDay(last.start, now)}.`, note: LIMIT_NOTE }
  }
  if (last.end === last.start) {
    return { text: `Bloom only caught you ${atWhere} once, at ${fmtTime(last.start)} ${fmtDay(last.start, now)}, so I can’t say how long you stayed.`, note: 'Open Bloom again before you leave a place next time and I’ll have both ends of the visit.' }
  }
  return { text: `You were ${atWhere} for ${fmtDur(last.end - last.start)} — ${span(last, now)}.`, note: LIMIT_NOTE }
}

// ── Browser: the log and the tracker ───────────────────────────

export function getVisits() {
  try { return cleanStays(JSON.parse(localStorage.getItem(LOG_KEY) || '[]')) } catch { return [] }
}
function saveVisits(list) {
  try { localStorage.setItem(LOG_KEY, JSON.stringify(list)) } catch {}
  try { window.dispatchEvent(new Event(VISITS_EVENT)) } catch {}
}

// Places a stay can be filed under: saved, recent, and whatever the app adds
// (task places) through setExtraPlaces.
let extraPlaces = []
export function setExtraPlaces(list) { extraPlaces = Array.isArray(list) ? list : [] }
export function knownPlaces() {
  return [...getSavedPlaces(), ...getRecentPlaces(), ...extraPlaces].filter(p => p && p.name && Number.isFinite(p.lat) && Number.isFinite(p.lng))
}

export function getTrackingPref() {
  try { return localStorage.getItem(PREF_KEY) } catch { return null }
}
// On when switched on, or — until you choose — when location is already
// allowed (so it never triggers a permission prompt on its own).
export async function trackingEnabled() {
  const p = getTrackingPref()
  if (p === '1') return true
  if (p === '0') return false
  return (await geolocationPermission()) === 'granted'
}
export function isTrackingOn() {
  // Synchronous best guess for the UI; the tracker itself uses trackingEnabled().
  return tracker.watchId != null || getTrackingPref() === '1'
}

export async function setTracking(on) {
  try { localStorage.setItem(PREF_KEY, on ? '1' : '0') } catch {}
  try { window.dispatchEvent(new Event(VISITS_EVENT)) } catch {}
  if (on) {
    const fix = await getCurrentLocation()   // asks for permission if needed
    fileFix(fix, Date.now())
    refresh()
  } else {
    stopWatch()
  }
}

const tracker = { watchId: null, started: false, lastWrite: 0, naming: new Set() }

function fileFix(fix, t) {
  const before = getVisits()
  const after = recordFix(before, fix, knownPlaces(), t)
  const last = after[after.length - 1]
  const changedStay = !before.length || before[before.length - 1].id !== last?.id
  // Extending a stay is cheap but needn't be written on every GPS tick.
  if (!changedStay && t - tracker.lastWrite < 30000) return
  tracker.lastWrite = t
  saveVisits(after)
  if (last && !last.name && !tracker.naming.has(last.id)) nameStay(last)
}

async function nameStay(stay) {
  tracker.naming.add(stay.id)
  const name = await reverseGeocode(stay.lat, stay.lng)
  if (!name) { tracker.naming.delete(stay.id); return }
  const list = getVisits().map(s => (s.id === stay.id && !s.name) ? { ...s, name } : s)
  saveVisits(list)
}

function stopWatch() {
  if (tracker.watchId != null && geolocationSupported()) navigator.geolocation.clearWatch(tracker.watchId)
  tracker.watchId = null
}

async function refresh() {
  const visible = typeof document === 'undefined' || document.visibilityState !== 'hidden'
  if (!visible || !geolocationSupported() || !(await trackingEnabled())) { stopWatch(); return }
  if (tracker.watchId != null) return
  tracker.watchId = navigator.geolocation.watchPosition(
    pos => fileFix({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }, Date.now()),
    () => {},
    { enableHighAccuracy: true, timeout: 30000, maximumAge: 60000 },
  )
}

// Start remembering where you spend time. Watches only while the tab is
// visible; safe to call more than once.
export function startVisitTracking() {
  if (tracker.started || typeof window === 'undefined') return
  tracker.started = true
  document.addEventListener('visibilitychange', refresh)
  window.addEventListener(VISITS_EVENT, () => { if (tracker.watchId == null) refresh() })
  refresh()
}

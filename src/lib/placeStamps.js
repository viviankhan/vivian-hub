// src/lib/placeStamps.js
// Arrivals, departures and check-ins (place_events rows, see lib/placeHooks.js)
// turned into where you were and each item's start and end for a day. Kept
// apart from placeHooks.js so it has no storage imports and can be tested on
// its own.
import { distanceMeters, DEFAULT_RADIUS_M } from './geofence.js'

const localDay = (ms) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// Events → { 'id@YYYY-MM-DD': { start, end } } in epoch ms, by your local day.
// A day runs from its first arrival to its last departure, so stepping out for
// lunch doesn't end it; while the latest event is an arrival you're still
// there (end: null). A departure with no arrival before it that day is
// ignored — there's nothing for it to end.
export function placeStamps(events) {
  const out = {}
  for (const ev of events || []) {
    const at = Date.parse(ev.at)
    if (!Number.isFinite(at) || !ev.task_id) continue
    const key = `${ev.task_id}@${localDay(at)}`
    const cur = out[key]
    if (ev.kind === 'arrive') {
      if (!cur) out[key] = { start: at, end: null }
      else cur.end = null
    } else if (ev.kind === 'leave' && cur) {
      cur.end = at
    }
  }
  return out
}

// A check-in carries no accuracy, so allow a little GPS wander past a place's
// edge. Indoors a phone is often off by a few dozen meters.
const CHECKIN_SLACK_M = 25

// The place a check-in falls in: of the places whose circle holds it, the one
// whose pin is nearest — so a desk and the parking lot next door stay apart.
export function placeForCheckin(pt, places) {
  let best = null, bestD = Infinity
  for (const p of places || []) {
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue
    const d = distanceMeters(pt, p)
    if (d <= (p.radius || DEFAULT_RADIUS_M) + CHECKIN_SLACK_M && d < bestD) { best = p; bestD = d }
  }
  return best
}

const spotKey = (p) => `${(p.name || '').trim().toLowerCase()}@${p.lat.toFixed(4)},${p.lng.toFixed(4)}`

// Check-ins → the stops of your days, oldest first:
//   [{ key, name, lat, lng, start, end }]   (end null = you're still there)
// Every automation checks in as you come and go, so you were at a stop from
// its first check-in until the next check-in somewhere else. A check-in
// outside every place you've named is its own stop with no name (on the bus,
// walking over), which you can name later. Rows without a location (an
// item's arrive/leave) are skipped.
export function checkinStops(events, places) {
  const pings = (events || [])
    .filter(ev => ev && ev.kind === 'ping' && Number.isFinite(ev.lat) && Number.isFinite(ev.lng))
    .map(ev => ({ lat: ev.lat, lng: ev.lng, at: Date.parse(ev.at) }))
    .filter(p => Number.isFinite(p.at))
    .sort((a, b) => a.at - b.at)
  const stops = []
  for (const p of pings) {
    const place = placeForCheckin(p, places)
    const key = place ? spotKey(place) : null
    const last = stops[stops.length - 1]
    if (last && (key ? last.key === key : (!last.key && distanceMeters(last, p) <= DEFAULT_RADIUS_M))) continue
    if (last) last.end = p.at
    stops.push(place
      ? { key, name: place.name || '', lat: place.lat, lng: place.lng, start: p.at, end: null }
      : { key: null, name: '', lat: p.lat, lng: p.lng, start: p.at, end: null })
  }
  return stops
}

// A stop counts as an item's place when its pin is this close to the item's
// (the same building, not the lot across the street).
const SAME_SPOT_M = 75

// Stops → { 'id@YYYY-MM-DD': { start, end } } for items tied to a place, the
// same shape as placeStamps. A day runs from the first stop at the item's
// place that began that day to the end of the last one (null while you're
// still there), so a lunch out in between doesn't split it.
//   items: [{ id, location: { lat, lng } }]
export function locatedStamps(stops, items) {
  const out = {}
  for (const it of items || []) {
    const loc = it && it.location
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) continue
    for (const s of stops || []) {
      if (!s.key || distanceMeters(s, loc) > SAME_SPOT_M) continue
      const key = `${it.id}@${localDay(s.start)}`
      if (!out[key]) out[key] = { start: s.start, end: s.end }
      else out[key].end = s.end
    }
  }
  return out
}

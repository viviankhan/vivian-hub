// src/lib/placeNames.js
// ─────────────────────────────────────────────────────────────
// A name for a spot you haven't named: "Near 3033 41st St NW". Looked up once
// per spot (about 10 m) from OpenStreetMap (geofence.js reverseGeocode),
// remembered on this device, and asked for at most once a second — the
// geocoder's fair-use limit. Until the answer comes back a spot has no name;
// PLACE_NAMES_EVENT fires when one arrives so screens can redraw.
// ─────────────────────────────────────────────────────────────
import { reverseGeocode } from './geofence.js'

export const PLACE_NAMES_EVENT = 'bloom-place-names'
const KEY = 'bloom_geo_names'
const spot = (lat, lng) => `${lat.toFixed(4)},${lng.toFixed(4)}`

let cache = null
const read = () => {
  if (cache) return cache
  try { cache = JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch { cache = {} }
  return cache
}
const queue = []
const pending = new Set()
let running = false

async function pump() {
  if (running) return
  running = true
  while (queue.length) {
    const { lat, lng, k } = queue.shift()
    let name = ''
    try { name = await reverseGeocode(lat, lng) } catch {}
    const c = read()
    c[k] = name || ''   // remember misses too, so a spot isn't asked about again
    try { localStorage.setItem(KEY, JSON.stringify(c)) } catch {}
    pending.delete(k)
    try { window.dispatchEvent(new Event(PLACE_NAMES_EVENT)) } catch {}
    await new Promise(r => setTimeout(r, 1100))
  }
  running = false
}

// The spot's name if known; otherwise '' (and it's looked up in the background).
export function spotName(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return ''
  const k = spot(lat, lng)
  const c = read()
  if (k in c) return c[k] ? `Near ${c[k].split(',')[0]}` : ''
  if (!pending.has(k)) { pending.add(k); queue.push({ lat, lng, k }); pump() }
  return ''
}

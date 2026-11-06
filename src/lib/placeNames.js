// src/lib/placeNames.js
// ─────────────────────────────────────────────────────────────
// A name for a spot you haven't named: "Heritage Manor Apartments", "Mayo
// Clinic parking", "Five Guys". Looked up once per spot (about 10 m) from
// OpenStreetMap (lib/placeLookup.js),
// remembered on this device, and asked for at most once a second — the
// geocoder's fair-use limit. Until the answer comes back a spot has no name;
// PLACE_NAMES_EVENT fires when one arrives so screens can redraw.
// ─────────────────────────────────────────────────────────────
import { lookupPlaceName } from './placeLookup.js'

export const PLACE_NAMES_EVENT = 'bloom-place-names'
const KEY = 'bloom_geo_names_v3'   // v3: a failed lookup is retried, not remembered as "no name"
// A spot OpenStreetMap had nothing for (or couldn't be reached about) is asked
// again after this long — a dropped connection mustn't leave it unnamed forever.
const RETRY_MS = 10 * 60 * 1000
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
    try { name = await lookupPlaceName(lat, lng) } catch {}
    const c = read()
    c[k] = name || { miss: Date.now() }
    try { localStorage.setItem(KEY, JSON.stringify(c)) } catch {}
    pending.delete(k)
    try { window.dispatchEvent(new Event(PLACE_NAMES_EVENT)) } catch {}
    await new Promise(r => setTimeout(r, 1200))
  }
  running = false
}

// A link that opens the spot in Maps, so a place with no name can still be
// looked up (Apple Maps on iPhone; it falls back to the web elsewhere).
export function mapsUrl(lat, lng, label = '') {
  const q = encodeURIComponent(label || `${lat.toFixed(5)},${lng.toFixed(5)}`)
  return `https://maps.apple.com/?ll=${lat.toFixed(6)},${lng.toFixed(6)}&q=${q}`
}

// The spot's name if known; otherwise '' (and it's looked up in the background).
export function spotName(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return ''
  const k = spot(lat, lng)
  const c = read()
  const v = c[k]
  if (typeof v === 'string' && v) return v
  const fresh = v && typeof v === 'object' && Date.now() - (v.miss || 0) < RETRY_MS
  if (!fresh && !pending.has(k)) { pending.add(k); queue.push({ lat, lng, k }); pump() }
  return ''
}

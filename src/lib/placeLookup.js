// src/lib/placeLookup.js
// ─────────────────────────────────────────────────────────────
// Ask OpenStreetMap what a spot is called (lib/placeLookupPure.js picks the
// name): Overpass first — the building, parking lot, apartment complex or
// campus the point is inside — then Nominatim's nearest object and address.
// Both are free and keyless; callers keep to about one lookup a second.
// ─────────────────────────────────────────────────────────────
import { nameFromOverpass, nameFromNominatim, overpassQuery } from './placeLookupPure.js'

async function withTimeout(url, opts, ms) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null
  const t = ctl ? setTimeout(() => ctl.abort(), ms) : null
  try { return await fetch(url, { ...opts, ...(ctl ? { signal: ctl.signal } : {}) }) }
  finally { if (t) clearTimeout(t) }
}

export async function lookupPlaceName(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return ''
  try {
    const res = await withTimeout('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(overpassQuery(lat, lng)),
    }, 12000)
    if (res.ok) {
      const name = nameFromOverpass((await res.json()).elements, { lat, lng })
      if (name) return name
    }
  } catch {}
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&extratags=1&zoom=18&lat=${lat}&lon=${lng}`
    const res = await withTimeout(url, { headers: { Accept: 'application/json' } }, 10000)
    if (res.ok) return nameFromNominatim(await res.json())
  } catch {}
  return ''
}

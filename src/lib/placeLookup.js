// src/lib/placeLookup.js
// ─────────────────────────────────────────────────────────────
// Ask OpenStreetMap what a spot is called (lib/placeLookupPure.js picks the
// name): Overpass first — the building, parking lot, apartment complex or
// campus the point is inside — then Nominatim's nearest object and address.
// Both are free and keyless; callers keep to about one lookup a second.
// ─────────────────────────────────────────────────────────────
import { nameFromOverpass, nameFromNominatim, overpassQuery, isStrongNominatim } from './placeLookupPure.js'

async function withTimeout(url, opts, ms) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null
  const t = ctl ? setTimeout(() => ctl.abort(), ms) : null
  try { return await fetch(url, { ...opts, ...(ctl ? { signal: ctl.signal } : {}) }) }
  finally { if (t) clearTimeout(t) }
}

// The last thing that went wrong, kept on the device so a "why is this spot
// unnamed?" has an answer (localStorage bloom_geo_debug).
function note(what) {
  try { localStorage.setItem('bloom_geo_debug', JSON.stringify({ at: new Date().toISOString(), ...what })) } catch {}
}

async function fromNominatim(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&extratags=1&zoom=18&lat=${lat}&lon=${lng}`
    const res = await withTimeout(url, { headers: { Accept: 'application/json' } }, 10000)
    if (!res.ok) { note({ lat, lng, nominatim: res.status }); return { name: '', strong: false } }
    const r = await res.json()
    return { name: nameFromNominatim(r), strong: isStrongNominatim(r) }
  } catch (e) { note({ lat, lng, nominatim: String(e?.name || e) }); return { name: '', strong: false } }
}
async function fromOverpass(lat, lng) {
  try {
    const res = await withTimeout('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(overpassQuery(lat, lng)),
    }, 12000)
    if (!res.ok) { note({ lat, lng, overpass: res.status }); return '' }
    return nameFromOverpass((await res.json()).elements, { lat, lng })
  } catch (e) { note({ lat, lng, overpass: String(e?.name || e) }); return '' }
}

// Nominatim first: one quick request, and it usually knows the place
// (Mayo Clinic College of Medicine and Science, Heritage Manor Apartments,
// Five Guys). Only when all it has is a street, a bare house number or a
// nameless lot does Overpass get asked what building / lot / campus the
// point is inside. Whichever names it best wins; a street is the floor.
export async function lookupPlaceName(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return ''
  const nom = await fromNominatim(lat, lng)
  if (nom.strong) return nom.name
  const over = await fromOverpass(lat, lng)
  return over || nom.name
}

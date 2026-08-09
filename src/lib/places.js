// src/lib/places.js
// ─────────────────────────────────────────────────────────────
// The places a task can be tagged with, in two flavours:
//
//   • Saved places  — a small set of named defaults the user curates in
//     Settings (Home, Gym, Office…), just like the default reminder alerts.
//     They show as one-tap chips in the add sheet so a common spot never has
//     to be searched for again.
//   • Recent places — automatically remembered each time a task is saved with
//     a location, so somewhere you tagged once is easy to reuse even if you
//     never bothered to save it.
//
// Both live in localStorage (instant, no DB column) and are mirrored across
// devices through the same synced prefs blob as the look/duration settings
// (see prefs.js PREF_KEYS). A place is { id, name, lat, lng, radius? } — an
// absent radius means the default "vicinity" arrival behaviour.
// ─────────────────────────────────────────────────────────────

const SAVED_KEY  = 'bloom_saved_places'
const RECENT_KEY = 'bloom_recent_places'
const RECENT_MAX = 6

function readList(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null')
    return Array.isArray(raw) ? raw.filter(isValidPlace) : []
  } catch { return [] }
}
function writeList(key, list, evt) {
  try { localStorage.setItem(key, JSON.stringify(list)) } catch {}
  try { window.dispatchEvent(new Event(evt)) } catch {}
  return list
}

function isValidPlace(p) {
  return !!p && typeof p.lat === 'number' && typeof p.lng === 'number'
    && Number.isFinite(p.lat) && Number.isFinite(p.lng)
}

// Two places are "the same spot" when their pins land within ~40 m of each
// other — close enough that they're the same door, so a re-tag updates rather
// than piling up near-duplicate recents.
function sameSpot(a, b) {
  if (!a || !b) return false
  return Math.abs(a.lat - b.lat) < 0.0004 && Math.abs(a.lng - b.lng) < 0.0004
}

function normalize(place) {
  if (!isValidPlace(place)) return null
  const out = {
    id: place.id || ('p-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)),
    name: (place.name || '').trim(),
    lat: place.lat,
    lng: place.lng,
  }
  // Keep an explicit radius only when one was chosen; absent = vicinity.
  if (place.radius) out.radius = place.radius
  return out
}

// ── Saved places (user-curated defaults) ───────────────────────
export function getSavedPlaces() { return readList(SAVED_KEY) }
export function onSavedPlaces(fn) {
  const h = () => fn(getSavedPlaces())
  window.addEventListener('bloom-saved-places', h)
  return () => window.removeEventListener('bloom-saved-places', h)
}
export function addSavedPlace(place) {
  const p = normalize(place)
  if (!p) return getSavedPlaces()
  // Replace an existing save for the same spot (keeps its id) instead of adding
  // a duplicate; otherwise append.
  const list = getSavedPlaces()
  const idx = list.findIndex(x => x.id === p.id || sameSpot(x, p))
  if (idx >= 0) list[idx] = { ...p, id: list[idx].id }
  else list.push(p)
  return writeList(SAVED_KEY, list, 'bloom-saved-places')
}
export function removeSavedPlace(id) {
  return writeList(SAVED_KEY, getSavedPlaces().filter(p => p.id !== id), 'bloom-saved-places')
}

// ── Recent places (auto-remembered on task save) ───────────────
export function getRecentPlaces() { return readList(RECENT_KEY) }
// Fold a just-used place into the recent list: most-recent first, de-duplicated
// against both saved places and other recents by proximity, capped in length.
export function rememberPlace(place, saved = getSavedPlaces()) {
  const p = normalize(place)
  if (!p) return getRecentPlaces()
  // Don't clutter recents with somewhere already saved as a default.
  if (saved.some(s => sameSpot(s, p))) return getRecentPlaces()
  const rest = getRecentPlaces().filter(x => !sameSpot(x, p))
  return writeList(RECENT_KEY, [p, ...rest].slice(0, RECENT_MAX), 'bloom-recent-places')
}

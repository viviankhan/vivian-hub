// src/lib/geofence.js
// ─────────────────────────────────────────────────────────────
// Location-associated tasks. A task can carry a place (lat/lng + a radius);
// when the device is within that radius, the task's progress auto-starts —
// regardless of the time it was scheduled for. This is the browser-only piece:
// it watches the device position and calls back the moment you arrive at a
// task's location.
//
// It only runs while Bloom is open (a web app can't watch your location in the
// background), but that's enough to "start the task when I get there" the next
// time you glance at the app after arriving, and to start it live if the app
// is already open when you walk in.
// ─────────────────────────────────────────────────────────────

export function geolocationSupported() {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator
}

// ── Live tracking status ───────────────────────────────────────
// A tiny observable so the UI (Settings → Reminders) can show whether arrival
// tracking is actually running, and surface a permission/GPS error instead of
// failing silently. `state` is one of: 'idle' | 'watching' | 'live' | 'error'.
let lastGeoStatus = { state: 'idle' }
const geoStatusListeners = new Set()
export function getGeoStatus() { return lastGeoStatus }
export function onGeoStatus(fn) {
  geoStatusListeners.add(fn)
  return () => geoStatusListeners.delete(fn)
}
function emitGeoStatus(next) {
  lastGeoStatus = { ...next, at: Date.now() }
  for (const fn of geoStatusListeners) { try { fn(lastGeoStatus) } catch {} }
}

// Current geolocation permission, where the Permissions API exposes it
// ('granted' | 'denied' | 'prompt'), else 'unknown'. Lets Settings tell the
// user whether location is blocked without having to trigger a prompt.
export async function geolocationPermission() {
  try {
    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      const s = await navigator.permissions.query({ name: 'geolocation' })
      return s.state
    }
  } catch {}
  return 'unknown'
}

// Grab the current position once (used by the add sheet's "Use my location").
export function getCurrentLocation(options = {}) {
  return new Promise((resolve, reject) => {
    if (!geolocationSupported()) { reject(new Error('Location not supported on this device.')); return }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      err => reject(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000, ...options },
    )
  })
}

// Search for a place by name/address and return candidate matches with
// coordinates, so a task can be given a location without physically going
// there. Uses OpenStreetMap's free Nominatim geocoder (no API key). Returns
// [{ name, lat, lng }]; empty on no match or network error.
export async function searchPlaces(query) {
  const q = (query || '').trim()
  if (q.length < 3) return []
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&q=' + encodeURIComponent(q)
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } })
    if (!res.ok) return []
    const data = await res.json()
    return (Array.isArray(data) ? data : []).map(r => ({
      name: shortPlaceName(r),
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
    })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
  } catch { return [] }
}

// A concise label for a geocoder result: the place's own name if it has one,
// else the first line or two of its display name.
function shortPlaceName(r) {
  const a = r.address || {}
  const primary = r.name || a.amenity || a.shop || a.building || a.road || (r.display_name || '').split(',')[0]
  const locality = a.city || a.town || a.village || a.suburb || a.county || ''
  const parts = [primary, locality].filter(Boolean)
  const label = [...new Set(parts)].join(', ')
  return label || (r.display_name || '').split(',').slice(0, 2).join(',').trim()
}

// Reverse-geocode a coordinate into a short human name, so tagging "my current
// location" can suggest a name ("Gym, Brooklyn") instead of leaving it blank.
// Best-effort: returns '' on no match or network/permission trouble.
export async function reverseGeocode(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return ''
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}`
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } })
    if (!res.ok) return ''
    const data = await res.json()
    return data ? shortPlaceName(data) : ''
  } catch { return '' }
}

// Great-circle distance between two lat/lng points, in meters (haversine).
export function distanceMeters(a, b) {
  if (!a || !b) return Infinity
  const R = 6371000
  const toRad = d => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

// The default arrival radius, in meters, used when a task's location doesn't
// pin an explicit one. This is the "vicinity" behaviour — like a maps app
// switching to "Arriving" as you get close — so most tasks never need to think
// about a radius at all. An explicit radius is opt-in (see RADIUS_OPTIONS).
export const DEFAULT_RADIUS_M = 150

// The optional, explicit radii a user can pick in the arrival-radius menu, in
// meters. Choosing none keeps the "vicinity" default above.
export const RADIUS_OPTIONS = [50, 100, 150, 250, 400, 600, 1000]

// A short label for an arrival radius. A falsy radius is the default vicinity
// ("Arriving"); an explicit one reads as "250 m" or "1 km".
export function radiusLabel(radius) {
  if (!radius) return 'Vicinity'
  return radius >= 1000 ? `${(radius / 1000).toString().replace(/\.0$/, '')} km` : `${radius} m`
}

// Watch the device position and fire `onArrive(task)` once per task the moment
// the device is within that task's radius. `getTasks()` returns the current
// list of { id, location:{lat,lng,radius} } to watch — it's called on each
// position update so the set can change as tasks are added/completed.
//
// `options.onError(err)` receives geolocation failures (permission denied, no
// fix) that were previously swallowed — so the UI can tell the user why arrival
// auto-start isn't working. Remaining options pass through to watchPosition.
// Returns a stop() function.
export function watchArrivals(getTasks, onArrive, options = {}) {
  const { onError, ...geoOpts } = options
  if (!geolocationSupported()) {
    const err = new Error('Location not supported on this device.')
    emitGeoStatus({ state: 'error', message: err.message })
    try { onError?.(err) } catch {}
    return () => {}
  }
  const arrived = new Set()   // task ids we've already fired for this session
  let watchId = null

  emitGeoStatus({ state: 'watching' })

  const handle = (pos) => {
    // First (and every) successful fix: tracking is genuinely live.
    emitGeoStatus({ state: 'live', accuracy: pos.coords.accuracy })
    const here = { lat: pos.coords.latitude, lng: pos.coords.longitude }
    // A generous slack so a jittery GPS fix near the edge still counts.
    const slack = Math.min(pos.coords.accuracy || 0, 100)
    const tasks = getTasks() || []
    for (const t of tasks) {
      if (!t || !t.location || arrived.has(t.id)) continue
      const { lat, lng } = t.location
      if (typeof lat !== 'number' || typeof lng !== 'number') continue
      const radius = t.location.radius || DEFAULT_RADIUS_M
      if (distanceMeters(here, { lat, lng }) <= radius + slack) {
        arrived.add(t.id)
        try { onArrive(t) } catch {}
      }
    }
  }

  const fail = (err) => {
    // code 1 = permission denied, 2 = position unavailable, 3 = timeout.
    const message = err?.code === 1
      ? 'Location permission is off — allow it so tasks can start when you arrive.'
      : err?.code === 3
        ? "Couldn't get a location fix (timed out). Retrying."
        : "Couldn't read your location right now. Retrying."
    emitGeoStatus({ state: 'error', code: err?.code, message })
    try { onError?.(err) } catch {}
  }

  watchId = navigator.geolocation.watchPosition(handle, fail, {
    enableHighAccuracy: true, timeout: 20000, maximumAge: 30000, ...geoOpts,
  })

  return () => {
    if (watchId != null) navigator.geolocation.clearWatch(watchId)
    watchId = null
    emitGeoStatus({ state: 'idle' })
  }
}

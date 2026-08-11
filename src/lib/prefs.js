// src/lib/prefs.js
// ─────────────────────────────────────────────────────────────
// Cross-device sync for the app's look & view preferences.
//
// These settings (theme, season, background, font, layout, saved colors,
// duration presets, the Calendar/Week repeating filter…) are stored in
// localStorage so they apply instantly before first paint. This bridge mirrors
// them to one synced kv_store blob so a change on your laptop shows up on your
// phone and vice-versa. localStorage stays the fast local cache; the cloud blob
// is the shared source of truth, applied on load.
// ─────────────────────────────────────────────────────────────
import { getUiPrefs, setUiPrefs, dbGet, dbSet } from './storage.js'

// Every localStorage key that should follow the user across devices.
// Note: the uploaded background images ('bloom_bg_custom' and its mobile
// counterpart 'bloom_bg_custom_mobile'), stored as large data URIs, are
// deliberately NOT here — putting one in this shared blob bloated it enough
// that the whole ui_prefs write could fail, silently breaking syncing of
// *everything* else. They DO sync now, just via their own dedicated kv_store
// rows (see pushBackgroundImage / reconcileBackgroundImages below), so a big
// photo can follow the user without endangering the rest of the prefs.
const PREF_KEYS = [
  'bloom_theme', 'bloom_season', 'bloom_custom_color',
  'bloom_background', 'bloom_background_mobile',
  'bloom_font', 'bloom_layout', 'bloom_summary', 'bloom_sound', 'bloom_effects',
  'bloom_saved_colors', 'vivian_duration_presets', 'bloom_recurring_view_filter',
  'bloom_saved_places', 'bloom_recent_places',
  'bloom_default_alerts',   // reminder default-alert set — see notifications.js
]

let hydrating = false
let pushTimer = null

export function snapshotLocalPrefs() {
  const out = {}
  for (const k of PREF_KEYS) {
    try { const v = localStorage.getItem(k); if (v != null) out[k] = v } catch {}
  }
  return out
}

function applyPrefsToLocal(obj) {
  if (!obj || typeof obj !== 'object') return false
  let changed = false
  for (const k of PREF_KEYS) {
    if (!(k in obj)) continue
    const v = obj[k]
    if (typeof v !== 'string') continue
    try {
      if (localStorage.getItem(k) !== v) { localStorage.setItem(k, v); changed = true }
    } catch {}
  }
  return changed
}

// Load the synced prefs and write them into localStorage. Returns true if any
// local value actually changed (so the caller can re-apply + refresh state).
export async function hydratePrefs() {
  try {
    const cloud = await getUiPrefs()
    if (!cloud) return false
    hydrating = true
    const changed = applyPrefsToLocal(cloud)
    hydrating = false
    return changed
  } catch { hydrating = false; return false }
}

// Push the current local prefs up to the cloud (debounced; ignored while a
// hydrate is applying, so loading doesn't echo straight back).
export function pushPrefs() {
  if (hydrating) return
  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    // Surface failures (e.g. a too-large blob) instead of hiding them — a
    // silently-failing push is exactly how cross-device sync "just stops".
    Promise.resolve(setUiPrefs(snapshotLocalPrefs()))
      .catch(e => console.warn('[prefs] sync push failed:', e && (e.message || e)))
  }, 700)
}

// ── Uploaded background images ─────────────────────────────────
// The uploaded background photos are large data URIs. They are kept OUT of the
// shared ui_prefs blob (a big value there could fail the whole write and, as it
// once did, silently break syncing of everything else). Instead each rides its
// OWN kv_store row — so a background you love follows you to every device
// without endangering the rest of the prefs. Keyed by the same localStorage
// name so there's one obvious row per target (desktop + mobile portrait).
const BG_IMAGE_KEYS = ['bloom_bg_custom', 'bloom_bg_custom_mobile']

// Push one background image (by its localStorage key) up to its own row.
// An empty string is written when the image was removed — a real "cleared"
// signal the other devices can honor (distinct from a never-synced null row).
export function pushBackgroundImage(key) {
  if (!BG_IMAGE_KEYS.includes(key)) return
  let v = ''
  try { v = localStorage.getItem(key) || '' } catch {}
  Promise.resolve(dbSet(key, v))
    .catch(e => console.warn('[prefs] background image sync failed:', e && (e.message || e)))
}

// Reconcile the synced background images into localStorage. The cloud is the
// source of truth: a saved image (or an explicit clear) wins over whatever this
// device happens to have, so a beloved background auto-populates on a fresh
// device and is never clobbered by an emptier one. When the cloud has never had
// a value (null row) but this device does, seed the cloud from it — that
// carries an image uploaded before syncing existed up to the others.
// Returns true if a local value actually changed, so the caller can re-apply.
export async function reconcileBackgroundImages() {
  let changed = false
  for (const k of BG_IMAGE_KEYS) {
    try {
      const cloud = await dbGet(k)            // string = image, '' = cleared, null = never set
      let local = ''
      try { local = localStorage.getItem(k) || '' } catch {}
      if (typeof cloud === 'string') {
        if (local !== cloud) {
          try { cloud ? localStorage.setItem(k, cloud) : localStorage.removeItem(k) } catch {}
          changed = true
        }
      } else if (local) {
        Promise.resolve(dbSet(k, local)).catch(() => {})
      }
    } catch {}
  }
  return changed
}

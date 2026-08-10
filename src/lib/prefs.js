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
import { getUiPrefs, setUiPrefs } from './storage.js'

// Every localStorage key that should follow the user across devices.
// Note: the uploaded background images ('bloom_bg_custom' and its mobile
// counterpart 'bloom_bg_custom_mobile'), stored as large data URIs, are
// deliberately NOT here — they stay device-local, as the Look settings say.
// Putting one in the synced blob bloated it enough that the whole ui_prefs
// write could fail, which silently broke syncing of *everything* else
// (background choice, default alerts…). The preset background ids still sync.
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

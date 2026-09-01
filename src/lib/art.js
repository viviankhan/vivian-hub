// src/lib/art.js
// ─────────────────────────────────────────────────────────────
// Custom-art override layer. Every illustrated element in the game is drawn from
// code by default, but the owner can upload their own image for any asset id
// (e.g. "creature:sprigling", "furniture:bed-cloud"). Uploaded images live in a
// synced kv_store blob (art_overrides) and are surfaced here through a tiny
// external store so the art components re-render the moment one changes.
//
// The upload UI is gated to an "admin" (the owner) — see isAdmin() — so this can
// stay owner-only now and open up to a broader, curated art set later without
// changing the rendering path.
// ─────────────────────────────────────────────────────────────
import { useSyncExternalStore } from 'react'

let overrides = {}
const listeners = new Set()
const emit = () => listeners.forEach(l => l())

// Seed the store from the persisted blob (called once on load, and after a save).
export function loadOverrides(map) {
  overrides = (map && typeof map === 'object') ? map : {}
  emit()
}
export function getOverrides() { return overrides }
export function setOverride(id, dataUrl) { overrides = { ...overrides, [id]: dataUrl }; emit(); return overrides }
export function clearOverride(id) { const n = { ...overrides }; delete n[id]; overrides = n; emit(); return overrides }

function subscribe(cb) { listeners.add(cb); return () => listeners.delete(cb) }
// Returns the override data-URL for an asset id, or undefined. Re-renders the
// caller when that id's override changes.
export function useOverride(id) {
  return useSyncExternalStore(subscribe, () => (id ? overrides[id] : undefined), () => undefined)
}

// Owner-only gate. `?admin=1` in the URL turns it on for this device (persisted);
// `?admin=0` turns it off. Everything else just reads the stored flag. Client-
// side only — fine for a single-owner app; real multi-user access would tie this
// to authentication.
export function isAdmin() {
  try {
    const q = new URLSearchParams(location.search).get('admin')
    if (q === '1') localStorage.setItem('bloom_admin', '1')
    else if (q === '0') localStorage.removeItem('bloom_admin')
    return localStorage.getItem('bloom_admin') === '1'
  } catch { return false }
}

// Read an image File and downscale it to a compact PNG data URL (keeps
// transparency for sprites). Bounded so the synced blob stays small.
export function fileToDataUrl(file, max = 512) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = () => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale))
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h
        cv.getContext('2d').drawImage(img, 0, 0, w, h)
        try { resolve(cv.toDataURL('image/png')) } catch (e) { reject(e) }
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

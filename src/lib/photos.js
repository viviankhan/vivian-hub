// src/lib/photos.js
// ─────────────────────────────────────────────────────────────
// Photos attached to the wellness trackers — a mood moment ("here's what I was
// looking at when it hit me") and a condition episode ("this is the rash / the
// swelling / the migraine aura"). Two things matter here and they pull in
// opposite directions:
//
//   • The picture has to be there instantly, offline, on every device.
//   • wellness_checkins and wellness_episodes are single synced blobs that are
//     rewritten IN FULL on every log. An image inlined into one of those would
//     be re-uploaded on every later check-in, forever — the blob only ever gets
//     heavier, and the offline outbox carries a copy of it per queued edit.
//
// So an image never touches those blobs. Each one is written to its own
// kv_store row (`wellness_photo_<id>`, see storage.js) and the check-in or
// episode stores only the short id. Adding a photo writes one new row and
// rewrites nothing; the trackers' own blobs stay the size they are today.
//
// Reads are lazy and memoized: a photo is fetched the first time something
// actually renders it, batched with every other kv read on that turn, and then
// held in a module-level cache for the rest of the session.
// ─────────────────────────────────────────────────────────────
import { getWellnessPhoto, setWellnessPhoto } from './storage.js'

// How many images one moment or one episode may carry. A deliberate ceiling:
// it bounds what a single tracker entry can ever cost to sync.
export const MAX_PHOTOS = 4
// Downscale target. ~1000px of long edge at q0.62 lands around 60–150KB, which
// is comfortably a small row and still sharp enough to read a rash or a receipt.
export const PHOTO_MAX_DIM = 1000
export const PHOTO_QUALITY = 0.62

// id → data URL (or null once we know the row is gone). `undefined` means
// "not looked at yet".
const cache = new Map()
// id → in-flight read, so ten thumbnails of the same photo make one request.
const inflight = new Map()

function newPhotoId() {
  return 'wp-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

// Normalize whatever a row holds into a data URL. Rows are written as
// { v:1, data, ts }; a bare string is accepted too so nothing breaks if the
// shape is ever simplified.
function rowToDataUrl(row) {
  if (!row) return null
  if (typeof row === 'string') return row
  return typeof row.data === 'string' ? row.data : null
}

// ── Reading an image file ──────────────────────────────────────
// Draw the picked file into a canvas at a bounded size and re-encode it as a
// JPEG data URL. Anything the browser can decode (HEIC on iOS included, which
// Safari decodes natively) comes out as a small, portable JPEG.
export function compressPhoto(file, { maxDim = PHOTO_MAX_DIM, quality = PHOTO_QUALITY } = {}) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file'))
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that image.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Could not read that image.'))
      img.onload = () => {
        try {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
          const w = Math.max(1, Math.round(img.width * scale))
          const h = Math.max(1, Math.round(img.height * scale))
          const cv = document.createElement('canvas')
          cv.width = w; cv.height = h
          const ctx = cv.getContext('2d')
          // A white ground, so a transparent PNG doesn't come out of the JPEG
          // encoder as a black rectangle.
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)
          ctx.drawImage(img, 0, 0, w, h)
          resolve(cv.toDataURL('image/jpeg', quality))
        } catch (e) { reject(e) }
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

// ── Writing ────────────────────────────────────────────────────
// Mint an id, prime the cache so the image is on screen immediately, and send
// the row. Returns the id synchronously: the caller stores it on the check-in
// or episode and closes the sheet without waiting on the network. dbSet writes
// the offline mirror first and queues the upload durably, so this is safe with
// no connection — the photo is already readable on this device.
export function savePhoto(dataUrl) {
  const id = newPhotoId()
  cache.set(id, dataUrl)
  Promise.resolve(setWellnessPhoto(id, { v: 1, data: dataUrl, ts: new Date().toISOString() }))
    .catch(e => console.error('[photos] could not save photo:', (e && e.message) || e))
  return id
}
export function savePhotos(dataUrls) {
  return (dataUrls || []).filter(Boolean).map(savePhoto)
}

// Drop a photo. The row is set to null rather than deleted, which reads back
// exactly like a key that was never written — the same shape every other absent
// kv key has, and nothing else in the table is touched.
export function deletePhoto(id) {
  if (!id) return
  cache.set(id, null)
  inflight.delete(id)
  Promise.resolve(setWellnessPhoto(id, null))
    .catch(e => console.error('[photos] could not remove photo:', (e && e.message) || e))
}
export function deletePhotos(ids) { (ids || []).forEach(deletePhoto) }

// ── Reading ────────────────────────────────────────────────────
// What we already hold for this id: a data URL, null when the row is known to
// be gone, or undefined when it hasn't been fetched yet.
export function peekPhoto(id) { return cache.get(id) }

export function loadPhoto(id) {
  if (!id) return Promise.resolve(null)
  if (cache.has(id)) return Promise.resolve(cache.get(id))
  if (inflight.has(id)) return inflight.get(id)
  const p = Promise.resolve(getWellnessPhoto(id))
    .then(row => { const url = rowToDataUrl(row); cache.set(id, url); return url })
    .catch(e => { console.error('[photos] could not load photo:', (e && e.message) || e); return null })
    .finally(() => inflight.delete(id))
  inflight.set(id, p)
  return p
}

// Every id at once. The reads collapse into a single kv_store query because
// dbGet batches whatever is asked for on the same microtask turn.
export function loadPhotos(ids) {
  const list = [...new Set((ids || []).filter(Boolean))]
  return Promise.all(list.map(loadPhoto)).then(urls => {
    const out = new Map()
    list.forEach((id, i) => out.set(id, urls[i]))
    return out
  })
}

// Test seam / warm start: put a known data URL in the cache without a read.
export function primePhoto(id, dataUrl) { if (id) cache.set(id, dataUrl ?? null) }
export function clearPhotoCache() { cache.clear(); inflight.clear() }

// ── Small helpers the trackers share ───────────────────────────
// The photo ids on a check-in or an episode, defensively — an entry logged
// before photos existed simply has none.
export function photoIds(entry) {
  const p = entry && entry.photos
  return Array.isArray(p) ? p.filter(id => typeof id === 'string' && id) : []
}
export function hasPhotos(entry) { return photoIds(entry).length > 0 }

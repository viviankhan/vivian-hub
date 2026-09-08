// src/components/PhotoAttach.jsx
// ─────────────────────────────────────────────────────────────
// The photo pieces the two wellness trackers share.
//
//   • <PhotoPicker>   — the compose-time strip: pick images, see thumbnails,
//     drop one before you commit. It works purely in data URLs held in the
//     sheet's own state, so a sheet you abandon writes nothing at all.
//   • <PhotoAttacher> — the same strip for an entry that already exists (a
//     condition already running), where a pick is stored the moment it's made.
//   • <PhotoStrip>    — the read-back strip on a logged moment or episode. It
//     takes photo *ids* and fetches them lazily (see lib/photos.js), so opening
//     the rail never pulls images the user didn't ask to look at.
//   • <PhotoLightbox> — tap a thumbnail to see it full size.
// ─────────────────────────────────────────────────────────────
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Glyph } from '../lib/glyphs.jsx'
import { compressPhoto, loadPhoto, peekPhoto, savePhoto, deletePhoto, MAX_PHOTOS } from '../lib/photos.js'

// ── Full-size viewer ───────────────────────────────────────────
// Rendered through a portal on purpose: both places a thumbnail can be tapped
// sit inside a transformed ancestor (.rail-sheet is translated, .wl-modal is
// animated), and a transform makes `position: fixed` resolve against that
// element instead of the viewport — the lightbox would be trapped inside the
// sheet. On document.body it covers the screen from either one.
export function PhotoLightbox({ src, onClose }) {
  useEffect(() => {
    if (!src) return
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [src, onClose])
  if (!src) return null
  return createPortal((
    <div className="photo-lightbox" onClick={onClose} role="dialog" aria-label="Photo">
      <img src={src} alt="" onClick={e => e.stopPropagation()} />
      <button className="photo-lightbox-x" onClick={onClose} aria-label="Close photo">✕</button>
    </div>
  ), document.body)
}

// ── Shared intake ──────────────────────────────────────────────
// Both strips take files the same way: honour the per-entry ceiling, convert
// what fits, and say so when some were turned away. `convert` is what differs —
// the picker keeps a data URL, the attacher stores it and keeps the id.
async function takeFiles(files, { room, convert, setErr, setBusy, max }) {
  setErr(''); setBusy(true)
  const out = []
  for (const f of files.slice(0, Math.max(0, room))) {
    try { out.push(await convert(f)) }
    catch { setErr('Could not read that image.') }
  }
  setBusy(false)
  if (files.length > room) setErr(`Up to ${max} photos per entry.`)
  return out
}

// The dashed "＋ Add a photo" tile and the hidden file input behind it.
function AddPhotoTile({ onFiles, busy, label }) {
  const fileRef = useRef(null)
  return (
    <>
      <button className="photo-add" onClick={() => fileRef.current && fileRef.current.click()} disabled={busy}>
        <Glyph id="camera" size={18} />
        <span>{busy ? 'Reading…' : label}</span>
      </button>
      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={e => { const files = [...(e.target.files || [])]; e.target.value = ''; if (files.length) onFiles(files) }} />
    </>
  )
}

// ── Compose-time picker ────────────────────────────────────────
// `photos` is an array of data URLs; `onChange` gets the next array. Nothing is
// persisted here — the parent turns these into rows only when the moment is
// actually logged.
export function PhotoPicker({ photos = [], onChange, max = MAX_PHOTOS, label = 'Add a photo' }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [zoom, setZoom] = useState(null)

  const onFiles = async (files) => {
    const added = await takeFiles(files, { room: max - photos.length, max, setErr, setBusy, convert: compressPhoto })
    if (added.length) onChange([...photos, ...added])
  }

  return (
    <div className="photo-picker" onClick={e => e.stopPropagation()}>
      <div className="photo-row">
        {photos.map((src, i) => (
          <span key={i} className="photo-thumb">
            <img src={src} alt="" onClick={() => setZoom(src)} />
            <button className="photo-thumb-x" title="Remove this photo" aria-label="Remove this photo"
              onClick={() => onChange(photos.filter((_, j) => j !== i))}>✕</button>
          </span>
        ))}
        {photos.length < max && <AddPhotoTile onFiles={onFiles} busy={busy} label={label} />}
      </div>
      {err && <div className="photo-err">{err}</div>}
      <PhotoLightbox src={zoom} onClose={() => setZoom(null)} />
    </div>
  )
}

// ── Attacher: add photos to something already logged ───────────
// Unlike <PhotoPicker>, this one writes as it goes — the entry it belongs to
// already exists, so a picked image is stored immediately and `onChange` gets
// the entry's next id list for the caller to persist. It owns both ends, so
// removing a thumbnail here also clears that photo's row. Used on a condition
// that's already running, where there is no "commit" step to wait for.
export function PhotoAttacher({ ids = [], onChange, max = MAX_PHOTOS, label = 'Add a photo' }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [zoom, setZoom] = useState(null)

  const onFiles = async (files) => {
    const added = await takeFiles(files, {
      room: max - ids.length, max, setErr, setBusy,
      convert: async f => savePhoto(await compressPhoto(f)),
    })
    if (added.length) onChange([...ids, ...added])
  }

  return (
    <div className="photo-picker" onClick={e => e.stopPropagation()}>
      <div className="photo-row">
        {ids.map(id => (
          <LazyThumb key={id} id={id} onOpen={setZoom}
            onRemove={pid => { onChange(ids.filter(x => x !== pid)); deletePhoto(pid) }} />
        ))}
        {ids.length < max && <AddPhotoTile onFiles={onFiles} busy={busy} label={label} />}
      </div>
      {err && <div className="photo-err">{err}</div>}
      <PhotoLightbox src={zoom} onClose={() => setZoom(null)} />
    </div>
  )
}

// ── One lazily-loaded thumbnail ────────────────────────────────
function LazyThumb({ id, onOpen, onRemove }) {
  // Anything already in the session cache renders on the first paint, with no
  // flash of the placeholder.
  const [src, setSrc] = useState(() => peekPhoto(id) ?? null)
  const [tried, setTried] = useState(() => peekPhoto(id) !== undefined)
  useEffect(() => {
    let alive = true
    if (peekPhoto(id) !== undefined) { setSrc(peekPhoto(id)); setTried(true); return }
    loadPhoto(id).then(url => { if (alive) { setSrc(url); setTried(true) } })
    return () => { alive = false }
  }, [id])

  if (src) {
    return (
      <span className="photo-thumb">
        <img src={src} alt="" onClick={() => onOpen(src)} />
        {onRemove && (
          <button className="photo-thumb-x" title="Remove this photo" aria-label="Remove this photo"
            onClick={e => { e.stopPropagation(); onRemove(id) }}>✕</button>
        )}
      </span>
    )
  }
  // Still loading, or the row is genuinely gone (cleared cache on another
  // device, or removed). Either way it stays a quiet placeholder rather than a
  // broken image.
  return (
    <span className={`photo-thumb photo-thumb-empty ${tried ? 'gone' : ''}`} title={tried ? 'This photo is no longer stored.' : 'Loading…'}>
      <Glyph id="camera" size={16} color="var(--muted)" />
    </span>
  )
}

// ── Read-back strip ────────────────────────────────────────────
// `ids` are photo ids off a check-in or an episode. `onRemove` is optional —
// pass it where the user is allowed to take a photo back off an entry.
export function PhotoStrip({ ids = [], onRemove, className = '' }) {
  const [zoom, setZoom] = useState(null)
  if (!ids.length) return null
  return (
    <div className={`photo-row ${className}`} onClick={e => e.stopPropagation()}>
      {ids.map(id => <LazyThumb key={id} id={id} onOpen={setZoom} onRemove={onRemove} />)}
      <PhotoLightbox src={zoom} onClose={() => setZoom(null)} />
    </div>
  )
}

export default PhotoStrip

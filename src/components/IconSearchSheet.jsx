// src/components/IconSearchSheet.jsx
// A searchable icon picker — the same grouped, searchable Material-icon grid the
// task picker uses (see ColorIconPicker), minus the color row. Used to choose a
// status-condition icon so the roster is the whole set, looked up by name,
// instead of a fixed handful. Returns "glyph:<id>" or an uploaded image URI.
import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { isImageIcon, fileToIconDataUri, Icon } from './IconPicker.jsx'
import { iconColorOn } from '../lib/glyphs.jsx'
import { ICON_GROUPS, ICON_ALL } from '../lib/iconset.js'

const GLYPH_DARK = '#33373F'

export default function IconSearchSheet({ icon, tint = '#2A9D8F', onPick, onClose }) {
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')
  const fileRef = useRef(null)
  const selColor = tint || '#2A9D8F'

  const term = q.trim().toLowerCase()
  const words = term ? term.split(/\s+/) : []
  const matches = (hay) => words.every(w => hay.includes(w))
  const results = term
    ? ICON_ALL.filter(it => matches(`${it.id.toLowerCase()} ${it.k} ${it.group.toLowerCase()}`)).map(it => it.id)
    : null

  const onFile = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!f.type.startsWith('image/')) { setErr('Please pick an image file.'); return }
    if (f.size > 2 * 1024 * 1024) { setErr('Image too large (max 2 MB).'); return }
    try { const uri = await fileToIconDataUri(f); onPick(uri); onClose() }
    catch { setErr('Could not read that image.') }
  }

  const IconBtn = ({ id }) => {
    const on = icon === 'glyph:' + id
    return (
      <button onClick={() => { onPick('glyph:' + id); onClose() }} title={id}
        style={{ width: 52, height: 52, borderRadius: '50%', border: 'none', cursor: 'pointer', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: on ? selColor : '#F0EEF3', transition: 'background .15s' }}>
        <Icon value={'glyph:' + id} size={26} color={on ? iconColorOn(selColor) : GLYPH_DARK} />
      </button>
    )
  }

  // Portalled to <body> so a transformed ancestor (e.g. the rail sheet, which is
  // translateX-centred) can't capture this position:fixed overlay and clip it.
  return createPortal((
    <div onClick={e => { e.stopPropagation(); onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(20,28,38,.5)', zIndex: 800, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: 'white', borderRadius: '22px 22px 0 0', width: '100%', maxWidth: 480, height: '86vh', display: 'flex', flexDirection: 'column', boxShadow: '0 -10px 44px rgba(20,40,60,.28)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 12px', flexShrink: 0 }}>
          <span className="serif" style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>Choose an icon</span>
          <button onClick={onClose} aria-label="Done"
            style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: '#F0EEF3', color: 'var(--text)', fontSize: 16, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: '0 18px 12px', flexShrink: 0 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search icons" autoFocus
            autoCapitalize="none" autoCorrect="off" spellCheck={false}
            style={{ width: '100%', fontSize: 14, padding: '10px 14px', borderRadius: 20, border: 'none', background: '#F0EEF3', fontFamily: 'DM Sans,sans-serif', outline: 'none', boxSizing: 'border-box', color: 'var(--text)' }} />
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '2px 18px calc(16px + env(safe-area-inset-bottom))' }}>
          {term ? (
            results.length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, paddingTop: 6 }}>
                {results.map(id => <IconBtn key={id} id={id} />)}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--muted)', padding: '20px 0', textAlign: 'center' }}>No icons match “{q}”.</div>
            )
          ) : (
            ICON_GROUPS.map(([group, items]) => (
              <div key={group} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', margin: '10px 0 8px' }}>{group}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {items.map(([id]) => <IconBtn key={id} id={id} />)}
                </div>
              </div>
            ))
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 8, paddingTop: 12, borderTop: '1px solid #F1EDF2' }}>
            <button onClick={() => fileRef.current?.click()}
              style={{ flex: 1, fontSize: 12, padding: '10px', borderRadius: 10, border: '1px solid var(--border)', background: 'white', color: 'var(--text)', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>
              ⬆ Upload image
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          </div>
          {isImageIcon(icon) && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>Custom image in use.</div>}
          {err && <div style={{ fontSize: 11, color: '#EF4444', marginTop: 8 }}>{err}</div>}
        </div>
      </div>
    </div>
  ), document.body)
}

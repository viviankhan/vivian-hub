// src/components/ColorIconPicker.jsx
// A Structured-style "Color & Icon" bottom sheet. Pick a per-task color from a
// swatch row (or the native wheel), then pick a monochrome line icon from a
// searchable, grouped grid — or upload your own image. The chosen icon is
// stored on the task ("glyph:<id>") and renders white on the timeline pill,
// on the detail header, and on the Commitments card.
import { useState, useRef } from 'react'
import { isImageIcon, fileToIconDataUri, Icon } from './IconPicker.jsx'
import { iconColorOn } from '../lib/glyphs.jsx'
import { ICON_GROUPS, ICON_ALL } from '../lib/iconset.js'
import ColorSwatchRow, { TASK_COLORS } from './ColorSwatchRow.jsx'

// Re-exported for back-compat with anything importing it from here.
export { TASK_COLORS }

const GLYPH_DARK = '#33373F'  // icon color on a light chip

export default function ColorIconPicker({ color, icon, onColor, onIcon, onClose }) {
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')
  const fileRef = useRef(null)
  const selColor = color || '#2A9D8F'

  const term = q.trim().toLowerCase()
  const words = term ? term.split(/\s+/) : []
  const matches = (hay) => words.every(w => hay.includes(w))
  // Filled Material icons (Structured's style) — search across each icon's
  // name, keywords and group.
  const glyphResults = term ? ICON_ALL.filter(it =>
    matches(`${it.id.toLowerCase()} ${it.k} ${it.group.toLowerCase()}`)).map(it => it.id) : null

  const onFile = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!f.type.startsWith('image/')) { setErr('Please pick an image file.'); return }
    if (f.size > 2 * 1024 * 1024) { setErr('Image too large (max 2 MB).'); return }
    try { const uri = await fileToIconDataUri(f); onIcon(uri); setErr('') }
    catch { setErr('Could not read that image.') }
  }

  const IconBtn = ({ id }) => {
    const on = icon === 'glyph:' + id
    return (
      <button onClick={() => onIcon('glyph:' + id)} title={id}
        style={{ width:52, height:52, borderRadius:'50%', border:'none', cursor:'pointer', flexShrink:0,
          display:'flex', alignItems:'center', justifyContent:'center',
          background: on ? selColor : '#F0EEF3', transition:'background .15s' }}>
        <Icon value={'glyph:' + id} size={26} color={on ? iconColorOn(selColor) : GLYPH_DARK} />
      </button>
    )
  }
  return (
    <div onClick={e => { e.stopPropagation(); onClose() }}
      style={{ position:'fixed', inset:0, background:'rgba(20,28,38,.5)', zIndex:700, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      {/* Fixed height so searching (fewer results) doesn't shrink the sheet. */}
      <div onClick={e => e.stopPropagation()}
        style={{ background:'white', borderRadius:'22px 22px 0 0', width:'100%', maxWidth:480, height:'86vh', display:'flex', flexDirection:'column', boxShadow:'0 -10px 44px rgba(20,40,60,.28)' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 18px 12px', flexShrink:0 }}>
          <span className="serif" style={{ fontSize:20, fontWeight:700, color:'var(--text)' }}>Color &amp; Icon</span>
          <button onClick={onClose} aria-label="Done"
            style={{ width:34, height:34, borderRadius:'50%', border:'none', background:'#F0EEF3', color:'var(--text)', fontSize:16, cursor:'pointer' }}>✕</button>
        </div>

        {/* Color swatches — the shared picker: Bloom default, the standard
            palette, your saved colors (✕ to delete), then the custom wheel. */}
        <div style={{ padding:'2px 18px 10px', flexShrink:0 }}>
          <ColorSwatchRow value={color} onChange={onColor} size={32} />
        </div>

        {/* Search */}
        <div style={{ padding:'0 18px 12px', flexShrink:0 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search icons"
            autoCapitalize="none" autoCorrect="off" spellCheck={false}
            style={{ width:'100%', fontSize:14, padding:'10px 14px', borderRadius:20, border:'none', background:'#F0EEF3', fontFamily:'DM Sans,sans-serif', outline:'none', boxSizing:'border-box', color:'var(--text)' }} />
        </div>

        {/* Grid — fixed-flex so the sheet keeps a constant height whether the
            full list or a short search result is showing (no jarring shrink). */}
        <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:'2px 18px calc(16px + env(safe-area-inset-bottom))' }}>
          {term ? (
            glyphResults.length ? (
              <div style={{ display:'flex', flexWrap:'wrap', gap:10, paddingTop:6 }}>
                {glyphResults.map(id => <IconBtn key={id} id={id} />)}
              </div>
            ) : (
              <div style={{ fontSize:13, color:'var(--muted)', padding:'20px 0', textAlign:'center' }}>No icons match “{q}”.</div>
            )
          ) : (
            ICON_GROUPS.map(([group, items]) => (
              <div key={group} style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, color:'var(--muted)', fontWeight:700, letterSpacing:.6, textTransform:'uppercase', margin:'10px 0 8px' }}>{group}</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
                  {items.map(([id]) => <IconBtn key={id} id={id} />)}
                </div>
              </div>
            ))
          )}

          {/* Upload / clear */}
          <div style={{ display:'flex', gap:8, marginTop:8, paddingTop:12, borderTop:'1px solid #F1EDF2' }}>
            <button onClick={() => fileRef.current?.click()}
              style={{ flex:1, fontSize:12, padding:'10px', borderRadius:10, border:'1px solid var(--border)', background:'white', color:'var(--text)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>
              ⬆ Upload image
            </button>
            {icon && (
              <button onClick={() => onIcon('')}
                style={{ fontSize:12, padding:'10px 16px', borderRadius:10, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>
                Remove icon
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          </div>
          {isImageIcon(icon) && <div style={{ fontSize:11, color:'var(--muted)', marginTop:8 }}>Custom image in use.</div>}
          {err && <div style={{ fontSize:11, color:'#EF4444', marginTop:8 }}>{err}</div>}
        </div>
      </div>
    </div>
  )
}

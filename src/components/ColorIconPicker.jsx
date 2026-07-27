// src/components/ColorIconPicker.jsx
// A Structured-style "Color & Icon" bottom sheet. Pick a per-task color from a
// swatch row (or the native wheel), then pick a monochrome line icon from a
// searchable, grouped grid — or upload your own image. The chosen icon is
// stored on the task ("glyph:<id>") and renders white on the timeline pill,
// on the detail header, and on the Commitments card.
import { useState, useRef, useEffect } from 'react'
import { isImageIcon, fileToIconDataUri } from './IconPicker.jsx'
import { Glyph, GLYPH_GROUPS, GLYPH_ALL, iconColorOn } from '../lib/glyphs.jsx'

// Same palette the detail sheet uses, so a color picked here matches.
export const TASK_COLORS = ['#E0A33E','#C4728E','#EC6F9C','#7C9CBF','#4A9EB5','#52B788','#2A9D8F','#7C3AED','#E07B2E','#EF6B6B','#6B7A8D','#111827']

const GLYPH_DARK = '#33373F'  // icon color on a light chip

export default function ColorIconPicker({ color, icon, onColor, onIcon, onClose }) {
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')
  const fileRef = useRef(null)

  // Keep the sheet above the on-screen keyboard. This sheet is anchored to the
  // bottom of the layout viewport, which iOS does NOT shrink when the keyboard
  // opens — so without this the whole picker (search field + icons) slides
  // behind the keyboard the moment you tap "Search icons". The visualViewport
  // API tells us how much of the bottom is obscured; we lift the sheet by that
  // amount and cap its height to what's actually visible.
  const [kb, setKb] = useState(0)         // pixels hidden by the keyboard
  const [visH, setVisH] = useState(0)     // visible viewport height (0 = no data)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const sync = () => {
      setKb(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
      setVisH(vv.height)
    }
    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => { vv.removeEventListener('resize', sync); vv.removeEventListener('scroll', sync) }
  }, [])
  const isCustomColor = !!color && !TASK_COLORS.includes(color)
  const selColor = color || '#2A9D8F'

  const term = q.trim().toLowerCase()
  // Match the icon name, its keywords, or its group name — so searching a
  // category like "health" surfaces that whole group, not one stray icon.
  const results = term ? GLYPH_ALL.filter(it =>
    it.id.toLowerCase().includes(term) || it.k.includes(term) || it.group.toLowerCase().includes(term)) : null

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
        <Glyph id={id} size={25} color={on ? iconColorOn(selColor) : GLYPH_DARK} />
      </button>
    )
  }

  return (
    <div onClick={e => { e.stopPropagation(); onClose() }}
      style={{ position:'fixed', inset:0, background:'rgba(20,28,38,.5)', zIndex:700, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:'white', borderRadius:'22px 22px 0 0', width:'100%', maxWidth:480,
          // Lift the sheet above the keyboard and shrink it to the visible area
          // so its content scrolls instead of hiding behind the keyboard.
          marginBottom: kb, transition:'margin-bottom .18s ease',
          maxHeight: kb > 0 ? Math.round(visH - 8) : '88vh',
          display:'flex', flexDirection:'column', boxShadow:'0 -10px 44px rgba(20,40,60,.28)' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 18px 12px', flexShrink:0 }}>
          <span className="serif" style={{ fontSize:20, fontWeight:700, color:'var(--text)' }}>Color &amp; Icon</span>
          <button onClick={onClose} aria-label="Done"
            style={{ width:34, height:34, borderRadius:'50%', border:'none', background:'#F0EEF3', color:'var(--text)', fontSize:16, cursor:'pointer' }}>✕</button>
        </div>

        {/* Color swatches — own row with generous vertical room so the selected
            ring is never clipped by the horizontal scroll. */}
        <div style={{ display:'flex', gap:12, alignItems:'center', overflowX:'auto', overflowY:'hidden', padding:'8px 18px 14px', flexShrink:0, WebkitOverflowScrolling:'touch' }}>
          {TASK_COLORS.map(cx => (
            <button key={cx} onClick={() => onColor(cx)} aria-label={`Color ${cx}`}
              style={{ width:32, height:32, borderRadius:'50%', background:cx, cursor:'pointer', padding:0, flexShrink:0,
                border: color===cx ? '3px solid white' : '3px solid transparent',
                boxShadow: color===cx ? `0 0 0 2px ${cx}` : '0 0 0 1px rgba(0,0,0,.12)' }} />
          ))}
          <label title="Custom color" style={{ width:32, height:32, borderRadius:'50%', cursor:'pointer', position:'relative', overflow:'hidden', display:'inline-block', flexShrink:0,
            background: isCustomColor ? color : 'conic-gradient(from 90deg, #EF6B6B, #E0A33E, #52B788, #4A9EB5, #7C3AED, #EC6F9C, #EF6B6B)',
            border: isCustomColor ? '3px solid white' : '3px solid transparent',
            boxShadow: isCustomColor ? `0 0 0 2px ${color}` : '0 0 0 1px rgba(0,0,0,.12)' }}>
            <input type="color" value={color || '#4A9EB5'} onChange={e => onColor(e.target.value)}
              style={{ position:'absolute', top:'-40%', left:'-40%', width:'180%', height:'180%', opacity:0, cursor:'pointer', border:'none', padding:0 }} />
          </label>
        </div>

        {/* Search */}
        <div style={{ padding:'0 18px 12px', flexShrink:0 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search icons"
            autoCapitalize="none" autoCorrect="off" spellCheck={false}
            style={{ width:'100%', fontSize:14, padding:'10px 14px', borderRadius:20, border:'none', background:'#F0EEF3', fontFamily:'DM Sans,sans-serif', outline:'none', boxSizing:'border-box', color:'var(--text)' }} />
        </div>

        {/* Grid — sizes to its content (so a short search result doesn't leave a
            big empty sheet) but shrinks + scrolls when the full list is tall. */}
        <div style={{ flex:'0 1 auto', minHeight:0, overflowY:'auto', padding:'2px 18px calc(16px + env(safe-area-inset-bottom))' }}>
          {results ? (
            results.length ? (
              <div style={{ display:'flex', flexWrap:'wrap', gap:10, paddingTop:6 }}>
                {results.map(it => <IconBtn key={it.id} id={it.id} />)}
              </div>
            ) : (
              <div style={{ fontSize:13, color:'var(--muted)', padding:'20px 0', textAlign:'center' }}>No icons match “{q}”.</div>
            )
          ) : (
            GLYPH_GROUPS.map(g => (
              <div key={g.name} style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, color:'var(--muted)', fontWeight:700, letterSpacing:.6, textTransform:'uppercase', margin:'10px 0 8px' }}>{g.name}</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
                  {g.items.map(([id]) => <IconBtn key={id} id={id} />)}
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

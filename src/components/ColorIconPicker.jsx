// src/components/ColorIconPicker.jsx
// A Structured-style "Color & Icon" bottom sheet. Pick a per-task color from a
// swatch row (or the native wheel), then pick a monochrome line icon from a
// searchable, grouped grid — or upload your own image. The chosen icon is
// stored on the task ("glyph:<id>") and renders white on the timeline pill,
// on the detail header, and on the Commitments card.
import { useState, useRef } from 'react'
import { isImageIcon, fileToIconDataUri } from './IconPicker.jsx'
import { Glyph, GLYPH_GROUPS, GLYPH_ALL, iconColorOn } from '../lib/glyphs.jsx'
import { EMOJI_GROUPS, EMOJI_ALL } from '../lib/emojis.js'
import { getSavedColors, addSavedColor, removeSavedColor, activeAccent } from '../lib/appearance.js'

// Same palette the detail sheet uses, so a color picked here matches.
export const TASK_COLORS = ['#E0A33E','#C4728E','#EC6F9C','#7C9CBF','#4A9EB5','#52B788','#2A9D8F','#7C3AED','#E07B2E','#EF6B6B','#6B7A8D','#111827']

const GLYPH_DARK = '#33373F'  // icon color on a light chip
const eq = (a, b) => (a || '').toUpperCase() === (b || '').toUpperCase()

export default function ColorIconPicker({ color, icon, onColor, onIcon, onClose }) {
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState(getSavedColors)
  const fileRef = useRef(null)
  // The active theme's accent is offered as the "Bloom default" swatch, so it
  // tracks whichever color scheme is on.
  const bloomAccent = activeAccent()
  const isKnown = c => TASK_COLORS.some(x => eq(x, c)) || saved.some(x => eq(x, c)) || eq(bloomAccent, c)
  const isCustomColor = !!color && !isKnown(color)
  const selColor = color || '#2A9D8F'
  const saveCurrent = () => { if (color) setSaved(addSavedColor(color)) }
  const deleteSaved = (c) => { setSaved(removeSavedColor(c)); }

  const term = q.trim().toLowerCase()
  const words = term ? term.split(/\s+/) : []
  const matches = (hay) => words.every(w => hay.includes(w))
  // Search across BOTH the emoji set and the line glyphs. Emoji come first
  // (Structured-style), then matching line icons.
  const emojiResults = term ? EMOJI_ALL.filter(e => matches(e.k)).map(e => e.c) : null
  const glyphResults = term ? GLYPH_ALL.filter(it =>
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
        <Glyph id={id} size={25} color={on ? iconColorOn(selColor) : GLYPH_DARK} />
      </button>
    )
  }
  const EmojiBtn = ({ c }) => {
    const on = icon === c
    return (
      <button onClick={() => onIcon(c)} title={c}
        style={{ width:52, height:52, borderRadius:'50%', border:'none', cursor:'pointer', flexShrink:0,
          display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, lineHeight:1,
          background: on ? selColor : '#F0EEF3', transition:'background .15s' }}>
        <span style={{ filter: on ? 'drop-shadow(0 0 2px rgba(0,0,0,.25))' : 'none' }}>{c}</span>
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

        {/* Color swatches — own row with generous vertical room so the selected
            ring is never clipped by the horizontal scroll. Order: the active
            theme's Bloom default, the standard palette, then your saved colors
            (long-press / tap-when-selected to delete), then the custom wheel. */}
        <div style={{ display:'flex', gap:12, alignItems:'center', overflowX:'auto', overflowY:'hidden', padding:'8px 18px 14px', flexShrink:0, WebkitOverflowScrolling:'touch' }}>
          {/* Bloom default — matches whatever theme is on */}
          <button onClick={() => onColor(bloomAccent)} title="Bloom default (matches your theme)" aria-label="Bloom default color"
            style={{ position:'relative', width:32, height:32, borderRadius:'50%', background:bloomAccent, cursor:'pointer', padding:0, flexShrink:0,
              border: eq(color, bloomAccent) ? '3px solid white' : '3px solid transparent',
              boxShadow: eq(color, bloomAccent) ? `0 0 0 2px ${bloomAccent}` : '0 0 0 1px rgba(0,0,0,.12)' }}>
            <span style={{ position:'absolute', bottom:-3, right:-3, width:13, height:13, borderRadius:'50%', background:'white', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 0 1px rgba(0,0,0,.1)' }}>
              <svg viewBox="0 0 24 24" width="9" height="9" fill={bloomAccent}><path d="M12 3c1 3 4.8 4.3 4.8 8.6A4.8 4.8 0 0 1 7.2 12c0-2 1-3.2 2-4.2.5 2 1.6 2 2 1 .5-1.2-1.2-3.2-1.2-5.8Z"/></svg>
            </span>
          </button>
          {TASK_COLORS.map(cx => (
            <button key={cx} onClick={() => onColor(cx)} aria-label={`Color ${cx}`}
              style={{ width:32, height:32, borderRadius:'50%', background:cx, cursor:'pointer', padding:0, flexShrink:0,
                border: eq(color, cx) ? '3px solid white' : '3px solid transparent',
                boxShadow: eq(color, cx) ? `0 0 0 2px ${cx}` : '0 0 0 1px rgba(0,0,0,.12)' }} />
          ))}
          {/* Saved custom colors — tap to use; when selected, an ✕ deletes it */}
          {saved.map(cx => {
            const on = eq(color, cx)
            return (
              <span key={cx} style={{ position:'relative', flexShrink:0, display:'inline-flex' }}>
                <button onClick={() => onColor(cx)} aria-label={`Saved color ${cx}`}
                  style={{ width:32, height:32, borderRadius:'50%', background:cx, cursor:'pointer', padding:0,
                    border: on ? '3px solid white' : '3px solid transparent',
                    boxShadow: on ? `0 0 0 2px ${cx}` : '0 0 0 1px rgba(0,0,0,.12)' }} />
                <button onClick={() => deleteSaved(cx)} title="Delete saved color" aria-label="Delete saved color"
                  style={{ position:'absolute', top:-4, right:-4, width:16, height:16, borderRadius:'50%', border:'none', background:'#33373F', color:'white', fontSize:10, lineHeight:1, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 0 1.5px white' }}>✕</button>
              </span>
            )
          })}
          <label title="Custom color" style={{ width:32, height:32, borderRadius:'50%', cursor:'pointer', position:'relative', overflow:'hidden', display:'inline-block', flexShrink:0,
            background: isCustomColor ? color : 'conic-gradient(from 90deg, #EF6B6B, #E0A33E, #52B788, #4A9EB5, #7C3AED, #EC6F9C, #EF6B6B)',
            border: isCustomColor ? '3px solid white' : '3px solid transparent',
            boxShadow: isCustomColor ? `0 0 0 2px ${color}` : '0 0 0 1px rgba(0,0,0,.12)' }}>
            <input type="color" value={color || '#4A9EB5'} onChange={e => onColor(e.target.value)}
              style={{ position:'absolute', top:'-40%', left:'-40%', width:'180%', height:'180%', opacity:0, cursor:'pointer', border:'none', padding:0 }} />
          </label>
          {/* Save the current custom color into the palette */}
          {isCustomColor && (
            <button onClick={saveCurrent} title="Save this color" aria-label="Save this color"
              style={{ width:32, height:32, borderRadius:'50%', flexShrink:0, border:'1.5px dashed var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', fontSize:18, lineHeight:1, display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
          )}
        </div>

        {/* Search */}
        <div style={{ padding:'0 18px 12px', flexShrink:0 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search emoji & icons"
            autoCapitalize="none" autoCorrect="off" spellCheck={false}
            style={{ width:'100%', fontSize:14, padding:'10px 14px', borderRadius:20, border:'none', background:'#F0EEF3', fontFamily:'DM Sans,sans-serif', outline:'none', boxSizing:'border-box', color:'var(--text)' }} />
        </div>

        {/* Grid — fixed-flex so the sheet keeps a constant height whether the
            full list or a short search result is showing (no jarring shrink). */}
        <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:'2px 18px calc(16px + env(safe-area-inset-bottom))' }}>
          {term ? (
            (emojiResults.length || glyphResults.length) ? (
              <>
                {emojiResults.length > 0 && (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:10, paddingTop:6 }}>
                    {emojiResults.map(c => <EmojiBtn key={c} c={c} />)}
                  </div>
                )}
                {glyphResults.length > 0 && (
                  <>
                    <div style={{ fontSize:11, color:'var(--muted)', fontWeight:700, letterSpacing:.6, textTransform:'uppercase', margin:'14px 0 8px' }}>Line icons</div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
                      {glyphResults.map(id => <IconBtn key={id} id={id} />)}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div style={{ fontSize:13, color:'var(--muted)', padding:'20px 0', textAlign:'center' }}>Nothing matches “{q}”.</div>
            )
          ) : (
            <>
              {EMOJI_GROUPS.map(g => (
                <div key={g.name} style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11, color:'var(--muted)', fontWeight:700, letterSpacing:.6, textTransform:'uppercase', margin:'10px 0 8px' }}>{g.name}</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
                    {g.items.map(([c]) => <EmojiBtn key={c} c={c} />)}
                  </div>
                </div>
              ))}
              <div style={{ fontSize:11, color:'var(--muted)', fontWeight:700, letterSpacing:.6, textTransform:'uppercase', margin:'18px 0 8px' }}>Line icons</div>
              {GLYPH_GROUPS.map(g => (
                <div key={g.name} style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11, color:'var(--muted)', fontWeight:600, letterSpacing:.4, margin:'8px 0 8px' }}>{g.name}</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
                    {g.items.map(([id]) => <IconBtn key={id} id={id} />)}
                  </div>
                </div>
              ))}
            </>
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

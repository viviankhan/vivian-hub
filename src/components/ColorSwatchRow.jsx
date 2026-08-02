// src/components/ColorSwatchRow.jsx
// The one color picker used everywhere a color is chosen — task color, category
// (label) color, event color, routine tint, theme accent. It shows the same
// row each time: the Bloom default (the active theme's accent), the shared
// palette, your saved colors (tap to use, ✕ to delete), a custom-color wheel,
// and a "+" to save the current custom color into the palette.
//
// Saved colors live in one device-local store (appearance.js) and a change
// broadcasts a 'bloom-saved-colors' event, so every open picker updates at once
// — add a color in one place and it's available everywhere.
import { useState, useEffect } from 'react'
import { getSavedColors, addSavedColor, removeSavedColor, activeAccent } from '../lib/appearance.js'

// The shared palette. Single source of truth — other files import this.
export const TASK_COLORS = ['#E0A33E','#C4728E','#EC6F9C','#7C9CBF','#4A9EB5','#52B788','#2A9D8F','#7C3AED','#E07B2E','#EF6B6B','#6B7A8D','#111827']

const eq = (a, b) => (a || '').toUpperCase() === (b || '').toUpperCase()

export default function ColorSwatchRow({ value, onChange, size = 30 }) {
  const [saved, setSaved] = useState(getSavedColors)
  // Keep in sync with every other picker (and this one) when the list changes.
  useEffect(() => {
    const refresh = () => setSaved(getSavedColors())
    window.addEventListener('bloom-saved-colors', refresh)
    return () => window.removeEventListener('bloom-saved-colors', refresh)
  }, [])

  const bloomAccent = activeAccent()
  const isKnown = c => TASK_COLORS.some(x => eq(x, c)) || saved.some(x => eq(x, c)) || eq(bloomAccent, c)
  const isCustom = !!value && !isKnown(value)

  const ring = (on, c) => on
    ? { border: '3px solid white', boxShadow: `0 0 0 2px ${c}` }
    : { border: '3px solid transparent', boxShadow: '0 0 0 1px rgba(0,0,0,.12)' }
  const S = { width: size, height: size, borderRadius: '50%', cursor: 'pointer', padding: 0, flexShrink: 0 }

  return (
    <div style={{ display:'flex', gap:10, alignItems:'center', overflowX:'auto', overflowY:'hidden', padding:'4px 0 8px', WebkitOverflowScrolling:'touch' }}>
      {/* Bloom default — tracks the active theme's accent */}
      <button type="button" onClick={() => onChange(bloomAccent)} title="Bloom default (matches your theme)" aria-label="Bloom default color"
        style={{ ...S, position:'relative', background:bloomAccent, ...ring(eq(value, bloomAccent), bloomAccent) }}>
        <span style={{ position:'absolute', bottom:-3, right:-3, width:13, height:13, borderRadius:'50%', background:'white', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 0 1px rgba(0,0,0,.1)' }}>
          <svg viewBox="0 0 24 24" width="9" height="9" fill={bloomAccent}><path d="M12 3c1 3 4.8 4.3 4.8 8.6A4.8 4.8 0 0 1 7.2 12c0-2 1-3.2 2-4.2.5 2 1.6 2 2 1 .5-1.2-1.2-3.2-1.2-5.8Z"/></svg>
        </span>
      </button>
      {/* Shared palette */}
      {TASK_COLORS.map(cx => (
        <button type="button" key={cx} onClick={() => onChange(cx)} aria-label={`Color ${cx}`}
          style={{ ...S, background:cx, ...ring(eq(value, cx), cx) }} />
      ))}
      {/* Saved colors — tap to use, ✕ to delete */}
      {saved.map(cx => {
        const on = eq(value, cx)
        return (
          <span key={cx} style={{ position:'relative', flexShrink:0, display:'inline-flex' }}>
            <button type="button" onClick={() => onChange(cx)} aria-label={`Saved color ${cx}`}
              style={{ ...S, background:cx, ...ring(on, cx) }} />
            <button type="button" onClick={() => removeSavedColor(cx)} title="Delete saved color" aria-label="Delete saved color"
              style={{ position:'absolute', top:-4, right:-4, width:16, height:16, borderRadius:'50%', border:'none', background:'#33373F', color:'white', fontSize:10, lineHeight:1, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 0 1.5px white' }}>✕</button>
          </span>
        )
      })}
      {/* Custom color wheel */}
      <label title="Custom color" style={{ ...S, position:'relative', overflow:'hidden', display:'inline-block',
        background: isCustom ? value : 'conic-gradient(from 90deg, #EF6B6B, #E0A33E, #52B788, #4A9EB5, #7C3AED, #EC6F9C, #EF6B6B)',
        ...(isCustom ? ring(true, value) : { border:'3px solid transparent', boxShadow:'0 0 0 1px rgba(0,0,0,.12)' }) }}>
        <input type="color" value={value || '#4A9EB5'} onChange={e => onChange(e.target.value)}
          style={{ position:'absolute', top:'-40%', left:'-40%', width:'180%', height:'180%', opacity:0, cursor:'pointer', border:'none', padding:0 }} />
      </label>
      {/* Save the current custom color into the shared palette */}
      {isCustom && (
        <button type="button" onClick={() => addSavedColor(value)} title="Save this color" aria-label="Save this color"
          style={{ ...S, border:'1.5px dashed var(--border)', background:'white', color:'var(--muted)', fontSize:18, lineHeight:1, display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
      )}
    </div>
  )
}

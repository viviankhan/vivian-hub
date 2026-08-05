// src/components/ColorSwatchRow.jsx
// The one color picker used everywhere a color is chosen — task color, category
// (label) color, event color, routine tint, theme accent. It's your OWN roster:
// there are no built-in "default" swatches. The row is just the colors you've
// saved (tap to use, ✕ to delete any of them), a custom-color wheel to mix a
// new one, and a "+" to add the mixed color to your roster.
//
// Saved colors live in one device-local store (appearance.js) and a change
// broadcasts a 'bloom-saved-colors' event, so every open picker updates at once
// — add or delete a color in one place and it's reflected everywhere.
import { useState, useEffect } from 'react'
import { getSavedColors, addSavedColor, removeSavedColor } from '../lib/appearance.js'

// A fallback palette other files still use for auto-assigned tag colors. It is
// NOT shown in the picker — the picker is entirely the user's own roster.
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

  // "Custom" = a value that isn't already on your roster (so the + to add shows).
  const isCustom = !!value && !saved.some(x => eq(x, value))

  const ring = (on, c) => on
    ? { border: '3px solid white', boxShadow: `0 0 0 2px ${c}` }
    : { border: '3px solid transparent', boxShadow: '0 0 0 1px rgba(0,0,0,.12)' }
  const S = { width: size, height: size, borderRadius: '50%', cursor: 'pointer', padding: 0, flexShrink: 0 }

  return (
    <div style={{ display:'flex', gap:10, alignItems:'center', overflowX:'auto', overflowY:'hidden', padding:'4px 0 8px', WebkitOverflowScrolling:'touch' }}>
      {/* Your roster — tap to use, ✕ to delete. Every swatch here is one you added. */}
      {saved.map(cx => {
        const on = eq(value, cx)
        return (
          <span key={cx} style={{ position:'relative', flexShrink:0, display:'inline-flex' }}>
            <button type="button" onClick={() => onChange(cx)} aria-label={`Saved color ${cx}`}
              style={{ ...S, background:cx, ...ring(on, cx) }} />
            <button type="button" onClick={() => removeSavedColor(cx)} title="Delete this color" aria-label="Delete this color"
              style={{ position:'absolute', top:-4, right:-4, width:16, height:16, borderRadius:'50%', border:'none', background:'#33373F', color:'white', fontSize:10, lineHeight:1, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 0 1.5px white' }}>✕</button>
          </span>
        )
      })}
      {/* Custom color wheel — mix a new color. */}
      <label title="Mix a new color" style={{ ...S, position:'relative', overflow:'hidden', display:'inline-block',
        background: isCustom ? value : 'conic-gradient(from 90deg, #EF6B6B, #E0A33E, #52B788, #4A9EB5, #7C3AED, #EC6F9C, #EF6B6B)',
        ...(isCustom ? ring(true, value) : { border:'3px solid transparent', boxShadow:'0 0 0 1px rgba(0,0,0,.12)' }) }}>
        <input type="color" value={value || '#4A9EB5'} onChange={e => onChange(e.target.value)}
          style={{ position:'absolute', top:'-40%', left:'-40%', width:'180%', height:'180%', opacity:0, cursor:'pointer', border:'none', padding:0 }} />
      </label>
      {/* Add the mixed color to your roster. */}
      {isCustom && (
        <button type="button" onClick={() => addSavedColor(value)} title="Add this color to your roster" aria-label="Add this color to your roster"
          style={{ ...S, border:'1.5px dashed var(--border)', background:'white', color:'var(--muted)', fontSize:18, lineHeight:1, display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
      )}
      {saved.length === 0 && !isCustom && (
        <span style={{ fontSize:11.5, color:'var(--muted)' }}>Mix a color, then tap + to save it.</span>
      )}
    </div>
  )
}

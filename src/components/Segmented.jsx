// src/components/Segmented.jsx
// ─────────────────────────────────────────────────────────────
// A row of equal tabs that switch a view in place — the control the Insights
// and Wellness tabs use to turn one long scroll into a few screens you can
// take in. Plain buttons with the tablist roles, so a screen reader hears it
// as the tab strip it is.
//
// useRememberedView keeps the chosen view (or range) on this device, the same
// way the app remembers the last-open tab: a UI preference, not synced data.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { Glyph } from '../lib/glyphs.jsx'

export default function Segmented({ items, value, onChange, className = '', ariaLabel }) {
  return (
    <div className={`seg ${className}`} role="tablist" aria-label={ariaLabel}>
      {items.map(it => {
        const on = value === it.id
        return (
          <button key={it.id} type="button" role="tab" aria-selected={on}
            className={`seg-btn ${on ? 'on' : ''}`} onClick={() => onChange(it.id)}>
            {it.glyph && <Glyph id={it.glyph} size={14} />}
            <span>{it.label}</span>
            {it.badge != null && it.badge !== 0 && <b className="seg-badge">{it.badge}</b>}
          </button>
        )
      })}
    </div>
  )
}

// A piece of view state that survives a reload on this device. `valid` is the
// list of ids the stored value is allowed to be — anything else falls back.
export function useRememberedView(key, fallback, valid) {
  const [v, setV] = useState(() => {
    try {
      const saved = localStorage.getItem(key)
      return saved && (!valid || valid.includes(saved)) ? saved : fallback
    } catch { return fallback }
  })
  useEffect(() => { try { localStorage.setItem(key, v) } catch {} }, [key, v])
  return [v, setV]
}

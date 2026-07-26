// src/components/MiniCalendar.jsx
// A compact month calendar for picking a date by tapping — paired with the
// typed DateField so you can either type the date or select it on a grid.
// Value is the app's canonical "YYYY-MM-DD" string (empty = no date).
import { useState, useEffect } from 'react'

const pad = n => String(n).padStart(2, '0')
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// Parse "YYYY-MM-DD" → local Date (noon, to dodge DST edge cases). null if blank.
function parse(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '')
  if (!m) return null
  return new Date(+m[1], +m[2]-1, +m[3], 12)
}

export default function MiniCalendar({ value, onChange }) {
  // The month currently shown. Follows `value` when it changes to another month.
  const [view, setView] = useState(() => parse(value) || new Date())
  useEffect(() => {
    const d = parse(value)
    if (d && (d.getFullYear() !== view.getFullYear() || d.getMonth() !== view.getMonth())) setView(d)
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  const today = ymd(new Date())
  const y = view.getFullYear(), mo = view.getMonth()
  const first = new Date(y, mo, 1)
  const startPad = first.getDay()                 // blanks before the 1st
  const daysInMonth = new Date(y, mo+1, 0).getDate()
  const cells = []
  for (let i = 0; i < startPad; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, mo, d, 12))
  while (cells.length % 7 !== 0) cells.push(null)

  const shift = (delta) => setView(new Date(y, mo + delta, 1))
  const monthLabel = view.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const navBtn = { width:30, height:30, borderRadius:9, border:'1px solid var(--border)', background:'white', color:'var(--muted)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }

  return (
    <div style={{ marginTop:10, background:'white', border:'1px solid var(--border)', borderRadius:12, padding:'10px 12px 12px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
        <button type="button" onClick={() => shift(-1)} aria-label="Previous month" style={navBtn}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="14 6 9 12 14 18"/></svg>
        </button>
        <span style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>{monthLabel}</span>
        <button type="button" onClick={() => shift(1)} aria-label="Next month" style={navBtn}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="10 6 15 12 10 18"/></svg>
        </button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:2, marginBottom:4 }}>
        {WEEKDAYS.map((w, i) => (
          <div key={i} style={{ textAlign:'center', fontSize:10, fontWeight:700, color:'var(--muted)', padding:'2px 0' }}>{w}</div>
        ))}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:2 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const key = ymd(d)
          const sel = key === value
          const isToday = key === today
          return (
            <button key={i} type="button" onClick={() => onChange(key)}
              style={{ aspectRatio:'1 / 1', border:'none', cursor:'pointer', borderRadius:'50%', fontSize:13, fontFamily:'DM Sans,sans-serif',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontWeight: sel ? 700 : (isToday ? 700 : 500),
                background: sel ? 'var(--teal)' : 'transparent',
                color: sel ? 'white' : (isToday ? 'var(--teal)' : 'var(--text)'),
                boxShadow: (isToday && !sel) ? 'inset 0 0 0 1.5px var(--teal)' : 'none' }}>
              {d.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

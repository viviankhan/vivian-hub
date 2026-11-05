// src/components/PlacesDay.jsx
// "Where you were" on Today: the day's stops from your iPhone check-ins
// (lib/placeStamps.js checkinStops) — Heritage Manor until 7:50, the parking
// lot 8:10–8:15, on the bus, Guggenheim from 8:35… A stop outside every place
// you've named can be named right here, which saves it as a place so later
// check-ins there carry its name.
import { useState } from 'react'
import { addSavedPlace } from '../lib/places.js'
import { pushPrefs } from '../lib/prefs.js'

const dayBounds = (dateKey) => {
  const [y, m, d] = dateKey.split('-').map(Number)
  const a = new Date(y, m - 1, d).getTime()
  return [a, new Date(y, m - 1, d + 1).getTime()]
}
const clock = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const dur = (ms) => {
  const m = Math.max(0, Math.round(ms / 60000))
  if (m < 60) return `${m}m`
  return m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.floor(m / 60)}h`
}

export default function PlacesDay({ stops = [], dateKey }) {
  const [open, setOpen] = useState(true)
  const [naming, setNaming] = useState(null)   // stop being named
  const [name, setName] = useState('')
  const [from, to] = dayBounds(dateKey)
  const now = Date.now()
  const day = stops.filter(s => s.start < to && (s.end ?? now) > from)
  if (!day.length) return null

  const save = () => {
    const n = name.trim()
    if (!n || !naming) return
    addSavedPlace({ name: n, lat: naming.lat, lng: naming.lng })
    pushPrefs()
    setNaming(null); setName('')
  }

  return (
    <div className="places-day" style={{ margin:'10px 0', padding:'12px 14px', borderRadius:16, background:'var(--card, white)', border:'1px solid var(--border)' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ display:'flex', alignItems:'center', width:'100%', gap:8, padding:0, border:'none', background:'none', cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>
        <span style={{ fontSize:10.5, fontWeight:700, letterSpacing:1, textTransform:'uppercase', color:'var(--muted)', flex:1, textAlign:'left' }}>Where you were</span>
        <span style={{ fontSize:9, color:'var(--muted)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <ol style={{ listStyle:'none', margin:'8px 0 0', padding:0 }}>
          {day.map(s => {
            const a = Math.max(s.start, from)
            const b = s.end == null ? null : Math.min(s.end, to)
            const here = s.end == null && to > now
            const when = s.start < from ? `until ${clock(b ?? now)}` : (b == null ? `${clock(a)} – now` : `${clock(a)} – ${clock(b)}`)
            const len = (b ?? Math.min(now, to)) - a
            return (
              <li key={s.start} style={{ display:'flex', alignItems:'baseline', gap:10, padding:'6px 0', borderTop:'1px solid #F1EDF2', fontSize:13 }}>
                <span style={{ width:118, flexShrink:0, color:'var(--muted)', fontSize:12 }}>{when}</span>
                <span style={{ flex:1, minWidth:0 }}>
                  {s.name
                    ? <span style={{ fontWeight:600, color:'var(--text)' }}>{s.name.split(',')[0]}</span>
                    : <button type="button" onClick={() => { setNaming(s); setName('') }}
                        style={{ padding:0, border:'none', background:'none', cursor:'pointer', fontFamily:'DM Sans,sans-serif', fontSize:13, color:'var(--teal)', textDecoration:'underline' }}>
                        Somewhere else · name it
                      </button>}
                  {here && <span style={{ marginLeft:6, fontSize:11, color:'var(--forest)' }}>· here now</span>}
                </span>
                {len > 0 && <span style={{ fontSize:11.5, color:'var(--muted)', flexShrink:0 }}>{dur(len)}</span>}
              </li>
            )
          })}
        </ol>
      )}
      {naming && (
        <div style={{ marginTop:10, display:'flex', gap:8 }}>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()}
            placeholder="e.g. Heritage Manor, Parking lot, Roca"
            style={{ flex:1, minWidth:0, padding:'8px 10px', borderRadius:10, border:'1px solid var(--border)', fontSize:13, fontFamily:'DM Sans,sans-serif' }} />
          <button type="button" onClick={save} disabled={!name.trim()}
            style={{ padding:'8px 12px', borderRadius:10, border:'none', background:'var(--forest)', color:'var(--green-light)', fontWeight:600, fontSize:12.5, cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>Save</button>
          <button type="button" onClick={() => setNaming(null)}
            style={{ padding:'8px 10px', borderRadius:10, border:'1px solid var(--border)', background:'white', color:'var(--muted)', fontSize:12.5, cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>Cancel</button>
        </div>
      )}
    </div>
  )
}

// src/components/PlacesDay.jsx
// ─────────────────────────────────────────────────────────────
// Today's places, in one card:
//
//   📍 WHERE YOU ARE
//   Guggenheim Building
//   since 8:30 AM · 55m
//
//   ● Home                         8h 6m
//     until 8:06 AM
//   ┊ On the way                     24m
//     8:06 – 8:30 AM · via Parking off W Frontage Rd NW, Five Guys
//   ◉ Guggenheim Building            55m
//     8:30 AM – now
//
//   PLANS WITH A PLACE
//   1:00 PM  Weyand Lab Meeting   ✓ You were there
//
// The path comes from lib/dayPath.js (stops merged, short unnamed ones folded
// into "On the way"); unnamed spots carry the name OpenStreetMap gives them
// (lib/placeNames.js) and can be renamed with the ✎ beside them, which saves
// a place so later check-ins there carry its name. On other days the card is
// just the path ("Where you were").
// ─────────────────────────────────────────────────────────────
import { useState } from 'react'
import { addSavedPlace } from '../lib/places.js'
import { pushPrefs } from '../lib/prefs.js'
import { spotName, mapsUrl } from '../lib/placeNames.js'
import { dayPath } from '../lib/dayPath.js'

const dayBounds = (dateKey) => {
  const [y, m, d] = dateKey.split('-').map(Number)
  return [new Date(y, m - 1, d).getTime(), new Date(y, m - 1, d + 1).getTime()]
}
const clock = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const dur = (mins) => {
  const m = Math.max(0, Math.round(mins))
  if (m < 60) return `${m}m`
  return m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.floor(m / 60)}h`
}
const short = (n) => String(n || '').split(',')[0].trim()

const STATUS = {
  there:     { icon: '✓', color: '#2F6B4F', bg: '#E7F3EC', text: () => 'You were there' },
  elsewhere: { icon: '!', color: '#9A4B0B', bg: '#FDEFD9', text: (t) => t.seen?.name ? `You were at ${short(t.seen.name)}` : 'You were elsewhere' },
  now:       { icon: '…', color: '#6B5B12', bg: '#FBF5D8', text: () => 'Not there yet' },
  upcoming:  { icon: '', color: 'var(--muted)', bg: '#F4F2F6', text: () => 'Later' },
  unknown:   { icon: '?', color: 'var(--muted)', bg: '#F4F2F6', text: () => 'No check-in' },
}
const kicker = { fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--muted)' }
const smallBtn = (primary) => ({
  padding: '6px 11px', borderRadius: 12, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
  border: primary ? 'none' : '1px solid var(--border)', background: primary ? 'var(--forest)' : 'white', color: primary ? 'var(--green-light)' : 'var(--text)',
})

// extras (today only): { now: { label, since, seen, live } | null, plans, suggestions, onAcceptSuggestion, onDismissSuggestion }
export default function PlacesDay({ stops = [], dateKey, extras = null }) {
  // Folded to one line unless you open it (remembered on this device).
  const [open, setOpen_] = useState(() => { try { return localStorage.getItem('bloom_places_open') === '1' } catch { return false } })
  const setOpen = (f) => setOpen_(o => { const n = typeof f === 'function' ? f(o) : f; try { localStorage.setItem('bloom_places_open', n ? '1' : '0') } catch {} return n })
  const [naming, setNaming] = useState(null)   // row being named
  const [name, setName] = useState('')
  const [from, to] = dayBounds(dateKey)
  const now = Date.now()
  const rows = dayPath(stops, { from, to, now, nameOf: spotName })
  const here = extras?.now || null
  const plans = extras?.plans || []
  const suggestions = extras?.suggestions || []
  if (!rows.length && !here && !plans.length && !suggestions.length) return null

  const save = () => {
    const n = name.trim()
    if (!n || !naming) return
    addSavedPlace({ name: n, lat: naming.lat, lng: naming.lng })
    pushPrefs()
    setNaming(null); setName('')
  }

  return (
    <section className="places-day" data-testid="places-day"
      style={{ margin: '10px 0 12px', padding: open ? '12px 14px 13px' : '10px 14px', borderRadius: 16, background: 'var(--card, white)', border: '1px solid var(--border)', boxShadow: '0 4px 14px rgba(60,72,88,.05)' }}>
      {/* One line: where you are (today) or how many places (another day).
          Tap to unfold the day's path and plans. */}
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} data-testid="location-now"
        style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 8, padding: 0, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', textAlign: 'left' }}>
        <span aria-hidden="true" style={{ fontSize: 14, flexShrink: 0 }}>📍</span>
        <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 14 }}>
          {extras ? (here
            ? <><b style={{ fontWeight: 650, color: 'var(--text)' }}>{here.live ? here.label : `Last seen at ${here.label}`}</b>
                <span style={{ color: 'var(--muted)', fontSize: 12.5 }}> · {here.live ? `since ${clock(here.since)}` : clock(here.seen)}</span></>
            : <span style={{ color: 'var(--muted)' }}>No check-ins yet today</span>)
            : <><b style={{ fontWeight: 650, color: 'var(--text)' }}>Where you were</b>
                <span style={{ color: 'var(--muted)', fontSize: 12.5 }}> · {rows.filter(r => r.kind === 'stay').length} place{rows.filter(r => r.kind === 'stay').length === 1 ? '' : 's'}</span></>}
        </span>
        <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>▾</span>
      </button>

      {open && rows.length > 0 && (
        <ol style={{ listStyle: 'none', margin: '12px 0 0', padding: 0 }} data-testid="day-path">
          {rows.map((r, i) => {
            const travel = r.kind === 'travel'
            const last = i === rows.length - 1
            const when = r.fromBefore ? `until ${clock(r.end)}` : r.ongoing ? `${clock(r.start)} – now` : `${clock(r.start)} – ${clock(r.end)}`
            return (
              <li key={r.start} data-testid="path-row" data-kind={r.kind} style={{ display: 'flex', gap: 10, position: 'relative', paddingBottom: last ? 0 : 10 }}>
                <span aria-hidden="true" style={{ width: 12, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 5 }}>
                  <span style={{
                    width: travel ? 6 : 10, height: travel ? 6 : 10, borderRadius: '50%', flexShrink: 0,
                    background: r.ongoing ? 'var(--forest)' : travel ? 'transparent' : 'var(--teal)',
                    border: travel ? '1.5px solid var(--muted)' : r.ongoing ? '2px solid color-mix(in srgb, var(--forest) 30%, white)' : 'none',
                    boxShadow: r.ongoing ? '0 0 0 3px color-mix(in srgb, var(--forest) 18%, transparent)' : 'none',
                  }} />
                  {!last && <span style={{ flex: 1, width: 0, borderLeft: travel ? '1.5px dashed var(--border)' : '1.5px solid var(--border)', marginTop: 3 }} />}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: travel ? 500 : 650, color: travel ? 'var(--muted)' : 'var(--text)', lineHeight: 1.3 }}>
                      {r.label}
                      {!travel && !r.named && (
                        <button type="button" aria-label={`Name ${r.label}`} title="Name this place" data-testid="name-spot"
                          onClick={() => { setNaming(r); setName(r.auto ? r.label : '') }}
                          style={{ marginLeft: 6, padding: '0 4px', border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>✎</button>
                      )}
                    </span>
                    {r.mins > 0 && <span style={{ fontSize: 12, color: 'var(--muted)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{dur(r.mins)}</span>}
                  </span>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginTop: 1, lineHeight: 1.4 }}>
                    {when}{travel && r.via.length > 0 ? ` · via ${r.via.join(', ')}` : ''}
                    {r.ongoing && <b style={{ color: 'var(--forest)', fontWeight: 700 }}> · here now</b>}
                    {!travel && !r.named && Number.isFinite(r.lat) && (
                      <> · <a href={mapsUrl(r.lat, r.lng, r.auto ? r.label : '')} target="_blank" rel="noopener noreferrer" data-testid="spot-map"
                        style={{ color: 'var(--teal)', fontWeight: 600, textDecoration: 'none' }}>Map ↗</a></>
                    )}
                  </span>
                </span>
              </li>
            )
          })}
        </ol>
      )}

      {naming && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()}
            placeholder="e.g. Home, Mayo parking, Lab" aria-label="Name for this place"
            style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'DM Sans,sans-serif' }} />
          <button type="button" onClick={save} disabled={!name.trim()} style={smallBtn(true)}>Save</button>
          <button type="button" onClick={() => setNaming(null)} style={{ ...smallBtn(false), color: 'var(--muted)' }}>Cancel</button>
        </div>
      )}

      {open && plans.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div style={kicker}>Plans with a place</div>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {plans.map(t => {
              const s = STATUS[t.status] || STATUS.unknown
              return (
                <div key={t.key} data-testid="located-task" data-status={t.status} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)', width: 58, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{clock(t.startMs)}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{short(t.place.name) || 'its place'}</span>
                  </span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: s.color, background: s.bg, borderRadius: 10, padding: '3px 8px', flexShrink: 0, maxWidth: '42%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.icon ? `${s.icon} ` : ''}{s.text(t)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {suggestions.slice(0, 2).map(sg => (
        <div key={sg.taskId} data-testid="place-suggestion" style={{ marginTop: 12, padding: '9px 10px', borderRadius: 12, background: '#F4F1F8' }}>
          <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.45 }}>
            <b>{sg.title}</b> {sg.why === 'history' ? `happened at ${short(sg.place.name)} the last ${sg.times} times.` : `sounds like it happens at ${short(sg.place.name)}.`} Give it that place?
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
            <button type="button" style={smallBtn(true)} onClick={() => extras.onAcceptSuggestion(sg)}>Add place</button>
            <button type="button" style={smallBtn(false)} onClick={() => extras.onDismissSuggestion(sg)}>No</button>
          </div>
        </div>
      ))}
    </section>
  )
}

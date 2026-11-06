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
import { spotName } from '../lib/placeNames.js'
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
  const [open, setOpen] = useState(true)
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
      style={{ margin: '10px 0 12px', padding: '13px 14px', borderRadius: 16, background: 'var(--card, white)', border: '1px solid var(--border)', boxShadow: '0 4px 14px rgba(60,72,88,.05)' }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 8, padding: 0, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>
        <span style={{ ...kicker, flex: 1, textAlign: 'left' }}>📍 {extras ? 'Where you are' : 'Where you were'}</span>
        <span style={{ fontSize: 9, color: 'var(--muted)' }}>{open ? '▲' : '▼'}</span>
      </button>

      {extras && (
        <div data-testid="location-now" style={{ marginTop: 6 }}>
          {here ? (<>
            <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', lineHeight: 1.25 }}>{here.live ? here.label : `Last seen at ${here.label}`}</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
              {here.live ? `since ${clock(here.since)} · ${dur((now - here.since) / 60000)}` : clock(here.seen)}
            </div>
          </>) : <div style={{ fontSize: 13.5, color: 'var(--muted)' }}>No check-ins yet today</div>}
        </div>
      )}

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

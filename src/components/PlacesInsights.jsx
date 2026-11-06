// src/components/PlacesInsights.jsx
// ─────────────────────────────────────────────────────────────
// Insights → Places: where your time went over the page's timeframe, from the
// iPhone check-ins (and what the open app saw). One card per question:
//   • Where — hours at each place, how many visits, a typical stay, and your
//     average mood there when you logged one.
//   • Day by day — each day's stops in order, so "what did Tuesday look like"
//     reads straight off the page.
// The arithmetic is lib/placeInsights.js; this file only lays it out.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { getVisits, VISITS_EVENT } from '../lib/visits.js'
import { placeInsights } from '../lib/placeInsights.js'
import { moodMeta } from '../lib/wellness.js'

export function fmtHM(mins) {
  const m = Math.round(mins); if (m < 60) return `${m}m`
  const h = Math.floor(m / 60), r = m % 60
  return r ? `${h}h ${r}m` : `${h}h`
}
const clock = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const dayLabel = (key) => new Date(key + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

// Your stays, kept fresh as check-ins arrive and the open app logs more.
function useStays() {
  const [stays, setStays] = useState(() => getVisits())
  useEffect(() => {
    const h = () => setStays(getVisits())
    window.addEventListener(VISITS_EVENT, h)
    return () => window.removeEventListener(VISITS_EVENT, h)
  }, [])
  return stays
}

// The headline numbers, for the tiles at the top of Insights.
export function usePlaceInsights({ placeStops = [], checkins = [], fromKey, toKey }) {
  const stays = useStays()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t) }, [])
  return useMemo(() => placeInsights({
    stays,
    elsewhere: (placeStops || []).filter(s => !s.key),
    checkins, fromKey, toKey, now,
  }), [stays, placeStops, checkins, fromKey, toKey, now])
}

export default function PlacesInsights({ data, phrase, onSetUp }) {
  const [openDay, setOpenDay] = useState(null)
  const { places, byDay, totalMins } = data
  const max = Math.max(1, ...places.map(p => p.mins))

  if (!places.length) {
    return (
      <section className="in-card" data-testid="places-empty">
        <div className="in-card-head"><h3 className="serif">Where you were</h3></div>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
          No check-ins {phrase}. Your iPhone automations send one each time you arrive at or leave a place, and they show up here as hours at each place.
          {onSetUp && <> <button type="button" className="in-pill" style={{ marginLeft: 4 }} onClick={onSetUp}>Set up check-ins</button></>}
        </p>
      </section>
    )
  }

  return (
    <>
      <section className="in-card" data-testid="places-where">
        <div className="in-card-head">
          <h3 className="serif">Where your time went</h3>
          <span className="in-card-meta">{fmtHM(totalMins)} {phrase}</span>
        </div>
        <div className="in-rows">
          {places.map(p => (
            <div key={p.name} className="in-row" data-testid="place-row">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 14 }}>
                <span style={{ fontWeight: 600, color: p.elsewhere ? 'var(--muted)' : 'var(--text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                <span style={{ fontWeight: 700, flexShrink: 0 }}>{fmtHM(p.mins)}</span>
              </div>
              <div style={{ height: 7, borderRadius: 4, background: 'var(--border)', marginTop: 5 }}>
                <div style={{ width: `${(p.mins / max) * 100}%`, height: '100%', borderRadius: 4, background: p.elsewhere ? '#B8C2CC' : 'var(--teal)' }} />
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>
                {p.visits} visit{p.visits === 1 ? '' : 's'} · usually {fmtHM(p.avgStayMins)}
                {p.days > 1 ? ` · ${p.days} days` : ''}
                {p.mood != null && <> · mood here <b style={{ color: 'var(--text)' }}>{p.mood}</b> ({moodMeta(Math.round(p.mood)).label.toLowerCase()})</>}
              </div>
            </div>
          ))}
        </div>
        {places.some(p => p.elsewhere) && (
          <div className="in-card-foot">“Somewhere else” is time at places you haven’t named: travel, errands, anywhere new. Name a stop under Where you were on Today and it gets its own row.</div>
        )}
      </section>

      <section className="in-card" data-testid="places-days">
        <div className="in-card-head"><h3 className="serif">Day by day</h3></div>
        {byDay.map(({ date, stops }) => {
          const open = openDay === date || byDay.length === 1
          const sum = stops.reduce((a, s) => a + s.mins, 0)
          const named = [...new Set(stops.filter(s => !/^Somewhere else$/.test(s.name)).map(s => s.name))]
          return (
            <div key={date} style={{ borderTop: '1px solid var(--border)', padding: '8px 0' }}>
              <button type="button" onClick={() => setOpenDay(open ? null : date)}
                style={{ display: 'flex', width: '100%', gap: 10, alignItems: 'baseline', border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)', textAlign: 'left' }}>
                <span style={{ fontWeight: 600, fontSize: 13.5, flexShrink: 0 }}>{dayLabel(date)}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{named.join(' · ') || 'Somewhere else'}</span>
                <span style={{ fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{fmtHM(sum)}</span>
              </button>
              {open && (
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {stops.map((s, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, fontSize: 12.5 }}>
                      <span style={{ color: 'var(--muted)', width: 128, flexShrink: 0 }}>{clock(s.start)}–{s.ongoing ? 'now' : clock(s.end)}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>{s.name}</span>
                      <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{fmtHM(s.mins)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </section>
    </>
  )
}

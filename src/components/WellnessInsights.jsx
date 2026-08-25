// src/components/WellnessInsights.jsx
// ─────────────────────────────────────────────────────────────
// The mind-and-body half of Informatics: a mood trend, how much time each
// physical condition has held you, and the correlations the app has noticed
// between conditions, mood, energy and getting things done. Reads the same
// wellness logic the Wellness tab uses, framed as analytics.
// ─────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { Glyph, iconColorOn } from '../lib/glyphs.jsx'
import {
  MOODS, moodMeta, DEFAULT_EFFECTS, effectTotals, fmtDuration,
  buildDailyRecords, computeInsights, moodTrend,
} from '../lib/wellness.js'

function Sparkline({ trend }) {
  const pts = trend.map((d, i) => ({ i, mood: d.mood }))
  const vals = pts.filter(p => p.mood != null)
  if (vals.length < 2) return <div style={{ fontSize: 12, color: 'var(--muted)' }}>Check in a few days to see your trend.</div>
  const W = 240, H = 46, n = trend.length
  const x = i => (i / (n - 1)) * W
  const y = m => H - 4 - ((m - 1) / 4) * (H - 8)
  // Connect across gaps by carrying the last known value.
  let last = null
  const line = pts.map(p => { if (p.mood != null) last = p.mood; return last == null ? null : `${x(p.i).toFixed(1)},${y(last).toFixed(1)}` })
    .filter(Boolean).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden="true" style={{ display: 'block' }}>
      <polyline points={line} fill="none" stroke="var(--teal)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {vals.map(p => <circle key={p.i} cx={x(p.i)} cy={y(p.mood)} r="2.6" fill={moodMeta(Math.round(p.mood)).color} />)}
    </svg>
  )
}

export default function WellnessInsights({ checkins = [], effects, episodes = [], log = [] }) {
  const effectList = (effects && effects.length) ? effects : DEFAULT_EFFECTS
  const trend = useMemo(() => moodTrend(checkins, 21), [checkins])
  const records = useMemo(() => buildDailyRecords({ checkins, episodes, log, effects: effectList }), [checkins, episodes, log, effectList])
  const { insights } = useMemo(() => computeInsights({ records, effects: effectList }), [records, effectList])
  const totals = useMemo(() => effectTotals(episodes), [episodes])

  const moods = trend.map(d => d.mood).filter(m => m != null)
  const avg = moods.length ? Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10 : null
  const firstHalf = moods.slice(0, Math.floor(moods.length / 2))
  const lastHalf = moods.slice(Math.floor(moods.length / 2))
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null
  const dir = (mean(firstHalf) != null && mean(lastHalf) != null) ? (mean(lastHalf) - mean(firstHalf)) : 0
  const arrow = dir > 0.25 ? '↑' : dir < -0.25 ? '↓' : '→'
  const arrowColor = dir > 0.25 ? '#5FA87F' : dir < -0.25 ? '#C0554A' : 'var(--muted)'

  const topConditions = [...totals.values()]
    .map(r => ({ ...r, fx: effectList.find(f => f.id === r.effectId) }))
    .filter(r => r.fx).sort((a, b) => b.mins - a.mins).slice(0, 5)
  const maxMins = topConditions.reduce((m, r) => Math.max(m, r.mins), 1)
  const nothing = moods.length === 0 && topConditions.length === 0

  return (
    <div className="wi-card">
      <div className="wi-head">
        <span className="wi-title"><Glyph id="pulse" size={16} /> Mind &amp; body</span>
        {avg != null && <span className="wi-avg">avg mood {avg}<span style={{ color: arrowColor, fontWeight: 800, marginLeft: 5 }}>{arrow}</span></span>}
      </div>

      {nothing ? (
        <div className="wi-empty">Once you log a few moods and conditions, your patterns show up here — how you tend to feel, what conditions cost you time, and what moves with what.</div>
      ) : (
        <>
          <div className="wi-sub">Mood · last 21 days</div>
          <Sparkline trend={trend} />

          {topConditions.length > 0 && (
            <>
              <div className="wi-sub" style={{ marginTop: 14 }}>Time carried by condition</div>
              <div className="wi-bars">
                {topConditions.map(r => (
                  <div key={r.effectId} className="wi-bar-row">
                    <span className="wi-bar-ico" style={{ background: r.fx.color, color: iconColorOn(r.fx.color) }}><Glyph id={r.fx.icon} size={13} /></span>
                    <span className="wi-bar-name">{r.fx.name}</span>
                    <span className="wi-bar-track"><span className="wi-bar-fill" style={{ width: `${Math.max(4, (r.mins / maxMins) * 100)}%`, background: r.fx.color }} /></span>
                    <span className="wi-bar-val">{fmtDuration(r.mins)}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {insights.length > 0 && (
            <>
              <div className="wi-sub" style={{ marginTop: 14 }}>What relates to what</div>
              <ul className="wi-insights">
                {insights.slice(0, 5).map(i => (
                  <li key={i.id} className={`wi-insight ${i.good ? 'good' : 'watch'}`}>{i.text}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  )
}

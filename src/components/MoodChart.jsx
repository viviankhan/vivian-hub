// src/components/MoodChart.jsx
// ─────────────────────────────────────────────────────────────
// Mood and energy over a window of days, as one chart. Both scales run 1–5, so
// they share a single axis: mood is the solid teal line, energy the dashed
// peach one, and each logged day is a dot in that day's cloud colour. Days
// with nothing logged leave a gap rather than a guess.
//
// It is read by pointing: a hairline follows the pointer and snaps to the
// nearest day, and a readout names that day's mood, energy, how many moments
// it held and which feelings were tagged. The arrow keys do the same with the
// chart focused. The series comes from moodSeries() in lib/wellness.js, so the
// Insights tab and the wellness journal always draw the same numbers.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react'
import { MOODS, ENERGY, moodMeta, emotionMeta, keyToDate } from '../lib/wellness.js'

const PAD = { top: 10, right: 12, bottom: 24, left: 54 }
const ENERGY_COLOR = '#E39A86'

// The rendered width of an element, kept current as it resizes. The chart
// draws in real pixels (not a stretched viewBox), so its text stays crisp.
function useWidth(ref, fallback = 320) {
  const [w, setW] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => { const r = el.getBoundingClientRect(); if (r.width > 0) setW(r.width) }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return w
}

function fmtDay(key, opts) {
  try { return keyToDate(key).toLocaleDateString('en-US', opts) } catch { return key }
}

// Which days get a label along the bottom: every day for a week, every
// seventh day for a month, the first of each month for anything longer.
function xLabels(series) {
  const n = series.length
  if (n <= 7) return series.map((d, i) => ({ i, text: fmtDay(d.date, { weekday: 'short' }) }))
  if (n <= 31) {
    const out = []
    for (let i = n - 1; i >= 0; i -= 7) out.push({ i, text: fmtDay(series[i].date, { month: 'short', day: 'numeric' }) })
    return out.reverse()
  }
  return series.map((d, i) => ({ d, i })).filter(({ d }) => d.date.endsWith('-01'))
    .map(({ d, i }) => ({ i, text: fmtDay(d.date, { month: 'short' }) }))
}

// Join consecutive present values into polyline point strings; a missing day
// ends the current run so the line breaks there.
function runs(series, pick, x, y) {
  const out = []
  let cur = []
  series.forEach((d, i) => {
    const v = pick(d)
    if (v == null) { if (cur.length) out.push(cur); cur = []; return }
    cur.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`)
  })
  if (cur.length) out.push(cur)
  return out
}

export default function MoodChart({ series = [], height = 170, showEnergy = true, className = '' }) {
  const wrap = useRef(null)
  const width = useWidth(wrap)
  const [hover, setHover] = useState(null)   // index of the day under the pointer / focus

  const n = series.length
  const present = useMemo(() => series.filter(d => d.mood != null).length, [series])
  const plotW = Math.max(40, width - PAD.left - PAD.right)
  const plotH = Math.max(40, height - PAD.top - PAD.bottom)
  const x = i => PAD.left + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2)
  const y = v => PAD.top + (1 - (v - 1) / 4) * plotH

  const moodRuns = useMemo(() => runs(series, d => d.mood, x, y), [series, width, height])
  const energyRuns = useMemo(() => showEnergy ? runs(series, d => d.energy, x, y) : [], [series, width, height, showEnergy])
  const labels = useMemo(() => xLabels(series), [series])
  const dots = n <= 62   // past two months of days the dots crowd; the hover still finds them

  const pick = (clientX) => {
    const r = wrap.current?.getBoundingClientRect()
    if (!r || n === 0) return
    const px = clientX - r.left - PAD.left
    const i = Math.max(0, Math.min(n - 1, Math.round((px / plotW) * (n - 1))))
    setHover(i)
  }
  const onKey = (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      setHover(h => {
        const base = h == null ? n - 1 : h
        return Math.max(0, Math.min(n - 1, base + (e.key === 'ArrowLeft' ? -1 : 1)))
      })
    }
    if (e.key === 'Escape') setHover(null)
  }

  if (!present) {
    return <div className={`mc-empty ${className}`}>Check in on a few days and the trend draws itself here.</div>
  }

  const h = hover != null ? series[hover] : null
  const hx = hover != null ? x(hover) : 0
  const flip = hx > PAD.left + plotW / 2

  return (
    <div ref={wrap} className={`mc ${className}`} style={{ position: 'relative' }}>
      <div className="mc-legend" aria-hidden="true">
        <span className="mc-key"><i className="mc-key-line" style={{ background: 'var(--teal)' }} />Mood</span>
        {showEnergy && <span className="mc-key"><i className="mc-key-line dashed" style={{ borderColor: ENERGY_COLOR }} />Energy</span>}
      </div>
      <svg width={width} height={height} className="mc-svg" role="img" tabIndex={0}
        aria-label={`Mood over the last ${n} days, ${present} logged`}
        onPointerMove={e => pick(e.clientX)} onPointerLeave={() => setHover(null)}
        onKeyDown={onKey} onBlur={() => setHover(null)}>
        {/* the five mood steps, as a recessive grid with the cloud colour on the left */}
        {MOODS.map(m => (
          <g key={m.v}>
            <line x1={PAD.left} x2={PAD.left + plotW} y1={y(m.v)} y2={y(m.v)} className="mc-grid" />
            <circle cx={8} cy={y(m.v)} r="3.2" fill={m.color} />
            <text x={15} y={y(m.v) + 3.2} className="mc-ylab">{m.label}</text>
          </g>
        ))}
        {labels.map(l => (
          <text key={l.i} x={x(l.i)} y={height - 6} className="mc-xlab"
            textAnchor={l.i === 0 ? 'start' : l.i === n - 1 ? 'end' : 'middle'}>{l.text}</text>
        ))}
        {energyRuns.map((r, i) => r.length > 1
          ? <polyline key={`e${i}`} points={r.join(' ')} fill="none" stroke={ENERGY_COLOR} strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" strokeLinejoin="round" />
          : null)}
        {moodRuns.map((r, i) => r.length > 1
          ? <polyline key={`m${i}`} points={r.join(' ')} fill="none" stroke="var(--teal)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          : null)}
        {series.map((d, i) => d.mood != null && (dots || i === hover) && (
          <circle key={i} cx={x(i)} cy={y(d.mood)} r={i === hover ? 5 : 3.6}
            fill={moodMeta(Math.round(d.mood)).color} stroke="#fff" strokeWidth={i === hover ? 2 : 1.4} />
        ))}
        {h && (
          <line x1={hx} x2={hx} y1={PAD.top} y2={PAD.top + plotH} className="mc-hair" />
        )}
      </svg>
      {h && (
        <div className={`mc-tip ${flip ? 'flip' : ''}`} style={{ left: hx }} role="status">
          <div className="mc-tip-date">{fmtDay(h.date, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
          {h.mood != null ? (
            <>
              <div className="mc-tip-row"><i style={{ background: 'var(--teal)' }} /><b>{h.mood}</b> {moodMeta(Math.round(h.mood)).label.toLowerCase()}</div>
              {showEnergy && h.energy != null && (
                <div className="mc-tip-row"><i className="dashed" style={{ borderColor: ENERGY_COLOR }} /><b>{h.energy}</b> {ENERGY[Math.max(0, Math.min(4, Math.round(h.energy) - 1))].label.toLowerCase()}</div>
              )}
              <div className="mc-tip-sub">
                {h.count} moment{h.count === 1 ? '' : 's'}
                {h.emotions.length ? ` · ${h.emotions.map(id => emotionMeta(id)?.name).filter(Boolean).join(', ')}` : ''}
              </div>
            </>
          ) : <div className="mc-tip-sub">No check-in</div>}
        </div>
      )}
    </div>
  )
}

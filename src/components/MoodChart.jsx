// src/components/MoodChart.jsx
// ─────────────────────────────────────────────────────────────
// The mood trend line, shared by the Wellness tab and Informatics.
//
// Two things used to make this read badly, and both are worth remembering:
//
//   1. It drew into a fixed 240×46 viewBox stretched to the card's full width
//      with preserveAspectRatio="none". At ~780px that is a 3× horizontal
//      stretch: dots turned into ovals and the stroke thinned out sideways.
//      So the box is now measured and the viewBox matches it 1:1 — one SVG
//      unit is one pixel, and nothing is ever distorted.
//   2. The y-axis was pinned to the full 1–5 mood scale. Real weeks live in a
//      band about a point wide (3.0–3.6), which on 38px of height is a dead
//      flat line. The scale now fits the data it actually has, with a minimum
//      span so a calm week doesn't get magnified into drama, and the axis is
//      labelled so the zoom is never a secret.
// ─────────────────────────────────────────────────────────────
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { MOODS, moodMeta, keyToDate } from '../lib/wellness.js'

// Height of the plot itself (axis labels sit outside this).
const FULL_H = 132
const COMPACT_H = 58
const MIN_SPAN = 1.1   // never zoom tighter than ~a mood point, or noise looks like a crisis

function niceDomain(vals) {
  const lo = Math.min(...vals), hi = Math.max(...vals)
  let min = lo, max = hi
  const pad = Math.max((hi - lo) * 0.35, 0.2)
  min -= pad; max += pad
  if (max - min < MIN_SPAN) {
    const c = (min + max) / 2
    min = c - MIN_SPAN / 2; max = c + MIN_SPAN / 2
  }
  // Stay inside the real 1–5 scale, keeping the span if we bump an end.
  if (min < 1) { max += 1 - min; min = 1 }
  if (max > 5) { min -= max - 5; max = 5 }
  return { min: Math.max(1, min), max: Math.min(5, max) }
}

const fmtDay = key => keyToDate(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export default function MoodChart({ trend = [], compact = false, days }) {
  const hostRef = useRef(null)
  const [w, setW] = useState(0)
  const [active, setActive] = useState(null)

  useLayoutEffect(() => {
    const measure = () => { const el = hostRef.current; if (el) setW(el.clientWidth) }
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    if (ro && hostRef.current) ro.observe(hostRef.current)
    window.addEventListener('resize', measure)
    return () => { ro && ro.disconnect(); window.removeEventListener('resize', measure) }
  }, [])

  const pts = useMemo(() => trend.map((d, i) => ({ i, key: d.date, mood: d.mood })), [trend])
  const vals = pts.filter(p => p.mood != null)

  // Gradient ids must be unique per instance — two charts on one page otherwise
  // share (and fight over) the same fill.
  const uid = useRef(`mc${Math.random().toString(36).slice(2, 8)}`).current

  if (vals.length < 2) {
    return <div className="mc-empty">Check in a few days to see your trend.</div>
  }

  const H = compact ? COMPACT_H : FULL_H
  const padT = compact ? 8 : 12
  const padB = compact ? 8 : 12
  const padL = compact ? 2 : 30
  const padR = compact ? 2 : 10
  // Render at a sane width until the box reports one, then match it exactly.
  const W = w || 560
  const plotW = Math.max(10, W - padL - padR)
  const plotH = H - padT - padB
  const n = pts.length

  const dotR = compact ? 3.2 : (W < 430 ? 3 : 4)
  const { min, max } = niceDomain(vals.map(p => p.mood))
  const x = i => padL + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2)
  const y = m => padT + plotH - ((m - min) / (max - min)) * plotH

  // Runs of consecutive logged days draw solid; the jumps across missed days
  // draw faint, so an interpolated stretch never passes for recorded mood.
  const runs = []
  let cur = []
  pts.forEach(p => {
    if (p.mood == null) { if (cur.length) runs.push(cur); cur = [] }
    else cur.push(p)
  })
  if (cur.length) runs.push(cur)
  const bridges = runs.slice(0, -1).map((r, k) => {
    const a = r[r.length - 1], b = runs[k + 1][0]
    return `M ${x(a.i)},${y(a.mood)} L ${x(b.i)},${y(b.mood)}`
  })

  // A day or two missed is just the line carrying on, so the fill carries on
  // with it. A longer void is a real claim about mood nobody recorded, so the
  // fill stops there — the faint bridge is left to span it alone.
  const FILL_GAP = 2
  const filled = []
  runs.forEach(r => {
    const prev = filled[filled.length - 1]
    if (prev && r[0].i - prev[prev.length - 1].i <= FILL_GAP + 1) prev.push(...r)
    else filled.push([...r])
  })
  const areas = filled.filter(g => g.length > 1).map(g =>
    `M ${x(g[0].i).toFixed(1)},${padT + plotH} ` +
    g.map(p => `L ${x(p.i).toFixed(1)},${y(p.mood).toFixed(1)}`).join(' ') +
    ` L ${x(g[g.length - 1].i).toFixed(1)},${padT + plotH} Z`)

  // Gridlines: any whole mood step inside the zoom — those carry a name
  // ("Okay", "Good"), which is what makes the scale legible — plus the zoom's
  // own ends, dropped when a named step already sits on top of one (two rules
  // two pixels apart, with their labels overprinting each other, reads as a
  // rendering bug).
  const steps = MOODS.map(m => m.v).filter(v => v > min + 0.08 && v < max - 0.08)
  const ends = compact ? [] : [min, max].filter(e =>
    !steps.some(v => Math.abs(y(v) - y(e)) < 14))
  const gridlines = compact ? [] : [...ends, ...steps].sort((a, b) => a - b)

  const hit = e => {
    if (compact) return
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    const i = Math.round(((px - padL) / plotW) * (n - 1))
    const near = vals.reduce((best, p) =>
      (best == null || Math.abs(p.i - i) < Math.abs(best.i - i)) ? p : best, null)
    setActive(near && Math.abs(near.i - i) <= 1.5 ? near : null)
  }

  const avg = Math.round((vals.reduce((a, p) => a + p.mood, 0) / vals.length) * 10) / 10
  const label = `Mood over the last ${days || n} days: average ${avg} out of 5, ` +
    `ranging ${Math.min(...vals.map(p => p.mood))} to ${Math.max(...vals.map(p => p.mood))}.`

  return (
    <div className={`mc-wrap${compact ? ' compact' : ''}`} ref={hostRef}>
      <svg
        className="mc-svg" viewBox={`0 0 ${W} ${H}`} width="100%" height={H}
        role="img" aria-label={label}
        onPointerMove={hit} onPointerLeave={() => setActive(null)}
      >
        <defs>
          <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--teal)" stopOpacity="0.20" />
            <stop offset="100%" stopColor="var(--teal)" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {gridlines.map((v, k) => (
          <line key={k} className="mc-grid" x1={padL} x2={padL + plotW} y1={y(v)} y2={y(v)} />
        ))}

        {areas.map((d, k) => <path key={k} d={d} fill={`url(#${uid}-fill)`} />)}

        {bridges.map((d, k) => <path key={k} className="mc-bridge" d={d} />)}
        {runs.filter(r => r.length > 1).map((r, k) => (
          <polyline key={k} className="mc-line"
            points={r.map(p => `${x(p.i).toFixed(1)},${y(p.mood).toFixed(1)}`).join(' ')} />
        ))}

        {vals.map(p => (
          <circle key={p.i} className={`mc-dot${active && active.i === p.i ? ' on' : ''}`}
            cx={x(p.i)} cy={y(p.mood)} r={dotR}
            fill={moodMeta(Math.round(p.mood)).color} />
        ))}

        {!compact && gridlines.map((v, k) => (
          <text key={k} className="mc-ytick" x={padL - 7} y={y(v) + 3.5} textAnchor="end">
            {steps.includes(v) ? moodMeta(v).label : v.toFixed(1)}
          </text>
        ))}

        {active && (
          <line className="mc-cross" x1={x(active.i)} x2={x(active.i)}
            y1={padT} y2={padT + plotH} />
        )}
      </svg>

      {!compact && (
        <div className="mc-xaxis" style={{ paddingLeft: padL, paddingRight: padR }}>
          <span>{fmtDay(pts[0].key)}</span>
          <span>Today</span>
        </div>
      )}

      {active && (() => {
        // Flip the tip to whichever side of the point has room, so it never
        // sails out of the chart and over the card's heading.
        const ty = y(active.mood)
        const above = ty > padT + plotH * 0.45
        return (
          <div className="mc-tip" style={{
            left: `${Math.min(88, Math.max(12, (x(active.i) / W) * 100))}%`,
            top: ty + (above ? -10 : 10),
            transform: `translate(-50%, ${above ? '-100%' : '0'})`,
          }}>
            <b>{moodMeta(Math.round(active.mood)).label}</b> {active.mood}
            <span>{fmtDay(active.key)}</span>
          </div>
        )
      })()}
    </div>
  )
}

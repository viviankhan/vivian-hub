// src/components/TrackerCharts.jsx
// The analytics vocabulary for the Insights trackers — chosen by the job the
// data does, not by decoration:
//   • TrendColumns — change over time (net by month, or hours by month). A
//     diverging column chart reads profit vs loss at a glance; pies can't.
//   • RankedBars — composition / ranking (spending by category, hours by
//     person). Bars share one baseline so lengths are truly comparable; sorted
//     biggest-first, real values + share, a single on-theme hue ramp (dark =
//     biggest), never a rainbow.
// Both stay in Bloom's calm forest/teal/coral palette.
import { useState } from 'react'
import { card } from './trackerUi.jsx'
import { rampColors, OTHER_COLOR, POS_COLOR, NEG_COLOR, financials, fmtMoney, fmtNumber, decimalHours } from '../lib/trackers.js'

const TRACK = '#ECEAF0'

// ── The financial cascade (Revenue → … → Yours to keep) ─────────
// A calm, receipt-style P&L. Only the lines that apply are shown, and the last
// meaningful figure (take-home if taxes are on, else profit) is the hero.
export function MoneyCascade({ summary, folder = {} }) {
  const sym = folder.currency || '$'
  const $ = v => fmtMoney(v, sym)
  const f = financials(summary, folder)
  if (!f.hasMoney) return null
  const taxOn = f.hasTax && f.profit > 0
  const rows = [
    { label: 'Revenue', value: $(summary.moneyIn) },
    { label: 'Expenses', value: '−' + $(summary.moneyOut) },
    { rule: true },
    { label: 'Profit', value: $(f.profit), strong: true, hero: !taxOn, tone: f.profit < 0 ? 'neg' : 'pos' },
  ]
  if (f.hasMileage) rows.push({ label: 'Mileage deduction', sub: `${fmtNumber(f.miles)} mi × ${sym}${f.rate.toFixed(2)}`, value: '−' + $(f.mileageDeduction), muted: true })
  if (taxOn) {
    if (f.hasMileage) rows.push({ label: 'Taxable profit', value: $(f.taxableProfit), muted: true })
    rows.push({ label: `Set aside for taxes (${f.taxRate}%)`, value: '−' + $(f.taxSetAside) })
    rows.push({ rule: 'double' })
    rows.push({ label: 'Yours to keep', value: $(f.takeHome), hero: true, tone: 'pos' })
  }
  return (
    <div style={{ ...card, padding: '16px 18px' }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map((r, i) => r.rule ? (
          <div key={i} style={{ borderTop: `${r.rule === 'double' ? 2 : 1}px solid var(--border)`, margin: '8px 0' }} />
        ) : (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: r.hero ? '4px 0 2px' : '4px 0' }}>
            <div style={{ minWidth: 0 }}>
              <span className={r.hero ? 'serif' : undefined} style={{ fontSize: r.hero ? 17 : 13.5, fontWeight: r.hero || r.strong ? 700 : 500, color: r.hero ? 'var(--forest)' : r.muted ? 'var(--muted)' : 'var(--text)' }}>{r.label}</span>
              {r.sub && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 7 }}>{r.sub}</span>}
            </div>
            <span className={r.hero ? 'serif' : undefined} style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums', fontSize: r.hero ? 22 : 14, fontWeight: r.hero || r.strong ? 800 : 600,
              color: r.hero ? (r.tone === 'neg' ? 'var(--coral)' : 'var(--forest)') : r.tone === 'neg' ? 'var(--coral)' : r.muted ? 'var(--muted)' : 'var(--text)' }}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Trend: columns per month ────────────────────────────────────
// series: [{ key, label, value }]. diverging=true → zero baseline, green up /
// coral down. Otherwise single-hue columns up from the bottom.
export function TrendColumns({ title, caption, series = [], abbr = v => String(v), diverging = true, hue = '#4A9EB5' }) {
  const [hi, setHi] = useState(null)
  const vals = series.map(s => s.value)
  const allZero = vals.every(v => v === 0)
  const n = series.length
  const colW = 46, W = n * colW, H = 156
  const padTop = 24, padBot = 22
  const plotH = H - padTop - padBot
  const barW = 24
  // Place the zero line where the data actually needs it, so an all-positive (or
  // all-negative) series fills the height instead of hugging a centered axis.
  const posMax = Math.max(0, ...vals.filter(v => v > 0))
  const negMax = Math.max(0, ...vals.filter(v => v < 0).map(v => -v))
  const span = (posMax + negMax) || 1
  const usable = plotH - 6
  const zeroY = diverging ? padTop + 3 + usable * (posMax / span) : H - padBot
  const scale = diverging ? usable / span : usable / Math.max(1, ...vals.map(v => Math.abs(v)))

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{title}</div>
        {caption && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{caption}</div>}
      </div>
      {allZero ? (
        <div style={{ fontSize: 12.5, color: 'var(--muted)', padding: '18px 0' }}>No activity in these months.</div>
      ) : (
        <div style={{ width: '100%', overflowX: 'auto' }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="xMidYMid meet" style={{ display: 'block', minWidth: n * 40 }}>
            {/* zero / baseline */}
            <line x1="4" y1={zeroY} x2={W - 4} y2={zeroY} stroke="#DED8E0" strokeWidth="1" />
            {series.map((s, i) => {
              const cx = i * colW + colW / 2
              const h = Math.abs(s.value) * scale
              const pos = s.value >= 0
              const y = diverging ? (pos ? zeroY - h : zeroY) : zeroY - h
              const color = diverging ? (pos ? POS_COLOR : NEG_COLOR) : hue
              const on = hi === i, last = i === n - 1
              const labelY = diverging ? (pos ? y - 5 : y + h + 12) : y - 5
              return (
                <g key={s.key} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)} style={{ cursor: 'default' }}>
                  <rect x={cx - colW / 2} y={padTop - 6} width={colW} height={H - padTop - 4} fill={on ? 'rgba(74,158,181,.07)' : 'transparent'} />
                  {s.value !== 0 && <rect x={cx - barW / 2} y={y} width={barW} height={Math.max(2, h)} rx="5" fill={color} opacity={last || on ? 1 : 0.82} />}
                  {(last || on) && s.value !== 0 && (
                    <text x={cx} y={labelY} textAnchor="middle" style={{ fontFamily: 'DM Sans,sans-serif', fontWeight: 700, fontSize: 10.5, fill: color }}>{abbr(s.value)}</text>
                  )}
                  <text x={cx} y={H - 6} textAnchor="middle" style={{ fontFamily: 'DM Sans,sans-serif', fontSize: 10.5, fontWeight: on || last ? 700 : 500, fill: on || last ? 'var(--text)' : 'var(--muted)' }}>{s.label}</text>
                </g>
              )
            })}
          </svg>
        </div>
      )}
    </div>
  )
}

// ── Ranked horizontal bars ──────────────────────────────────────
// slices: from toSlices (sorted desc; may end with an "Other" slice). ramp names
// a semantic hue; per-slice `color` (e.g. folder colors) overrides the ramp.
export function RankedBars({ title, slices = [], total = 0, ramp = 'neutral', formatValue = v => String(v) }) {
  const [hi, setHi] = useState(null)
  if (!slices.length || total <= 0) return null
  const max = Math.max(...slices.map(s => s.value)) || 1
  const colors = rampColors(ramp, slices.length)
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{title}</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>{formatValue(total)}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {slices.map((s, i) => {
          const color = s.other ? OTHER_COLOR : (s.color || colors[i])
          const w = Math.max(3, (s.value / max) * 100)
          const on = hi === s.key
          return (
            <div key={s.key} onMouseEnter={() => setHi(s.key)} onMouseLeave={() => setHi(null)}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: i === 0 ? 700 : 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{formatValue(s.value)}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0, width: 34, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Math.round(s.pct * 100)}%</span>
              </div>
              <div style={{ height: 9, borderRadius: 6, background: TRACK, overflow: 'hidden' }}>
                <div style={{ width: `${w}%`, height: '100%', borderRadius: 6, background: color, opacity: on ? 1 : 0.92, transition: 'width .45s cubic-bezier(.2,.7,.2,1)' }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Compact money/hours abbreviations for trend labels.
export function abbrMoney(v, sym = '$') {
  const a = Math.abs(v)
  if (a >= 1000) return `${v < 0 ? '-' : ''}${sym}${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k`
  return `${v < 0 ? '-' : ''}${sym}${Math.round(a)}`
}
export function abbrHours(mins) { const h = Math.round((mins || 0) / 60 * 10) / 10; return `${h}h` }

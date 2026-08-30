// src/components/DonutChart.jsx
// A small, dependency-free donut chart. Ring segments (2px surface gaps between
// them), a total in the hole, and a direct-labeled legend beside it — so a
// slice's identity is carried by its label, never by color alone. Hovering a
// legend row or a segment highlights the pair.
import { useState } from 'react'

export default function DonutChart({
  slices = [],
  total = 0,
  formatValue = v => String(v),
  centerLabel,          // big text in the hole (defaults to formatted total)
  centerSub,            // small text under it
  size = 160,
  thickness = 22,
  emptyText = 'No data yet',
}) {
  const [hi, setHi] = useState(null)   // highlighted slice key
  const r = (size - thickness) / 2
  const cx = size / 2, cy = size / 2
  const circ = 2 * Math.PI * r
  const gap = slices.length > 1 ? 2 : 0   // px of surface between segments

  let offset = 0
  const segs = slices.map(s => {
    const len = Math.max(0, s.pct * circ - gap)
    const seg = { ...s, len, dashOffset: -offset }
    offset += s.pct * circ
    return seg
  })

  const hasData = total > 0 && slices.length > 0

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
        aria-label={hasData ? `Donut chart, ${slices.length} categories, total ${formatValue(total)}` : emptyText}
        style={{ flexShrink: 0 }}>
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          {/* Track */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#EFEDF1" strokeWidth={thickness} />
          {hasData && segs.map(s => {
            const dim = hi && hi !== s.key
            return (
              <circle key={s.key} cx={cx} cy={cy} r={r} fill="none"
                stroke={s.color} strokeWidth={hi === s.key ? thickness + 3 : thickness}
                strokeDasharray={`${s.len} ${circ - s.len}`}
                strokeDashoffset={s.dashOffset}
                strokeLinecap="butt"
                opacity={dim ? 0.35 : 1}
                style={{ transition: 'opacity .15s, stroke-width .15s', cursor: 'default' }}
                onMouseEnter={() => setHi(s.key)} onMouseLeave={() => setHi(null)}>
                <title>{`${s.label}: ${formatValue(s.value)} (${Math.round(s.pct * 100)}%)`}</title>
              </circle>
            )
          })}
        </g>
        {/* Center label — upright (outside the rotated group) */}
        <text x={cx} y={hasData ? cy - 2 : cy} textAnchor="middle" dominantBaseline="middle"
          style={{ fontFamily: 'DM Sans,sans-serif', fontWeight: 800, fontSize: hasData ? 20 : 12, fill: hasData ? 'var(--text)' : 'var(--muted)' }}>
          {hasData ? (centerLabel ?? formatValue(total)) : emptyText}
        </text>
        {hasData && centerSub && (
          <text x={cx} y={cy + 16} textAnchor="middle" dominantBaseline="middle"
            style={{ fontFamily: 'DM Sans,sans-serif', fontWeight: 600, fontSize: 10.5, fill: 'var(--muted)' }}>
            {centerSub}
          </text>
        )}
      </svg>

      {/* Legend — the direct-label channel */}
      {hasData && (
        <div style={{ flex: 1, minWidth: 150, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {slices.map(s => (
            <div key={s.key} onMouseEnter={() => setHi(s.key)} onMouseLeave={() => setHi(null)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 6px', borderRadius: 8,
                background: hi === s.key ? '#F5F3F7' : 'transparent', transition: 'background .15s' }}>
              <span style={{ width: 11, height: 11, borderRadius: 3, background: s.color, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{formatValue(s.value)}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0, width: 34, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Math.round(s.pct * 100)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

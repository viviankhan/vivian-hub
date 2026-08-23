// src/lib/spaceart.jsx
// ─────────────────────────────────────────────────────────────
// Hand-drawn SVG art for the Voyage: a little rocket, the planets, and the
// collectible alien specimens (flora / fauna). Same inline-SVG, no-assets
// approach as the companion and clouds, animated with CSS. Motion is disabled
// under prefers-reduced-motion (the .crit-* keyframes already guard for that).
// ─────────────────────────────────────────────────────────────

const INK = '#33313E'

function lighten(hex, t) {
  const n = (hex || '#ffffff').replace('#', '')
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16)
  const m = v => Math.round(v + (255 - v) * t).toString(16).padStart(2, '0')
  return `#${m(r)}${m(g)}${m(b)}`
}
function darken(hex, t) {
  const n = (hex || '#000000').replace('#', '')
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16)
  const m = v => Math.round(v * (1 - t)).toString(16).padStart(2, '0')
  return `#${m(r)}${m(g)}${m(b)}`
}

// A cute rocket, nose up. `color` is the hull; `flame` animates the exhaust.
export function Rocket({ color = '#D8DEE9', size = 84, flame = true, className = '' }) {
  const fin = darken(color, 0.18)
  return (
    <svg viewBox="0 0 64 104" width={size} height={size} className={className} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      {flame && (
        <g className="vy-flame" style={{ transformOrigin: '32px 80px' }}>
          <path d="M24,78 Q32,102 40,78 Q32,88 24,78 Z" fill="#F5A64B" />
          <path d="M27,78 Q32,95 37,78 Q32,86 27,78 Z" fill="#F6D96B" />
        </g>
      )}
      {/* fins */}
      <path d="M21,56 L9,82 L23,73 Z" fill={fin} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <path d="M43,56 L55,82 L41,73 Z" fill={fin} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      {/* body */}
      <path d="M32,8 C45,19 47,40 45,60 L45,76 L19,76 L19,60 C17,40 19,19 32,8 Z" fill={color} stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      {/* nose accent */}
      <path d="M32,8 C40,15 43,27 43,33 L21,33 C21,27 24,15 32,8 Z" fill="#E9857A" opacity="0.9" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      {/* window */}
      <circle cx="32" cy="44" r="8.5" fill="#BFE6F2" stroke={INK} strokeWidth="2.4" />
      <circle cx="29.5" cy="41.5" r="2.4" fill="#fff" opacity="0.9" />
      <path d="M20,76 L44,76" stroke={INK} strokeWidth="2.4" />
    </svg>
  )
}

// A planet disc with soft shading, a couple of craters and an optional ring.
export function Planet({ color = '#77C598', ring = false, size = 120, id = 'p', className = '' }) {
  const gid = `pl-${id}`
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={className} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <radialGradient id={gid} cx="0.38" cy="0.34" r="0.75">
          <stop offset="0" stopColor={lighten(color, 0.4)} />
          <stop offset="1" stopColor={color} />
        </radialGradient>
      </defs>
      {ring && <ellipse cx="60" cy="60" rx="56" ry="15" fill="none" stroke={lighten(color, 0.35)} strokeWidth="4" opacity="0.55" transform="rotate(-20 60 60)" />}
      <circle cx="60" cy="60" r="38" fill={`url(#${gid})`} />
      <circle cx="48" cy="50" r="6" fill={darken(color, 0.12)} opacity="0.5" />
      <circle cx="72" cy="66" r="9" fill={darken(color, 0.12)} opacity="0.4" />
      <circle cx="62" cy="44" r="4" fill={darken(color, 0.12)} opacity="0.45" />
      {/* terminator shading */}
      <path d="M60,22 A38,38 0 0 1 60,98 A30,44 0 0 0 60,22 Z" fill={darken(color, 0.35)} opacity="0.25" />
      {ring && <ellipse cx="60" cy="60" rx="56" ry="15" fill="none" stroke={lighten(color, 0.55)} strokeWidth="2.4" opacity="0.8" transform="rotate(-20 60 60)" strokeDasharray="1 0" style={{ clipPath: 'inset(0 0 50% 0)' }} />}
    </svg>
  )
}

// Little face shared by the specimens.
function Face({ cx, cy }) {
  return (
    <>
      <circle cx={cx - 4} cy={cy} r="1.7" fill={INK} />
      <circle cx={cx + 4} cy={cy} r="1.7" fill={INK} />
      <path d={`M${cx - 3},${cy + 4} Q${cx},${cy + 7} ${cx + 3},${cy + 4}`} fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
    </>
  )
}

// A collectible alien specimen. `form` picks the silhouette; `collected` false
// renders it as a mystery silhouette with a "?".
export function Specimen({ form = 'blob', color = '#8FD08A', size = 64, collected = true, className = '' }) {
  const c = collected ? color : '#48435E'
  const lc = collected ? lighten(color, 0.25) : '#565073'
  const ink = collected ? INK : '#2C2740'
  const body = (() => {
    switch (form) {
      case 'sprout':
        return (
          <g>
            <path d="M50,84 C50,70 50,58 50,50" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M50,60 C40,58 33,50 34,42 C44,42 51,50 50,60 Z" fill={lc} stroke={ink} strokeWidth="2" />
            <path d="M50,64 C60,62 67,54 66,46 C56,46 49,54 50,64 Z" fill={c} stroke={ink} strokeWidth="2" />
            <ellipse cx="50" cy="40" rx="12" ry="13" fill={c} stroke={ink} strokeWidth="2.4" />
            {collected && <Face cx={50} cy={40} />}
          </g>
        )
      case 'frond':
        return (
          <g>
            <path d="M50,86 C50,66 50,46 50,30" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />
            {[0, 1, 2, 3].map(i => {
              const y = 40 + i * 12
              return <g key={i}>
                <path d={`M50,${y} C40,${y - 4} 32,${y} 30,${y + 6} C40,${y + 6} 48,${y + 4} 50,${y}`} fill={i % 2 ? lc : c} stroke={ink} strokeWidth="1.6" />
                <path d={`M50,${y} C60,${y - 4} 68,${y} 70,${y + 6} C60,${y + 6} 52,${y + 4} 50,${y}`} fill={i % 2 ? c : lc} stroke={ink} strokeWidth="1.6" />
              </g>
            })}
            {collected && <Face cx={50} cy={32} />}
          </g>
        )
      case 'critter':
        return (
          <g>
            {/* legs */}
            <path d="M40,74 L37,86 M50,76 L50,88 M60,74 L63,86" stroke={ink} strokeWidth="3" strokeLinecap="round" />
            <ellipse cx="50" cy="60" rx="20" ry="17" fill={c} stroke={ink} strokeWidth="2.4" />
            {/* ears */}
            <path d="M38,46 C34,36 40,34 44,42 Z" fill={lc} stroke={ink} strokeWidth="2" />
            <path d="M62,46 C66,36 60,34 56,42 Z" fill={lc} stroke={ink} strokeWidth="2" />
            {collected && <Face cx={50} cy={58} />}
          </g>
        )
      default: // blob
        return (
          <g>
            <path d="M30,66 C26,50 36,38 50,38 C64,38 74,50 70,66 C68,78 60,84 50,84 C40,84 32,78 30,66 Z" fill={c} stroke={ink} strokeWidth="2.4" />
            <path d="M50,30 C49,24 53,22 55,26" stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round" />
            <circle cx="55.5" cy="25" r="2.4" fill={collected ? '#F6D96B' : lc} stroke={ink} strokeWidth="1.4" />
            {collected && <Face cx={50} cy={58} />}
          </g>
        )
    }
  })()
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      {body}
      {!collected && <text x="50" y="64" textAnchor="middle" fontSize="20" fontWeight="700" fill="#8B84A8" fontFamily="DM Sans, sans-serif">?</text>}
    </svg>
  )
}

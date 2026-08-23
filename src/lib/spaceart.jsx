// src/lib/spaceart.jsx
// ─────────────────────────────────────────────────────────────
// Hand-drawn SVG art for the Rocket lab: a modular rocket assembled from the
// parts the player buys (nose / hull / fins / window / booster / pilot), plus a
// planet for the backdrop. Same inline-SVG, no-assets approach as the rest of
// the app; animated with CSS and guarded by prefers-reduced-motion.
// ─────────────────────────────────────────────────────────────
import { useId } from 'react'

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

const BODY_D = 'M60,52 C74,52 80,64 80,84 L80,116 C80,128 72,134 60,134 C48,134 40,128 40,116 L40,84 C40,64 46,52 60,52 Z'

function Nose({ part }) {
  const c = part?.color || '#E9857A'
  const d = part?.shape === 'dome'
    ? 'M40,52 C40,32 50,22 60,22 C70,22 80,32 80,52 Z'
    : part?.shape === 'spike'
      ? 'M60,10 C64,28 72,46 74,52 L46,52 C48,46 56,28 60,10 Z'
      : 'M60,16 C67,28 76,44 78,52 L42,52 C44,44 53,28 60,16 Z'
  return <path d={d} fill={c} stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
}

function Wings({ part }) {
  const c = part?.color || '#C6CEDA'
  const s = { fill: c, stroke: INK, strokeWidth: 2.4, strokeLinejoin: 'round' }
  const fin = part?.style === 'swept'
    ? { l: 'M40,100 L20,126 L40,114 Z', r: 'M80,100 L100,126 L80,114 Z' }
    : part?.style === 'round'
      ? { l: 'M40,104 C26,112 22,130 36,130 L40,122 Z', r: 'M80,104 C94,112 98,130 84,130 L80,122 Z' }
      : { l: 'M40,102 L22,132 L40,124 Z', r: 'M80,102 L98,132 L80,124 Z' }
  return <><path d={fin.l} {...s} /><path d={fin.r} {...s} /></>
}

function Window({ part }) {
  const glass = '#BFE6F2'
  if (part?.style === 'visor') return <>
    <ellipse cx="60" cy="76" rx="17" ry="11" fill={glass} stroke={INK} strokeWidth="2.4" />
    <ellipse cx="54" cy="72" rx="4" ry="2.6" fill="#fff" opacity="0.85" />
  </>
  if (part?.style === 'double') return <>
    <circle cx="51" cy="78" r="7.5" fill={glass} stroke={INK} strokeWidth="2.2" />
    <circle cx="69" cy="78" r="7.5" fill={glass} stroke={INK} strokeWidth="2.2" />
  </>
  return <>
    <circle cx="60" cy="78" r="12" fill={glass} stroke={INK} strokeWidth="2.4" />
    <circle cx="55" cy="73" r="2.6" fill="#fff" opacity="0.85" />
  </>
}

function Pilot({ part }) {
  const form = part?.form
  if (!form || form === 'none') return null
  if (form === 'sprout') return (
    <g>
      <path d="M60,84 C60,78 60,74 60,71" stroke="#5B8B57" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M60,74 C54,73 50,68 51,64 C57,64 61,69 60,74 Z" fill="#8FD08A" stroke={INK} strokeWidth="1.4" />
      <ellipse cx="60" cy="80" rx="7" ry="6.5" fill="#A6DDA0" stroke={INK} strokeWidth="1.8" />
      <circle cx="57.5" cy="80" r="1.1" fill={INK} /><circle cx="62.5" cy="80" r="1.1" fill={INK} />
      <path d="M58,83 Q60,85 62,83" stroke={INK} strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </g>
  )
  if (form === 'alien') return (
    <g>
      <path d="M60,70 C59,66 62,65 63,68" stroke={INK} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <circle cx="63" cy="67" r="1.8" fill="#F6D96B" stroke={INK} strokeWidth="1" />
      <ellipse cx="60" cy="80" rx="8" ry="7.5" fill="#9AD98F" stroke={INK} strokeWidth="1.8" />
      <circle cx="57" cy="79" r="1.4" fill={INK} /><circle cx="63" cy="79" r="1.4" fill={INK} />
      <path d="M57.5,83 Q60,85.5 62.5,83" stroke={INK} strokeWidth="1.3" fill="none" strokeLinecap="round" />
    </g>
  )
  // star
  return (
    <g>
      <path d="M60,71l2,4 4.4.6-3.2 3 .8 4.3L60,84l-3.8 1.9.8-4.3-3.2-3 4.4-.6Z" fill="#F6D96B" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="58" cy="78" r="0.9" fill={INK} /><circle cx="62" cy="78" r="0.9" fill={INK} />
      <path d="M58.5,80 Q60,81.5 61.5,80" stroke={INK} strokeWidth="1" fill="none" strokeLinecap="round" />
    </g>
  )
}

function Flame({ part, animate = true }) {
  const cls = animate ? 'vy-flame' : ''
  if (part?.colors?.[0] === 'rainbow') {
    const cols = ['#F26D6D', '#F5A64B', '#F6D96B', '#7FC9A0', '#6E97D8']
    return (
      <g className={cls} style={{ transformOrigin: '60px 144px' }}>
        {cols.map((c, i) => {
          const w = 22 - i * 3.4
          return <path key={i} d={`M${60 - w / 2},144 Q60,${172 - i * 4} ${60 + w / 2},144 Q60,152 ${60 - w / 2},144 Z`} fill={c} />
        })}
      </g>
    )
  }
  const [c0, c1] = part?.colors || ['#F5A64B', '#F6D96B']
  return (
    <g className={cls} style={{ transformOrigin: '60px 144px' }}>
      <path d="M49,144 Q60,178 71,144 Q60,154 49,144 Z" fill={c0} />
      <path d="M54,144 Q60,168 66,144 Q60,152 54,144 Z" fill={c1} />
    </g>
  )
}

// The whole rocket, assembled from an `equipped` map of {cat: partObject}.
export function Rocket({ equipped = {}, size = 120, flame = true, className = '' }) {
  const uid = useId().replace(/:/g, '')
  const body = equipped.body || { color: '#E7ECF3' }
  const nozzle = darken(body.color, 0.2)
  return (
    <svg viewBox="0 0 120 180" width={size} height={size} className={className} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <defs><clipPath id={`bd-${uid}`}><path d={BODY_D} /></clipPath></defs>
      <Flame part={equipped.flame} animate={flame} />
      {/* nozzle */}
      <path d="M48,132 L72,132 L68,146 L52,146 Z" fill={nozzle} stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
      <Wings part={equipped.wings} />
      {/* hull */}
      <path d={BODY_D} fill={body.color} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
      {body.stripe && <g clipPath={`url(#bd-${uid})`}><path d="M40,88 L80,88 L80,100 L40,100 Z" fill={body.stripe} /></g>}
      {/* soft hull shading */}
      <g clipPath={`url(#bd-${uid})`}><ellipse cx="48" cy="80" rx="8" ry="30" fill="#fff" opacity="0.25" /></g>
      <Nose part={equipped.nose} />
      <Window part={equipped.window} />
      <Pilot part={equipped.pilot} />
    </svg>
  )
}

// A planet disc for the backdrop.
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
    </svg>
  )
}

// A little face shared by the specimens.
function SpecFace({ cx, cy }) {
  return (
    <>
      <circle cx={cx - 4} cy={cy} r="1.7" fill={INK} />
      <circle cx={cx + 4} cy={cy} r="1.7" fill={INK} />
      <path d={`M${cx - 3},${cy + 4} Q${cx},${cy + 7} ${cx + 3},${cy + 4}`} fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
    </>
  )
}

// A collectible alien specimen: a plant (flora) or creature (fauna). `form`
// picks the silhouette; it gently bobs via the caller's wrapper.
export function Specimen({ form = 'blob', color = '#8FD08A', size = 64, className = '' }) {
  const c = color, lc = lighten(color, 0.25)
  const body = (() => {
    switch (form) {
      case 'sprout':
        return (
          <g>
            <path d="M50,84 C50,70 50,58 50,50" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M50,60 C40,58 33,50 34,42 C44,42 51,50 50,60 Z" fill={lc} stroke={INK} strokeWidth="2" />
            <path d="M50,64 C60,62 67,54 66,46 C56,46 49,54 50,64 Z" fill={c} stroke={INK} strokeWidth="2" />
            <ellipse cx="50" cy="40" rx="12" ry="13" fill={c} stroke={INK} strokeWidth="2.4" />
            <SpecFace cx={50} cy={40} />
          </g>
        )
      case 'frond':
        return (
          <g>
            <path d="M50,86 C50,66 50,46 50,30" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
            {[0, 1, 2, 3].map(i => {
              const y = 40 + i * 12
              return <g key={i}>
                <path d={`M50,${y} C40,${y - 4} 32,${y} 30,${y + 6} C40,${y + 6} 48,${y + 4} 50,${y}`} fill={i % 2 ? lc : c} stroke={INK} strokeWidth="1.6" />
                <path d={`M50,${y} C60,${y - 4} 68,${y} 70,${y + 6} C60,${y + 6} 52,${y + 4} 50,${y}`} fill={i % 2 ? c : lc} stroke={INK} strokeWidth="1.6" />
              </g>
            })}
            <SpecFace cx={50} cy={32} />
          </g>
        )
      case 'critter':
        return (
          <g>
            <path d="M40,74 L37,86 M50,76 L50,88 M60,74 L63,86" stroke={INK} strokeWidth="3" strokeLinecap="round" />
            <ellipse cx="50" cy="60" rx="20" ry="17" fill={c} stroke={INK} strokeWidth="2.4" />
            <path d="M38,46 C34,36 40,34 44,42 Z" fill={lc} stroke={INK} strokeWidth="2" />
            <path d="M62,46 C66,36 60,34 56,42 Z" fill={lc} stroke={INK} strokeWidth="2" />
            <SpecFace cx={50} cy={58} />
          </g>
        )
      default: // blob
        return (
          <g>
            <path d="M30,66 C26,50 36,38 50,38 C64,38 74,50 70,66 C68,78 60,84 50,84 C40,84 32,78 30,66 Z" fill={c} stroke={INK} strokeWidth="2.4" />
            <path d="M50,30 C49,24 53,22 55,26" stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round" />
            <circle cx="55.5" cy="25" r="2.4" fill="#F6D96B" stroke={INK} strokeWidth="1.4" />
            <SpecFace cx={50} cy={58} />
          </g>
        )
    }
  })()
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      {body}
    </svg>
  )
}

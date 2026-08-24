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

// ── Specimen building blocks ───────────────────────────────────
const EYE = INK
function TwoEyes({ y = 54, sp = 7, r = 5.6, blink = false, delay = 0 }) {
  const eyes = <>
    <circle cx={50 - sp} cy={y} r={r} fill="#fff" stroke={EYE} strokeWidth="1.5" />
    <circle cx={50 + sp} cy={y} r={r} fill="#fff" stroke={EYE} strokeWidth="1.5" />
    <circle cx={50 - sp + 0.6} cy={y + 1} r={r * 0.46} fill={EYE} />
    <circle cx={50 + sp + 0.6} cy={y + 1} r={r * 0.46} fill={EYE} />
    <circle cx={50 - sp - 1} cy={y - 1.4} r="1.1" fill="#fff" />
    <circle cx={50 + sp - 1} cy={y - 1.4} r="1.1" fill="#fff" />
  </>
  return blink ? <g className="crit-eye" style={{ transformOrigin: `50px ${y}px`, animationDelay: `${delay}s` }}>{eyes}</g> : eyes
}
function OneEye({ y = 54, r = 9, blink = false, delay = 0 }) {
  const eye = <>
    <circle cx="50" cy={y} r={r} fill="#fff" stroke={EYE} strokeWidth="1.6" />
    <circle cx="51" cy={y + 1} r={r * 0.42} fill={EYE} />
    <circle cx="48" cy={y - 2} r="1.6" fill="#fff" />
  </>
  return blink ? <g className="crit-eye" style={{ transformOrigin: `50px ${y}px`, animationDelay: `${delay}s` }}>{eye}</g> : eye
}
function Cheeks({ y = 62, sp = 15 }) {
  return <>
    <ellipse cx={50 - sp} cy={y} rx="4.2" ry="2.7" fill="#F2A0A0" opacity="0.4" />
    <ellipse cx={50 + sp} cy={y} rx="4.2" ry="2.7" fill="#F2A0A0" opacity="0.4" />
  </>
}
function Smile({ y = 64, w = 5 }) {
  return <path d={`M${50 - w},${y} Q50,${y + 4} ${50 + w},${y}`} fill="none" stroke={EYE} strokeWidth="1.7" strokeLinecap="round" />
}
function Feet({ y = 87, sp = 9, color }) {
  return <>
    <ellipse cx={50 - sp} cy={y} rx="6" ry="4.2" fill={color} stroke={EYE} strokeWidth="2" />
    <ellipse cx={50 + sp} cy={y} rx="6" ry="4.2" fill={color} stroke={EYE} strokeWidth="2" />
  </>
}
function Pot() {
  return <>
    <path d="M38,80 L62,80 L58.5,95 L41.5,95 Z" fill="#D98A5E" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M41.5,95 L58.5,95" stroke={INK} strokeWidth="0" />
    <rect x="35.5" y="75.5" width="29" height="6.5" rx="2.4" fill="#E39B6B" stroke={INK} strokeWidth="2.2" />
    <path d="M45,88 L55,88" stroke={darken('#D98A5E', 0.12)} strokeWidth="2" strokeLinecap="round" opacity="0.6" />
  </>
}

// A collectible alien specimen — a chunky, shaded little creature (fauna) or a
// potted plant (flora). `form` picks the species silhouette; `color` its pigment.
export function Specimen({ form = 'blob', color = '#8FD08A', size = 64, alive = false, className = '' }) {
  const uid = useId().replace(/:/g, '')
  const bd = (parseInt(uid.replace(/\D/g,'').slice(-2) || '0', 10) % 30) / 10   // per-instance blink delay
  const gid = `sg-${uid}`
  const grad = `url(#${gid})`
  const belly = lighten(color, 0.5)
  const spot = darken(color, 0.14)
  const leaf = color, leaf2 = lighten(color, 0.22), stem = darken(color, 0.28)

  const shape = (() => {
    switch (form) {
      case 'bear': // chunky upright monster
        return (
          <g>
            <path d="M36,36 C31,25 41,22 44,33 Z" fill={grad} stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
            <path d="M64,36 C69,25 59,22 56,33 Z" fill={grad} stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
            <Feet color={color} />
            <path d="M28,54 C28,38 40,32 50,32 C60,32 72,38 72,54 L72,74 C72,84 62,88 50,88 C38,88 28,84 28,74 Z" fill={grad} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
            <ellipse cx="50" cy="70" rx="13" ry="14" fill={belly} />
            <TwoEyes blink={alive} delay={bd} y={54} sp={8} r={6} />
            <Cheeks y={64} sp={17} />
            <Smile y={66} w={5} />
          </g>
        )
      case 'cyclops':
        return (
          <g>
            <path d="M50,30 C49,23 53,22 55,26" stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round" />
            <circle cx="55.5" cy="24" r="2.6" fill="#F6D96B" stroke={INK} strokeWidth="1.4" />
            <path d="M42,82 L40,90 M58,82 L60,90" stroke={INK} strokeWidth="3.4" strokeLinecap="round" />
            <path d="M30,58 C30,42 40,38 50,38 C60,38 70,42 70,58 C70,74 62,82 50,82 C38,82 30,74 30,58 Z" fill={grad} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
            <OneEye blink={alive} delay={bd} y={56} r={11} />
            <Cheeks y={70} sp={17} />
            <Smile y={74} w={4} />
          </g>
        )
      case 'slime':
        return (
          <g>
            <path d="M22,80 C20,58 34,48 50,48 C66,48 80,60 78,80 C77,86 72,88 68,84 C66,88 61,88 58,84 C56,88 51,89 48,84 C45,88 40,88 37,84 C34,88 28,87 26,83 C24,85 22,84 22,80 Z" fill={grad} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
            <ellipse cx="42" cy="60" rx="8" ry="10" fill="#fff" opacity="0.25" />
            <TwoEyes blink={alive} delay={bd} y={62} sp={8} r={6} />
            <Cheeks y={72} sp={16} />
            <Smile y={74} w={6} />
          </g>
        )
      case 'critter': // four-legged
        return (
          <g>
            <path d="M38,74 L34,88 M47,77 L45,90 M53,77 L55,90 M62,74 L66,88" stroke={INK} strokeWidth="3.4" strokeLinecap="round" />
            <path d="M70,66 C80,64 80,74 72,74" fill={grad} stroke={INK} strokeWidth="2.2" />
            <path d="M34,44 C30,34 38,32 42,40 Z" fill={grad} stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
            <path d="M66,44 C70,34 62,32 58,40 Z" fill={grad} stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
            <ellipse cx="50" cy="60" rx="22" ry="17" fill={grad} stroke={INK} strokeWidth="2.6" />
            <ellipse cx="50" cy="66" rx="12" ry="9" fill={belly} />
            <circle cx="40" cy="54" r="2.4" fill={spot} opacity="0.5" /><circle cx="62" cy="58" r="3" fill={spot} opacity="0.5" />
            <TwoEyes blink={alive} delay={bd} y={56} sp={7} r={5.4} />
            <Cheeks y={64} sp={16} />
            <Smile y={65} w={4} />
          </g>
        )
      case 'floaty': // floating jelly
        return (
          <g>
            {[38, 46, 54, 62].map((x, i) => <path key={i} d={`M${x},64 q-2,8 0,14`} stroke={color} strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.85" />)}
            <path d="M30,58 C30,40 40,34 50,34 C60,34 70,40 70,58 C70,64 66,66 60,66 L40,66 C34,66 30,64 30,58 Z" fill={grad} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" opacity="0.96" />
            <ellipse cx="43" cy="46" rx="7" ry="8" fill="#fff" opacity="0.3" />
            <TwoEyes blink={alive} delay={bd} y={52} sp={7} r={5.4} />
            <Smile y={60} w={4} />
          </g>
        )
      case 'shroom':
        return (
          <g>
            <path d="M44,88 C42,74 42,68 44,66 L56,66 C58,68 58,74 56,88 Z" fill={belly} stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
            <path d="M26,54 C26,38 38,32 50,32 C62,32 74,38 74,54 C74,60 62,64 50,64 C38,64 26,60 26,54 Z" fill={grad} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
            <circle cx="40" cy="48" r="4" fill="#fff" opacity="0.7" /><circle cx="58" cy="45" r="5" fill="#fff" opacity="0.7" /><circle cx="52" cy="54" r="3" fill="#fff" opacity="0.7" />
            <TwoEyes blink={alive} delay={bd} y={76} sp={5} r={3.6} />
            <Smile y={82} w={3} />
          </g>
        )
      case 'cactus':
        return (
          <g>
            <Pot />
            <path d="M40,76 C34,74 32,64 34,58 C36,54 41,55 41,60" fill={grad} stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
            <path d="M60,76 C66,74 68,66 66,60 C64,56 59,57 59,62" fill={grad} stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
            <path d="M43,78 C41,58 43,40 50,40 C57,40 59,58 57,78 Z" fill={grad} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
            {[46, 54].map((x, i) => [48, 58, 68].map((yy, j) => <path key={i + '' + j} d={`M${x},${yy} l${x < 50 ? -3 : 3},-1.5`} stroke={stem} strokeWidth="1.3" strokeLinecap="round" opacity="0.6" />))}
            <circle cx="50" cy="38" r="4.5" fill="#F5B8CE" stroke={INK} strokeWidth="1.6" />
            <TwoEyes blink={alive} delay={bd} y={56} sp={5} r={4.2} />
            <Smile y={62} w={3.4} />
          </g>
        )
      case 'bloom':
        return (
          <g>
            <Pot />
            <path d="M50,78 C50,66 50,58 50,52" stroke={stem} strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M50,66 C42,64 38,58 40,54 C46,54 51,60 50,66 Z" fill={leaf2} stroke={INK} strokeWidth="1.8" />
            {Array.from({ length: 6 }).map((_, i) => {
              const a = (i / 6) * Math.PI * 2, px = 50 + Math.cos(a) * 11, py = 44 + Math.sin(a) * 11
              return <ellipse key={i} cx={px} cy={py} rx="5.5" ry="8" transform={`rotate(${a * 180 / Math.PI + 90} ${px} ${py})`} fill={leaf} stroke={INK} strokeWidth="1.6" />
            })}
            <circle cx="50" cy="44" r="8.5" fill={belly} stroke={INK} strokeWidth="1.8" />
            <TwoEyes blink={alive} delay={bd} y={43} sp={4} r={3.4} />
            <Smile y={48} w={3} />
          </g>
        )
      case 'frond':
        return (
          <g>
            <Pot />
            <path d="M50,80 C50,62 50,44 50,30" stroke={stem} strokeWidth="3" fill="none" strokeLinecap="round" />
            {[0, 1, 2, 3].map(i => {
              const y = 38 + i * 11
              return <g key={i}>
                <path d={`M50,${y} C40,${y - 4} 32,${y} 30,${y + 6} C40,${y + 6} 48,${y + 4} 50,${y}`} fill={i % 2 ? leaf2 : leaf} stroke={INK} strokeWidth="1.5" />
                <path d={`M50,${y} C60,${y - 4} 68,${y} 70,${y + 6} C60,${y + 6} 52,${y + 4} 50,${y}`} fill={i % 2 ? leaf : leaf2} stroke={INK} strokeWidth="1.5" />
              </g>
            })}
            <circle cx="50" cy="30" r="6" fill={belly} stroke={INK} strokeWidth="1.6" />
            <TwoEyes blink={alive} delay={bd} y={29} sp={3.4} r={2.8} />
          </g>
        )
      default: // sprout
        return (
          <g>
            <Pot />
            <path d="M50,78 C50,66 50,56 50,50" stroke={stem} strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M50,58 C40,56 34,49 35,43 C45,43 51,50 50,58 Z" fill={leaf2} stroke={INK} strokeWidth="1.8" />
            <path d="M50,62 C60,60 66,53 65,47 C55,47 49,54 50,62 Z" fill={leaf} stroke={INK} strokeWidth="1.8" />
            <ellipse cx="50" cy="42" rx="11" ry="12" fill={grad} stroke={INK} strokeWidth="2.4" />
            <TwoEyes blink={alive} delay={bd} y={42} sp={5} r={3.8} />
            <Cheeks y={48} sp={9} />
            <Smile y={47} w={3} />
          </g>
        )
    }
  })()

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <radialGradient id={gid} cx="0.4" cy="0.3" r="0.85">
          <stop offset="0" stopColor={lighten(color, 0.4)} />
          <stop offset="0.62" stopColor={color} />
          <stop offset="1" stopColor={darken(color, 0.1)} />
        </radialGradient>
      </defs>
      {shape}
    </svg>
  )
}

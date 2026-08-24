// src/lib/spaceart.jsx
// ─────────────────────────────────────────────────────────────
// Hand-drawn SVG art for the Rocket lab: a modular rocket assembled from the
// parts the player buys (nose / hull / fins / window / booster / pilot), plus a
// planet for the backdrop. Same inline-SVG, no-assets approach as the rest of
// the app; animated with CSS and guarded by prefers-reduced-motion.
// ─────────────────────────────────────────────────────────────
import { useId } from 'react'
import { useOverride } from './art.js'

const INK = '#33313E'
const imgStyle = (size) => ({ display: 'block', width: size, height: size, objectFit: 'contain' })

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
// ── Alien features ─────────────────────────────────────────────
// A single vertical-pupil eye (reptilian/alien).
function VertEye({ cx = 50, cy = 54, rx = 6, ry = 9, blink = false, delay = 0 }) {
  const e = <>
    <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#fff" stroke={EYE} strokeWidth="1.6" />
    <ellipse cx={cx} cy={cy + 0.5} rx={rx * 0.32} ry={ry * 0.62} fill={EYE} />
    <circle cx={cx - rx * 0.3} cy={cy - ry * 0.35} r="1.2" fill="#fff" />
  </>
  return blink ? <g className="crit-eye" style={{ transformOrigin: `${cx}px ${cy}px`, animationDelay: `${delay}s` }}>{e}</g> : e
}
// A row of small eyes (three by default) — insect/alien cluster.
function ManyEyes({ y = 54, n = 3, sp = 8, r = 4, blink = false, delay = 0 }) {
  const xs = Array.from({ length: n }, (_, i) => 50 + (i - (n - 1) / 2) * sp)
  const e = <>{xs.map((x, i) => <g key={i}><circle cx={x} cy={y} r={r} fill="#fff" stroke={EYE} strokeWidth="1.3" /><circle cx={x} cy={y + 0.6} r={r * 0.5} fill={EYE} /></g>)}</>
  return blink ? <g className="crit-eye" style={{ transformOrigin: `50px ${y}px`, animationDelay: `${delay}s` }}>{e}</g> : e
}
// Non-human alien mouths (or nothing).
function Maw({ kind = 'none', y = 66 }) {
  if (kind === 'fangs') return <><path d={`M44,${y} L56,${y}`} stroke={EYE} strokeWidth="1.7" strokeLinecap="round" /><path d={`M46.5,${y} l0,3 M53.5,${y} l0,3`} stroke={EYE} strokeWidth="1.7" strokeLinecap="round" /></>
  if (kind === 'slit') return <path d={`M45,${y} Q50,${y + 1.5} 55,${y}`} fill="none" stroke={EYE} strokeWidth="1.8" strokeLinecap="round" />
  if (kind === 'o') return <ellipse cx="50" cy={y} rx="2.4" ry="3.2" fill="none" stroke={EYE} strokeWidth="1.6" />
  if (kind === 'beak') return <path d={`M46,${y} L54,${y} L50,${y + 4.5} Z`} fill="#E8B24E" stroke={EYE} strokeWidth="1.4" strokeLinejoin="round" />
  return null
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
export function Specimen({ form = 'blob', color = '#8FD08A', size = 64, alive = false, assetId, className = '' }) {
  const uid = useId().replace(/:/g, '')
  const override = useOverride(assetId)
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
            <TwoEyes blink={alive} delay={bd} y={54} sp={9} r={5.4} />
            <VertEye blink={alive} delay={bd} cx={50} cy={43} rx={2.8} ry={3.6} />
            <circle cx="42" cy="72" r="2.2" fill={spot} opacity="0.5" /><circle cx="58" cy="74" r="2.6" fill={spot} opacity="0.5" />
            <Maw kind="fangs" y={66} />
          </g>
        )
      case 'cyclops':
        return (
          <g>
            <path d="M50,30 C49,23 53,22 55,26" stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round" />
            <circle cx="55.5" cy="24" r="2.6" fill="#F6D96B" stroke={INK} strokeWidth="1.4" />
            <path d="M42,82 L40,90 M58,82 L60,90" stroke={INK} strokeWidth="3.4" strokeLinecap="round" />
            <path d="M30,58 C30,42 40,38 50,38 C60,38 70,42 70,58 C70,74 62,82 50,82 C38,82 30,74 30,58 Z" fill={grad} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
            <VertEye blink={alive} delay={bd} cx={50} cy={55} rx={7} ry={10.5} />
            <Maw kind="slit" y={74} />
          </g>
        )
      case 'slime':
        return (
          <g>
            <path d="M22,80 C20,58 34,48 50,48 C66,48 80,60 78,80 C77,86 72,88 68,84 C66,88 61,88 58,84 C56,88 51,89 48,84 C45,88 40,88 37,84 C34,88 28,87 26,83 C24,85 22,84 22,80 Z" fill={grad} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
            <ellipse cx="42" cy="60" rx="8" ry="10" fill="#fff" opacity="0.25" />
            <ManyEyes blink={alive} delay={bd} y={62} n={3} sp={9} r={4.4} />
            <ellipse cx="62" cy="72" rx="3.6" ry="4.6" fill="#fff" opacity="0.2" />
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
            <TwoEyes blink={alive} delay={bd} y={55} sp={7.5} r={5} />
            <Maw kind="beak" y={64} />
          </g>
        )
      case 'floaty': // floating jelly
        return (
          <g>
            {[38, 46, 54, 62].map((x, i) => <path key={i} d={`M${x},64 q-2,8 0,14`} stroke={color} strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.85" />)}
            <path d="M30,58 C30,40 40,34 50,34 C60,34 70,40 70,58 C70,64 66,66 60,66 L40,66 C34,66 30,64 30,58 Z" fill={grad} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" opacity="0.96" />
            <ellipse cx="43" cy="46" rx="7" ry="8" fill="#fff" opacity="0.3" />
            <ManyEyes blink={alive} delay={bd} y={50} n={4} sp={7} r={3.4} />
          </g>
        )
      case 'shroom':
        return (
          <g>
            <path d="M44,88 C42,74 42,68 44,66 L56,66 C58,68 58,74 56,88 Z" fill={belly} stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
            <path d="M26,54 C26,38 38,32 50,32 C62,32 74,38 74,54 C74,60 62,64 50,64 C38,64 26,60 26,54 Z" fill={grad} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
            <circle cx="40" cy="48" r="4" fill="#fff" opacity="0.7" /><circle cx="58" cy="45" r="5" fill="#fff" opacity="0.7" /><circle cx="52" cy="54" r="3" fill="#fff" opacity="0.7" />
            <ManyEyes blink={alive} delay={bd} y={76} n={2} sp={7} r={3.2} />
            <Maw kind="slit" y={82} />
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
            <VertEye blink={alive} delay={bd} cx={50} cy={55} rx={4.2} ry={6} />
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
            <TwoEyes blink={alive} delay={bd} y={43} sp={4} r={3} />
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
            <ManyEyes blink={alive} delay={bd} y={42} n={3} sp={5} r={2.8} />
          </g>
        )
    }
  })()

  if (override) return <img src={override} width={size} height={size} alt="" aria-hidden="true" className={className} style={imgStyle(size)} />
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={`spec-svg ${className}`} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        {/* Richer 4-stop shading: highlight → base → a soft occluded base. */}
        <radialGradient id={gid} cx="0.38" cy="0.28" r="0.9">
          <stop offset="0" stopColor={lighten(color, 0.55)} />
          <stop offset="0.35" stopColor={lighten(color, 0.18)} />
          <stop offset="0.72" stopColor={color} />
          <stop offset="1" stopColor={darken(color, 0.16)} />
        </radialGradient>
      </defs>
      {/* soft contact shadow so it reads grounded anywhere */}
      <ellipse cx="50" cy="93" rx="24" ry="4.6" fill="#2A2438" opacity="0.14" />
      <g className="spec-body">{shape}</g>
    </svg>
  )
}

// ── Cabin furniture art ────────────────────────────────────────
// One illustrated piece per furniture `art` key. `size` is the rendered width.
export function FurnArt({ item, size = 64, assetId }) {
  const a = item?.art
  const override = useOverride(assetId)
  if (override) return <img src={override} alt="" aria-hidden="true" style={{ display: 'block', width: size, height: 'auto', objectFit: 'contain' }} />
  const S = (w, h, kids) => <svg viewBox={`0 0 ${w} ${h}`} width={size} height={size * h / w} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>{kids}</svg>
  if (a === 'bed') {
    const c = item.color || '#C98A6A', q = item.quilt || '#8FB27A'
    return S(120, 74, <g>
      <rect x="6" y="14" width="13" height="46" rx="4" fill={c} stroke={INK} strokeWidth="2.6" />
      <rect x="8" y="52" width="104" height="12" rx="4" fill={c} stroke={INK} strokeWidth="2.6" />
      <rect x="14" y="62" width="7" height="11" fill={darken(c, 0.2)} /><rect x="100" y="62" width="7" height="11" fill={darken(c, 0.2)} />
      <rect x="18" y="34" width="94" height="20" rx="8" fill="#F7F1E8" stroke={INK} strokeWidth="2.6" />
      <path d="M50,34 h62 a8,8 0 0 1 8,8 v6 a4,4 0 0 1-4,4 H50 Z" fill={q} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
      {[62, 82, 102].map((x, i) => <g key={i}><path d={`M${x - 6},42 l6,-6 6,6 -6,6 Z`} fill={lighten(q, 0.35)} stroke={INK} strokeWidth="1.4" /></g>)}
      <rect x="22" y="30" width="26" height="17" rx="7" fill="#fff" stroke={INK} strokeWidth="2.6" />
    </g>)
  }
  if (a === 'rug') {
    const c = item.color || '#8FB0D8'
    return S(120, 46, <g>
      <ellipse cx="60" cy="24" rx="56" ry="20" fill={c} stroke={INK} strokeWidth="2.6" />
      <ellipse cx="60" cy="24" rx="46" ry="14" fill="none" stroke={lighten(c, 0.4)} strokeWidth="2" />
      {item.motif === 'star' && <path d="M60,15l2.4,5 5.4.6-4,3.6 1,5.4L60,32l-4.8,2.6 1-5.4-4-3.6 5.4-.6Z" fill={lighten(c, 0.5)} stroke={INK} strokeWidth="1.2" />}
      {item.motif === 'moon' && <path d="M64,16a9,9 0 1 0 0,16 7,7 0 0 1 0-16Z" fill={lighten(c, 0.5)} stroke={INK} strokeWidth="1.2" />}
    </g>)
  }
  if (a === 'window') return S(92, 118, <g>
    <path d="M10,52 A36,36 0 0 1 82,52 L82,110 L10,110 Z" fill="#3A2E63" stroke="#B9A985" strokeWidth="6" strokeLinejoin="round" />
    <path d="M46,18 L46,110 M12,60 L80,60 M12,84 L80,84" stroke="#7A6DA6" strokeWidth="3" />
    <circle cx="60" cy="40" r="9" fill="#F6E7A8" opacity="0.9" />
    {[[16, 44], [70, 40], [22, 78], [72, 76]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="4" fill="#DFF0E4" />)}
    <path d="M10,52 A36,36 0 0 1 40,16" fill="none" stroke="#6AA36E" strokeWidth="6" strokeLinecap="round" />
    <circle cx="20" cy="34" r="5" fill="#CFE8CF" /><circle cx="30" cy="22" r="5" fill="#CFE8CF" />
  </g>)
  if (a === 'door') return S(72, 108, <g>
    <path d="M6,44 A30,30 0 0 1 66,44 L66,104 L6,104 Z" fill="#E9E0CE" stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
    <path d="M12,46 A24,24 0 0 1 60,46 L60,100 L12,100 Z" fill="#A97C52" stroke={INK} strokeWidth="2.4" />
    <path d="M36,20 L36,100" stroke={INK} strokeWidth="2" opacity="0.5" />
    <circle cx="30" cy="66" r="2.6" fill="#F6D96B" stroke={INK} strokeWidth="1.4" />
    <path d="M6,44 A30,30 0 0 1 40,16" fill="none" stroke="#7FB27A" strokeWidth="5" strokeLinecap="round" />
    <circle cx="18" cy="30" r="4" fill="#C9A9E0" /><circle cx="30" cy="20" r="4" fill="#C9A9E0" />
  </g>)
  if (a === 'hanglamp') return S(46, 86, <g>
    <path d="M23,0 L23,30" stroke={INK} strokeWidth="2" />
    <path d="M8,54 C8,40 38,40 38,54 C38,64 30,70 23,70 C16,70 8,64 8,54 Z" fill="#5B8CA8" stroke={INK} strokeWidth="2.4" />
    <g className="vy-flame" style={{ transformOrigin: '23px 48px' }}>
      <path d="M15,52 Q23,30 31,52 Q23,44 15,52Z" fill="#F5A64B" /><path d="M18,52 Q23,38 28,52 Q23,46 18,52Z" fill="#F6D96B" />
    </g>
    <path d="M8,66 C8,76 38,76 38,66" fill="#4A7890" stroke={INK} strokeWidth="2.4" />
  </g>)
  if (a === 'sidelamp') return S(70, 92, <g>
    <path d="M20,92 L50,92 L44,64 L26,64 Z" fill="#8A5A33" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
    <ellipse cx="35" cy="64" rx="20" ry="5" fill="#A97C52" stroke={INK} strokeWidth="2" />
    <rect x="33" y="40" width="4" height="24" fill="#6E5B44" />
    <path d="M22,40 L48,40 L44,20 L26,20 Z" fill="#F2C24E" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
    <path d="M26,30 L44,30" stroke={darken('#F2C24E', 0.12)} strokeWidth="2" opacity="0.6" />
  </g>)
  if (a === 'nightstand') return S(90, 68, <g>
    <rect x="8" y="14" width="74" height="46" rx="6" fill="#2E5A4A" stroke={INK} strokeWidth="2.6" />
    <rect x="16" y="22" width="58" height="14" rx="3" fill="#22463A" stroke={INK} strokeWidth="1.8" />
    <rect x="16" y="40" width="58" height="14" rx="3" fill="#22463A" stroke={INK} strokeWidth="1.8" />
    <path d="M40,29 q5,0 10,0 M40,47 q5,0 10,0" stroke="#E3B24E" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    <path d="M12,60 l-4,8 M78,60 l4,8" stroke={INK} strokeWidth="3" strokeLinecap="round" />
  </g>)
  if (a === 'vase') return S(60, 100, <g>
    <path d="M20,50 C10,42 12,26 30,26 L30,50 Z" fill="#8A5A33" stroke={INK} strokeWidth="2.2" />
    <path d="M18,52 L42,52 L38,96 L22,96 Z" fill="#B5875E" stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
    <path d="M30,52 C30,40 34,26 40,14" stroke="#7A5A3A" strokeWidth="3" fill="none" strokeLinecap="round" />
    {[[40, 14], [34, 24], [44, 26], [30, 36]].map(([x, y], i) => <g key={i}>{[0, 1, 2, 3, 4].map(p => { const ang = p / 5 * Math.PI * 2; return <ellipse key={p} cx={x + Math.cos(ang) * 4} cy={y + Math.sin(ang) * 4} rx="2.4" ry="3.4" transform={`rotate(${ang * 180 / Math.PI + 90} ${x + Math.cos(ang) * 4} ${y + Math.sin(ang) * 4})`} fill="#F7C5D2" stroke={INK} strokeWidth="0.9" /> })}<circle cx={x} cy={y} r="2" fill="#F6D96B" /></g>)}
  </g>)
  if (a === 'fan') return S(70, 66, <g>
    <path d="M35,58 L12,20 A28,28 0 0 1 58,20 Z" fill="#F6C6D6" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
    {[20, 28, 35, 42, 50].map((x, i) => <path key={i} d={`M35,58 L${x},${18 + Math.abs(35 - x) * 0.2}`} stroke="#D98FA8" strokeWidth="1.6" />)}
    <circle cx="35" cy="58" r="4" fill="#B5677F" stroke={INK} strokeWidth="1.8" />
    <path d="M24,30 q4,-4 8,0 M40,28 q4,-4 8,0" stroke="#C56E88" strokeWidth="1.6" fill="none" strokeLinecap="round" />
  </g>)
  if (a === 'clock') return S(60, 60, <g>
    <circle cx="30" cy="30" r="26" fill="#EFE7D4" stroke="#B9A985" strokeWidth="5" />
    <circle cx="30" cy="30" r="20" fill="#FBF6EC" stroke={INK} strokeWidth="1.6" />
    <path d="M30,30 L30,16 M30,30 L40,34" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
    <circle cx="30" cy="30" r="2" fill={INK} />
  </g>)
  if (a === 'art') return S(58, 68, <g>
    <path d="M29,4 L29,10" stroke={INK} strokeWidth="1.6" />
    <rect x="8" y="10" width="42" height="48" rx="4" fill="#EEE6D8" stroke="#B98A6A" strokeWidth="4" />
    <rect x="14" y="16" width="30" height="36" rx="2" fill="#CFE0EF" />
    <path d="M20,30 C18,24 24,22 26,28" stroke="#7A5A3A" strokeWidth="2" fill="none" strokeLinecap="round" />
    {[[26, 24], [22, 20], [30, 22]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="4" fill="#F5B8CE" stroke={INK} strokeWidth="1" />)}
    <path d="M12,58 l4,6 M46,58 l-4,6" stroke="#C9B48E" strokeWidth="2" strokeLinecap="round" />
  </g>)
  return null
}

// ── Planet biomes ──────────────────────────────────────────────
// The landscape of each world, seen through the greenhouse glass. Every planet
// gets its own biome type — forest / ocean / desert / crystal / ice — with a
// distinct sky palette and silhouette so no two feel alike. Type is derived
// from the planet id (see space.js blurbs); unknown ids fall back to forest.
const BIOME_TYPE = { verda: 'forest', cobalt: 'ocean', ember: 'desert', viola: 'crystal', aurora: 'ice' }
const B_STARS = [[24, 26], [58, 16], [118, 30], [176, 20], [248, 34], [292, 18], [206, 46], [150, 52], [88, 42], [300, 56], [40, 60], [270, 66]]

export function Biome({ planet, className = '' }) {
  const type = BIOME_TYPE[planet?.id] || 'forest'
  const uid = useId().replace(/:/g, '')
  const sky = `sky-${uid}`, sea = `sea-${uid}`, sun = `sun-${uid}`
  const Sky = (a, b, c) => (
    <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={a} /><stop offset="0.55" stopColor={b} /><stop offset="1" stopColor={c} />
    </linearGradient>
  )
  const stars = (n = 12) => B_STARS.slice(0, n).map(([x, y], i) => (
    <circle key={i} cx={x} cy={y} r={i % 3 ? 1 : 1.5} fill="#F3ECFB" className="bio-twinkle" style={{ transformOrigin: `${x}px ${y}px`, animationDelay: `${(i % 5) * 0.4}s` }} />
  ))

  let defs = null, body = null
  if (type === 'forest') {
    defs = Sky('#CFEDD9', '#A9DEC2', '#83CBA6')
    body = <g>
      <circle cx="252" cy="46" r="30" fill="#F4F8EC" opacity="0.4" />
      <circle cx="252" cy="46" r="20" fill="#F7FAEF" opacity="0.9" />
      <path d="M0,138 C80,118 165,138 245,122 C282,115 320,126 320,124 L320,200 L0,200 Z" fill="#66BE92" />
      <path d="M0,158 C70,143 150,162 222,150 C270,142 320,155 320,155 L320,200 L0,200 Z" fill="#4EA97C" />
      <path d="M0,176 C60,166 140,182 210,172 C262,165 320,178 320,178 L320,200 L0,200 Z" fill="#3A8A63" />
      {/* foreground fronds */}
      {[[18, 200, 1], [300, 200, -1]].map(([x, y, d], i) => (
        <g key={i} fill="#2C6B4E">
          <path d={`M${x},${y} q${d * -6},-40 ${d * 4},-70 q${d * 10},26 ${d * 2},70 Z`} />
          <path d={`M${x + d * 22},${y} q${d * -4},-30 ${d * 6},-52 q${d * 8},20 ${d * 1},52 Z`} opacity="0.85" />
        </g>
      ))}
      {/* drifting spores */}
      {[[120, 150], [190, 120], [80, 110], [230, 140]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2" fill="#EEF9E8" opacity="0.7" className="bio-twinkle" style={{ transformOrigin: `${x}px ${y}px`, animationDelay: `${i * 0.5}s` }} />
      ))}
    </g>
  } else if (type === 'ocean') {
    defs = <>
      {Sky('#D2E2F6', '#AEC9EF', '#92B8E8')}
      <linearGradient id={sea} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6E97D8" /><stop offset="1" stopColor="#3F6DB2" /></linearGradient>
    </>
    body = <g>
      <circle cx="58" cy="40" r="15" fill="#EFEBDC" /><circle cx="62" cy="36" r="4" fill="#DAD2BC" opacity="0.6" />
      <circle cx="108" cy="56" r="9" fill="#D6DFEE" opacity="0.9" />
      {/* far island */}
      <path d="M214,124 C232,104 258,108 272,124 Z" fill="#47648B" opacity="0.8" />
      {/* sea */}
      <rect x="0" y="122" width="320" height="78" fill={`url(#${sea})`} />
      {/* wave reflections */}
      {[[136, 30], [150, 90], [162, 210], [172, 150], [182, 60], [190, 250]].map(([y, x], i) => (
        <path key={i} d={`M${x - 26},${y} q26,-6 52,0`} stroke="#BAD2F0" strokeWidth="2.4" fill="none" opacity="0.55" strokeLinecap="round" className="bio-wave" style={{ animationDelay: `${(i % 4) * 0.6}s` }} />
      ))}
    </g>
  } else if (type === 'desert') {
    defs = <>
      {Sky('#6E4E7A', '#E7885A', '#F6B45E')}
      <radialGradient id={sun} cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#FCE9B0" /><stop offset="1" stopColor="#F6B45E" stopOpacity="0" /></radialGradient>
    </>
    body = <g>
      {planet?.ring && <g transform="translate(72,44)"><ellipse rx="26" ry="7" fill="none" stroke="#F0C79A" strokeWidth="2" opacity="0.6" transform="rotate(-18)" /><circle r="12" fill="#E8B07C" /></g>}
      <circle cx="160" cy="140" r="60" fill={`url(#${sun})`} />
      <circle cx="160" cy="140" r="34" fill="#FBE3A6" opacity="0.95" />
      {/* dunes */}
      <path d="M0,140 C80,126 150,146 230,132 C280,124 320,138 320,138 L320,200 L0,200 Z" fill="#DA9057" />
      <path d="M0,160 C70,148 160,166 240,152 C285,145 320,158 320,158 L320,200 L0,200 Z" fill="#C1733E" />
      <path d="M0,180 C60,172 150,186 230,176 C280,170 320,182 320,182 L320,200 L0,200 Z" fill="#96552E" />
    </g>
  } else if (type === 'crystal') {
    defs = Sky('#2C2258', '#452F6C', '#634784')
    body = <g>
      {stars(12)}
      {planet?.ring && <g transform="translate(244,42)"><ellipse rx="26" ry="7" fill="none" stroke="#CBB4E6" strokeWidth="2" opacity="0.6" transform="rotate(-18)" /><circle r="13" fill="#B79AD8" /></g>}
      {/* glow behind crystals */}
      <ellipse cx="160" cy="150" rx="150" ry="46" fill="#8E74C0" opacity="0.35" />
      {/* crystal spires */}
      {[[40, 120, 60, '#7C61B4'], [96, 96, 84, '#9A80CC'], [150, 78, 108, '#B79AD8'], [210, 104, 76, '#8B70C2'], [268, 130, 52, '#a98bd6']].map(([x, top, base, c], i) => (
        <path key={i} d={`M${x},200 L${x - 16},${200 - base * 0.9} L${x},${top} L${x + 16},${200 - base * 0.9} Z`} fill={c} stroke={lighten(c, 0.3)} strokeWidth="1.4" opacity="0.95" />
      ))}
      <path d="M0,182 C80,176 240,188 320,180 L320,200 L0,200 Z" fill="#2A2050" />
    </g>
  } else { // ice / aurora
    defs = <>
      {Sky('#1E3350', '#2C5670', '#3E7C84')}
      <linearGradient id={sea} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#C6E8E4" /><stop offset="1" stopColor="#8CC6C4" /></linearGradient>
    </>
    body = <g>
      {stars(10)}
      {/* aurora ribbons */}
      {[['#7FE6C0', 40, 0], ['#8FCFE8', 58, 0.8], ['#A8E6D0', 30, 1.6]].map(([c, y, d], i) => (
        <path key={i} d={`M-10,${y} C70,${y - 22} 150,${y + 20} 230,${y - 14} C280,${y - 26} 330,${y} 330,${y}`}
          stroke={c} strokeWidth="14" fill="none" opacity="0.32" strokeLinecap="round"
          className="bio-aurora" style={{ animationDelay: `${d}s` }} />
      ))}
      {/* ice peaks */}
      <path d="M0,128 L48,96 L92,128 Z" fill="#5F9C9E" /><path d="M64,132 L120,90 L182,132 Z" fill="#6FA9AA" />
      <path d="M150,130 L210,98 L268,130 Z" fill="#5F9C9E" /><path d="M232,132 L286,100 L320,132 L320,132 Z" fill="#6FA9AA" />
      {/* snow caps */}
      <path d="M112,98 l8,8 -16,0 Z" fill="#EAF6F4" opacity="0.9" /><path d="M204,106 l6,6 -12,0 Z" fill="#EAF6F4" opacity="0.9" />
      {/* frozen plain */}
      <rect x="0" y="128" width="320" height="72" fill={`url(#${sea})`} />
      <path d="M40,150 q40,-4 80,2 M180,168 q40,-4 80,2" stroke="#EAF6F4" strokeWidth="2" fill="none" opacity="0.5" strokeLinecap="round" />
    </g>
  }

  return (
    <svg className={className} viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice"
      aria-hidden="true" style={{ display: 'block', width: '100%', height: '100%' }}>
      <defs>{defs}</defs>
      <rect x="0" y="0" width="320" height="200" fill={`url(#${sky})`} />
      {body}
    </svg>
  )
}

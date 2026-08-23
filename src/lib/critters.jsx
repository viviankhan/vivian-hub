// src/lib/critters.jsx
// ─────────────────────────────────────────────────────────────
// Hand-drawn, animated companion art — the illustrated replacement for the
// emoji. Everything is inline SVG so it's crisp at any size, themeable, and
// animated with CSS + a little SMIL, with no image assets to ship.
//
// The "hand-drawn" feel comes from three things working together:
//   • organic, rounded ink strokes over soft gouache-style fills,
//   • a feTurbulence + feDisplacementMap filter whose noise seed is stepped
//     every ~0.5s, which makes every line gently "boil" like frame-by-frame
//     hand animation, and
//   • idle life — a slow sway, blinking eyes, twinkling sparkles.
// All motion is disabled under prefers-reduced-motion.
//
// The companion is ONE growable character (a little sprout creature) whose
// body, leaves and crown change with level, so watching it grow reads as a
// continuous story rather than a jump between unrelated pictures. This same
// drawing kit is what the alien flora/fauna of the "world" will reuse.
// ─────────────────────────────────────────────────────────────
import { useId } from 'react'
import { COMPANION_STAGES } from './wellness.js'

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ── Ink & pigment ──────────────────────────────────────────────
const INK = '#33463C'          // the pen line
const CHEEK = '#E8A79E'

// Per-stage look. Index lines up with COMPANION_STAGES (0..7). The character
// keeps its face and grows: bigger body, more leaves, a crown that opens from a
// sprout → bud → flower → sunflower, and a sparkle aura once it's thriving.
const LOOKS = [
  { crown: 'sprout',    leaves: 0, scale: 0.80, leaf: '#8FBF88', body: '#B6D9A8', bloom: '#F2C6C2', aura: 0 },
  { crown: 'sprout',    leaves: 1, scale: 0.88, leaf: '#84B97F', body: '#AFD59F', bloom: '#F2C6C2', aura: 0 },
  { crown: 'leaves',    leaves: 2, scale: 0.95, leaf: '#7BB176', body: '#A7D096', bloom: '#F2C6C2', aura: 0 },
  { crown: 'bud',       leaves: 2, scale: 1.00, leaf: '#7BB176', body: '#A7D096', bloom: '#F3B6C0', aura: 0 },
  { crown: 'bud',       leaves: 3, scale: 1.05, leaf: '#72A972', body: '#9FCB8E', bloom: '#EF9FB4', aura: 0 },
  { crown: 'flower',    leaves: 3, scale: 1.10, leaf: '#72A972', body: '#9FCB8E', bloom: '#F2A0B8', aura: 1 },
  { crown: 'sunflower', leaves: 4, scale: 1.12, leaf: '#6BA36C', body: '#98C687', bloom: '#F4C24E', aura: 2 },
  { crown: 'blossoms',  leaves: 4, scale: 1.16, leaf: '#6BA36C', body: '#98C687', bloom: '#F2A0B8', aura: 3 },
]

function stageIndex(level) {
  let idx = 0
  COMPANION_STAGES.forEach((s, i) => { if (level >= s.level) idx = i })
  return idx
}

// A single almond leaf with a midrib, placed by the caller's transform.
function Leaf({ x, y, a, s, color }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${a}) scale(${s})`}>
      <path d="M0,0 C7,-6 17,-6 23,0 C17,6 7,6 0,0 Z" fill={color} stroke={INK} strokeWidth="2" />
      <path d="M2,0 L19,0" fill="none" stroke={INK} strokeWidth="1.4" strokeLinecap="round" opacity=".55" />
    </g>
  )
}

// Placements for up to four leaves on the right side; the left side mirrors.
const RIGHT_LEAVES = [
  { x: 74, y: 104, a: 22, s: 1.00 },
  { x: 79, y: 96,  a: 2,  s: 0.86 },
  { x: 76, y: 112, a: 44, s: 0.78 },
  { x: 82, y: 103, a: 18, s: 0.68 },
]

function CompanionLeaves({ count, color }) {
  const right = Math.ceil(count / 2), left = Math.floor(count / 2)
  const els = []
  for (let i = 0; i < right; i++) { const p = RIGHT_LEAVES[i]; els.push(<Leaf key={'r'+i} {...p} color={color} />) }
  for (let i = 0; i < left; i++) { const p = RIGHT_LEAVES[i]; els.push(<Leaf key={'l'+i} x={120 - p.x} y={p.y} a={-p.a} s={p.s} color={color} />) }
  return <g>{els}</g>
}

// The crown that sits on the character's head, opening up as it grows.
function Crown({ kind, bloom }) {
  const cx = 60, cy = 44
  if (kind === 'sprout') {
    return (
      <g>
        <path d={`M60,66 C59,58 59,52 60,${cy}`} fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
        <Leaf x={60} y={cy} a={-52} s={0.7} color="#8FBF88" />
        <Leaf x={60} y={cy} a={-128} s={0.7} color="#8FBF88" />
      </g>
    )
  }
  if (kind === 'leaves') {
    return (
      <g>
        <path d={`M60,66 C59,58 59,52 60,${cy}`} fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
        <Leaf x={60} y={cy} a={-90} s={0.85} color="#7BB176" />
        <Leaf x={60} y={cy + 2} a={-46} s={0.72} color="#84B97F" />
        <Leaf x={60} y={cy + 2} a={-134} s={0.72} color="#84B97F" />
      </g>
    )
  }
  if (kind === 'bud') {
    return (
      <g>
        <path d="M60,66 C59,58 59,52 60,46" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
        <path d="M60,46 C50,44 50,30 60,26 C70,30 70,44 60,46 Z" fill={bloom} stroke={INK} strokeWidth="2.2" />
        <path d="M60,46 C55,44 55,33 60,30 C58,36 58,42 60,46 Z" fill="#7BB176" stroke={INK} strokeWidth="1.6" />
      </g>
    )
  }
  const petals = kind === 'sunflower' ? 12 : 5
  const rp = kind === 'sunflower' ? 15 : 13
  const center = kind === 'sunflower' ? '#8A5A33' : '#F6D96B'
  return (
    <g>
      <path d="M60,66 C59,58 59,52 60,48" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
      {Array.from({ length: petals }).map((_, i) => {
        const ang = (i / petals) * Math.PI * 2
        const px = cx + Math.cos(ang) * rp, py = cy + Math.sin(ang) * rp
        return <ellipse key={i} cx={px} cy={py} rx={kind === 'sunflower' ? 5.4 : 8} ry={kind === 'sunflower' ? 9 : 11}
          transform={`rotate(${(ang * 180) / Math.PI + 90} ${px} ${py})`}
          fill={bloom} stroke={INK} strokeWidth="1.9" />
      })}
      <circle cx={cx} cy={cy} r={kind === 'sunflower' ? 9 : 7.5} fill={center} stroke={INK} strokeWidth="2" />
      {kind === 'blossoms' && [[36, 40], [86, 42], [30, 66], [92, 66]].map(([x, y], i) => (
        <g key={i}>
          {Array.from({ length: 5 }).map((_, p) => {
            const ang = (p / 5) * Math.PI * 2
            return <ellipse key={p} cx={x + Math.cos(ang) * 5} cy={y + Math.sin(ang) * 5} rx="2.6" ry="4"
              transform={`rotate(${(ang * 180) / Math.PI + 90} ${x + Math.cos(ang) * 5} ${y + Math.sin(ang) * 5})`}
              fill="#F7C5D2" stroke={INK} strokeWidth="1.1" />
          })}
          <circle cx={x} cy={y} r="2.4" fill="#F6D96B" stroke={INK} strokeWidth="1.1" />
        </g>
      ))}
    </g>
  )
}

// The face — eyes that blink, cheeks, and a mouth curved by mood (1..5).
function Face({ mood }) {
  const m = mood || 4
  // Control-point offset for the mouth: positive = smile, negative = frown.
  const curve = ({ 1: -5, 2: -2, 3: 1.5, 4: 5, 5: 7 })[m] ?? 5
  const blush = m >= 4 ? 0.6 : 0.4
  return (
    <g>
      {/* eyes (the .crit-eye class blinks them) */}
      <g className="crit-eye" style={{ transformOrigin: '52px 90px' }}>
        <ellipse cx="52" cy="90" rx="3.1" ry="3.7" fill={INK} />
        <circle cx="53.2" cy="88.6" r="1.05" fill="#fff" />
      </g>
      <g className="crit-eye" style={{ transformOrigin: '68px 90px' }}>
        <ellipse cx="68" cy="90" rx="3.1" ry="3.7" fill={INK} />
        <circle cx="69.2" cy="88.6" r="1.05" fill="#fff" />
      </g>
      <ellipse cx="45" cy="98" rx="4.6" ry="3" fill={CHEEK} opacity={blush} />
      <ellipse cx="75" cy="98" rx="4.6" ry="3" fill={CHEEK} opacity={blush} />
      <path d={`M53,99 Q60,${99 + curve} 67,99`} fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
    </g>
  )
}

// A four-point twinkle used for the "thriving" aura.
function Sparkle({ x, y, s, delay }) {
  return (
    <path className="crit-twinkle" style={{ animationDelay: `${delay}s`, transformOrigin: `${x}px ${y}px` }}
      d={`M${x},${y - 6*s} Q${x + 1.4*s},${y - 1.4*s} ${x + 6*s},${y} Q${x + 1.4*s},${y + 1.4*s} ${x},${y + 6*s} Q${x - 1.4*s},${y + 1.4*s} ${x - 6*s},${y} Q${x - 1.4*s},${y - 1.4*s} ${x},${y - 6*s} Z`}
      fill="#FBE79E" stroke={INK} strokeWidth="1" />
  )
}

// The companion. `level` drives the growth stage; `mood` (1..5) curves the
// smile; `size` is the rendered px width.
export function Companion({ level = 1, mood, size = 96, className = '' }) {
  const fid = useId().replace(/:/g, '')
  const reduced = prefersReduced()
  const look = LOOKS[stageIndex(level)] || LOOKS[0]
  const auraPts = [
    { x: 30, y: 40, s: 1.1, d: 0 }, { x: 92, y: 46, s: 0.9, d: 0.6 },
    { x: 24, y: 70, s: 0.8, d: 1.1 }, { x: 98, y: 74, s: 1.0, d: 0.3 },
  ].slice(0, look.aura)
  return (
    <svg viewBox="0 0 120 130" width={size} height={size} className={`crit ${className}`}
      role="img" aria-label={`Companion, level ${level}`} style={{ overflow: 'visible' }}>
      <defs>
        <filter id={`boil-${fid}`} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="1" seed="2" result="noise">
            {!reduced && <animate attributeName="seed" values="2;5;8;3" dur="0.5s" calcMode="discrete" repeatCount="indefinite" />}
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <g filter={`url(#boil-${fid})`}>
        <g className={reduced ? '' : 'crit-sway'} style={{ transformOrigin: '60px 120px' }}>
          <g transform={`translate(60 120) scale(${look.scale}) translate(-60 -120)`}>
            {auraPts.map((p, i) => <Sparkle key={i} {...p} delay={p.d} />)}
            <CompanionLeaves count={look.leaves} color={look.leaf} />
            <Crown kind={look.crown} bloom={look.bloom} />
            {/* body */}
            <path d="M60,116 C40,116 33,102 34,90 C35,74 46,66 60,66 C74,66 85,74 86,90 C87,102 80,116 60,116 Z"
              fill={look.body} stroke={INK} strokeWidth="2.6" />
            {/* a soft belly highlight */}
            <path d="M48,104 C46,96 50,88 60,87" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity=".35" />
            <Face mood={mood} />
          </g>
        </g>
      </g>
    </svg>
  )
}

// ── Hand-drawn mood faces (the check-in picker) ────────────────
// Small static ink faces so the whole tab drops emoji, not just the companion.
const MOOD_FACE = {
  1: { fill: '#E7C3C7', curve: -6, brow: true },
  2: { fill: '#EAD0CE', curve: -3, brow: false },
  3: { fill: '#EFE0C4', curve: 0.5, brow: false },
  4: { fill: '#CFE3D6', curve: 5, brow: false },
  5: { fill: '#BFE0CB', curve: 8, brow: false, happyEyes: true },
}
export function MoodFace({ v = 3, size = 30 }) {
  const f = MOOD_FACE[v] || MOOD_FACE[3]
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true" style={{ display: 'block' }}>
      <circle cx="20" cy="20" r="15" fill={f.fill} stroke={INK} strokeWidth="2.2" />
      {f.happyEyes ? (
        <>
          <path d="M12,19 Q15,15 18,19" fill="none" stroke={INK} strokeWidth="2.1" strokeLinecap="round" />
          <path d="M22,19 Q25,15 28,19" fill="none" stroke={INK} strokeWidth="2.1" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="15" cy="18" r="1.9" fill={INK} />
          <circle cx="25" cy="18" r="1.9" fill={INK} />
        </>
      )}
      {f.brow && (
        <>
          <path d="M12,14 L18,16" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M28,14 L22,16" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
      <path d={`M13,26 Q20,${26 + f.curve} 27,26`} fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

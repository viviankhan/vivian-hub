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
import { COMPANION_STAGES, emotionMeta } from './wellness.js'

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

// ── Watercolor mood clouds (the check-in picker + day summary) ──
// Soft Quabble-style clouds — no hard outline, a pastel fill that pools darker
// toward the bottom, rosy cheeks, and simple ink features. A single MoodCloud is
// one mood; the DayCloud blends a whole day's moods in proportion to time. Both
// can carry "linings": a translucent shimmer of complex-emotion colors around
// the cloud's edge.
const FEAT = '#37332C'   // the soft-black ink for features

// A tiny seeded RNG so each blob's wobble is fixed (same face every render).
function seeded(seed) {
  let s = (seed >>> 0) || 1
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}
// Each mood is a genuinely different cloud, built as a cluster of overlapping
// puffs (a wide flat base + a row of round bumps on top) — which reads as a real
// fluffy cloud. The mood sets how wide/tall it sits and how many puffs it has,
// so a rough day is a low wide cloud and a great day is a big, tall, many-puffed
// one — echoing the mood-blob shapes.
//   lobes: number of top puffs · w/h: horizontal / vertical scale
const SHAPES = {
  1: { lobes: 3, w: 1.14, h: 0.80, seed: 7 },   // rough — low, wide, sagging
  2: { lobes: 3, w: 1.06, h: 0.90, seed: 23 },  // low — lumpy, uneven
  3: { lobes: 3, w: 1.00, h: 0.98, seed: 41 },  // okay — plain, balanced
  4: { lobes: 4, w: 1.06, h: 1.02, seed: 5 },   // good — full and round
  5: { lobes: 5, w: 1.10, h: 1.08, seed: 63 },  // great — big, tall, fluffy
}

// Build a cloud as a list of overlapping ellipses ("puffs"). Filled with one
// colour they merge into a single soft cloud silhouette; the same list also
// serves as the clip region for the watercolor washes.
function cloudPuffs(shape) {
  const { lobes, w, h, seed } = shape
  const rnd = seeded(seed)
  const cx = 50
  const halfW = 25 * w
  const puffs = [
    { cx, cy: 60, rx: halfW * 1.02, ry: 13 * h },                       // wide base
    { cx: cx - halfW * 0.62, cy: 57, rx: 12 * w, ry: 12 * h },          // left shoulder
    { cx: cx + halfW * 0.62, cy: 57, rx: 12 * w, ry: 12 * h },          // right shoulder
  ]
  for (let i = 0; i < lobes; i++) {
    const t = lobes === 1 ? 0.5 : i / (lobes - 1)
    const mid = Math.sin(Math.PI * t)                                   // fatter in the middle
    const x = cx - halfW * 0.82 + t * halfW * 1.64
    const r = (8.5 + 6.5 * mid) * h * (0.9 + rnd() * 0.2)
    const y = 49 - mid * 8 * h + (rnd() - 0.5) * 3
    puffs.push({ cx: x, cy: y, rx: r, ry: r * 0.96 })
  }
  return puffs
}
function Puffs({ puffs, fill, fillOpacity }) {
  return <>{puffs.map((p, i) => <ellipse key={i} cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} fill={fill} fillOpacity={fillOpacity} />)}</>
}

// Mix a hex color toward white by t (0..1) — for the pale, glimmering lining
// that reads lighter than the cloud itself.
function lighten(hex, t) {
  const n = (hex || '#ffffff').replace('#', '')
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16)
  const m = v => Math.round(v + (255 - v) * t).toString(16).padStart(2, '0')
  return `#${m(r)}${m(g)}${m(b)}`
}
// A small four-point sparkle centred at (x,y).
function starPath(x, y, r) {
  const t = r * 0.32
  return `M${x},${y - r} Q${x + t},${y - t} ${x + r},${y} Q${x + t},${y + t} ${x},${y + r} Q${x - t},${y + t} ${x - r},${y} Q${x - t},${y - t} ${x},${y - r} Z`
}

// Per-mood pigment + which features to draw. Colors follow the Quabble palette,
// mapped onto Bloom's 1..5 scale (rough→great).
const BLOBS = {
  1: { seed: 7,  sq: 1.08, fill: '#BFDDF3', pool: '#A4CBEA', cheek: '#A9CFEE', cheekO: 0.0, eyes: 'dots',    mouth: 'worry' },
  2: { seed: 23, sq: 0.94, fill: '#CBB9EC', pool: '#B29BE1', cheek: '#B29BE1', cheekO: 0.5, eyes: 'annoyed', mouth: 'frown' },
  3: { seed: 41, sq: 1.00, fill: '#F5D9A6', pool: '#EECB8B', cheek: '#EFC98A', cheekO: 0.0, eyes: 'dots',    mouth: 'flat'  },
  4: { seed: 5,  sq: 0.98, fill: '#F6BAD0', pool: '#EFA3BD', cheek: '#EE97B6', cheekO: 0.85, eyes: 'happy',  mouth: 'smile' },
  5: { seed: 63, sq: 0.95, fill: '#BEE0A2', pool: '#A6D188', cheek: '#A6D188', cheekO: 0.3, eyes: 'squish',  mouth: 'grin'  },
}

function Eyes({ kind }) {
  const s = { fill: 'none', stroke: FEAT, strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (kind === 'dots') return <>
    <circle cx="38" cy="49" r="2.9" fill={FEAT} /><circle cx="62" cy="49" r="2.9" fill={FEAT} />
  </>
  if (kind === 'annoyed') return <>
    <path d="M33,47 L44,50" {...s} /><path d="M67,47 L56,50" {...s} />
  </>
  if (kind === 'happy') return <>
    <path d="M33,50 Q38.5,45 44,50" {...s} /><path d="M56,50 Q61.5,45 67,50" {...s} />
  </>
  if (kind === 'squish') return <>
    <path d="M34,45 L41,49 L34,53" {...s} /><path d="M66,45 L59,49 L66,53" {...s} />
  </>
  return <><circle cx="38" cy="49" r="2.9" fill={FEAT} /><circle cx="62" cy="49" r="2.9" fill={FEAT} /></>
}
function Mouth({ kind }) {
  const s = { fill: 'none', stroke: FEAT, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (kind === 'worry') return <path d="M41,63 q3,-4 6,0 q3,4 6,0 q3,-4 6,0" strokeWidth="2.6" {...s} />
  if (kind === 'frown') return <path d="M40,66 Q50,59 60,66" strokeWidth="2.8" {...s} />
  if (kind === 'flat')  return <path d="M45,63 Q50,66 55,63" strokeWidth="2.6" {...s} />
  if (kind === 'smile') return <path d="M42,62 Q50,69 58,62" strokeWidth="2.8" {...s} />
  if (kind === 'grin')  return <path d="M39,60 Q50,74 61,60" strokeWidth="3.4" {...s} />
  return <path d="M45,63 Q50,66 55,63" strokeWidth="2.6" {...s} />
}

// The emotion "lining": a ring of pale, glimmering sparkles that twinkle right
// on the cloud's rim. Each is a light tint of a complex-emotion colour (lighter
// than the cloud), with a white core for the glimmer; they twinkle out of sync.
// Rendered in FRONT of the cloud so the sparkle reads on the border.
// The emotion "lining": a fine, dispersed star-mist enveloping the cloud like a
// little milky way. Many tiny points — mostly white, some light tints of the
// day's complex-emotion colours — scattered in a halo around (and softly over)
// the cloud, biased toward a band near its edge, twinkling out of sync. A few
// get four-point glints. The face zone is kept clear.
function StarMist({ emotions, count = 44, seed = 1 }) {
  if (!emotions || !emotions.length) return null
  const cols = emotions.slice(0, 4).map(id => emotionMeta(id)?.color).filter(Boolean)
  if (!cols.length) return null
  const light = cols.map(c => lighten(c, 0.62))
  const rnd = seeded(seed * 131 + count)
  const cx = 50, cy = 52, TAU = Math.PI * 2
  const marks = []
  let tries = 0
  while (marks.length < count && tries < count * 4) {
    tries++
    const ang = rnd() * TAU
    const rr = 20 + rnd() * rnd() * 34                 // biased inward, misty tail outward
    const x = cx + Math.cos(ang) * rr * 1.1
    const y = cy + Math.sin(ang) * rr * 0.9 - 2
    if (Math.abs(x - 50) < 15 && y > 42 && y < 66) continue   // keep the face clear
    const size = 0.3 + rnd() * rnd() * 1.5             // mostly tiny, a few bigger
    marks.push({
      x, y, size,
      op: 0.3 + rnd() * 0.6,
      col: rnd() < 0.62 ? '#ffffff' : light[Math.floor(rnd() * light.length)],
      star: rnd() < 0.22,
      tw: rnd() < 0.85,
      delay: (rnd() * 3.4).toFixed(2),
    })
  }
  return (
    <g>
      {marks.map((m, k) => (
        <g key={k} className={m.tw ? 'crit-twinkle' : ''}
          style={m.tw ? { transformOrigin: `${m.x}px ${m.y}px`, animationDelay: `${m.delay}s` } : undefined}>
          {m.star
            ? <path d={starPath(m.x, m.y, m.size * 1.9)} fill={m.col} opacity={m.op} />
            : <circle cx={m.x} cy={m.y} r={m.size} fill={m.col} opacity={m.op} />}
        </g>
      ))}
    </g>
  )
}

// The soft, translucent watercolor interior of a cloud: a lighter wash up top
// and a darker pool at the base (plus cheeks), clipped inside the puffs.
function Watercolor({ clipId, blurId, top, pool, cheek, cheekO }) {
  return (
    <g clipPath={`url(#${clipId})`}>
      <ellipse cx="50" cy="40" rx="44" ry="24" fill={top} opacity="0.5" filter={`url(#${blurId})`} />
      <ellipse cx="50" cy="72" rx="46" ry="20" fill={pool} opacity="0.5" filter={`url(#${blurId})`} />
      {cheek && (<>
        <ellipse cx="32" cy="58" rx="11" ry="8" fill={cheek} opacity={cheekO} filter={`url(#${blurId})`} />
        <ellipse cx="68" cy="58" rx="11" ry="8" fill={cheek} opacity={cheekO} filter={`url(#${blurId})`} />
      </>)}
    </g>
  )
}

// A single mood cloud. `v` is the mood (1..5); `emotions` add the star-mist
// lining; `size` is the rendered px.
export function MoodCloud({ v = 3, size = 40, emotions = [], animate = false }) {
  const uid = useId().replace(/:/g, '')
  const b = BLOBS[v] || BLOBS[3]
  const puffs = cloudPuffs(SHAPES[v] || SHAPES[3])
  const reduced = prefersReduced()
  const blurId = `bs-${uid}`, clipId = `bc-${uid}`
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <clipPath id={clipId}>{puffs.map((p, i) => <ellipse key={i} cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} />)}</clipPath>
        <filter id={blurId} x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="3" /></filter>
      </defs>
      <g className={animate && !reduced ? 'crit-breathe' : ''} style={{ transformOrigin: '50px 82px' }}>
        <Puffs puffs={puffs} fill={b.fill} fillOpacity="0.82" />
        <Watercolor clipId={clipId} blurId={blurId} top={lighten(b.fill, 0.32)} pool={b.pool} cheek={b.cheek} cheekO={b.cheekO} />
        <Eyes kind={b.eyes} />
        <Mouth kind={b.mouth} />
        <StarMist emotions={emotions} count={16} seed={v * 7 + 1} />
      </g>
    </svg>
  )
}
// Back-compat alias — earlier code imported this as MoodFace.
export { MoodCloud as MoodFace }

// The end-of-day cloud: the day's moods blended left→right in proportion to how
// long each was present (a soft watercolor gradient). Its shape and pigments
// follow the dominant mood, its FACE reflects the overall (time-weighted) mood,
// and it's enveloped in the day's sparkling star-mist.
//   segments: [{ v, pct }] ordered through the day (pct sums to ~1)
export function DayCloud({ segments = [], emotions = [], dominant = 3, faceMood = null, size = 120, animate = true, face = true }) {
  const uid = useId().replace(/:/g, '')
  const dom = dominant || 3
  const b = BLOBS[dom] || BLOBS[3]
  const fb = BLOBS[faceMood || dom] || b       // whose expression the face wears
  const puffs = cloudPuffs(SHAPES[dom] || SHAPES[3])
  const reduced = prefersReduced()
  const blurId = `bs-${uid}`, gradId = `bg-${uid}`, clipId = `bc-${uid}`
  let acc = 0
  const stops = segments.map(s => { const center = acc + s.pct / 2; acc += s.pct; return { o: center, c: (BLOBS[s.v] || BLOBS[3]).fill } })
  const fill = stops.length ? `url(#${gradId})` : b.fill
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <clipPath id={clipId}>{puffs.map((p, i) => <ellipse key={i} cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} />)}</clipPath>
        <filter id={blurId} x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="3" /></filter>
        {stops.length > 0 && (
          // userSpaceOnUse so one continuous blend spans all the puffs.
          <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1="22" y1="0" x2="78" y2="0">
            <stop offset="0" stopColor={stops[0].c} />
            {stops.map((s, i) => <stop key={i} offset={s.o} stopColor={s.c} />)}
            <stop offset="1" stopColor={stops[stops.length - 1].c} />
          </linearGradient>
        )}
      </defs>
      <g className={animate && !reduced ? 'crit-breathe' : ''} style={{ transformOrigin: '50px 82px' }}>
        <Puffs puffs={puffs} fill={fill} fillOpacity="0.8" />
        <Watercolor clipId={clipId} blurId={blurId} top={lighten(b.fill, 0.34)} pool={b.pool} />
        {face && <><Eyes kind={fb.eyes} /><Mouth kind={fb.mouth} /></>}
        <StarMist emotions={emotions} count={46} seed={dom * 13 + 3} />
      </g>
    </svg>
  )
}

// ── The alien sky ──────────────────────────────────────────────
// A dusky backdrop the mood cloud floats in — a violet gradient, a scatter of
// twinkling stars, a distant ringed planet, a little moon and a soft alien
// horizon. Fills its container (slice-scaled). The first piece of the "world".
const SKY_STARS = [
  [24, 26, 1.1, 0], [58, 18, 0.8, 0.6], [96, 34, 1.0, 1.2], [140, 22, 0.7, 0.3],
  [182, 40, 0.9, 0.9], [214, 20, 1.1, 1.6], [40, 60, 0.7, 0.4], [120, 62, 0.8, 1.1],
  [166, 74, 0.7, 0.2], [270, 92, 0.9, 0.7], [300, 60, 0.8, 1.4], [86, 96, 0.7, 0.5],
]
export function AlienSky({ className = '' }) {
  const uid = useId().replace(/:/g, '')
  const reduced = prefersReduced()
  return (
    <svg className={className} viewBox="0 0 320 170" preserveAspectRatio="xMidYMid slice"
      aria-hidden="true" style={{ display: 'block', width: '100%', height: '100%' }}>
      <defs>
        <linearGradient id={`sky-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#241A47" />
          <stop offset="0.55" stopColor="#3B2A63" />
          <stop offset="1" stopColor="#5A3F72" />
        </linearGradient>
        <radialGradient id={`plan-${uid}`} cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#F0A9C9" />
          <stop offset="1" stopColor="#B25C93" />
        </radialGradient>
        <radialGradient id={`glow-${uid}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#8E6FB8" stopOpacity="0.55" />
          <stop offset="1" stopColor="#8E6FB8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="320" height="170" fill={`url(#sky-${uid})`} />
      {/* stars */}
      {SKY_STARS.map(([x, y, r, d], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#F3ECFB"
          className={reduced ? '' : 'crit-twinkle'} style={{ transformOrigin: `${x}px ${y}px`, animationDelay: `${d}s` }} />
      ))}
      {/* distant ringed planet */}
      <g>
        <circle cx="264" cy="44" r="34" fill={`url(#glow-${uid})`} />
        <circle cx="264" cy="44" r="20" fill={`url(#plan-${uid})`} />
        <ellipse cx="264" cy="44" rx="32" ry="9" fill="none" stroke="#E9BFD8" strokeWidth="2.4" opacity="0.7" transform="rotate(-18 264 44)" />
      </g>
      {/* little moon */}
      <circle cx="46" cy="34" r="8" fill="#EDE6D2" />
      <circle cx="49" cy="31" r="2" fill="#D9CFB4" opacity="0.7" />
      {/* soft alien horizon */}
      <path d="M0,150 C60,132 110,148 170,140 C230,132 280,150 320,138 L320,170 L0,170 Z" fill="#3A2A58" opacity="0.85" />
      <path d="M0,158 C70,146 120,160 190,152 C250,146 290,160 320,152 L320,170 L0,170 Z" fill="#2C2047" />
    </svg>
  )
}

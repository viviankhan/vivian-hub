// src/components/SeasonalEffects.jsx
// A calm ambient motion layer that matches the active look. It's deliberately
// slow and low-contrast so it reads as atmosphere, never distraction. Each
// season drifts its own thing:
//   • bloom  — translucent iridescent bubbles rising, swaying
//   • spring — soft petals drifting down
//   • summer — green leaves + a few dandelion puffs
//   • fall   — an assortment of maple & oak leaves in red/orange/yellow
//   • winter — six-fold snowflakes (and the odd snow speck)
// It sits behind sheets/modals, never blocks taps, and renders nothing at all
// when the device asks for reduced motion.
import { useMemo } from 'react'

const rnd = (a, b) => a + Math.random() * (b - a)
const pick = arr => arr[Math.floor(Math.random() * arr.length)]

// Per-effect look. `kinds` are the shape variants that effect draws from (one is
// picked per particle); durations are long on purpose (slow drift) and
// opacities stay low (unobtrusive).
const EFFECTS = {
  // Spring — pastel petals.
  petals: { count: 13, size: [12, 20], mode: 'fall', dur: [20, 34], op: [0.30, 0.52],
    kinds: ['petal'], colors: ['#F4A6C0', '#F6C6D4', '#EBB6E4', '#F7D9E4', '#F2B8CE', '#E7C7F0'] },
  // Summer — green leaves with a scatter of dandelion puffs.
  greenleaves: { count: 13, size: [12, 20], mode: 'fall', dur: [22, 38], op: [0.30, 0.52],
    kinds: ['leaf', 'leaf', 'leaf', 'dandelion'], colors: ['#6FA84E', '#84B85C', '#5C9A46', '#A6C97E', '#8FBF63'] },
  // Fall — maple + oak leaves in an autumn palette (red, rust, orange, gold).
  leaves: { count: 15, size: [13, 22], mode: 'fall', dur: [18, 32], op: [0.34, 0.56],
    kinds: ['maple', 'oak', 'maple', 'leaf'], colors: ['#C8452E', '#E0692F', '#E8A32E', '#D98A2B', '#B8632E', '#CF7A3A', '#E6B84A', '#A83C28'] },
  // Winter — six-fold snowflakes with an occasional soft speck.
  snow: { count: 20, size: [8, 16], mode: 'fall', dur: [22, 40], op: [0.5, 0.85],
    kinds: ['flake', 'flake', 'flake', 'dot'], colors: ['#FFFFFF', '#EAF2FA', '#E3EEF8'] },
  bubbles: { count: 12, size: [16, 46], mode: 'bubble', dur: [20, 34], op: [0.26, 0.5],
    kinds: ['bubble'], colors: ['iris'] },
}

// A soap-bubble: translucent, with a soft white highlight and an iridescent rim.
function bubbleStyle(size) {
  return {
    display: 'block', width: size, height: size, borderRadius: '50%',
    background:
      'radial-gradient(circle at 30% 26%, rgba(255,255,255,.9) 0%, rgba(255,255,255,.12) 26%, rgba(255,255,255,0) 44%),' +
      'conic-gradient(from 200deg, rgba(255,183,210,.32), rgba(255,236,179,.28), rgba(183,255,214,.28), rgba(183,214,255,.34), rgba(226,183,255,.30), rgba(255,183,210,.32))',
    border: '1px solid rgba(255,255,255,.45)',
    boxShadow: 'inset 0 0 10px rgba(255,255,255,.55), 0 0 8px rgba(255,255,255,.28)',
  }
}

// ── Shape silhouettes (all self-contained SVG) ────────────────
// A single soft petal — a rounded teardrop, wider up top and tapering down.
function Petal({ size, color }) {
  return (
    <span style={{
      display: 'block', width: size, height: Math.round(size * 0.72), background: color,
      borderRadius: '52% 52% 52% 52% / 62% 62% 40% 40%',
    }} />
  )
}
function SimpleLeaf({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M12 2c5 3 8 7 8 12 0 4-3 8-8 8-1-6 0-12 3-16-4 2-7 6-8 11-1-4 0-11 5-15Z" />
    </svg>
  )
}
function MapleLeaf({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M12 1.6l1.5 3.6 2.9-1.6-1.1 3.4 3.9-.6-2.6 2.7 3.6 1.6-3.7 1 1.7 3.3-3.6-1.4-.3 3.9-1.8-2.6v5.1h-1v-5.1l-1.8 2.6-.3-3.9-3.6 1.4 1.7-3.3-3.7-1 3.6-1.6-2.6-2.7 3.9.6-1.1-3.4 2.9 1.6z" />
    </svg>
  )
}
function OakLeaf({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M12 2c.7 1.3 1.6 1.4 2.6.7-.3 1.4.5 2 1.7 1.7-.6 1.3.2 2 1.5 2-1 1-1 1.8.2 2.4-1.2.5-1.2 1.4-.2 2.2-1.3.1-1.6 1-1 2.2-1.3-.5-1.9.2-1.8 1.7-1-.8-1.9-.5-2.5.8-.6-1.3-1.5-1.6-2.5-.8.1-1.5-.5-2.2-1.8-1.7.6-1.2.3-2.1-1-2.2 1-.8 1-1.7-.2-2.2 1.2-.6 1.2-1.4.2-2.4 1.3 0 2.1-.7 1.5-2 1.2.3 2-.3 1.7-1.7 1 .7 1.9.6 2.6-.7z" />
      <rect x="11.5" y="16" width="1" height="6" rx="0.5" />
    </svg>
  )
}
function Snowflake({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round">
      <g>
        <path d="M12 2v20M3.34 7l17.32 10M20.66 7L3.34 17" />
        <path d="M12 5.5l-2 1.6M12 5.5l2 1.6M12 18.5l-2-1.6M12 18.5l2 1.6" />
        <path d="M5.4 8.2l.3 2.5M5.4 8.2l2.4-.7M18.6 15.8l-.3-2.5M18.6 15.8l-2.4.7" />
        <path d="M18.6 8.2l-.3 2.5M18.6 8.2l-2.4-.7M5.4 15.8l.3-2.5M5.4 15.8l2.4.7" />
      </g>
    </svg>
  )
}
function Dandelion({ size, color }) {
  // A soft dandelion seed puff — a pale core with radiating filaments.
  const spokes = Array.from({ length: 10 }, (_, i) => (i * 36) * Math.PI / 180)
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      stroke="rgba(255,255,255,.85)" strokeWidth="0.8" strokeLinecap="round">
      {spokes.map((a, i) => (
        <line key={i} x1="12" y1="12" x2={12 + Math.cos(a) * 9} y2={12 + Math.sin(a) * 9} />
      ))}
      {spokes.map((a, i) => (
        <circle key={'d' + i} cx={12 + Math.cos(a) * 9} cy={12 + Math.sin(a) * 9} r="1.1" fill="rgba(255,255,255,.9)" stroke="none" />
      ))}
      <circle cx="12" cy="12" r="1.7" fill={color} stroke="none" />
    </svg>
  )
}

function Shape({ kind, size, color }) {
  switch (kind) {
    case 'bubble':    return <span style={bubbleStyle(size)} />
    case 'petal':     return <Petal size={size} color={color} />
    case 'maple':     return <MapleLeaf size={size} color={color} />
    case 'oak':       return <OakLeaf size={size} color={color} />
    case 'leaf':      return <SimpleLeaf size={size} color={color} />
    case 'flake':     return <Snowflake size={size} color={color} />
    case 'dandelion': return <Dandelion size={size} color={color} />
    case 'dot':
    default:
      return <span style={{ display:'block', width:size, height:size, borderRadius:'50%', background:color, boxShadow:`0 0 ${size/2}px rgba(255,255,255,.7)` }} />
  }
}

export default function SeasonalEffects({ effect }) {
  const cfg = effect && EFFECTS[effect]
  const reduce = typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // Freeze the particle set per effect so it doesn't reshuffle every render.
  const particles = useMemo(() => {
    if (!cfg) return []
    return Array.from({ length: cfg.count }, (_, i) => ({
      key: i,
      left: rnd(0, 100),
      size: Math.round(rnd(cfg.size[0], cfg.size[1])),
      dur: rnd(cfg.dur[0], cfg.dur[1]),
      swayDur: rnd(4, 8),
      delay: rnd(-24, 0),
      op: rnd(cfg.op[0], cfg.op[1]),
      color: pick(cfg.colors),
      kind: pick(cfg.kinds),
    }))
  }, [effect]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!cfg || reduce) return null

  const wrap = { position:'fixed', inset:0, zIndex:40, pointerEvents:'none', overflow:'hidden' }

  // Bubbles — rise from the bottom (outer) while gently swaying (inner).
  if (cfg.mode === 'bubble') {
    return (
      <div aria-hidden="true" style={wrap}>
        {particles.map(p => (
          <div key={p.key} style={{
            position:'absolute', bottom:'-14vh', left:`${p.left}%`, '--pk': p.op, willChange:'transform, opacity',
            animation:`bubble-rise ${p.dur}s linear ${p.delay}s infinite`,
          }}>
            <div style={{ animation:`bubble-sway ${p.swayDur}s ease-in-out infinite alternate` }}>
              <Shape kind="bubble" size={p.size} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Falling blossoms / leaves / snowflakes.
  return (
    <div aria-hidden="true" style={wrap}>
      {particles.map(p => (
        <div key={p.key} style={{
          position:'absolute', top:'-8vh', left:`${p.left}%`, opacity:p.op, willChange:'transform',
          animation:`season-fall ${p.dur}s linear ${p.delay}s infinite`,
        }}>
          <Shape kind={p.kind} size={p.size} color={p.color} />
        </div>
      ))}
    </div>
  )
}

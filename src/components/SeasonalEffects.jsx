// src/components/SeasonalEffects.jsx
// A calm ambient motion layer that matches the active look. It's deliberately
// slow and low-contrast so it reads as atmosphere, never distraction:
//   • bloom  — translucent iridescent bubbles drifting up, waving side to side
//   • spring — drifting petals
//   • summer — dappled sunlight through leaves (soft, breathing light blotches)
//   • fall   — falling leaves
//   • winter — snow
// It sits behind sheets/modals, never blocks taps, and renders nothing at all
// when the device asks for reduced motion.
import { useMemo } from 'react'

const rnd = (a, b) => a + Math.random() * (b - a)
const pick = arr => arr[Math.floor(Math.random() * arr.length)]

// Per-effect look. `mode` picks how a particle moves/renders; durations are long
// on purpose (slow drift), and opacities stay low (unobtrusive).
const EFFECTS = {
  petals:  { count: 12, size: [10, 17], mode: 'fall',   dur: [18, 30], op: [0.26, 0.48], colors: ['#F6C6D4', '#F1BFCE', '#EFD3DE', '#FBE6EC'] },
  leaves:  { count: 12, size: [12, 20], mode: 'fall',   dur: [18, 32], op: [0.30, 0.52], colors: ['#D2814B', '#C85A3A', '#E0A24E', '#B8632E'] },
  snow:    { count: 18, size: [4, 9],   mode: 'fall',   dur: [22, 38], op: [0.34, 0.60], colors: ['#FFFFFF', '#EAF2FA', '#E3EEF8'] },
  bubbles: { count: 12, size: [16, 46], mode: 'bubble', dur: [20, 34], op: [0.26, 0.5],  colors: ['iris'] },
  dapple:  { count: 8,  size: [90, 190],mode: 'dapple', dur: [11, 20], op: [0.16, 0.36], colors: ['#FFF3BE', '#FFFFFF', '#EAF3C4'] },
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

function Shape({ effect, size, color }) {
  if (effect === 'bubbles') return <span style={bubbleStyle(size)} />
  if (effect === 'leaves') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
        <path d="M12 2c5 3 8 7 8 12 0 4-3 8-8 8-1-6 0-12 3-16-4 2-7 6-8 11-1-4 0-11 5-15Z" />
      </svg>
    )
  }
  const petal = effect === 'petals'
  return (
    <span style={{
      display:'block', width:size, height: petal ? Math.round(size * 0.72) : size, background: color,
      borderRadius: petal ? '52% 52% 52% 52% / 62% 62% 40% 40%' : '50%',
      boxShadow: effect === 'snow' ? `0 0 ${size/2}px rgba(255,255,255,.7)` : 'none',
    }} />
  )
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
      top: rnd(2, 92),                       // dapple only
      size: Math.round(rnd(cfg.size[0], cfg.size[1])),
      dur: rnd(cfg.dur[0], cfg.dur[1]),
      swayDur: rnd(4, 8),
      delay: rnd(-24, 0),
      op: rnd(cfg.op[0], cfg.op[1]),
      color: pick(cfg.colors),
    }))
  }, [effect]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!cfg || reduce) return null

  const wrap = { position:'fixed', inset:0, zIndex:40, pointerEvents:'none', overflow:'hidden' }

  // Dappled light — soft blurred blobs that breathe in place (no travel).
  if (cfg.mode === 'dapple') {
    return (
      <div aria-hidden="true" style={wrap}>
        {particles.map(p => (
          <div key={p.key} style={{
            position:'absolute', top:`${p.top}%`, left:`${p.left}%`, width:p.size, height:p.size,
            borderRadius:'50%', background:`radial-gradient(circle, ${p.color} 0%, transparent 68%)`,
            filter:`blur(${Math.round(p.size/6)}px)`, '--pk': p.op, willChange:'opacity, transform',
            animation:`dapple-breathe ${p.dur}s ease-in-out ${p.delay}s infinite`,
          }} />
        ))}
      </div>
    )
  }

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
              <Shape effect="bubbles" size={p.size} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Falling petals / leaves / snow.
  return (
    <div aria-hidden="true" style={wrap}>
      {particles.map(p => (
        <div key={p.key} style={{
          position:'absolute', top:'-8vh', left:`${p.left}%`, opacity:p.op, willChange:'transform',
          animation:`season-fall ${p.dur}s linear ${p.delay}s infinite`,
        }}>
          <Shape effect={effect} size={p.size} color={p.color} />
        </div>
      ))}
    </div>
  )
}

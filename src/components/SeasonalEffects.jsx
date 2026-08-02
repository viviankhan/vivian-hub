// src/components/SeasonalEffects.jsx
// A calm ambient motion layer that matches the active season: drifting petals
// in spring, a soft sea-shimmer of rising sparkles in summer, falling leaves in
// fall, and snow in winter. It sits behind sheets/modals and never blocks taps,
// and it's skipped entirely when the device asks for reduced motion.
import { useMemo } from 'react'

// A little RNG helper for spreading particles out.
const rnd = (a, b) => a + Math.random() * (b - a)
const pick = arr => arr[Math.floor(Math.random() * arr.length)]

// Per-effect look: how many, size range, fall vs rise, and the palette.
const EFFECTS = {
  petals:  { count: 16, size: [10, 17], mode: 'fall', colors: ['#F6C6D4', '#F4B8C6', '#EFD3DE', '#FBE6EC'] },
  leaves:  { count: 15, size: [12, 20], mode: 'fall', colors: ['#D2814B', '#C85A3A', '#E0A24E', '#B8632E'] },
  snow:    { count: 22, size: [4, 9],   mode: 'fall', colors: ['#FFFFFF', '#EAF2FA', '#E3EEF8'] },
  shimmer: { count: 13, size: [7, 13],  mode: 'rise', colors: ['#FFFFFF', '#FCE9A6', '#CDEBF3'] },
}

// The shape drawn for one particle of a given effect.
function Shape({ effect, size, color }) {
  if (effect === 'leaves') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
        <path d="M12 2c5 3 8 7 8 12 0 4-3 8-8 8-1-6 0-12 3-16-4 2-7 6-8 11-1-4 0-11 5-15Z" />
      </svg>
    )
  }
  if (effect === 'shimmer') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" style={{ filter:`drop-shadow(0 0 ${size/3}px ${color})` }}>
        <path d="M12 2l1.8 6.4L20 12l-6.2 1.8L12 22l-1.8-6.2L4 12l6.2-1.8Z" />
      </svg>
    )
  }
  // petals + snow — a soft rounded blob (petals are a touch elongated).
  const petal = effect === 'petals'
  return (
    <span style={{
      display:'block', width:size, height: petal ? Math.round(size * 0.72) : size,
      background: color,
      borderRadius: petal ? '52% 52% 52% 52% / 62% 62% 40% 40%' : '50%',
      boxShadow: effect === 'snow' ? `0 0 ${size/2}px rgba(255,255,255,.7)` : 'none',
    }} />
  )
}

export default function SeasonalEffects({ effect }) {
  const cfg = effect && EFFECTS[effect]
  // Honor reduced-motion — no ambient animation at all in that case.
  const reduce = typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // Freeze the particle set per effect so it doesn't reshuffle every render.
  const particles = useMemo(() => {
    if (!cfg) return []
    return Array.from({ length: cfg.count }, (_, i) => ({
      key: i,
      left: rnd(0, 100),
      size: Math.round(rnd(cfg.size[0], cfg.size[1])),
      dur: rnd(cfg.mode === 'rise' ? 7 : 9, cfg.mode === 'rise' ? 13 : 18),
      delay: rnd(-18, 0),
      opacity: rnd(0.35, 0.8),
      color: pick(cfg.colors),
    }))
  }, [effect]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!cfg || reduce) return null

  const anim = cfg.mode === 'rise' ? 'season-rise' : 'season-fall'
  return (
    <div aria-hidden="true" style={{ position:'fixed', inset:0, zIndex:40, pointerEvents:'none', overflow:'hidden' }}>
      {particles.map(p => (
        <div key={p.key} style={{
          position:'absolute', top: cfg.mode === 'rise' ? undefined : '-8vh',
          bottom: cfg.mode === 'rise' ? '-8vh' : undefined,
          left: `${p.left}%`, opacity: p.opacity, willChange:'transform',
          animation: `${anim} ${p.dur}s linear ${p.delay}s infinite`,
        }}>
          <Shape effect={effect} size={p.size} color={p.color} />
        </div>
      ))}
    </div>
  )
}

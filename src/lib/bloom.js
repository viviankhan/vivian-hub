// src/lib/bloom.js
// ─────────────────────────────────────────────────────────────
// A little flower that blooms when you complete a task. Call
// bloomBurst(el) with the checkbox element the moment a to-do goes
// from unchecked → done: a blossom pops open where you tapped and a
// few petals drift outward, then everything cleans itself up.
//
// Pure DOM + CSS (see the BLOOM BURST block in styles/index.css), so
// it works from any component without extra React wiring.
// ─────────────────────────────────────────────────────────────

const FLOWERS = ['🌸', '🌷', '🌺', '💮', '🌼']

export function bloomBurst(anchorEl) {
  if (typeof document === 'undefined' || !anchorEl?.getBoundingClientRect) return

  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const rect = anchorEl.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2

  const layer = document.createElement('div')
  layer.className = 'bloom-layer'
  layer.style.left = `${cx}px`
  layer.style.top = `${cy}px`

  // The central blossom that "opens."
  const flower = document.createElement('span')
  flower.className = 'bloom-flower'
  flower.textContent = FLOWERS[Math.floor(Math.random() * FLOWERS.length)]
  layer.appendChild(flower)

  // A ring of petals drifting outward — skipped when reduced-motion is on.
  const petalCount = reduce ? 0 : 6
  for (let i = 0; i < petalCount; i++) {
    const petal = document.createElement('span')
    petal.className = 'bloom-petal'
    petal.textContent = FLOWERS[(i + 1) % FLOWERS.length]
    const angle = (i / petalCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.6
    const dist = 24 + Math.random() * 20
    petal.style.setProperty('--dx', `${Math.cos(angle) * dist}px`)
    petal.style.setProperty('--dy', `${Math.sin(angle) * dist}px`)
    petal.style.animationDelay = `${Math.random() * 60}ms`
    layer.appendChild(petal)
  }

  document.body.appendChild(layer)
  // Longest animation is ~950ms; remove a touch after it finishes.
  setTimeout(() => layer.remove(), 1100)
}

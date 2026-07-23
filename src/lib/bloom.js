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

// A quick sparkle burst — used when a tab is pressed. A scatter of little
// twinkles fly out from the element's center and fade.
const SPARKLES = ['✨', '✦', '⋆', '❋', '✧']

export function sparkleBurst(anchorEl) {
  if (typeof document === 'undefined' || !anchorEl?.getBoundingClientRect) return

  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const rect = anchorEl.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2

  const layer = document.createElement('div')
  layer.className = 'sparkle-layer'
  layer.style.left = `${cx}px`
  layer.style.top = `${cy}px`

  const count = reduce ? 4 : 10
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span')
    s.className = 'sparkle'
    s.textContent = SPARKLES[Math.floor(Math.random() * SPARKLES.length)]
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.8
    const dist = 16 + Math.random() * 30
    s.style.setProperty('--dx', `${Math.cos(angle) * dist}px`)
    s.style.setProperty('--dy', `${Math.sin(angle) * dist}px`)
    s.style.fontSize = `${9 + Math.random() * 7}px`
    s.style.animationDelay = `${Math.random() * 50}ms`
    layer.appendChild(s)
  }

  document.body.appendChild(layer)
  setTimeout(() => layer.remove(), 800)
}

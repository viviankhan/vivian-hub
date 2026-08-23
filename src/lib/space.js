// src/lib/space.js
// ─────────────────────────────────────────────────────────────
// The Voyage — a little Raz-Kids-style space meta-game that sits on top of the
// wellness work. Checking in and tending to yourself earns STARS (a spendable
// currency that rides alongside the companion's petals); stars unlock planets
// and fund expeditions, and each expedition brings back an alien specimen for
// your ship's collection. Pure data + logic; the UI lives in Voyage.jsx and the
// art in spaceart.jsx.
// ─────────────────────────────────────────────────────────────

// Cost, in stars, of one expedition (which brings back one specimen).
export const EXPLORE_COST = 15

// The planets, in order. Verda is home and free; the rest cost escalating stars
// to reach, so the far ones take "lots and lots of work" to open. Each planet
// holds a handful of collectible specimens (flora / fauna).
export const PLANETS = [
  {
    id: 'verda', name: 'Verda', color: '#77C598', ring: false, unlock: 0,
    blurb: 'A mossy green world where everything grows.',
    specimens: [
      { id: 'sprigling', name: 'Sprigling', kind: 'flora', color: '#8FD08A', form: 'sprout' },
      { id: 'bulbo',     name: 'Bulbo',     kind: 'fauna', color: '#B7E29C', form: 'blob' },
      { id: 'fernly',    name: 'Fernly',    kind: 'flora', color: '#6FB98A', form: 'frond' },
      { id: 'hoppa',     name: 'Hoppa',     kind: 'fauna', color: '#A6D97E', form: 'critter' },
    ],
  },
  {
    id: 'cobalt', name: 'Cobalt', color: '#6E97D8', ring: false, unlock: 70,
    blurb: 'An ocean planet drifting under two pale moons.',
    specimens: [
      { id: 'finn',    name: 'Finn',    kind: 'fauna', color: '#7FB0E6', form: 'critter' },
      { id: 'coralux', name: 'Coralux', kind: 'flora', color: '#9AC4EE', form: 'frond' },
      { id: 'jelli',   name: 'Jelli',   kind: 'fauna', color: '#B8C8F0', form: 'blob' },
      { id: 'reedy',   name: 'Reedy',   kind: 'flora', color: '#6FA0D0', form: 'sprout' },
    ],
  },
  {
    id: 'ember', name: 'Ember', color: '#E39B6B', ring: true, unlock: 180,
    blurb: 'Warm dunes where the flowers glow at dusk.',
    specimens: [
      { id: 'cinder',  name: 'Cinder',  kind: 'fauna', color: '#EBA878', form: 'critter' },
      { id: 'flarea',  name: 'Flarea',  kind: 'flora', color: '#F0C08A', form: 'sprout' },
      { id: 'molto',   name: 'Molto',   kind: 'fauna', color: '#E8895E', form: 'blob' },
      { id: 'sunspur', name: 'Sunspur', kind: 'flora', color: '#F2B56A', form: 'frond' },
    ],
  },
  {
    id: 'viola', name: 'Viola', color: '#A98BD6', ring: true, unlock: 360,
    blurb: 'A twilight world of humming crystal groves.',
    specimens: [
      { id: 'prism',   name: 'Prism',   kind: 'flora', color: '#C3ABE8', form: 'frond' },
      { id: 'noctis',  name: 'Noctis',  kind: 'fauna', color: '#9E86C8', form: 'critter' },
      { id: 'lumen',   name: 'Lumen',   kind: 'fauna', color: '#B7A0E0', form: 'blob' },
      { id: 'violet',  name: 'Violet',  kind: 'flora', color: '#8E74C0', form: 'sprout' },
    ],
  },
  {
    id: 'aurora', name: 'Aurora', color: '#79C9C0', ring: true, unlock: 650,
    blurb: 'Where the skies never stop shimmering.',
    specimens: [
      { id: 'glimmer', name: 'Glimmer', kind: 'fauna', color: '#8FD6CE', form: 'blob' },
      { id: 'wispen',  name: 'Wispen',  kind: 'flora', color: '#A6E0D6', form: 'frond' },
      { id: 'polara',  name: 'Polara',  kind: 'fauna', color: '#6FBDB4', form: 'critter' },
      { id: 'dawnlet', name: 'Dawnlet', kind: 'flora', color: '#B8E4C6', form: 'sprout' },
    ],
  },
]

// Selectable ship hulls (cosmetic). Classic is free; others cost stars once.
export const SHIP_SKINS = [
  { id: 'classic', name: 'Classic', color: '#D8DEE9', cost: 0 },
  { id: 'coral',   name: 'Coral',   color: '#E9857A', cost: 40 },
  { id: 'mint',    name: 'Mint',    color: '#8FD0B0', cost: 40 },
  { id: 'gold',    name: 'Gold',    color: '#EBC96B', cost: 120 },
]

export function freshSpace() {
  return { unlocked: [], collection: [], current: 'verda', ship: { skin: 'classic', owned: ['classic'] } }
}

export function planetById(id) { return PLANETS.find(p => p.id === id) || null }
export function isUnlocked(space, id) { return id === 'verda' || (space?.unlocked || []).includes(id) }

// The set of "planetId:specimenId" the traveller has already brought home.
export function collectedSet(space) {
  return new Set((space?.collection || []).map(c => `${c.planetId}:${c.specimenId}`))
}
// The specimens of one planet that have (not) been collected.
export function planetProgress(space, planetId) {
  const p = planetById(planetId)
  if (!p) return { got: [], missing: [], total: 0 }
  const set = collectedSet(space)
  const got = p.specimens.filter(s => set.has(`${planetId}:${s.id}`))
  const missing = p.specimens.filter(s => !set.has(`${planetId}:${s.id}`))
  return { got, missing, total: p.specimens.length }
}
// Total specimens collected across every planet, and the grand total.
export function collectionCounts(space) {
  const total = PLANETS.reduce((n, p) => n + p.specimens.length, 0)
  return { collected: (space?.collection || []).length, total }
}

// Pick the specimen an expedition brings back: a random not-yet-collected one on
// that planet, or null when the planet is fully cataloged (the caller then
// refunds the expedition instead of spending it).
export function pickReward(space, planetId, rnd = Math.random) {
  const { missing } = planetProgress(space, planetId)
  if (!missing.length) return null
  return missing[Math.floor(rnd() * missing.length)]
}

// Return a new space with a specimen recorded as collected (no-op if already had).
export function withSpecimen(space, planetId, specimenId) {
  const s = { ...freshSpace(), ...(space || {}) }
  const key = `${planetId}:${specimenId}`
  if (collectedSet(s).has(key)) return s
  return { ...s, collection: [...(s.collection || []), { planetId, specimenId, ts: new Date().toISOString() }] }
}
export function withUnlocked(space, planetId) {
  const s = { ...freshSpace(), ...(space || {}) }
  if (s.unlocked?.includes(planetId)) return s
  return { ...s, unlocked: [...(s.unlocked || []), planetId] }
}
export function withCurrent(space, planetId) {
  return { ...freshSpace(), ...(space || {}), current: planetId }
}
export function withShip(space, changes) {
  const s = { ...freshSpace(), ...(space || {}) }
  return { ...s, ship: { ...s.ship, ...changes } }
}

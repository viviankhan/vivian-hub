// src/lib/space.js
// ─────────────────────────────────────────────────────────────
// The Rocket — a Raz-Rocket-style build-your-own-ship reward. Tending to
// yourself earns STARS (a spendable currency that rides alongside the
// companion's petals); you spend them in the parts shop to buy nose cones,
// hulls, fins, windows, boosters and a little pilot, and snap them onto your
// rocket. Pure data + logic; the shop UI is in Voyage.jsx and the modular
// rocket art in spaceart.jsx.
// ─────────────────────────────────────────────────────────────

// The part categories, in the order the shop lists them.
export const PART_CATS = [
  { key: 'nose',   name: 'Nose cone' },
  { key: 'body',   name: 'Hull' },
  { key: 'wings',  name: 'Fins' },
  { key: 'window', name: 'Window' },
  { key: 'flame',  name: 'Booster' },
  { key: 'pilot',  name: 'Pilot' },
]

// Every buyable part. The first in each category is the free default. Visual
// fields (shape / color / style / colors / form) are read by the art.
export const PARTS = {
  nose: [
    { id: 'nose-red',  name: 'Classic', cost: 0,  shape: 'cone',  color: '#E9857A' },
    { id: 'nose-blue', name: 'Azure',   cost: 20, shape: 'cone',  color: '#6E97D8' },
    { id: 'nose-dome', name: 'Bubble',  cost: 35, shape: 'dome',  color: '#E9A9C6' },
    { id: 'nose-gold', name: 'Comet',   cost: 55, shape: 'spike', color: '#EBC96B' },
  ],
  body: [
    { id: 'body-white',  name: 'Cloud',  cost: 0,  color: '#E7ECF3' },
    { id: 'body-mint',   name: 'Mint',   cost: 25, color: '#9FD9BE' },
    { id: 'body-coral',  name: 'Coral',  cost: 25, color: '#F0A79A' },
    { id: 'body-stripe', name: 'Racer',  cost: 60, color: '#E7ECF3', stripe: '#6E97D8' },
  ],
  wings: [
    { id: 'wings-classic', name: 'Classic', cost: 0,  style: 'classic', color: '#C6CEDA' },
    { id: 'wings-swept',   name: 'Swept',   cost: 30, style: 'swept',   color: '#8FB0D8' },
    { id: 'wings-round',   name: 'Rounded', cost: 30, style: 'round',   color: '#E9A9C6' },
  ],
  window: [
    { id: 'win-porthole', name: 'Porthole', cost: 0,  style: 'round' },
    { id: 'win-visor',    name: 'Visor',    cost: 25, style: 'visor' },
    { id: 'win-double',   name: 'Double',   cost: 40, style: 'double' },
  ],
  flame: [
    { id: 'flame-orange',  name: 'Orange',  cost: 0,  colors: ['#F5A64B', '#F6D96B'] },
    { id: 'flame-blue',    name: 'Blue',    cost: 20, colors: ['#5FA8E8', '#BFE6F2'] },
    { id: 'flame-mint',    name: 'Mint',    cost: 20, colors: ['#5FC9A0', '#C7F0DE'] },
    { id: 'flame-rainbow', name: 'Rainbow', cost: 75, colors: ['rainbow'] },
  ],
  pilot: [
    { id: 'pilot-none',   name: 'Empty',   cost: 0,  form: 'none' },
    { id: 'pilot-sprout', name: 'Sprout',  cost: 30, form: 'sprout' },
    { id: 'pilot-alien',  name: 'Zib',     cost: 45, form: 'alien' },
    { id: 'pilot-star',   name: 'Twinkle', cost: 50, form: 'star' },
  ],
}

// A fresh ship wears every category's default and owns exactly those.
export function freshShip() {
  const equipped = { nose: 'nose-red', body: 'body-white', wings: 'wings-classic', window: 'win-porthole', flame: 'flame-orange', pilot: 'pilot-none' }
  return { equipped, owned: Object.values(equipped) }
}
export function freshSpace() {
  return { ship: freshShip(), unlocked: [], current: 'verda', discovered: [], cabin: null }
}

// ── Planets & specimens ────────────────────────────────────────
// You spend stars to TRAVEL to a planet (unlock it); only then can you SEARCH it
// to discover its specimens. A specimen stays completely hidden — you can't see
// the plant or animal at all — until it's discovered.
export const SEARCH_COST = 15

export const PLANETS = [
  {
    id: 'verda', name: 'Verda', color: '#77C598', ring: false, unlock: 0,
    blurb: 'A mossy green world where everything grows.',
    specimens: [
      { id: 'sprigling', name: 'Sprigling', kind: 'flora', color: '#8FD08A', form: 'sprout' },
      { id: 'bulbo',     name: 'Bulbo',     kind: 'fauna', color: '#B7E29C', form: 'cyclops' },
      { id: 'fernly',    name: 'Fernly',    kind: 'flora', color: '#6FB98A', form: 'frond' },
      { id: 'hoppa',     name: 'Hoppa',     kind: 'fauna', color: '#A6D97E', form: 'critter' },
    ],
  },
  {
    id: 'cobalt', name: 'Cobalt', color: '#6E97D8', ring: false, unlock: 80,
    blurb: 'An ocean planet drifting under two pale moons.',
    specimens: [
      { id: 'finn',    name: 'Finn',    kind: 'fauna', color: '#7FB0E6', form: 'floaty' },
      { id: 'coralux', name: 'Coralux', kind: 'flora', color: '#9AC4EE', form: 'frond' },
      { id: 'jelli',   name: 'Jelli',   kind: 'fauna', color: '#B8C8F0', form: 'slime' },
      { id: 'reedy',   name: 'Reedy',   kind: 'flora', color: '#6FA0D0', form: 'sprout' },
    ],
  },
  {
    id: 'ember', name: 'Ember', color: '#E39B6B', ring: true, unlock: 200,
    blurb: 'Warm dunes where the flowers glow at dusk.',
    specimens: [
      { id: 'cinder',  name: 'Cinder',  kind: 'fauna', color: '#EBA878', form: 'bear' },
      { id: 'flarea',  name: 'Flarea',  kind: 'flora', color: '#F0C08A', form: 'bloom' },
      { id: 'molto',   name: 'Molto',   kind: 'fauna', color: '#E8895E', form: 'slime' },
      { id: 'sunspur', name: 'Sunspur', kind: 'flora', color: '#F2B56A', form: 'cactus' },
    ],
  },
  {
    id: 'viola', name: 'Viola', color: '#A98BD6', ring: true, unlock: 400,
    blurb: 'A twilight world of humming crystal groves.',
    specimens: [
      { id: 'prism',  name: 'Prism',  kind: 'flora', color: '#C3ABE8', form: 'shroom' },
      { id: 'noctis', name: 'Noctis', kind: 'fauna', color: '#9E86C8', form: 'bear' },
      { id: 'lumen',  name: 'Lumen',  kind: 'fauna', color: '#B7A0E0', form: 'floaty' },
      { id: 'violet', name: 'Violet', kind: 'flora', color: '#8E74C0', form: 'bloom' },
    ],
  },
  {
    id: 'aurora', name: 'Aurora', color: '#79C9C0', ring: true, unlock: 700,
    blurb: 'Where the skies never stop shimmering.',
    specimens: [
      { id: 'glimmer', name: 'Glimmer', kind: 'fauna', color: '#8FD6CE', form: 'floaty' },
      { id: 'wispen',  name: 'Wispen',  kind: 'flora', color: '#A6E0D6', form: 'frond' },
      { id: 'polara',  name: 'Polara',  kind: 'fauna', color: '#6FBDB4', form: 'critter' },
      { id: 'dawnlet', name: 'Dawnlet', kind: 'flora', color: '#B8E4C6', form: 'bloom' },
    ],
  },
]

export function planetById(id) { return PLANETS.find(p => p.id === id) || null }
export function isUnlocked(space, id) { return id === 'verda' || (space?.unlocked || []).includes(id) }
export function discoveredSet(space) {
  return new Set((space?.discovered || []).map(d => `${d.planetId}:${d.specimenId}`))
}
// A planet's discovery state. `missing` is only a COUNT here — callers must not
// reveal which specimens are missing (they stay hidden until found).
export function planetDiscovery(space, planetId) {
  const p = planetById(planetId)
  if (!p) return { found: [], remaining: 0, total: 0 }
  const set = discoveredSet(space)
  const found = p.specimens.filter(s => set.has(`${planetId}:${s.id}`))
  return { found, remaining: p.specimens.length - found.length, total: p.specimens.length }
}
export function collectionCounts(space) {
  const total = PLANETS.reduce((n, p) => n + p.specimens.length, 0)
  return { collected: (space?.discovered || []).length, total }
}
// Pick a random not-yet-discovered specimen on a planet (or null if all found).
export function pickUndiscovered(space, planetId, rnd = Math.random) {
  const p = planetById(planetId)
  if (!p) return null
  const set = discoveredSet(space)
  const missing = p.specimens.filter(s => !set.has(`${planetId}:${s.id}`))
  if (!missing.length) return null
  return missing[Math.floor(rnd() * missing.length)]
}
// Every specimen the traveller has discovered, resolved to full objects — the
// contents of the greenhouse.
export function allDiscovered(space) {
  const out = []
  for (const d of (space?.discovered || [])) {
    const p = planetById(d.planetId)
    const s = p?.specimens.find(x => x.id === d.specimenId)
    if (s) out.push({ ...s, planetId: d.planetId, planetName: p.name })
  }
  return out
}

// Chance an expedition actually turns something up (otherwise it comes back with
// only a scouting consolation). Discovery on this planet is still bounded by
// what's left to find.
export const FIND_CHANCE = 0.72

// ── Explorer's cabin (a decoratable room in the ship) ──────────
// Everything is bought with stars; the first option in each category is free.
export const CABIN_CATS = [
  { key: 'wall',  name: 'Walls' },
  { key: 'floor', name: 'Floor' },
  { key: 'rug',   name: 'Rug' },
  { key: 'bed',   name: 'Bed' },
  { key: 'decor', name: 'Wall art' },
]
export const CABIN = {
  wall: [
    { id: 'wall-mint',  name: 'Mint',   cost: 0,  color: '#CFE6D6' },
    { id: 'wall-blue',  name: 'Sky',    cost: 30, color: '#CBDDF2' },
    { id: 'wall-blush', name: 'Blush',  cost: 30, color: '#F0D6DD' },
    { id: 'wall-lilac', name: 'Lilac',  cost: 45, color: '#DCD1EE', motif: 'stars' },
  ],
  floor: [
    { id: 'floor-oak',  name: 'Oak',    cost: 0,  color: '#D8C6A6' },
    { id: 'floor-ash',  name: 'Ash',    cost: 25, color: '#C4CAD2' },
    { id: 'floor-rose', name: 'Rose',   cost: 25, color: '#E3C6C2' },
    { id: 'floor-moss', name: 'Moss',   cost: 40, color: '#B6CBA6' },
  ],
  rug: [
    { id: 'rug-none',  name: 'None',   cost: 0,  color: null },
    { id: 'rug-round', name: 'Round',  cost: 30, color: '#8FB0D8' },
    { id: 'rug-star',  name: 'Star',   cost: 45, color: '#E8907A', motif: 'star' },
    { id: 'rug-moon',  name: 'Moon',   cost: 45, color: '#B7A0E0', motif: 'moon' },
  ],
  bed: [
    { id: 'bed-cozy',  name: 'Cozy',   cost: 0,  color: '#E9A9C6' },
    { id: 'bed-cloud', name: 'Cloud',  cost: 70, color: '#DCEBF6' },
    { id: 'bed-moss',  name: 'Nest',   cost: 60, color: '#A9C99A' },
  ],
  decor: [
    { id: 'decor-none',   name: 'Bare',     cost: 0,  motif: 'none' },
    { id: 'decor-map',    name: 'Star map', cost: 40, motif: 'map' },
    { id: 'decor-window', name: 'Porthole', cost: 55, motif: 'window' },
    { id: 'decor-plant',  name: 'Hanging',  cost: 35, motif: 'plant' },
  ],
}
export function freshCabin() {
  const equipped = { wall: 'wall-mint', floor: 'floor-oak', rug: 'rug-none', bed: 'bed-cozy', decor: 'decor-none', pet: null }
  return { equipped, owned: Object.values(equipped).filter(Boolean) }
}
export function cabinPart(cat, id) { const list = CABIN[cat] || []; return list.find(p => p.id === id) || list[0] }
export function cabinEquipped(cabin, cat) { return cabinPart(cat, (cabin || freshCabin()).equipped?.[cat]) }
export function cabinOwns(cabin, id) { return (cabin?.owned || []).includes(id) }
export function withCabinEquip(space, cat, id) {
  const s = { ...freshSpace(), ...(space || {}) }
  const cabin = { ...(s.cabin || freshCabin()) }
  cabin.equipped = { ...cabin.equipped, [cat]: id }
  return { ...s, cabin }
}
export function withCabinOwned(space, id) {
  const s = { ...freshSpace(), ...(space || {}) }
  const cabin = { ...(s.cabin || freshCabin()) }
  if ((cabin.owned || []).includes(id)) return s
  cabin.owned = [...(cabin.owned || []), id]
  return { ...s, cabin }
}
export function cabinCompletion(cabin) {
  const total = Object.values(CABIN).reduce((n, a) => n + a.length, 0)
  return { owned: (cabin?.owned || []).length, total }
}

export function withUnlocked(space, planetId) {
  const s = { ...freshSpace(), ...(space || {}) }
  if ((s.unlocked || []).includes(planetId)) return s
  return { ...s, unlocked: [...(s.unlocked || []), planetId] }
}
export function withCurrent(space, planetId) { return { ...freshSpace(), ...(space || {}), current: planetId } }
export function withDiscovered(space, planetId, specimenId) {
  const s = { ...freshSpace(), ...(space || {}) }
  if (discoveredSet(s).has(`${planetId}:${specimenId}`)) return s
  return { ...s, discovered: [...(s.discovered || []), { planetId, specimenId, ts: new Date().toISOString() }] }
}

export function partById(cat, id) {
  const list = PARTS[cat] || []
  return list.find(p => p.id === id) || list[0]
}
export function equippedPart(ship, cat) { return partById(cat, ship?.equipped?.[cat]) }
export function isOwned(ship, id) { return (ship?.owned || []).includes(id) }

// The rocket as a flat {cat: part} map the art consumes.
export function equippedParts(ship) {
  const s = ship || freshShip()
  const out = {}
  for (const c of PART_CATS) out[c.key] = equippedPart(s, c.key)
  return out
}

export function withEquip(space, cat, id) {
  const s = { ...freshSpace(), ...(space || {}) }
  const ship = { ...(s.ship || freshShip()) }
  ship.equipped = { ...ship.equipped, [cat]: id }
  return { ...s, ship }
}
export function withOwned(space, id) {
  const s = { ...freshSpace(), ...(space || {}) }
  const ship = { ...(s.ship || freshShip()) }
  if ((ship.owned || []).includes(id)) return s
  ship.owned = [...(ship.owned || []), id]
  return { ...s, ship }
}

// Progress toward owning the whole catalog (for the little "12/22 parts" tag).
export function shipCompletion(ship) {
  const total = Object.values(PARTS).reduce((n, a) => n + a.length, 0)
  return { owned: (ship?.owned || []).length, total }
}

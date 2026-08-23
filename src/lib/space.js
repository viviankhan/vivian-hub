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
export function freshSpace() { return { ship: freshShip() } }

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

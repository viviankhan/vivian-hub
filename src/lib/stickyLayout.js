// src/lib/stickyLayout.js
// Where sticky notes sit on the Thoughts board.
//
// A note's left edge is a % of the board's width (so it scales across phone /
// desktop), and its top edge is `py` — pixels from the top of the board — so
// the board can simply grow taller as notes are added instead of squeezing
// every note into one fixed-height box. Older notes only have `y` (a % of the
// old fixed board height); `noteTop` converts those on the fly.

export const NOTE_W = 150     // sticky width (px)
export const CELL_H = 172     // vertical spacing between rows of notes (px)
export const PAD = 10         // breathing room around the board's edge (px)
const GAP_X = 10

export const columns = (width) =>
  Math.max(1, Math.floor((width - 2 * PAD + GAP_X) / (NOTE_W + GAP_X)))

// Left edge in px of a note, as it actually renders (clamped onto the board).
export const noteLeft = (t, width) =>
  Math.max(0, Math.min(((t.x || 0) / 100) * width, width - NOTE_W - 8))

// Top edge in px. `legacyH` is the old fixed board height that `y` % meant.
export const noteTop = (t, legacyH) =>
  typeof t.py === 'number' ? t.py : Math.max(0, Math.min(((t.y || 0) / 100) * legacyH, legacyH - 128))

// The board is tall enough for every note, and never shorter than `minH`.
export function boardHeight(notes, minH, legacyH) {
  let h = minH
  for (const t of notes) h = Math.max(h, noteTop(t, legacyH) + CELL_H + PAD)
  return Math.round(h)
}

// A small, stable wobble per note so a tidied board still looks hand-pinned.
function wobble(id, range) {
  let h = 0
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) | 0
  return ((Math.abs(h) % 1000) / 1000 - 0.5) * 2 * range
}

function slot(i, width) {
  const cols = columns(width)
  const cellW = (width - 2 * PAD) / cols
  const col = i % cols, row = Math.floor(i / cols)
  return { left: PAD + col * cellW + Math.max(0, (cellW - NOTE_W) / 2), top: PAD + row * CELL_H }
}

const toXPct = (left, width) => Math.max(0, Math.min(92, (left / width) * 100))

// Do two notes sit mostly on top of each other?
const covers = (a, b) =>
  Math.abs(a.left - b.left) < NOTE_W * 0.75 && Math.abs(a.top - b.top) < CELL_H * 0.7

// Position of the first grid slot (reading order) no existing note covers.
// Always finds one: below the lowest note the board is empty.
export function freeSpot(notes, width, legacyH) {
  const taken = notes.map(t => ({ left: noteLeft(t, width), top: noteTop(t, legacyH) }))
  for (let i = 0; ; i++) {
    const s = slot(i, width)
    if (!taken.some(p => covers(p, s))) return { x: toXPct(s.left, width), py: s.top }
  }
}

// Lay every note out in a neat grid, in the order given. Returns new notes.
export function tidy(notes, width) {
  return notes.map((t, i) => {
    const s = slot(i, width)
    const left = s.left + wobble(t.id, 5)
    const top = Math.max(0, s.top + wobble(t.id + 'y', 5))
    return { ...t, x: toXPct(left, width), py: top }
  })
}

// Are any two notes piled on top of each other (enough to hide one)?
export function hasPileUp(notes, width, legacyH) {
  const p = notes.map(t => ({ left: noteLeft(t, width), top: noteTop(t, legacyH) }))
  for (let i = 0; i < p.length; i++)
    for (let j = i + 1; j < p.length; j++)
      if (Math.abs(p[i].left - p[j].left) < NOTE_W * 0.5 && Math.abs(p[i].top - p[j].top) < CELL_H * 0.5) return true
  return false
}

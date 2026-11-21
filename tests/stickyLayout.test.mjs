// The Thoughts board: notes shouldn't pile up on top of each other.
import assert from 'node:assert/strict'
import { NOTE_W, CELL_H, columns, freeSpot, tidy, hasPileUp, boardHeight, noteTop, noteLeft } from '../src/lib/stickyLayout.js'

let n = 0
const t = (name, fn) => { fn(); n++; console.log('  ✓ ' + name) }
console.log('\n— sticky note layout —')

const PHONE = 370, LEGACY = 540
const note = (i, extra = {}) => ({ id: 'th-' + i, text: 'n' + i, createdAt: `2026-11-${String(i + 1).padStart(2, '0')}`, x: 0, y: 0, ...extra })
const overlapping = (notes, w) => {
  for (let i = 0; i < notes.length; i++) for (let j = i + 1; j < notes.length; j++) {
    const a = notes[i], b = notes[j]
    if (Math.abs(noteLeft(a, w) - noteLeft(b, w)) < NOTE_W - 4 && Math.abs(noteTop(a, LEGACY) - noteTop(b, LEGACY)) < CELL_H - 20) return true
  }
  return false
}

t('a phone fits two notes across, a desktop more', () => {
  assert.equal(columns(PHONE), 2)
  assert.ok(columns(1000) >= 5)
})

t('tidy lays 14 notes out with none covering another, and the board grows to hold them', () => {
  const out = tidy(Array.from({ length: 14 }, (_, i) => note(i)), PHONE)
  assert.ok(!overlapping(out, PHONE))
  assert.ok(!hasPileUp(out, PHONE, LEGACY))
  assert.ok(boardHeight(out, LEGACY, LEGACY) >= 7 * CELL_H, 'seven rows tall')
})

t('tidy keeps every note on the board horizontally', () => {
  for (const w of [320, PHONE, 700, 1200]) for (const t2 of tidy(Array.from({ length: 9 }, (_, i) => note(i)), w))
    assert.ok(noteLeft(t2, w) >= 0 && noteLeft(t2, w) + NOTE_W <= w, `${w}`)
})

t('a new note lands in an open spot, never on top of one', () => {
  let notes = []
  for (let i = 0; i < 20; i++) notes = [...notes, { ...note(i), ...freeSpot(notes, PHONE, LEGACY) }]
  assert.ok(!overlapping(notes, PHONE))
})

t('a new note fills a gap before going to the bottom', () => {
  const grid = tidy(Array.from({ length: 6 }, (_, i) => note(i)), PHONE)
  const gap = grid.filter((_, i) => i !== 2)       // row 2, left column is empty
  const s = freeSpot(gap, PHONE, LEGACY)
  assert.ok(Math.abs(s.py - grid[2].py) < 12 && Math.abs(s.x - grid[2].x) < 4, JSON.stringify(s))
})

t('old notes (y as a % of the fixed board) keep where they were', () => {
  assert.equal(noteTop({ y: 50 }, 600), 300)
  assert.equal(noteTop({ y: 90 }, 600), 600 - 128)   // the old bottom clamp
  assert.equal(noteTop({ y: 50, py: 900 }, 600), 900)
})

t('a pile-up is spotted', () => {
  assert.ok(hasPileUp([note(0, { x: 10, y: 10 }), note(1, { x: 14, y: 12 })], PHONE, LEGACY))
  assert.ok(!hasPileUp([note(0, { x: 2, py: 10 }), note(1, { x: 52, py: 10 })], PHONE, LEGACY))
})

console.log(`  ${n} passed`)

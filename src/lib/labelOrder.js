// src/lib/labelOrder.js
// ─────────────────────────────────────────────────────────────
// The order of the label chain.
//
// Labels are shown in one long chain — in Settings → Labels, at the top of the
// Task Menu, and as the row of chips on every add-task sheet. Which label sits
// first is not cosmetic: the ones you reach for twenty times a day should be
// under your thumb, not three rows down past the ones you use twice a year.
//
// So the chain is draggable, and where you drop a label is remembered. Each
// label row already carries a `sortOrder` column; reordering is just renumbering
// it 0…n-1 and saving the rows whose number actually moved. Because it lives on
// the row, the order syncs like any other edit — and it's the same order
// everywhere the chain appears.
//
// Pure helpers, plus one register: the add sheet is opened from a dozen places
// that don't thread label CRUD through their props, so App mirrors the commit
// here the same way lib/labels.js mirrors the record wiring.
// ─────────────────────────────────────────────────────────────

// Labels with no number of their own (an older row, or one just made) sit at
// the end, in the order they arrived — never shuffled into the middle.
function place(cat) {
  const n = Number(cat?.sortOrder)
  return Number.isFinite(n) ? n : Infinity
}

// The chain, in the order the user put it in. A stable sort, so two labels
// sharing a number keep the order they came in with.
export function sortLabels(cats = []) {
  return cats
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (place(a.c) - place(b.c)) || (a.i - b.i))
    .map(x => x.c)
}

// The ids of `orderedIds` that actually exist, with anything the caller didn't
// mention kept on the end — so a half-stale drag can never drop a label.
function completeOrder(cats = [], orderedIds = []) {
  const byId = new Map(cats.map(c => [c.id, c]))
  const seen = new Set()
  const ids = []
  for (const id of orderedIds) if (byId.has(id) && !seen.has(id)) { ids.push(id); seen.add(id) }
  for (const c of cats) if (!seen.has(c.id)) { ids.push(c.id); seen.add(c.id) }
  return ids
}

// The whole list, renumbered into the given order — what the screen shows the
// moment the label is dropped.
export function applyOrder(cats = [], orderedIds = []) {
  const byId = new Map(cats.map(c => [c.id, c]))
  return completeOrder(cats, orderedIds).map((id, i) => {
    const c = byId.get(id)
    return c.sortOrder === i ? c : { ...c, sortOrder: i }
  })
}

// Only the rows whose number moved — the ones worth a write.
export function orderChanges(cats = [], orderedIds = []) {
  const byId = new Map(cats.map(c => [c.id, c]))
  return completeOrder(cats, orderedIds)
    .map((id, i) => ({ id, sortOrder: i }))
    .filter(ch => byId.get(ch.id).sortOrder !== ch.sortOrder)
}

// The next number for a brand-new label, so it lands at the end of the chain.
export function nextSortOrder(cats = []) {
  return cats.reduce((m, c) => Math.max(m, Number.isFinite(Number(c.sortOrder)) ? Number(c.sortOrder) : 0), -1) + 1
}

// ── Module register ─────────────────────────────────────────────
// App registers the one function that saves a new order; screens that can't be
// handed it as a prop reach for it here. Unregistered (or in a screen that
// doesn't have it), `canReorderLabels()` is false and the chain simply isn't
// draggable — nothing else changes.
let _reorder = null
export function registerLabelReorder(fn) { _reorder = typeof fn === 'function' ? fn : null }
export function canReorderLabels() { return !!_reorder }
export function reorderLabels(orderedIds) { if (_reorder) _reorder(orderedIds) }

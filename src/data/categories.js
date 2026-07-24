// src/data/categories.js
// Starter category set — seeded into the categories table on first load if
// it's empty. After that it's fully user-editable (add / rename / recolor /
// delete) from Settings → Categories, and this list is never consulted again.
// Merges the old hardcoded commitment categories and recurring-task tags into
// one shared list.
export const DEFAULT_CATEGORIES = [
  { id:'lab',      label:'Lab',      color:'#059669', sortOrder:0 },
  { id:'class',    label:'Class',    color:'#7C3AED', sortOrder:1 },
  { id:'study',    label:'Study',    color:'#7A8EC4', sortOrder:2 },
  { id:'meeting',  label:'Meeting',  color:'#4A9EB5', sortOrder:3 },
  { id:'deadline', label:'Deadline', color:'#C4728E', sortOrder:4 },
  { id:'career',   label:'Career',   color:'#D97706', sortOrder:5 },
  { id:'health',   label:'Health',   color:'#E07B2E', sortOrder:6 },
  { id:'fitness',  label:'Fitness',  color:'#3B82F6', sortOrder:7 },
  { id:'personal', label:'Personal', color:'#A855F7', sortOrder:8 },
  { id:'social',   label:'Social',   color:'#9A7CC4', sortOrder:9 },
  { id:'urgent',   label:'Urgent',   color:'#EF4444', sortOrder:10 },
  { id:'sleep',    label:'Sleep',    color:'#52B788', sortOrder:11 },
  { id:'other',    label:'Other',    color:'#8899AA', sortOrder:12 },
]

// ── Multi-label helpers ────────────────────────────────────────
// A task/commitment's category is stored in one text field but can now hold
// more than one label, comma-joined (e.g. "lab,health"). Category ids are
// comma-free slugs, so splitting on comma is safe. These helpers are the one
// place that understands that encoding, so every screen resolves labels the
// same way.
export function catIds(cat) {
  if (Array.isArray(cat)) return cat.filter(Boolean)
  if (!cat) return []
  return String(cat).split(',').map(s => s.trim()).filter(Boolean)
}
// Resolve a stored cat value into full {id,label,color,icon} objects (order
// preserved). Unknown ids fall back to a neutral gray so nothing renders blank.
export function resolveCats(cat, categories) {
  const list = categories || []
  return catIds(cat).map(id => {
    const f = list.find(c => c.id === id)
    return { id, label: f?.label || id, color: f?.color || '#9CA3AF', icon: f?.icon || '' }
  })
}
// The primary (first) label — for the single dot/color spots that only fit one.
export function primaryCat(cat, categories) {
  return resolveCats(cat, categories)[0] || { id:'', label:'', color:'#9CA3AF', icon:'' }
}

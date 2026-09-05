// src/lib/taskMenuPrefs.js
// ─────────────────────────────────────────────────────────────
// Your own default task menu.
//
// The add-a-task sheet is a stack of rows — labels, date, time, repeat,
// reminders, location… Which of those you meet first (and which tuck away
// under "More options") is a matter of how you actually plan, so it's yours to
// arrange in Settings → Task menu.
//
// The automatic default is Bloom's current task menu, with Labels moved to the
// top: labels are the first thing you choose, because a record label reshapes
// the rest of the sheet around what you need to write down.
//
// Device-local (instant, pre-paint) and mirrored to the synced prefs blob, the
// same treatment the duration presets and default alerts get.
// ─────────────────────────────────────────────────────────────

const KEY = 'bloom_task_menu'
export const TASK_MENU_EVENT = 'bloom-task-menu'

// Every arrangeable row. `fixed` rows can't be moved out of the main list —
// there'd be no sheet left without them.
export const TASK_MENU_ROWS = [
  { id: 'labels',   label: 'Labels',        hint: 'Tag the task — and pick up a record folder’s own fields.' },
  { id: 'date',     label: 'Date',          hint: 'Which day it lands on.' },
  { id: 'time',     label: 'Time & length', hint: 'Start, end and duration.' },
  { id: 'record',   label: 'Record details', hint: 'The fields a record label asks for. Only shows when one is picked.' },
  { id: 'repeat',   label: 'Repeat',        hint: 'Turn it into a recurring task.' },
  { id: 'routine',  label: 'Routine',       hint: 'File it under a morning/night routine.' },
  { id: 'color',    label: 'Color',         hint: 'Override the label’s color.' },
  { id: 'block',    label: 'Time block',    hint: 'Make it a background band instead of a task.' },
  { id: 'autodone', label: 'Auto-complete', hint: 'Tick itself off once its time has passed.' },
  { id: 'remind',   label: 'Reminders',     hint: 'Alerts and the sound they play.' },
  { id: 'person',   label: 'Who you committed to', hint: 'The person counting on it.' },
  { id: 'location', label: 'Location',      hint: 'Where it happens, and arrival auto-start.' },
]
export const ROW_IDS = TASK_MENU_ROWS.map(r => r.id)
export function taskMenuRow(id) { return TASK_MENU_ROWS.find(r => r.id === id) || null }

// The out-of-the-box arrangement — today's sheet, with Labels first and the
// record fields right behind them.
export const DEFAULT_PRIMARY = ['labels', 'record', 'date', 'time', 'repeat', 'routine', 'color']
export const DEFAULT_MORE    = ['block', 'autodone', 'remind', 'person', 'location']

function clean(list, taken) {
  const out = []
  for (const id of (Array.isArray(list) ? list : [])) {
    if (!ROW_IDS.includes(id) || taken.has(id)) continue
    taken.add(id); out.push(id)
  }
  return out
}
// Normalize any stored value into a complete, duplicate-free arrangement. Rows
// added by a later version of Bloom fall in wherever the default puts them, so
// a saved layout never hides a new option outright.
export function normalizeTaskMenu(raw) {
  const taken = new Set()
  const primary = clean(raw?.primary, taken)
  const more = clean(raw?.more, taken)
  for (const id of DEFAULT_PRIMARY) if (!taken.has(id)) { taken.add(id); primary.push(id) }
  for (const id of DEFAULT_MORE)    if (!taken.has(id)) { taken.add(id); more.push(id) }
  return { primary, more }
}
export function defaultTaskMenu() { return { primary: [...DEFAULT_PRIMARY], more: [...DEFAULT_MORE] } }

export function getTaskMenu() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (raw && typeof raw === 'object') return normalizeTaskMenu(raw)
  } catch {}
  return defaultTaskMenu()
}
function emit() { try { window.dispatchEvent(new Event(TASK_MENU_EVENT)) } catch {} }
export function setTaskMenu(next) {
  const clean = normalizeTaskMenu(next)
  try { localStorage.setItem(KEY, JSON.stringify(clean)) } catch {}
  emit()
  return clean
}
export function resetTaskMenu() {
  try { localStorage.removeItem(KEY) } catch {}
  emit()
  return defaultTaskMenu()
}
export function isDefaultTaskMenu(menu) {
  const d = defaultTaskMenu()
  return JSON.stringify(normalizeTaskMenu(menu)) === JSON.stringify(d)
}

// Move a row within its list, or between the two lists.
export function moveRow(menu, id, dir) {
  const m = normalizeTaskMenu(menu)
  const list = m.primary.includes(id) ? 'primary' : 'more'
  const arr = [...m[list]]
  const i = arr.indexOf(id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= arr.length) return m
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
  return { ...m, [list]: arr }
}
export function setRowList(menu, id, list) {
  const m = normalizeTaskMenu(menu)
  if (m[list].includes(id)) return m
  const other = list === 'primary' ? 'more' : 'primary'
  return { ...m, [other]: m[other].filter(x => x !== id), [list]: [...m[list], id] }
}

// src/lib/labels.js
// ─────────────────────────────────────────────────────────────
// Labels, extended.
//
// A label (what Settings calls a "category") used to be just a colored tag on a
// task. It can now do two more things:
//
//   1. LINK TO A RECORD FOLDER. Tag a task "Rental" and — if that label is
//      linked to the Rental tracker in Records — the task files itself into
//      that folder, so it counts toward the folder's money/hours/informatics
//      without being retyped. A label can link to several folders; the task
//      then lands in each of them.
//
//   2. RESHAPE THE ADD-TASK FORM. A record label can carry its own fields
//      (amount, hours, miles, who, a photo of the bill, anything). Pick that
//      label on a new task and those fields appear in the sheet, so everything
//      the user's book-keeping needs is captured at the moment the task is
//      made. Each field knows where it belongs on a tracker entry, so saving
//      the task writes a proper entry — not a note to transcribe later.
//
// The label rows themselves live in the `categories` table (id/label/color/
// icon). Everything above is extra, so it rides one synced kv_store blob
// (`label_meta`) keyed by label id — the same shape-without-a-migration trick
// commitment_meta and recurring_meta already use.
//
// Pure data + helpers; no React.
// ─────────────────────────────────────────────────────────────

// ── Field types ─────────────────────────────────────────────────
// `maps` is where the field's value lands on a tracker entry. Types with no
// `maps` are still recorded — they ride along in the entry's `extra` map and
// show up in the folder's entry list, PDF and CSV.
export const FIELD_TYPES = [
  { id: 'money',     name: 'Amount of money', hint: 'Money in or out — which one is decided by the folder category below.', maps: 'amount' },
  { id: 'hours',     name: 'Time spent',      hint: 'Hours and minutes of your own time.', maps: 'yourMins' },
  { id: 'miles',     name: 'Miles driven',    hint: 'Counts toward the folder’s mileage deduction.', maps: 'miles' },
  { id: 'person',    name: 'Person / who',    hint: 'Who it was paid to, or who did the work.', maps: 'person' },
  { id: 'startDate', name: 'Work started',    hint: 'A date — pairs with “Work finished” for turnaround.', maps: 'workStart' },
  { id: 'endDate',   name: 'Work finished',   hint: 'A date — pairs with “Work started”.', maps: 'workEnd' },
  { id: 'photo',     name: 'Photo / receipt', hint: 'Attach a bill or receipt image.', maps: 'bill' },
  { id: 'text',      name: 'Short text',      hint: 'One line — becomes the entry’s note.', maps: 'note' },
  { id: 'note',      name: 'Long note',       hint: 'A paragraph — becomes the entry’s note.', maps: 'note' },
  { id: 'number',    name: 'Number',          hint: 'Any count or measurement.', maps: null },
  { id: 'choice',    name: 'Pick from a list', hint: 'Your own options, chosen with one tap.', maps: null },
  { id: 'date',      name: 'Date',            hint: 'Any other date you want on the record.', maps: null },
  { id: 'check',     name: 'Yes / no',        hint: 'A simple tick box.', maps: null },
]
export function fieldType(id) { return FIELD_TYPES.find(t => t.id === id) || FIELD_TYPES[0] }

let _fid = 0
export function makeField(type = 'money', name = '') {
  const t = fieldType(type)
  return { id: 'lf-' + Date.now().toString(36) + (_fid++).toString(36), type: t.id, name: name || t.name, options: [] }
}

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0 }
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── The meta blob ───────────────────────────────────────────────
// Shape: { [labelId]: { folders: [{ folderId, categoryId }], fields: [field] } }
export function normalizeLabelMeta(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [id, v] of Object.entries(raw)) {
    if (!v || typeof v !== 'object') continue
    const folders = Array.isArray(v.folders)
      ? v.folders.filter(f => f && f.folderId).map(f => ({ folderId: f.folderId, categoryId: f.categoryId || '' }))
      : []
    const fields = Array.isArray(v.fields)
      ? v.fields.filter(f => f && f.id).map(f => ({
          id: f.id, type: fieldType(f.type).id, name: (f.name || '').trim() || fieldType(f.type).name,
          options: Array.isArray(f.options) ? f.options.filter(Boolean).map(String) : [],
        }))
      : []
    if (folders.length || fields.length) out[id] = { folders, fields }
  }
  return out
}

// ── Module register ─────────────────────────────────────────────
// The add sheet is opened from a dozen places, so rather than thread the meta
// through every call site, App mirrors it here on load and after each edit —
// the same pattern lib/wellness.js uses for the emotion palette.
let _meta = {}
let _folders = []
export function registerLabelMeta(map) { _meta = normalizeLabelMeta(map) }
export function registerRecordFolders(list) { _folders = Array.isArray(list) ? list : [] }
export function allLabelMeta() { return _meta }
export function recordFolders() { return _folders }
export function folderById(id) { return _folders.find(f => f.id === id) || null }
export function labelMetaFor(labelId) { return _meta[labelId] || { folders: [], fields: [] } }
export function isRecordLabel(labelId) { return labelMetaFor(labelId).folders.length > 0 }

// Every (label → folder) link carried by a set of label ids, skipping links to
// folders that no longer exist. One entry per label/folder pair.
export function recordLinksForCats(catIds = []) {
  const out = []
  for (const id of catIds) {
    for (const link of labelMetaFor(id).folders) {
      const folder = folderById(link.folderId)
      if (!folder) continue
      out.push({ labelId: id, folderId: link.folderId, categoryId: link.categoryId || '', folder })
    }
  }
  return out
}
// The distinct folders a set of labels files into.
export function recordFoldersForCats(catIds = []) {
  const seen = new Set()
  return recordLinksForCats(catIds).filter(l => !seen.has(l.folderId) && seen.add(l.folderId)).map(l => l.folder)
}
// The custom fields a set of labels contributes, each tagged with the label it
// came from so the sheet can group them and the entry builder can tell which
// folder they belong to.
export function fieldsForCats(catIds = [], categories = []) {
  const out = []
  for (const id of catIds) {
    const meta = labelMetaFor(id)
    if (!meta.fields.length) continue
    const cat = categories.find(c => c.id === id)
    for (const f of meta.fields) out.push({ ...f, labelId: id, labelName: cat?.label || id, labelColor: cat?.color || '#8899AA' })
  }
  return out
}

// ── Formatting ──────────────────────────────────────────────────
export function fieldValueText(field, value) {
  if (value == null || value === '') return ''
  switch (field.type) {
    case 'hours': { const m = num(value); const h = Math.floor(m / 60), r = m % 60; return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m` }
    case 'check': return value ? 'Yes' : 'No'
    case 'money': return String(num(value))
    case 'photo': return 'attached'
    default: return String(value)
  }
}
// True when a value counts as "filled in" (0 and false are deliberately empty).
export function hasValue(field, value) {
  if (value == null || value === '') return false
  if (field.type === 'check') return !!value
  if (field.type === 'money' || field.type === 'number' || field.type === 'miles' || field.type === 'hours') return num(value) > 0
  return true
}

// ── Task → tracker entry ────────────────────────────────────────
// Build the tracker-entry payload one task should contribute to one folder.
// `values` is the task's captured field values ({ [fieldId]: value }).
export function buildTaskEntry({ task, link, fields = [], values = {} }) {
  const mine = fields.filter(f => f.labelId === link.labelId || labelMetaFor(f.labelId).folders.some(l => l.folderId === link.folderId))
  const entry = {
    date: task.date || todayStr(),
    categoryId: link.categoryId || '',
    amount: 0, yourMins: 0, miles: 0, workStart: '', workEnd: '', note: '', bill: '',
    extra: {},
  }
  const notes = []
  let personName = ''
  for (const f of mine) {
    const v = values[f.id]
    if (!hasValue(f, v)) continue
    switch (fieldType(f.type).maps) {
      case 'amount':    entry.amount   = num(v); break
      case 'yourMins':  entry.yourMins = num(v); break
      case 'miles':     entry.miles    = num(v); break
      case 'workStart': entry.workStart = String(v); break
      case 'workEnd':   entry.workEnd   = String(v); break
      case 'bill':      entry.bill      = String(v); break
      case 'person':    personName      = String(v).trim(); break
      case 'note':      notes.push(String(v).trim()); break
      default:          entry.extra[f.name] = fieldValueText(f, v)
    }
  }
  // A task with no time field of its own still contributes the time it was
  // scheduled for — that's what puts a plain tagged task in the folder's hours.
  if (!entry.yourMins && task.durationMins) entry.yourMins = num(task.durationMins)
  entry.note = notes.length ? notes.join(' · ') : (task.text || '').trim()
  entry.personName = personName
  return entry
}

// A stable id, so re-saving a task updates its entry instead of adding another.
export function taskEntryId(taskId, folderId) { return `e-task-${taskId}-${folderId}` }

// Reconcile the tracker entries generated by one task: create/refresh one per
// linked folder, and drop any that a label change orphaned. Returns the next
// entries array (or the same array when nothing changed).
export function syncTaskEntries({ entries = [], task, catIds = [], values = {}, categories = [], resolvePerson = null }) {
  if (!task?.id) return entries
  const taskId = task.id
  const links = recordLinksForCats(catIds)
  const fields = fieldsForCats(catIds, categories)
  const keep = new Set(links.map(l => taskEntryId(taskId, l.folderId)))
  const rest = entries.filter(e => e.taskId !== taskId || keep.has(e.id))
  let next = rest
  for (const link of links) {
    const id = taskEntryId(taskId, link.folderId)
    const built = buildTaskEntry({ task, link, fields, values })
    const { personName, ...core } = built
    const personId = personName && resolvePerson ? resolvePerson(link.folderId, personName) : null
    const prev = next.find(e => e.id === id)
    const row = {
      ...(prev || {}), id, folderId: link.folderId, taskId, source: 'task',
      ...core, personId: personId || prev?.personId || '',
      createdAt: prev?.createdAt || new Date().toISOString(),
    }
    next = prev ? next.map(e => e.id === id ? row : e) : [...next, row]
  }
  const changed = next.length !== entries.length || next.some((e, i) => e !== entries[i])
  return changed ? next : entries
}

// Drop everything a deleted task put in the folders.
export function removeTaskEntries(entries = [], taskId) {
  const next = entries.filter(e => e.taskId !== taskId)
  return next.length === entries.length ? entries : next
}

// ── Merging two record folders ──────────────────────────────────
// When two folders become one, a task that was filing into both was being
// recorded twice — once per folder. Merging collapses those duplicates back
// into a single entry, so the task is singular again.
export function mergeFolders({ folders, entries, people, sourceId, targetId }) {
  const src = folders.find(f => f.id === sourceId)
  const dst = folders.find(f => f.id === targetId)
  if (!src || !dst || sourceId === targetId) return null

  // Categories: reuse a same-named category on the target, otherwise carry the
  // source's over (keeping its id so its entries stay filed correctly).
  const dstCats = [...(dst.categories || [])]
  const catMap = {}
  for (const c of (src.categories || [])) {
    const match = dstCats.find(d => d.name.trim().toLowerCase() === c.name.trim().toLowerCase() && d.kind === c.kind)
    if (match) catMap[c.id] = match.id
    else { dstCats.push(c); catMap[c.id] = c.id }
  }
  const mergedFolder = {
    ...dst,
    categories: dstCats,
    fixedCosts: [...(dst.fixedCosts || []), ...(src.fixedCosts || []).map(c => ({ ...c, categoryId: catMap[c.categoryId] || c.categoryId }))],
    budgetMoney: dst.budgetMoney != null || src.budgetMoney != null ? (Number(dst.budgetMoney) || 0) + (Number(src.budgetMoney) || 0) || null : null,
    budgetHours: dst.budgetHours != null || src.budgetHours != null ? (Number(dst.budgetHours) || 0) + (Number(src.budgetHours) || 0) || null : null,
  }
  const nextFolders = folders.filter(f => f.id !== sourceId).map(f => f.id === targetId ? mergedFolder : f)

  // People move across; a same-named person on the target absorbs them.
  const personMap = {}
  const nextPeople = []
  for (const p of people) {
    if (p.folderId !== sourceId) { nextPeople.push(p); continue }
    const match = people.find(q => q.folderId === targetId && q.name.trim().toLowerCase() === p.name.trim().toLowerCase())
    if (match) { personMap[p.id] = match.id; continue }
    personMap[p.id] = p.id
    nextPeople.push({ ...p, folderId: targetId })
  }

  // Entries move across, then task-generated duplicates collapse.
  const moved = entries.map(e => e.folderId === sourceId
    ? { ...e, folderId: targetId, categoryId: catMap[e.categoryId] || e.categoryId, personId: personMap[e.personId] || e.personId, id: e.taskId ? taskEntryId(e.taskId, targetId) : e.id }
    : e)
  const seen = new Map()
  const nextEntries = []
  let collapsed = 0
  for (const e of moved) {
    const key = e.taskId ? `${e.taskId}@${e.folderId}` : null
    if (key && seen.has(key)) {
      // Same task, same folder now — fold the second copy into the first so the
      // task reads as one record rather than two.
      const first = nextEntries[seen.get(key)]
      nextEntries[seen.get(key)] = {
        ...first,
        amount: Math.max(Number(first.amount) || 0, Number(e.amount) || 0),
        yourMins: Math.max(Number(first.yourMins) || 0, Number(e.yourMins) || 0),
        miles: Math.max(Number(first.miles) || 0, Number(e.miles) || 0),
        note: first.note || e.note,
        bill: first.bill || e.bill,
        workStart: first.workStart || e.workStart,
        workEnd: first.workEnd || e.workEnd,
        extra: { ...(e.extra || {}), ...(first.extra || {}) },
      }
      collapsed++
      continue
    }
    if (key) seen.set(key, nextEntries.length)
    nextEntries.push(e)
  }
  return { folders: nextFolders, people: nextPeople, entries: nextEntries, collapsed, name: dst.name, from: src.name }
}

// Re-point a label's folder links after a merge, so tags keep working.
export function remapLabelFolders(meta, sourceId, targetId) {
  const out = {}
  let touched = false
  for (const [id, v] of Object.entries(meta || {})) {
    const folders = (v.folders || []).map(f => f.folderId === sourceId ? { ...f, folderId: targetId } : f)
    const seen = new Set()
    const deduped = folders.filter(f => !seen.has(f.folderId) && seen.add(f.folderId))
    if (deduped.length !== (v.folders || []).length || deduped.some((f, i) => f.folderId !== v.folders[i].folderId)) touched = true
    out[id] = { ...v, folders: deduped }
  }
  return touched ? out : meta
}

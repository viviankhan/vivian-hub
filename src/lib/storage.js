// src/lib/storage.js
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const USE_SUPABASE = !!(SUPABASE_URL && SUPABASE_KEY)

// Force every request to bypass HTTP caching — a cached GET response for a
// kv_store row would silently show stale (pre-delete) data after a real write
// already succeeded, which looks exactly like "my delete didn't stick".
const noCacheFetch = (url, options) => fetch(url, { ...options, cache: 'no-store' })

export const supabase = USE_SUPABASE
  ? createClient(SUPABASE_URL, SUPABASE_KEY, { global: { fetch: noCacheFetch } })
  : null
export const isUsingSupabase = USE_SUPABASE

// ── localStorage helpers ───────────────────────────────────────
async function lsGet(key) {
  try { const r = localStorage.getItem('vivian_'+key); return r ? JSON.parse(r) : null } catch { return null }
}
async function lsSet(key, value) {
  try { localStorage.setItem('vivian_'+key, JSON.stringify(value)) } catch {}
}

// ── In-flight write tracking ────────────────────────────────────
// Cloud writes are async — refreshing or closing the tab right after an edit
// can cancel the request mid-flight, which looks exactly like "my delete
// didn't save". Warn before the tab closes/reloads while any dbSet is pending.
let pendingWrites = 0
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', e => {
    if (pendingWrites > 0) { e.preventDefault(); e.returnValue = '' }
  })
}

// ── KV store ───────────────────────────────────────────────────
export async function dbGet(key) {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('kv_store').select('value').eq('key', key).maybeSingle()
    if (error) console.error(`[storage] dbGet('${key}') failed:`, error.message)
    return data?.value ?? null
  }
  return lsGet(key)
}
// Two writes to the same key can be in flight at once (e.g. checking a
// commitment off right as another edit is saving) with no guarantee the
// network responses land in the same order they were sent — whichever
// finishes last wins, even if its payload was built from older local state,
// silently clobbering a newer write (like a delete) with stale data. Chain
// writes per key so each one only starts once the previous one for that same
// key has actually finished, which keeps them landing in the order they were
// called in.
const writeQueues = new Map()

export async function dbSet(key, value) {
  if (USE_SUPABASE) {
    const prevWrite = writeQueues.get(key) || Promise.resolve()
    const thisWrite = prevWrite.then(async () => {
      pendingWrites++
      try {
        const { error } = await supabase.from('kv_store').upsert({ key, value, updated_at: new Date().toISOString() })
        if (error) throw new Error(`Cloud save failed for "${key}": ${error.message}`)
      } finally {
        pendingWrites--
      }
    })
    // Swallow errors here only so the queue keeps moving for the next write —
    // the real error is still thrown to whoever called this dbSet, below.
    writeQueues.set(key, thisWrite.catch(() => {}))
    return thisWrite
  }
  lsSet(key, value)
}

// ── Task completion state ───────────────────────────────────────
// Real per-row table — replaces the old "todos" + "week_state" blobs,
// which were confirmed duplicate mirrors of the exact same data (every
// write put the same value in both under the same key; every read was
// todos[k] || weekState[k]). A row existing means done; toggling one
// item's checkbox is one row write, never a whole-map overwrite.
export async function getCompletions() {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('task_completions').select('storage_key, done')
    if (error) { console.error('[storage] getCompletions failed:', error.message); return {} }
    const out = {}
    ;(data || []).forEach(r => { if (r.done) out[r.storage_key] = true })
    return out
  }
  return (await lsGet('completions')) ?? {}
}
export async function setCompletion(storageKey, done) {
  if (USE_SUPABASE) {
    if (done) {
      const { error } = await supabase.from('task_completions')
        .upsert({ storage_key: storageKey, done: true, updated_at: new Date().toISOString() })
      if (error) throw new Error(`Failed to save completion for "${storageKey}": ${error.message}`)
    } else {
      const { error } = await supabase.from('task_completions').delete().eq('storage_key', storageKey)
      if (error) throw new Error(`Failed to clear completion for "${storageKey}": ${error.message}`)
    }
    return
  }
  const all = (await lsGet('completions')) ?? {}
  if (done) all[storageKey] = true; else delete all[storageKey]
  await lsSet('completions', all)
}

// ── Activity log ─────────────────────────────────────────────────
export async function getLogEntries() {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('log_entries').select('*').order('ts', { ascending: true })
    if (error) { console.error('[storage] getLogEntries failed:', error.message); return [] }
    return (data || []).map(r => ({ date:r.date, dateLabel:r.date_label, label:r.label, tag:r.tag, storageKey:r.storage_key, ts:r.ts }))
  }
  return (await lsGet('log')) ?? []
}
export async function addLogEntry(entry) {
  if (USE_SUPABASE) {
    const { error } = await supabase.from('log_entries').insert({
      date: entry.date, date_label: entry.dateLabel, label: entry.label, tag: entry.tag,
      storage_key: entry.storageKey, ts: entry.ts || new Date().toISOString(),
    })
    if (error) throw new Error(`Failed to add log entry: ${error.message}`)
    return
  }
  const all = (await lsGet('log')) ?? []
  await lsSet('log', [...all, entry])
}
// Removes the most recent log entry matching label+storageKey; falls back to
// the most recent entry matching label alone (entries saved without a
// storageKey) — mirrors the exact matching logic the old uncheck handler used.
export async function deleteLogEntry(label, storageKey) {
  if (USE_SUPABASE) {
    const { data: exact, error: e1 } = await supabase.from('log_entries')
      .select('id').eq('label', label).eq('storage_key', storageKey)
    if (e1) throw new Error(`Failed to look up log entry: ${e1.message}`)
    if (exact && exact.length > 0) {
      const { error: e2 } = await supabase.from('log_entries').delete().in('id', exact.map(r => r.id))
      if (e2) throw new Error(`Failed to delete log entry: ${e2.message}`)
      return
    }
    const { data: latest, error: e3 } = await supabase.from('log_entries')
      .select('id').eq('label', label).order('ts', { ascending:false }).limit(1).maybeSingle()
    if (e3) throw new Error(`Failed to look up log entry: ${e3.message}`)
    if (latest) {
      const { error: e4 } = await supabase.from('log_entries').delete().eq('id', latest.id)
      if (e4) throw new Error(`Failed to delete log entry: ${e4.message}`)
    }
    return
  }
  const all = (await lsGet('log')) ?? []
  const next = all.filter(e => !(e.label === label && e.storageKey === storageKey))
  const next2 = next.length < all.length ? next : all.filter((e, i) => {
    if (e.label !== label) return true
    const laterIdx = all.findIndex((e2, i2) => i2 > i && e2.label === label)
    return laterIdx !== -1
  })
  await lsSet('log', next2)
}

export const getNotes          = () => dbGet('notes').then(v => v ?? '')
export const setNotes          = v  => dbSet('notes', v)
export const getFcProgress     = () => dbGet('fc_progress').then(v => v ?? {})
export const setFcProgress     = v  => dbSet('fc_progress', v)
export const getFcStudied      = () => dbGet('fc_studied').then(v => v ?? {})
export const setFcStudied      = v  => dbSet('fc_studied', v)
export const getScheduledTasks = () => dbGet('scheduled_tasks').then(v => v ?? [])
export const setScheduledTasks = v  => dbSet('scheduled_tasks', v)

// ── Classes ────────────────────────────────────────────────────
export async function getClasses() {
  if (USE_SUPABASE) {
    const { data } = await supabase.from('classes').select('*').order('sort_order')
    return data ?? []
  }
  return (await lsGet('classes')) ?? []
}
export async function addClass(cls) {
  if (USE_SUPABASE) {
    const { data } = await supabase.from('classes').insert(cls).select().single()
    return data
  }
  const all = (await lsGet('classes')) ?? []
  const created = { ...cls, id: 'cls-' + Date.now(), created_at: new Date().toISOString() }
  await lsSet('classes', [...all, created])
  return created
}
export async function deleteClass(id) {
  if (USE_SUPABASE) { await supabase.from('classes').delete().eq('id', id); return }
  const all = (await lsGet('classes')) ?? []
  await lsSet('classes', all.filter(c => c.id !== id))
}

// ── Weeks / Folders (supports parent_id for nesting) ───────────
export async function getWeeks(classId, parentId = null) {
  if (USE_SUPABASE) {
    let q = supabase.from('study_weeks').select('*').eq('class_id', classId).order('sort_order')
    // parentId null = top-level, parentId = UUID = sub-folders
    if (parentId === null) {
      q = q.is('parent_id', null)
    } else {
      q = q.eq('parent_id', parentId)
    }
    const { data } = await q
    return data ?? []
  }
  // localStorage: key encodes both classId and parentId
  const key = parentId ? `subweeks_${parentId}` : `weeks_${classId}`
  return (await lsGet(key)) ?? []
}
export async function addWeek(week) {
  if (USE_SUPABASE) {
    const { data } = await supabase.from('study_weeks').insert(week).select().single()
    return data
  }
  const parentId = week.parent_id ?? null
  const key = parentId ? `subweeks_${parentId}` : `weeks_${week.class_id}`
  const all = (await lsGet(key)) ?? []
  const created = { ...week, id: 'wk-' + Date.now(), created_at: new Date().toISOString() }
  await lsSet(key, [...all, created])
  return created
}
export async function deleteWeek(id, classId, parentId = null) {
  if (USE_SUPABASE) { await supabase.from('study_weeks').delete().eq('id', id); return }
  const key = parentId ? `subweeks_${parentId}` : `weeks_${classId}`
  const all = (await lsGet(key)) ?? []
  await lsSet(key, all.filter(w => w.id !== id))
}

// ── Flashcards ─────────────────────────────────────────────────
export async function getCards(weekId) {
  if (USE_SUPABASE) {
    const { data } = await supabase.from('flashcards').select('*').eq('week_id', weekId).order('created_at')
    return data ?? []
  }
  return (await lsGet('cards_'+weekId)) ?? []
}
export async function importCards(cards) {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('flashcards').upsert(cards, { onConflict: 'id' }).select()
    if (error) throw error
    return data
  }
  const byWeek = {}
  cards.forEach(c => { if (!byWeek[c.week_id]) byWeek[c.week_id] = []; byWeek[c.week_id].push(c) })
  for (const [wid, wCards] of Object.entries(byWeek)) {
    const existing = (await lsGet('cards_'+wid)) ?? []
    const merged = [...existing.filter(e => !wCards.find(n => n.id === e.id)), ...wCards]
    await lsSet('cards_'+wid, merged)
  }
  return cards
}
export async function updateCard(card) {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('flashcards').upsert(card, { onConflict: 'id' }).select().single()
    if (error) throw error
    return data
  }
  const all = (await lsGet('cards_'+card.week_id)) ?? []
  const next = all.map(c => c.id === card.id ? card : c)
  await lsSet('cards_'+card.week_id, next)
  return card
}

// ── Quick Links (Google Drive shortcuts) ───────────────────────
export const getQuickLinks = () => dbGet('quick_links').then(v => v ?? [])
export const setQuickLinks = v  => dbSet('quick_links', v)

export async function deleteCard(id, weekId) {
  if (USE_SUPABASE) { await supabase.from('flashcards').delete().eq('id', id); return }
  const all = (await lsGet('cards_'+weekId)) ?? []
  await lsSet('cards_'+weekId, all.filter(c => c.id !== id))
}

// ── Files ──────────────────────────────────────────────────────
export async function getFiles(weekId) {
  if (USE_SUPABASE) {
    const { data } = await supabase.from('study_files').select('*').eq('week_id', weekId).order('created_at')
    return data ?? []
  }
  return (await lsGet('files_'+weekId)) ?? []
}
export async function uploadFile(weekId, file) {
  const addedDate = new Date().toISOString().split('T')[0]
  if (USE_SUPABASE) {
    const path = `${weekId}/${Date.now()}_${file.name}`
    const { error: upErr } = await supabase.storage.from('study-files').upload(path, file)
    if (upErr) throw upErr
    const { data: urlData } = supabase.storage.from('study-files').getPublicUrl(path)
    const record = {
      week_id: weekId, file_name: file.name, storage_path: path,
      file_url: urlData.publicUrl, file_size: Math.round(file.size/1024), added_date: addedDate,
    }
    const { data } = await supabase.from('study_files').insert(record).select().single()
    return data
  }
  // localStorage fallback: store metadata only (no file contents — too large)
  // File won't be downloadable but will persist across reloads
  const record = {
    id: 'f-'+Date.now(), week_id: weekId, file_name: file.name,
    file_url: null, file_size: Math.round(file.size/1024), added_date: addedDate,
  }
  const all = (await lsGet('files_'+weekId)) ?? []
  await lsSet('files_'+weekId, [...all, record])
  return record
}
// ── Routines (editable, persisted) ────────────────────────────
export const getRoutines      = () => dbGet('routines').then(v => v ?? { morning: null, night: null })
export const setRoutines      = v  => dbSet('routines', v)
export const getRoutineLog    = () => dbGet('routine_log').then(v => v ?? {})
export const setRoutineLog    = v  => dbSet('routine_log', v)

export async function deleteStudyFile(id, weekId, storagePath) {
  if (USE_SUPABASE) {
    if (storagePath) await supabase.storage.from('study-files').remove([storagePath])
    await supabase.from('study_files').delete().eq('id', id)
    return
  }
  const all = (await lsGet('files_'+weekId)) ?? []
  await lsSet('files_'+weekId, all.filter(f => f.id !== id))
}

// ── Commitments ──────────────────────────────────────────────────
function commitmentFromDb(row) {
  return {
    id: row.id, text: row.text, date: row.date, time: row.time,
    prepMin: row.prep_min, durationMins: row.duration_mins,
    cat: row.cat, person: row.person, done: row.done, createdAt: row.created_at,
  }
}
const COMMITMENT_FIELD_MAP = { prepMin:'prep_min', durationMins:'duration_mins', createdAt:'created_at' }
export function commitmentChangesToDb(changes) {
  const out = {}
  for (const [k, v] of Object.entries(changes)) out[COMMITMENT_FIELD_MAP[k] || k] = v
  return out
}
export async function getCommitments() {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('commitments').select('*')
    if (error) { console.error('[storage] getCommitments failed:', error.message); return [] }
    return (data || []).map(commitmentFromDb)
  }
  return (await lsGet('commitments')) ?? []
}
export async function addCommitment(c) {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('commitments')
      .insert(commitmentChangesToDb({ ...c, createdAt: c.createdAt || new Date().toISOString() })).select().single()
    if (error) throw new Error(`Failed to add commitment: ${error.message}`)
    return commitmentFromDb(data)
  }
  const all = (await lsGet('commitments')) ?? []
  await lsSet('commitments', [...all, c])
  return c
}
export async function updateCommitment(id, changes) {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('commitments')
      .update(commitmentChangesToDb(changes)).eq('id', id).select().single()
    if (error) throw new Error(`Failed to update commitment: ${error.message}`)
    return commitmentFromDb(data)
  }
  const all = (await lsGet('commitments')) ?? []
  const next = all.map(c => c.id===id ? { ...c, ...changes } : c)
  await lsSet('commitments', next)
  return next.find(c => c.id===id)
}
export async function deleteCommitment(id) {
  if (USE_SUPABASE) {
    const { error } = await supabase.from('commitments').delete().eq('id', id)
    if (error) throw new Error(`Failed to delete commitment: ${error.message}`)
    return
  }
  const all = (await lsGet('commitments')) ?? []
  await lsSet('commitments', all.filter(c => c.id !== id))
}

// ── Vacations / time-off blocks ──────────────────────────────────
function vacationFromDb(row) {
  return { id: row.id, label: row.label, startDate: row.start_date, endDate: row.end_date }
}
export async function getVacations() {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('vacations').select('*')
    if (error) { console.error('[storage] getVacations failed:', error.message); return [] }
    return (data || []).map(vacationFromDb)
  }
  return (await lsGet('vacations')) ?? []
}
export async function addVacation(v) {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('vacations')
      .insert({ id: v.id, label: v.label, start_date: v.startDate, end_date: v.endDate }).select().single()
    if (error) throw new Error(`Failed to add vacation: ${error.message}`)
    return vacationFromDb(data)
  }
  const all = (await lsGet('vacations')) ?? []
  await lsSet('vacations', [...all, v])
  return v
}
export async function deleteVacation(id) {
  if (USE_SUPABASE) {
    const { error } = await supabase.from('vacations').delete().eq('id', id)
    if (error) throw new Error(`Failed to delete vacation: ${error.message}`)
    return
  }
  const all = (await lsGet('vacations')) ?? []
  await lsSet('vacations', all.filter(v => v.id !== id))
}

// ── Recurring Tasks (editable weekly schedule templates) ────────
// One row per task — "text" (week type) vs "label"+"note" (today type) both
// map onto a single "label"/"note" pair of columns; "tag" is kept as an alias
// of "cat" on the returned object since some UI code reads either name.
function recurringTaskFromDb(row) {
  const base = {
    id: row.id, type: row.type, days: row.days || [], cat: row.cat, tag: row.cat,
    startDate: row.start_date, endDate: row.end_date,
  }
  return row.type === 'week'
    ? { ...base, text: row.label, carry: row.carry }
    : { ...base, label: row.label, note: row.note || '' }
}
export function recurringTaskToDb(task) {
  return {
    id: task.id, type: task.type, cat: task.cat || task.tag || 'lab',
    days: task.days || [], start_date: task.startDate || null, end_date: task.endDate || null,
    label: task.type === 'week' ? task.text : task.label,
    note: task.type === 'week' ? null : (task.note || null),
    carry: task.type === 'week' ? !!task.carry : false,
  }
}
export async function getRecurringTasks() {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('recurring_tasks').select('*')
    if (error) { console.error('[storage] getRecurringTasks failed:', error.message); return [] }
    return (data || []).map(recurringTaskFromDb)
  }
  return (await lsGet('recurring_tasks_v2')) ?? []
}
export async function addRecurringTask(task) {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('recurring_tasks').insert(recurringTaskToDb(task)).select().single()
    if (error) throw new Error(`Failed to add recurring task: ${error.message}`)
    return recurringTaskFromDb(data)
  }
  const all = (await lsGet('recurring_tasks_v2')) ?? []
  await lsSet('recurring_tasks_v2', [...all, task])
  return task
}
export async function updateRecurringTask(id, task) {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('recurring_tasks').update(recurringTaskToDb(task)).eq('id', id).select().single()
    if (error) throw new Error(`Failed to update recurring task: ${error.message}`)
    return recurringTaskFromDb(data)
  }
  const all = (await lsGet('recurring_tasks_v2')) ?? []
  const next = all.map(t => t.id===id ? task : t)
  await lsSet('recurring_tasks_v2', next)
  return task
}
export async function deleteRecurringTask(id) {
  if (USE_SUPABASE) {
    const { error } = await supabase.from('recurring_tasks').delete().eq('id', id)
    if (error) throw new Error(`Failed to delete recurring task: ${error.message}`)
    return
  }
  const all = (await lsGet('recurring_tasks_v2')) ?? []
  await lsSet('recurring_tasks_v2', all.filter(t => t.id !== id))
}
export async function clearRecurringTasks() {
  if (USE_SUPABASE) {
    const { error } = await supabase.from('recurring_tasks').delete().not('id', 'is', null)
    if (error) throw new Error(`Failed to clear recurring tasks: ${error.message}`)
    return
  }
  await lsSet('recurring_tasks_v2', [])
}

// ── Categories (shared task categories — user-editable) ─────────
// Real per-row table. Commitments and recurring tasks both reference a
// category by id, so making these first-class rows means adding/renaming/
// recoloring one is a single atomic operation and shows up everywhere.
function categoryFromDb(row) {
  return { id: row.id, label: row.label, color: row.color, sortOrder: row.sort_order }
}
export async function getCategories() {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('categories').select('*').order('sort_order')
    if (error) { console.error('[storage] getCategories failed:', error.message); return [] }
    return (data || []).map(categoryFromDb)
  }
  return (await lsGet('categories')) ?? []
}
export async function addCategory(cat) {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('categories')
      .insert({ id: cat.id, label: cat.label, color: cat.color, sort_order: cat.sortOrder ?? 0 }).select().single()
    if (error) throw new Error(`Failed to add category: ${error.message}`)
    return categoryFromDb(data)
  }
  const all = (await lsGet('categories')) ?? []
  await lsSet('categories', [...all, cat])
  return cat
}
export async function updateCategory(id, changes) {
  const dbChanges = {}
  if ('label' in changes)     dbChanges.label = changes.label
  if ('color' in changes)     dbChanges.color = changes.color
  if ('sortOrder' in changes) dbChanges.sort_order = changes.sortOrder
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('categories').update(dbChanges).eq('id', id).select().single()
    if (error) throw new Error(`Failed to update category: ${error.message}`)
    return categoryFromDb(data)
  }
  const all = (await lsGet('categories')) ?? []
  const next = all.map(c => c.id===id ? { ...c, ...changes } : c)
  await lsSet('categories', next)
  return next.find(c => c.id===id)
}
export async function deleteCategory(id) {
  if (USE_SUPABASE) {
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) throw new Error(`Failed to delete category: ${error.message}`)
    return
  }
  const all = (await lsGet('categories')) ?? []
  await lsSet('categories', all.filter(c => c.id !== id))
}

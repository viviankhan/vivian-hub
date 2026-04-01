// src/lib/storage.js
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const USE_SUPABASE = !!(SUPABASE_URL && SUPABASE_KEY)

export const supabase = USE_SUPABASE ? createClient(SUPABASE_URL, SUPABASE_KEY) : null
export const isUsingSupabase = USE_SUPABASE

// ── localStorage helpers ───────────────────────────────────────
async function lsGet(key) {
  try { const r = localStorage.getItem('vivian_'+key); return r ? JSON.parse(r) : null } catch { return null }
}
async function lsSet(key, value) {
  try { localStorage.setItem('vivian_'+key, JSON.stringify(value)) } catch {}
}

// ── KV store ───────────────────────────────────────────────────
export async function dbGet(key) {
  if (USE_SUPABASE) {
    const { data } = await supabase.from('kv_store').select('value').eq('key', key).maybeSingle()
    return data?.value ?? null
  }
  return lsGet(key)
}
export async function dbSet(key, value) {
  if (USE_SUPABASE) {
    await supabase.from('kv_store').upsert({ key, value, updated_at: new Date().toISOString() })
    return
  }
  lsSet(key, value)
}

export const getTodos          = () => dbGet('todos').then(v => v ?? {})
export const setTodos          = v  => dbSet('todos', v)
export const getWeekState      = () => dbGet('week_state').then(v => v ?? {})
export const setWeekState      = v  => dbSet('week_state', v)
export const getLog            = () => dbGet('log').then(v => v ?? [])
export const setLog            = v  => dbSet('log', v)
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
export async function deleteStudyFile(id, weekId, storagePath) {
  if (USE_SUPABASE) {
    if (storagePath) await supabase.storage.from('study-files').remove([storagePath])
    await supabase.from('study_files').delete().eq('id', id)
    return
  }
  const all = (await lsGet('files_'+weekId)) ?? []
  await lsSet('files_'+weekId, all.filter(f => f.id !== id))
}

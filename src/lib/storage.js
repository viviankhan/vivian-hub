// src/lib/storage.js
// ─────────────────────────────────────────────────────────────
// Abstraction layer: uses Supabase when configured, falls back
// to localStorage. The rest of the app only calls these functions
// and never knows which backend is being used.
// ─────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY
const USE_SUPABASE  = !!(SUPABASE_URL && SUPABASE_KEY)

export const supabase = USE_SUPABASE
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null

// ── Low-level get / set ────────────────────────────────────────

export async function dbGet(key) {
  if (USE_SUPABASE) {
    const { data, error } = await supabase
      .from('kv_store')
      .select('value')
      .eq('key', key)
      .maybeSingle()
    if (error) console.error('dbGet', key, error)
    return data?.value ?? null
  }
  try {
    const raw = localStorage.getItem('vivian_' + key)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export async function dbSet(key, value) {
  if (USE_SUPABASE) {
    const { error } = await supabase
      .from('kv_store')
      .upsert({ key, value, updated_at: new Date().toISOString() })
    if (error) console.error('dbSet', key, error)
    return
  }
  try { localStorage.setItem('vivian_' + key, JSON.stringify(value)) } catch {}
}

// ── High-level helpers ─────────────────────────────────────────

export async function getTodos()       { return await dbGet('todos')       ?? {} }
export async function setTodos(v)      { await dbSet('todos', v) }

export async function getWeekState()   { return await dbGet('week_state')  ?? {} }
export async function setWeekState(v)  { await dbSet('week_state', v) }

export async function getLog()         { return await dbGet('log')         ?? [] }
export async function setLog(v)        { await dbSet('log', v) }

export async function getNotes()       { return await dbGet('notes')       ?? '' }
export async function setNotes(v)      { await dbSet('notes', v) }

export async function getFcProgress()  { return await dbGet('fc_progress') ?? {} }
export async function setFcProgress(v) { await dbSet('fc_progress', v) }

export async function getFcStudied()   { return await dbGet('fc_studied')  ?? {} }
export async function setFcStudied(v)  { await dbSet('fc_studied', v) }

export async function getScheduledTasks() { return await dbGet('scheduled_tasks') ?? [] }
export async function setScheduledTasks(v) { await dbSet('scheduled_tasks', v) }

// ── New in this update ─────────────────────────────────────────

// Custom per-day todos Vivian adds through Today tab
// Structure: { 'YYYY-MM-DD': [{ id, label, note, tag }] }
export async function getCustomDailyTodos()  { return await dbGet('custom_daily_todos') ?? {} }
export async function setCustomDailyTodos(v) { await dbSet('custom_daily_todos', v) }

// Study extras: user-added classes, weeks, files, and hidden base files
// Structure: { userClasses, userWeeks, userFiles, hiddenBaseFiles }
export async function getStudyExtras()  { return await dbGet('study_extras') ?? null }
export async function setStudyExtras(v) { await dbSet('study_extras', v) }

// Custom routine definitions (if user has edited them)
// Structure: { morning: [...items], night: [...items] } or null = use schedule.js defaults
export async function getRoutinesCustom()  { return await dbGet('routines_custom') ?? null }
export async function setRoutinesCustom(v) { await dbSet('routines_custom', v) }

// Daily routine check-offs
// Structure: { 'YYYY-MM-DD': { morning: { 'Wake up': true }, night: { ... } } }
export async function getRoutinesDone()  { return await dbGet('routines_done') ?? {} }
export async function setRoutinesDone(v) { await dbSet('routines_done', v) }

// Today-only routine overrides (don't touch the permanent base)
// Structure: { 'YYYY-MM-DD': { morning?: [...items], night?: [...items] } }
export async function getRoutinesTodayOverride()  { return await dbGet('routines_today_override') ?? {} }
export async function setRoutinesTodayOverride(v) { await dbSet('routines_today_override', v) }

// Skipped/rescheduled tasks — tracks template tasks that were removed or moved
// Structure: { 'task-id': { date, label, tag, action:'skipped'|'rescheduled', reason, rescheduledTo?, rescheduledToTime?, ts } }
export async function getSkippedTasks()  { return await dbGet('skipped_tasks') ?? {} }
export async function setSkippedTasks(v) { await dbSet('skipped_tasks', v) }

export const isUsingSupabase = USE_SUPABASE

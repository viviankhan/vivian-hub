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

export const isUsingSupabase = USE_SUPABASE

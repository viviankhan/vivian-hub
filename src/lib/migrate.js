// src/lib/migrate.js
// One-time move off the old "whole JSON blob per category" kv_store rows
// onto real per-row tables (see supabase_setup.sql). Whole-blob storage is
// what caused deletes/edits to silently revert — any two writes to the same
// blob key raced, and whichever response landed last in Supabase won, even
// if it was built from older state. Per-row tables make add/edit/delete
// atomic single-row operations, so that class of bug can't happen anymore.
//
// Safe to run more than once: every insert is an upsert keyed on the item's
// existing id, so re-running just overwrites identical rows rather than
// duplicating anything. Old blob rows are never modified or deleted here —
// they stay as a frozen snapshot/safety net.
import { supabase, isUsingSupabase, dbGet, dbSet, commitmentChangesToDb, recurringTaskToDb } from './storage.js'
import { DEFAULT_CATEGORIES } from '../data/categories.js'

const LEGACY_DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']

// Seed the categories table from the built-in defaults the first time it's
// empty. Gated on emptiness (not on the v2 flag) because existing users have
// already flipped that flag, but still need their categories seeded once.
// Idempotent: does nothing once any category row exists. Returns the
// categories so the caller can use them without a second round trip.
export async function seedCategoriesIfNeeded() {
  if (isUsingSupabase) {
    try {
      const { data, error } = await supabase.from('categories').select('*').order('sort_order')
      if (error) throw new Error(error.message)
      if (data && data.length > 0) return data.map(r => ({ id:r.id, label:r.label, color:r.color, sortOrder:r.sort_order }))
      const rows = DEFAULT_CATEGORIES.map(c => ({ id:c.id, label:c.label, color:c.color, sort_order:c.sortOrder }))
      const { error: insErr } = await supabase.from('categories').upsert(rows, { onConflict: 'id' })
      if (insErr) throw new Error(insErr.message)
      return DEFAULT_CATEGORIES
    } catch (e) {
      console.error('[migrate] category seed failed, will retry next load:', e)
      return DEFAULT_CATEGORIES
    }
  }
  // localStorage mode
  try {
    const existing = JSON.parse(localStorage.getItem('vivian_categories') || 'null')
    if (existing && existing.length > 0) return existing
    localStorage.setItem('vivian_categories', JSON.stringify(DEFAULT_CATEGORIES))
  } catch {}
  return DEFAULT_CATEGORIES
}

async function migrateCommitments() {
  const old = await dbGet('commitments')
  if (!old || old.length === 0) return
  const rows = old.map(c => commitmentChangesToDb({ ...c, createdAt: c.createdAt || new Date().toISOString() }))
  const { error } = await supabase.from('commitments').upsert(rows, { onConflict: 'id' })
  if (error) throw new Error(`Migrate commitments failed: ${error.message}`)
}

async function migrateVacations() {
  const old = await dbGet('vacations')
  if (!old || old.length === 0) return
  const rows = old.map(v => ({ id: v.id, label: v.label, start_date: v.startDate, end_date: v.endDate }))
  const { error } = await supabase.from('vacations').upsert(rows, { onConflict: 'id' })
  if (error) throw new Error(`Migrate vacations failed: ${error.message}`)
}

// Mirrors migrateLegacyTasks() in RecurringTasksManager.jsx — expands the old
// per-day {weekTasks,dailyTodos} shape into flat rows if that's what's stored.
function flattenLegacyRecurringTasks(old) {
  if (Array.isArray(old.tasks)) return old.tasks
  if (!old.weekTasks && !old.dailyTodos) return []
  const flat = []
  const wt = old.weekTasks || {}
  const dt = old.dailyTodos || {}
  LEGACY_DAYS.forEach(day => {
    ;(wt[day] || []).forEach(t => flat.push({ ...t, type:'week', days:[day], startDate:null, endDate:null }))
    ;(dt[day] || []).forEach(t => flat.push({ ...t, type:'today', days:[day], startDate:null, endDate:null }))
  })
  return flat
}

async function migrateRecurringTasks() {
  const old = await dbGet('recurring_tasks')
  if (!old) return
  const flat = flattenLegacyRecurringTasks(old)
  if (flat.length === 0) return
  const rows = flat.map(recurringTaskToDb)
  const { error } = await supabase.from('recurring_tasks').upsert(rows, { onConflict: 'id' })
  if (error) throw new Error(`Migrate recurring tasks failed: ${error.message}`)
}

async function migrateCompletions() {
  const [todos, weekState] = await Promise.all([dbGet('todos'), dbGet('week_state')])
  const merged = { ...(weekState || {}), ...(todos || {}) }
  const rows = Object.entries(merged).filter(([, v]) => v).map(([storage_key]) => ({ storage_key, done: true }))
  if (rows.length === 0) return
  const { error } = await supabase.from('task_completions').upsert(rows, { onConflict: 'storage_key' })
  if (error) throw new Error(`Migrate completions failed: ${error.message}`)
}

async function migrateLog() {
  const old = await dbGet('log')
  if (!old || old.length === 0) return
  // log_entries has no natural id in the old blob to upsert on, so this step
  // isn't idempotent the way the others are — guard with a row-count check
  // instead. Worst case on a retried partial failure is a cosmetic duplicate
  // log line, never lost or clobbered data, so a rough guard is enough here.
  const { count, error: countErr } = await supabase.from('log_entries').select('*', { count:'exact', head:true })
  if (countErr) throw new Error(`Migrate log failed: ${countErr.message}`)
  if (count && count > 0) return
  const rows = old.map(e => ({
    date: e.date, date_label: e.dateLabel, label: e.label, tag: e.tag,
    storage_key: e.storageKey, ts: e.ts || new Date().toISOString(),
  }))
  const { error } = await supabase.from('log_entries').insert(rows)
  if (error) throw new Error(`Migrate log failed: ${error.message}`)
}

export async function runMigrationIfNeeded() {
  if (!isUsingSupabase) return
  const flag = await dbGet('migration_v2_done')
  if (flag?.done) return
  try {
    await migrateCommitments()
    await migrateVacations()
    await migrateRecurringTasks()
    await migrateCompletions()
    await migrateLog()
    await dbSet('migration_v2_done', { done: true, migratedAt: new Date().toISOString() })
  } catch (e) {
    // Flag stays unset — old blobs remain authoritative and nothing is lost,
    // this just retries on the next app load.
    console.error('[migrate] failed, will retry next load:', e)
  }
}

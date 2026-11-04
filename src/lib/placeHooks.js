// src/lib/placeHooks.js
// ─────────────────────────────────────────────────────────────
// Arrive / leave links for iPhone Shortcuts automations.
//
// Bloom can only see your location while it's open. A Shortcuts automation
// ("When I arrive at Guggenheim → open this link") runs in the background, so
// a located time block can start when you really got there and end when you
// really left. Each link carries your private key and the item's id; the
// place-hook function turns a visit into a place_events row (see
// supabase_place_hooks.sql), and Bloom reads those rows here.
// ─────────────────────────────────────────────────────────────
import { supabase, supabaseUrl } from './storage.js'

export const placeHooksAvailable = !!supabase

function newKey() {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

// Your key, made the first time it's asked for. `fresh` replaces it, which
// retires every link made with the old one.
export async function getPlaceHookKey({ fresh = false } = {}) {
  if (!supabase) throw new Error('Arrive/leave links need the cloud account.')
  if (!fresh) {
    const { data, error } = await supabase.from('place_hook_keys').select('key').maybeSingle()
    if (error) throw new Error(error.message)
    if (data?.key) return data.key
  }
  const key = newKey()
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('place_hook_keys').upsert({ user_id: user?.id, key, created_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
  return key
}

export function placeHookUrl(key, taskId, kind) {
  const q = new URLSearchParams({ k: key, t: taskId, e: kind })
  return `${supabaseUrl}/functions/v1/place-hook?${q}`
}

// The last few days of arrivals and departures, oldest first.
export async function fetchPlaceEvents(days = 3) {
  if (!supabase) return []
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const { data, error } = await supabase.from('place_events')
    .select('task_id, kind, at').gte('at', since).order('at', { ascending: true })
  if (error) { console.warn('[Bloom] place events:', error.message); return [] }
  return data || []
}

export { placeStamps } from './placeStamps.js'

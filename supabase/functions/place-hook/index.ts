// supabase/functions/place-hook/index.ts
// ─────────────────────────────────────────────────────────────
// The link an iPhone Shortcut opens when you arrive at or leave a place, so
// Bloom knows where you were even while it's closed. Two forms:
//
//   • A check-in — the same link for every automation. The "Bloom check-in"
//     shortcut fills in where the phone is; Bloom matches it to your places.
//         GET /functions/v1/place-hook?k=<your key>&lat=<latitude>&lng=<longitude>
//
//   • One item's arrive/leave (the first version, kept so old automations
//     still work).
//         GET /functions/v1/place-hook?k=<your key>&t=<item id>&e=arrive|leave
//
// No sign-in (a Shortcut can't sign in): the private key from place_hook_keys
// says whose it is. It writes one place_events row and nothing else. See
// supabase_place_hooks.sql for the tables.
//
//     supabase functions deploy place-hook
// ─────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

// Plain text back, so the Shortcut's result reads as a sentence if you look.
const say = (text: string, status = 200) =>
  new Response(text + '\n', { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })

const db = (path: string, init: RequestInit = {}) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
  ...init,
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
})

// A Shortcut firing twice for one arrival (it happens at the edge of a
// geofence) shouldn't read as leaving and coming back.
const REPEAT_MS = 2 * 60 * 1000
// Two check-ins this close in time and space are the same one.
const PING_REPEAT_MS = 60 * 1000
const PING_REPEAT_DEG = 0.0003

// Shortcuts writes a coordinate as text, in the phone's number format
// ("44.0207" or "44,0207").
const coord = (s: string | null, max: number) => {
  const n = parseFloat(String(s || '').trim().replace(',', '.'))
  return Number.isFinite(n) && Math.abs(n) <= max ? n : null
}

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'POST') return say('Method not allowed', 405)
  const q = new URL(req.url).searchParams
  const key = (q.get('k') || '').trim()
  const task = (q.get('t') || '').trim()
  const kind = (q.get('e') || '').trim()
  const isPing = q.has('lat') || q.has('lng')
  const lat = coord(q.get('lat'), 90)
  const lng = coord(q.get('lng'), 180)
  if (!key) return say('This link is missing a part. Copy it again from Bloom.', 400)
  if (isPing && (lat == null || lng == null)) return say('No location came with this check-in. In the Bloom check-in shortcut, LAT and LNG should be the Latitude and Longitude of Current Location.', 400)
  if (!isPing && (!task || (kind !== 'arrive' && kind !== 'leave'))) return say('This link is missing a part. Copy it again from Bloom.', 400)
  if (task.length > 200) return say('That item id is too long.', 400)

  const found = await db(`place_hook_keys?key=eq.${encodeURIComponent(key)}&select=user_id`)
  if (!found.ok) return say('Bloom could not check the link right now.', 502)
  const [owner] = await found.json()
  if (!owner) return say('This link is no longer active. Copy a fresh one from Bloom.', 403)

  if (isPing) {
    const last = await db(`place_events?user_id=eq.${owner.user_id}&kind=eq.ping&select=lat,lng,at&order=at.desc&limit=1`)
    const [prev] = last.ok ? await last.json() : []
    if (prev && Date.now() - Date.parse(prev.at) < PING_REPEAT_MS
      && Math.abs(prev.lat - lat!) < PING_REPEAT_DEG && Math.abs(prev.lng - lng!) < PING_REPEAT_DEG) return say('Already noted.')
    const put = await db('place_events', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: owner.user_id, kind: 'ping', lat, lng }),
    })
    if (!put.ok) return say('Bloom could not save that.', 502)
    return say('Bloom: checked in.')
  }

  const last = await db(`place_events?user_id=eq.${owner.user_id}&task_id=eq.${encodeURIComponent(task)}&select=kind,at&order=at.desc&limit=1`)
  const [prev] = last.ok ? await last.json() : []
  if (prev && prev.kind === kind && Date.now() - Date.parse(prev.at) < REPEAT_MS) return say('Already noted.')

  const put = await db('place_events', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: owner.user_id, task_id: task, kind }),
  })
  if (!put.ok) return say('Bloom could not save that.', 502)
  return say(kind === 'arrive' ? 'Bloom: noted that you arrived.' : 'Bloom: noted that you left.')
})

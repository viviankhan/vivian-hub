// src/lib/parseReceipt.js
// ─────────────────────────────────────────────────────────────
// Client side of receipt scanning. Sends a downscaled receipt photo (base64) to
// the parse-receipt Supabase Edge Function, which asks Gemini's vision model to
// read it and returns structured fields the expense form pre-fills:
//   { vendor, date, total, currency, category, paidTo, description, miles, lineItems }
// Nothing is saved until the user reviews the draft. The AI key lives only on
// the server — never in this public bundle.
// ─────────────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const ENDPOINT = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/parse-receipt` : ''

// The functions only answer signed-in users, so send this user's session token
// (the anon key alone is refused). Imported lazily so the tests' shim of this
// file stays free of the Supabase client.
async function authToken() {
  try {
    const { supabase } = await import('./storage.js')
    const { data: { session } = {} } = await supabase.auth.getSession()
    return session?.access_token || SUPABASE_KEY
  } catch { return SUPABASE_KEY }
}

// The scan button only shows when Supabase is configured (that's where the
// function lives). Manual entry always works regardless.
export const receiptScanAvailable = !!ENDPOINT

// Parse a receipt. `base64` is the raw JPEG bytes (no data: prefix). `hints`
// carries the user's known expense categories so the model can pick one.
// Returns the structured draft, or throws an Error with a readable message.
export async function scanReceipt(base64, { categories = [] } = {}) {
  if (!ENDPOINT) throw new Error('Receipt scanning needs your Supabase URL configured.')
  if (!base64) throw new Error('No image to scan.')
  const headers = { 'Content-Type': 'application/json' }
  if (SUPABASE_KEY) { headers['apikey'] = SUPABASE_KEY; headers['Authorization'] = `Bearer ${await authToken()}` }

  let res
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        image: base64,
        today: new Date().toISOString().slice(0, 10),
        categories: (categories || []).slice(0, 40),
      }),
    })
  } catch {
    throw new Error('Couldn’t reach the scanner. Check your connection and that the parse-receipt function is deployed.')
  }

  let data = null
  try { data = await res.json() } catch { /* handled below */ }
  if (!res.ok) {
    if (res.status === 404) throw new Error('The parse-receipt function isn’t deployed yet (see RECEIPTS.md).')
    throw new Error((data && data.error) || `Scanner error (${res.status}).`)
  }
  if (!data) throw new Error('The scanner returned an unexpected response.')
  if (data.error && !data.vendor && !(data.total > 0)) throw new Error(data.error)
  return {
    vendor: data.vendor || '',
    date: data.date || '',
    total: Number(data.total) || 0,
    currency: data.currency || '',
    category: data.category || '',
    paidTo: data.paidTo || data.vendor || '',
    description: data.description || '',
    miles: Number(data.miles) || 0,
    lineItems: Array.isArray(data.lineItems) ? data.lineItems : [],
  }
}

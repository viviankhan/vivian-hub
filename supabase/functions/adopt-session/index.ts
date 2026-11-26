// supabase/functions/adopt-session/index.ts
// ─────────────────────────────────────────────────────────────
// Carries a signed-in device across the move to a new Supabase project.
//
// Bloom's first database stopped starting on Nov 20, 2026 (its disk filled and
// could not be cleared on the free plan), so the app moved to a fresh project.
// Passwords live in the old database and could not come along — but every
// device that was signed in still holds the access token the OLD project gave
// it. That token is a signed statement of who the device belongs to, and this
// function still knows the old project's signing secret, so it can check the
// statement and hand the device a one-time sign-in for the same account here.
// Nobody has to type anything.
//
// What it accepts, and nothing else:
//   • a token signed with the old project's secret (HS256)
//   • issued by the old project's auth server, for a signed-in user
//   • for an account that exists in THIS project under the same id
// The token's expiry is deliberately ignored: the old project has been down for
// days, so every token it issued has run out. Instead the whole function stops
// answering after ADOPT_UNTIL, by which time every device has moved.
//
//     supabase secrets set OLD_JWT_SECRET=...   (the old project's JWT secret)
//     supabase functions deploy adopt-session --no-verify-jwt
// ─────────────────────────────────────────────────────────────
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const OLD_SECRET = Deno.env.get('OLD_JWT_SECRET') || ''
const OLD_ISSUER = Deno.env.get('OLD_ISSUER') || 'https://fdvfpbhrojniiqqdnoii.supabase.co/auth/v1'
const ADOPT_UNTIL = Date.parse(Deno.env.get('ADOPT_UNTIL') || '2027-03-01T00:00:00Z')
// A token from before this is older than any device still in use would hold.
const OLDEST_TOKEN = Date.parse('2026-09-01T00:00:00Z') / 1000
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const b64urlToBytes = (s: string) => {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  return Uint8Array.from(atob(pad), c => c.charCodeAt(0))
}

// The claims of a token the old project really signed, or null.
async function verifyOldToken(token: string): Promise<Record<string, unknown> | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])))
    if (header.alg !== 'HS256') return null
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(OLD_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    const ok = await crypto.subtle.verify('HMAC', key, b64urlToBytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]))
    if (!ok) return null
    return JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])))
  } catch { return null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!OLD_SECRET || !SERVICE) return json({ error: 'Not configured.' }, 503)
  if (Date.now() > ADOPT_UNTIL) return json({ error: 'The move is over. Sign in with your password.' }, 410)

  let token = ''
  try { token = String((await req.json())?.old_access_token || '') } catch { /* fall through */ }
  if (!token) return json({ error: 'old_access_token is required.' }, 400)

  const claims = await verifyOldToken(token)
  if (!claims) return json({ error: 'That token was not issued by the old project.' }, 401)
  if (claims.iss !== OLD_ISSUER || claims.role !== 'authenticated' || claims.aud !== 'authenticated') {
    return json({ error: 'Not a signed-in user token.' }, 401)
  }
  const sub = String(claims.sub || '')
  const iat = Number(claims.iat || 0)
  if (!/^[0-9a-f-]{36}$/i.test(sub) || !(iat > OLDEST_TOKEN)) return json({ error: 'Token not usable.' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: found, error: findErr } = await admin.auth.admin.getUserById(sub)
  const user = found?.user
  if (findErr || !user?.email) return json({ error: 'No such account here.' }, 404)

  // A single-use sign-in for that account. Only its hash leaves this function;
  // the app trades it for a session with verifyOtp.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: user.email })
  const tokenHash = link?.properties?.hashed_token
  if (linkErr || !tokenHash) return json({ error: 'Could not start a session.', detail: linkErr?.message || '' }, 500)

  return json({ token_hash: tokenHash, type: 'magiclink', email: user.email, user_id: user.id })
})

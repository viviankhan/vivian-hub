// supabase/functions/ics-proxy/index.ts
// ─────────────────────────────────────────────────────────────
// A tiny CORS-safe fetcher for subscribed calendars. The browser can't fetch a
// published iCloud / Apple Family .ics directly — those feeds don't send CORS
// headers — so Bloom calls this function with ?url=<the feed> and it fetches the
// calendar server-side and hands back the raw .ics with permissive CORS.
//
// It only ever GETs a calendar feed and returns text; it never touches the
// database. Deploy it alongside send-reminders:
//     supabase functions deploy ics-proxy
// (see CALENDAR_SYNC.md). If you deploy with JWT verification on, the app
// already sends the anon key, so no extra config is needed.
// ─────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
}

// Block obvious SSRF targets — link-local, loopback, and private ranges — so
// this can't be turned into a probe of the Supabase project's own network.
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase()
  if (h === 'localhost' || h === '0.0.0.0' || h.endsWith('.local') || h.endsWith('.internal')) return true
  if (h === '169.254.169.254' || h.startsWith('169.254.')) return true            // cloud metadata / link-local
  if (h === '127.0.0.1' || h.startsWith('127.')) return true
  if (h.startsWith('10.') || h.startsWith('192.168.')) return true
  const m = h.match(/^172\.(\d+)\./)
  if (m && +m[1] >= 16 && +m[1] <= 31) return true                                 // 172.16.0.0/12
  return false
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: CORS })

  const raw = new URL(req.url).searchParams.get('url')
  if (!raw) return new Response(JSON.stringify({ error: 'Missing ?url' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })

  // webcal:// → https://, and only allow http(s).
  let target = raw.trim()
  if (/^webcal:\/\//i.test(target)) target = target.replace(/^webcal:\/\//i, 'https://')

  let parsed: URL
  try { parsed = new URL(target) } catch { return new Response(JSON.stringify({ error: 'Bad url' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }) }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return new Response(JSON.stringify({ error: 'Only http(s) URLs are allowed' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
  if (isBlockedHost(parsed.hostname)) {
    return new Response(JSON.stringify({ error: 'That host is not allowed' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      redirect: 'follow',
      headers: { 'User-Agent': 'Bloom-Calendar-Sync/1.0', 'Accept': 'text/calendar, text/plain, */*' },
    })
    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: `Calendar feed responded ${upstream.status}` }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }
    const text = await upstream.text()
    return new Response(text, { status: 200, headers: { ...CORS, 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error)?.message || 'Fetch failed' }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})

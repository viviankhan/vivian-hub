// supabase/functions/send-reminders/index.ts
// ─────────────────────────────────────────────────────────────
// Delivers Bloom reminders as real Web Push notifications — the piece that
// makes a reminder arrive even when Bloom has been fully closed for days.
//
// It is deliberately dumb: the app owns all the "what to remind about and when"
// logic and writes concrete reminders into the `scheduled_pushes` table (see
// src/lib/push.js). This function, run once a minute by a cron job, just finds
// the ones whose time has come and pushes them to the device that queued them.
//
// Runs on Supabase Edge Functions (Deno). Deploy it, set the three VAPID
// secrets, and schedule it every minute — see PUSH_SETUP.md for the walkthrough.
// ─────────────────────────────────────────────────────────────

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected into every Edge
// Function automatically.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Strip anything a copy/paste can smuggle into a key — whitespace, a trailing
// "=", or standard-base64 "+"/"/" — so setVapidDetails can't be crashed by a
// formatting artifact. VAPID keys must be URL-safe base64 with no padding.
const normKey = (k?: string | null) =>
  (k || '').trim().replace(/\s+/g, '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

// The VAPID *public* key is not secret and must exactly match the one baked
// into the app, so it lives here directly — no hand-entered secret to get
// mistyped. (An env override is honored if ever set to a valid value.)
const VAPID_PUBLIC = normKey(Deno.env.get('VAPID_PUBLIC_KEY')) ||
  'BOzhhdVPYiXuL08Y1WB6y09vKPfoL5PymZNL9ijlMKzVZJgyG4hmpCYFxcnnIS71mO9sInzMs3LBKad6YaBbwgc'
// The *private* key stays a secret (never in this public repo); scrub it too.
const VAPID_PRIVATE = normKey(Deno.env.get('VAPID_PRIVATE_KEY'))
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:reminders@bloom.app'

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// How late a reminder may still be delivered. A reminder names a moment, so it
// is only worth sending near that moment — one that couldn't go out at its own
// time (the schedule was paused, this function was down, a push kept failing)
// is noise by the time it lands, and arriving hours late is exactly the
// notification the user never asked for. Anything older is retired unsent.
const LATE_GRACE_MS = 10 * 60 * 1000 // 10 minutes
// The same window, handed to the push service: if the device can't be reached
// within it, the message expires there instead of being held and delivered
// whenever the phone next comes back online — which is how a 2 PM reminder
// arrives at 4 PM even though we sent it on time.
const PUSH_TTL_SECONDS = Math.round(LATE_GRACE_MS / 1000)

Deno.serve(async () => {
  const now = Date.now()
  const nowISO = new Date(now).toISOString()
  const cutoffISO = new Date(now - LATE_GRACE_MS).toISOString()

  // Due, not-yet-sent reminders, each joined to the subscription that queued it.
  // Bounded below by the cutoff: past that, a reminder is no longer delivered.
  const { data: due, error } = await supabase
    .from('scheduled_pushes')
    .select('device_id, tag, title, body, url, push_subscriptions!inner(subscription)')
    .lte('at', nowISO)
    .gte('at', cutoffISO)
    .eq('sent', false)
    .limit(500)

  if (error) return json({ error: error.message }, 500)

  let sent = 0, gone = 0, failed = 0
  const errors: unknown[] = []
  for (const row of due ?? []) {
    // deno-lint-ignore no-explicit-any
    const sub = (row as any).push_subscriptions?.subscription
    if (!sub) continue
    try {
      await webpush.sendNotification(
        sub,
        JSON.stringify({ title: row.title, body: row.body, url: row.url, tag: row.tag }),
        { TTL: PUSH_TTL_SECONDS },
      )
      await supabase.from('scheduled_pushes')
        .update({ sent: true }).eq('device_id', row.device_id).eq('tag', row.tag)
      sent++
    } catch (e) {
      // 404/410 = the browser dropped this subscription; delete it (cascades to
      // its queued pushes) so we stop trying. Anything else is likely transient
      // — leave the row unsent and it retries on the next run.
      // deno-lint-ignore no-explicit-any
      const err = e as any
      const code = err?.statusCode
      if (code === 404 || code === 410) {
        await supabase.from('push_subscriptions').delete().eq('device_id', row.device_id)
        gone++
      } else {
        failed++
        console.error('[send-reminders] push failed:', code, err?.body, err?.message)
        if (errors.length < 3) {
          errors.push({
            statusCode: code ?? null,
            message: err?.message ?? String(e),
            body: err?.body ?? null,
            endpoint: typeof sub?.endpoint === 'string' ? sub.endpoint.slice(0, 50) : null,
          })
        }
      }
    }
  }

  // Retire anything that went past the cutoff while still unsent, so a later run
  // can never pick it up and deliver it long after its moment. It's marked sent
  // rather than deleted so the row still ages out with the rest below, and so a
  // device that re-queues the same tag doesn't resurrect it.
  const { count: missed } = await supabase.from('scheduled_pushes')
    .update({ sent: true }, { count: 'exact' })
    .eq('sent', false).lt('at', cutoffISO)

  // Keep the table small: drop anything older than a day (delivered or missed).
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString()
  await supabase.from('scheduled_pushes').delete().lt('at', dayAgo)

  return json({ ok: true, considered: (due ?? []).length, sent, gone, failed, missed: missed ?? 0, errors })
})

# Subscribed calendars (Apple Family calendar sync)

Bloom can auto-populate your Calendar with events from a shared calendar you
subscribe to — like the **Apple Family** calendar your mom schedules on — and
each calendar has its own **on/off toggle** so you can hide it any time without
unsubscribing.

It's **one-way and read-only**: those events appear in Bloom, and nothing you do
in Bloom ever changes the original calendar.

## 1. Get the calendar's public link

The person who owns the shared calendar (e.g. your mom) publishes it once:

**On a Mac (Calendar app)**
1. Find the shared **Family** calendar in the sidebar.
2. Hover it → click the **ⓘ**, or right-click → **Sharing settings**.
3. Turn on **Public Calendar**.
4. Click **Copy Link** — it looks like `webcal://p123-caldav.icloud.com/published/…`.

**On iPhone/iPad (Calendar app)**
1. Tap **Calendars** at the bottom.
2. Tap the **ⓘ** next to the Family calendar.
3. Turn on **Public Calendar** → **Share Link…** and send yourself the link.

## 2. Subscribe in Bloom

**Settings → Calendars → + Add calendar.** Paste the link, give it a name and a
color, and hit **Subscribe**. The events show up on your Calendar, and the
per-calendar switch turns them on or off.

## 3. Getting past browser CORS (the proxy)

Browsers can't fetch an iCloud `.ics` feed directly — Apple's servers don't send
the cross-origin headers a browser requires. Bloom routes the fetch through a
tiny server proxy to solve this. If your Bloom already uses Supabase, the proxy
is just one more Edge Function to deploy:

```bash
supabase functions deploy ics-proxy
```

**Turn off JWT verification for this function.** A browser sends a CORS
*preflight* (an `OPTIONS` request with no auth header) before the real fetch, and
Supabase rejects that preflight when JWT verification is on — so the call fails
before your function even runs. The repo's `supabase/config.toml` already sets
`verify_jwt = false` for `ics-proxy`, so a CLI deploy picks it up automatically.
If you deployed from the **dashboard**, open the function → **Details/Settings**
and switch **Verify JWT** (a.k.a. "Enforce JWT verification") **off**. The
function is a read-only URL fetcher with SSRF guards, so leaving it open is safe.

That's it — the app automatically calls `https://<your-project>.supabase.co/functions/v1/ics-proxy`.
The function only ever fetches the calendar URL you pass it and returns the text;
it never touches your database, and it refuses local/private hosts.

**Alternatives**
- Point `VITE_ICS_PROXY` at any other CORS-enabled `.ics` proxy you prefer.
- Set `VITE_ICS_PROXY=` (empty) to force a direct browser fetch — this only works
  for feeds that already send permissive CORS headers (most iCloud feeds don't).

Once fetched, each calendar's events are cached on your device, so they keep
showing between sessions and offline; Bloom re-syncs the enabled calendars in the
background whenever you open the app (or when you tap **⟳** on a calendar).

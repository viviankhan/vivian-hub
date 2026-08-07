# Background reminders — setup (one time, ~15 minutes)

By default Bloom's reminders fire while the app is open and "catch up" when you
reopen it. This adds the missing piece: **reminders that arrive even when Bloom
has been fully closed for days**, delivered from the cloud.

**How it works:** Bloom writes the reminders it wants delivered into your
Supabase database. A tiny function on Supabase wakes up once a minute, finds any
that are due, and sends them to your phone/computer as a push notification —
no open tab required. All the code is already in your repo; these steps switch
it on in your own Supabase project.

You'll do everything in the **Supabase dashboard** in your browser — no terminal,
no installs.

---

## Step 1 — Add the two new tables

1. Open **supabase.com** → your `vivian-hub` project → **SQL Editor** (left
   sidebar).
2. Open the file `supabase_setup.sql` from your repo, copy **all** of it, paste
   it into a new query, and click **Run**.
   - It's safe to re-run the whole file — every statement is "create if not
     exists." This adds the new `push_subscriptions` and `scheduled_pushes`
     tables and leaves everything else untouched.

✅ You should see "Success. No rows returned."

---

## Step 2 — Create the Edge Function

1. In the left sidebar click **Edge Functions**.
2. Click **Deploy a new function** → **Via editor** (or "Create a new
   function").
3. Name it exactly: **`send-reminders`** (the name matters — the schedule in
   Step 4 calls it by this name).
4. Delete the sample code, then open `supabase/functions/send-reminders/index.ts`
   from your repo, copy **all** of it, and paste it in.
5. Click **Deploy**.

✅ The function now appears in your Edge Functions list.

---

## Step 3 — Add your push secrets

The function needs your VAPID keys (the signing identity for push). **Claude
gave you the public and private keys in chat — keep the private one secret.**

1. Still under **Edge Functions**, open **Secrets** (a tab, or
   **Project Settings → Edge Functions → Secrets**).
2. Add these three secrets:

   | Name | Value |
   |------|-------|
   | `VAPID_PUBLIC_KEY`  | the **public** key Claude gave you |
   | `VAPID_PRIVATE_KEY` | the **private** key Claude gave you |
   | `VAPID_SUBJECT`     | `mailto:` + your email, e.g. `mailto:viviankhan384@gmail.com` |

3. Save.

> You don't need to add `SUPABASE_URL` or the service key — Supabase injects
> those into every function automatically.

---

## Step 4 — Run it every minute

This tells Supabase to call the function once a minute so due reminders go out.

1. Go back to **SQL Editor** → new query.
2. Paste the block below, **replace the two placeholders**, and **Run**:

```sql
-- Enable the schedulers (safe if already enabled).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Call the send-reminders function every minute.
select cron.schedule(
  'bloom-send-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT-REF>.functions.supabase.co/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON-KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

**Where the two placeholders come from** (Project Settings → API):
- `<PROJECT-REF>` — the first part of your Project URL. If your URL is
  `https://abcdefgh.supabase.co`, the ref is `abcdefgh`.
- `<ANON-KEY>` — the **anon public** key (the same one already in your GitHub
  secrets). It's fine to use here; it's not sensitive.

✅ To confirm it's scheduled, run: `select * from cron.job;` — you should see
`bloom-send-reminders`.

*(To change it later: `select cron.unschedule('bloom-send-reminders');` then
re-run the block.)*

---

## Step 5 — Turn it on in Bloom and test

1. Open Bloom (on your phone, from the Home Screen app, for the best result).
2. **⚙️ Settings → Reminders.** Make sure **Reminders are on**.
3. A new card appears: **"Even when Bloom is closed."** Tap **Turn on**.
   - Allow notifications if asked.
4. **Test it end to end:** add a commitment a few minutes out with a
   "5 min" (or "Starting now") alert, then **fully close Bloom**. The
   notification should arrive at the scheduled minute with the app closed.

Do Step 5 **on each device** (phone, laptop) where you want closed-app
reminders — each one registers itself.

---

## Good to know

- **iPhone:** background push only works from the app **added to your Home
  Screen** (iOS 16.4+), not from a Safari tab.
- **Turning it off:** the same card has a **Turn off** button; it removes this
  device's subscription and stops the cloud sending to it.
- **Privacy/cost:** everything runs inside your own free Supabase project. The
  function only sends the reminder text you'd see anyway.
- **If a test doesn't arrive:** in **Edge Functions → send-reminders → Logs**,
  each run prints a line like `{ considered, sent, gone, failed }`. `considered:
  0` means nothing was due yet; `failed` usually means a VAPID secret is
  mistyped.

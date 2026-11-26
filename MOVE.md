# The move to a new database (Nov 26, 2026)

Bloom's first Supabase project (`fdvfpbhrojniiqqdnoii`, us-east-2) went down on
Nov 20, 2026 at 06:53 UTC and never came back. Its server dropped off the
network; while it was unreachable its recovery log filled the 2 GB disk, and
Postgres can no longer start (`could not write to file "pg_wal/…": No space
left on device`). On the free plan the disk can't be enlarged or cleared, so
the project was left exactly as it is and Bloom moved to a new one.

**New project:** `jzhfdtnzdwyeokwujyua` (us-east-1, free plan), named `bloom`.

## What was set up on the new project

- Tables, policies and functions: every `supabase_*.sql` file, in the order
  they were written, plus `supabase_move_safety.sql`.
- The account, under the **same user id** as before, so each device's offline
  copy (which is filed by user id) still belongs to it.
- All Edge Functions from `supabase/functions/`, with the same JWT settings.
- `VAPID_PRIVATE_KEY` and `GEMINI_API_KEY`, copied from the old project's
  function environment (so existing push subscriptions and the AI features
  keep working), and `OLD_JWT_SECRET` for `adopt-session`.
- The once-a-minute `bloom-send-reminders` schedule.
- The arrive/leave link key (`place_hook_keys`). The old project's
  `place-hook` function was replaced with a forwarder to the new one, so
  existing iPhone Shortcuts keep working without being edited.

## How the data gets there

Nothing could be copied out of the old database. The data comes from the
devices: each holds an offline mirror of everything it had read, plus the edits
it made during the outage.

- `auth.js` — a device with no session on the new project sends the access
  token the old project gave it to `adopt-session`, which checks it against the
  old signing secret and returns a one-time sign-in. No password needed.
- `storage.js` ("Carrying this device's copy…") — the first device to arrive
  queues everything in its mirror as ordinary outbox writes; later devices fill
  in kv keys the cloud still lacks and replay their own edits.
- Until a sign-in is confirmed and the move is settled, the cloud is neither
  read nor written, so an empty database can never overwrite a device's copy.
- `kv_history` keeps the last 8 replaced versions of every kv value for 14
  days, in case two devices' edits to the same list collide.

Tests: `tests/move.test.mjs` (logic), `tests/move.browser.test.mjs` (a real
browser), `tests/move.live.test.mjs` (a real project, throwaway account).

## What did not come over

Anything that only ever lived on the server: narrated papers (audio, PDFs,
figures), place check-in history, AI usage counts. They are still on the old
project's disk and can be copied across if that project is ever revived (a
plan upgrade to enlarge its disk, or Supabase support clearing it).

## Still to do by hand

- The repository secrets `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
  still hold the old project's values. The app build no longer uses them (see
  `deploy.yml`), but **Narrate papers** and **Reminder health** do, and will
  keep failing until both are updated to the new project's values.
- Once every device has moved: delete the `adopt-session` function (it stops
  answering on Mar 1, 2027 anyway), drop `VITE_MOVED_FROM_REF` from
  `deploy.yml`, and remove the safety net (see `supabase_move_safety.sql`).

-- supabase_place_hooks.sql
-- ─────────────────────────────────────────────────────────────
-- Arrive / leave from your phone, even with Bloom closed.
--
-- A web app can only see your location while it's open, so a located time
-- block (Work at the office) can't know when you really got there or left.
-- An iPhone Shortcuts automation ("When I arrive at / leave Guggenheim") runs
-- in the background instead: it opens a link to the place-hook function, which
-- writes one row here. Bloom reads these rows when it's next open and runs the
-- block from the first arrival to the last departure of the day.
--
-- The link carries a private key (place_hook_keys) instead of a sign-in, since
-- a Shortcut can't sign in. Anyone with the link can mark you arrived or left
-- for that one item, and nothing else, so keep it private. Making a new key in
-- the app retires the old links.
--
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- ─────────────────────────────────────────────────────────────

create table if not exists place_hook_keys (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  key        text not null unique,
  created_at timestamptz not null default now()
);
alter table place_hook_keys enable row level security;
drop policy if exists "Own key" on place_hook_keys;
create policy "Own key" on place_hook_keys for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists place_events (
  id      bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The commitment or recurring-task id the Shortcut was set up for.
  task_id text not null,
  kind    text not null check (kind in ('arrive', 'leave')),
  at      timestamptz not null default now()
);
create index if not exists place_events_user_at on place_events (user_id, at desc);
alter table place_events enable row level security;
-- Read and clear your own; only the place-hook function (service key) writes.
drop policy if exists "Own events: read" on place_events;
create policy "Own events: read" on place_events for select to authenticated using (user_id = auth.uid());
drop policy if exists "Own events: delete" on place_events;
create policy "Own events: delete" on place_events for delete to authenticated using (user_id = auth.uid());

-- Only the last couple of months matter to the timeline.
delete from place_events where at < now() - interval '62 days';

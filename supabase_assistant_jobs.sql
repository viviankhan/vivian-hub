-- supabase_assistant_jobs.sql
-- ─────────────────────────────────────────────────────────────
-- Send a screenshot to the AI assistant and close the app: the request is
-- read on the server, not on your phone.
--
-- The app files each request here, then pokes the parse-event function, which
-- answers at once and reads the request in the background — so it doesn't
-- matter if the phone locks or the app is closed a second later. The answer
-- lands back in this row; the app picks it up the next time it's open, and a
-- push notification says it's ready (when background reminders are on).
--
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- ─────────────────────────────────────────────────────────────

create table if not exists assistant_jobs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  status      text not null default 'queued' check (status in ('queued', 'running', 'done', 'error')),
  -- What the app sent (command, photos, tasks…). Cleared once it's answered,
  -- so photos don't linger in the database.
  request     jsonb,
  -- parse-event's answer, as it would have returned it to the app.
  result      jsonb,
  http_status int,
  -- Where to say it's ready: { device_id, tag, url, label }.
  notify      jsonb,
  created_at  timestamptz not null default now(),
  started_at  timestamptz,
  finished_at timestamptz
);
create index if not exists idx_assistant_jobs_user on assistant_jobs (user_id, created_at);

alter table assistant_jobs enable row level security;
drop policy if exists "Own assistant jobs" on assistant_jobs;
create policy "Own assistant jobs" on assistant_jobs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

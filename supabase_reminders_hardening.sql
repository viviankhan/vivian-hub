-- ════════════════════════════════════════════════════════════════════════
--  Bloom — background reminders: send each once, and say when they stop
--  (run once, after supabase_security_fixes.sql; safe to re-run)
-- ════════════════════════════════════════════════════════════════════════
--
--  1. claim_due_pushes(): send-reminders takes its due reminders through this.
--     It marks them sent in the same statement that picks them, skipping rows
--     another run has already locked, so two overlapping runs can never both
--     send the same reminder. (A push that fails for a passing reason is put
--     back unsent by the function, and the next run retries it.)
--
--  2. reminder_health(): a one-call summary of whether reminders are actually
--     going out, read by the "Reminder health" GitHub Action (see
--     .github/workflows/reminder-health.yml), which opens an issue — and so
--     emails you — when they aren't.
--
--  3. The once-a-minute call waits up to 30 s for the function's answer instead
--     of 5 s, so a slow-but-fine run is recorded as fine, not as a timeout.
-- ════════════════════════════════════════════════════════════════════════


-- ── 1 · claim due reminders, once ───────────────────────────────────────────
create or replace function claim_due_pushes(p_now timestamptz, p_cutoff timestamptz, p_limit int default 500)
returns table (device_id text, tag text, title text, body text, url text, subscription jsonb)
language sql
security definer
set search_path = public
as $$
  with due as (
    select p.device_id, p.tag
    from scheduled_pushes p
    where p.sent = false and p.at <= p_now and p.at >= p_cutoff
    order by p.at
    limit p_limit
    for update skip locked
  ), claimed as (
    update scheduled_pushes p set sent = true
    from due
    where p.device_id = due.device_id and p.tag = due.tag
    returning p.device_id, p.tag, p.title, p.body, p.url, p.user_id
  )
  select c.device_id, c.tag, c.title, c.body, c.url, s.subscription
  from claimed c
  join push_subscriptions s on s.device_id = c.device_id and s.user_id = c.user_id;
$$;
revoke all on function claim_due_pushes(timestamptz, timestamptz, int) from public, anon, authenticated;
grant execute on function claim_due_pushes(timestamptz, timestamptz, int) to service_role;


-- ── 2 · are reminders going out? ────────────────────────────────────────────
-- Looks at the last 30 minutes of the scheduler's calls (pg_net keeps about six
-- hours of them) and at the queue itself. `stuck` counts reminders more than
-- 3 minutes past due and still unsent: send-reminders retires anything 10
-- minutes late, so a nonzero `stuck` means it isn't running properly.
create or replace function reminder_health()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with calls as (
    select status_code, content
    from net._http_response
    where created > now() - interval '30 minutes'
  )
  select jsonb_build_object(
    'checked_at',    now(),
    'cron_active',   coalesce((select bool_and(active) from cron.job where jobname = 'bloom-send-reminders'), false),
    'runs',          (select count(*) from calls),
    'ok_runs',       (select count(*) from calls where status_code = 200),
    'error_runs',    (select count(*) from calls where status_code is distinct from 200),
    'last_error',    (select left(content, 300) from calls where status_code >= 400 limit 1),
    'sent',          (select coalesce(sum((content::jsonb ->> 'sent')::int), 0) from calls
                       where status_code = 200 and content like '{%'),
    'failed_pushes', (select coalesce(sum((content::jsonb ->> 'failed')::int), 0) from calls
                       where status_code = 200 and content like '{%'),
    'stuck',         (select count(*) from scheduled_pushes
                       where sent = false and at < now() - interval '3 minutes'),
    'devices',       (select count(*) from push_subscriptions)
  );
$$;
revoke all on function reminder_health() from public, anon, authenticated;
grant execute on function reminder_health() to service_role;


-- ── 3 · give the function time to answer ────────────────────────────────────
do $$
declare j record;
begin
  for j in select jobid, command from cron.job where jobname = 'bloom-send-reminders' loop
    if j.command not like '%timeout_milliseconds%' then
      perform cron.alter_job(j.jobid, command :=
        replace(j.command, 'body := ''{}''::jsonb', 'body := ''{}''::jsonb, timeout_milliseconds := 30000'));
    end if;
  end loop;
end $$;


-- ── 4 · keep the scheduler's own logs small ─────────────────────────────────
-- pg_cron keeps a row for every run forever (130k rows, 82 MB by Nov 2026),
-- and pg_net's response log had piled up 87k dead rows (107 MB) that
-- autovacuum never reclaimed. Together they were 90% of the database the night
-- it stopped answering (Nov 6, 2026; fixed by a restart). Trim the history
-- nightly and compact both tables once.
delete from cron.job_run_details where end_time < now() - interval '7 days';
select cron.schedule('bloom-cleanup-cron-history', '23 9 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$);
-- Run these two on their own (VACUUM can't run inside a transaction block):
--   vacuum full net._http_response;
--   vacuum full cron.job_run_details;

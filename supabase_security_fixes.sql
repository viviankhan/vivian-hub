-- ════════════════════════════════════════════════════════════════════════
--  Bloom — security fixes (run once, after supabase_auth_migration.sql)
-- ════════════════════════════════════════════════════════════════════════
-- Closes three holes found in a security audit. Safe to re-run.
--
--  1. Reminder tables were open to anyone. push_subscriptions and
--     scheduled_pushes kept the setup file's "Allow all" policy, so anyone with
--     the app's public key could read every queued reminder (task names and
--     times), and queue notifications to anyone's phone. They now belong to an
--     account like every other table, and a reminder can only target a device
--     owned by the same account.
--
--  2. The study-files bucket was public with an "Allow all storage" policy:
--     anyone could list, read, overwrite or delete its files. It is now private
--     and owner-only (files live under <user id>/…, like paper-figures).
--
--  3. A paper's source_pdf could name another account's PDF, which the server
--     (reading with the service key) would then fetch. It must now sit in the
--     paper owner's own folder. (Skipped until supabase_papers.sql has added
--     the column; re-run this file after it.)
--
-- ⚠ Ownerless reminder rows (from before accounts) can't be assigned to anyone,
--   so they are deleted. Open Bloom once on each phone that has background
--   reminders on: it re-registers the device and re-queues its reminders.
-- ════════════════════════════════════════════════════════════════════════


-- ── 1 · reminders belong to an account ──────────────────────────────────────
alter table push_subscriptions add column if not exists user_id uuid default auth.uid();
alter table scheduled_pushes   add column if not exists user_id uuid default auth.uid();

-- A queued reminder takes its owner from its device.
update scheduled_pushes p set user_id = s.user_id
  from push_subscriptions s
  where p.device_id = s.device_id and p.user_id is null;

delete from push_subscriptions where user_id is null;   -- cascades to its pushes
delete from scheduled_pushes   where user_id is null;

alter table push_subscriptions alter column user_id set not null;
alter table scheduled_pushes   alter column user_id set not null;

-- A reminder may only point at a device of the same account: queuing one for
-- someone else's phone fails the foreign key, whoever writes it.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'push_subscriptions_device_user_key') then
    alter table push_subscriptions add constraint push_subscriptions_device_user_key unique (device_id, user_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'scheduled_pushes_device_user_fkey') then
    alter table scheduled_pushes add constraint scheduled_pushes_device_user_fkey
      foreign key (device_id, user_id) references push_subscriptions (device_id, user_id) on delete cascade;
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array['push_subscriptions', 'scheduled_pushes'] loop
    execute format('drop policy if exists "Allow all" on %I', t);
    execute format('drop policy if exists "Own rows" on %I', t);
    execute format(
      'create policy "Own rows" on %I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;


-- ── 2 · study-files: private, owner-only ────────────────────────────────────
update storage.buckets set public = false where id = 'study-files';
drop policy if exists "Allow all storage" on storage.objects;
drop policy if exists "study-files: owner all" on storage.objects;
create policy "study-files: owner all" on storage.objects
  for all to authenticated
  using (bucket_id = 'study-files' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'study-files' and (storage.foldername(name))[1] = auth.uid()::text);


-- ── 3 · a paper's PDF must be its owner's ───────────────────────────────────
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'papers' and column_name = 'source_pdf')
     and not exists (select 1 from pg_constraint where conname = 'papers_source_pdf_owner') then
    alter table papers add constraint papers_source_pdf_owner
      check (source_pdf is null or split_part(source_pdf, '/', 1) = user_id::text);
  end if;
end $$;


-- ── 4 · daily AI allowance per account ──────────────────────────────────────
-- Every AI call (assistant, receipt scan, paper reading) spends the project's
-- Gemini key, so each account gets a daily allowance per kind of call. The
-- server functions count a call with use_ai_quota() before making it; the
-- limits themselves live in the functions (env vars), so a paid tier can lift
-- them later without a migration.
create table if not exists ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null default current_date,
  kind    text not null,
  count   int  not null default 0,
  primary key (user_id, day, kind)
);
alter table ai_usage enable row level security;
drop policy if exists "Own usage: read" on ai_usage;
create policy "Own usage: read" on ai_usage for select to authenticated using (user_id = auth.uid());
-- No write policy: only use_ai_quota (run by the server) changes the counts.

-- Count one call if the account is still under `p_limit` today; true when it
-- was counted, false when the allowance is used up. Atomic, so two calls at
-- once can't both squeeze past the limit.
create or replace function use_ai_quota(p_user uuid, p_kind text, p_limit int)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into ai_usage (user_id, day, kind, count) values (p_user, current_date, p_kind, 1)
  on conflict (user_id, day, kind) do update set count = ai_usage.count + 1
    where ai_usage.count < p_limit
  returning count into n;
  return n is not null;
end $$;
revoke all on function use_ai_quota(uuid, text, int) from public, anon, authenticated;
grant execute on function use_ai_quota(uuid, text, int) to service_role;

-- Old counts are only history; keep a month.
delete from ai_usage where day < current_date - 31;


-- ── 5 · ids are per account ─────────────────────────────────────────────────
-- These tables were keyed by id alone, and the app makes ids from the time
-- ("c-1786245975813"). If another account already had a row with that id, a
-- new item failed with "duplicate key" (which the offline sync tolerates, so the
-- item was silently never saved), and a hostile account could block ids on
-- purpose. Keying by (user_id, id) gives every account its own id space. The
-- app inserts plainly or upserts on the primary key, so it needs no change.
do $$
declare t text; col text; pk text;
begin
  foreach t in array array['commitments','vacations','events','recurring_tasks','task_completions','log_entries'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    col := case when t = 'task_completions' then 'storage_key' else 'id' end;
    select conname into pk from pg_constraint where conrelid = ('public.' || t)::regclass and contype = 'p';
    -- Already (user_id, …)? Then this ran before.
    if pk is not null and (select count(*) from pg_constraint c, unnest(c.conkey) where c.conname = pk and c.conrelid = ('public.' || t)::regclass) = 2 then
      continue;
    end if;
    execute format('delete from %I where user_id is null', t);   -- ownerless rows are invisible to everyone anyway
    execute format('alter table %I alter column user_id set not null', t);
    if pk is not null then execute format('alter table %I drop constraint %I', t, pk); end if;
    execute format('alter table %I add primary key (user_id, %I)', t, col);
  end loop;
end $$;

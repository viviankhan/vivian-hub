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

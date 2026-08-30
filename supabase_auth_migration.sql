-- ════════════════════════════════════════════════════════════════════════
--  Bloom — Accounts & per-user data isolation (one-time migration)
-- ════════════════════════════════════════════════════════════════════════
-- Run this ONCE in your Supabase SQL editor (supabase.com → project → SQL
-- editor) to turn Bloom from a single shared space into a multi-account app.
-- Every table gains a `user_id` column that defaults to the signed-in user, and
-- its row-level-security policy is tightened so each account only ever sees its
-- OWN rows. Safe to re-run — every statement is idempotent.
--
-- ⚠️  IMPORTANT — claiming your EXISTING data
-- Once the stricter policies are live, rows whose `user_id` is still NULL (all
-- of your data from before accounts existed) become invisible to everyone. To
-- keep it, you assign it to your account in STEP 3 below. Read that step before
-- running the file.
-- ════════════════════════════════════════════════════════════════════════


-- ── STEP 1 · add a user_id column to every table ────────────────────────────
-- DEFAULT auth.uid() means any NEW row automatically belongs to whoever is
-- signed in, so the existing app code (which never sets user_id) keeps working
-- unchanged — the database stamps it.

alter table kv_store          add column if not exists user_id uuid default auth.uid();
alter table commitments       add column if not exists user_id uuid default auth.uid();
alter table vacations         add column if not exists user_id uuid default auth.uid();
alter table events            add column if not exists user_id uuid default auth.uid();
alter table recurring_tasks   add column if not exists user_id uuid default auth.uid();
alter table task_completions  add column if not exists user_id uuid default auth.uid();
alter table log_entries       add column if not exists user_id uuid default auth.uid();
alter table categories        add column if not exists user_id uuid default auth.uid();

-- Study tables (flashcards feature) — present in most installs. Wrapped so the
-- file still runs if you never created them.
do $$
begin
  if to_regclass('public.classes')      is not null then execute 'alter table classes      add column if not exists user_id uuid default auth.uid()'; end if;
  if to_regclass('public.study_weeks')  is not null then execute 'alter table study_weeks  add column if not exists user_id uuid default auth.uid()'; end if;
  if to_regclass('public.flashcards')   is not null then execute 'alter table flashcards   add column if not exists user_id uuid default auth.uid()'; end if;
  if to_regclass('public.study_files')  is not null then execute 'alter table study_files  add column if not exists user_id uuid default auth.uid()'; end if;
end $$;

-- Background-push tables stay DEVICE-scoped (the send-reminders function uses
-- the service role and matches on device_id), so they are intentionally left
-- shared and are NOT touched here.


-- ── STEP 2 · make kv_store keyed per (user, key) ────────────────────────────
-- kv_store held one row per key globally; with accounts, two people must be able
-- to hold the same key ("notes", "ui_prefs", "bnb_workers"…) independently. Drop
-- the key-only primary key and make it composite. (No-op on re-run.)
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_name = 'kv_store' and constraint_type = 'PRIMARY KEY'
      and constraint_name = 'kv_store_pkey'
  ) then
    -- Only drop if it's still the old single-column key.
    if (select count(*) from information_schema.key_column_usage
        where constraint_name = 'kv_store_pkey') = 1 then
      alter table kv_store drop constraint kv_store_pkey;
    end if;
  end if;
end $$;
-- user_id must be non-null to sit in the primary key. Backfill happens in STEP 3;
-- until then a temporary all-zero owner keeps the constraint satisfiable.
update kv_store set user_id = '00000000-0000-0000-0000-000000000000' where user_id is null;
alter table kv_store alter column user_id set not null;
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'kv_store' and constraint_type = 'PRIMARY KEY'
  ) then
    alter table kv_store add primary key (user_id, key);
  end if;
end $$;


-- ── STEP 2b · make categories keyed per (user, id) ─────────────────────────
-- The default categories seed with FIXED ids ("lab", "class"…). With one global
-- primary key, the second account to seed them would collide. Make the key
-- composite so every account keeps its own copy of the same-named categories.
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_name = 'categories' and constraint_type = 'PRIMARY KEY'
      and constraint_name = 'categories_pkey'
      and (select count(*) from information_schema.key_column_usage where constraint_name = 'categories_pkey') = 1
  ) then
    alter table categories drop constraint categories_pkey;
  end if;
end $$;
update categories set user_id = '00000000-0000-0000-0000-000000000000' where user_id is null;
alter table categories alter column user_id set not null;
do $$
begin
  if not exists (select 1 from information_schema.table_constraints where table_name = 'categories' and constraint_type = 'PRIMARY KEY') then
    alter table categories add primary key (user_id, id);
  end if;
end $$;


-- ── STEP 3 · CLAIM YOUR EXISTING DATA  ★ EDIT BEFORE RUNNING ★ ──────────────
-- Your pre-accounts rows currently have no owner. To keep them, sign up in the
-- app FIRST (so your account exists), then set the email below to the one you
-- signed up with and run this file. Every ownerless row becomes yours.
--
-- If this is a brand-new project with nothing to keep, you can leave this as-is
-- (it simply matches nothing) or delete the block.
do $$
declare
  claim_email text := 'YOUR_EMAIL_HERE@example.com';   -- ← change me
  claim_id    uuid;
begin
  select id into claim_id from auth.users where email = claim_email limit 1;
  if claim_id is null then
    raise notice 'No account found for %, skipping data claim. Sign up first, then re-run.', claim_email;
    return;
  end if;
  update kv_store         set user_id = claim_id where user_id = '00000000-0000-0000-0000-000000000000';
  update categories       set user_id = claim_id where user_id = '00000000-0000-0000-0000-000000000000';
  update commitments      set user_id = claim_id where user_id is null;
  update vacations        set user_id = claim_id where user_id is null;
  update events           set user_id = claim_id where user_id is null;
  update recurring_tasks  set user_id = claim_id where user_id is null;
  update task_completions set user_id = claim_id where user_id is null;
  update log_entries      set user_id = claim_id where user_id is null;
  update categories       set user_id = claim_id where user_id is null;
  if to_regclass('public.classes')     is not null then update classes     set user_id = claim_id where user_id is null; end if;
  if to_regclass('public.study_weeks') is not null then update study_weeks set user_id = claim_id where user_id is null; end if;
  if to_regclass('public.flashcards')  is not null then update flashcards  set user_id = claim_id where user_id is null; end if;
  if to_regclass('public.study_files') is not null then update study_files set user_id = claim_id where user_id is null; end if;
  raise notice 'Claimed all ownerless rows for %.', claim_email;
end $$;


-- ── STEP 4 · tighten row-level security to "only your own rows" ─────────────
-- Replaces the old wide-open "Allow all" policies. `auth.uid()` is the signed-in
-- account; a request with no session (or another account) sees nothing.
do $$
declare t text;
begin
  foreach t in array array[
    'kv_store','commitments','vacations','events','recurring_tasks',
    'task_completions','log_entries','categories',
    'classes','study_weeks','flashcards','study_files'
  ] loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table %I enable row level security', t);
      execute format('drop policy if exists "Allow all" on %I', t);
      execute format('drop policy if exists "Own rows" on %I', t);
      execute format(
        'create policy "Own rows" on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    end if;
  end loop;
end $$;

-- Done. New sign-ups now start with a clean, private space; your existing data
-- belongs to the account you claimed it with in STEP 3.

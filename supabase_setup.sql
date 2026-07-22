-- Run this in your Supabase SQL editor (supabase.com → project → SQL editor)
-- Safe to re-run — every statement is idempotent (IF NOT EXISTS / DROP+CREATE POLICY).

-- ── Generic key-value store ─────────────────────────────────────
-- Still used for settings-shaped data that's edited as one unit by one
-- person: notes, routines, routine_log, scheduled_tasks, profile_info,
-- plus the migration_v2_done flag below. NOT used anymore for collections
-- of independent items (commitments, vacations, recurring tasks, done
-- state, log entries) — those are real tables below so that deleting one
-- item is one atomic row operation, never a whole-collection overwrite.
create table if not exists kv_store (
  key        text primary key,
  value      jsonb,
  updated_at timestamptz default now()
);
alter table kv_store enable row level security;
drop policy if exists "Allow all" on kv_store;
create policy "Allow all" on kv_store for all using (true) with check (true);

-- ── Commitments ──────────────────────────────────────────────────
create table if not exists commitments (
  id            text primary key,
  text          text not null,
  date          date,
  time          time,
  prep_min      integer,
  duration_mins integer,
  cat           text not null default 'other',
  person        text,
  done          boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_commitments_date on commitments (date);
alter table commitments enable row level security;
drop policy if exists "Allow all" on commitments;
create policy "Allow all" on commitments for all using (true) with check (true);

-- ── Vacations / time-off blocks ──────────────────────────────────
create table if not exists vacations (
  id         text primary key,
  label      text not null,
  start_date date not null,
  end_date   date not null,
  created_at timestamptz not null default now()
);
alter table vacations enable row level security;
drop policy if exists "Allow all" on vacations;
create policy "Allow all" on vacations for all using (true) with check (true);

-- ── Recurring task templates ─────────────────────────────────────
create table if not exists recurring_tasks (
  id         text primary key,
  type       text not null check (type in ('week','today')),
  label      text not null,
  note       text,
  cat        text not null default 'lab',
  carry      boolean not null default false,
  days       text[] not null default '{}',
  start_date date,
  end_date   date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_recurring_tasks_days on recurring_tasks using gin (days);
alter table recurring_tasks enable row level security;
drop policy if exists "Allow all" on recurring_tasks;
create policy "Allow all" on recurring_tasks for all using (true) with check (true);

-- ── Task completion state ────────────────────────────────────────
-- Replaces the old "todos" + "week_state" blobs, which were confirmed
-- duplicate mirrors of the exact same data. A row existing means done;
-- toggling one item's checkbox never touches any other item's row.
create table if not exists task_completions (
  storage_key text primary key,
  done        boolean not null default true,
  updated_at  timestamptz not null default now()
);
alter table task_completions enable row level security;
drop policy if exists "Allow all" on task_completions;
create policy "Allow all" on task_completions for all using (true) with check (true);

-- ── Activity log ──────────────────────────────────────────────────
create table if not exists log_entries (
  id          uuid primary key default gen_random_uuid(),
  date        text not null,
  date_label  text,
  label       text not null,
  tag         text,
  storage_key text,
  ts          timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists idx_log_entries_storage_key on log_entries (storage_key);
create index if not exists idx_log_entries_date on log_entries (date);
alter table log_entries enable row level security;
drop policy if exists "Allow all" on log_entries;
create policy "Allow all" on log_entries for all using (true) with check (true);

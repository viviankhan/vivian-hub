-- Run this in your Supabase SQL editor (supabase.com → project → SQL editor)
-- Creates the key-value store table the app uses for all persistence.

create table if not exists kv_store (
  key        text primary key,
  value      jsonb,
  updated_at timestamptz default now()
);

-- Enable Row Level Security
alter table kv_store enable row level security;

-- Allow all operations (this is a personal app with no auth needed)
create policy "Allow all" on kv_store
  for all using (true) with check (true);

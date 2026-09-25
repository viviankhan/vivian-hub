-- ════════════════════════════════════════════════════════════════════════
--  Bloom — Papers (listen to scientific papers)            see PAPERS.md
-- ════════════════════════════════════════════════════════════════════════
-- Run this ONCE in the Supabase SQL editor. Safe to re-run: every statement is
-- idempotent. It creates:
--   • papers           — one row per walkthrough (sections, glossary, cues)
--   • paper_progress   — where you stopped in each paper
--   • paper-audio      — PRIVATE storage bucket for the narration (MP4/AAC)
--   • paper-figures    — PRIVATE storage bucket for figure crops
-- Everything is owner-only, like the rest of Bloom (see ACCOUNTS.md).
--
-- Storage objects are laid out as  <user id>/<paper id>...  so a policy can
-- check ownership from the path alone.
-- ════════════════════════════════════════════════════════════════════════


-- ── papers ──────────────────────────────────────────────────────────────────
create table if not exists papers (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title           text not null default '',
  authors         text not null default '',   -- "Surname et al."
  journal         text not null default '',
  year            text not null default '',
  doi             text not null default '',
  -- [{ heading, body, lines[], paras[], figure: { path, caption } | null }]
  -- `lines` is written by the narrator (scripts/narrate/voice.py) and is the
  -- ONLY sentence split the app ever uses. See PAPERS.md before touching it.
  sections        jsonb not null default '[]'::jsonb,
  terms           jsonb not null default '[]'::jsonb,   -- [{ term, def }]
  cues            jsonb,                               -- [{ s, i, t }]
  dur             float8,                              -- seconds
  audio_path      text,                                -- null until narrated
  -- Set when something the narrator reads aloud changed after narration (a
  -- figure caption). The old audio keeps playing until the new one lands.
  needs_narration boolean not null default false,
  narration_error text,
  narration_attempts int not null default 0,
  section_count   int generated always as (jsonb_array_length(sections)) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists papers_user_created on papers (user_id, created_at desc);
-- The narrator's work queue.
create index if not exists papers_to_narrate on papers (created_at)
  where audio_path is null or needs_narration;

alter table papers enable row level security;
drop policy if exists "papers: own rows" on papers;
create policy "papers: own rows" on papers
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ── paper_progress ──────────────────────────────────────────────────────────
create table if not exists paper_progress (
  paper_id          uuid primary key references papers(id) on delete cascade,
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  position_seconds  float8 not null default 0,
  section_index     int not null default 0,
  updated_at        timestamptz not null default now()
);

alter table paper_progress enable row level security;
drop policy if exists "paper_progress: own rows" on paper_progress;
create policy "paper_progress: own rows" on paper_progress
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ── storage buckets ─────────────────────────────────────────────────────────
-- Private: the app reads through short-lived signed URLs. The narrator writes
-- audio with the service-role key, which bypasses these policies.
insert into storage.buckets (id, name, public)
values ('paper-audio', 'paper-audio', false)
on conflict (id) do update set public = false;

insert into storage.buckets (id, name, public)
values ('paper-figures', 'paper-figures', false)
on conflict (id) do update set public = false;

-- Audio: owners may read (and delete, when they delete a paper). Only the
-- narrator writes it.
drop policy if exists "paper-audio: owner read" on storage.objects;
create policy "paper-audio: owner read" on storage.objects
  for select to authenticated
  using (bucket_id = 'paper-audio' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "paper-audio: owner delete" on storage.objects;
create policy "paper-audio: owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'paper-audio' and (storage.foldername(name))[1] = auth.uid()::text);

-- Figures: the app uploads crops and screenshots, so owners get full access to
-- their own folder.
drop policy if exists "paper-figures: owner all" on storage.objects;
create policy "paper-figures: owner all" on storage.objects
  for all to authenticated
  using (bucket_id = 'paper-figures' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'paper-figures' and (storage.foldername(name))[1] = auth.uid()::text);

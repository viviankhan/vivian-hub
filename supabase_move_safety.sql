-- supabase_move_safety.sql
-- ─────────────────────────────────────────────────────────────
-- A safety net for the move to a new project (Nov 26, 2026).
--
-- Nearly everything Bloom stores is a whole-value blob in kv_store, and when
-- two devices each have an unsent edit to the same blob the one that syncs
-- last wins. That is normally a few seconds of exposure. During the move it
-- was six days: the phone and the laptop had both been editing since the old
-- database stopped on Nov 20, and both replay into the new one.
--
-- So for a while, every value that is about to be replaced is kept: the last
-- few versions of each key, for two weeks. Nothing reads this table but a
-- person repairing something by hand (service role only — no policies).
--
-- Already applied to the new project. Safe to re-run. To remove it later:
--   drop trigger kv_keep_history on kv_store;
--   drop function kv_keep_history();  drop table kv_history;
--   select cron.unschedule('bloom-trim-kv-history');
-- ─────────────────────────────────────────────────────────────

create table if not exists kv_history (
  id          bigint generated always as identity primary key,
  user_id     uuid not null,
  key         text not null,
  value       jsonb,
  updated_at  timestamptz,
  replaced_at timestamptz not null default now()
);
create index if not exists idx_kv_history_key on kv_history (user_id, key, id desc);
alter table kv_history enable row level security;

create or replace function kv_keep_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Photos and other large blobs are skipped: they are written once, not
  -- edited, and copies of them would fill a small database quickly.
  if old.value is not null and old.value is distinct from new.value
     and pg_column_size(old.value) < 400000 then
    insert into kv_history (user_id, key, value, updated_at)
      values (old.user_id, old.key, old.value, old.updated_at);
    delete from kv_history h
      where h.user_id = old.user_id and h.key = old.key
        and h.id not in (select id from kv_history
                         where user_id = old.user_id and key = old.key
                         order by id desc limit 8);
  end if;
  return new;
end $$;

drop trigger if exists kv_keep_history on kv_store;
create trigger kv_keep_history before update on kv_store
  for each row execute function kv_keep_history();

select cron.schedule('bloom-trim-kv-history', '41 9 * * *',
  $$delete from kv_history where replaced_at < now() - interval '14 days'$$);

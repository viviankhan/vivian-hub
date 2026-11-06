-- ════════════════════════════════════════════════════════════════════════
--  Bloom — reminders on arrival (run once, after supabase_reminders_hardening.sql;
--  safe to re-run)
-- ════════════════════════════════════════════════════════════════════════
-- "Remind me when I get home, or at 8 PM if I'm already home." A task set to
-- remind on arrival queues two linked rows (same `grp`) instead of its usual
-- alerts (src/lib/notifications.js):
--
--   kind 'time'   at its time, with `place`: send-reminders sends it only if
--                 your latest check-in is at that place.
--   kind 'arrive' waits from `at` to `until` for a check-in at `place`;
--                 place-hook sends it the moment one comes in.
--
-- Whichever goes out first marks the pair sent, so you get one reminder.
-- ════════════════════════════════════════════════════════════════════════

alter table scheduled_pushes add column if not exists kind  text not null default 'time';
alter table scheduled_pushes add column if not exists until timestamptz;
alter table scheduled_pushes add column if not exists place jsonb;
alter table scheduled_pushes add column if not exists grp   text;
create index if not exists idx_scheduled_pushes_arrive on scheduled_pushes (user_id) where sent = false and kind = 'arrive';

-- Meters between two points (haversine).
create or replace function bloom_meters(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

-- Is this person at the place right now? Their latest check-in says where
-- they are until the next one. (A place's radius, or 150 m, plus 50 m for GPS.)
create or replace function bloom_user_at(p_user uuid, p_place jsonb)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select bloom_meters(e.lat, e.lng, (p_place->>'lat')::float8, (p_place->>'lng')::float8)
             <= coalesce((p_place->>'radius')::float8, 150) + 50
    from place_events e
    where e.user_id = p_user and e.kind = 'ping' and e.lat is not null
    order by e.at desc limit 1), false)
$$;

-- Time-based reminders, claimed once (now also returning who and where).
drop function if exists claim_due_pushes(timestamptz, timestamptz, int);
create function claim_due_pushes(p_now timestamptz, p_cutoff timestamptz, p_limit int default 500)
returns table (device_id text, tag text, title text, body text, url text, subscription jsonb, user_id uuid, place jsonb, grp text)
language sql security definer set search_path = public as $$
  with due as (
    select p.device_id, p.tag
    from scheduled_pushes p
    where p.sent = false and p.kind <> 'arrive' and p.at <= p_now and p.at >= p_cutoff
    order by p.at
    limit p_limit
    for update skip locked
  ), claimed as (
    update scheduled_pushes p set sent = true
    from due
    where p.device_id = due.device_id and p.tag = due.tag
    returning p.device_id, p.tag, p.title, p.body, p.url, p.user_id, p.place, p.grp
  )
  select c.device_id, c.tag, c.title, c.body, c.url, s.subscription, c.user_id, c.place, c.grp
  from claimed c
  join push_subscriptions s on s.device_id = c.device_id and s.user_id = c.user_id;
$$;

-- A check-in just came in: claim the arrival reminders it satisfies (and
-- retire their time-based twins), returning the ones to send.
create or replace function claim_arrival_pushes(p_user uuid, p_lat double precision, p_lng double precision, p_now timestamptz)
returns table (device_id text, tag text, title text, body text, url text, subscription jsonb)
language sql security definer set search_path = public as $$
  with near as (
    select p.device_id, p.tag, p.grp
    from scheduled_pushes p
    where p.user_id = p_user and p.kind = 'arrive' and p.sent = false
      and p.at <= p_now and coalesce(p.until, p.at) >= p_now
      and bloom_meters(p_lat, p_lng, (p.place->>'lat')::float8, (p.place->>'lng')::float8)
            <= coalesce((p.place->>'radius')::float8, 150) + 50
    for update skip locked
  ), done as (
    update scheduled_pushes s set sent = true
    from near
    where s.device_id = near.device_id
      and (s.tag = near.tag or (near.grp is not null and s.grp = near.grp))
    returning s.device_id, s.tag, s.title, s.body, s.url, s.user_id, s.kind
  )
  select d.device_id, d.tag, d.title, d.body, d.url, sub.subscription
  from done d
  join push_subscriptions sub on sub.device_id = d.device_id and sub.user_id = d.user_id
  where d.kind = 'arrive';
$$;

revoke all on function bloom_user_at(uuid, jsonb) from public, anon, authenticated;
revoke all on function claim_due_pushes(timestamptz, timestamptz, int) from public, anon, authenticated;
revoke all on function claim_arrival_pushes(uuid, double precision, double precision, timestamptz) from public, anon, authenticated;
grant execute on function bloom_user_at(uuid, jsonb) to service_role;
grant execute on function claim_due_pushes(timestamptz, timestamptz, int) to service_role;
grant execute on function claim_arrival_pushes(uuid, double precision, double precision, timestamptz) to service_role;
notify pgrst, 'reload schema';

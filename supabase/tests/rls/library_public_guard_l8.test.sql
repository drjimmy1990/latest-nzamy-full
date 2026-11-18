-- library_public_guard_l8.test.sql — proves 20261128_30 (batch l8-libguard):
--   * the three settings are seeded with the owner's numbers and an admin's
--     value is never overwritten (ON CONFLICT DO NOTHING, re-run);
--   * daily_full_read_limit = 50 for a person and a member (was 220 / 400);
--     slow_daily_docs falls below the new cap; column defaults follow;
--   * library_read_quota_hit refuses the 51st distinct full-text document of
--     the day (over_daily) and the limit it reports is 50.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). From the repo
-- root, in Git Bash:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $M/20260627_platform_settings.sql \
--     $M/20261030_80_library_read_quota.sql \
--     $M/20261031_10_library_activity_monitor.sql \
--     $M/20261103_10_library_auto_lock_hours.sql \
--     $M/20261107_20_library_caps_owner_426.sql \
--     $M/20261128_30_library_public_guard.sql \
--     $M/20261128_30_library_public_guard.sql \
--     supabase/one-time/rls_proof.sql \
--     $T/library_public_guard_l8.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261128_30
-- lines → T1 «a library guard setting is missing».

\set ON_ERROR_STOP on

-- T1: the three settings, the owner's numbers.
do $$
declare v jsonb;
begin
  select value into v from public.platform_settings where key = 'library_public_protection';
  if v is null then raise exception 'T1: a library guard setting is missing'; end if;
  if (v->>'session_challenge_after')::int <> 120 or (v->>'max_public_offset')::int <> 250
     or (v->>'pages_challenge_after')::int <> 15 or (v->>'pass_minutes')::int <> 30 then
    raise exception 'T1: library_public_protection is not the owner defaults: %', v;
  end if;
  select value into v from public.platform_settings where key = 'public_full_rulings_per_collection';
  if v is distinct from '{"full":0,"excerpt_chars":180}'::jsonb then
    raise exception 'T1: public_full_rulings_per_collection = %', v;
  end if;
  select value into v from public.platform_settings where key = 'library_feqh_free_pages';
  if v is distinct from '{"pages":0}'::jsonb then
    raise exception 'T1: library_feqh_free_pages = %', v;
  end if;
end $$;

-- T2: daily 50 / member 50 / slow below 50; defaults follow.
do $$
declare s record;
begin
  select * into s from public.library_monitor_settings where id;
  if s.daily_docs <> 50 or s.member_daily_docs <> 50 or s.slow_daily_docs >= 50 then
    raise exception 'T2: caps are % / % / slow %', s.daily_docs, s.member_daily_docs, s.slow_daily_docs;
  end if;
  if (select column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'library_monitor_settings' and column_name = 'daily_docs') <> '50' then
    raise exception 'T2: daily_docs default is not 50';
  end if;
end $$;

-- T3: an admin's value survives a re-run (ON CONFLICT DO NOTHING).
update public.platform_settings set value = '{"full":1,"excerpt_chars":200}'::jsonb where key = 'public_full_rulings_per_collection';
insert into public.platform_settings (key, value, description) values
  ('public_full_rulings_per_collection', '{"full":0,"excerpt_chars":180}'::jsonb, 're-run')
on conflict (key) do nothing;
do $$
begin
  if (select value from public.platform_settings where key = 'public_full_rulings_per_collection') <> '{"full":1,"excerpt_chars":200}'::jsonb then
    raise exception 'T3: the admin value was overwritten';
  end if;
end $$;

-- T4: the 51st distinct document of the day is refused, limit 50 (the hourly
-- cap, also 50 in the row, is lifted here so only the daily cap can answer).
update public.library_monitor_settings set hourly_docs = 1000 where id;
do $$
declare
  u uuid := gen_random_uuid();
  r record;
  i int;
begin
  insert into auth.users (id) values (u);
  insert into public.profiles (id, user_type) values (u, 'lawyer') on conflict do nothing;
  for i in 1..50 loop
    select * into r from public.library_read_quota_hit(u, 'law:doc-' || i, 50, 50, 1000, 60);
    if r.status <> 'ok' then raise exception 'T4: document % refused (%)', i, r.status; end if;
  end loop;
  select * into r from public.library_read_quota_hit(u, 'law:doc-1', 50, 50, 1000, 60);
  if r.status <> 'ok' then raise exception 'T4: re-opening a document read today was refused (%)', r.status; end if;
  select * into r from public.library_read_quota_hit(u, 'law:doc-51', 50, 50, 1000, 60);
  if r.status <> 'over_daily' then raise exception 'T4: the 51st document was % (expected over_daily)', r.status; end if;
  if r.day_limit <> 50 then raise exception 'T4: day_limit %', r.day_limit; end if;
end $$;

select 'library_public_guard_l8: all assertions passed' as result;

-- founder_campaign_nov18.test.sql — proves 20261122_10 (owner package 17 Nov
-- 2026): the founder window 18 Nov → 17 Dec 2026 (Riyadh days), capacity
-- 1096, and founder_reserve_seat() refusing a non-advocate (not_advocate).
--
-- CHAIN (run.sh, postgres:16). The ONE-RUN chain of founder_membership.test.sql
-- (20261101_10 once, no between-runs prelude), then 20261122_10 TWICE (it must
-- be safe to re-run), then this file. From the repo root, in Git Bash:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $T/prelude_lawyer_profiles_live.sql \
--     $T/prelude_signup_metadata_live.sql \
--     $M/20260921_04_profiles_phone_e164_check.sql \
--     $M/20261016_10_lawyer_profiles_select_column_lock.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261019_20_lawyer_practice_kind.sql \
--     $M/20261021_50_founder_campaign.sql \
--     $M/20261026_01_founder_no_signup_grant.sql \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20261022_10_payments_core.sql \
--     $T/prelude_points_lots_fixture.sql \
--     $M/20261022_20_points_lots.sql \
--     $M/20261022_30_claim_payment_order.sql \
--     $M/20261027_10_ai_runs.sql \
--     $M/20261030_65_library_grant_admin.sql \
--     $M/20261101_10_founder_membership.sql \
--     $M/20261122_10_founder_campaign_nov18.sql \
--     $M/20261122_10_founder_campaign_nov18.sql \
--     $T/founder_campaign_nov18.test.sql
--
-- NEGATIVE CONTROL / RED (must FAIL): the same chain without the two
-- 20261122_10 files → "T0 FAIL: founder_reserve_seat has no advocate check".
\set ON_ERROR_STOP on

-- T0 the migration is applied
do $$
begin
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.founder_reserve_seat(uuid, uuid)'::regprocedure),
                       'not_advocate') = 0 then
    raise exception 'T0 FAIL: founder_reserve_seat has no advocate check (20261122_10 not applied)';
  end if;
  raise notice 'T0 PASS: founder_reserve_seat has the advocate check';
end $$;

-- T1 the setting: the new window and capacity; the rest kept
do $$
declare v jsonb;
begin
  select value into v from public.platform_settings where key = 'founder_campaign';
  if v ->> 'starts_on' is distinct from '2026-11-18'
     or v ->> 'ends_on' is distinct from '2026-12-17'
     or v -> 'capacity' is distinct from '1096'::jsonb
     or v -> 'sale_paused' is distinct from 'false'::jsonb
     or v -> 'library_days' is distinct from '90'::jsonb then
    raise exception 'T1 FAIL: founder_campaign = %', v;
  end if;
  raise notice 'T1 PASS: 2026-11-18 → 2026-12-17, capacity 1096, sale_paused / library_days kept';
end $$;

-- T2 the window edges, in Riyadh time: opens 18 Nov 00:00, closes 18 Dec 00:00
do $$
begin
  if public.founder_campaign_active('2026-11-17 23:59:59+03') then
    raise exception 'T2 FAIL: active one second before the opening';
  end if;
  if not public.founder_campaign_active('2026-11-18 00:00:00+03') then
    raise exception 'T2 FAIL: not active at the opening';
  end if;
  if not public.founder_campaign_active('2026-12-17 23:59:59+03') then
    raise exception 'T2 FAIL: not active on the last second of 17 Dec';
  end if;
  if public.founder_campaign_active('2026-12-18 00:00:00+03') then
    raise exception 'T2 FAIL: still active at 18 Dec 00:00';
  end if;
  raise notice 'T2 PASS: active from 2026-11-18 00:00 to 2026-12-17 23:59:59 Riyadh only';
end $$;

-- ── Setup: an advocate, a consultant, a pending advocate ────────────────────
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000ad001'), ('00000000-0000-0000-0000-0000000ad002'),
  ('00000000-0000-0000-0000-0000000ad003');
insert into public.profiles (id, user_type, display_name)
  select id, 'lawyer', 'محامٍ ' || right(id::text, 1) from auth.users
   where id::text like '00000000-0000-0000-0000-0000000ad%';
insert into public.lawyer_profiles (user_id, verification_status, practice_kind) values
  ('00000000-0000-0000-0000-0000000ad001', 'verified', 'advocate'),
  ('00000000-0000-0000-0000-0000000ad002', 'verified', 'consultant'),
  ('00000000-0000-0000-0000-0000000ad003', 'pending',  'consultant');

insert into public.payment_orders (id, user_id, kind, item_id, billing, net_halalas, vat_halalas,
                                   total_halalas, vat_mode, status)
values
  ('00000000-0000-0000-0000-0000000ae001', '00000000-0000-0000-0000-0000000ad001', 'membership',
   'lawyer-founder-2026', 'once', 299600, 44940, 344540, 'exclusive', 'initiated'),
  ('00000000-0000-0000-0000-0000000ae002', '00000000-0000-0000-0000-0000000ad002', 'membership',
   'lawyer-founder-2026', 'once', 299600, 44940, 344540, 'exclusive', 'initiated'),
  ('00000000-0000-0000-0000-0000000ae003', '00000000-0000-0000-0000-0000000ad003', 'membership',
   'lawyer-founder-2026', 'once', 299600, 44940, 344540, 'exclusive', 'initiated');

-- the window around the container's Riyadh date (the real one is in the future)
update public.platform_settings
   set value = value || jsonb_build_object(
         'starts_on', to_char((now() at time zone 'Asia/Riyadh')::date - 1, 'YYYY-MM-DD'),
         'ends_on',   to_char((now() at time zone 'Asia/Riyadh')::date + 1, 'YYYY-MM-DD'))
 where key = 'founder_campaign';

-- T3 a verified consultant gets not_advocate and no seat; a pending consultant
-- still gets not_verified (the licence check comes first)
do $$
declare r text;
begin
  r := public.founder_reserve_seat('00000000-0000-0000-0000-0000000ad002', '00000000-0000-0000-0000-0000000ae002');
  if r is distinct from 'not_advocate' then
    raise exception 'T3 FAIL: verified consultant reserve returned %', r;
  end if;
  r := public.founder_reserve_seat('00000000-0000-0000-0000-0000000ad003', '00000000-0000-0000-0000-0000000ae003');
  if r is distinct from 'not_verified' then
    raise exception 'T3 FAIL: pending consultant reserve returned %', r;
  end if;
  if exists (select 1 from public.founder_seats
              where user_id in ('00000000-0000-0000-0000-0000000ad002', '00000000-0000-0000-0000-0000000ad003')) then
    raise exception 'T3 FAIL: a consultant holds a seat';
  end if;
  raise notice 'T3 PASS: consultant → not_advocate (pending → not_verified), no seat';
end $$;

-- T4 a verified advocate still reserves
do $$
declare r text;
begin
  r := public.founder_reserve_seat('00000000-0000-0000-0000-0000000ad001', '00000000-0000-0000-0000-0000000ae001');
  if r is distinct from 'reserved' then
    raise exception 'T4 FAIL: advocate reserve returned %', r;
  end if;
  if not exists (select 1 from public.founder_seats
                  where user_id = '00000000-0000-0000-0000-0000000ad001' and status = 'reserved') then
    raise exception 'T4 FAIL: the advocate has no reserved seat';
  end if;
  raise notice 'T4 PASS: verified advocate → reserved';
end $$;

-- T5 privileges: service role only, one overload
do $$
begin
  if has_function_privilege('anon', 'public.founder_reserve_seat(uuid, uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.founder_reserve_seat(uuid, uuid)', 'EXECUTE') then
    raise exception 'T5 FAIL: anon/authenticated can call founder_reserve_seat';
  end if;
  if not has_function_privilege('service_role', 'public.founder_reserve_seat(uuid, uuid)', 'EXECUTE') then
    raise exception 'T5 FAIL: service_role cannot call founder_reserve_seat';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'founder_reserve_seat') <> 1 then
    raise exception 'T5 FAIL: more than one founder_reserve_seat';
  end if;
  raise notice 'T5 PASS: service_role only, one overload';
end $$;

select 'founder_campaign_nov18: ALL PASS' as result;

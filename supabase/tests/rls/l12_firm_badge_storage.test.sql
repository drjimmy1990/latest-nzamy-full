-- l12_firm_badge_storage.test.sql — proves parts E (N18 «مكتب معتمد») and
--   F (N21 founder storage fair use) of 20261202_80 (batch l12, builder firm).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The l11
-- community chain, then the prelude, then 20261202_80 TWICE. From the repo
-- root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $R/prelude_auth_sessions_live.sql $R/prelude_community_live_schema.sql \
--     $M/20261016_06_community_access_and_counters.sql \
--     $M/20261030_80_library_read_quota.sql $M/20261031_10_library_activity_monitor.sql \
--     $M/20261108_20_library_device_limit.sql \
--     $R/prelude_platform_settings_min.sql $R/prelude_l7_community.sql \
--     $M/20261127_60_community_review_devices_freeze.sql \
--     $M/20261201_50_community_verified_firms.sql \
--     $R/prelude_l12_firm_badge_storage.sql \
--     $M/20261202_80_l12_firm_roles_log_badge_storage.sql \
--     $M/20261202_80_l12_firm_roles_log_badge_storage.sql \
--     $R/l12_firm_badge_storage.test.sql
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261202_80
--   lines → «E1 FAIL: «مكتب معتمد» = {…FV…}» (the old rule admits the firm
--   with a licensed lawyer and no plan) — run with the prelude kept.
--
-- Firms (owner → firm):
--   FA  CR verified, his own ACTIVE firm-basic subscription            → معتمد
--   FB  CR verified, a firm-ENTITY firm-enterprise subscription         → معتمد
--   FC  CR verified, firm-basic but TRIALING                           → no
--   FD  CR verified, firm-basic that ENDED yesterday                   → no
--   FE  CR NOT verified, active firm-basic                             → no
--   FV  CR verified + a verified lawyer with a valid licence, no plan  → no (the old rule's arm)
--   FL  CR verified, an active lawyer-pro (not an office plan)         → no
-- Founders: U1 active seat, 21 GB stored; U2 active seat, 1 MB; U3 released, 30 GB.
-- Every assertion RAISES on failure.
\set ON_ERROR_STOP 1

insert into auth.users (id) values
  ('fa000000-0000-0000-0000-0000000012fa'), ('fb000000-0000-0000-0000-0000000012fb'),
  ('fc000000-0000-0000-0000-0000000012fc'), ('fd000000-0000-0000-0000-0000000012fd'),
  ('fe000000-0000-0000-0000-0000000012fe'), ('f5000000-0000-0000-0000-0000000012f5'),
  ('f7000000-0000-0000-0000-0000000012f7'), ('a5000000-0000-0000-0000-0000000012a5'),
  ('01000000-0000-0000-0000-000000001201'), ('02000000-0000-0000-0000-000000001202'),
  ('03000000-0000-0000-0000-000000001203');
insert into public.profiles (id, user_type, display_name) values
  ('fa000000-0000-0000-0000-0000000012fa', 'firm', 'FA'), ('fb000000-0000-0000-0000-0000000012fb', 'firm', 'FB'),
  ('fc000000-0000-0000-0000-0000000012fc', 'firm', 'FC'), ('fd000000-0000-0000-0000-0000000012fd', 'firm', 'FD'),
  ('fe000000-0000-0000-0000-0000000012fe', 'firm', 'FE'), ('f5000000-0000-0000-0000-0000000012f5', 'firm', 'FV'),
  ('f7000000-0000-0000-0000-0000000012f7', 'firm', 'FL'), ('a5000000-0000-0000-0000-0000000012a5', 'lawyer', 'LV'),
  ('01000000-0000-0000-0000-000000001201', 'lawyer', 'U1'), ('02000000-0000-0000-0000-000000001202', 'lawyer', 'U2'),
  ('03000000-0000-0000-0000-000000001203', 'lawyer', 'U3');
insert into public.lawyer_profiles (user_id, verification_status) values
  ('a5000000-0000-0000-0000-0000000012a5', 'verified');
update public.lawyer_profiles set license_expiry = current_date + 60 where user_id = 'a5000000-0000-0000-0000-0000000012a5';

insert into public.firm_profiles (id, owner_user_id, name_ar, verification_status) values
  ('aaaaaaaa-0000-0000-0000-0000000012fa', 'fa000000-0000-0000-0000-0000000012fa', 'أ', 'verified'),
  ('bbbbbbbb-0000-0000-0000-0000000012fb', 'fb000000-0000-0000-0000-0000000012fb', 'ب', 'verified'),
  ('cccccccc-0000-0000-0000-0000000012fc', 'fc000000-0000-0000-0000-0000000012fc', 'ج', 'verified'),
  ('dddddddd-0000-0000-0000-0000000012fd', 'fd000000-0000-0000-0000-0000000012fd', 'د', 'verified'),
  ('eeeeeeee-0000-0000-0000-0000000012fe', 'fe000000-0000-0000-0000-0000000012fe', 'هـ', 'pending'),
  ('f5f5f5f5-0000-0000-0000-0000000012f5', 'f5000000-0000-0000-0000-0000000012f5', 'و', 'verified'),
  ('f7f7f7f7-0000-0000-0000-0000000012f7', 'f7000000-0000-0000-0000-0000000012f7', 'ل', 'verified');
insert into public.firm_members (firm_id, user_id, role, status) values
  ('f5f5f5f5-0000-0000-0000-0000000012f5', 'a5000000-0000-0000-0000-0000000012a5', 'lawyer', 'active');
insert into public.subscriptions (user_id, status, current_period_end, plan_id, entity_type, entity_id) values
  ('fa000000-0000-0000-0000-0000000012fa', 'active',   now() + interval '200 days', 'firm-basic',      null,   null),
  ('fb000000-0000-0000-0000-0000000012fb', 'active',   now() + interval '200 days', 'firm-enterprise', 'firm', 'bbbbbbbb-0000-0000-0000-0000000012fb'),
  ('fc000000-0000-0000-0000-0000000012fc', 'trialing', now() + interval '10 days',  'firm-basic',      null,   null),
  ('fd000000-0000-0000-0000-0000000012fd', 'active',   now() - interval '1 day',    'firm-basic',      null,   null),
  ('fe000000-0000-0000-0000-0000000012fe', 'active',   now() + interval '200 days', 'firm-basic',      null,   null),
  ('f7000000-0000-0000-0000-0000000012f7', 'active',   now() + interval '200 days', 'lawyer-pro',      null,   null);

-- ── E1 the badge rule ────────────────────────────────────────────────────────
do $$
declare got text;
begin
  select string_agg(p.display_name, ',' order by p.display_name) into got
    from public.community_verified_office_users(array[
      'fa000000-0000-0000-0000-0000000012fa', 'fb000000-0000-0000-0000-0000000012fb',
      'fc000000-0000-0000-0000-0000000012fc', 'fd000000-0000-0000-0000-0000000012fd',
      'fe000000-0000-0000-0000-0000000012fe', 'f5000000-0000-0000-0000-0000000012f5',
      'f7000000-0000-0000-0000-0000000012f7']::uuid[]) u
    join public.profiles p on p.id = u;
  if got is distinct from 'FA,FB' then
    raise exception 'E1 FAIL: «مكتب معتمد» = {%} — expected {FA,FB}', got;
  end if;
  raise notice 'E1 PASS: «مكتب معتمد» = %: an active office plan (own or the firm''s); trial, ended, unverified, lawyer-only and non-office plans are out', got;
end $$;

-- ── E2 the lawyers-only space follows the same rule; sessions cannot call the rule
set role authenticated;
do $$
begin
  perform set_config('test.uid', 'fa000000-0000-0000-0000-0000000012fa', false);
  if not public.community_lawyers_space_ok() then raise exception 'E2 FAIL: FA (office plan) is refused the lawyers space'; end if;
  perform set_config('test.uid', 'f5000000-0000-0000-0000-0000000012f5', false);
  if public.community_lawyers_space_ok() then raise exception 'E2 FAIL: FV (no plan) still enters the lawyers space'; end if;
  begin
    perform public.community_verified_office_users(array['fa000000-0000-0000-0000-0000000012fa']::uuid[]);
    raise exception 'E2 FAIL: a session called community_verified_office_users';
  exception when insufficient_privilege then null;
  end;
  raise notice 'E2 PASS: the lawyers space admits FA and refuses FV; the rule is service-role only';
end $$;
reset role;

-- ── F1 founder storage ───────────────────────────────────────────────────────
insert into public.founder_seats (user_id, status) values
  ('01000000-0000-0000-0000-000000001201', 'active'),
  ('02000000-0000-0000-0000-000000001202', 'active'),
  ('03000000-0000-0000-0000-000000001203', 'released');
insert into storage.objects (bucket_id, name, owner_id, metadata) values
  ('case-files', 'u1/a.pdf', '01000000-0000-0000-0000-000000001201', jsonb_build_object('size', (20::bigint * 1024 * 1024 * 1024)::text)),
  ('case-files', 'u1/b.pdf', '01000000-0000-0000-0000-000000001201', jsonb_build_object('size', 1073741824)),
  ('case-files', 'u1/c.pdf', '01000000-0000-0000-0000-000000001201', jsonb_build_object('size', 'not a number')),
  ('case-files', 'u2/a.pdf', '02000000-0000-0000-0000-000000001202', jsonb_build_object('size', 1048576)),
  ('case-files', 'u3/a.pdf', '03000000-0000-0000-0000-000000001203', jsonb_build_object('size', (30::bigint * 1024 * 1024 * 1024)::text));

do $$
declare got text;
begin
  select string_agg(p.display_name || '=' || u.used_bytes, ',' order by p.display_name) into got
    from public.founder_storage_usage() u join public.profiles p on p.id = u.user_id;
  if got is distinct from 'U1=22548578304,U2=1048576' then
    raise exception 'F1 FAIL: founder_storage_usage() = % — expected U1=22548578304,U2=1048576 (active seats only)', got;
  end if;
  if (select value from public.platform_settings where key = 'founder_storage_fair_use') <> '{"gb": 25, "alert_pct": 80}'::jsonb then
    raise exception 'F1 FAIL: founder_storage_fair_use is not {"gb": 25, "alert_pct": 80}';
  end if;
  raise notice 'F1 PASS: bytes per active founder seat: %; the setting is 25 GB / 80 %%', got;
end $$;

set role authenticated;
do $$
begin
  perform set_config('test.uid', '01000000-0000-0000-0000-000000001201', false);
  begin
    perform 1 from public.founder_storage_usage();
    raise exception 'F2 FAIL: a session read founder_storage_usage()';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.founder_storage_alerts;
    raise exception 'F2 FAIL: a session read founder_storage_alerts';
  exception when insufficient_privilege then null;
  end;
  raise notice 'F2 PASS: usage and alert markers are server-only (42501)';
end $$;
reset role;

-- ── F3 one alert marker per founder and month ───────────────────────────────
insert into public.founder_storage_alerts (user_id, period, used_bytes, cap_bytes)
values ('01000000-0000-0000-0000-000000001201', '2026-11', 22548578304, 26843545600)
on conflict do nothing;
insert into public.founder_storage_alerts (user_id, period, used_bytes, cap_bytes)
values ('01000000-0000-0000-0000-000000001201', '2026-11', 22548578304, 26843545600)
on conflict do nothing;
do $$
begin
  if (select count(*) from public.founder_storage_alerts) <> 1 then
    raise exception 'F3 FAIL: two markers for the same founder and month';
  end if;
  raise notice 'F3 PASS: one marker per founder and month';
end $$;

select 'l12_firm_badge_storage: ALL PASS' as result;

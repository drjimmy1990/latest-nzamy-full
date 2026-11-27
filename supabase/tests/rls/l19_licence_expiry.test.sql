-- l19_licence_expiry.test.sql — proves 20261209_10 (batch l19, owner ٢٤١):
-- licence_expiry_alerts() lists the licences of VERIFIED lawyers, firm owners
-- and providers whose expiry is within the horizon or already past (the
-- LATER of the registry's date (licence found there, not archived) and the
-- lawyer's own column — l19 review S1: L19 renewed, his own date newer than
-- the stale registry row, is not listed; a provider's typed date only when it is a real
-- date), is service role only, and email_reminder_log accepts the three new
-- once-only kinds while keeping the older ones.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). From the repo
-- root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations
-- RUN A — with the lawyers' registry; 20261209_10 runs TWICE (re-runnable):
--   bash $R/run.sh $R/prelude_l19_licence_expiry.sql $M/20261122_40_lawyer_registry.sql \
--     $M/20261125_20_email_reminder_log.sql $M/20261201_45_task_payment_invite_reminders.sql \
--     $M/20261209_10_l19_licence_expiry_alerts.sql $M/20261209_10_l19_licence_expiry_alerts.sql \
--     $R/l19_licence_expiry.test.sql
-- RUN B — no registry table (the function's other branch):
--   bash $R/run.sh $R/prelude_l19_licence_expiry.sql \
--     $M/20261125_20_email_reminder_log.sql $M/20261201_45_task_payment_invite_reminders.sql \
--     $M/20261209_10_l19_licence_expiry_alerts.sql $R/l19_licence_expiry.test.sql
-- NEGATIVE CONTROL (must FAIL at T0): RUN B without 20261209_10.
-- NEGATIVE CONTROL 2 (l19 review S1, must FAIL at T1 in RUN A): 20261209_10
--   with every «greatest(r.expiry_date, lp.license_expiry)» put back to
--   «coalesce(r.expiry_date, lp.license_expiry)» (the self-check's text too)
--   → «T1 FAIL … 19|lawyer|1919|-5».
--
-- Every row is SYNTHETIC (99/7… licences, invented names). Every assertion
-- RAISES on failure.

-- T0 precondition (the negative control stops here)
do $$
begin
  if to_regprocedure('public.licence_expiry_alerts(uuid[], integer)') is null then
    raise exception 'T0 FAIL: licence_expiry_alerts(uuid[], integer) does not exist (20261209_10 not applied)';
  end if;
end $$;

insert into auth.users (id) select ('00000000-0000-0000-0000-0000000019' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 20) n
on conflict do nothing;
insert into public.profiles (id, user_type)
select ('00000000-0000-0000-0000-0000000019' || lpad(n::text, 2, '0'))::uuid,
       case when n between 1 and 9 then 'lawyer' when n between 10 and 12 then 'firm' else 'provider' end
  from generate_series(1, 20) n
on conflict do nothing;

do $$
declare
  t date := (now() at time zone 'Asia/Riyadh')::date;
begin
  insert into public.lawyer_profiles (user_id, license_number, verification_status, license_expiry) values
    ('00000000-0000-0000-0000-000000001901', null,      'verified', t + 20),   -- L1 in 30 days → listed
    ('00000000-0000-0000-0000-000000001902', null,      'verified', t + 100),  -- L2 beyond the horizon
    ('00000000-0000-0000-0000-000000001903', null,      'verified', t - 400),  -- L3 long expired → listed
    ('00000000-0000-0000-0000-000000001904', null,      'pending',  t + 5),    -- L4 not verified
    ('00000000-0000-0000-0000-000000001905', '99/7001', 'verified', null),     -- L5 registry only
    ('00000000-0000-0000-0000-000000001906', '99/7002', 'verified', t + 10),   -- L6 registry renewed it
    ('00000000-0000-0000-0000-000000001907', '99/7003', 'verified', t + 6),    -- L7 registry row archived
    ('00000000-0000-0000-0000-000000001908', null,      'verified', t),        -- L8 ends today → listed
    ('00000000-0000-0000-0000-000000001909', null,      'rejected', t - 1),    -- L9 not verified
    ('00000000-0000-0000-0000-000000001919', '99/7004', 'verified', t + 300);  -- L19 renewed: own date newer than the registry
  insert into public.firm_profiles (id, owner_user_id, name_ar, verification_status, license_expiry) values
    ('00000000-0000-0000-0000-00000000f191', '00000000-0000-0000-0000-000000001910', 'مكتب اختبار ١', 'verified', t + 7),
    ('00000000-0000-0000-0000-00000000f192', '00000000-0000-0000-0000-000000001911', 'مكتب اختبار ٢', 'pending',  t),
    ('00000000-0000-0000-0000-00000000f193', '00000000-0000-0000-0000-000000001912', 'مكتب اختبار ٣', 'verified', null);
  insert into public.provider_profiles (user_id, verification_status, license_expiry, metadata) values
    ('00000000-0000-0000-0000-000000001913', 'verified', null,   jsonb_build_object('settings', jsonb_build_object('licenseExpiry', to_char(t + 1, 'YYYY-MM-DD')))),
    ('00000000-0000-0000-0000-000000001914', 'verified', null,   '{"settings":{"licenseExpiry":"2026-02-30"}}'),
    ('00000000-0000-0000-0000-000000001915', 'verified', null,   '{"settings":{"licenseExpiry":"abc"}}'),
    ('00000000-0000-0000-0000-000000001916', 'verified', t + 15, '{"settings":{"licenseExpiry":"2001-01-01"}}'),
    ('00000000-0000-0000-0000-000000001917', 'pending',  t - 3,  '{}'),
    ('00000000-0000-0000-0000-000000001918', 'verified', null,   '{"settings":{"licenseExpiry":"0000-01-01"}}');
  if to_regclass('public.lawyer_registry') is not null then
    insert into public.lawyer_registry (licence_raw, full_name, expiry_date, registry_note) values
      ('99/7001', 'مختبر الأول', t + 3, null),
      ('99/7002', 'مختبر الثاني', t + 200, null),
      ('99/7003', 'مختبر الثالث', t + 300, 'محفوظ من القاعدة السابقة (اختبار)'),
      ('99/7004', 'مختبر الرابع', t - 5, null);
  end if;
end $$;

-- T1 the cron's view (all accounts, 30 days)
do $$
declare
  t   date := (now() at time zone 'Asia/Riyadh')::date;
  reg boolean := to_regclass('public.lawyer_registry') is not null;
  got text;
  exp text;
begin
  select string_agg(format('%s|%s|%s|%s', right(a.user_id::text, 2), a.holder, right(a.subject_id, 4), a.expiry - t), ',' order by a.user_id, a.holder)
    into got from public.licence_expiry_alerts(null, 30) a;
  exp := concat_ws(',',
    '01|lawyer|1901|20',
    '03|lawyer|1903|-400',
    case when reg then '05|lawyer|1905|3' end,
    case when not reg then '06|lawyer|1906|10' end,
    '07|lawyer|1907|6',
    '08|lawyer|1908|0',
    '10|firm|f191|7',
    '13|provider|1913|1',
    '16|provider|1916|15');
  if got is distinct from exp then
    raise exception 'T1 FAIL (registry %): expected [%], got [%]', reg, exp, got;
  end if;
end $$;

-- T2 one account at a time (the banner), the horizon, and the bounds
do $$
declare n int;
begin
  select count(*) into n from public.licence_expiry_alerts(array['00000000-0000-0000-0000-000000001901']::uuid[], 30);
  if n <> 1 then raise exception 'T2 FAIL: L1 alone, expected 1 row, got %', n; end if;
  select count(*) into n from public.licence_expiry_alerts(array['00000000-0000-0000-0000-000000001902']::uuid[], 30);
  if n <> 0 then raise exception 'T2 FAIL: L2 is beyond 30 days, got % rows', n; end if;
  select count(*) into n from public.licence_expiry_alerts(array['00000000-0000-0000-0000-000000001902']::uuid[], 366);
  if n <> 1 then raise exception 'T2 FAIL: L2 within 366 days, expected 1 row, got %', n; end if;
  select count(*) into n from public.licence_expiry_alerts(array['00000000-0000-0000-0000-000000001910', '00000000-0000-0000-0000-000000001904']::uuid[], 30);
  if n <> 1 then raise exception 'T2 FAIL: the firm owner (and not the pending lawyer), expected 1 row, got %', n; end if;
  select count(*) into n from public.licence_expiry_alerts(array[]::uuid[], 30);
  if n <> 0 then raise exception 'T2 FAIL: an empty list, got % rows', n; end if;
  begin
    perform public.licence_expiry_alerts(array(select gen_random_uuid() from generate_series(1, 201)), 30);
    raise exception 'T2 FAIL: 201 ids were accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.licence_expiry_alerts(null, -1);
    raise exception 'T2 FAIL: a negative horizon was accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- T3 nobody signed in can call it (service role only)
do $$
begin
  if has_function_privilege('anon', 'public.licence_expiry_alerts(uuid[], integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.licence_expiry_alerts(uuid[], integer)', 'EXECUTE')
     or has_function_privilege('app_user', 'public.licence_expiry_alerts(uuid[], integer)', 'EXECUTE') then
    raise exception 'T3 FAIL: anon / authenticated can execute licence_expiry_alerts';
  end if;
  if not has_function_privilege('service_role', 'public.licence_expiry_alerts(uuid[], integer)', 'EXECUTE') then
    raise exception 'T3 FAIL: service_role cannot execute licence_expiry_alerts';
  end if;
end $$;

set role app_user;
select set_config('test.uid', '00000000-0000-0000-0000-000000001901', false);
do $$
begin
  perform public.licence_expiry_alerts(array['00000000-0000-0000-0000-000000001901']::uuid[], 30);
  raise exception 'T3 FAIL: a signed-in user called licence_expiry_alerts';
exception when insufficient_privilege then null;
end $$;
reset role;

-- T4 the once-only kinds: accepted once per (kind, licence, recipient, date); older kinds kept; unknown refused
do $$
declare n int;
begin
  begin
    insert into public.email_reminder_log (kind, subject_id, due_on, recipient_user_id) values
      ('licence_expiry_30d_app', '00000000-0000-0000-0000-000000001901', '2026-12-20', '00000000-0000-0000-0000-000000001901'),
      ('licence_expiry_7d_app',  '00000000-0000-0000-0000-000000001901', '2026-12-20', '00000000-0000-0000-0000-000000001901'),
      ('licence_expiry_0d_app',  '00000000-0000-0000-0000-000000001901', '2026-12-20', '00000000-0000-0000-0000-000000001901'),
      ('task_due_1d_app',        't-19', '2026-12-20', '00000000-0000-0000-0000-000000001901'),
      ('hearing_1d',             'h-19', '2026-12-20', '00000000-0000-0000-0000-000000001901');
  exception when check_violation then
    raise exception 'T4 FAIL: a licence expiry kind (or an older kind) is refused';
  end;
  insert into public.email_reminder_log (kind, subject_id, due_on, recipient_user_id)
  values ('licence_expiry_7d_app', '00000000-0000-0000-0000-000000001901', '2026-12-20', '00000000-0000-0000-0000-000000001901')
  on conflict do nothing;
  -- a renewed licence (a new date) is a new reminder
  insert into public.email_reminder_log (kind, subject_id, due_on, recipient_user_id)
  values ('licence_expiry_7d_app', '00000000-0000-0000-0000-000000001901', '2027-12-20', '00000000-0000-0000-0000-000000001901')
  on conflict do nothing;
  select count(*) into n from public.email_reminder_log where kind = 'licence_expiry_7d_app';
  if n <> 2 then raise exception 'T4 FAIL: once per licence date, expected 2 rows, got %', n; end if;
  begin
    insert into public.email_reminder_log (kind, subject_id, due_on, recipient_user_id)
    values ('licence_expiry_99d_app', 'x', '2026-12-20', '00000000-0000-0000-0000-000000001901');
    raise exception 'T4 FAIL: an unknown kind was accepted';
  exception when check_violation then null;
  end;
end $$;

select 'l19_licence_expiry: ALL PASS' as result;

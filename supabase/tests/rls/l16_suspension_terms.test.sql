-- l16_suspension_terms.test.sql — proves 20261206_20 (batch l16, owner س٢١٥).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The l7 chain
-- that creates account_suspension_freezes, then 20261206_20 TWICE (it must be
-- re-runnable). From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $R/prelude_auth_sessions_live.sql $R/prelude_community_live_schema.sql \
--     $M/20261016_06_community_access_and_counters.sql \
--     $M/20261030_80_library_read_quota.sql $M/20261031_10_library_activity_monitor.sql \
--     $M/20261108_20_library_device_limit.sql \
--     $R/prelude_platform_settings_min.sql $R/prelude_l7_community.sql \
--     $M/20261127_60_community_review_devices_freeze.sql \
--     $M/20261206_20_suspension_terms.sql $M/20261206_20_suspension_terms.sql \
--     $R/l16_suspension_terms.test.sql
-- NEGATIVE CONTROL: the same chain without the two 20261206_20 files fails at T0.
-- Every assertion RAISES on failure.

do $$
begin
  if to_regclass('public.account_suspension_appeals') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'account_suspension_freezes' and column_name = 'ends_at') then
    raise exception 'T0 FAIL: 20261206_20 is not applied';
  end if;
end $$;

-- stubs.sql's default privileges hand app_user every new table; on the live
-- database there is no such grant. Take it away so app_user is exactly an
-- `authenticated` session.
revoke all on public.account_suspension_appeals from app_user;
revoke all on public.account_suspension_freezes from app_user;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000a001'),
  ('00000000-0000-0000-0000-00000000a002');

-- T1: a freeze opened by account_freeze_open takes the terms; the checks hold.
do $$
declare
  v jsonb;
  f uuid;
begin
  v := public.account_freeze_open('00000000-0000-0000-0000-00000000a001', null, 'admin');
  if v ->> 'state' <> 'frozen' then raise exception 'T1 FAIL: freeze not opened: %', v; end if;
  f := (v ->> 'id')::uuid;
  update public.account_suspension_freezes
     set ends_at = now() + interval '72 hours', template = '72h', suspend_reason = 'مخالفة'
   where id = f;
  begin
    update public.account_suspension_freezes set template = 'forever' where id = f;
    raise exception 'T1 FAIL: an unknown template was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.account_suspension_freezes set ends_at = frozen_at - interval '1 minute' where id = f;
    raise exception 'T1 FAIL: an end before the freeze was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.account_suspension_freezes set suspend_reason = repeat('x', 1001) where id = f;
    raise exception 'T1 FAIL: a 1001-character reason was accepted';
  exception when check_violation then null;
  end;
  raise notice 'T1 OK: terms stored; template / end / reason checks refuse bad values';
end $$;

-- T2: appeals — one waiting appeal per suspension, message length checked.
do $$
declare
  f uuid := (select id from public.account_suspension_freezes
              where user_id = '00000000-0000-0000-0000-00000000a001' and lifted_at is null);
begin
  insert into public.account_suspension_appeals (freeze_id, user_id, message)
  values (f, '00000000-0000-0000-0000-00000000a001', 'أعترض على الإيقاف لأنه خطأ');
  begin
    insert into public.account_suspension_appeals (freeze_id, user_id, message)
    values (f, '00000000-0000-0000-0000-00000000a001', 'اعتراض ثانٍ أثناء انتظار الأول');
    raise exception 'T2 FAIL: a second waiting appeal was accepted';
  exception when unique_violation then null;
  end;
  update public.account_suspension_appeals set status = 'rejected', decided_at = now() where freeze_id = f;
  insert into public.account_suspension_appeals (freeze_id, user_id, message)
  values (f, '00000000-0000-0000-0000-00000000a001', 'اعتراض جديد بعد رفض الأول');
  begin
    insert into public.account_suspension_appeals (freeze_id, user_id, message)
    values (f, '00000000-0000-0000-0000-00000000a001', 'قصير');
    raise exception 'T2 FAIL: a too-short appeal was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.account_suspension_appeals set status = 'maybe' where freeze_id = f and status = 'new';
    raise exception 'T2 FAIL: an unknown appeal status was accepted';
  exception when check_violation then null;
  end;
  raise notice 'T2 OK: one waiting appeal per suspension; length and status checked';
end $$;

-- T3: the due read the automatic lift uses, and the existing lift still works.
do $$
declare
  f uuid := (select id from public.account_suspension_freezes
              where user_id = '00000000-0000-0000-0000-00000000a001' and lifted_at is null);
  n int;
  v jsonb;
begin
  select count(*) into n from public.account_suspension_freezes
   where lifted_at is null and ends_at is not null and ends_at <= now();
  if n <> 0 then raise exception 'T3 FAIL: a suspension ending in 72 h is due now (%)', n; end if;

  -- the end passes (moved back: frozen_at moves with it, the check holds)
  update public.account_suspension_freezes
     set frozen_at = now() - interval '73 hours', ends_at = now() - interval '1 hour' where id = f;
  select count(*) into n from public.account_suspension_freezes
   where lifted_at is null and ends_at is not null and ends_at <= now();
  if n <> 1 then raise exception 'T3 FAIL: the ended suspension is not due (%)', n; end if;

  v := public.account_freeze_lift('00000000-0000-0000-0000-00000000a001', null);
  if v ->> 'state' <> 'lifted' then raise exception 'T3 FAIL: lift answered %', v; end if;
  select count(*) into n from public.account_suspension_freezes
   where lifted_at is null and ends_at is not null and ends_at <= now();
  if n <> 0 then raise exception 'T3 FAIL: a lifted suspension is still due'; end if;
  if (select lifted_by from public.account_suspension_freezes where id = f) is not null then
    raise exception 'T3 FAIL: an automatic lift should leave lifted_by empty';
  end if;
  raise notice 'T3 OK: due only once ended; account_freeze_lift closes it (lifted_by null = automatic)';
end $$;

-- T4: a signed-in session reads and writes neither table.
set role app_user;
select set_config('test.uid', '00000000-0000-0000-0000-00000000a001', false);
do $$
begin
  begin
    perform 1 from public.account_suspension_appeals;
    raise exception 'T4 FAIL: a session read the appeals';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.account_suspension_appeals (freeze_id, user_id, message)
    values (gen_random_uuid(), '00000000-0000-0000-0000-00000000a001', 'محاولة كتابة مباشرة');
    raise exception 'T4 FAIL: a session wrote an appeal';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.account_suspension_freezes set ends_at = null;
    raise exception 'T4 FAIL: a session changed a suspension''s end';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T4 OK: appeals and freezes are server-only';
end $$;
reset role;

-- T5: the migration's own verify, once more.
do $$
begin
  if has_table_privilege('authenticated', 'public.account_suspension_appeals', 'SELECT')
     or has_table_privilege('anon', 'public.account_suspension_appeals', 'INSERT') then
    raise exception 'T5 FAIL: a session role holds a privilege on account_suspension_appeals';
  end if;
  raise notice 'T5 OK — l16_suspension_terms: all assertions passed';
end $$;

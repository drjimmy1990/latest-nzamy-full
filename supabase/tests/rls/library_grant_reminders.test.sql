-- library_grant_reminders.test.sql — proves 20261030_66 (owner note ١٨ C06):
-- the (grant_id, offset_days) key makes the reminder job idempotent, only the
-- 7- and 3-day offsets exist, a deleted grant takes its markers with it, and
-- a signed-in user cannot read or write the table.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 66 runs twice
-- (idempotent). From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261022_10_payments_core.sql \
--     $M/20261030_65_library_grant_admin.sql \
--     $M/20261030_66_library_grant_reminders.sql \
--     $M/20261030_66_library_grant_reminders.sql \
--     $R/library_grant_reminders.test.sql
-- NEGATIVE CONTROL: without the two 66 files the chain fails at T0.
-- Every assertion RAISES on failure.

-- T0 precondition
do $$
begin
  if to_regclass('public.library_grant_reminders') is null then
    raise exception 'T0 FAIL: library_grant_reminders does not exist (20261030_66 not applied)';
  end if;
end $$;

insert into auth.users values ('00000000-0000-0000-0000-00000000d001');

-- T1 the marker key: a second insert of the same (grant, offset) is a no-op;
-- the other offset is its own reminder
do $$
declare
  g uuid;
  n int;
begin
  insert into public.library_access_grants (user_id, plan_ref, source, starts_at, ends_at)
  values ('00000000-0000-0000-0000-00000000d001', 'lib-q1', 'admin', now() - interval '80 days', now() + interval '5 days')
  returning id into g;

  insert into public.library_grant_reminders (grant_id, offset_days, user_id, ends_at)
  values (g, 7, '00000000-0000-0000-0000-00000000d001', now() + interval '5 days')
  on conflict (grant_id, offset_days) do nothing;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T1 FAIL: first marker not inserted (%)', n; end if;

  insert into public.library_grant_reminders (grant_id, offset_days, user_id, ends_at)
  values (g, 7, '00000000-0000-0000-0000-00000000d001', now() + interval '5 days')
  on conflict (grant_id, offset_days) do nothing;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T1 FAIL: the same reminder was recorded twice'; end if;

  insert into public.library_grant_reminders (grant_id, offset_days, user_id, ends_at)
  values (g, 3, '00000000-0000-0000-0000-00000000d001', now() + interval '5 days')
  on conflict (grant_id, offset_days) do nothing;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T1 FAIL: the 3-day reminder was blocked by the 7-day one'; end if;
end $$;

-- T2 only 7 and 3
do $$
declare g uuid;
begin
  select id into g from public.library_access_grants limit 1;
  begin
    insert into public.library_grant_reminders (grant_id, offset_days, user_id, ends_at)
    values (g, 5, '00000000-0000-0000-0000-00000000d001', now());
    raise exception 'T2 FAIL: offset 5 was accepted';
  exception when check_violation then null;
  end;
end $$;

-- T3 a deleted grant takes its markers with it
do $$
declare g uuid;
begin
  select id into g from public.library_access_grants limit 1;
  delete from public.library_access_grants where id = g;
  if exists (select 1 from public.library_grant_reminders where grant_id = g) then
    raise exception 'T3 FAIL: markers outlived their grant';
  end if;
end $$;

-- T4 privileges (after the second run)
do $$
begin
  if has_table_privilege('authenticated', 'public.library_grant_reminders', 'SELECT')
     or has_table_privilege('anon', 'public.library_grant_reminders', 'SELECT')
     or has_table_privilege('authenticated', 'public.library_grant_reminders', 'INSERT') then
    raise exception 'T4 FAIL: a session role holds a privilege on library_grant_reminders';
  end if;
  if not has_table_privilege('service_role', 'public.library_grant_reminders', 'INSERT') then
    raise exception 'T4 FAIL: service_role cannot INSERT';
  end if;
end $$;

-- T5 a signed-in user cannot read the table (app_user has only what
-- `authenticated` would have on the live database)
revoke all on public.library_grant_reminders from app_user;
set role app_user;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000d001', true);
  begin
    perform 1 from public.library_grant_reminders limit 1;
    raise exception 'T5 FAIL: a signed-in user read library_grant_reminders';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'library_grant_reminders.test.sql: ALL PASS' as result;

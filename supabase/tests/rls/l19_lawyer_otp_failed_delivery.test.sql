-- l19_lawyer_otp_failed_delivery.test.sql — proves 20261209_30 (batch l19,
-- LIVE-18): a lawyer code whose e-mail send FAILED burns neither the 60 s
-- cooldown nor one of the 5 hourly codes; a pending or sent code still does;
-- the 24 h per-target limit still counts failed sends; only service_role runs it.
--
-- CHAIN (run.sh, postgres:16). 20261209_30 runs TWICE (re-runnable). From the
-- repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations
--   bash $R/run.sh $R/prelude_lawyer_registry_base.sql \
--     $R/prelude_storage_objects_stub.sql $R/prelude_storage_buckets_stub.sql \
--     $M/20261122_40_lawyer_registry.sql $M/20261124_70_lawyer_signup_verification.sql \
--     $M/20261209_30_l19_lawyer_otp_failed_delivery.sql $M/20261209_30_l19_lawyer_otp_failed_delivery.sql \
--     $R/l19_lawyer_otp_failed_delivery.test.sql
--
-- NEGATIVE CONTROL (must FAIL at T0 — and T1 without the T0 guard):
--   the same chain without the two 20261209_30 files.
--
-- Every row is SYNTHETIC. Every assertion RAISES on failure.

-- T0 precondition: the l19 body is in place
do $$
begin
  if to_regprocedure('public.lawyer_otp_issue(uuid,text,text,text,text,text,text)') is null then
    raise exception 'T0 FAIL: public.lawyer_otp_issue does not exist';
  end if;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef(to_regprocedure('public.lawyer_otp_issue(uuid,text,text,text,text,text,text)')),
                       'delivery <> ''failed''') = 0 then
    raise exception 'T0 FAIL: lawyer_otp_issue still counts failed sends (20261209_30 not applied)';
  end if;
end $$;

create or replace function pg_temp.expect(label text, got text, want text) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '% FAIL: got %, want %', label, got, want;
  end if;
end $$;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000c1901'),
  ('00000000-0000-0000-0000-0000000c1902'),
  ('00000000-0000-0000-0000-0000000c1903'),
  ('00000000-0000-0000-0000-0000000c1904');

-- T1 a failed send burns no cooldown; a sent one does
set role service_role;
select pg_temp.expect('T1 first code',
  public.lawyer_otp_issue('00000000-0000-0000-0000-0000000c1901', 'email', 'email', null,
                          repeat('1', 64), 'a•••@example.test', repeat('c', 64)) ->> 'ok', 'true');
reset role;
update public.lawyer_otp_challenges set delivery = 'failed', consumed_at = now()
 where user_id = '00000000-0000-0000-0000-0000000c1901';
set role service_role;
select pg_temp.expect('T1 after a FAILED send the user may ask again at once',
  public.lawyer_otp_issue('00000000-0000-0000-0000-0000000c1901', 'email', 'email', null,
                          repeat('1', 64), 'a•••@example.test', repeat('c', 64)) ->> 'ok', 'true');
reset role;
update public.lawyer_otp_challenges set delivery = 'sent'
 where user_id = '00000000-0000-0000-0000-0000000c1901' and delivery = 'pending';
set role service_role;
select pg_temp.expect('T1 after a SENT code the cooldown holds',
  public.lawyer_otp_issue('00000000-0000-0000-0000-0000000c1901', 'email', 'email', null,
                          repeat('1', 64), 'a•••@example.test', repeat('c', 64)) ->> 'reason', 'cooldown');

-- T2 a pending code (send in progress) still holds the cooldown
select pg_temp.expect('T2 first code',
  public.lawyer_otp_issue('00000000-0000-0000-0000-0000000c1902', 'email', 'email', null,
                          repeat('2', 64), 'b•••@example.test', repeat('c', 64)) ->> 'ok', 'true');
select pg_temp.expect('T2 pending holds the cooldown',
  public.lawyer_otp_issue('00000000-0000-0000-0000-0000000c1902', 'email', 'email', null,
                          repeat('2', 64), 'b•••@example.test', repeat('c', 64)) ->> 'reason', 'cooldown');
reset role;

-- T3 failed sends do not use up the 5 codes of the hour; sent ones do
insert into public.lawyer_otp_challenges (user_id, purpose, channel, target_hash, code_hash, delivery, created_at, consumed_at)
select '00000000-0000-0000-0000-0000000c1903', 'email', 'email', repeat('3', 64), repeat('e', 64), 'failed',
       now() - interval '10 minutes', now()
  from generate_series(1, 6);
set role service_role;
select pg_temp.expect('T3 six failed sends in the hour → still allowed',
  public.lawyer_otp_issue('00000000-0000-0000-0000-0000000c1903', 'email', 'email', null,
                          repeat('3', 64), 'c•••@example.test', repeat('c', 64)) ->> 'ok', 'true');
reset role;
update public.lawyer_otp_challenges set delivery = 'sent', created_at = now() - interval '5 minutes'
 where user_id = '00000000-0000-0000-0000-0000000c1903' and delivery = 'pending';
insert into public.lawyer_otp_challenges (user_id, purpose, channel, target_hash, code_hash, delivery, created_at, consumed_at)
select '00000000-0000-0000-0000-0000000c1903', 'email', 'email', repeat('4', 64), repeat('e', 64), 'sent',
       now() - interval '10 minutes', now()
  from generate_series(1, 4);
set role service_role;
select pg_temp.expect('T3 five sent codes in the hour → user_limit',
  public.lawyer_otp_issue('00000000-0000-0000-0000-0000000c1903', 'email', 'email', null,
                          repeat('5', 64), 'c•••@example.test', repeat('c', 64)) ->> 'reason', 'user_limit');
reset role;

-- T4 the 24 h per-target limit still counts failed sends
insert into public.lawyer_otp_challenges (user_id, purpose, channel, target_hash, code_hash, delivery, created_at, consumed_at)
select '00000000-0000-0000-0000-0000000c1904', 'email', 'email', repeat('6', 64), repeat('e', 64), 'failed',
       now() - interval '3 hours', now()
  from generate_series(1, 10);
set role service_role;
select pg_temp.expect('T4 ten failed sends to one address in 24 h → target_limit',
  public.lawyer_otp_issue('00000000-0000-0000-0000-0000000c1904', 'email', 'email', null,
                          repeat('6', 64), 'd•••@example.test', repeat('c', 64)) ->> 'reason', 'target_limit');
reset role;

-- T5 privileges unchanged
do $$
declare
  f constant text := 'public.lawyer_otp_issue(uuid, text, text, text, text, text, text)';
begin
  if has_function_privilege('public', f, 'EXECUTE') then
    raise exception 'T5 FAIL: PUBLIC may execute lawyer_otp_issue';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') and has_function_privilege('authenticated', f, 'EXECUTE') then
    raise exception 'T5 FAIL: authenticated may execute lawyer_otp_issue';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') and has_function_privilege('anon', f, 'EXECUTE') then
    raise exception 'T5 FAIL: anon may execute lawyer_otp_issue';
  end if;
  if exists (select 1 from pg_roles where rolname = 'app_user') and has_function_privilege('app_user', f, 'EXECUTE') then
    raise exception 'T5 FAIL: app_user may execute lawyer_otp_issue';
  end if;
  if not has_function_privilege('service_role', f, 'EXECUTE') then
    raise exception 'T5 FAIL: service_role cannot execute lawyer_otp_issue';
  end if;
end $$;

select 'l19_lawyer_otp_failed_delivery: ALL PASS' as result;

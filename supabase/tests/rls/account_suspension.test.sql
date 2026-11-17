-- account_suspension.test.sql — proves 20261124_60 (TODO 3.5, ticket S7):
-- an admin suspension ends the account's open sessions, and the admin list can
-- ask which accounts are banned; neither function is reachable by a user.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The migration
-- runs TWICE (idempotent). From the repo root:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $T/prelude_auth_sessions_live.sql \
--     $M/20261124_60_account_suspension.sql \
--     $M/20261124_60_account_suspension.sql \
--     $T/account_suspension.test.sql
\set ON_ERROR_STOP on

insert into auth.users (id, banned_until) values
  ('00000000-0000-0000-0000-0000000000a1', now() + interval '100 years'),  -- suspended
  ('00000000-0000-0000-0000-0000000000b2', null),                          -- ordinary
  ('00000000-0000-0000-0000-0000000000c3', now() - interval '1 day');      -- ban expired

insert into auth.sessions (id, user_id) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000b2');
insert into auth.refresh_tokens (token, user_id, session_id) values
  ('t1', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001'),
  ('t2', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000002'),
  ('t0', '00000000-0000-0000-0000-0000000000a1', null),  -- a token from before sessions
  ('t3', '00000000-0000-0000-0000-0000000000b2', '10000000-0000-0000-0000-000000000003');
insert into auth.mfa_amr_claims (id, session_id, authentication_method) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'password');

-- 1. Neither function is callable by a user, both by the service role.
do $$
begin
  if has_function_privilege('authenticated', 'public.admin_revoke_user_sessions(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.admin_revoke_user_sessions(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.admin_suspended_user_ids(uuid[])', 'EXECUTE')
     or has_function_privilege('anon', 'public.admin_suspended_user_ids(uuid[])', 'EXECUTE') then
    raise exception 'FAIL 1: a user role can call a suspension function';
  end if;
  if not has_function_privilege('service_role', 'public.admin_revoke_user_sessions(uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.admin_suspended_user_ids(uuid[])', 'EXECUTE') then
    raise exception 'FAIL 1: service_role cannot call a suspension function';
  end if;
  raise notice 'PASS 1: service role only';
end $$;

-- 2. An authenticated user calling it is refused (42501), even for himself.
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', false);
do $$
begin
  perform public.admin_revoke_user_sessions('00000000-0000-0000-0000-0000000000b2');
  raise exception 'FAIL 2: authenticated ended another user''s sessions';
exception when insufficient_privilege then
  raise notice 'PASS 2: authenticated is refused';
end $$;
reset role;

-- 3. The service role ends exactly the suspended user's sessions and tokens.
set role service_role;
do $$
declare n int;
begin
  n := public.admin_revoke_user_sessions('00000000-0000-0000-0000-0000000000a1');
  if n <> 2 then raise exception 'FAIL 3: ended % sessions, want 2', n; end if;
  raise notice 'PASS 3: two sessions ended';
end $$;
reset role;
do $$
begin
  if exists (select 1 from auth.sessions where user_id = '00000000-0000-0000-0000-0000000000a1') then
    raise exception 'FAIL 3b: a session of the suspended user survived';
  end if;
  if exists (select 1 from auth.refresh_tokens where user_id = '00000000-0000-0000-0000-0000000000a1') then
    raise exception 'FAIL 3b: a refresh token of the suspended user survived (incl. the session-less one)';
  end if;
  if exists (select 1 from auth.mfa_amr_claims where session_id = '10000000-0000-0000-0000-000000000001') then
    raise exception 'FAIL 3b: an MFA claim of an ended session survived';
  end if;
  if (select count(*) from auth.sessions where user_id = '00000000-0000-0000-0000-0000000000b2') <> 1
     or (select count(*) from auth.refresh_tokens where user_id = '00000000-0000-0000-0000-0000000000b2') <> 1 then
    raise exception 'FAIL 3b: another user''s session or token was touched';
  end if;
  raise notice 'PASS 3b: only that user, tokens and claims included';
end $$;

-- 4. Idempotent: a second call ends nothing and does not fail; null is refused.
set role service_role;
do $$
begin
  if public.admin_revoke_user_sessions('00000000-0000-0000-0000-0000000000a1') <> 0 then
    raise exception 'FAIL 4: second call ended something';
  end if;
  begin
    perform public.admin_revoke_user_sessions(null);
    raise exception 'FAIL 4: null accepted';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'PASS 4: idempotent, null refused';
end $$;

-- 5. The banned list: only a ban still running; empty and null are empty; >500 refused.
do $$
declare ids uuid[];
begin
  select array_agg(x order by x) into ids from public.admin_suspended_user_ids(array[
    '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2',
    '00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000ff']::uuid[]) x;
  if ids is distinct from array['00000000-0000-0000-0000-0000000000a1']::uuid[] then
    raise exception 'FAIL 5: banned list is %', ids;
  end if;
  if exists (select 1 from public.admin_suspended_user_ids(array[]::uuid[]))
     or exists (select 1 from public.admin_suspended_user_ids(null)) then
    raise exception 'FAIL 5: empty input returned rows';
  end if;
  begin
    perform public.admin_suspended_user_ids((select array_agg(gen_random_uuid()) from generate_series(1, 501)));
    raise exception 'FAIL 5: 501 ids accepted';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'PASS 5: banned list';
end $$;
reset role;

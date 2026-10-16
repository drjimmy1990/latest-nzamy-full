-- Why 20261016_08 did NOT take SELECT on public.profiles away from anon, and
-- why 20261016_09 (plan item N21) now can.
-- Run from the repo root:
--   T=supabase/tests/rls; bash $T/run.sh $T/prelude_profiles_anon_policy_subquery.sql $T/profiles_anon_policy_subquery.test.sql
-- T1: with the grant (live before 20261016_09), a guest reads the public table and zero profiles.
-- T2: after `revoke all on public.profiles from anon` (20260921_01's revoke),
--     the same guest read of the public table fails with 42501, because the
--     PUBLIC admin policy reads public.profiles inline. 20261016_09's guard
--     query (pg_depend) names that policy.
-- T3: the 20261016_09 shape — the admin policy re-created `TO authenticated
--     USING (public.is_admin())` — and the guest read works again with the
--     revoke still in place; the guard query finds nothing; an admin still
--     reads every row and a signed-in non-admin only the public one.
\set ON_ERROR_STOP on

set role anon;
do $$
declare n int;
begin
  select count(*) into n from public.guest_readable;
  if n <> 1 then raise exception 'T1 FAIL: guest read % rows of guest_readable, expected 1', n; end if;
  select count(*) into n from public.profiles;
  if n <> 0 then raise exception 'T1 FAIL: guest read % profiles rows, expected 0', n; end if;
  raise notice 'T1 PASS: anon holds SELECT on profiles, reads the public table and zero profiles';
end $$;
reset role;

revoke all on public.profiles from anon;

set role anon;
do $$
declare n int;
begin
  begin
    select count(*) into n from public.guest_readable;
    raise exception 'T2 FAIL: the guest read succeeded (% rows) — revoking anon SELECT on profiles would be safe', n;
  exception when insufficient_privilege then
    raise notice 'T2 PASS: without SELECT on profiles the guest read of the public table fails (42501: %)', sqlerrm;
  end;
end $$;
reset role;

-- T2b: 20261016_09's guard query sees the offending policy.
do $$
declare n int;
begin
  select count(*) into n from pg_policy p
   where (p.polroles = '{0}'::oid[] or 'anon'::regrole::oid = any (p.polroles))
     and exists (select 1 from pg_depend d
                  where d.classid = 'pg_policy'::regclass and d.objid = p.oid
                    and d.refclassid = 'pg_class'::regclass and d.refobjid = 'public.profiles'::regclass);
  if n <> 1 then raise exception 'T2b FAIL: the guard query found % offending policy/policies, expected 1 ("admins read all")', n; end if;
  raise notice 'T2b PASS: the guard query names the inline PUBLIC admin policy';
end $$;

-- T3: the 20261016_09 shape, with anon still holding nothing on profiles.
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000c1');
insert into public.profiles (id, user_type) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin'), ('00000000-0000-0000-0000-0000000000c1', 'client');
insert into public.guest_readable values (2, null);  -- visible to admins only
drop policy "admins read all" on public.guest_readable;
create policy "admins read all" on public.guest_readable for select
  to authenticated using (public.is_admin());

do $$
declare n int;
begin
  if has_table_privilege('anon', 'public.profiles', 'SELECT') or has_any_column_privilege('anon', 'public.profiles', 'SELECT') then
    raise exception 'T3 FAIL: the precondition is gone — anon holds SELECT on profiles again';
  end if;
  select count(*) into n from pg_policy p
   where (p.polroles = '{0}'::oid[] or 'anon'::regrole::oid = any (p.polroles))
     and exists (select 1 from pg_depend d
                  where d.classid = 'pg_policy'::regclass and d.objid = p.oid
                    and d.refclassid = 'pg_class'::regclass and d.refobjid = 'public.profiles'::regclass);
  if n <> 0 then raise exception 'T3 FAIL: the guard query still finds % policy/policies', n; end if;

  perform set_config('test.uid', '', true);
  execute 'set local role anon';
  begin
    select count(*) into n from public.guest_readable;
  exception when insufficient_privilege then
    raise exception 'T3 FAIL: the guest read still fails after the policy fix (%)', sqlerrm;
  end;
  if n <> 1 then raise exception 'T3 FAIL: guest read % rows of guest_readable, expected 1', n; end if;
  reset role;

  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  execute 'set local role authenticated';
  select count(*) into n from public.guest_readable;
  if n <> 2 then raise exception 'T3 FAIL: the admin reads % rows, expected 2', n; end if;
  reset role;

  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000c1', true);
  execute 'set local role authenticated';
  select count(*) into n from public.guest_readable;
  if n <> 1 then raise exception 'T3 FAIL: a non-admin reads % rows, expected 1', n; end if;
  reset role;
  raise notice 'T3 PASS: with the admin policy TO authenticated via is_admin(), the guest read works without SELECT on profiles; admins read all, others the public row';
end $$;

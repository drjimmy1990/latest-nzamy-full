-- group_membership_self_check.test.sql — proves 20261109_12 (DB-01): group
-- reads still work for the owner and active members, an outsider and a guest
-- read nothing (without an error), and the two-argument membership function
-- is no longer executable by anon / authenticated. 20261109_12 runs TWICE (idempotent).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). From the repo
-- root, in Git Bash:
--   M=supabase/migrations; R=supabase/tests/rls; bash $R/run.sh \
--     $R/prelude_groups_min.sql \
--     $M/20260625_fix_rls_recursion.sql \
--     $R/prelude_group_membership_before.sql \
--     $M/20261109_12_group_membership_self_check.sql \
--     $M/20261109_12_group_membership_self_check.sql \
--     $R/group_membership_self_check.test.sql
-- NEGATIVE CONTROLS:
--   NC1 — prelude_group_membership_before.sql RAISES unless the pre-fix state
--         exists before the file (it does: «BEFORE: pre-20261109_12 state confirmed»).
--   NC2 — the chain without the two 20261109_12 lines stops at T0.
--   NC3 — prelude_group_membership_stray_policy.sql in place of the before-prelude
--         (a hand-made policy elsewhere that calls the old function):
--         20261109_12 REFUSES at step 0 and names the policy.
--
-- Every assertion RAISES on failure.

-- T0 precondition
do $$
begin
  if to_regprocedure('public.is_group_member_or_owner_self(uuid)') is null then
    raise exception 'T0 FAIL: is_group_member_or_owner_self does not exist (20261109_12 not applied)';
  end if;
end $$;

-- T1 the owner reads the group and every member row
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.groups) <> 1 then
    raise exception 'T1 FAIL: the owner does not see his group';
  end if;
  if (select count(*) from public.group_members) <> 3 then
    raise exception 'T1 FAIL: the owner does not see the 3 member rows (saw %)', (select count(*) from public.group_members);
  end if;
end $$;
reset role;

-- T2 an active member reads the group and the member list
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a2', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.groups) <> 1 or (select count(*) from public.group_members) <> 3 then
    raise exception 'T2 FAIL: an active member lost his group read';
  end if;
  if not public.is_group_member_or_owner_self('00000000-0000-0000-0000-0000000000b1') then
    raise exception 'T2 FAIL: the self check says an active member is not in his group';
  end if;
end $$;
reset role;

-- T3 an invited (not active) user and an outsider read nothing — the 20260625
-- meaning, unchanged
do $$
declare
  u text;
begin
  foreach u in array array['00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a4'] loop
    perform set_config('test.uid', u, false);
    set local role authenticated;
    if (select count(*) from public.groups) <> 0 or (select count(*) from public.group_members) <> 0 then
      raise exception 'T3 FAIL: % reads a group he is not active in', u;
    end if;
    if public.is_group_member_or_owner_self('00000000-0000-0000-0000-0000000000b1') then
      raise exception 'T3 FAIL: the self check says % is in the group', u;
    end if;
    reset role;
  end loop;
end $$;

-- T4 a signed-in user cannot call the two-argument function
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a4', false);
set role authenticated;
do $$
begin
  begin
    perform public.is_group_member_or_owner('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2');
    raise exception 'T4 FAIL: authenticated can still execute the two-argument function';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- T5 a guest: 0 rows with no error (anon holds SELECT here, as on a Supabase
-- public schema), and no EXECUTE on either function
select set_config('test.uid', '', false);
set role anon;
do $$
begin
  if (select count(*) from public.groups) <> 0 or (select count(*) from public.group_members) <> 0 then
    raise exception 'T5 FAIL: a guest reads groups';
  end if;
  begin
    perform public.is_group_member_or_owner('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2');
    raise exception 'T5 FAIL: anon can call the two-argument function';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.is_group_member_or_owner_self('00000000-0000-0000-0000-0000000000b1');
    raise exception 'T5 FAIL: anon can call is_group_member_or_owner_self';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- T6 the server keeps the two-argument function
set role service_role;
do $$
begin
  if not public.is_group_member_or_owner('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2') then
    raise exception 'T6 FAIL: service_role lost the two-argument function';
  end if;
end $$;
reset role;

-- T7 the owners' write policies still work through the new SELECT policy
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', false);
set role authenticated;
update public.groups set name = 'G2' where id = '00000000-0000-0000-0000-0000000000b1';
reset role;
do $$
begin
  if (select name from public.groups where id = '00000000-0000-0000-0000-0000000000b1') <> 'G2' then
    raise exception 'T7 FAIL: the owner can no longer rename his group';
  end if;
end $$;
select set_config('test.uid', '', false);

do $$ begin raise notice 'group_membership_self_check: ALL PASS (T0–T7)'; end $$;

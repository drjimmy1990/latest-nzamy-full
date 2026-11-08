-- Chain step (NOT a migration) for group_membership_self_check.test.sql:
-- runs after 20260625 and BEFORE 20261109_12. Seeds the people and groups the
-- test uses, and RAISES unless the pre-fix state is there: the two-argument
-- function is executable by a signed-in user (the state 20261109_12 changes).
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),  -- owner of group G
  ('00000000-0000-0000-0000-0000000000a2'),  -- active member of G
  ('00000000-0000-0000-0000-0000000000a3'),  -- invited (not yet active) to G
  ('00000000-0000-0000-0000-0000000000a4');  -- outsider
insert into public.profiles (id, user_type) values
  ('00000000-0000-0000-0000-0000000000a1', 'lawyer'),
  ('00000000-0000-0000-0000-0000000000a2', 'lawyer'),
  ('00000000-0000-0000-0000-0000000000a3', 'lawyer'),
  ('00000000-0000-0000-0000-0000000000a4', 'lawyer');
insert into public.groups (id, owner_id, name) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'G');
insert into public.group_members (group_id, user_id, role, status) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'owner', 'active'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2', 'member', 'active'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a3', 'member', 'invited');

select set_config('test.uid', '00000000-0000-0000-0000-0000000000a4', false);
set role authenticated;
do $$
begin
  if not public.is_group_member_or_owner('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2') then
    raise exception 'BEFORE FAIL: expected the pre-20261109_12 state (the two-argument function executable by authenticated)';
  end if;
  raise notice 'BEFORE: pre-20261109_12 state confirmed (the two-argument function is executable by authenticated)';
end $$;
reset role;
select set_config('test.uid', '', false);

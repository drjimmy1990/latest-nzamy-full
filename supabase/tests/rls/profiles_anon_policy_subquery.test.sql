-- Why 20261016_08 does NOT take SELECT on public.profiles away from anon.
-- T1: with the grant (live today), a guest reads the public table and zero profiles.
-- T2: after `revoke all on public.profiles from anon` (20260921_01's revoke),
--     the same guest read of the public table fails with 42501, because the
--     PUBLIC admin policy reads public.profiles inline.
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

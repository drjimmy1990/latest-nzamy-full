-- prelude_library_invitations_leak.sql — runs BEFORE 20261103_15 in
-- library_invitations_close_public_read.test.sql's chain. It seeds three
-- invite codes and two hand-made policies, then PROVES THE LEAK: with the
-- 20260626 grant and policy, anon lists every code. It RAISES if it cannot
-- (then the test would prove nothing).
--
--   • "hand added read" — no TO clause, so its role is PUBLIC: 20261103_15
--     must drop it too (a policy someone might have added on production);
--   • "service role only" — TO service_role: it admits no session role, so
--     20261103_15 must keep it (the remaining-policy count is 1 in Docker,
--     0 on production, where the migrations create no such policy).

insert into library.invitations (code, max_uses) values
  ('LEAK0001', 5), ('LEAK0002', 1), ('LEAK0003', 2);

drop policy if exists "hand added read" on library.invitations;
create policy "hand added read" on library.invitations for select using (true);
drop policy if exists "service role only" on library.invitations;
create policy "service role only" on library.invitations for select to service_role using (true);

set role anon;
do $$
declare n int;
begin
  select count(*) into n from library.invitations;
  if n < 3 then
    raise exception 'PRE FAIL: anon could not list the invite codes before 20261103_15 (% rows) — the leak is not reproduced', n;
  end if;
  raise notice 'PRE: the leak is real before 20261103_15 — anon lists % invite codes: %', n,
    (select string_agg(code, ', ' order by code) from library.invitations);
end $$;
reset role;

set role authenticated;
do $$
declare n int;
begin
  select count(*) into n from library.invitations;
  if n < 3 then
    raise exception 'PRE FAIL: authenticated could not list the invite codes before 20261103_15 (% rows)', n;
  end if;
end $$;
reset role;

-- the state the re-run test (T5) compares against is taken after the FIRST
-- 20261103_15 run, by prelude_library_invitations_snapshot.sql

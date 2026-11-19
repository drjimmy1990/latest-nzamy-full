-- NEGATIVE-CONTROL step (NOT a migration) for l9_secleak.test.sql: another
-- migration changed "contracts select" since 20260905_phase3 (here: an extra
-- arm). 20261129_20 must STOP («merge … by hand») instead of silently
-- replacing that change. Put it right before 20261129_20 in the chain; the
-- run must fail at that migration.
drop policy if exists "contracts select" on public.contracts;
create policy "contracts select" on public.contracts for select
  using (public.can_access_case_row(owner_user_id, firm_id) or status = 'active');

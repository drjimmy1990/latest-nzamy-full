-- prelude_library_eligibility_leak.sql — NEGATIVE CONTROL for
-- library_eligibility_verifications.test.sql: re-opens the table to signed-in
-- users the way a careless later migration might (a grant plus an own-row
-- policy). With it, the test must FAIL at T3 (a user reads his own row) —
-- proving the T3 assertions can see a leak.
grant select, insert, update on public.library_eligibility_verifications to authenticated, anon;
create policy "leak own row" on public.library_eligibility_verifications
  for all to authenticated, anon using (user_id = auth.uid()) with check (user_id = auth.uid());

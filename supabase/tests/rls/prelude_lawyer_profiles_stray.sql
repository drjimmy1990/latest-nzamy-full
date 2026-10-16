-- Negative control NC2 for 20261016_10 (see lawyer_profiles_select_column_lock.test.sql):
-- a policy on another table that reads a column the migration locks. After the
-- lock, every API-role query of lawyer_services would answer 42501, so the
-- migration's verify must refuse and roll back, naming this policy.
create policy stray_licence_gate on public.lawyer_services for select
  using (exists (select 1 from public.lawyer_profiles lp
                  where lp.user_id = lawyer_services.lawyer_user_id
                    and lp.license_number is not null));

-- Negative control NC3 for 20261016_11 (see provider_profiles_guest_read_revoke.test.sql):
-- a policy on another table, and a view, that read provider_profiles. Once anon
-- holds nothing on provider_profiles, a guest read of service_requests would
-- answer 42501 and the invoker view would too, so the migration's guard must
-- refuse before it changes anything, naming the policy. (The guard checks
-- policies first; drop stray_provider_gate to see it name the view.)
create policy stray_provider_gate on public.service_requests for select
  using (exists (select 1 from public.provider_profiles pp
                  where pp.user_id = service_requests.assigned_to
                    and pp.verification_status = 'verified'));
create view public.stray_provider_list with (security_invoker = true) as
  select user_id, sub_role from public.provider_profiles;

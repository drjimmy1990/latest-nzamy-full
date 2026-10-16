-- Negative control NC2 for 20261016_11 (see provider_profiles_guest_read_revoke.test.sql):
-- the half fix — revoke the guest's privileges but keep "public read verified
-- providers". The policy has no TO clause, so every signed-in account still
-- reads every column of a listed provider; T2 must fail.
revoke all on public.provider_profiles from anon, public;

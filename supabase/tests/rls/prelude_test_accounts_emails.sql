-- Chain step (NOT a migration) for test_accounts_never_listed.test.sql.
-- stubs.sql models auth.users as (id) only; the real table carries `email`,
-- which 20261017_44's backfill reads. This adds it and seeds the accounts the
-- backfill must (and must not) pick up, all listed in the directory first.
alter table auth.users add column if not exists email text;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000003', 'Lawyer3@Nezamy.sa'),        -- seed-test-lawyers (case-insensitive)
  ('a0000000-0000-0000-0000-000000000011', 'lawyer11@nezamy.sa'),       -- NOT one of the ten
  ('a0000000-0000-0000-0000-0000000000a1', 'lawyer-solo@nezamy.sa'),    -- seed-clean-test-accounts
  ('a0000000-0000-0000-0000-0000000000a2', 'qa-run-7@nzamy.test'),      -- UAT kit
  ('a0000000-0000-0000-0000-0000000000b1', 'staff@nezamy.sa'),          -- staff on the company domain: NOT a test account
  ('a0000000-0000-0000-0000-0000000000b2', 'real.lawyer@example.sa');   -- a real lawyer

insert into public.profiles (id, user_type, display_name) values
  ('a0000000-0000-0000-0000-000000000003', 'lawyer', 'اختبار ٣'),
  ('a0000000-0000-0000-0000-000000000011', 'lawyer', 'محامٍ ١١'),
  ('a0000000-0000-0000-0000-0000000000a1', 'lawyer', 'اختبار فردي'),
  ('a0000000-0000-0000-0000-0000000000a2', 'lawyer', 'UAT'),
  ('a0000000-0000-0000-0000-0000000000b1', 'lawyer', 'موظف'),
  ('a0000000-0000-0000-0000-0000000000b2', 'lawyer', 'محامٍ حقيقي');

insert into public.lawyer_profiles (user_id, verification_status, marketplace_visible)
select id, 'verified', true from public.profiles
 where id::text like 'a0000000-%';

-- When the chain also loads prelude_provider_profiles_live.sql: the seed's
-- provider-notary test account, listed like the real notary there.
do $$
begin
  if to_regclass('public.provider_profiles') is null then
    return;
  end if;
  insert into auth.users (id, email) values ('a0000000-0000-0000-0000-0000000000a3', 'provider-notary@nezamy.sa');
  insert into public.profiles (id, user_type, display_name) values ('a0000000-0000-0000-0000-0000000000a3', 'provider', 'موثّق اختبار');
  insert into public.provider_profiles (user_id, sub_role, verification_status, marketplace_visible)
  values ('a0000000-0000-0000-0000-0000000000a3', 'notary', 'verified', true);
end $$;

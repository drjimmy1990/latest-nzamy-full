-- prelude_l18_signup.sql — chain step (NOT a migration) for l18_signup.test.sql
-- (20261208_10). Runs after prelude_signup_metadata_live.sql and
-- 20260921_04_profiles_phone_e164_check.sql (the latest handle_new_user body).
--   * auth.users gains raw_app_meta_data (GoTrue writes {"provider": …} there
--     at sign-up) and the live on_auth_user_created trigger;
--   * public.profiles gains onboarding_completed (default false, as
--     20260603_phase1_001) and phone_verified_at (20261205_10);
--   * auth.identities (user_id, provider) as GoTrue keeps it;
--   * the backfill fixtures b1–b6, created BEFORE 20261208_10 runs, so its
--     backfill meets them (synthetic ids and numbers only).
alter table auth.users
  add column if not exists raw_app_meta_data jsonb;

alter table public.profiles
  add column if not exists onboarding_completed boolean not null default false,
  add column if not exists phone_verified_at   timestamptz;

create table if not exists auth.identities (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references auth.users(id) on delete cascade,
  provider text not null
);

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── backfill fixtures (the trigger under test does not exist yet) ──────────
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('b1000000-0000-4000-8000-000000000001', 'b1@example.test', '{"provider":"email"}',
   '{"user_type":"individual","full_name":"B1","phone":"0500000001","onboarding_completed":true}'),
  ('b1000000-0000-4000-8000-000000000002', 'b2@example.test', '{"provider":"google"}',
   '{"full_name":"B2 Google"}'),
  ('b1000000-0000-4000-8000-000000000003', 'b3@example.test', '{"provider":"email"}',
   '{"user_type":"individual","full_name":"B3","onboarding_completed":true}'),
  ('b1000000-0000-4000-8000-000000000004', 'b4@example.test', '{"provider":"email"}',
   '{"user_type":"individual","full_name":"B4","onboarding_completed":true}'),
  ('b1000000-0000-4000-8000-000000000005', 'b5@example.test', '{"provider":"email"}',
   '{"user_type":"individual","full_name":"B5","onboarding_completed":true}'),
  ('b1000000-0000-4000-8000-000000000006', 'b6@example.test', '{"provider":"email"}',
   '{"full_name":"B6","onboarding_completed":true}');

insert into auth.identities (user_id, provider) values
  ('b1000000-0000-4000-8000-000000000001', 'email'),   -- b1 form sign-up, confirmed → completed
  ('b1000000-0000-4000-8000-000000000002', 'google'),  -- b2 Google only → wizard kept
  ('b1000000-0000-4000-8000-000000000003', 'email'),   -- b3 e-mail + linked Google → wizard kept
  ('b1000000-0000-4000-8000-000000000003', 'google'),
  ('b1000000-0000-4000-8000-000000000004', 'email'),   -- b4 not confirmed → untouched
  ('b1000000-0000-4000-8000-000000000005', 'email'),   -- b5 admin → untouched
  ('b1000000-0000-4000-8000-000000000006', 'email');   -- b6 no user_type in the metadata → untouched

update public.profiles set phone_verified_at = now()
 where id in ('b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002',
              'b1000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000005',
              'b1000000-0000-4000-8000-000000000006');
update public.profiles set user_type = 'admin' where id = 'b1000000-0000-4000-8000-000000000005';

-- handle_new_user's provider branch (T4 / T7 sign up a notary) needs this row's table.
create table if not exists public.provider_profiles (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  sub_role text not null check (sub_role in ('notary', 'arbitrator', 'bailiff'))
);

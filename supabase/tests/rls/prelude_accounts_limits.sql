-- prelude_accounts_limits.sql — chain step for accounts_limits_l6.test.sql
-- (20261126_50). NOT a migration; it never ships.
--
-- Loads AFTER the restricted-cases chain and BEFORE 20261126_50:
--   * the three server tables 20261126_50 reads but this chain does not
--     create, in their live shape (only the columns it reads + NOT NULLs):
--       subscriptions (20260603_phase1_003), founder_seats (20261101_10),
--       auth.identities (GoTrue);
--   * profiles.is_demo (20261125_50) and admin_audit_events.after_state
--     (20260616);
--   * four lawyers that exist BEFORE the migration, to prove its backfill:
--       e1  e-mail signup (identity 'email')               → stamped
--       g1  Google only (identity 'google'), claimed lawyer → left NULL
--       k1  no identity row, but an account_type_claimed → lawyer audit row
--                                                           → left NULL
--       (b1 / b2 of prelude_lawyer_profiles_live.sql have no identity → stamped)
\set ON_ERROR_STOP on

create table if not exists auth.identities (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references auth.users(id) on delete cascade,
  provider text not null
);

create table if not exists public.subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  entity_id          uuid,
  entity_type        text check (entity_type in ('firm', 'business', 'government', 'ngo')),
  plan_id            text not null,
  tier               text not null,
  status             text not null default 'active',
  current_period_end timestamptz
);

create table if not exists public.founder_seats (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references auth.users(id) on delete cascade,
  status   text not null default 'reserved',
  ends_at  timestamptz
);

alter table public.profiles add column if not exists is_demo boolean not null default false;
alter table public.admin_audit_events add column if not exists after_state jsonb;

-- only the two new tables: a schema-wide grant would undo 20261016_10's column lock
grant all on public.subscriptions, public.founder_seats to app_user, anon, authenticated, service_role;

-- wire handle_new_user to auth.users as on live (lawyer_practice_kind.test.sql does the same)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- the legacy lawyers (superuser: no session guard applies)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'e1@l6.test', '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000e2', 'g1@l6.test', '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000e3', 'k1@l6.test', '{}'::jsonb);
update public.profiles set user_type = 'lawyer'
 where id in ('00000000-0000-0000-0000-0000000000e1',
              '00000000-0000-0000-0000-0000000000e2',
              '00000000-0000-0000-0000-0000000000e3');
insert into public.lawyer_profiles (user_id) values
  ('00000000-0000-0000-0000-0000000000e1'),
  ('00000000-0000-0000-0000-0000000000e2'),
  ('00000000-0000-0000-0000-0000000000e3')
on conflict (user_id) do nothing;
insert into auth.identities (user_id, provider) values
  ('00000000-0000-0000-0000-0000000000e1', 'email'),
  ('00000000-0000-0000-0000-0000000000e2', 'google');
insert into public.admin_audit_events (actor_id, action, target_type, target_id, after_state) values
  ('00000000-0000-0000-0000-0000000000e3', 'account_type_claimed', 'profile',
   '00000000-0000-0000-0000-0000000000e3', '{"user_type": "lawyer"}'::jsonb);
